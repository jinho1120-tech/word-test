"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import { Lightbulb, Check, X, ArrowRight, Volume2, Sparkles, BrainCircuit } from "lucide-react"
import { cn } from "@/lib/utils"
import { recordQuizResult, generateContextQuiz } from "@/app/actions/words"
import confetti from "canvas-confetti"

import { QuizStart } from "./quiz-start"
import { QuizResult } from "./quiz-result"

const DAD_PHONE = "01032854101" 

export type QuizWord = {
  id: number
  word: string
  meaning: string
  example: string | null
  subject: string 
}

export type QuizType = "standard" | "listening" | "context"
type Phase = "start" | "quiz" | "result"
type Feedback = "idle" | "correct" | "wrong"
type Answered = { word: QuizWord; correct: boolean }
type ContextQuizItem = { word: string; sentence: string; translation: string; clue: string; options: string[] }

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
  // ▼ 퀴즈 전체 진행 동안 힌트를 한 번이라도 썼는지 추적하는 상태 추가
  const [usedHintInQuiz, setUsedHintInQuiz] = useState(false)
  
  const [quizType, setQuizType] = useState<QuizType>("standard")
  const inputRef = useRef<HTMLInputElement>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [contextData, setContextData] = useState<ContextQuizItem[]>([])

  const current = deck[index]
  const total = deck.length
  const correctCount = answered.filter((a) => a.correct).length
  const currentName = accent === "#6366f1" ? "지온" : "예온"

  const loadingMessages = [
    `🤖 ${currentName}이를 위한 맞춤 문장 생성 중...`,
    "✨ AI 선생님이 신나는 문제를 고르고 있어요!",
    "📝 힌트와 예문을 예쁘게 포장하는 중...",
    "🚀 준비 완료! 거의 다 되었어요!"
  ]

  const score = useMemo(() => {
    if (total === 0) return 0
    return Math.round((correctCount / total) * 100)
  }, [correctCount, total])

  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length)
    }, 800)
    return () => clearInterval(interval)
  }, [isGenerating, loadingMessages.length])

  useEffect(() => {
    if (phase === "result" && score === 100 && total >= 10) {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
      return () => clearInterval(interval);
    }
  }, [phase, score, total]);

  function playPronunciation(word: string) {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(word)
        utterance.lang = "en-US"
        utterance.rate = 0.85
        window.speechSynthesis.speak(utterance)
      }
    } catch (e) {
      console.error("음성 재생 에러:", e)
    }
  }

  async function begin(list: QuizWord[]) {
    if (quizType === "context") {
      setIsGenerating(true)
      setLoadingMsgIdx(0)
      
      const d = shuffle(list).slice(0, 10) 
      const reqData = d.map(w => ({ word: w.word, meaning: w.meaning }))
      
      const res = await generateContextQuiz(reqData)
      setIsGenerating(false)
      
      if (!res.success || !res.quizData) {
        alert("AI가 문제를 출제하다가 실수했어요! 다시 시도해 주세요.\n(에러: " + res.error + ")")
        return
      }
      
      const newDeck: QuizWord[] = []
      const newContextData: ContextQuizItem[] = []
      
      for (const item of res.quizData) {
        const matchedWord = d.find(w => w.word.toLowerCase() === item.word.toLowerCase())
        if (matchedWord) {
          newDeck.push(matchedWord)
          let distractors = words.filter(w => w.word !== matchedWord.word).map(w => w.word)
          if (distractors.length < 3) distractors = [...distractors, "apple", "happy", "school", "friend", "water"]
          const options = shuffle([matchedWord.word, ...shuffle(distractors).slice(0, 3)])
          newContextData.push({ ...item, options })
        }
      }
      if (newDeck.length === 0) return alert("문제를 만들지 못했습니다. 다시 시도해 주세요.")
      setDeck(newDeck)
      setContextData(newContextData)
    } else {
      setDeck(shuffle(list))
    }

    setIndex(0)
    setValue("")
    setFeedback("idle")
    setAnswered([])
    setStreak(0)
    setBestStreak(0)
    setHintUsed(false)
    setUsedHintInQuiz(false) // 퀴즈 시작 시 힌트 사용 기록 초기화
    setPhase("quiz")
    
    requestAnimationFrame(() => inputRef.current?.focus())
    if (quizType === "listening" && list.length > 0) {
      setTimeout(() => playPronunciation(quizType === "context" ? deck[0]?.word : list[0].word), 300)
    }
  }

  function advance(record: Answered) {
    const nextAnswered = [...answered, record]
    const nextIndex = index + 1
    if (nextIndex < total) {
      setAnswered(nextAnswered); setIndex(nextIndex); setValue(""); setFeedback("idle"); setHintUsed(false)
      requestAnimationFrame(() => inputRef.current?.focus())
      if (quizType === "listening") setTimeout(() => playPronunciation(deck[nextIndex].word), 300)
    } else {
      setAnswered(nextAnswered); setPhase("result")
    }
  }

  function submit() {
    if (!current || feedback !== "idle") return
    const guess = value.trim().toLowerCase()
    if (!guess) return
    try { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel() } catch (e) {}

    if (["아빠최고", "아빠사랑해", "지온천재", "예온천재"].includes(guess)) {
      alert(`🎉 삐빅- 비밀 치트키 발견!\n\n아빠한테 진짜 iMessage 문자를 보냅니다! ❤️`)
      setValue("") 
      const message = guess.includes("천재") ? `아빠! 영단어 퀴즈 풀고 있는 천재 ${currentName}이에요! 😎` : `아빠 최고! 퀴즈 풀다가 아빠 생각나서 문자 보내요! 사랑해 ❤️`
      window.location.href = `sms:${DAD_PHONE}&body=${encodeURIComponent(message)}`
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }

    if (guess === current.word.toLowerCase()) {
      const newStreak = streak + 1
      setStreak(newStreak); setBestStreak((b) => Math.max(b, newStreak)); setFeedback("correct")
      recordQuizResult(current.id, true).catch(console.error)
      setTimeout(() => advance({ word: current, correct: true }), 900)
    } else {
      setStreak(0); setFeedback("wrong")
      recordQuizResult(current.id, false).catch(console.error)
      setTimeout(() => advance({ word: current, correct: false }), quizType === "context" ? 3000 : 1600)
    }
  }

  // 힌트 버튼 클릭 처리
  function handleUseHint() {
    setHintUsed(true)
    setUsedHintInQuiz(true) // 전체 퀴즈 힌트 사용 기록 설정
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
    <>
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/90 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="relative mb-6 flex size-28 items-center justify-center rounded-3xl bg-card shadow-2xl border border-border">
            <BrainCircuit className="size-14 animate-pulse text-indigo-500" style={{ color: accent }} />
            <Sparkles className="absolute -top-2 -right-2 size-8 text-amber-400 animate-bounce" />
          </div>
          
          <h3 className="mb-2 text-xl font-black text-foreground tracking-tight">AI 시험지 제작 중</h3>
          
          <p className="min-h-6 text-sm font-bold text-muted-foreground animate-in slide-in-from-bottom-2 fade-in duration-300">
            {loadingMessages[loadingMsgIdx]}
          </p>

          <div className="mt-8 flex gap-1.5">
            <div className="size-2.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms", backgroundColor: accent }} />
            <div className="size-2.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms", backgroundColor: accent }} />
            <div className="size-2.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms", backgroundColor: accent }} />
          </div>
        </div>
      )}

      {phase === "quiz" && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background sm:bg-background/95 sm:backdrop-blur-sm sm:p-6 animate-in fade-in duration-200">
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[850px] sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl transition-all duration-500" style={streak >= 5 ? { boxShadow: "0 0 30px rgba(245, 158, 11, 0.4)", borderColor: "#f59e0b" } : undefined}>
            <div className="h-1.5 w-full bg-muted shrink-0">
              <div className="h-1.5 transition-all duration-300" style={{ width: `${((index + 1) / total) * 100}%`, backgroundColor: streak >= 5 ? "#f59e0b" : accent }} />
            </div>

            <div className="flex justify-end p-4 pb-0 shrink-0">
              <button onClick={() => { if (window.confirm("퀴즈를 중단할까요?")) setPhase("start") }} className="flex items-center gap-1 rounded-full bg-muted/50 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500">나가기 <X className="size-3" /></button>
            </div>

            <div className="flex flex-col px-6 pb-8 pt-2 flex-1 overflow-y-auto">
              <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>점수 <span className="font-bold text-foreground">{score}</span></span>
                <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground">{index + 1} / {total}</span>
                <span className={cn(streak >= 5 && "text-orange-500 animate-pulse font-bold")}>연속 <span className="font-black text-sm" style={streak >= 5 ? {} : { color: accent }}>{streak}</span></span>
              </div>

              <div className="h-10 w-full flex justify-center mb-2">
                {streak >= 3 && (
                  <div key={streak} className="animate-in slide-in-from-bottom-2 fade-in zoom-in duration-300">
                    <span className={cn("rounded-full px-4 py-1.5 text-sm font-black text-white shadow-lg", streak >= 10 ? "bg-gradient-to-r from-red-500 to-orange-600 scale-110 shadow-red-500/50" : "bg-gradient-to-r from-amber-400 to-orange-500 shadow-orange-500/40")}>
                      {streak >= 10 ? `🔥🔥 ${currentName} 폭주 중!! 멈출 수 없어!` : `🔥 ${currentName} ${streak}연속 정답!`}
                    </span>
                  </div>
                )}
              </div>

              {quizType === "context" && contextData[index] ? (
                <div className="mb-4 flex flex-col items-center justify-center w-full">
                  <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">{current.subject}</span></div>
                  <h2 className="mb-6 text-balance text-center text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-snug">
                    {contextData[index].sentence.split('___').map((part: string, i: number, arr: any[]) => (
                      <React.Fragment key={i}>{part}{i < arr.length - 1 && <span className="mx-1 inline-block w-12 sm:w-16 border-b-4 border-foreground" />}</React.Fragment>
                    ))}
                  </h2>
                  <div className="w-full rounded-xl bg-muted/40 p-3 mb-2 flex flex-wrap justify-center gap-2 border border-border">
                    {contextData[index].options.map((opt: string, i: number) => <span key={i} className="px-3 py-1.5 bg-card rounded-lg text-sm font-bold text-foreground shadow-sm">{opt}</span>)}
                  </div>
                </div>
              ) : quizType === "standard" ? (
                <h2 className="mb-4 text-balance text-center text-4xl font-black tracking-tight text-foreground">
                  <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">{current.subject}</span></div>
                  {current.meaning}
                </h2>
              ) : (
                <div className="mb-4 flex flex-col items-center justify-center">
                  <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">{current.subject}</span></div>
                  <button type="button" onClick={() => playPronunciation(current.word)} className="mb-3 flex size-20 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95" style={{ backgroundColor: accent }}><Volume2 className="size-10" /></button>
                  <p className="text-sm font-bold text-muted-foreground">버튼을 눌러 다시 들을 수 있어요</p>
                </div>
              )}

              <div className="mb-8 flex min-h-24 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/50 p-4">
                {quizType === "context" ? (
                  <div className="text-center">
                    {hintUsed || feedback === "wrong" ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-bold text-foreground">
                          🇰🇷 해석: {contextData[index].translation}
                        </p>
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          💡 AI 선생님 힌트: {contextData[index].clue}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-muted-foreground">
                        해석과 힌트를 보려면 아래 힌트 버튼을 눌러 주세요.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-pretty text-center font-serif italic leading-relaxed text-muted-foreground">
                    {hintUsed ? quizType === "listening" ? `뜻: ${current.meaning}` : current.example ? current.example.replace(new RegExp(current.word, "gi"), (m) => `${m[0]}${"·".repeat(Math.max(0, m.length - 1))}`) : `첫 글자: ${current.word[0]} (${current.word.length}글자)` : "힌트를 보려면 아래 힌트 버튼을 눌러 주세요."}
                  </p>
                )}
                {hintUsed && quizType === "standard" && <button type="button" onMouseDown={(e) => { e.preventDefault(); playPronunciation(current.word); }} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 shadow-sm" style={{ backgroundColor: accent, color: "white" }}><Volume2 className="size-4" /> 단어 듣기</button>}
              </div>

              <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={feedback !== "idle"} placeholder="영단어를 입력하세요" className={cn("mb-3 w-full border-b-4 bg-transparent p-3 text-center text-3xl font-bold outline-none transition-colors placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground", feedback === "idle" && "border-border text-foreground", feedback === "correct" && "border-green-500 text-green-600", feedback === "wrong" && "animate-shake border-red-500 text-red-500")} style={feedback === "idle" ? { caretColor: accent } : undefined} />
              
              <div className="mb-6 flex min-h-6 items-center justify-center">
                {feedback === "correct" && <p className="flex items-center gap-1.5 text-sm font-semibold text-green-600"><Check className="size-4" /> 정답입니다!</p>}
                {feedback === "wrong" && <p className="flex items-center gap-1.5 text-sm font-semibold text-red-500"><X className="size-4" /> 정답: {current.word}</p>}
                {feedback === "idle" && hintUsed && quizType === "standard" && <p className="text-sm text-muted-foreground">첫 글자: <span className="font-bold text-foreground">{current.word[0]}</span></p>}
              </div>

              <button onClick={submit} disabled={feedback !== "idle" || !value.trim()} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-colors disabled:opacity-60", feedback === "correct" && "bg-green-500", feedback === "wrong" && "bg-red-500")} style={feedback === "idle" ? { backgroundColor: accent } : undefined}>
                {feedback === "idle" && <>정답 확인 <ArrowRight className="size-5" /></>}
                {feedback === "correct" && "잘했어요!"}
                {feedback === "wrong" && "다음 문제로"}
              </button>
              <button onClick={handleUseHint} disabled={hintUsed || feedback !== "idle"} className="mt-3 mb-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"><Lightbulb className="size-4" /> 힌트 보기</button>
            </div>
          </div>
        </div>
      )}

      <div className={cn("overflow-hidden rounded-3xl border border-border bg-card shadow-sm", phase === "quiz" ? "hidden" : "block")}>
        {phase === "start" && (
          <QuizStart 
            words={words} 
            accent={accent} 
            quizType={quizType} 
            setQuizType={setQuizType} 
            isGenerating={isGenerating} 
            onBegin={() => begin(words)} 
          />
        )}
        {phase === "result" && (
          <QuizResult 
            score={score} 
            correctCount={correctCount} 
            total={total} 
            bestStreak={bestStreak} 
            wrongWords={wrongWords} 
            accent={accent} 
            usedHint={usedHintInQuiz} // ▼ 힌트 사용 여부를 결과 컴포넌트로 전달
            onRetryWrong={() => begin(wrongWords)} 
            onRetryAll={() => begin(words)} 
          />
        )}
      </div>
    </>
  )
}
