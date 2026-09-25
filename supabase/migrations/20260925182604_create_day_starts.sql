-- 1日のスタート（生活日の区切り）。設計は DESIGN.md 5章、9章 day_starts
create table public.day_starts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  started_at timestamptz not null,

  -- 同じ人の同じ時刻に、1日のスタートを2つ作れない
  constraint day_starts_user_started_at_unique unique (user_id, started_at)
);

-- RLS：本人の行だけ読める。書き込みは DB関数（RPC）を通して行う
alter table public.day_starts enable row level security;

create policy "day_starts: 本人だけ読める" on public.day_starts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
