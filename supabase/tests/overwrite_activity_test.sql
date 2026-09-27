-- overwrite_activity（記録を上書きする DB 関数）のテスト。
-- 設計は DESIGN.md 7章「記録の修正」、10章「記録の修正（時間帯の上書き）」
-- 実行：npx supabase test db（手元の DB で動く。最後に rollback するので、データは残らない）
-- 手元の DB には試し用ユーザーの記録などもあるので、確かめるときは必ずテスト用ユーザー（1111…）の行だけに絞る

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ========== 準備（管理者の権限で） ==========

-- テスト用のユーザーを2人作る（睡眠ボタンは、トリガーで自動で1つずつ作られる）
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

-- 自分のボタンを足す（「古いボタン」は非表示にしたもの）
insert into public.buttons (user_id, name, color, display_order, archived_at) values
  ('11111111-1111-1111-1111-111111111111', '研究', '#2F6BC4', 2, null),
  ('11111111-1111-1111-1111-111111111111', '休憩', '#B8C4A0', 3, null),
  ('11111111-1111-1111-1111-111111111111', '食事', '#E9B949', 4, null),
  ('11111111-1111-1111-1111-111111111111', '古いボタン', '#9A9A9A', 5, now());

-- ボタンの名前と ID の対応表（ID は自動で振られるので、名前で探せるようにしておく）
create temp table test_buttons (name text primary key, id bigint not null);
insert into test_buttons
  select name, id from public.buttons where user_id = '11111111-1111-1111-1111-111111111111';
insert into test_buttons
  select '他人の睡眠', id from public.buttons where user_id = '22222222-2222-2222-2222-222222222222';
grant select on test_buttons to authenticated;

-- 自分の予定を1つ作る（予定由来の印 schedule_id を確かめるため）
insert into public.schedules (user_id, title, start_time, end_time, valid_from, valid_until) values
  ('11111111-1111-1111-1111-111111111111', '試しの予定', '10:00', '11:00', current_date, current_date);

-- 自分の記録を、1行の文字にまとめて見るためのビュー（select に名前を付けたもの）
-- 例：「睡眠 -10〜-6, 研究 -6〜-3, 休憩 -3〜」＝ 今から何時間前〜何時間前か。終わりが空なら実行中
create temp view test_logs_summary as
  select string_agg(
    b.name || ' ' || (extract(epoch from lower(l.period) - now()) / 3600)::int
      || '〜' || coalesce(((extract(epoch from upper(l.period) - now()) / 3600)::int)::text, ''),
    ', ' order by lower(l.period)
  ) as summary
  from public.activity_logs l
  join test_buttons b on b.id = l.button_id
  where l.user_id = '11111111-1111-1111-1111-111111111111';

-- 自分の記録を、いつも同じ状態に作り直す関数
-- 睡眠 10〜6時間前、研究 6〜3時間前、休憩 3時間前から実行中
-- （テスト全体が1つのトランザクションで now() が変わらないので、過去の時刻で用意する）
create function pg_temp.reset_logs() returns void language sql as $$
  delete from public.activity_logs where user_id = '11111111-1111-1111-1111-111111111111';
  insert into public.activity_logs (user_id, button_id, period) values
    ('11111111-1111-1111-1111-111111111111', (select id from test_buttons where name = '睡眠'),
     tstzrange(now() - interval '10 hours', now() - interval '6 hours', '[)')),
    ('11111111-1111-1111-1111-111111111111', (select id from test_buttons where name = '研究'),
     tstzrange(now() - interval '6 hours', now() - interval '3 hours', '[)')),
    ('11111111-1111-1111-1111-111111111111', (select id from test_buttons where name = '休憩'),
     tstzrange(now() - interval '3 hours', null, '[)'));
$$;

-- 1日のスタートは6時間前（上書きでは変わらないことを、最後に確かめる）
insert into public.day_starts (user_id, started_at) values
  ('11111111-1111-1111-1111-111111111111', now() - interval '6 hours');

-- 関数を呼ぶときは「自分」としてログインしている状態にする（auth.uid() がこの ID を返す）
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- ========== 1. 削除と切り詰め（7〜2時間前を食事にする） ==========

select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '食事'),
       now() - interval '7 hours', now() - interval '2 hours') $$,
  '1. 7〜2時間前を食事に上書きすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-7, 食事 -7〜-2, 休憩 -2〜',
  '1. 中に入っている研究は削除、睡眠は後ろ・休憩は前が切り詰められ、休憩は実行中のまま'
);

-- ========== 2. 分割（研究の途中の5〜4時間前を食事にする） ==========

select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '食事'),
       now() - interval '5 hours', now() - interval '4 hours') $$,
  '2. 研究の途中を食事に上書きすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-6, 研究 -6〜-5, 食事 -5〜-4, 研究 -4〜-3, 休憩 -3〜',
  '2. 研究が前後に分割され、間に食事が入る'
);

-- ========== 3. 結合 ==========

-- 研究の途中を研究で上書きする：分割された前後の研究と、新しい研究が1つにまとまる
select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '5 hours', now() - interval '4 hours') $$,
  '3. 研究の途中を研究で上書きすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-6, 研究 -6〜-3, 休憩 -3〜',
  '3. 前後の研究と結合して、研究は1件のまま'
);

