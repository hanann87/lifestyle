import { useState } from 'react'
import type { CSSProperties, SubmitEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_COLORS } from '../lib/categoryColors'
import styles from './CategoryAddSheet.module.css'

// カテゴリ名の上限の文字数（DB の制約 buttons_name_max_length と同じ）
const NAME_MAX_LENGTH = 10

// カテゴリを追加するボトムシート（SCREENS.md「カテゴリを追加」、docs/mockups/CategoryAdd.dc.html）
function CategoryAddSheet({
  usedColors,
  onClose,
  onAdded,
}: {
  usedColors: string[] // 今あるカテゴリの色（最初に選んでおく色を決めるのに使う）
  onClose: () => void // 閉じるときに呼ぶ関数
  onAdded: () => void // 追加できたときに呼ぶ関数
}) {
  // 入力中のカテゴリ名
  const [name, setName] = useState('')
  // 選んでいる色。最初は、まだ使っていない色の先頭
  const [color, setColor] = useState(pickFirstUnusedColor(usedColors))
  // 追加の通信中か（通信中は、ボタンを押せなくし、閉じられなくする）
  const [sending, setSending] = useState(false)
  // 失敗したときのメッセージ（空なら何も出さない）
  const [errorMessage, setErrorMessage] = useState('')

  // 前後の空白（全角スペースも）を取り除いた名前。表示例と、追加するときに使う
  const trimmedName = name.trim()
  // 表示例に出す名前（まだ何も入れていなければ「カテゴリ名」）
  const previewName = trimmedName === '' ? 'カテゴリ名' : trimmedName

  // ---------- 「追加する」を押したとき：DB にカテゴリを追加する ----------
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    // フォームを送ったときの標準の動き（ページの読み込み直し）を止める
    event.preventDefault()

    if (trimmedName === '') {
      setErrorMessage('カテゴリ名を入力してください')
      return
    }

    setSending(true)
    setErrorMessage('')

    // カテゴリを追加する DB 関数を呼ぶ
    const { error } = await supabase.rpc('add_button', { p_name: trimmedName, p_color: color })

    setSending(false)

    if (error) {
      // 同じ名前のときは DB 関数のメッセージをそのまま出す。それ以外は通信の失敗として扱う
      setErrorMessage(
        error.message === 'すでに同じ名前のカテゴリがあります'
          ? error.message
          : '追加できませんでした。電波の良い場所で再度お試しください',
      )
      return
    }

    onAdded()
  }

  return (
    // 暗幕。シートの外側を押したら閉じる（通信中は閉じない）
    <div className={styles.scrim} onClick={sending ? undefined : onClose}>
      <form
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-add-title"
        onSubmit={handleSubmit}
        // シートの中を押したときは、暗幕に「押された」ことを伝えない（伝わると閉じてしまう）
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="category-add-title" className={styles.title}>
          カテゴリを追加
        </h2>

        {/* ---------- カテゴリ名 ---------- */}
        <div className={styles.field}>
          <label htmlFor="category-name" className={styles.label}>
            カテゴリ名
          </label>
          <input
            id="category-name"
            type="text"
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
          />
          {errorMessage !== '' && (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        {/* ---------- 色（12色から1つ選ぶ） ---------- */}
        <fieldset className={styles.colorSet}>
          <legend className={styles.legend}>色</legend>
          <div className={styles.colorGrid}>
            {CATEGORY_COLORS.map((option) => (
              <button
                key={option.hex}
                type="button"
                className={
                  option.hex === color
                    ? `${styles.colorButton} ${styles.colorSelected}`
                    : styles.colorButton
                }
                style={{ background: option.hex }}
                aria-label={option.label}
                aria-pressed={option.hex === color}
                onClick={() => setColor(option.hex)}
              />
            ))}
          </div>
          <p className={styles.note}>他のカテゴリと見分けやすい色を選んでください。</p>
        </fieldset>

        {/* ---------- 表示例（カテゴリボタンとしての見え方） ---------- */}
        <div className={styles.field}>
          <div className={styles.label}>表示例</div>
          <div className={styles.preview}>
            <span className={styles.previewChip} style={{ background: color }} />
            {/* 名前の文字数を CSS 変数で渡し、カテゴリボタンと同じく、入りきらないときだけ文字を小さくする */}
            <span className={styles.previewName} style={{ '--name-length': previewName.length } as CSSProperties}>
              {previewName}
            </span>
          </div>
        </div>

        {/* ---------- キャンセル・追加する ---------- */}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={sending}>
            キャンセル
          </button>
          <button type="submit" className={styles.submitButton} disabled={sending}>
            {sending ? '追加中…' : '追加する'}
          </button>
        </div>
      </form>
    </div>
  )
}

// まだ使っていない色の中で、一番左上の色を返す（12色とも使っていたら、先頭の色）
function pickFirstUnusedColor(usedColors: string[]): string {
  const unusedColor = CATEGORY_COLORS.find((option) => !usedColors.includes(option.hex))
  return (unusedColor ?? CATEGORY_COLORS[0]).hex
}

export default CategoryAddSheet
