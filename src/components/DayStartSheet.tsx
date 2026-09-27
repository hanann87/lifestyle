import { formatTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import styles from './DayStartSheet.module.css'

// 1日のスタート確認のボトムシート（SCREENS.md「1日のスタート確認」、docs/mockups/DayStartDialog.dc.html）
// 睡眠の記録中に、別のカテゴリのボタンを押したときに出す（DESIGN.md 5章）
function DayStartSheet({
  sleepName,
  sleepColor,
  sleepStart,
  nextName,
  onAnswer,
}: {
  sleepName: string // 実行中の睡眠のカテゴリ名
  sleepColor: string // その色
  sleepStart: Date // 睡眠の開始時刻
  nextName: string // 押したカテゴリ名（これから始める行動）
  onAnswer: (startDay: boolean) => void // 答えたときに呼ぶ関数（はい：true、いいえ：false）
}) {
  // 今の時刻（開いたままなら、時計のように進む）。記録は「はい」「いいえ」を押した時刻から始まるため
  const now = useNow()

  return (
    // 暗幕。外側を押しても閉じない（必ず「はい」か「いいえ」を選ぶ）
    <div className={styles.scrim}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-start-title"
      >
        <div className={styles.sleepLabel}>
          <span className={styles.sleepChip} style={{ background: sleepColor }} />
          {sleepName} {formatTime(sleepStart)} から記録中
        </div>

        <h2 id="day-start-title" className={styles.title}>
          1日をスタートしますか？
        </h2>

        <p className={styles.message}>
          「{nextName}」を {formatTime(now)} から始めます。「はい」を選ぶと、ここから新しい生活日になります。
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.yesButton} onClick={() => onAnswer(true)}>
            はい、1日をスタート
          </button>
          <button type="button" className={styles.noButton} onClick={() => onAnswer(false)}>
            いいえ（夜中に起きただけ）
          </button>
        </div>
      </div>
    </div>
  )
}

export default DayStartSheet
