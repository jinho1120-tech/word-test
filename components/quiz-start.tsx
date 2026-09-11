// components/quiz-start.tsx 파일 전체 덮어쓰기

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
    // 위아래 패딩(py)을 줄여서 화면 공간을 확보합니다.
    <div className="flex flex-col items-center px-6 py-6 text-center">
      
      {/* 아이콘 크기(size)와 아래쪽 여백(mb)을 스마트폰 비율에 맞게 축소 */}
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}>
        <Play className="size-6" fill="currentColor"/>
      </div>
      
      <h2 className="mb-1 text-lg font-black text-foreground">단어 퀴즈</h2>
      <p className="mb-4 text-pretty text-sm leading-relaxed text-muted-foreground">총 {words.length}개의 단어가 준비되어 있어요.</p>
      
      {/* 퀴즈 종류 선택 박스의 여백과 버튼 높이를 컴팩트하게 조정 */}
      <div className="mb-5 flex w-full flex-col gap-2 rounded-xl bg-muted p-2">
        <div className="flex gap-2">
          <button 
            onClick={() => setQuizType("standard")} 
            className={cn("flex-1 rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "standard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}
          >
            📖 뜻 보고 쓰기
          </button>
          <button 
            onClick={() => setQuizType("listening")} 
            className={cn("flex-1 rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "listening" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}
          >
            🎧 소리 듣고 쓰기
          </button>
        </div>
        <button 
          onClick={() => setQuizType("context")} 
          className={cn("w-full rounded-lg py-2.5 text-sm font-bold transition-all", quizType === "context" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}
        >
          🤖 AI 실전 문장 퀴즈
        </button>
      </div>

      <button 
        onClick={onBegin} 
        disabled={isGenerating} 
        className="w-full rounded-2xl py-3.5 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-70 disabled:cursor-wait" 
        style={{ backgroundColor: accent }}
      >
        {isGenerating ? "AI가 시험지 만드는 중... 🏃💨" : "퀴즈 시작하기"}
      </button>
    </div>
  )
}
