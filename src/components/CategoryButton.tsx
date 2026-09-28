import type { CSSProperties } from 'react'
import styles from './CategoryButton.module.css'

// カテゴリボタン1つ分（トップのカテゴリボタンと、修正画面のカテゴリ選びで使う。SCREENS.md「トップ」の4）
// isActive のボタンはカテゴリの色で塗りつぶし、文字を白にする。isDimmed のボタンは薄くする
// 名前がボタンの幅に入りきらないときだけ、ちょうど入る大きさまで文字を小さくする（計算は CategoryButton.module.css）
function CategoryButton({
  name,
  color,
  isActive,
  isDimmed = false,
  disabled = false,
  onPress,
}: {
  name: string // カテゴリの名前
  color: string // カテゴリの色
  isActive: boolean // 塗りつぶすか（トップ：実行中、修正画面：選んでいる）
  isDimmed?: boolean // 薄くするか（トップ：記録している途中）。省略したら false
  disabled?: boolean // 押せなくするか。省略したら false
  onPress: () => void // 押したときに呼ぶ関数
}) {
  // 付けるクラス：いつも button。塗りつぶすなら active、薄くするなら dimmed も付ける
  const classNames = [styles.button]
  if (isActive) {
    classNames.push(styles.active)
  }
  if (isDimmed) {
    classNames.push(styles.dimmed)
  }

  // 名前の文字数を、CSS 変数 --name-length として渡す（文字の大きさの計算に使う）
  // 塗りつぶすときは、背景と枠もカテゴリの色にする
  const style = {
    '--name-length': name.length,
    ...(isActive ? { background: color, borderColor: color } : {}),
  } as CSSProperties

  return (
    <button
      type="button"
      className={classNames.join(' ')}
      style={style}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onPress}
    >
      <span className={styles.chip} style={{ background: isActive ? 'var(--color-surface)' : color }} />
      <span className={styles.name}>{name}</span>
    </button>
  )
}

export default CategoryButton
