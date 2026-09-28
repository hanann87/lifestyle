-- 1日のスタートを追加・移動・削除する（修正画面の「1日のスタート」から呼ぶ）。
-- 設計は DESIGN.md 5章「1日のスタートの決め方」、7章「1日のスタートの修正」、10章「1日のスタートの修正」
-- 境目は、画面から記録の ID で受け取り、その記録の開始時刻を DB 側で読んで決める（時刻を自由に入れられないようにするため）

-- ① 1日のスタートを追加する（p_log_id：この記録の開始を、1日のスタートにする）
create function public.add_day_start(p_log_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_boundary timestamptz;
begin
  -- ログインしていなければ止める
  if v_user_id is null then
    raise exception 'ログインしていません';
  end if;

  -- 自分の1日のスタートをすべてロックする。この処理が終わるまで、ほかの操作からは書き換えられない
  perform 1
  from public.day_starts
  where user_id = v_user_id
  for update;

  -- 境目の時刻：本人の記録の開始時刻
  select lower(period)
  into v_boundary
  from public.activity_logs
  where id = p_log_id
    and user_id = v_user_id;

  if not found then
    raise exception 'この境目は使えません';
  end if;

  -- その境目に、すでに1日のスタートがあれば止める（表のユニーク制約でも防げるが、分かりやすいメッセージを返すため）
  if exists (
    select 1
    from public.day_starts
    where user_id = v_user_id
      and started_at = v_boundary
  ) then
    raise exception 'すでに1日のスタートがあります';
  end if;

  insert into public.day_starts (user_id, started_at)
  values (v_user_id, v_boundary);
end;
$$;

-- ② 1日のスタートを移動する（p_day_start_id：動かす1日のスタート、p_log_id：この記録の開始へ動かす）
create function public.move_day_start(p_day_start_id bigint, p_log_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target public.day_starts;
  v_first timestamptz;
  v_boundary timestamptz;
  v_prev timestamptz;
  v_next timestamptz;
begin
  -- ログインしていなければ止める
  if v_user_id is null then
    raise exception 'ログインしていません';
  end if;

  -- 自分の1日のスタートをすべてロックする
  perform 1
  from public.day_starts
  where user_id = v_user_id
  for update;

  -- 動かす1日のスタート：本人のもの
  select *
  into v_target
  from public.day_starts
  where id = p_day_start_id
    and user_id = v_user_id;

  if not found then
    raise exception 'この1日のスタートは使えません';
  end if;

  -- 一番早い1日のスタート（最初の記録の開始）は動かせない
  select min(started_at)
  into v_first
  from public.day_starts
  where user_id = v_user_id;

  if v_target.started_at = v_first then
    raise exception '最初の1日のスタートは、移動・削除できません';
  end if;

  -- 境目の時刻：本人の記録の開始時刻
  select lower(period)
  into v_boundary
  from public.activity_logs
  where id = p_log_id
    and user_id = v_user_id;

  if not found then
    raise exception 'この境目は使えません';
  end if;

  -- すぐ前・すぐ後の1日のスタート（すぐ後がなければ null）
  select max(started_at)
  into v_prev
  from public.day_starts
  where user_id = v_user_id
    and started_at < v_target.started_at;

  select min(started_at)
  into v_next
  from public.day_starts
  where user_id = v_user_id
    and started_at > v_target.started_at;

  -- 動かせるのは、すぐ前とすぐ後の1日のスタートの間だけ（生活日の並びが入れ替わらないように）
  if v_boundary <= v_prev or (v_next is not null and v_boundary >= v_next) then
    raise exception '前後の1日のスタートを越えては、移動できません';
  end if;

  update public.day_starts
  set started_at = v_boundary
  where id = v_target.id;
end;
$$;

-- ③ 1日のスタートを削除する（p_day_start_id：消す1日のスタート）
create function public.delete_day_start(p_day_start_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target public.day_starts;
  v_first timestamptz;
begin
  -- ログインしていなければ止める
  if v_user_id is null then
    raise exception 'ログインしていません';
  end if;

  -- 自分の1日のスタートをすべてロックする
  perform 1
  from public.day_starts
  where user_id = v_user_id
  for update;

  -- 消す1日のスタート：本人のもの
  select *
  into v_target
  from public.day_starts
  where id = p_day_start_id
    and user_id = v_user_id;

  if not found then
    raise exception 'この1日のスタートは使えません';
  end if;

  -- 一番早い1日のスタート（最初の記録の開始）は消せない
  select min(started_at)
  into v_first
  from public.day_starts
  where user_id = v_user_id;

  if v_target.started_at = v_first then
    raise exception '最初の1日のスタートは、移動・削除できません';
  end if;

  delete from public.day_starts
  where id = v_target.id;
end;
$$;

-- ④ ログインしている人だけが呼べるようにする（ログインしていない人の呼び出しは、関数に入る前に断る）
revoke execute on function public.add_day_start(bigint) from public, anon;
grant execute on function public.add_day_start(bigint) to authenticated;
revoke execute on function public.move_day_start(bigint, bigint) from public, anon;
grant execute on function public.move_day_start(bigint, bigint) to authenticated;
revoke execute on function public.delete_day_start(bigint) from public, anon;
grant execute on function public.delete_day_start(bigint) to authenticated;
