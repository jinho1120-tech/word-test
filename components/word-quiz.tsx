"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import { Lightbulb, Check, X, ArrowRight, Volume2, Sparkles, BrainCircuit, Mic, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { recordQuizResult, generateContextQuiz } from "@/app/actions/words"
import confetti from "canvas-confetti"

import { QuizStart } from "./quiz-start"
import { QuizResult } from "./quiz-result"

const DAD_PHONE = "01032854101" 

const TTS_VOICE = "en-US-AnaNeural" 

export type QuizWord = {
  id: number
  word: string
  meaning: string
  example: string | null
  subject: string 
}

export type QuizType = "standard" | "listening" | "context" | "speaking"
type Phase = "start" | "quiz" | "result"
type Feedback = "idle" | "correct" | "wrong"
type Answered = { word: QuizWord; correct: boolean }
type ContextQuizItem = { word: string; sentence: string; translation: string; clue?: string; options?: string[]; guide?: string }

type PronunciationResult = {
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number;
}

type WordScoreDetail = { 
  text: string; 
  score: number; 
  errorType?: string; 
  offsetSec?: number; 
  durationSec?: number; 
  phonemes: { phoneme: string; score: number }[];
}

let globalAudio: HTMLAudioElement | null = null;
function getGlobalAudio() {
  if (typeof window === "undefined") return null;
  if (!globalAudio) {
    globalAudio = new Audio();
  }
  return globalAudio;
}

let globalAudioCtx: AudioContext | null = null;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!globalAudioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) globalAudioCtx = new Ctx();
  }
  return globalAudioCtx;
}

