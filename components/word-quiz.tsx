"use client"

import type React from "react"
import { useMemo, useRef, useState } from "react"
import { Trophy, Lightbulb, RotateCcw, Check, X, ArrowRight, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { recordQuizResult } from "@/app/actions/words"

// ▼ subject 타입 추가
export type QuizWord = {
  id: number
  word: string
  meaning: string
  example: string | null
  subject: string 
}

type Phase = "start" | "quiz" | "result"
type Feedback = "idle" | "correct" | "wrong"

type Answered = {
  word: QuizWord
  correct: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function WordQuiz({ words, accent }: { words: QuizWord[]; accent: string }) {
  const [phase, setPhase] = useState<Phase>("start")
  const [deck, setDeck] = useState<QuizWord[]>([])
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState("")
  const [feedback, setFeedback] = useState<Feedback>("idle")
  const [answered, setAnswered] = useState<Answered[]>([])
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [hintUsed, setHintUsed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = deck[index]
  const total = deck.length
  const correctCount = answered.filter((a) => a.correct).length

  const score = useMemo(() => {
    if (total === 0) return 0
    return Math.round((correctCount / total) * 100)
  }, [correctCount, total])

  function begin(list: QuizWord[]) {
    const d = shuffle(list)
    setDeck(d)
    setIndex(0)
    setValue("")
    setFeedback("idle")
    setAnswered([])
    setStreak(0)
    setBestStreak(0)
    setHintUsed(false)
    setPhase("quiz")
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function advance(record: Answered) {
    const nextAnswered = [...answered, record]
    if (index + 1 < total) {
      setAnswered(nextAnswered)
      setIndex(index + 1)
      setValue("")
      setFeedback("idle")
      setHintUsed(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setAnswered(nextAnswered)
      setPhase("result")
    }
  }

  function submit() {
    if (!current || feedback !== "idle") return
    const guess = value.trim().toLowerCase()
    if (!guess) return

    if (guess === current.word.toLowerCase()) {
      const newStreak = streak + 1
      setStreak(newStreak)
      setBestStreak((b) => Math.max(b, newStreak))
      setFeedback("correct")
      recordQuizResult(current.id, true).catch(console.error)
      setTimeout(() => advance({ word: current, correct: true }), 900)
    } else {
      setStreak(0)
      setFeedback("wrong")
      recordQuizResult(current.id, false).catch(console.error)
      setTimeout(() => advance({ word: current, correct: false }), 1600)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      submit()
    }
  }

  const wrongWords = answered.filter((a) => !a.correct).map((a) => a.word)

  if (words.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <p className="text-base font-semibold text-foreground">해당 분류에 단어가 없어요</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {phase === "start" && (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}>
            <Play className="size-7" fill="currentColor" />
          </div>
          <h2 className="mb-2 text-xl font-black text-foreground">단어 퀴즈</h2>
          <p className="mb-8 text-pretty text-sm leading-relaxed text-muted-foreground">총 {words.length}개의 단어가 준비되어 있어요.</p>
          <button onClick={() => begin(words)} className="w-full rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90 active:opacity-80" style={{ backgroundColor: accent }}>
            퀴즈 시작하기
          </button>
        </div>
      )}

      {phase === "quiz" && current && (
        <>
          <div className="h-1.5 w-full bg-muted">
            <div className="h-1.5 transition-all duration-300" style={{ width: `${((index + 1) / total) * 100}%`, backgroundColor: accent }} />
          </div>
          <div className="flex flex-col px-6 py-8">
            <div className="mb-6 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>점수 <span className="font-bold text-foreground">{score}</span></span>
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground">{index + 1} / {total}</span>
              <span>연속 <span className="font-bold" style={{ color: accent }}>{streak}</span></span>
            </div>

            <h2 className="mb-4 text-balance text-center text-4xl font-black tracking-tight text-foreground">
              {/* ▼ 퀴즈 도중 단어의 과목을 보여주는 태그 추가 */}
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">
                  {current.subject}
                </span>
              </div>
              {current.meaning}
            </h2>

            <div className="mb-8 flex min-h-20 items-center justify-center rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-pretty text-center font-serif italic leading-relaxed text-muted-foreground">
                {hintUsed
                  ? current.example
                    ? current.example.replace(new RegExp(current.word, "gi"), (m) => `${m[0]}${"·".repeat(Math.max(0, m.length - 1))}`)
                    : `첫 글자: ${current.word[0]} (${current.word.length}글자)`
                  : "힌트를 보려면 아래 힌트 버튼을 눌러 주세요."}
              </p>
            </div>

            <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={feedback !== "idle"} placeholder="영단어를 입력하세요" className={cn("mb-3 w-full border-b-4 bg-transparent p-3 text-center text-3xl font-bold outline-none transition-colors placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground", feedback === "idle" && "border-border text-foreground", feedback === "correct" && "border-green-500 text-green-600", feedback === "wrong" && "animate-shake border-red-500 text-red-500")} style={feedback === "idle" ? { caretColor: accent } : undefined} />
            
            <div className="mb-6 flex min-h-6 items-center justify-center">
              {feedback === "correct" && <p className="flex items-center gap-1.5 text-sm font-semibold text-green-600"><Check className="size-4" /> 정답입니다!</p>}
              {feedback === "wrong" && <p className="flex items-center gap-1.5 text-sm font-semibold text-red-500"><X className="size-4" /> 정답: {current.word}</p>}
              {feedback === "idle" && hintUsed && <p className="text-sm text-muted-foreground">첫 글자: <span className="font-bold text-foreground">{current.word[0]}</span></p>}
            </div>

            <button onClick={submit} disabled={feedback !== "idle" || !value.trim()} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-colors disabled:opacity-60", feedback === "correct" && "bg-green-500", feedback === "wrong" && "bg-red-500")} style={feedback === "idle" ? { backgroundColor: accent } : undefined}>
              {feedback === "idle" && <>정답 확인 <ArrowRight className="size-5" /></>}
              {feedback === "correct" && "잘했어요!"}
              {feedback === "wrong" && "다음 문제로"}
            </button>
            <button onClick={() => setHintUsed(true)} disabled={hintUsed || feedback !== "idle"} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"><Lightbulb className="size-4" /> 힌트 보기</button>
          </div>
        </>
      )}

      {phase === "result" && (
        <div className="flex flex-col px-6 py-10">
          <div className="mb-6 flex flex-col items-center text-center"><div className="mb-3 flex size-16 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}><Trophy className="size-8" /></div><h2 className="text-2xl font-black text-foreground">학습 완료!</h2></div>
          <div className="mb-6 rounded-2xl bg-muted/50 p-6 text-center">
            <p className="mb-1 text-xs font-medium text-muted-foreground">최종 점수</p><p className="text-5xl font-black" style={{ color: accent }}>{score}점</p>
            <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground"><span>정답 <span className="font-bold text-foreground">{correctCount}</span>/{total}</span><span>최고 연속 <span className="font-bold text-foreground">{bestStreak}</span></span></div>
          </div>
          {wrongWords.length > 0 && (
            <div className="mb-6"><p className="mb-2 text-sm font-semibold text-foreground">틀린 단어 ({wrongWords.length})</p><ul className="flex flex-col gap-1.5">{wrongWords.map((w) => (<li key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm"><span className="font-bold text-foreground">{w.word}</span><span className="text-muted-foreground">{w.meaning}</span></li>))}</ul></div>
          )}
          <div className="flex flex-col gap-3">
            {wrongWords.length > 0 && <button onClick={() => begin(wrongWords)} className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}><RotateCcw className="size-5" /> 틀린 단어만 다시 풀기</button>}
            <button onClick={() => begin(words)} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors", wrongWords.length > 0 ? "border border-border text-foreground hover:bg-muted" : "text-white shadow-md hover:opacity-90")} style={wrongWords.length > 0 ? undefined : { backgroundColor: accent }}><RotateCcw className="size-5" /> 처음부터 다시하기</button>
          </div>
        </div>
      )}
    </div>
  )
}
