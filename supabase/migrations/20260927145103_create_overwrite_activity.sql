-- 記録を上書きする（修正画面で、時間帯とカテゴリを選んで「この時間帯を上書きする」を押したときに、画面から呼ぶ）。
-- 設計は DESIGN.md 7章「記録の修正」、10章「記録の修正（時間帯の上書き）」

-- ① 記録を上書きする関数（p_end が null なら「今も続けている」）
create function public.overwrite_activity(p_button_id bigint, p_start timestamptz, p_end timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := now();
  -- 上書きする時間帯（時刻を確かめてから作る）
  v_range tstzrange;
  v_first_start timestamptz;
  v_log public.activity_logs;
  v_new_id bigint;
  v_prev public.activity_logs;
  v_next public.activity_logs;
  v_merged_start timestamptz := p_start;
  v_merged_end timestamptz := p_end;
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

  -- 時刻を確かめる：開始は今より前。過去の時刻で終わるなら、終了は開始より後で、今より前
  if p_start >= v_now then
    raise exception '開始は今より前の時刻にしてください';
  end if;
  if p_end is not null and (p_end <= p_start or p_end >= v_now) then
    raise exception '終了は開始より後で、今より前の時刻にしてください';
  end if;

  -- 上書きする時間帯を作る。p_end が null なら終了なし（今も続けている）
  -- （確かめる前に作ると、終了が開始より前のとき、範囲を作るところで英語のエラーになるため、ここで作る）
  v_range := tstzrange(p_start, p_end, '[)');

  -- 自分の記録をすべてロックする。この処理が終わるまで、ほかの操作（切り替えなど）からは書き換えられない
  perform 1
  from public.activity_logs
  where user_id = v_user_id
  for update;

  -- 使い始める前は選べない：開始は、一番最初の記録の開始時刻以降
  select min(lower(period))
  into v_first_start
  from public.activity_logs
  where user_id = v_user_id;

  if v_first_start is null then
    raise exception 'まだ記録がありません';
  end if;
  if p_start < v_first_start then
    raise exception '開始は、記録を始めた時刻（最初の記録）より後にしてください';
  end if;

  -- 時間帯にかかる記録を、いったん消して、時間帯からはみ出していた部分だけを作り直す
  -- （中に完全に入っている → 何も作らない＝削除、一部がかかっている → 片側だけ作る＝切り詰め、
  --   時間帯を完全に含んでいる → 両側を作る＝分割。予定由来の印 schedule_id は元のまま）
  for v_log in
    select *
    from public.activity_logs
    where user_id = v_user_id
      and period && v_range
  loop
    delete from public.activity_logs
    where id = v_log.id;

    -- 時間帯より前にはみ出していた部分
    if lower(v_log.period) < p_start then
      insert into public.activity_logs (user_id, button_id, period, schedule_id)
      values (v_user_id, v_log.button_id, tstzrange(lower(v_log.period), p_start, '[)'), v_log.schedule_id);
    end if;

    -- 時間帯より後にはみ出していた部分（実行中の記録なら、こちらが実行中のまま残る）
    if p_end is not null and (upper_inf(v_log.period) or upper(v_log.period) > p_end) then
      insert into public.activity_logs (user_id, button_id, period, schedule_id)
      values (v_user_id, v_log.button_id, tstzrange(p_end, upper(v_log.period), '[)'), v_log.schedule_id);
    end if;
  end loop;

  -- 選んだカテゴリの記録を、時間帯に作る（手動の修正なので、予定由来の印はなし）
  insert into public.activity_logs (user_id, button_id, period)
  values (v_user_id, p_button_id, v_range)
  returning id into v_new_id;

  -- 同じカテゴリの記録が、すぐ前・すぐ後に隣り合っていたら取り出す
  select *
  into v_prev
  from public.activity_logs
  where user_id = v_user_id
    and button_id = p_button_id
    and upper(period) = p_start;

  if p_end is not null then
    select *
    into v_next
    from public.activity_logs
    where user_id = v_user_id
      and button_id = p_button_id
      and lower(period) = p_end;
  end if;

  -- 隣り合った記録を消して、新しい記録をその分だけ広げる（1つに結合する）
  if v_prev.id is not null then
    delete from public.activity_logs
    where id = v_prev.id;
    v_merged_start := lower(v_prev.period);
  end if;
  if v_next.id is not null then
    delete from public.activity_logs
    where id = v_next.id;
    -- 後ろの記録が実行中なら upper は null になり、結合した記録も実行中になる
    v_merged_end := upper(v_next.period);
  end if;

  if v_prev.id is not null or v_next.id is not null then
    update public.activity_logs
    set period = tstzrange(v_merged_start, v_merged_end, '[)'),
        -- どちらかに予定由来の印があれば残す（後ろを優先）
        schedule_id = coalesce(v_next.schedule_id, v_prev.schedule_id)
    where id = v_new_id;
  end if;
end;
$$;

-- ② ログインしている人だけが呼べるようにする（ログインしていない人の呼び出しは、関数に入る前に断る）
revoke execute on function public.overwrite_activity(bigint, timestamptz, timestamptz) from public, anon;
grant execute on function public.overwrite_activity(bigint, timestamptz, timestamptz) to authenticated;