-- 研究のすぐ後（3〜2時間前）を研究にする：前の研究とだけ結合する
select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '3 hours', now() - interval '2 hours') $$,
  '3. 研究のすぐ後を研究で上書きすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-6, 研究 -6〜-2, 休憩 -2〜',
  '3. すぐ前の研究と結合し、休憩は切り詰められる'
);

-- ========== 4. 今も続けている（終了を渡さない） ==========

-- 2時間前から食事を今も続けている：休憩が切り詰められ、食事が実行中になる
select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '食事'),
       now() - interval '2 hours') $$,
  '4. 2時間前から食事を今も続けている、にすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-6, 研究 -6〜-3, 休憩 -3〜-2, 食事 -2〜',
  '4. 休憩が2時間前で終わり、食事が実行中になる'
);

-- 1時間前から休憩を今も続けている：実行中の休憩と結合して、何も変わらない
select pg_temp.reset_logs();
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '休憩'),
       now() - interval '1 hour') $$,
  '4. 実行中と同じカテゴリで今も続けている、にすると、エラーにならない'
);
reset role;

select is(
  (select summary from test_logs_summary),
  '睡眠 -10〜-6, 研究 -6〜-3, 休憩 -3〜',
  '4. 実行中の休憩と結合して、休憩は1件のまま実行中'
);

-- ========== 5. 予定由来の印（schedule_id） ==========

-- 実行中の休憩を、予定から始まった記録にしておく
select pg_temp.reset_logs();
update public.activity_logs
set schedule_id = (select id from public.schedules where user_id = '11111111-1111-1111-1111-111111111111')
where user_id = '11111111-1111-1111-1111-111111111111'
  and upper_inf(period);

-- 休憩の途中（2〜1時間前）を食事にする：休憩が前後に分割される
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '食事'),
       now() - interval '2 hours', now() - interval '1 hour') $$,
  '5. 予定から始まった休憩の途中を食事に上書きすると、エラーにならない'
);
reset role;

select is(
  (select count(*) from public.activity_logs
    where user_id = '11111111-1111-1111-1111-111111111111' and schedule_id is not null)::int,
  2,
  '5. 分割で残った前後の休憩は、2件とも予定由来の印が残る'
);
select is(
  (select schedule_id from public.activity_logs
    where user_id = '11111111-1111-1111-1111-111111111111'
      and button_id = (select id from test_buttons where name = '食事')),
  null,
  '5. 上書きで作った食事は、手動扱い（印なし）'
);

-- 続けて、同じ2〜1時間前を休憩に戻す：前後の休憩と結合する
set local role authenticated;
select lives_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '休憩'),
       now() - interval '2 hours', now() - interval '1 hour') $$,
  '5. 同じ時間帯を休憩に戻すと、エラーにならない'
);
reset role;

select is(
  (select schedule_id from public.activity_logs
    where user_id = '11111111-1111-1111-1111-111111111111' and upper_inf(period)),
  (select id from public.schedules where user_id = '11111111-1111-1111-1111-111111111111'),
  '5. 結合した休憩（実行中）に、予定由来の印が残る'
);

-- ========== 6. 1日のスタートは変わらない ==========

select is(
  (select array_agg(started_at) from public.day_starts where user_id = '11111111-1111-1111-1111-111111111111'),
  array[now() - interval '6 hours'],
  '6. 何度上書きしても、1日のスタートは6時間前の1件のまま'
);

-- ========== 7. エラーになる場合 ==========

select pg_temp.reset_logs();
set local role authenticated;
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'), now()) $$,
  'P0001', '開始は今より前の時刻にしてください',
  '7. 開始が今だと、エラーになる'
);
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '2 hours', now() - interval '3 hours') $$,
  'P0001', '終了は開始より後で、今より前の時刻にしてください',
  '7. 終了が開始より前だと、エラーになる'
);
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '2 hours', now()) $$,
  'P0001', '終了は開始より後で、今より前の時刻にしてください',
  '7. 終了が今だと、エラーになる（今までなら「今も続けている」を使う）'
);
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '11 hours', now() - interval '9 hours') $$,
  'P0001', '開始は、記録を始めた時刻（最初の記録）より後にしてください',
  '7. 開始が最初の記録（10時間前）より前だと、エラーになる'
);
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '古いボタン'),
       now() - interval '2 hours', now() - interval '1 hour') $$,
  'P0001', 'このボタンは使えません',
  '7. 非表示（アーカイブ）のボタンは、エラーになる'
);
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '他人の睡眠'),
       now() - interval '2 hours', now() - interval '1 hour') $$,
  'P0001', 'このボタンは使えません',
  '7. 他人のボタンは、エラーになる'
);
reset role;

-- 記録が1件もない（使い始め）とき
delete from public.activity_logs where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select throws_ok(
  $$ select public.overwrite_activity((select id from test_buttons where name = '研究'),
       now() - interval '2 hours', now() - interval '1 hour') $$,
  'P0001', 'まだ記録がありません',
  '7. 記録が1件もないと、エラーになる'
);
reset role;

-- ログインしていない人（ボタンの ID は何でもよいので 1 にする）
set local role anon;
select throws_ok(
  $$ select public.overwrite_activity(1, now() - interval '2 hours') $$,
  '42501', null,
  '7. ログインしていない人（anon）は、関数を呼べない'
);
reset role;

select * from finish();
rollback;
