import { useEffect, useState } from 'react'

// 今の時刻を返し、1秒ごとに新しくするフック（自分で作った use〜 の関数）。
// これを使ったコンポーネントは、1秒ごとに表示し直される（タイマー、1日のスタート確認の時刻などに使う）
export function useNow(): Date {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    // 1秒（1000ミリ秒）ごとに、今の時刻を新しくする
    const intervalId = setInterval(() => setNow(new Date()), 1000)
    // 使っているコンポーネントが画面から消えるときに、くり返しを止める
    return () => clearInterval(intervalId)
  }, [])

  return now
}
