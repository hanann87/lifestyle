import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { parseTimeRange, parseTimestamp } from '../lib/timeRange'
import { formatLifeDayLabel, formatTime, formatTimeSpan, formatTimeWithDate } from '../lib/format'
import { buildDayStartItems } from '../lib/dayStartTimeline'
import type { DayStartLog, DayStartMark } from '../lib/dayStartTimeline'
import EditHeader from '../components/EditHeader'
import type { EditTab } from '../components/EditHeader'
import styles from './EditDayStart.module.css'

// 修正画面（1日のスタート）（SCREENS.md「修正（1日のスタート）」、docs/mockups/EditDayStart.dc.html）
// 新しいほうから3つ目の1日のスタートから今までの記録を時刻の順に並べ、記録と記録の間（境目）と、1日のスタートを出す
// 境目の「ここをスタートに」で追加、青い枠の「削除」で削除、「移動」→ 境目の「ここへ移動」で移動する
// onBack：トップ画面に戻る関数、onSelectTab：上の切り替えを押したときに呼ぶ関数（App が「記録の上書き」の画面に切り替える）
function EditDayStart({ onBack, onSelectTab }: { onBack: () => void; onSelectTab: (tab: EditTab) => void }) {
  // 並べる記録（古い順）。null なら読み込み中
  const [logs, setLogs] = useState<DayStartLog[] | null>(null)
  // 並べる1日のスタート（古い順）
  const [dayStarts, setDayStarts] = useState<DayStartMark[]>([])
  // 追加・削除・移動の通信中か（通信中は、どのボタンも押せなくする）
  const [sending, setSending] = useState(false)
  // 移動先を選んでいる1日のスタートの ID。null なら、移動先を選ぶ状態ではない
  const [movingDayStartId, setMovingDayStartId] = useState<number | null>(null)
  // 失敗したときのメッセージ（空なら何も出さない）
  const [errorMessage, setErrorMessage] = useState('')
  // 今の生活日の1日のスタート（青い枠）の要素。開いたときに、ここまでスクロールするために使う
  const currentDayStartRef = useRef<HTMLDivElement>(null)
  // 開いたときのスクロールを、もう済ませたか（読み直すたびにスクロールしないように）
  const hasScrolledRef = useRef(false)

  // ---------- DB から、1日のスタートと記録を読む ----------
  async function loadDayStartEditData() {
    // 新しい順に3つの1日のスタートと、一番早い1日のスタートを、同時に読む
    const [latestResult, firstResult] = await Promise.all([
      supabase.from('day_starts').select('id, started_at').order('started_at', { ascending: false }).limit(3),
      supabase.from('day_starts').select('id').order('started_at').limit(1).maybeSingle(),
    ])
    if (latestResult.error || firstResult.error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    // 1日のスタートがない（記録が0件）なら、並べるものはない（トップの「修正」ボタンは、記録があるときだけ出る）
    if (latestResult.data.length === 0) {
      setDayStarts([])
      setLogs([])
      return
    }

    // 古い順にして、一番早い1日のスタートに印を付ける
    const marks = latestResult.data
      .map((row) => ({
        id: row.id,
        startedAt: parseTimestamp(row.started_at),
        isFirst: row.id === firstResult.data?.id,
      }))
      .reverse()

    // 3つの中で一番古い1日のスタートから、今までにかかる記録を、古い順に読む
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id, period, buttons(name, color)')
      .overlaps('period', `[${marks[0].startedAt.toISOString()},)`)
      .order('period')

    if (error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    setDayStarts(marks)
    setLogs(
      data.map((log) => {
        const period = parseTimeRange(log.period as string)
        return { id: log.id, name: log.buttons.name, color: log.buttons.color, start: period.start, end: period.end }
      }),
    )
  }

  // ---------- 1日のスタートを直す DB 関数を呼び、できたら読み直す（追加・削除・移動で共通） ----------
  // callDbFunction：DB 関数を呼ぶ関数（supabase.rpc(…) を返す）
  async function editDayStart(callDbFunction: () => PromiseLike<{ error: { code: string; message: string } | null }>) {
    setSending(true)
    setErrorMessage('')

    const { error } = await callDbFunction()

    if (error) {
      // DB 関数が止めたとき（コード P0001）は、DB 関数の日本語のメッセージをそのまま出す。それ以外は通信の失敗として扱う
      setErrorMessage(
        error.code === 'P0001' ? error.message : '直せませんでした。電波の良い場所で再度お試しください',
      )
    } else {
      // できたら読み直して、並びを新しくする
      await loadDayStartEditData()
    }

    setSending(false)
  }

  // ---------- 境目の「ここをスタートに」を押したとき：その境目（記録の開始）に1日のスタートを追加する ----------
  async function handleAddDayStart(logId: number) {
    await editDayStart(() => supabase.rpc('add_day_start', { p_log_id: logId }))
  }

  // ---------- 青い枠の「削除」を押したとき：その1日のスタートを削除する（確認は出さない） ----------
  async function handleDeleteDayStart(dayStartId: number) {
    await editDayStart(() => supabase.rpc('delete_day_start', { p_day_start_id: dayStartId }))
  }

  // ---------- 境目の「ここへ移動」を押したとき：移動先を選ぶ状態を終わらせ、選んでいた1日のスタートをその境目へ動かす ----------
  async function handleMoveDayStart(logId: number) {
    if (movingDayStartId === null) {
      return
    }
    const dayStartId = movingDayStartId
    setMovingDayStartId(null)
    await editDayStart(() => supabase.rpc('move_day_start', { p_day_start_id: dayStartId, p_log_id: logId }))
  }

  // ---------- 画面に出たときに読む ----------
  useEffect(() => {
    async function loadOnOpen() {
      await loadDayStartEditData()
    }
    loadOnOpen()
  }, [])

  // ---------- 読み込めたら一度だけ、今の生活日の1日のスタートが画面の真ん中あたりに来るようにスクロールする ----------
  useEffect(() => {
    if (!hasScrolledRef.current && currentDayStartRef.current !== null) {
      currentDayStartRef.current.scrollIntoView({ block: 'center' })
      hasScrolledRef.current = true
    }
  }, [logs])

  // 今の時刻（記録の時刻の出し方に使う）
  const now = new Date()
  // 並べるもの（記録・境目・1日のスタート）を、時刻の順に
  const items = logs === null ? [] : buildDayStartItems(logs, dayStarts)
  // 今の生活日の1日のスタート（一番新しいもの）の ID
  const currentDayStartId = dayStarts.length > 0 ? dayStarts[dayStarts.length - 1].id : null

  // ---------- 移動先を選んでいるとき、動かせる範囲（すぐ前とすぐ後の1日のスタートの間。DESIGN.md 10章） ----------
  const movingIndex = dayStarts.findIndex((dayStart) => dayStart.id === movingDayStartId)
  // すぐ前・すぐ後の1日のスタートの時刻。読んでいる範囲にない（すぐ前が一番上より前、今の生活日ですぐ後がない）なら null
  const moveAfter = movingIndex > 0 ? dayStarts[movingIndex - 1].startedAt : null
  const moveBefore = movingIndex !== -1 && movingIndex < dayStarts.length - 1 ? dayStarts[movingIndex + 1].startedAt : null
  // その境目へ動かせるか（すぐ前より後で、すぐ後より前）
  function canMoveTo(time: Date): boolean {
    return (moveAfter === null || time > moveAfter) && (moveBefore === null || time < moveBefore)
  }

  return (
    <main className={styles.screen}>
      {/* ---------- 戻る・見出し・「記録の上書き／1日のスタート」の切り替え ---------- */}
      <EditHeader activeTab="editDayStart" onBack={onBack} onSelectTab={onSelectTab} />

      <p className={styles.description}>
        {movingDayStartId === null
          ? '行動と行動の境目を選んで、1日のスタートを移動・追加・削除できます。'
          : '移動先の境目を選んでください。前後の1日のスタートの間にだけ動かせます。'}
      </p>

      {errorMessage !== '' && (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}

      {/* ---------- 記録・境目・1日のスタートの並び（ここだけ縦にスクロールする） ---------- */}
      <div className={styles.list}>
        {items.map((item) => {
          // 記録：色チップ・名前・時刻
          if (item.kind === 'record') {
            return (
              <div key={`record-${item.log.id}`} className={styles.record}>
                <span className={styles.recordChip} style={{ background: item.log.color }} />
                <span className={styles.recordName}>{item.log.name}</span>
                <span className={styles.recordTime}>{formatTimeSpan(item.log.start, item.log.end, now)}</span>
              </div>
            )
          }

          // 境目：移動先を選んでいるときは、動かせる範囲だけ「ここへ移動」。そうでなければ「ここをスタートに」
          if (item.kind === 'boundary') {
            const action = movingDayStartId === null ? 'add' : canMoveTo(item.time) ? 'moveHere' : 'none'
            return (
              <BoundaryRow
                key={`boundary-${item.logId}`}
                timeLabel={formatTimeWithDate(item.time, now)}
                action={action}
                disabled={sending}
                onAdd={() => handleAddDayStart(item.logId)}
                onMoveHere={() => handleMoveDayStart(item.logId)}
              />
            )
          }

          // 1日のスタート：移動先を選んでいるときは、選んでいるものだけ「やめる」。ほかはボタンを出さない
          const mode =
            movingDayStartId === null ? 'normal' : item.dayStart.id === movingDayStartId ? 'moving' : 'locked'
          return (
            <DayStartBox
              key={`dayStart-${item.dayStart.id}`}
              boxRef={item.dayStart.id === currentDayStartId ? currentDayStartRef : undefined}
              dayStart={item.dayStart}
              mode={mode}
              disabled={sending}
              onStartMove={() => setMovingDayStartId(item.dayStart.id)}
              onCancelMove={() => setMovingDayStartId(null)}
              onDelete={() => handleDeleteDayStart(item.dayStart.id)}
            />
          )
        })}
      </div>
    </main>
  )
}

// 境目1つ分：時刻・点線と、ボタン（action：add＝ここをスタートに、moveHere＝ここへ移動、none＝出さない）
function BoundaryRow({
  timeLabel,
  action,
  disabled,
  onAdd,
  onMoveHere,
}: {
  timeLabel: string // 境目の時刻の文字
  action: 'add' | 'moveHere' | 'none'
  disabled: boolean // 通信中で押せないか
  onAdd: () => void // 「ここをスタートに」を押したときに呼ぶ関数
  onMoveHere: () => void // 「ここへ移動」を押したときに呼ぶ関数
}) {
  return (
    <div className={styles.boundary}>
      <span className={styles.boundaryTime}>{timeLabel}</span>
      <span className={styles.boundaryLine} />

      {action === 'add' && (
        <button
          type="button"
          className={styles.addButton}
          aria-label={`${timeLabel} を1日のスタートにする`}
          disabled={disabled}
          onClick={onAdd}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          ここをスタートに
        </button>
      )}

      {action === 'moveHere' && (
        <button
          type="button"
          className={styles.moveHereButton}
          aria-label={`${timeLabel} へ1日のスタートを移動する`}
          disabled={disabled}
          onClick={onMoveHere}
        >
          ここへ移動
        </button>
      )}
    </div>
  )
}

// 1日のスタート1つ分（青い枠）：どの生活日のスタートかと時刻、ボタン
// mode：normal＝「移動」「削除」、moving＝移動先を選んでいるもの（「やめる」）、locked＝ほかのものの移動先を選んでいる（ボタンなし）
// 一番早い1日のスタートは、いつもボタンを出さず、説明の文を出す（DESIGN.md 10章：移動・削除できない）
function DayStartBox({
  boxRef,
  dayStart,
  mode,
  disabled,
  onStartMove,
  onCancelMove,
  onDelete,
}: {
  boxRef: RefObject<HTMLDivElement | null> | undefined // 開いたときのスクロールに使う（今の生活日のものだけ）
  dayStart: DayStartMark
  mode: 'normal' | 'moving' | 'locked'
  disabled: boolean // 通信中で押せないか
  onStartMove: () => void // 「移動」を押したときに呼ぶ関数
  onCancelMove: () => void // 「やめる」を押したときに呼ぶ関数
  onDelete: () => void // 「削除」を押したときに呼ぶ関数
}) {
  return (
    <div ref={boxRef} className={styles.dayStart}>
      <div className={styles.dayStartText}>
        <span className={styles.dayStartCaption}>1日のスタート（{formatLifeDayLabel(dayStart.startedAt)}）</span>
        <span className={styles.dayStartTime}>{formatTime(dayStart.startedAt)}</span>
      </div>

      {dayStart.isFirst && <span className={styles.firstNote}>最初の記録のため、動かせません</span>}

      {!dayStart.isFirst && mode === 'normal' && (
        <div className={styles.dayStartActions}>
          <button type="button" className={styles.moveButton} disabled={disabled} onClick={onStartMove}>
            移動
          </button>
          <button type="button" className={styles.deleteButton} disabled={disabled} onClick={onDelete}>
            削除
          </button>
        </div>
      )}

      {!dayStart.isFirst && mode === 'moving' && (
        <div className={styles.dayStartActions}>
          <button type="button" className={styles.moveButton} disabled={disabled} onClick={onCancelMove}>
            やめる
          </button>
        </div>
      )}
    </div>
  )
}

export default EditDayStart
