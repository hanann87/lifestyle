-- 予定による自動切り替えの実行済み記録（二重実行の防止）。設計は DESIGN.md 6章、9章 auto_switches
create table public.auto_switches (
  user_id uuid references auth.users (id) on delete cascade not null,
  schedule_id bigint not null,
  on_date date not null,
  day_start_pending boolean default false not null,

  -- 同じ予定の同じ日の自動切り替えは、1回だけ
  primary key (schedule_id, on_date),
  -- 予定は、記録の持ち主と同じ人の予定
  constraint auto_switches_schedule_same_user
    foreign key (schedule_id, user_id) references public.schedules (id, user_id)
);

-- RLS：本人の行だけ読める。書き込みは DB関数（RPC）を通して行う
alter table public.auto_switches enable row level security;

create policy "auto_switches: 本人だけ読める" on public.auto_switches
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
