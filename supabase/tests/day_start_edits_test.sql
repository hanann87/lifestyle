-- add_day_start・move_day_start・delete_day_start（1日のスタートを追加・移動・削除する DB 関数）のテスト。
-- 設計は DESIGN.md 7章「1日のスタートの修正」、10章「1日のスタートの修正」
-- 実行：npx supabase test db（手元の DB で動く。最後に rollback するので、データは残らない）
-- 手元の DB には試し用ユーザーの記録などもあるので、確かめるときは必ずテスト用ユーザー（1111…）の行だけに絞る

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ========== 準備（管理者の権限で） ==========

-- テスト用のユーザーを2人作る（睡眠ボタンは、トリガーで自動で1つずつ作られる）
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

-- 自分の記録を4件作る。境目（記録の開始）は、30・24・10・5時間前
-- （1日のスタートの操作は、どのカテゴリの記録かに関係ないので、全部睡眠ボタンにする）
insert into public.activity_logs (user_id, button_id, period)
select
  '11111111-1111-1111-1111-111111111111',
  (select id from public.buttons where user_id = '11111111-1111-1111-1111-111111111111'),
  tstzrange(now() - start_hours * interval '1 hour', now() - end_hours * interval '1 hour', '[)')
from (values (30, 24), (24, 10), (10, 5)) as t(start_hours, end_hours);

insert into public.activity_logs (user_id, button_id, period) values
  ('11111111-1111-1111-1111-111111111111',
   (select id from public.buttons where user_id = '11111111-1111-1111-1111-111111111111'),
   tstzrange(now() - interval '5 hours', null, '[)'));

-- 他人の記録（20時間前から実行中）と、他人の1日のスタート（20時間前）
insert into public.activity_logs (user_id, button_id, period) values
  ('22222222-2222-2222-2222-222222222222',
   (select id from public.buttons where user_id = '22222222-2222-2222-2222-222222222222'),
   tstzrange(now() - interval '20 hours', null, '[)'));
insert into public.day_starts (user_id, started_at) values
  ('22222222-2222-2222-2222-222222222222', now() - interval '20 hours');

-- 記録の名前と ID の対応表（「24h」＝24時間前に始まった記録。ID は自動で振られるので、名前で探せるようにしておく）
create temp table test_logs (name text primary key, id bigint not null);
insert into test_logs
  select (extract(epoch from now() - lower(period)) / 3600)::int || 'h', id
  from public.activity_logs
  where user_id = '11111111-1111-1111-1111-111111111111';
insert into test_logs
  select '他人の記録', id from public.activity_logs where user_id = '22222222-2222-2222-2222-222222222222';
grant select on test_logs to authenticated;

-- 他人の1日のスタートの ID（自分の1日のスタートは、関数を呼ぶときに時刻で探す。ログインしている本人は RLS で自分の行を読める）
create temp table test_other_day_start as
  select id from public.day_starts where user_id = '22222222-2222-2222-2222-222222222222';
grant select on test_other_day_start to authenticated;

-- 自分の1日のスタートを、1行の文字にまとめて見るためのビュー（例：「-30, -10」＝30時間前と10時間前）
create temp view test_day_starts_summary as
  select string_agg(
    ((extract(epoch from started_at - now()) / 3600)::int)::text, ', ' order by started_at
  ) as summary
  from public.day_starts
  where user_id = '11111111-1111-1111-1111-111111111111';

-- 自分の1日のスタートを、いつも同じ状態（30時間前と10時間前）に作り直す関数
create function pg_temp.reset_day_starts() returns void language sql as $$
  delete from public.day_starts where user_id = '11111111-1111-1111-1111-111111111111';
  insert into public.day_starts (user_id, started_at) values
    ('11111111-1111-1111-1111-111111111111', now() - interval '30 hours'),
    ('11111111-1111-1111-1111-111111111111', now() - interval '10 hours');
$$;

-- 関数を呼ぶときは「自分」としてログインしている状態にする（auth.uid() がこの ID を返す）
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- ========== 1. 追加する ==========

select pg_temp.reset_day_starts();
set local role authenticated;
select lives_ok(
  $$ select public.add_day_start((select id from test_logs where name = '5h')) $$,
  '1. 5時間前の境目に追加すると、エラーにならない'
);
reset role;

select is(
  (select summary from test_day_starts_summary), '-30, -10, -5',
  '1. 5時間前の1日のスタートが増える'
);

-- ========== 2. 追加できない場合 ==========

select pg_temp.reset_day_starts();
set local role authenticated;
select throws_ok(
  $$ select public.add_day_start((select id from test_logs where name = '10h')) $$,
  'P0001', 'すでに1日のスタートがあります',
  '2. すでに1日のスタートがある境目には、追加できない'
);
select throws_ok(
  $$ select public.add_day_start((select id from test_logs where name = '他人の記録')) $$,
  'P0001', 'この境目は使えません',
  '2. 他人の記録の境目には、追加できない'
);
reset role;

