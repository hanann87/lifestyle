// .env.local に書く値の型。import.meta.env.〜 で読むときに、名前の打ち間違いをエディタが教えてくれる
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_LOGIN_EMAIL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
