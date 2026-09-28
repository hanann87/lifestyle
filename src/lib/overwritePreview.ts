// 修正画面の「置き換わる記録の予告」を計算する関数。
// DB 関数 overwrite_activity と同じ決まり（DESIGN.md 7章「上書きの内部処理」）で、上書きしたら記録がどうなるかを、DB に書く前に求める

// 予告の計算に使う記録1件
export type PreviewLog = {
  buttonId: number // どのカテゴリの記録か
  name: string // カテゴリの名前
  color: string // カテゴリの色
  start: Date // 開始
  end: Date | null // 終了。null なら実行中
}

// 時刻の範囲（予告に出す1行分）。end が null なら「今」まで（実行中）
export type TimeSpan = {
  name: string
  color: string
  start: Date
  end: Date | null
}

// 予告の中身
export type OverwritePreview = {
  replaced: TimeSpan[] // 置き換わる記録（時間帯にかかっている部分）
  mergedBefore: TimeSpan | null // すぐ前でつながる同じカテゴリの記録（なければ null）
  mergedAfter: TimeSpan | null // すぐ後でつながる同じカテゴリの記録（なければ null）
}

// 1分（ミリ秒）
const ONE_MINUTE = 60 * 1000

// ---------- 選んだ時刻を、記録の境目に合わせる ----------
// 入力欄は分まで（10:40 → 10:40:00）だが、記録の時刻は秒まである。
// 選んだ「分」の中（10:40:00〜10:40:59）に記録の境目（開始・終了）があれば、その境目の時刻を返す。なければ選んだ時刻のまま
export function snapToLogBoundary(time: Date, logs: PreviewLog[]): Date {
  // すべての記録の開始と終了を、境目として並べる（実行中の記録の終了はないので除く）
  const boundaries: Date[] = []
  for (const log of logs) {
    boundaries.push(log.start)
    if (log.end !== null) {
      boundaries.push(log.end)
    }
  }
  // 選んだ分の中にある境目を探す
  const found = boundaries.find(
    (boundary) =>
      boundary.getTime() >= time.getTime() && boundary.getTime() < time.getTime() + ONE_MINUTE,
  )
  return found ?? time
}

// ---------- 上書きしたら記録がどうなるかを求める ----------
// logs：時間帯のまわりの記録（開始の早い順）、start・end：上書きする時間帯（end が null なら今も続けている）
// categoryId：選んだカテゴリ（まだ選んでいなければ null。そのときは、つながる記録を求めない）
export function buildOverwritePreview(
  logs: PreviewLog[],
  start: Date,
  end: Date | null,
  categoryId: number | null,
): OverwritePreview {
  // 記録が、上書きする時間帯 [start, end) と重なっているか
  const overlaps = (log: PreviewLog) =>
    (log.end === null || log.end > start) && (end === null || log.start < end)

  // 置き換わる記録：時間帯と重なる記録の、重なっている部分だけ
  const replaced = logs.filter(overlaps).map((log) => ({
    name: log.name,
    color: log.color,
    // 重なりの開始：記録の開始と、時間帯の開始の遅いほう
    start: log.start > start ? log.start : start,
    // 重なりの終了：記録の終了と、時間帯の終了の早いほう（どちらも null なら、今まで）
    end: earlierEnd(log.end, end),
  }))

  // すぐ前でつながる記録：選んだカテゴリで、時間帯の開始より前に始まり、開始の時点まで続いている記録
  // （時間帯にかかっている記録でも、開始より前にはみ出した部分は残るので、つながる）
  const before =
    categoryId === null
      ? undefined
      : logs.find(
          (log) =>
            log.buttonId === categoryId && log.start < start && (log.end === null || log.end >= start),
        )

  // すぐ後でつながる記録：選んだカテゴリで、時間帯の終了の時点から、終了より後まで続いている記録
  // （今も続けているなら、後ろはないので求めない）
  const after =
    categoryId === null || end === null
      ? undefined
      : logs.find(
          (log) => log.buttonId === categoryId && log.start <= end && (log.end === null || log.end > end),
        )

  return {
    replaced,
    // つながるのは、時間帯より前にはみ出した部分 [記録の開始, start)
    mergedBefore: before ? { name: before.name, color: before.color, start: before.start, end: start } : null,
    // つながるのは、時間帯より後にはみ出した部分 [end, 記録の終了)
    mergedAfter: after && end ? { name: after.name, color: after.color, start: end, end: after.end } : null,
  }
}

// 2つの終了のうち、早いほう。null は「終わりがない（今まで）」なので、null でないほうを返す
function earlierEnd(a: Date | null, b: Date | null): Date | null {
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  return a < b ? a : b
}
