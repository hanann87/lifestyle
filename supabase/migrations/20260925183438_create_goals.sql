-- 目標。設計は DESIGN.md 8章、9章 goals

-- ① 期間の排他制約で「button_id が同じか」を比べるために必要な拡張機能
create extension if not exists btree_gist with schema extensions;

-- ② goals から「同じ持ち主のボタン」だけを参照できるようにする
alter table public.buttons
  add constraint buttons_id_user_id_unique unique (id, user_id);

-- ③ 目標の表
create table public.goals (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  button_id bigint not null,
  goal_type text not null,
  target interval not null,
  valid_from date not null,
  valid_until date,
  created_at timestamptz default now() not null,

  -- 目標のボタンは、目標の持ち主と同じ人のボタン
  constraint goals_button_same_user
    foreign key (button_id, user_id) references public.buttons (id, user_id),
  -- 目標の種類は「1日目標」か「週目標」だけ
  constraint goals_goal_type_valid check (goal_type in ('daily', 'weekly')),
  -- 目標時間は0より大きい
  constraint goals_target_positive check (target > interval '0'),
  -- 「いつまで」は「いつから」以降（「いつまで」が空なら、ずっと続く）
  constraint goals_valid_range check (valid_until is null or valid_until >= valid_from),
  -- 週目標は、「いつから」が月曜、「いつまで」が日曜（isodow：月曜=1 〜 日曜=7）
  constraint goals_weekly_monday_to_sunday check (
    goal_type <> 'weekly'
    or (
      extract(isodow from valid_from) = 1
      and (valid_until is null or extract(isodow from valid_until) = 7)
    )
  ),
  -- 同じボタンの目標は、期間が重ならない
  constraint goals_no_overlap exclude using gist (
    button_id with =,
    daterange(valid_from, valid_until, '[]') with &&
  )
);

-- ④ RLS：本人の行だけ読める。書き込みは DB関数（RPC）を通して行う
alter table public.goals enable row level security;

create policy "goals: 本人だけ読める" on public.goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
