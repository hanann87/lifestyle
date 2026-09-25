-- 行動ログ（実績の記録。開始〜終了の区間）。設計は DESIGN.md 1章「記録の基本ルール」、9章 activity_logs
create table public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  button_id bigint not null,
  period tstzrange not null,
  schedule_id bigint,

  -- 行動のボタンは、記録の持ち主と同じ人のボタン
  constraint activity_logs_button_same_user
    foreign key (button_id, user_id) references public.buttons (id, user_id),
  -- 予定から始まった記録なら、その予定は同じ人の予定（schedule_id が空なら調べない）
  constraint activity_logs_schedule_same_user
    foreign key (schedule_id, user_id) references public.schedules (id, user_id),
  -- 範囲は [開始, 終了) の形。開始は必ずあり、空の範囲は不可。終了なし（実行中）は可
  constraint activity_logs_period_valid check (
    not isempty(period)
    and lower(period) is not null
    and lower_inc(period)
    and not upper_inc(period)
  ),
  -- 同じ人の記録どうしは、時間が重ならない
  constraint activity_logs_no_overlap exclude using gist (
    user_id with =,
    period with &&
  )
);

-- 実行中（終了なし）の記録は、1人につき常に1件まで
create unique index activity_logs_one_running_per_user
  on public.activity_logs (user_id)
  where upper_inf(period);

-- RLS：本人の行だけ読める。書き込みは DB関数（RPC）を通して行う
alter table public.activity_logs enable row level security;

create policy "activity_logs: 本人だけ読める" on public.activity_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
