-- アカウント作成時に「睡眠」ボタンを自動で作る。
-- 設計は DESIGN.md 1章「使い始めの状態」、9章 buttons の「初期データ」

-- ① 睡眠ボタンを追加する関数
create function public.create_sleep_button_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.buttons (user_id, name, color, display_order, is_sleep)
  values (new.id, '睡眠', '#243B6B', 1, true);

  return new;
end;
$$;

-- ② ユーザーが追加されたら、①の関数を実行するトリガー
create trigger on_auth_user_created_create_sleep_button
  after insert on auth.users
  for each row
  execute function public.create_sleep_button_for_new_user();
