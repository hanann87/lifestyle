import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseTimeRange } from '../lib/timeRange'
import { formatDuration, formatTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import CategoryAddSheet from '../components/CategoryAddSheet'
import DayStartSheet from '../components/DayStartSheet'
import styles from './Top.module.css'

// いま実行中の記録（カードに出すもの）
type CurrentActivity = {
  buttonId: number // どのボタンの記録か（実行中のボタンを塗りつぶすのに使う）
  name: string // カテゴリの名前
  color: string // カテゴリの色
  isSleep: boolean // 睡眠ボタンの記録か（睡眠中に別のボタンを押したら、1日のスタート確認を出す）
  start: Date // 開始時刻
}

// カテゴリボタン1つ分
type CategoryButton = {
  id: number
  name: string
  color: string
}

// トップ画面（SCREENS.md「トップ」、docs/mockups/Main.dc.html）
// 今は「いま記録中のカード」と「カテゴリボタン」。ほかの部分は、実装2の続きで足していく
function Top() {
  // 実行中の記録。undefined：読み込み中、null：記録が1件もない、CurrentActivity：実行中の記録
  const [current, setCurrent] = useState<CurrentActivity | null | undefined>(undefined)
  // カテゴリボタンの一覧（並び順どおり）
  const [buttons, setButtons] = useState<CategoryButton[]>([])
  // 失敗したときのメッセージ（空なら何も出さない）
  const [errorMessage, setErrorMessage] = useState('')
  // 記録している途中のボタンの ID。null なら、記録中の通信はない
  const [pressingButtonId, setPressingButtonId] = useState<number | null>(null)
  // カテゴリを追加するボトムシートを開いているか
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  // 1日のスタート確認で、答えを待っているボタン。null なら確認を出していない
  const [dayStartTarget, setDayStartTarget] = useState<CategoryButton | null>(null)

  // ---------- DB から、実行中の記録を読む ----------
  async function loadCurrentActivity() {
    // 自分の記録を、開始時刻の新しい順に並べて1件だけ読む（実行中の記録は、いつも一番新しい記録）
    // buttons(name, color, is_sleep)：記録のボタンの名前・色・睡眠ボタンかも、一緒に読む
    const { data, error } = await supabase
      .from('activity_logs')
      .select('period, button_id, buttons(name, color, is_sleep)')
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    if (data === null) {
      setCurrent(null)
      return
    }

    // period は範囲の型なので、型のファイルでは unknown（型が分からない）になっている。届くのは文字列なので、string として扱う
    const range = parseTimeRange(data.period as string)
    setCurrent({
      buttonId: data.button_id,
      name: data.buttons.name,
      color: data.buttons.color,
      isSleep: data.buttons.is_sleep,
      start: range.start,
    })
  }

  // ---------- DB から、カテゴリボタンの一覧を読む ----------
  async function loadButtons() {
    // 非表示（アーカイブ）にしていないボタンを、並び順どおりに読む
    const { data, error } = await supabase
      .from('buttons')
      .select('id, name, color')
      .is('archived_at', null)
      .order('display_order')

    if (error) {
      setErrorMessage('読み込めませんでした。電波の良い場所で再度お試しください')
      return
    }
    setButtons(data)
  }

  // ---------- カテゴリボタンを押したとき：睡眠中なら1日のスタート確認を出し、そうでなければすぐ記録する ----------
  async function handleButtonPress(button: CategoryButton) {
    // 前に押したボタンの記録が終わるまでは、次を受け付けない（二重に記録しないため）
    if (pressingButtonId !== null) {
      return
    }

    // 睡眠の記録中に、別のボタンを押したら、すぐには記録せず確認を出す（DESIGN.md 5章「1日のスタートの決め方」）
    if (current?.isSleep && current.buttonId !== button.id) {
      setDayStartTarget(button)
      return
    }

    await recordActivity(button.id, false)
  }

  // ---------- 1日のスタート確認に答えたとき：確認を閉じて、答えに合わせて記録する ----------
  async function handleDayStartAnswer(startDay: boolean) {
    if (dayStartTarget === null) {
      return
    }
    const buttonId = dayStartTarget.id
    setDayStartTarget(null)
    await recordActivity(buttonId, startDay)
  }

  // ---------- DB に記録して、カードを新しくする ----------
  // startDay：1日をスタートするか（1日のスタート確認で「はい」を選んだときだけ true）
  async function recordActivity(buttonId: number, startDay: boolean) {
    setPressingButtonId(buttonId)
    setErrorMessage('')

    // 行動を切り替える DB 関数を呼ぶ（実行中と同じボタンなら、DB 関数が何もしない）
    const { error } = await supabase.rpc('switch_activity', {
      p_button_id: buttonId,
      p_start_day: startDay,
    })

    if (error) {
      setErrorMessage('記録できませんでした。電波の良い場所で再度お試しください')
    } else {
      // 記録できたら、実行中の記録を読み直して、カードとボタンの塗りつぶしを新しくする
      await loadCurrentActivity()
    }

    setPressingButtonId(null)
  }

  // ---------- カテゴリを追加できたとき：シートを閉じて、ボタンの一覧を読み直す ----------
  async function handleCategoryAdded() {
    setIsAddSheetOpen(false)
    await loadButtons()
  }

  // ---------- 画面に出たときに、実行中の記録とボタンの一覧を読む ----------
  useEffect(() => {
    // 2つの読み込みを同時に始めて、両方が終わるまで待つ
    async function loadTopScreenData() {
      await Promise.all([loadCurrentActivity(), loadButtons()])
    }
    loadTopScreenData()
  }, [])

  return (
    <main className={styles.screen}>
      {/* ---------- いま記録中のカード ---------- */}
      <section className={styles.card} aria-label="いま記録中">
        {errorMessage !== '' && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}

        {current === null && (
          <>
            <p className={styles.emptyTitle}>まだ記録がありません</p>
            <p className={styles.emptyNote}>下のボタンを押すと記録が始まります</p>
          </>
        )}

        {current && (
          <>
            <div className={styles.label}>
              <span className={styles.dot} style={{ background: current.color }} />
              いま記録中
            </div>
            <div className={styles.row}>
              <div className={styles.name}>{current.name}</div>
              <div className={styles.since}>{formatTime(current.start)}から</div>
            </div>
            <Timer start={current.start} />
          </>
        )}
      </section>

      {/* ---------- カテゴリボタン（2列。このエリアだけ縦にスクロールする） ---------- */}
      <div className={styles.buttonGrid}>
        {buttons.map((button) => (
          <CategoryButtonView
            key={button.id}
            button={button}
            isRunning={current?.buttonId === button.id}
            isPressing={pressingButtonId === button.id}
            disabled={pressingButtonId !== null}
            onPress={() => handleButtonPress(button)}
          />
        ))}

        {/* 「＋ 追加」：カテゴリを追加するボトムシートを開く */}
        <button type="button" className={styles.addButton} onClick={() => setIsAddSheetOpen(true)}>
          <svg
            width="18"
            height="18"
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
          追加
        </button>
      </div>

      {/* ---------- カテゴリを追加するボトムシート（開いているときだけ出す） ---------- */}
      {isAddSheetOpen && (
        <CategoryAddSheet
          usedColors={buttons.map((button) => button.color)}
          onClose={() => setIsAddSheetOpen(false)}
          onAdded={handleCategoryAdded}
        />
      )}

      {/* ---------- 1日のスタート確認のボトムシート（睡眠中に別のボタンを押したときだけ出す） ---------- */}
      {dayStartTarget && current && (
        <DayStartSheet
          sleepName={current.name}
          sleepColor={current.color}
          sleepStart={current.start}
          nextName={dayStartTarget.name}
          onAnswer={handleDayStartAnswer}
        />
      )}
    </main>
  )
}

// カテゴリボタン1つ分。実行中のボタンはカテゴリの色で塗りつぶし、文字を白にする（SCREENS.md「トップ」の4）
// 記録している途中のボタンは薄くする。記録の通信中は、どのボタンも押せなくする
function CategoryButtonView({
  button,
  isRunning,
  isPressing,
  disabled,
  onPress,
}: {
  button: CategoryButton
  isRunning: boolean // 実行中のボタンか
  isPressing: boolean // 記録している途中のボタンか
  disabled: boolean // 押せなくするか
  onPress: () => void // 押したときに呼ぶ関数
}) {
  // 付けるクラス：いつも categoryButton。実行中なら running、記録している途中なら pressing も付ける
  const classNames = [styles.categoryButton]
  if (isRunning) {
    classNames.push(styles.running)
  }
  if (isPressing) {
    classNames.push(styles.pressing)
  }

  return (
    <button
      type="button"
      className={classNames.join(' ')}
      style={isRunning ? { background: button.color, borderColor: button.color } : undefined}
      aria-pressed={isRunning}
      disabled={disabled}
      onClick={onPress}
    >
      <span
        className={styles.chip}
        style={{ background: isRunning ? 'var(--color-surface)' : button.color }}
      />
      {button.name}
    </button>
  )
}

// 経過時間のタイマー（SCREENS.md「トップ」の2：時:分:秒）
// 1秒ごとに「今 − 開始時刻」を計算し直す。1秒ずつ足していくのではないので、アプリを閉じていても正しく進む（DESIGN.md 3章）
function Timer({ start }: { start: Date }) {
  // 今の時刻（1秒ごとに新しくなる）
  const now = useNow()

  return <div className={styles.timer}>{formatDuration(now.getTime() - start.getTime())}</div>
}

export default Top
