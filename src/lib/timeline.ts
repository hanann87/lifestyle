// 「今日の流れ」の帯の計算（SCREENS.md「トップ」の3、DESIGN.md 5章「昨夜の睡眠の扱い」）。
// 画面を持たない計算だけの関数なので、画面のファイルとは分けておく

// 帯に出す記録1件分
export type FlowLog = {
  start: Date
  end: Date | null // null なら実行中
  color: string
  isSleep: boolean
}

// 帯の中の、色の付いた区間1つ分。位置と幅は、帯の左端から右端までを 100 とした割合（%）
export type FlowSegment = {
  leftPercent: number
  widthPercent: number
  color: string
  isLastNight: boolean // 昨夜の睡眠の部分か（薄く表示する）
}

// 帯を描くのに必要なもの全部
export type Flow = {
  rangeStart: Date // 帯の左端の時刻（昨夜の睡眠の始まり。なければ1日のスタート）
  hasLastNight: boolean // 昨夜の睡眠の部分があるか
  dayStartPercent: number // 1日のスタートの位置（%）
  segments: FlowSegment[]
}

// ---------- 帯を計算する ----------
// logs：前の生活日の始まりから今までの記録（開始の早い順）、dayStart：今の生活日の1日のスタート、now：今の時刻
export function buildFlow(logs: FlowLog[], dayStart: Date, now: Date): Flow {
  // 昨夜の睡眠の始まり。前の生活日の記録（1日のスタートより前に終わったもの）から求める
  const previousDayLogs = logs.filter((log) => log.end !== null && log.end <= dayStart)
  const lastNightStart = findLastNightStart(previousDayLogs)

  const rangeStart = lastNightStart ?? dayStart
  // 帯の長さ（ミリ秒）。0 だと割り算できないので、少なくとも 1 にする
  const totalMs = Math.max(1, now.getTime() - rangeStart.getTime())
  // 時刻を、帯の左端からの割合（%）にする
  const toPercent = (time: Date) => ((time.getTime() - rangeStart.getTime()) / totalMs) * 100

  const segments: FlowSegment[] = []
  for (const log of logs) {
    const logEnd = log.end ?? now // 実行中の記録は、今まで
    // 1つの記録を、1日のスタートより前（昨夜の睡眠の部分）と後（今日の部分）に分けて、帯の範囲に収まる部分だけ足す
    addSegment(segments, maxDate(log.start, rangeStart), minDate(logEnd, dayStart), log.color, true, toPercent)
    addSegment(segments, maxDate(log.start, dayStart), minDate(logEnd, now), log.color, false, toPercent)
  }

  return {
    rangeStart,
    hasLastNight: lastNightStart !== null,
    dayStartPercent: toPercent(dayStart),
    segments,
  }
}

// ---------- 昨夜の睡眠のまとまりの始まりを求める ----------
// 前の生活日の最後からさかのぼり、「睡眠の記録」と「前後を睡眠に挟まれた記録（夜中に起きた間）」を含める。
// どちらでもない記録に当たったら止める（2026-09-27 に本人と決めた案A）。最後の記録が睡眠でなければ null
export function findLastNightStart(previousDayLogs: FlowLog[]): Date | null {
  let index = previousDayLogs.length - 1
  if (index < 0 || !previousDayLogs[index].isSleep) {
    return null
  }

  let start = previousDayLogs[index].start
  index -= 1
  while (index >= 0) {
    const log = previousDayLogs[index]
    // 睡眠の記録は含める。睡眠でない記録は、1つ前も睡眠（＝前後を睡眠に挟まれている）なら含める
    const isSandwiched = index - 1 >= 0 && previousDayLogs[index - 1].isSleep
    if (!log.isSleep && !isSandwiched) {
      break
    }
    start = log.start
    index -= 1
  }
  return start
}

// 開始から終了までの区間を、帯の区間として足す（長さが 0 以下なら足さない）
function addSegment(
  segments: FlowSegment[],
  start: Date,
  end: Date,
  color: string,
  isLastNight: boolean,
  toPercent: (time: Date) => number,
) {
  if (end <= start) {
    return
  }
  segments.push({
    leftPercent: toPercent(start),
    widthPercent: toPercent(end) - toPercent(start),
    color,
    isLastNight,
  })
}

// 2つの時刻の、遅い方・早い方
function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b
}
