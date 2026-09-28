import { buildFlow } from '../lib/timeline'
import type { FlowLog } from '../lib/timeline'
import { formatTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import styles from './TodayFlow.module.css'

// 「今日の流れ」の帯（SCREENS.md「トップ」の3）。
// 今の生活日の行動を、色分けした横向きの帯で出す。先頭に昨夜の睡眠を薄く出し、1日のスタートの位置に縦線を引く
// onOpenEdit：見出しの右の「修正」を押したときに呼ぶ関数（修正画面に切り替える）
function TodayFlow({ logs, dayStart, onOpenEdit }: { logs: FlowLog[]; dayStart: Date; onOpenEdit: () => void }) {
  // 今の時刻（1秒ごとに新しくなる）。帯の右端は「今」なので、時間がたつと帯が伸びる
  const now = useNow()
  const flow = buildFlow(logs, dayStart, now)

  return (
    <section className={styles.flow} aria-label="今日の流れ">
      {/* ---------- 見出しと「修正」ボタン（左右の端に置く） ---------- */}
      <div className={styles.titleRow}>
        <h2 className={styles.title}>今日の流れ</h2>
        <button type="button" className={styles.editButton} onClick={onOpenEdit}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          修正
        </button>
      </div>

      {/* 「昨夜の睡眠」の文字：帯の左端から1日のスタートまでの幅の、中央に置く */}
      {flow.hasLastNight && (
        <div className={styles.lastNightCaption} style={{ width: `${flow.dayStartPercent}%` }}>
          昨夜の睡眠
        </div>
      )}

      {/* ---------- 帯 ---------- */}
      <div className={styles.barArea}>
        <div className={styles.bar}>
          {flow.segments.map((segment, index) => (
            <div
              key={index}
              className={segment.isLastNight ? `${styles.segment} ${styles.lastNight}` : styles.segment}
              style={{
                left: `${segment.leftPercent}%`,
                width: `${segment.widthPercent}%`,
                background: segment.color,
              }}
            />
          ))}
        </div>
        {/* 1日のスタートの位置の縦線 */}
        <div className={styles.dayStartLine} style={{ left: `${flow.dayStartPercent}%` }} />
      </div>

      {/* ---------- 帯の下の時刻 ---------- */}
      <div className={styles.labels}>
        {flow.hasLastNight && <div className={styles.rangeStartLabel}>{formatTime(flow.rangeStart)}</div>}
        <div
          className={flow.hasLastNight ? styles.dayStartLabel : `${styles.dayStartLabel} ${styles.atLeftEdge}`}
          style={{ left: `${flow.dayStartPercent}%` }}
        >
          <span className={styles.strong}>{formatTime(dayStart)}</span>
          <span>1日のスタート</span>
        </div>
        <div className={styles.nowLabel}>今 {formatTime(now)}</div>
      </div>
    </section>
  )
}

export default TodayFlow
