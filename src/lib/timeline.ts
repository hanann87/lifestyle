// 「今日の流れ」の帯の計算（SCREENS.md「トップ」の3、DESIGN.md 5章「昨夜の睡眠の扱い」）。
// 画面を持たない計算だけの関数なので、画面のファイルとは分けておく

// 1時間・24時間・6時間の長さ（ミリ秒）
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const TICK_INTERVAL_MS = 6 * HOUR_MS
// 日本時間は、世界の基準の時刻（UTC）より9時間進んでいる（DESIGN.md 4章：タイムゾーンは Asia/Tokyo 固定）
const JST_OFFSET_MS = 9 * HOUR_MS

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
}

// 6時間ごとの目盛り1つ分（時計の 0時・6時・12時・18時の位置）
export type FlowTick = {
  percent: number // 帯の中の位置（%）
  hour: number // 目盛りに書く数。1日のスタートの日の 0時から数えるので、次の日は 24・30… と続く
}

// 帯の下に時刻を出す場所1つ分
export type FlowTime = {
  time: Date
  percent: number // 帯の中の位置（%）
  // switch：行動が切り替わった時刻、lastNightStart：昨夜の睡眠の始まり、dayStart：1日のスタート、now：今
  kind: 'switch' | 'lastNightStart' | 'dayStart' | 'now'
}

// 帯を描くのに必要なもの全部
export type Flow = {
  axisStart: Date // 帯の左端の時刻（昨夜の睡眠の始まり。なければ1日のスタート）
  axisEnd: Date // 帯の右端の時刻（1日のスタートの24時間後。それを過ぎたら今）
  dayStartPercent: number // 1日のスタートの位置（%）
  nowPercent: number // 今の位置（%）。ここまでが色の付く部分
  segments: FlowSegment[]
  ticks: FlowTick[]
  times: FlowTime[] // 左から順
}

