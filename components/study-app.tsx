"use client"

import { useState, useMemo, useEffect } from "react"
import { GraduationCap, Pencil, Ghost } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

type Mode = "quiz" | "wrong" | "manage"

// 전체 과목 목록
const ALL_SUBJECTS = ["전체", "리딩", "스피킹", "문법", "단어"]

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

  const availableSubjects = useMemo(() => {
    return ALL_SUBJECTS.filter(
      (subject) => subject === "전체" || words.some((word) => word.subject === subject)
    )
  }, [words])

  useEffect(() => {
    if (!availableSubjects.includes(filter)) {
      setFilter("전체")
    }
  }, [availableSubjects, filter])

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
          <Ghost 
            className={cn("size-4 shrink-0", mode === "wrong" ? "animate-bounce" : "")} 
            style={mode === "wrong" ? { color: accent } : undefined} 
          /> 
          <span className="hidden sm:inline">오답</span> 몬스터
        </button>
        
        <button
          onClick={() => setMode("manage")}
          className={cn("flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-colors", mode === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Pencil className="size-4 shrink-0" /> 단어 입력
        </button>
      </div>

      {/* 단어 입력 모드(manage)가 아닐 때만 이 바깥쪽 탭을 보여줍니다! */}
      {mode !== "manage" && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {availableSubjects.map((s) => (
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
      )}

      {mode === "quiz" && <WordQuiz key={`quiz-${filter}`} words={displayWords} accent={accent} />}
      
      {mode === "wrong" && (
        displayWrongWords.length > 0 ? (
          // 💡 여기에 isMonsterMode={true}를 추가했습니다!
          <WordQuiz key={`wrong-${filter}`} words={displayWrongWords} accent={accent} isMonsterMode={true} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center animate-in fade-in zoom-in duration-500">
            <div className="mb-5 text-6xl drop-shadow-md">✨🛡️✨</div>
            <h3 className="mb-2 text-2xl font-black text-foreground">몬스터 전멸!</h3>
            <p className="text-sm font-bold text-muted-foreground leading-relaxed">
              완벽해요! 더 이상 물리칠 오답 몬스터가 없어요.<br />우리 동네의 평화를 지켜냈습니다!
            </p>
          </div>
        )
      )}

      {/* WordManager에는 필터링 되지 않은 전체 words를 통째로 넘겨줍니다. 
          (WordManager 내부에서 자체적으로 필터 탭을 보여주고 작동시킵니다) */}
      {mode === "manage" && <WordManager profile={profile} date={date} words={words} accent={accent} />}
    </div>
  )
}
