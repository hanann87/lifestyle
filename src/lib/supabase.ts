import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// 設定し忘れたまま動かすと、分かりにくいエラーになるので、最初に止める
if (!url || !publishableKey) {
  throw new Error('.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を設定してください')
}

// アプリ全体で使う、Supabase とやり取りするための部品（1つだけ作って使い回す）
export const supabase = createClient<Database>(url, publishableKey)
