-- add_button（カテゴリを追加する DB 関数）のテスト。
-- 設計は DESIGN.md 9章 buttons、10章「カテゴリの追加」
-- 実行：npx supabase test db（手元の DB で動く。最後に rollback するので、データは残らない）

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ========== 準備（管理者の権限で） ==========

-- テスト用のユーザーを2人作る（睡眠ボタンは、トリガーで自動で1つずつ作られる。並び順は 1）
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

-- 他人は「読書」ボタンを持っている
insert into public.buttons (user_id, name, color, display_order) values
  ('22222222-2222-2222-2222-222222222222', '読書', '#4FA3A5', 2);

-- 関数を呼ぶときは「自分」としてログインしている状態にする（auth.uid() がこの ID を返す）
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- ========== 1. ふつうに追加する ==========

set local role authenticated;
select lives_ok(
  $$ select public.add_button('研究', '#2F6BC4') $$,
  '1. 追加すると、エラーにならない'
);
reset role;

select is(
  (select color from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '研究'),
  '#2F6BC4',
  '1. 名前と色が保存される'
);
select is(
  (select is_sleep from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '研究'),
  false,
  '1. 睡眠ボタンにはならない'
);
select is(
  (select display_order from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '研究'),
  2,
  '1. 並び順は一番最後（睡眠の次の 2）'
);

-- ========== 2. 前後に空白がある名前 ==========

set local role authenticated;
select lives_ok(
  $$ select public.add_button('　食事 ', '#E9B949') $$,
  '2. 前後に空白（全角・半角）がある名前でも、エラーにならない'
);
reset role;

select is(
  (select count(*) from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '食事')::int,
  1,
  '2. 前後の空白が取り除かれて「食事」で保存される'
);
select is(
  (select display_order from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '食事'),
  3,
  '2. もう1つ追加すると、並び順は 3'
);

-- ========== 3. 同じ名前 ==========

set local role authenticated;
select throws_ok(
  $$ select public.add_button('研究', '#D9822B') $$,
  'P0001', 'すでに同じ名前のカテゴリがあります',
  '3. 同じ名前のカテゴリは、追加できない'
);
reset role;

-- ========== 4. 非表示にしたボタンと同じ名前 ==========

-- 自分の「休憩」ボタンを、非表示にした状態で用意する（並び順は 10）
insert into public.buttons (user_id, name, color, display_order, archived_at) values
  ('11111111-1111-1111-1111-111111111111', '休憩', '#B8C4A0', 10, now());

set local role authenticated;
select lives_ok(
  $$ select public.add_button('休憩', '#B8C4A0') $$,
  '4. 非表示にしたボタンと同じ名前なら、追加できる'
);
reset role;

select is(
  (select display_order from public.buttons
    where user_id = '11111111-1111-1111-1111-111111111111' and name = '休憩' and archived_at is null),
  11,
  '4. 並び順は、非表示のボタンも含めた一番最後（10 の次の 11）'
);

-- ========== 5. 名前の長さ・空白だけ・色の形 ==========

set local role authenticated;
select lives_ok(
  $$ select public.add_button('一二三四五六七八九十', '#9A9A9A') $$,
  '5. 10文字の名前は、追加できる'
);
select throws_ok(
  $$ select public.add_button('一二三四五六七八九十一', '#9A9A9A') $$,
  '23514', 'new row for relation "buttons" violates check constraint "buttons_name_max_length"',
  '5. 11文字の名前は、エラーになる（名前の長さの制約）'
);
select throws_ok(
  $$ select public.add_button('　 ', '#9A9A9A') $$,
  '23514', 'new row for relation "buttons" violates check constraint "buttons_name_not_blank"',
  '5. 空白だけの名前は、エラーになる（空白禁止の制約）'
);
select throws_ok(
  $$ select public.add_button('移動', 'gray') $$,
  '23514', 'new row for relation "buttons" violates check constraint "buttons_color_hex"',
  '5. 色の形が違うと、エラーになる（色の形の制約）'
);

-- ========== 6. 他人が持っている名前 ==========

select lives_ok(
  $$ select public.add_button('読書', '#4FA3A5') $$,
  '6. 他人が持っている名前でも、自分は追加できる（重複は自分のボタンの中だけで判定する）'
);
reset role;

-- ========== 7. ログインしていない人 ==========

set local role anon;
select throws_ok(
  $$ select public.add_button('趣味', '#4FA3A5') $$,
  '42501', null,
  '7. ログインしていない人（anon）は、関数を呼べない'
);
reset role;

select * from finish();
rollback;
