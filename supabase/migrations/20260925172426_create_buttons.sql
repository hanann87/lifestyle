create table public.buttons (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  name text not null,
  color text not null,
  display_order integer not null,
  is_sleep boolean default false not null,
  archived_at timestamptz,
  created_at timestamptz default now() not null,

  -- 名前は空白だけ・0文字にできない（全角スペースも空白として扱う）
  constraint buttons_name_not_blank check (btrim(name, ' 　') <> ''),
  -- 色は「#」＋16進数6桁（例：#4A90D9）
  constraint buttons_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- 睡眠ボタンは非表示（アーカイブ）にできない
  constraint buttons_sleep_not_archived check (not (is_sleep and archived_at is not null))
);

-- 睡眠ボタンは1人につき1つだけ
create unique index buttons_one_sleep_per_user on public.buttons (user_id) where is_sleep;

-- RLS：ログインしている本人のボタンだけ読める。
-- 書き込み（追加・変更・削除）のルールは作らないので、画面から直接は書き込めない。
-- 書き込みは、後で作るDB関数（RPC）を通して行う。
alter table public.buttons enable row level security;

create policy "buttons: 本人だけ読める" on public.buttons
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
