// DB の範囲の型（tstzrange）の文字列を、開始と終了の Date に直す。
// activity_logs の period は、画面に届くとき次のような文字列になる（DB の時刻は UTC なので「+00」が付く）
//   実行中の記録：    ["2026-09-27 08:13:32.379241+00",)
//   終わった記録：    ["2026-09-27 07:00:00+00","2026-09-27 08:13:32.379241+00")

// 開始と終了。終了が null なら、まだ終わっていない（実行中）
export type TimeRange = {
  start: Date
  end: Date | null
}

// 範囲の文字列を、開始と終了に分けて Date にする
export function parseTimeRange(text: string): TimeRange {
  // 両端の記号（「[」と「)」）を外し、「,」で開始と終了に分ける
  const [startText, endText] = text.slice(1, -1).split(',')
  return {
    start: parseTimestamp(startText),
    // 「,」の後ろが空なら、終了なし（実行中）
    end: endText === '' ? null : parseTimestamp(endText),
  }
}

// "2026-09-27 08:13:32.379241+00"（前後の「"」はあってもよい）を Date にする
function parseTimestamp(text: string): Date {
  const match = text
    .replaceAll('"', '')
    .match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`時刻の形が想定と違います：${text}`)
  }
  const [, date, time, fraction = '', zoneHour, zoneMinute = '00'] = match
  // どのブラウザでも確実に読める形（例：2026-09-27T08:13:32.379+00:00）に並べ直してから、Date にする
  return new Date(`${date}T${time}${fraction.slice(0, 4)}${zoneHour}:${zoneMinute}`)
}
