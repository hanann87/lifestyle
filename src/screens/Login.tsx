import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Login.module.css'

// ログイン画面（SCREENS.md「ログイン」、docs/mockups/Login.dc.html）
function Login() {
  // 入力中のあいことば
  const [passphrase, setPassphrase] = useState('')
  // ログインの通信中か（通信中はボタンを押せなくして、二重に送らないようにする）
  const [sending, setSending] = useState(false)
  // 失敗したときに出すメッセージ（空なら何も出さない）
  const [errorMessage, setErrorMessage] = useState('')

  // ログインボタンを押したとき（入力欄で Enter を押したときも）
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    // フォームを送ったときの標準の動き（ページの読み込み直し）を止める
    event.preventDefault()

    if (passphrase === '') {
      setErrorMessage('あいことばを入力してください')
      return
    }

    setSending(true)
    setErrorMessage('')

    // 固定のメールアドレスとあいことばで、Supabase Auth にログインする（照合は Supabase 側で行う）
    const { error } = await supabase.auth.signInWithPassword({
      email: import.meta.env.VITE_LOGIN_EMAIL,
      password: passphrase,
    })

    setSending(false)

    if (error) {
      setErrorMessage(
        error.code === 'invalid_credentials'
          ? 'あいことばが違います'
          : 'ログインできませんでした。電波の良い場所で再度お試しください',
      )
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <div className={styles.icon}>
          {/* 時計のアイコン */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <h1 className={styles.appName}>生活リズム</h1>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="passphrase" className={styles.label}>
            あいことば
          </label>
          <input
            id="passphrase"
            type="password"
            className={styles.input}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
          {errorMessage !== '' && (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <button type="submit" className={styles.button} disabled={sending}>
          {sending ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}

export default Login
