"use client"

import { useState, useMemo, useEffect } from "react"
import { GraduationCap, Pencil, Ghost, Mic } from "lucide-react"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { WordManager } from "@/components/word-manager"
import { ScriptTrainer } from "@/components/script-trainer"
import { HapticButton } from "./haptic-button"
import type { Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

type Mode = "quiz" | "wrong" | "script" | "manage"

const ALL_SUBJECTS = ["전체", "리딩", "스피킹", "문법", "단어"]

export function StudyApp({ profile, date, words, wrongWords, accent }: { profile: Profile; date: string; words: QuizWord[]; wrongWords: QuizWord[]; accent: string }) {
  const [mode, setMode] = useState<Mode>("quiz")
  const [filter, setFilter] = useState("전체")

  const availableSubjects = useMemo(() => {
    return ALL_SUBJECTS.filter(subject => subject === "전체" || words.some(word => word.subject === subject))
  }, [words])

  useEffect(() => {
    if (!availableSubjects.includes(filter)) setFilter("전체")
  }, [availableSubjects, filter])

  const displayWords = filter === "전체" ? words : words.filter((w) => w.subject === filter)
  const displayWrongWords = filter === "전체" ? wrongWords : wrongWords.filter((w) => w.subject === filter)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-1 sm:gap-1.5 rounded-2xl border border-border bg-muted/50 p-1 sm:p-1.5">
        <HapticButton
          hapticLabel="날짜별 퀴즈 탭"
          onClick={() => setMode("quiz")}
          wrapperClassName="relative flex h-full"
          className={cn("w-full h-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors", mode === "quiz" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80")}
        >
          <GraduationCap className="size-4 shrink-0" /> <span className="hidden sm:inline">날짜별</span> 퀴즈
        </HapticButton>
        
        <HapticButton
          hapticLabel="오답 몬스터 탭"
          onClick={() => setMode("wrong")}
          wrapperClassName="relative flex h-full"
          className={cn("w-full h-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors", mode === "wrong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80")}
        >
          <Ghost className={cn("size-4 shrink-0", mode === "wrong" ? "animate-monster-hop" : "")} style={mode === "wrong" ? { color: accent } : undefined} /> 
          <span className="hidden sm:inline">오답</span> 몬스터
        </HapticButton>

        <HapticButton
          hapticLabel="발표 대본 탭"
          onClick={() => setMode("script")}
          wrapperClassName="relative flex h-full"
          className={cn("w-full h-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors", mode === "script" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80")}
        >
          <Mic className={cn("size-4 shrink-0", mode === "script" ? "animate-pulse" : "")} style={mode === "script" ? { color: accent } : undefined} /> 
          <span className="hidden sm:inline">발표</span> 대본
        </HapticButton>
        
        <HapticButton
          hapticLabel="단어 입력 탭"
          onClick={() => setMode("manage")}
          wrapperClassName="relative flex h-full"
          className={cn("w-full h-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors", mode === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80")}
        >
          <Pencil className="size-4 shrink-0" /> 단어 입력
        </HapticButton>
      </div>

      {mode !== "manage" && mode !== "script" && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {availableSubjects.map((s) => (
            <HapticButton
              key={s}
              hapticLabel={`${s} 과목 필터`}
              onClick={() => setFilter(s)}
              wrapperClassName="relative inline-flex shrink-0"
              className={cn("px-3.5 py-1.5 text-xs font-bold rounded-xl w-full h-full transition-all", filter === s ? "bg-foreground text-background shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent")}
              style={filter === s ? { backgroundColor: accent, color: "white" } : undefined}
            >
              {s}
            </HapticButton>
          ))}
        </div>
      )}

      {mode === "quiz" && <WordQuiz key={`quiz-${filter}`} words={displayWords} accent={accent} />}
      
      {mode === "wrong" && (
        displayWrongWords.length > 0 ? (
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

      {mode === "script" && <ScriptTrainer accent={accent} profileName={profile} />}
      {mode === "manage" && <WordManager profile={profile} date={date} words={words} accent={accent} />}
    </div>
  )
}
