import { Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { QuizWord, QuizType } from "./word-quiz"

interface Props {
  words: QuizWord[]
  accent: string
  quizType: QuizType
  setQuizType: (t: QuizType) => void
  isGenerating: boolean
  onBegin: () => void
}

export function QuizStart({ words, accent, quizType, setQuizType, isGenerating, onBegin }: Props) {
  return (
    <div className="flex flex-col items-center px-6 py-6 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}>
        <Play className="size-6" fill="currentColor"/>
      </div>
      
      <h2 className="mb-1 text-lg font-black text-foreground">단어 퀴즈</h2>
      <p className="mb-4 text-pretty text-sm leading-relaxed text-muted-foreground">총 {words.length}개의 단어가 준비되어 있어요.</p>
      
      <div className="mb-5 flex w-full flex-col gap-2 rounded-xl bg-muted p-2">
        <div className="flex gap-2">
          <button onClick={() => setQuizType("standard")} className={cn("flex-1 rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "standard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}>📖 뜻 보고 쓰기</button>
          <button onClick={() => setQuizType("listening")} className={cn("flex-1 rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "listening" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}>🎧 소리 듣고 쓰기</button>
        </div>
        <button onClick={() => setQuizType("context")} className={cn("w-full rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "context" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}>🤖 AI 실전 문장 퀴즈</button>
        {/* ▼ 새로 추가된 말하기 훈련 버튼 ▼ */}
        <button onClick={() => setQuizType("speaking")} className={cn("w-full rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "speaking" ? "bg-background text-foreground shadow-sm border border-indigo-200" : "text-muted-foreground hover:bg-muted-foreground/10")}>🗣️ AI 문장 말하기 훈련</button>
      </div>

      <button onClick={onBegin} disabled={isGenerating} className="w-full rounded-2xl py-3.5 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: accent }}>
        {isGenerating ? "AI가 시험지 만드는 중... 🏃💨" : "퀴즈 시작하기"}
      </button>
    </div>
  )
}
