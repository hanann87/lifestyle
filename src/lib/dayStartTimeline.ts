// 修正画面（1日のスタート）に並べるもの（記録・境目・1日のスタート）を、時刻の順に並べる関数。
// 境目＝記録と記録の間。1日のスタートは、境目の代わりにその場所に出す（DESIGN.md 7章「1日のスタートの修正」）

// 記録1件
export type DayStartLog = {
  id: number // 記録の ID（境目を選ぶときに、DB 関数に渡す）
  name: string // カテゴリの名前
  color: string // カテゴリの色
  start: Date // 開始
  end: Date | null // 終了。null なら実行中
}

// 1日のスタート1件
export type DayStartMark = {
  id: number // 1日のスタートの ID（移動・削除のときに、DB 関数に渡す）
  startedAt: Date // 1日のスタートの時刻
  isFirst: boolean // 一番早い1日のスタートか（移動・削除できない）
}

// 画面に並べるもの1つ分。kind で種類を見分ける
export type DayStartItem =
  | { kind: 'record'; log: DayStartLog } // 記録
  | { kind: 'boundary'; logId: number; time: Date } // 境目（logId の記録の開始）
  | { kind: 'dayStart'; dayStart: DayStartMark } // 1日のスタート

// ---------- 記録・境目・1日のスタートを、時刻の順に並べる ----------
// logs・dayStarts は、どちらも古い順に並んでいること
export function buildDayStartItems(logs: DayStartLog[], dayStarts: DayStartMark[]): DayStartItem[] {
  const items: DayStartItem[] = []
  // 次に並べる1日のスタートの番号
  let dayStartIndex = 0

  logs.forEach((log, logIndex) => {
    // この記録の開始より前にある1日のスタート（上書き修正で、前の記録の途中に来たもの）を、先に並べる
    while (dayStartIndex < dayStarts.length && dayStarts[dayStartIndex].startedAt < log.start) {
      items.push({ kind: 'dayStart', dayStart: dayStarts[dayStartIndex] })
      dayStartIndex++
    }

    // この記録の開始（境目）に1日のスタートがあれば、境目の代わりに1日のスタートを出す
    if (
      dayStartIndex < dayStarts.length &&
      dayStarts[dayStartIndex].startedAt.getTime() === log.start.getTime()
    ) {
      items.push({ kind: 'dayStart', dayStart: dayStarts[dayStartIndex] })
      dayStartIndex++
    } else if (logIndex > 0) {
      // 1日のスタートがなければ、境目を出す（一番上の記録の前は、前の記録を読んでいないので出さない）
      items.push({ kind: 'boundary', logId: log.id, time: log.start })
    }

    items.push({ kind: 'record', log })
  })

  // 残りの1日のスタート（実行中の記録の途中に来たもの）を、最後に並べる
  while (dayStartIndex < dayStarts.length) {
    items.push({ kind: 'dayStart', dayStart: dayStarts[dayStartIndex] })
    dayStartIndex++
  }

  return items
}
