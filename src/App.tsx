import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './screens/Login'
import Top from './screens/Top'
import Edit from './screens/Edit'
import EditDayStart from './screens/EditDayStart'

// ログインしたあとに出せる画面の名前（editOverwrite：修正（記録の上書き）、editDayStart：修正（1日のスタート））
type Screen = 'top' | 'editOverwrite' | 'editDayStart'

// アプリの画面の一番外側。ログインしているかどうかと、今の画面の名前で、表示する画面を切り替える
function App() {
  // ログイン状態。undefined：まだ調べている途中、null：ログインしていない、Session：ログインしている
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // 今出している画面（最初はトップ）。URL は変えず、この状態だけで切り替える（SCREENS.md 3章）
  const [screen, setScreen] = useState<Screen>('top')

  useEffect(() => {
    // ログイン状態が分かったとき・変わったときに呼んでもらう関数を、Supabase に登録する
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    // App が画面から消えるときに、登録を取り消す
    return () => data.subscription.unsubscribe()
  }, [])

  // まだ分からない間は何も出さない（ログイン済みなのにログイン画面が一瞬見えるのを防ぐ）
  if (session === undefined) {
    return null
  }
  if (session === null) {
    return <Login />
  }

  // ---------- ログインしているとき：今の画面の名前で出し分ける ----------
  // 修正画面の上の切り替え（onSelectTab）は、押した側の画面の名前を渡すので、そのまま setScreen に入れる
  if (screen === 'editOverwrite') {
    return <Edit onBack={() => setScreen('top')} onSelectTab={setScreen} />
  }
  if (screen === 'editDayStart') {
    return <EditDayStart onBack={() => setScreen('top')} onSelectTab={setScreen} />
  }
  return <Top onOpenEdit={() => setScreen('editOverwrite')} />
}

export default App
