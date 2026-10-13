import { useEffect, useRef, useState } from 'react'
import { buildFlow, placeTimeLabels } from '../lib/timeline'
import type { FlowLog } from '../lib/timeline'
import { formatTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import styles from './TodayFlow.module.css'

// 帯の下の時刻の文字の大きさ・1段の高さ・文字と文字の間に空けるすき間（px）
// 文字を置く場所を計算するのに使う。TodayFlow.module.css の .timeLabel と同じ値にしておく
const TIME_FONT_SIZE_PX = 11
const TIME_ROW_HEIGHT_PX = 16
const TIME_LABEL_GAP_PX = 4

// 「今日の流れ」の帯（SCREENS.md「トップ」の3）。
// 今の生活日の行動を、色分けした横向きの帯で出す。帯の全体は「昨夜の睡眠の始まり〜1日のスタートの24時間後」で、
// 今までの部分に色が付く。帯の上に6時間ごとの目盛り、帯の下に切り替わった時刻を2段で出す
// onOpenEdit：見出しの右の「修正」を押したときに呼ぶ関数（修正画面に切り替える）
function TodayFlow({ logs, dayStart, onOpenEdit }: { logs: FlowLog[]; dayStart: Date; onOpenEdit: () => void }) {
  // 今の時刻（1秒ごとに新しくなる）。色の付いた部分の右端と今の時刻の文字が、時間がたつと右へ進む
  const now = useNow()
  const flow = buildFlow(logs, dayStart, now)

  // 帯の幅（px）。時刻の文字を置く場所を px で計算するのに使う。0 の間（まだ測っていない間）は、時刻の文字を出さない
  const [barWidthPx, setBarWidthPx] = useState(0)
  // 帯の要素（幅を測るために、画面の要素そのものを受け取る）
  const barAreaRef = useRef<HTMLDivElement>(null)

  // ---------- 画面に出たときに、帯の幅を測り始める（画面の幅が変わったら、測り直す） ----------
  useEffect(() => {
    const barArea = barAreaRef.current
    if (barArea === null) {
      return
    }
    // ResizeObserver：要素の大きさが変わるたびに、渡した関数を呼ぶ仕組み（見張り始めたときにも1回呼ぶ）
    const observer = new ResizeObserver((entries) => {
      setBarWidthPx(entries[0].contentRect.width)
    })
    observer.observe(barArea)
    // 画面から消えるときに、見張るのをやめる
    return () => observer.disconnect()
  }, [])

  // ---------- 帯の下に出す時刻の文字と、その置き場所 ----------
  // 昨夜の睡眠の始まり・1日のスタート・今は、必ず出す（太字にする）
  const timeLabels = flow.times.map((flowTime) => {
    const text = formatTime(flowTime.time)
    return {
      text,
      percent: flowTime.percent,
      widthPx: estimateTextWidthPx(text),
      isRequired: flowTime.kind !== 'switch',
    }
  })
  // 置き場所（timeLabels と同じ並び。置けなかったものは null）
  const timeLabelPlaces = barWidthPx > 0 ? placeTimeLabels(timeLabels, barWidthPx, TIME_LABEL_GAP_PX) : []

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

      {/* ---------- 帯の上：6時間ごとの目盛りの数字（0・6・12・18・24・30…） ---------- */}
      <div className={styles.ticks} aria-hidden="true">
        {flow.ticks.map((tick) => (
          <span key={tick.percent} className={styles.tickLabel} style={{ left: `${tick.percent}%` }}>
            {tick.hour}
          </span>
        ))}
      </div>

      {/* ---------- 帯 ---------- */}
      <div className={styles.barArea} ref={barAreaRef}>
        <div className={styles.bar}>
          {flow.segments.map((segment, index) => (
            <div
              key={index}
              className={styles.segment}
              style={{
                left: `${segment.leftPercent}%`,
                width: `${segment.widthPercent}%`,
                background: segment.color,
              }}
            />
          ))}
          {/* 6時間ごとの目盛りの線（色の上に重ねる） */}
          {flow.ticks.map((tick) => (
            <div key={tick.percent} className={styles.tickLine} style={{ left: `${tick.percent}%` }} />
          ))}
        </div>
        {/* 1日のスタートの位置の縦線 */}
        <div className={styles.dayStartLine} style={{ left: `${flow.dayStartPercent}%` }} />
      </div>

      {/* ---------- 帯の下：切り替わった時刻（2段。置けなかったものは出さない） ---------- */}
      <div className={styles.times}>
        {timeLabels.map((label, index) => {
          const place = timeLabelPlaces[index]
          if (!place) {
            return null
          }
          return (
            <span
              key={index}
              className={label.isRequired ? `${styles.timeLabel} ${styles.required}` : styles.timeLabel}
              style={{ left: place.leftPx, top: place.row * TIME_ROW_HEIGHT_PX }}
            >
              {label.text}
            </span>
          )
        })}
      </div>
    </section>
  )
}

// 文字の幅（px）を見積もる。時刻の文字は等幅のフォント（IBM Plex Mono）で出していて、
// 半角の文字（数字・「:」）は文字の大きさの 0.6 倍、全角の文字（日本語）は文字の大きさと同じ幅になる
function estimateTextWidthPx(text: string): number {
  let widthPx = 0
  for (const character of text) {
    // 文字の番号（文字コード）が 128 より小さいものが、半角の英数字・記号
    const isHalfWidth = character.charCodeAt(0) < 128
    widthPx += isHalfWidth ? TIME_FONT_SIZE_PX * 0.6 : TIME_FONT_SIZE_PX
  }
  return widthPx
}

export default TodayFlow
