"use client"

import { useState } from "react"
import { Trophy, Gift, MessageCircle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { QuizWord } from "./word-quiz"

const DAD_PHONE = "01032854101"

interface Props {
  score: number
  correctCount: number
  total: number
  bestStreak: number
  wrongWords: QuizWord[]
  accent: string
  onRetryWrong: () => void
  onRetryAll: () => void
}

export function QuizResult({ score, correctCount, total, bestStreak, wrongWords, accent, onRetryWrong, onRetryAll }: Props) {
  const [drawnCoupon, setDrawnCoupon] = useState<string | null>(null)

  function handleDrawCoupon() {
    const rand = Math.random() * 100
    if (rand < 20) {
      const penalties = ["💥 꽝! (벌칙: 아빠 볼에 뽀뽀 3번 하기 😘)", "💥 꽝! (벌칙: 아빠한테 하트 날리며 사랑해요 외치기 🫶)", "💥 꽝! (벌칙: 아빠 어깨 1분 주물러주기 💆‍♂️)"]
      setDrawnCoupon(penalties[Math.floor(Math.random() * penalties.length)])
    } else if (rand < 35) { setDrawnCoupon("아빠의 엉덩이 춤 관람권 🕺")
    } else if (rand < 55) { setDrawnCoupon("인간 놀이기구 탑승권 ✈️")
    } else if (rand < 80) { setDrawnCoupon("침대까지 어부바 특급열차 🚂")
    } else { setDrawnCoupon("아빠의 특급 안마 3분 💆‍♀️") }
  }

  return (
    <div className="flex flex-col px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex size-16 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}><Trophy className="size-8" /></div>
        <h2 className="text-2xl font-black text-foreground">학습 완료!</h2>
      </div>
      <div className="mb-6 rounded-2xl bg-muted/50 p-6 text-center">
        <p className="mb-1 text-xs font-medium text-muted-foreground">최종 점수</p>
        <p className="text-5xl font-black" style={{ color: accent }}>{score}점</p>
        <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
          <span>정답 <span className="font-bold text-foreground">{correctCount}</span>/{total}</span>
          <span>최고 연속 <span className="font-bold text-foreground">{bestStreak}</span></span>
        </div>
        
        {score === 100 && (
          <div className="mt-6 pt-6 border-t border-border">
            {total >= 10 ? (
              !drawnCoupon ? (
                <button onClick={handleDrawCoupon} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-base font-black text-white shadow-lg transition-transform hover:scale-105 active:scale-95">
                  <Gift className="size-5 animate-bounce" /> 100점 달성! 보상 뽑기
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-500 bg-amber-100 p-5 animate-in zoom-in duration-500">
                  <span className="mb-1.5 text-xs font-bold text-amber-700">{drawnCoupon.includes("꽝!") ? "앗, 이런! 😅" : "축하합니다! 쿠폰 당첨 🎉"}</span>
                  <span className={cn("text-lg font-black text-center break-keep", drawnCoupon.includes("꽝!") ? "text-red-600" : "text-amber-950")}>{drawnCoupon}</span>
                  <button onClick={() => {
                      const msg = drawnCoupon.includes("꽝!") ? `아빠! 나 영단어 만점 받았는데 뽑기에서 꽝 나왔어 ㅠㅠ\n\n🎯 ${drawnCoupon}` : `아빠! 나 영단어 만점 받아서 쿠폰 뽑았어! 빨리 약속 지켜줘!\n\n🎁 당첨된 쿠폰: ${drawnCoupon}`
                      window.location.href = `sms:${DAD_PHONE}&body=${encodeURIComponent(msg)}`
                    }}
                    className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-105 active:scale-95">
                    <MessageCircle className="size-4" /> 아빠한테 문자 보내기
                  </button>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-muted/50 p-4 text-center">
                <span className="text-sm font-bold text-muted-foreground">💡 단어가 10개 이상일 때 만점을 받으면<br/>쿠폰 뽑기가 나타나요!</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {wrongWords.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-foreground">틀린 단어 ({wrongWords.length})</p>
          <ul className="flex flex-col gap-1.5">
            {wrongWords.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="font-bold text-foreground">{w.word}</span>
                <span className="text-muted-foreground">{w.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-3 mt-2">
        {wrongWords.length > 0 && (
          <button onClick={onRetryWrong} className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}><RotateCcw className="size-5" /> 틀린 단어만 다시 풀기</button>
        )}
        <button onClick={onRetryAll} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors", wrongWords.length > 0 ? "border border-border text-foreground hover:bg-muted" : "text-white shadow-md hover:opacity-90")} style={wrongWords.length > 0 ? undefined : { backgroundColor: accent }}><RotateCcw className="size-5" /> 처음부터 다시하기</button>
      </div>
    </div>
  )
}
