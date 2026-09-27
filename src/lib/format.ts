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
