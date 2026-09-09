"use client"

import { useState } from "react"
import { GraduationCap, Pencil, Ghost } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

type Mode = "quiz" | "wrong" | "manage"

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
        
        {/* ▼ 오답 노트가 '오답 몬스터'로 진화했습니다! 귀여운 유령(Ghost) 아이콘을 썼어요. */}
        <button
          onClick={() => setMode("wrong")}
          className={cn("flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors", mode === "wrong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Ghost className={cn("size-4 shrink-0", mode === "wrong" ? "text-purple-500 animate-bounce" : "")} /> 
          <span className="hidden sm:inline">오답</span> 몬스터
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

      {mode === "quiz" && <WordQuiz key={`quiz-${filter}`} words={displayWords} accent={accent} />}
      
      {/* ▼ 오답 몬스터 모드일 때, 남은 단어가 없으면 멋진 승리 화면을 보여줍니다! */}
      {mode === "wrong" && (
        displayWrongWords.length > 0 ? (
          <WordQuiz key={`wrong-${filter}`} words={displayWrongWords} accent={accent} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-green-200 bg-green-50/50 px-6 py-16 text-center animate-in fade-in zoom-in duration-500">
            <div className="mb-4 text-6xl drop-shadow-md">✨🛡️✨</div>
            <h3 className="mb-2 text-2xl font-black text-green-700">몬스터 전멸!</h3>
            <p className="font-bold text-green-600/80 leading-relaxed">
              완벽해요! 더 이상 물리칠 오답 몬스터가 없어요.<br />우리 동네의 평화를 지켜냈습니다!
            </p>
          </div>
        )
      )}

      {mode === "manage" && <WordManager profile={profile} date={date} words={displayWords} accent={accent} />}
    </div>
  )
}