// ---------- 帯を計算する ----------
// logs：前の生活日の始まりから今までの記録（開始の早い順）、dayStart：今の生活日の1日のスタート、now：今の時刻
export function buildFlow(logs: FlowLog[], dayStart: Date, now: Date): Flow {
  // 昨夜の睡眠の始まり。前の生活日の記録（1日のスタートより前に終わったもの）から求める
  const previousDayLogs = logs.filter((log) => log.end !== null && log.end <= dayStart)
  const lastNightStart = findLastNightStart(previousDayLogs)

  // 帯の左端と右端。右端は「1日のスタートの24時間後」に固定するので、時間がたっても1時間の幅は変わらない。
  // 24時間を過ぎたら右端を今にする（そこからは、時間がたつほど1時間の幅が狭くなる）
  const axisStart = lastNightStart ?? dayStart
  const axisEnd = maxDate(new Date(dayStart.getTime() + DAY_MS), now)
  const totalMs = axisEnd.getTime() - axisStart.getTime()
  // 時刻を、帯の左端からの割合（%）にする
  const toPercent = (time: Date) => ((time.getTime() - axisStart.getTime()) / totalMs) * 100

  const segments: FlowSegment[] = []
  // 行動が切り替わった時刻（＝帯の中で始まった記録の、開始時刻）
  const switchTimes: Date[] = []
  for (const log of logs) {
    const logEnd = log.end ?? now // 実行中の記録は、今まで
    // 記録の、帯の左端から今までに入る部分だけを区間として足す（今より右は、まだ来ていない時間なので色を付けない）
    addSegment(segments, maxDate(log.start, axisStart), minDate(logEnd, now), log.color, toPercent)
    if (log.start >= axisStart && log.start < now) {
      switchTimes.push(log.start)
    }
  }

  // 1日のスタートは必ず時刻を出すので、切り替わった時刻の中になければ足して、早い順に並べ直す
  if (!switchTimes.some((time) => time.getTime() === dayStart.getTime())) {
    switchTimes.push(dayStart)
    switchTimes.sort((a, b) => a.getTime() - b.getTime())
  }

  // 時刻を出す場所：切り替わった時刻と、最後に今
  // 切り替わった時刻のうち、1日のスタートと同じ時刻のものは dayStart、昨夜の睡眠の始まりと同じ時刻のものは lastNightStart
  const times: FlowTime[] = switchTimes.map((time) => {
    let kind: FlowTime['kind'] = 'switch'
    if (time.getTime() === dayStart.getTime()) {
      kind = 'dayStart'
    } else if (time.getTime() === lastNightStart?.getTime()) {
      kind = 'lastNightStart'
    }
    return { time, percent: toPercent(time), kind }
  })
  times.push({ time: now, percent: toPercent(now), kind: 'now' })

  return {
    axisStart,
    axisEnd,
    dayStartPercent: toPercent(dayStart),
    nowPercent: toPercent(now),
    segments,
    ticks: buildTicks(axisStart, axisEnd, dayStart, toPercent),
    times,
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

// ---------- 6時間ごとの目盛りを求める ----------
// 帯の左端より後・右端より前にある、日本時間の 0時・6時・12時・18時を、左から順に返す
// 目盛りに書く数は、1日のスタートの日の 0時から何時間かにする（次の日の 0時は 24、6時は 30。2026-10-14 に本人と決めた）
function buildTicks(
  axisStart: Date,
  axisEnd: Date,
  dayStart: Date,
  toPercent: (time: Date) => number,
): FlowTick[] {
  // Date の中身は「1970年1月1日 0時（UTC）から何ミリ秒か」の数。9時間ぶん足すと、日本時間の 0時からの数になる。
  // それを6時間で割った商が「6時間のくぎりの何番目か」なので、左端のくぎりの次（+ 1）から始める
  const firstTickIndex = Math.floor((axisStart.getTime() + JST_OFFSET_MS) / TICK_INTERVAL_MS) + 1

  // 1日のスタートの日の 0時（日本時間の 0時からの数）。24時間で割った商に24時間を掛けると、その日の 0時になる
  const baseMidnightJstMs = Math.floor((dayStart.getTime() + JST_OFFSET_MS) / DAY_MS) * DAY_MS

  const ticks: FlowTick[] = []
  for (let tickIndex = firstTickIndex; ; tickIndex += 1) {
    const jstMs = tickIndex * TICK_INTERVAL_MS // 日本時間の 0時からの数
    const time = new Date(jstMs - JST_OFFSET_MS) // 9時間ぶん引いて、Date の数に戻す
    if (time >= axisEnd) {
      break
    }
    // 1日のスタートの日の 0時から何時間か。前の日の目盛り（昨夜の 18時など）はマイナスになるので、24 を足して時計の時刻にする
    const hoursFromBase = (jstMs - baseMidnightJstMs) / HOUR_MS
    ticks.push({ percent: toPercent(time), hour: hoursFromBase < 0 ? hoursFromBase + 24 : hoursFromBase })
  }
  return ticks
}

// ---------- 帯の下の時刻の文字を、重ならないように置く ----------

// 置きたい文字1つ分
export type TimeLabelSize = {
  percent: number // その時刻の、帯の中の位置（%）
  widthPx: number // 文字の幅（px）
  isRequired: boolean // 必ず出すか（1日のスタートと今）
}

// 文字を置く場所。row：何段目か（0 が上の段）、leftPx：文字の左端（帯の左端から何 px か）
export type TimeLabelPlace = {
  row: number
  leftPx: number
}

// すでに文字を置いた範囲（左端と右端。px）
type OccupiedRange = {
  left: number
  right: number
}

// 小数の計算のごくわずかなずれで「重なっている」と判定しないための、ゆとり（px）
const PLACE_TOLERANCE_PX = 0.01

// labels：置きたい文字（左から順）、barWidthPx：帯の幅、gapPx：文字と文字の間に空けるすき間、rowCount：段の数
// 返すのは、labels と同じ並びの配列。置けなかった文字のところは null
//
// 決まり（2026-10-14 に本人と決めた）
// ・文字は、その時刻の位置を真ん中にして置くのが理想。ずらしてよいのは、文字の幅の中にその時刻の位置が入っている範囲まで
// ・必ず出すもの（1日のスタートと今）を先に置き、残りを左から順に置く
// ・どの段に置くかは、ずらす量が少なくて済む段（同じなら上の段）。どの段にも入らないものは出さない
export function placeTimeLabels(
  labels: TimeLabelSize[],
  barWidthPx: number,
  gapPx: number,
  rowCount = 2,
): (TimeLabelPlace | null)[] {
  // 段ごとの、すでに文字を置いた範囲（最初はどの段も空）
  const occupiedByRow: OccupiedRange[][] = Array.from({ length: rowCount }, () => [])
  const places: (TimeLabelPlace | null)[] = labels.map(() => null)

  // 置く順番：必ず出すものの番号を先に、残りの番号をあとに
  const indexes = labels.map((_, index) => index)
  const order = [
    ...indexes.filter((index) => labels[index].isRequired),
    ...indexes.filter((index) => !labels[index].isRequired),
  ]

  for (const index of order) {
    const label = labels[index]
    // その時刻の位置（px）
    const timeX = (label.percent / 100) * barWidthPx
    // 文字の左端を置いてよい範囲：文字の幅の中に時刻の位置が入り、帯の左右からはみ出さない
    const minLeft = Math.max(0, timeX - label.widthPx)
    const maxLeft = Math.max(minLeft, Math.min(timeX, barWidthPx - label.widthPx))
    // 理想の左端：時刻の位置が文字の真ん中に来る場所（範囲の外なら、範囲の端）
    const idealLeft = Math.min(Math.max(timeX - label.widthPx / 2, minLeft), maxLeft)

    // 段ごとに「理想に一番近い、置ける場所」を求め、ずらす量が一番少ない段を選ぶ
    let bestPlace: TimeLabelPlace | null = null
    let bestShift = Infinity
    for (let row = 0; row < rowCount; row += 1) {
      const left = findClosestFreeLeft(occupiedByRow[row], minLeft, maxLeft, idealLeft, label.widthPx, gapPx)
      if (left !== null && Math.abs(left - idealLeft) < bestShift) {
        bestPlace = { row, leftPx: left }
        bestShift = Math.abs(left - idealLeft)
      }
    }

    // 必ず出すものが、どの段にも入らなかったら、重なってもよいので一番下の段の理想の場所に置く
    if (bestPlace === null && label.isRequired) {
      bestPlace = { row: rowCount - 1, leftPx: idealLeft }
    }
    if (bestPlace === null) {
      continue
    }

    occupiedByRow[bestPlace.row].push({ left: bestPlace.leftPx, right: bestPlace.leftPx + label.widthPx })
    places[index] = bestPlace
  }

  return places
}

// 1つの段の中で、理想の左端に一番近い「置ける左端」を返す。置ける場所がなければ null
// 一番近い置ける場所は、「理想の場所」か「すでに置いた文字の、すぐ左・すぐ右」のどれかなので、その中から選ぶ
function findClosestFreeLeft(
  occupied: OccupiedRange[],
  minLeft: number,
  maxLeft: number,
  idealLeft: number,
  widthPx: number,
  gapPx: number,
): number | null {
  const candidates = [
    idealLeft,
    ...occupied.flatMap((range) => [range.left - gapPx - widthPx, range.right + gapPx]),
  ]

  let closest: number | null = null
  for (const left of candidates) {
    // 置いてよい範囲の外なら、置けない
    if (left < minLeft - PLACE_TOLERANCE_PX || left > maxLeft + PLACE_TOLERANCE_PX) {
      continue
    }
    // すでに置いた文字のどれかと、すき間より近ければ、置けない
    const overlaps = occupied.some(
      (range) =>
        left + widthPx + gapPx > range.left + PLACE_TOLERANCE_PX && left < range.right + gapPx - PLACE_TOLERANCE_PX,
    )
    if (overlaps) {
      continue
    }
    if (closest === null || Math.abs(left - idealLeft) < Math.abs(closest - idealLeft)) {
      closest = left
    }
  }
  return closest
}

// 開始から終了までの区間を、帯の区間として足す（長さが 0 以下なら足さない）
function addSegment(
  segments: FlowSegment[],
  start: Date,
  end: Date,
  color: string,
  toPercent: (time: Date) => number,
) {
  if (end <= start) {
    return
  }
  segments.push({
    leftPercent: toPercent(start),
    widthPercent: toPercent(end) - toPercent(start),
    color,
  })
}

// 2つの時刻の、遅い方・早い方
function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}
function minDate(a: Date, b: Date): Date {
  return a < b ? a : b
}
