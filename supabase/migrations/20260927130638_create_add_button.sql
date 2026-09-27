-- カテゴリ（行動ボタン）を追加する。
-- 設計は DESIGN.md 9章 buttons、10章「カテゴリの追加」

-- ① 名前は10文字まで（ボタンは2列で横幅が狭く、長い名前ははみ出すため）
alter table public.buttons
  add constraint buttons_name_max_length check (char_length(name) <= 10);

-- ② 同じ人の、非表示でないボタンどうしで、同じ名前は不可（非表示にしたボタンと同じ名前は使える）
create unique index buttons_unique_active_name_per_user
  on public.buttons (user_id, name)
  where archived_at is null;

-- ③ カテゴリを追加する関数
create function public.add_button(p_name text, p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  -- 前後の空白（全角スペースも）を取り除いた名前
  v_name text := btrim(p_name, ' 　');
  v_display_order integer;
begin
  -- ログインしていなければ止める
  if v_user_id is null then
    raise exception 'ログインしていません';
  end if;

  -- 同じ名前のカテゴリ（非表示でないもの）があれば止める。②のインデックスでも防げるが、分かりやすいメッセージを返すために先に確かめる
  if exists (
    select 1
    from public.buttons
    where user_id = v_user_id
      and name = v_name
      and archived_at is null
  ) then
    raise exception 'すでに同じ名前のカテゴリがあります';
  end if;

  -- 並び順を決める：その人のボタン（非表示のものも含む）の中で一番大きい並び順 + 1（＝一番最後）
  select coalesce(max(display_order), 0) + 1
  into v_display_order
  from public.buttons
  where user_id = v_user_id;

  -- ボタンを追加する（名前が空・11文字以上、色の形が違うときは、表の制約がエラーにする）
  insert into public.buttons (user_id, name, color, display_order)
  values (v_user_id, v_name, p_color, v_display_order);
end;
$$;

-- ④ ログインしている人だけが呼べるようにする
revoke execute on function public.add_button(text, text) from public, anon;
grant execute on function public.add_button(text, text) to authenticated;
