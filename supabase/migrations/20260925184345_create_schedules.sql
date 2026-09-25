-- 予定（繰り返しルール形式）。設計は DESIGN.md 6章、9章 schedules
create table public.schedules (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  title text not null,
  button_id bigint,
  auto_switch boolean default false not null,
  days_of_week smallint[],
  start_time time not null,
  end_time time not null,
  valid_from date not null,
  valid_until date not null,
  skip_dates date[] default '{}' not null,
  created_at timestamptz default now() not null,

  -- 切り替え先のボタンは、予定の持ち主と同じ人のボタン（button_id が空なら調べない）
  constraint schedules_button_same_user
    foreign key (button_id, user_id) references public.buttons (id, user_id),
  -- 自動で切り替えるなら、切り替え先のボタンが必要
  constraint schedules_auto_switch_needs_button check (not auto_switch or button_id is not null),
  -- タイトルは空白だけ・0文字にできない（全角スペースも空白として扱う）
  constraint schedules_title_not_blank check (btrim(title, ' 　') <> ''),
  -- 曜日は 1（月）〜 7（日）だけ。空の配列は不可（毎日なら null）
  constraint schedules_days_of_week_valid check (
    days_of_week is null
    or (cardinality(days_of_week) > 0 and days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[])
  ),
  -- 終了時刻は開始時刻より後（日跨ぎの予定は想定しない）
  constraint schedules_time_range check (end_time > start_time),
  -- 有効期間の終了日は開始日以降
  constraint schedules_valid_range check (valid_until >= valid_from)
);

-- 行動ログ・自動切り替えの記録から「同じ持ち主の予定」だけを参照できるようにする
alter table public.schedules
  add constraint schedules_id_user_id_unique unique (id, user_id);

-- RLS：本人の行だけ読める。書き込みは DB関数（RPC）を通して行う
alter table public.schedules enable row level security;

create policy "schedules: 本人だけ読める" on public.schedules
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
