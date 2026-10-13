// 今の生活日を DB から読む関数（トップ画面と修正画面の「今日の流れ」の帯で使う）。
// 2つの画面で同じものを読むので、画面のファイルとは分けておく

import { supabase } from './supabase'
import { parseTimeRange, parseTimestamp } from './timeRange'
import type { FlowLog } from './timeline'

// 読んだ結果
export type LifeDayFlow = {
  dayStart: Date | null // 今の生活日の、1日のスタートの時刻。null なら、1日のスタートがまだない（記録が0件）
  logs: FlowLog[] // 帯に出す記録（前の生活日の始まりから今まで。開始の早い順）
}

// ---------- DB から、今の生活日（1日のスタートと、帯に出す記録）を読む ----------
// 読めなかったら null を返す（メッセージを出すのは、呼んだ画面の側）
export async function loadLifeDayFlow(): Promise<LifeDayFlow | null> {
  // 自分の1日のスタートを、新しい順に2件読む（1件目：今の生活日の始まり、2件目：前の生活日の始まり）
  const { data: dayStarts, error: dayStartsError } = await supabase
    .from('day_starts')
    .select('started_at')
    .order('started_at', { ascending: false })
    .limit(2)

  if (dayStartsError) {
    return null
  }
  if (dayStarts.length === 0) {
    // 1日のスタートがまだない（記録が0件）
    return { dayStart: null, logs: [] }
  }

  const currentDayStart = parseTimestamp(dayStarts[0].started_at)
  // 帯には昨夜の睡眠も出すので、前の生活日の始まりから読む（前の生活日がなければ、今の生活日の始まりから）
  const readFrom = dayStarts.length === 2 ? parseTimestamp(dayStarts[1].started_at) : currentDayStart

  // その時刻より後にかかる記録を、開始の早い順に読む。overlaps：範囲 [readFrom, ) と重なる記録だけ
  const { data: logs, error: logsError } = await supabase
    .from('activity_logs')
    .select('period, buttons(color, is_sleep)')
    .overlaps('period', `[${readFrom.toISOString()},)`)
    .order('period')

  if (logsError) {
    return null
  }

  return {
    dayStart: currentDayStart,
    logs: logs.map((log) => {
      // period は範囲の型なので、型のファイルでは unknown（型が分からない）になっている。届くのは文字列なので、string として扱う
      const range = parseTimeRange(log.period as string)
      return {
        start: range.start,
        end: range.end,
        color: log.buttons.color,
        isSleep: log.buttons.is_sleep,
      }
    }),
  }
}
