// 画面に出す文字の形をそろえる関数。
// 時刻は、端末の設定に関係なく日本時間で出す（DESIGN.md 4章「時刻の扱い」：タイムゾーンは Asia/Tokyo 固定）

// Date を「時:分」（例：07:10、14:02）の文字にする
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
}

// Date を、日本時間の「月日（曜日）」（例：9月25日（金））の文字にする。生活日の名前に使う（DESIGN.md 5章）
export function formatLifeDayLabel(date: Date): string {
  // 月・日・曜日を別々に取り出す（そのまま文字にすると、カッコが半角の「9月25日(金)」になるため）
  const parts = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).formatToParts(date)
  // 取り出した中から、指定した種類（month・day・weekday）の値を探す
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('month')}月${pick('day')}日（${pick('weekday')}）`
}

// Date を、今日（日本時間）なら「10:40」、それ以外なら「9/27 23:10」の文字にする。修正画面の予告に使う
export function formatTimeWithDate(date: Date, now: Date): string {
  // 日本時間の「月/日」（例：9/27）
  const toMonthDay = (d: Date) =>
    d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
  // 今日と同じ日付なら、時刻だけ
  if (toMonthDay(date) === toMonthDay(now)) {
    return formatTime(date)
  }
  return `${toMonthDay(date)} ${formatTime(date)}`
}

// ミリ秒の長さを「時:分:秒」（例：02:24:13）の文字にする。24時間を超えても、時をそのまま数える（例：26:00:00）
export function formatDuration(milliseconds: number): string {
  // 端末の時計が DB の時計より少し遅れていると、マイナスになることがあるので、0 より小さければ 0 にする
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  // それぞれ2桁にして（7 → "07"）、「:」でつなぐ
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}
