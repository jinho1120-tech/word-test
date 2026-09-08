"use client"

import { useState } from "react"
import { GraduationCap, Pencil, Flame } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

// ▼ 오답 노트(wrong) 모드가 추가되었습니다.
type Mode = "quiz" | "wrong" | "manage"

export function StudyApp({
  profile,
  date,
  words,
  wrongWords, // ▼ 부모로부터 오답 단어 목록을 받아옵니다.
  accent,
}: {
  profile: Profile
  date: string
  words: QuizWord[]
  wrongWords: QuizWord[] 
  accent: string
}) {
  const [mode, setMode] = useState<Mode>("quiz")

  return (
    <div className="flex flex-col gap-5">
      {/* ▼ 버튼이 3개가 되었으므로 grid-cols-2를 grid-cols-3으로 변경했습니다. */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
        <button
          onClick={() => setMode("quiz")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors",
            mode === "quiz" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <GraduationCap className="size-4 shrink-0" /> <span className="hidden sm:inline">날짜별</span> 퀴즈
        </button>
        
        {/* ▼ 새롭게 추가된 오답 노트 탭 */}
        <button
          onClick={() => setMode("wrong")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors",
            mode === "wrong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <Flame className={cn("size-4 shrink-0", mode === "wrong" ? "text-orange-500" : "")} /> 오답 노트
        </button>

        <button
          onClick={() => setMode("manage")}
          className={cn(
            "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors",
            mode === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <Pencil className="size-4 shrink-0" /> 단어 입력
        </button>
      </div>

      {/* ▼ 모드에 따라 알맞은 화면과 데이터를 렌더링합니다. */}
      {mode === "quiz" && (
        <WordQuiz words={words} accent={accent} />
      )}
      
      {mode === "wrong" && (
        // 오답 퀴즈일 때는 words 대신 wrongWords 데이터를 넘겨줍니다.
        <WordQuiz words={wrongWords} accent={accent} /> 
      )}
      
      {mode === "manage" && (
        <WordManager profile={profile} date={date} words={words} accent={accent} />
      )}
    </div>
  )
}
