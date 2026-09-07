"use client"

import { useState } from "react"
import { GraduationCap, Pencil } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

type Mode = "quiz" | "manage"

export function StudyApp({
  profile,
  date,
  words,
  accent,
}: {
  profile: Profile
  date: string
  words: QuizWord[]
  accent: string
}) {
  const [mode, setMode] = useState<Mode>("quiz")

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
        <button
          onClick={() => setMode("quiz")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors",
            mode === "quiz" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <GraduationCap className="size-4" /> 퀴즈 풀기
        </button>
        <button
          onClick={() => setMode("manage")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors",
            mode === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <Pencil className="size-4" /> 단어 입력
        </button>
      </div>

      {mode === "quiz" ? (
        <WordQuiz words={words} accent={accent} />
      ) : (
        <WordManager profile={profile} date={date} words={words} accent={accent} />
      )}
    </div>
  )
}
