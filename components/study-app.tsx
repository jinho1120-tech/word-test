"use client"

import { useState } from "react"
import { GraduationCap, Pencil, Flame } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

type Mode = "quiz" | "wrong" | "manage"

// ▼ '리스닝'을 '스피킹'으로 변경했습니다.
const SUBJECTS = ["전체", "리딩", "스피킹", "문법", "단어"]

export function StudyApp({
  profile,
  date,
  words,
  wrongWords,
  accent,
}: {
  profile: Profile
  date: string
  words: QuizWord[]
  wrongWords: QuizWord[]
  accent: string
}) {
  const [mode, setMode] = useState<Mode>("quiz")
  const [filter, setFilter] = useState("전체")

  const displayWords = filter === "전체" ? words : words.filter((w) => w.subject === filter)
  const displayWrongWords = filter === "전체" ? wrongWords : wrongWords.filter((w) => w.subject === filter)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
        <button
          onClick={() => setMode("quiz")}
          className={cn("flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors", mode === "quiz" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <GraduationCap className="size-4 shrink-0" /> <span className="hidden sm:inline">날짜별</span> 퀴즈
        </button>
        <button
          onClick={() => setMode("wrong")}
          className={cn("flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors", mode === "wrong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Flame className={cn("size-4 shrink-0", mode === "wrong" ? "text-orange-500" : "")} /> 오답 노트
        </button>
        <button
          onClick={() => setMode("manage")}
          className={cn("flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors", mode === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Pencil className="size-4 shrink-0" /> 단어 입력
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {SUBJECTS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3.5 py-1.5 text-xs font-bold rounded-xl shrink-0 transition-all",
              filter === s ? "bg-foreground text-background shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
            )}
            style={filter === s ? { backgroundColor: accent, color: "white" } : undefined}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ▼ 여기에 key 속성을 추가해서 과목(filter)이 바뀔 때마다 퀴즈 화면이 초기화되도록 만들었습니다! ▼ */}
      {mode === "quiz" && <WordQuiz key={`quiz-${filter}`} words={displayWords} accent={accent} />}
      {mode === "wrong" && <WordQuiz key={`wrong-${filter}`} words={displayWrongWords} accent={accent} />}
      {mode === "manage" && <WordManager profile={profile} date={date} words={displayWords} accent={accent} />}
    </div>
  )
}
}
