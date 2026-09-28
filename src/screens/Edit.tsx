import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseTimeRange } from '../lib/timeRange'
import { fromDateTimeInputValue, toDateTimeInputValue } from '../lib/dateTimeInput'
import { formatTimeSpan, formatTimeWithDate } from '../lib/format'
import { buildOverwritePreview, snapToLogBoundary } from '../lib/overwritePreview'
import type { PreviewLog, TimeSpan } from '../lib/overwritePreview'
import CategoryButton from '../components/CategoryButton'
import EditHeader from '../components/EditHeader'
import type { EditTab } from '../components/EditHeader'
import styles from './Edit.module.css'

// カテゴリ1つ分（選ぶボタンに出すもの）
type Category = {
  id: number
  name: string
  color: string
}

// 終了の選び方。past：過去の時刻で終わる、ongoing：今も続けている
type EndKind = 'past' | 'ongoing'

// 入力欄で選んだ時間帯（分まで）。end が null なら今も続けている
type SelectedRange = {
  start: Date
  end: Date | null
}

// 1分（ミリ秒）
const ONE_MINUTE = 60 * 1000

// 修正画面（記録の上書き）（SCREENS.md「修正（記録の上書き）」、docs/mockups/Edit.dc.html）
// カテゴリ・開始・終了を選び、置き換わる記録を確かめて、「この時間帯を上書きする」で DB 関数 overwrite_activity を呼ぶ
// onBack：トップ画面に戻る関数（App がトップ画面に切り替える）。左上の「戻る」と、上書きできたときに呼ぶ
// onSelectTab：上の切り替えを押したときに呼ぶ関数（App が「1日のスタート」の画面に切り替える）
function Edit({ onBack, onSelectTab }: { onBack: () => void; onSelectTab: (tab: EditTab) => void }) {
  // 選べるカテゴリの一覧（並び順どおり）
  const [categories, setCategories] = useState<Category[]>([])
  // 選んでいるカテゴリの ID。null ならまだ選んでいない（開いたときは何も選ばない）
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  // 開始の入力欄の値（「2026-09-28T10:40」の形）。最初は、いま記録中の行動の開始時刻を入れる
  const [startValue, setStartValue] = useState('')
  // 終了の選び方。最初は「今も続けている」
  const [endKind, setEndKind] = useState<EndKind>('ongoing')
  // 終了の入力欄の値。「過去の時刻」を選んだときだけ使う
  const [endValue, setEndValue] = useState('')
  // 予告の計算に使う、選んだ時間帯のまわりの記録。null なら、時間帯を選べていない（予告を出さない）
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[] | null>(null)
  // 上書きの通信中か（通信中はボタンを押せなくする）
  const [sending, setSending] = useState(false)
  // 失敗したときのメッセージ（空なら何も出さない）
  const [errorMessage, setErrorMessage] = useState('')

  // ---------- DB から、カテゴリの一覧を読む ----------
  async function loadCategories() {
    // 非表示（アーカイブ）にしていないボタンを、並び順どおりに読む（トップのカテゴリボタンと同じ）
    const { data, error } = await supabase
      .from('buttons')
      .select('id, name, color')
      .is('archived_at', null)
      .order('display_order')

    if (error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    setCategories(data)
  }

  // ---------- DB から、いま記録中の行動の開始時刻を読み、開始の最初の値にする ----------
  async function loadRunningStart() {
    // 自分の記録を、開始時刻の新しい順に並べて1件だけ読む（実行中の記録は、いつも一番新しい記録）
    const { data, error } = await supabase
      .from('activity_logs')
      .select('period')
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    // 記録が1件もなければ、開始は空のまま（トップの「修正」ボタンは、記録があるときだけ出る）
    if (data !== null) {
      setStartValue(toDateTimeInputValue(parseTimeRange(data.period as string).start))
    }
  }

  // ---------- 終了の選び方を変えたとき：「過去の時刻」に初めて切り替えたら、終了に今の時刻を入れておく ----------
  function handleEndKindChange(kind: EndKind) {
    setEndKind(kind)
    if (kind === 'past' && endValue === '') {
      setEndValue(toDateTimeInputValue(new Date()))
    }
  }

  // ---------- 画面に出たときに、カテゴリの一覧と、いま記録中の行動の開始時刻を読む ----------
  useEffect(() => {
    // 2つの読み込みを同時に始めて、両方が終わるまで待つ
    async function loadEditScreenData() {
      await Promise.all([loadCategories(), loadRunningStart()])
    }
    loadEditScreenData()
  }, [])

  // ---------- 開始・終了を変えるたびに、選んだ時間帯のまわりの記録を読む（予告に使う） ----------
  useEffect(() => {
    // 先に始めた読み込みの結果が、あとから届いても使わないための印（この useEffect が片付けられたら true にする）
    let ignore = false

    async function loadPreviewLogs() {
      const range = toSelectedRange(startValue, endKind, endValue)
      if (range === null) {
        setPreviewLogs(null)
        return
      }

      // 時間帯より1分広く読む。すぐ前・すぐ後につながる記録と、選んだ分の中の境目も、予告に使うため
      const from = new Date(range.start.getTime() - ONE_MINUTE).toISOString()
      const to = range.end === null ? '' : new Date(range.end.getTime() + ONE_MINUTE).toISOString()
      // overlaps：範囲 [from, to] と重なる記録だけ（to が空なら、from から先のすべて）
      const { data, error } = await supabase
        .from('activity_logs')
        .select('period, button_id, buttons(name, color)')
        .overlaps('period', range.end === null ? `[${from},)` : `[${from},${to}]`)
        .order('period')

      if (ignore) {
        return
      }
      if (error) {
        setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
        return
      }
      setPreviewLogs(
        data.map((log) => {
          const period = parseTimeRange(log.period as string)
          return {
            buttonId: log.button_id,
            name: log.buttons.name,
            color: log.buttons.color,
            start: period.start,
            end: period.end,
          }
        }),
      )
    }
    loadPreviewLogs()

    // 開始・終了がまた変わったら（または画面から消えたら）、この回の読み込みの結果は使わない
    return () => {
      ignore = true
    }
  }, [startValue, endKind, endValue])

  // 今の時刻。入力欄で選べる一番遅い日時（未来の時刻は、予定として登録するもの。DESIGN.md 7章）と、予告の時刻の出し方に使う
  const now = new Date()
  const maxValue = toDateTimeInputValue(now)

  // ---------- 予告を計算する（DB には書かない） ----------
  const selectedRange = toSelectedRange(startValue, endKind, endValue)
  // 上書きする時間帯：選んだ時刻を、記録の境目に合わせたもの（上書きするときも、この時刻を使う）
  const overwriteRange =
    selectedRange !== null && previewLogs !== null
      ? {
          start: snapToLogBoundary(selectedRange.start, previewLogs),
          end: selectedRange.end === null ? null : snapToLogBoundary(selectedRange.end, previewLogs),
        }
      : null
  // 上書きしたら記録がどうなるか
  const preview =
    overwriteRange !== null && previewLogs !== null
      ? buildOverwritePreview(previewLogs, overwriteRange.start, overwriteRange.end, selectedCategoryId)
      : null
  // 選んでいるカテゴリ（まだ選んでいなければ undefined）
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId)

  // ---------- 「この時間帯を上書きする」を押したとき：選んだものを確かめて、DB 関数で上書きし、トップに戻る ----------
  async function handleOverwrite() {
    // 足りないものがあれば、通信せずにメッセージを出す
    if (selectedCategoryId === null) {
      setErrorMessage('何をしていたか（カテゴリ）を選んでください')
      return
    }
    if (startValue === '' || (endKind === 'past' && endValue === '')) {
      setErrorMessage('開始と終了の日時を選んでください')
      return
    }
    if (selectedRange === null) {
      setErrorMessage('終了は開始より後の時刻にしてください')
      return
    }
    // まわりの記録をまだ読み込んでいる途中（境目に合わせた時刻がまだない）なら、何もしない
    if (overwriteRange === null) {
      return
    }

    setSending(true)
    setErrorMessage('')

    // 記録を上書きする DB 関数を呼ぶ。時刻は、境目に合わせたもの（予告と同じ）
    // 「今も続けている」なら終了は undefined になり、送られない（DB 関数では null＝今も続けている）
    const { error } = await supabase.rpc('overwrite_activity', {
      p_button_id: selectedCategoryId,
      p_start: overwriteRange.start.toISOString(),
      p_end: overwriteRange.end?.toISOString(),
    })

    if (error) {
      setSending(false)
      // DB 関数が止めたとき（時刻が合わないなど。コード P0001）は、DB 関数の日本語のメッセージをそのまま出す。それ以外は通信の失敗として扱う
      setErrorMessage(
        error.code === 'P0001' ? error.message : '上書きできませんでした。電波の良い場所で再度お試しください',
      )
      return
    }

    // 上書きできたら、トップに戻る（トップは作り直されるので、新しい記録を読み直す）
    onBack()
  }

  return (
    <main className={styles.screen}>
      {/* ---------- 戻る・見出し・「記録の上書き／1日のスタート」の切り替え ---------- */}
      <EditHeader activeTab="editOverwrite" onBack={onBack} onSelectTab={onSelectTab} />

      {/* ---------- 入力する部分（はみ出す分は、ここだけ縦にスクロールする） ---------- */}
      <div className={styles.body}>
        {/* ---------- カテゴリを選ぶ（トップと同じ2列・同じボタン） ---------- */}
        <section className={styles.field}>
          <h2 className={styles.fieldTitle}>この時間帯は何をしていた？</h2>
          <div className={styles.categoryGrid}>
            {categories.map((category) => (
              <CategoryButton
                key={category.id}
                name={category.name}
                color={category.color}
                isActive={selectedCategoryId === category.id}
                onPress={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </div>
        </section>

        {/* ---------- 開始（日時の入力欄。押すと OS の選ぶ画面が出る） ---------- */}
        <label className={styles.field}>
          <span className={styles.fieldTitle}>開始</span>
          <input
            type="datetime-local"
            className={styles.dateTimeInput}
            value={startValue}
            max={maxValue}
            onChange={(event) => setStartValue(event.target.value)}
          />
        </label>

        {/* ---------- 終了（「過去の時刻」か「今も続けている」を選ぶ） ---------- */}
        <fieldset className={styles.endFieldset}>
          <legend className={styles.fieldTitle}>終了</legend>

          <label className={endKind === 'past' ? `${styles.endOption} ${styles.endOptionSelected}` : styles.endOption}>
            <input
              type="radio"
              name="endKind"
              className={styles.radio}
              checked={endKind === 'past'}
              onChange={() => handleEndKindChange('past')}
            />
            過去の時刻
          </label>
          {/* 「過去の時刻」を選んでいるときだけ、終了の日時の入力欄を出す */}
          {endKind === 'past' && (
            <input
              type="datetime-local"
              className={styles.dateTimeInput}
              aria-label="終了の日時"
              value={endValue}
              max={maxValue}
              onChange={(event) => setEndValue(event.target.value)}
            />
          )}

          <label
            className={endKind === 'ongoing' ? `${styles.endOption} ${styles.endOptionSelected}` : styles.endOption}
          >
            <input
              type="radio"
              name="endKind"
              className={styles.radio}
              checked={endKind === 'ongoing'}
              onChange={() => handleEndKindChange('ongoing')}
            />
            今も続けている
          </label>
        </fieldset>

        {/* ---------- 置き換わる記録の予告（時間帯にかかる記録があるときだけ出す） ---------- */}
        {preview !== null && preview.replaced.length > 0 && (
          <section className={styles.notice} aria-label="置き換わる記録">
            <h2 className={styles.noticeTitle}>この時間帯の記録は置き換わります</h2>
            {preview.replaced.map((span) => (
              <div key={span.start.getTime()} className={styles.noticeRow}>
                <span className={styles.noticeChip} style={{ background: span.color }} />
                {span.name}
                <span className={styles.noticeTime}>{formatTimeSpan(span.start, span.end, now)}</span>
              </div>
            ))}

            {/* 上書きしたあとの記録（カテゴリを選んでいるときだけ） */}
            {selectedCategory && overwriteRange && (
              <p className={styles.noticeResult}>
                → {selectedCategory.name} {formatTimeWithDate(overwriteRange.start, now)}–
                {overwriteRange.end ? formatTimeWithDate(overwriteRange.end, now) : '（今も続けている）'}
                {mergeNote(preview.mergedBefore, preview.mergedAfter, now)}
              </p>
            )}
          </section>
        )}
      </div>

      {/* ---------- 画面の下に固定：失敗したときのメッセージと、上書きするボタン ---------- */}
      <div className={styles.footer}>
        {errorMessage !== '' && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}
        <button type="button" className={styles.submitButton} disabled={sending} onClick={handleOverwrite}>
          {sending ? '上書き中…' : 'この時間帯を上書きする'}
        </button>
      </div>
    </main>
  )
}

// 入力欄の値から、選んだ時間帯（分まで）を作る。まだ選べていない・終了が開始より前なら null
function toSelectedRange(startValue: string, endKind: EndKind, endValue: string): SelectedRange | null {
  const start = fromDateTimeInputValue(startValue)
  if (start === null) {
    return null
  }
  if (endKind === 'ongoing') {
    return { start, end: null }
  }
  const end = fromDateTimeInputValue(endValue)
  if (end === null || end <= start) {
    return null
  }
  return { start, end }
}

// 同じカテゴリとつながるときの説明（例：（直前の研究 08:10–10:40 とつながり、1つの記録になります））。つながらなければ空
function mergeNote(before: TimeSpan | null, after: TimeSpan | null, now: Date): string {
  const parts: string[] = []
  if (before) {
    parts.push(`直前の${before.name} ${formatTimeSpan(before.start, before.end, now)}`)
  }
  if (after) {
    parts.push(`直後の${after.name} ${formatTimeSpan(after.start, after.end, now)}`)
  }
  if (parts.length === 0) {
    return ''
  }
  return `（${parts.join('・')} とつながり、1つの記録になります）`
}

export default Edit
