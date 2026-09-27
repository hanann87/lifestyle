-- 行動を切り替える（行動ボタンをワンタップしたときに、画面から呼ぶ）。
-- 設計は DESIGN.md 1章「記録の基本ルール」「使い始めの状態」、10章「行動の切り替え（手動）」

-- ① 行動を切り替える関数
create function public.switch_activity(p_button_id bigint, p_start_day boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := now();
  v_start_day boolean := p_start_day;
  v_running public.activity_logs;
begin
  -- ログインしていなければ止める
  if v_user_id is null then
    raise exception 'ログインしていません';
  end if;

  -- 本人のボタンで、非表示（アーカイブ）になっていないことを確かめる
  if not exists (
    select 1
    from public.buttons
    where id = p_button_id
      and user_id = v_user_id
      and archived_at is null
  ) then
    raise exception 'このボタンは使えません';
  end if;

  -- 実行中の記録を取り出す。この処理が終わるまで、ほかの操作からは書き換えられないようにする（行ロック）
  select *
  into v_running
  from public.activity_logs
  where user_id = v_user_id
    and upper_inf(period)
  for update;

  if found then
    -- 実行中と同じボタンなら、何もしない
    if v_running.button_id = p_button_id then
      return;
    end if;

    -- 実行中の記録を、今の時刻で終わらせる
    update public.activity_logs
    set period = tstzrange(lower(period), v_now, '[)')
    where id = v_running.id;
  elsif not exists (
    select 1
    from public.activity_logs
    where user_id = v_user_id
  ) then
    -- 記録が1件もない（使い始め）なら、最初の記録の開始時刻を1日のスタートにする
    v_start_day := true;
  end if;

  -- 新しい記録を、今の時刻から終了なし（実行中）で作る
  insert into public.activity_logs (user_id, button_id, period)
  values (v_user_id, p_button_id, tstzrange(v_now, null, '[)'));

  -- 1日をスタートするなら、今の時刻を1日のスタートとして記録する
  if v_start_day then
    insert into public.day_starts (user_id, started_at)
    values (v_user_id, v_now);
  end if;
end;
$$;

-- ② ログインしている人だけが呼べるようにする（ログインしていない人の呼び出しは、関数に入る前に断る）
revoke execute on function public.switch_activity(bigint, boolean) from public, anon;
grant execute on function public.switch_activity(bigint, boolean) to authenticated;
