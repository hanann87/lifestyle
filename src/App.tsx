import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './screens/Login'
import Top from './screens/Top'

// アプリの画面の一番外側。ログインしているかどうかで、表示する画面を切り替える
function App() {
  // ログイン状態。undefined：まだ調べている途中、null：ログインしていない、Session：ログインしている
  const [session, setSession] = useState<Session | null | undefined>(undefined)

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
  return <Top />
}

export default App
