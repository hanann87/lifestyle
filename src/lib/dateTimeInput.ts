// 日時の入力欄（<input type="datetime-local">）の値と、Date を行き来する関数。
// 入力欄の値は「2026-09-28T10:40」の形の文字（タイムゾーンなし）。このアプリでは、いつも日本時間として扱う
// （DESIGN.md 4章「時刻の扱い」：タイムゾーンは Asia/Tokyo 固定。端末の設定が日本時間でなくても同じ時刻になる）

// Date を、入力欄の値（日本時間の「年-月-日T時:分」）にする。秒は切り捨てる
export function toDateTimeInputValue(date: Date): string {
  // 年・月・日・時・分を、日本時間で2桁（年は4桁）にして別々に取り出す
  const parts = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // 時を 0〜23 で出す（24時ではなく0時にする）
    timeZone: 'Asia/Tokyo',
  }).formatToParts(date)
  // 取り出した中から、指定した種類（year・month など）の値を探す
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

// 入力欄の値（「2026-09-28T10:40」）を、日本時間のその時刻（0秒）の Date にする。空なら null
export function fromDateTimeInputValue(value: string): Date | null {
  if (value === '') {
    return null
  }
  // 秒（:00）と、日本時間であること（+09:00）を足して、ブラウザが確実に読める ISO 8601 の形にする
  return new Date(`${value}:00+09:00`)
}
