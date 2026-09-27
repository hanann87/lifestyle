-- switch_activity（行動を切り替える DB 関数）のテスト。
-- 設計は DESIGN.md 1章「記録の基本ルール」「使い始めの状態」、10章「行動の切り替え（手動）」
-- 実行：npx supabase test db（手元の DB で動く。最後に rollback するので、データは残らない）

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ========== 準備（管理者の権限で） ==========

-- テスト用のユーザーを2人作る（睡眠ボタンは、トリガーで自動で1つずつ作られる）
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

-- 自分のボタンを足す（「古いボタン」は非表示にしたもの）
insert into public.buttons (user_id, name, color, display_order, archived_at) values
  ('11111111-1111-1111-1111-111111111111', '研究', '#2F6BC4', 2, null),
  ('11111111-1111-1111-1111-111111111111', '食事', '#E9B949', 3, null),
  ('11111111-1111-1111-1111-111111111111', '古いボタン', '#9A9A9A', 4, now());

-- ボタンの名前と ID の対応表（ID は自動で振られるので、名前で探せるようにしておく）
create temp table test_buttons (name text primary key, id bigint not null);
insert into test_buttons
  select name, id from public.buttons where user_id = '11111111-1111-1111-1111-111111111111';
insert into test_buttons
  select '他人の睡眠', id from public.buttons where user_id = '22222222-2222-2222-2222-222222222222';
grant select on test_buttons to authenticated, anon;

-- 関数を呼ぶときは「自分」としてログインしている状態にする（auth.uid() がこの ID を返す）
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- ========== 1. 使い始め（記録が0件）で押す ==========

set local role authenticated;
select lives_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '睡眠')) $$,
  '1. 使い始めに押すと、エラーにならない'
);
reset role;

select is(
  (select count(*) from public.activity_logs)::int, 1,
  '1. 記録が1件できる'
);
select is(
  (select button_id from public.activity_logs where upper_inf(period)),
  (select id from test_buttons where name = '睡眠'),
  '1. 押したボタンの記録が実行中になる'
);
select is(
  (select started_at from public.day_starts), now(),
  '1. 最初の記録の開始時刻が、1日のスタートになる'
);

-- ========== 2. 違うボタンを押す（1日はスタートしない） ==========

-- 状況を作り直す：8時間前から睡眠が実行中、1日のスタートは24時間前
-- （テスト全体が1つのトランザクションで now() が変わらないので、過去の時刻で用意する）
delete from public.activity_logs;
delete from public.day_starts;
insert into public.activity_logs (user_id, button_id, period) values
  ('11111111-1111-1111-1111-111111111111', (select id from test_buttons where name = '睡眠'),
   tstzrange(now() - interval '8 hours', null, '[)'));
insert into public.day_starts (user_id, started_at) values
  ('11111111-1111-1111-1111-111111111111', now() - interval '24 hours');

set local role authenticated;
select lives_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '研究')) $$,
  '2. 違うボタンを押すと、エラーにならない'
);
reset role;

select is(
  (select upper(period) from public.activity_logs
    where button_id = (select id from test_buttons where name = '睡眠')),
  now(),
  '2. 実行中だった記録が、今の時刻で終わる'
);
select is(
  (select button_id from public.activity_logs where upper_inf(period)),
  (select id from test_buttons where name = '研究'),
  '2. 押したボタンの記録が実行中になる'
);
select is(
  (select lower(period) from public.activity_logs where upper_inf(period)),
  now(),
  '2. 新しい記録は、今の時刻から始まる（前の記録との間に隙間がない）'
);
select is(
  (select count(*) from public.day_starts)::int, 1,
  '2. 1日のスタートは増えない'
);

-- ========== 3. 1日をスタートする（true）で押す ==========

-- 状況を作り直す（2 と同じ）
delete from public.activity_logs;
delete from public.day_starts;
insert into public.activity_logs (user_id, button_id, period) values
  ('11111111-1111-1111-1111-111111111111', (select id from test_buttons where name = '睡眠'),
   tstzrange(now() - interval '8 hours', null, '[)'));
insert into public.day_starts (user_id, started_at) values
  ('11111111-1111-1111-1111-111111111111', now() - interval '24 hours');

set local role authenticated;
select lives_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '食事'), true) $$,
  '3. 1日をスタートして押すと、エラーにならない'
);
reset role;

select is(
  (select max(started_at) from public.day_starts), now(),
  '3. 今の時刻が、1日のスタートとして記録される'
);

-- ========== 4. 実行中と同じボタンを押す ==========

-- 3 の続き（食事が今の時刻から実行中）
set local role authenticated;
select lives_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '食事')) $$,
  '4. 同じボタンを押すと、エラーにならない'
);
reset role;

select is(
  (select count(*) from public.activity_logs)::int, 2,
  '4. 記録は増えない（睡眠と食事の2件のまま）'
);

-- ========== 5. 使えないボタン ==========

set local role authenticated;
select throws_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '古いボタン')) $$,
  'P0001', 'このボタンは使えません',
  '5. 非表示（アーカイブ）のボタンは、エラーになる'
);
select throws_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '他人の睡眠')) $$,
  'P0001', 'このボタンは使えません',
  '5. 他人のボタンは、エラーになる'
);
reset role;

-- ========== 6. ログインしていない人 ==========

set local role anon;
select throws_ok(
  $$ select public.switch_activity((select id from test_buttons where name = '研究')) $$,
  '42501', null,
  '6. ログインしていない人（anon）は、関数を呼べない'
);
reset role;

select * from finish();
rollback;