-- ========== 3. 移動する ==========

-- 10時間前 → 24時間前（すぐ前の30時間前より後なので、動かせる）
select pg_temp.reset_day_starts();
set local role authenticated;
select lives_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '10 hours'), (select id from test_logs where name = '24h')) $$,
  '3. 10時間前のスタートを24時間前の境目へ動かすと、エラーにならない'
);
reset role;

select is(
  (select summary from test_day_starts_summary), '-30, -24',
  '3. 10時間前のスタートが、24時間前に移る'
);

-- 一番新しい1日のスタート（すぐ後がない）を、後ろへ動かす：10時間前 → 5時間前
select pg_temp.reset_day_starts();
set local role authenticated;
select lives_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '10 hours'), (select id from test_logs where name = '5h')) $$,
  '3. 一番新しいスタートを後ろ（5時間前）へ動かすと、エラーにならない'
);
reset role;

select is(
  (select summary from test_day_starts_summary), '-30, -5',
  '3. 10時間前のスタートが、5時間前に移る'
);

-- 前後の1日のスタートを越えられない：30時間前・10時間前・5時間前の3つにしておく
select pg_temp.reset_day_starts();
insert into public.day_starts (user_id, started_at) values
  ('11111111-1111-1111-1111-111111111111', now() - interval '5 hours');
set local role authenticated;
select throws_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '10 hours'), (select id from test_logs where name = '5h')) $$,
  'P0001', '前後の1日のスタートを越えては、移動できません',
  '3. すぐ後のスタート（5時間前）と同じ時刻へは、動かせない'
);
select throws_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '10 hours'), (select id from test_logs where name = '30h')) $$,
  'P0001', '前後の1日のスタートを越えては、移動できません',
  '3. すぐ前のスタート（30時間前）と同じ時刻へは、動かせない'
);
reset role;

-- ========== 4. 移動できない場合 ==========

select pg_temp.reset_day_starts();
set local role authenticated;
select throws_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '30 hours'), (select id from test_logs where name = '24h')) $$,
  'P0001', '最初の1日のスタートは、移動・削除できません',
  '4. 一番早いスタート（30時間前）は、動かせない'
);
select throws_ok(
  $$ select public.move_day_start((select id from test_other_day_start), (select id from test_logs where name = '24h')) $$,
  'P0001', 'この1日のスタートは使えません',
  '4. 他人の1日のスタートは、動かせない'
);
select throws_ok(
  $$ select public.move_day_start((select id from public.day_starts where started_at = now() - interval '10 hours'), (select id from test_logs where name = '他人の記録')) $$,
  'P0001', 'この境目は使えません',
  '4. 他人の記録の境目へは、動かせない'
);
reset role;

-- ========== 5. 削除する ==========

select pg_temp.reset_day_starts();
set local role authenticated;
select lives_ok(
  $$ select public.delete_day_start((select id from public.day_starts where started_at = now() - interval '10 hours')) $$,
  '5. 10時間前のスタートを削除すると、エラーにならない'
);
reset role;

select is(
  (select summary from test_day_starts_summary), '-30',
  '5. 10時間前のスタートが消え、30時間前だけが残る'
);

set local role authenticated;
select throws_ok(
  $$ select public.delete_day_start((select id from public.day_starts where started_at = now() - interval '30 hours')) $$,
  'P0001', '最初の1日のスタートは、移動・削除できません',
  '5. 一番早いスタート（30時間前）は、削除できない'
);
select throws_ok(
  $$ select public.delete_day_start((select id from test_other_day_start)) $$,
  'P0001', 'この1日のスタートは使えません',
  '5. 他人の1日のスタートは、削除できない'
);
reset role;

-- ========== 6. 他人の1日のスタートは変わらない ==========

select is(
  (select array_agg(started_at) from public.day_starts where user_id = '22222222-2222-2222-2222-222222222222'),
  array[now() - interval '20 hours'],
  '6. 他人の1日のスタートは、20時間前の1件のまま'
);

-- ========== 7. ログインしていない人 ==========

-- ID は何でもよいので 1 にする（anon はテスト用の表を読めず、そちらのエラーと区別がつかなくなるため）
set local role anon;
select throws_ok(
  $$ select public.add_day_start(1) $$,
  '42501', null,
  '7. ログインしていない人（anon）は、追加の関数を呼べない'
);
select throws_ok(
  $$ select public.move_day_start(1, 1) $$,
  '42501', null,
  '7. ログインしていない人（anon）は、移動の関数を呼べない'
);
select throws_ok(
  $$ select public.delete_day_start(1) $$,
  '42501', null,
  '7. ログインしていない人（anon）は、削除の関数を呼べない'
);
reset role;

select * from finish();
rollback;