const ttsCache = new Map<string, string>();

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
  const [usedHintInQuiz, setUsedHintInQuiz] = useState(false)
  
  const [quizType, setQuizType] = useState<QuizType>("standard")
  const inputRef = useRef<HTMLInputElement>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [contextData, setContextData] = useState<ContextQuizItem[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [isMicReady, setIsMicReady] = useState(false)
  const [pronResult, setPronResult] = useState<PronunciationResult | null>(null)
  
  const [wordScores, setWordScores] = useState<WordScoreDetail[]>([])
  
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null)
  const [isSlowMode, setIsSlowMode] = useState(false)

  const current = deck[index]
  const total = deck.length
  const currentName = accent === "#6366f1" ? "지온" : "예온"

  const loadingMessages = [
    `🤖 ${currentName}이를 위한 맞춤 문장 생성 중...`,
    "✨ AI 선생님이 신나는 문제를 고르고 있어요!",
    "📝 힌트와 예문을 예쁘게 포장하는 중...",
    "🚀 준비 완료! 거의 다 되었어요!"
  ]

  const score = useMemo(() => {
    if (total === 0) return 0
    return Math.round((answered.filter((a) => a.correct).length / total) * 100)
  }, [answered, total])

  const correctCount = useMemo(() => {
    return answered.filter((a) => a.correct).length
  }, [answered])

  const wrongWords = useMemo(() => {
    return answered.filter((a) => !a.correct).map((a) => a.word)
  }, [answered])

  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length)
    }, 800)
    return () => clearInterval(interval)
  }, [isGenerating, loadingMessages.length])

  useEffect(() => {
    if (phase === "result" && score === 100 && total >= 5) {
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

  async function playPronunciation(targetText: string) {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }

      const audio = getGlobalAudio();
      const cacheKey = `${targetText}_${isSlowMode ? 'slow' : 'normal'}`;

      if (audio && ttsCache.has(cacheKey)) {
        audio.src = ttsCache.get(cacheKey)!;
        audio.play().catch((e) => {
          console.error("캐시 오디오 재생 실패:", e);
          fallbackTTS(targetText);
        });
        return;
      }

      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) {
        fallbackTTS(targetText)
        return
      }

      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
      
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null)
      const safeText = targetText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const speedRate = isSlowMode ? "-20%" : "0%";
      
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${TTS_VOICE}">
            <prosody rate="${speedRate}">${safeText}</prosody>
          </voice>
        </speak>
      `.trim();

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = result.audioData;
            const blob = new Blob([audioData], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            
            ttsCache.set(cacheKey, url);

            if (audio) {
              audio.src = url;
              audio.play().catch((e) => {
                console.error("Azure 오디오 파일 재생 실패:", e);
                fallbackTTS(targetText);
              });
            } else {
              fallbackTTS(targetText);
            }
          } else {
            console.warn("Azure TTS 합성 실패, 기본 TTS로 전환합니다.")
            fallbackTTS(targetText)
          }
          synthesizer.close()
        },
        (err) => {
          console.error("Azure TTS 통신 에러:", err)
          fallbackTTS(targetText)
          synthesizer.close()
        }
      )
    } catch (e) {
      console.error("음성 재생 프로세스 에러:", e)
      fallbackTTS(targetText)
    }
  }

  function fallbackTTS(text: string) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = "en-US"
      utterance.rate = isSlowMode ? 0.75 : 0.9 
      window.speechSynthesis.speak(utterance)
    }
  }

  async function playUserWordAudio(offsetSec: number, durationSec: number) {
    if (!userAudioUrl) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch(userAudioUrl);
      const arrayBuffer = await res.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(ctx.destination);
      
      // ▼ 앞부분은 첫 소리가 잘리지 않게 아주 살짝(0.05초) 당기고,
      // 시작점을 0.05초 당겼으니 재생 길이(dur)에도 0.05초만 더해주면, 
      // 결국 끝나는 시간은 원본 종료 시간(offsetSec + durationSec)과 정확히 100% 일치합니다! 다음 단어 완벽 차단!
      const start = Math.max(0, offsetSec - 0.05);
      const dur = durationSec + 0.05; 
      
      source.start(0, start, dur);
    } catch(e) {
      console.error("단어 부분 재생 실패:", e);
    }
  }

  async function handlePronunciationAssessment(targetText: string) {
    setIsRecording(true)
    setIsMicReady(false)
    setPronResult(null)
    setWordScores([]) 
    setFeedback("idle")
    setUserAudioUrl(null)

    try {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) {
        alert("아빠에게 알려주세요: Azure 발음 평가 키가 등록되지 않았습니다.")
        setIsRecording(false)
        return
      }

      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechRecognitionLanguage = "en-US"
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1200");

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()

      const pronConfig = new sdk.PronunciationAssessmentConfig(
        targetText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )
      
      pronConfig.enableProsodyAssessment = true;

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      let mediaRecorder: MediaRecorder | null = null;
      let audioChunks: Blob[] = [];

      recognizer.sessionStarted = async (s, e) => {
        setIsMicReady(true)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
          };
          mediaRecorder.start();
        } catch(e) {
          console.error("내부 녹음 실패", e);
        }
      }

      const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks);
            setUserAudioUrl(URL.createObjectURL(blob));
          };
          mediaRecorder.stop();
        }
      }

      recognizer.recognizeOnceAsync(
        (result) => {
          stopRecording();

          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            const pron = sdk.PronunciationAssessmentResult.fromResult(result)
            
            const finalResult = {
              score: pron.pronunciationScore,
              accuracy: pron.accuracyScore,
              fluency: pron.fluencyScore,
              completeness: pron.completenessScore,
              prosody: pron.prosodyScore || pron.pronunciationScore
            }
            setPronResult(finalResult)
            
            const wordsDetail = pron.detailResult?.Words || []
            
            const mappedWords: WordScoreDetail[] = wordsDetail.map((w: any) => ({
              text: w.Word,
              score: w.PronunciationAssessment.AccuracyScore,
              errorType: w.PronunciationAssessment.ErrorType,
              offsetSec: w.Offset ? w.Offset / 10000000 : 0, 
              durationSec: w.Duration ? w.Duration / 10000000 : 0,
              phonemes: w.Phonemes?.map((p: any) => ({
                phoneme: p.Phoneme,
                score: p.PronunciationAssessment.AccuracyScore
              })) || []
            }))
            
            setWordScores(mappedWords)
            
            if (finalResult.score >= 80) {
              setFeedback("correct")
            } else {
              setFeedback("wrong")
            }
          } else {
            alert("목소리가 너무 작거나 짧게 들렸어요. 화면에 '이제 말씀하세요!'가 뜨면 시작해 주세요.")
          }
          recognizer.close()
          setIsRecording(false)
          setIsMicReady(false)
        },
        (err) => {
          console.error("Azure 에러:", err)
          stopRecording();
          alert("마이크 접근이 거부되었거나 서버에 연결할 수 없습니다.")
          recognizer.close()
          setIsRecording(false)
          setIsMicReady(false)
        }
      )
    } catch (error) {
      console.error("발음 평가 초기화 실패:", error)
      setIsRecording(false)
      setIsMicReady(false)
    }
  }

  async function begin(list: QuizWord[]) {
    try {
      if (typeof window !== "undefined") {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel()
          const unlock = new SpeechSynthesisUtterance("") 
          unlock.volume = 0
          window.speechSynthesis.speak(unlock)
        }
        
        const audio = getGlobalAudio();
        if (audio) {
          audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
          audio.play().catch(() => {});
        }
      }
    } catch (e) {}

    let initialDeck = list
    let initialContext: ContextQuizItem[] = []

    if (quizType === "context" || quizType === "speaking") {
      setIsGenerating(true)
      setLoadingMsgIdx(0)
      
      const countToTake = quizType === "speaking" ? 5 : 10
      const d = shuffle(list).slice(0, countToTake) 
      const reqData = d.map(w => ({ word: w.word, meaning: w.meaning }))
      
      const res = await generateContextQuiz(reqData, quizType)
      setIsGenerating(false)
      
      if (!res.success || !res.quizData) {
        if ((res as any).isRateLimit) {
          alert("😴 AI 선생님이 너무 많이 일해서 잠시 쉬고 있어요!\n\n1~2분 뒤에 다시 시도해 주세요.")
        } else {
          alert("AI가 문제를 출제하다가 실수했어요! 다시 시도해 주세요.\n(에러: " + res.error + ")")
        }
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
      
      initialDeck = newDeck
      initialContext = newContextData
      setDeck(newDeck)
      setContextData(newContextData)
    } else {
      initialDeck = shuffle(list)
      setDeck(initialDeck)
    }

    setIndex(0)
    setValue("")
    setFeedback("idle")
    setAnswered([])
    setStreak(0)
    setBestStreak(0)
    setHintUsed(false)
    setUsedHintInQuiz(false)
    setPronResult(null)
    setWordScores([])
    setUserAudioUrl(null)
    setPhase("quiz")
    
    if (quizType !== "speaking") {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    
    if (quizType === "listening" && initialDeck.length > 0) {
      setTimeout(() => playPronunciation(initialDeck[0].word), 800)
    } else if (quizType === "speaking" && initialContext.length > 0 && initialDeck.length > 0) {
      setTimeout(() => playPronunciation(initialContext[0].sentence.replace(/___/g, initialDeck[0].word)), 800)
    }
  }

  function advance(record: Answered) {
    const nextAnswered = [...answered, record]
    const nextIndex = index + 1
    if (nextIndex < total) {
      setAnswered(nextAnswered); setIndex(nextIndex); setValue(""); setFeedback("idle"); setHintUsed(false); setPronResult(null); setWordScores([]); setUserAudioUrl(null);
      if (quizType !== "speaking") requestAnimationFrame(() => inputRef.current?.focus())
      
      if (quizType === "listening") {
        setTimeout(() => playPronunciation(deck[nextIndex].word), 300)
      } else if (quizType === "speaking" && contextData[nextIndex] && deck[nextIndex]) {
        setTimeout(() => playPronunciation(contextData[nextIndex].sentence.replace(/___/g, deck[nextIndex].word)), 300)
      }
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

    const isCorrect = guess === current.word.toLowerCase()

    if (isCorrect) {
      const newStreak = streak + 1
      setStreak(newStreak)
      setBestStreak((b) => Math.max(b, newStreak))
      setFeedback("correct")
      setHintUsed(true) 
      
      if (quizType !== "context" && quizType !== "speaking") {
        recordQuizResult(current.id, true).catch(console.error)
      }
    } else {
      setStreak(0)
      setFeedback("wrong")
      setHintUsed(true) 
      
      if (quizType !== "context" && quizType !== "speaking") {
        recordQuizResult(current.id, false).catch(console.error)
      }
    }
  }

  function handleUseHint() {
    setHintUsed(true)
    setUsedHintInQuiz(true)
  }

  const getFullSentence = () => {
    if (!contextData[index]) return ""
    return contextData[index].sentence.replace(/___/g, current.word)
  }

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

            <div className="flex justify-between items-center p-4 pb-0 shrink-0">
              <button 
                onClick={() => setIsSlowMode(!isSlowMode)} 
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors border",
                  isSlowMode ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {isSlowMode ? "🐢 느리게" : "🐇 보통 속도"}
              </button>
              
              <button 
                onClick={() => { if (window.confirm("퀴즈를 중단할까요?")) setPhase("start") }} 
                className="flex items-center gap-1 rounded-full bg-muted/50 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
              >
                나가기 <X className="size-3" />
              </button>
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

              {quizType === "speaking" && contextData[index] ? (
                <div className="mb-6 flex flex-col items-center justify-center w-full">
                  <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">AI 문장 말하기 훈련</span></div>
                  
                  <div className="mb-4 text-balance text-center text-3xl font-black tracking-tight text-foreground leading-snug flex flex-wrap justify-center gap-x-2 gap-y-4">
                    {wordScores.length > 0 ? (() => {
                      const fullSent = getFullSentence()
                      const availableScores = [...wordScores]
                      return fullSent.split(' ').map((token, i) => {
                        const cleanToken = token.replace(/[^a-zA-Z0-9']/g, '').toLowerCase()
                        let colorClass = "text-foreground"
                        let scoreItem: WordScoreDetail | null = null;
                        let isOmitted = false; 
                        
                        const scoreIdx = availableScores.findIndex(ws => ws.text.toLowerCase() === cleanToken)
                        if (scoreIdx !== -1) {
                          scoreItem = availableScores[scoreIdx]
                          
                          if (scoreItem.errorType === "Omission") {
                            colorClass = "text-red-400 dark:text-red-500 opacity-50"
                            isOmitted = true;
                          } else if (scoreItem.score >= 80) {
                            colorClass = "text-green-500 dark:text-green-400"
                          } else if (scoreItem.score >= 60) {
                            colorClass = "text-amber-500 dark:text-amber-400"
                          } else {
                            colorClass = "text-red-500 dark:text-red-400"
                          }
                          
                          availableScores.splice(scoreIdx, 1) 
                        }

                        const isTarget = cleanToken === current.word.toLowerCase()
                        const showPhonemes = scoreItem && (isTarget || scoreItem.score < 80);
                        
                        const isClickable = scoreItem && userAudioUrl && scoreItem.offsetSec !== undefined && !isOmitted;

                        return (
                          <span 
                            key={i} 
                            className={cn(
                              "inline-flex flex-col items-center align-top relative group",
                              isClickable && "cursor-pointer hover:bg-muted/50 rounded-lg px-1 transition-colors pb-1"
                            )}
                            onClick={() => {
                              if (isClickable) {
                                playUserWordAudio(scoreItem!.offsetSec!, scoreItem!.durationSec || 0.5)
                              }
                            }}
                            title={isClickable ? "👆 눌러서 내 발음 듣기" : undefined}
                          >
                            <span className={cn("transition-colors duration-500 leading-tight", colorClass, isTarget && "underline decoration-4 underline-offset-4")}>
                              {token}
                            </span>
                            
                            {isOmitted && (
                              <span className="mt-1 flex text-[11px] font-bold text-red-400 opacity-90 animate-in slide-in-from-top-1 fade-in duration-300">
                                (안 들림 💦)
                              </span>
                            )}

                            {!isOmitted && showPhonemes && scoreItem?.phonemes && scoreItem.phonemes.length > 0 && (
                              <span className="mt-1 flex gap-[2px] text-[13px] font-medium font-mono tracking-tighter opacity-90 animate-in slide-in-from-top-1 fade-in duration-300">
                                <span className="text-muted-foreground/40">[</span>
                                {scoreItem.phonemes.map((p, pIdx) => {
                                  let pColor = "text-red-500 font-black"
                                  if (p.score >= 80) pColor = "text-green-500"
                                  else if (p.score >= 60) pColor = "text-amber-500 font-black"
                                  
                                  return <span key={pIdx} className={pColor}>{p.phoneme}</span>
                                })}
                                <span className="text-muted-foreground/40">]</span>
                              </span>
                            )}
                          </span>
                        )
                      })
                    })() : (
                      getFullSentence().split(new RegExp(`(${current.word})`, 'gi')).map((part, i) => 
                        part.toLowerCase() === current.word.toLowerCase() ? (
                          <span key={i} className="text-indigo-600 dark:text-indigo-400 underline decoration-4 underline-offset-4">{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )
                    )}
                  </div>
                  
                  {pronResult && userAudioUrl && (
                    <p className="text-[12px] font-bold text-indigo-500 animate-in fade-in zoom-in mb-4 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
                      👆 단어를 톡! 터치하면 내가 말한 발음을 들을 수 있어요
                    </p>
                  )}

                  <p className="text-sm font-semibold text-muted-foreground mb-6 text-center">
                    🇰🇷 {contextData[index].translation}
                  </p>

                  <div className="flex flex-col items-center gap-3 w-full">
                    <div className="flex gap-3">
                      <button type="button" onClick={() => playPronunciation(getFullSentence())} className="flex size-14 items-center justify-center rounded-full bg-muted text-foreground shadow-sm transition-transform hover:scale-105">
                        <Volume2 className="size-6" />
                      </button>
                      
                      <button 
                        type="button" 
                        onClick={() => handlePronunciationAssessment(getFullSentence())}
                        disabled={isRecording}
                        className={cn("flex items-center gap-2 rounded-full px-6 py-2 font-black text-white shadow-lg transition-all active:scale-95 min-w-[200px] justify-center", 
                          isRecording && !isMicReady ? "bg-amber-500 opacity-90" : 
                          isRecording && isMicReady ? "bg-red-500 animate-pulse scale-105" : 
                          (pronResult ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:scale-105" : "bg-gradient-to-r from-indigo-500 to-blue-600 hover:scale-105")
                        )}
                      >
                        {isRecording && !isMicReady && <Loader2 className="size-5 animate-spin" />}
                        {isRecording && isMicReady && <Mic className="size-5 animate-bounce" />}
                        {!isRecording && <Mic className="size-5" />}
                        
                        {isRecording && !isMicReady ? "마이크 연결 중..." : 
                         isRecording && isMicReady ? "🔴 이제 말씀하세요!" : 
                         (pronResult ? "다시 한번 채점하기" : "내 발음 채점하기")}
                      </button>
                    </div>
                    {!pronResult && <p className="text-[11px] font-semibold text-muted-foreground animate-in fade-in">💡 스피커 버튼을 누르면 다시 들을 수 있어요</p>}
                    {pronResult && <p className="text-[11px] font-semibold text-muted-foreground animate-in fade-in">💡 빨간색 단어를 신경 써서 다시 연습해 보세요!</p>}
                  </div>
                  
                  {pronResult && (
                    <div className="mt-6 flex flex-col w-full items-center animate-in zoom-in duration-300">
                      <div className="grid grid-cols-4 gap-2 w-full max-w-sm mb-4">
                        <div className="flex flex-col items-center justify-center p-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">정확도</span>
                          <span className="text-xl font-black text-blue-500">{Math.round(pronResult.accuracy)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">유창성</span>
                          <span className="text-xl font-black text-indigo-500">{Math.round(pronResult.fluency)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">완전성</span>
                          <span className="text-xl font-black text-amber-500">{Math.round(pronResult.completeness)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">억양</span>
                          <span className="text-xl font-black text-purple-500">{Math.round(pronResult.prosody)}</span>
                        </div>
                      </div>
                      
                      <p className="mt-1 text-[15px] font-black text-foreground">
                        {pronResult.score >= 90 ? "🏆 Perfect! 원어민처럼 완벽해요!" :
                         pronResult.score >= 80 ? "✨ Excellent! 아주 훌륭해요!" :
                         pronResult.score >= 60 ? "👍 Good! 조금만 더 연습해볼까요?" :
                         "💪 Try Again! 다시 한번 또박또박 읽어보세요!"}
                      </p>

                      {pronResult.prosody < 90 && contextData[index].guide && (
                        <div className="mt-4 w-full animate-in slide-in-from-top-2 fade-in duration-500 rounded-xl bg-indigo-50/80 dark:bg-indigo-900/20 p-4 border border-indigo-100 dark:border-indigo-800/30 text-center shadow-inner">
                          <p className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 mb-1.5 flex items-center justify-center gap-1.5">
                            <Lightbulb className="size-3.5" /> 리듬을 타며 다시 읽어볼까요?
                          </p>
                          <p className="text-base sm:text-lg font-black text-indigo-900 dark:text-indigo-100 tracking-wide">
                            {contextData[index].guide}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-indigo-400/80 dark:text-indigo-500">
                            대문자는 세게, 슬래시(/)에서는 쉬어보세요
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : quizType === "context" && contextData[index] ? (
                <div className="mb-4 flex flex-col items-center justify-center w-full">
                  <div className="mb-3 flex justify-center"><span className="rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground">{current.subject}</span></div>
                  <h2 className="mb-6 text-balance text-center text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-snug">
                    {contextData[index].sentence.split('___').map((part: string, i: number, arr: any[]) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          feedback === "idle" ? (
                            <span className="mx-1 inline-block w-12 sm:w-16 border-b-4 border-foreground align-baseline relative top-[0.2em]" />
                          ) : (
                            <span className={cn("mx-1 px-1 font-black underline decoration-4 underline-offset-4", feedback === "correct" ? "text-green-500 decoration-green-500/30" : "text-red-500 decoration-red-500/30")}>
                              {current.word}
                            </span>
                          )
                        )}
                      </React.Fragment>
                    ))}
                  </h2>
                  
                  {contextData[index].options && (
                    <div className="w-full rounded-xl bg-muted/40 p-3 mb-2 flex flex-wrap justify-center gap-2 border border-border">
                      {contextData[index].options.map((opt: string, i: number) => (
                        <span 
                          key={i} 
                          className="px-3 py-1.5 bg-card rounded-lg text-sm font-bold text-foreground shadow-sm border border-border/50"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                quizType === "standard" ? (
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
                )
              )}

              {quizType !== "speaking" && (
                <div className="mb-4 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/50 p-4 h-auto transition-all">
                  {quizType === "context" ? (
                    <div className="text-center w-full">
                      {hintUsed || feedback !== "idle" ? (
                        <div className="flex flex-col items-center gap-3 animate-in fade-in duration-200">
                          <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-bold text-foreground">🇰🇷 해석: {contextData[index].translation}</p>
                            {contextData[index].clue && (
                              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">💡 AI 선생님 해설: {contextData[index].clue}</p>
                            )}
                          </div>
                          
                          {feedback !== "idle" && (
                            <button type="button" onClick={() => playPronunciation(getFullSentence())} className="mt-2 flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-white shadow-md transition-transform hover:scale-105 active:scale-95" style={{ backgroundColor: accent }}>
                              <Volume2 className="size-5" /> 문장 듣고 따라하기
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-muted-foreground">해석과 힌트를 보려면 아래 힌트 버튼을 눌러 주세요.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-pretty text-center font-serif italic leading-relaxed text-muted-foreground">
                      {hintUsed ? quizType === "listening" ? `뜻: ${current.meaning}` : current.example ? current.example.replace(new RegExp(current.word, "gi"), (m) => `${m[0]}${"·".repeat(Math.max(0, m.length - 1))}`) : `첫 글자: ${current.word[0]} (${current.word.length}글자)` : "힌트를 보려면 아래 힌트 버튼을 눌러 주세요."}
                    </p>
                  )}
                  {hintUsed && quizType === "standard" && <button type="button" onMouseDown={(e) => { e.preventDefault(); playPronunciation(current.word); }} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 shadow-sm" style={{ backgroundColor: accent, color: "white" }}><Volume2 className="size-4" /> 단어 듣기</button>}
                </div>
              )}

              {quizType !== "speaking" && (
                <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (feedback === "idle") submit(); else advance({ word: current, correct: feedback === "correct" }); } }} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={feedback !== "idle"} placeholder="영단어를 입력하세요" className={cn("mb-2 w-full border-b-4 bg-transparent p-3 text-center text-3xl font-bold outline-none transition-colors placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground", feedback === "idle" && "border-border text-foreground", feedback === "correct" && "border-green-500 text-green-600", feedback === "wrong" && "animate-shake border-red-500 text-red-500")} style={feedback === "idle" ? { caretColor: accent } : undefined} />
              )}
              
              <div className="mb-4 flex min-h-6 items-center justify-center">
                {feedback === "correct" && quizType !== "speaking" && <p className="flex items-center gap-1.5 text-sm font-semibold text-green-600"><Check className="size-4" /> 정답입니다!</p>}
                {feedback === "wrong" && quizType !== "speaking" && <p className="flex items-center gap-1.5 text-sm font-semibold text-red-500"><X className="size-4" /> 정답: {current.word}</p>}
                {feedback === "idle" && hintUsed && quizType === "standard" && <p className="text-sm text-muted-foreground">첫 글자: <span className="font-bold text-foreground">{current.word[0]}</span></p>}
              </div>

              {quizType === "speaking" ? (
                <button 
                  onClick={() => {
                    if (feedback === "correct") {
                      const newStreak = streak + 1
                      setStreak(newStreak)
                      setBestStreak((b) => Math.max(b, newStreak))
                    } else {
                      setStreak(0)
                    }
                    advance({ word: current, correct: feedback === "correct" })
                  }}
                  disabled={feedback === "idle"}
                  className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors disabled:opacity-30", feedback !== "idle" ? "bg-foreground text-background hover:opacity-90 shadow-md" : "bg-muted text-muted-foreground")}
                >
                  {feedback === "idle" && "마이크로 문장을 읽어주세요"}
                  {feedback !== "idle" && "이만하면 됐어요! 다음 문장으로 ➔"}
                </button>
              ) : (
                <button 
                  onClick={() => {
                    if (feedback === "idle") submit()
                    else advance({ word: current, correct: feedback === "correct" })
                  }} 
                  disabled={feedback === "idle" && !value.trim()} 
                  className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-colors disabled:opacity-60", feedback === "correct" && "bg-green-500 hover:bg-green-600", feedback === "wrong" && "bg-red-500 hover:bg-red-600")} 
                  style={feedback === "idle" ? { backgroundColor: accent } : undefined}
                >
                  {feedback === "idle" && <>정답 확인 <ArrowRight className="size-5" /></>}
                  {feedback === "correct" && <>잘했어요! (다음 문제로 ➔)</>}
                  {feedback === "wrong" && <>{quizType === "context" ? "해설 확인 후 다음 문제로 ➔" : "정답 확인 후 다음 문제로 ➔"}</>}
                </button>
              )}

              {quizType !== "speaking" && (
                <button onClick={handleUseHint} disabled={hintUsed || feedback !== "idle"} className="mt-3 mb-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"><Lightbulb className="size-4" /> 힌트 보기</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={cn("overflow-hidden rounded-3xl border border-border bg-card shadow-sm", phase === "quiz" ? "hidden" : "block")}>
        {phase === "start" && (
          <QuizStart words={words} accent={accent} quizType={quizType} setQuizType={setQuizType} isGenerating={isGenerating} onBegin={() => begin(words)} />
        )}
        {phase === "result" && (
          <QuizResult score={score} correctCount={correctCount} total={total} bestStreak={bestStreak} wrongWords={wrongWords} accent={accent} usedHint={usedHintInQuiz} quizType={quizType} onRetryWrong={() => begin(wrongWords)} onRetryAll={() => begin(words)} />
        )}
      </div>
    </>
  )
}
