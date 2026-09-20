"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import { Lightbulb, Check, X, ArrowRight, Volume2, Sparkles, BrainCircuit, Mic, Loader2, Headphones } from "lucide-react"
import { cn } from "@/lib/utils"
import { recordQuizResult, generateContextQuiz, generateSpeakingCoachFeedback } from "@/app/actions/words"
import confetti from "canvas-confetti"

import { QuizStart } from "./quiz-start"
import { QuizResult } from "./quiz-result"

const DAD_PHONE = "01032854101" 

const TTS_VOICES = [
  { id: "en-US-AnaNeural", label: "👧 Ana (아동)" },
  { id: "en-US-JennyNeural", label: "👩 Jenny (여성)" },
  { id: "en-US-GuyNeural", label: "👨 Guy (남성)" },
  { id: "en-US-AriaNeural", label: "👩 Aria (표준)" },
]

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

let activeAudioSource: AudioBufferSourceNode | null = null;
let activeTimeout: any = null;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function WordQuiz({ words, accent, isMonsterMode = false }: { words: QuizWord[]; accent: string; isMonsterMode?: boolean }) {
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
  
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null)
  const [isCoachLoading, setIsCoachLoading] = useState(false)
  
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null)
  const [isSlowMode, setIsSlowMode] = useState(false)
  const [ttsVoice, setTtsVoice] = useState<string>("en-US-AnaNeural")

  useEffect(() => {
    const savedVoice = localStorage.getItem("word_quiz_tts_voice");
    if (savedVoice && TTS_VOICES.some(v => v.id === savedVoice)) {
      setTtsVoice(savedVoice);
    }
  }, []);

  const handleTtsVoiceChange = (newVoice: string) => {
    setTtsVoice(newVoice);
    localStorage.setItem("word_quiz_tts_voice", newVoice);
  };

  const current = deck[index]
  const total = deck.length
  const currentName = accent === "#6366f1" || accent === "#a78bfa" || accent === "#c4b5fd" ? "지온" : "예온"

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
      if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
      if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }

      const cleanTargetText = targetText.replace(/\s*\/\s*/g, ' ').trim();
      const audio = getGlobalAudio();
      const cacheKey = `${cleanTargetText}_${ttsVoice}_${isSlowMode ? 'slow' : 'normal'}`;

      if (audio && ttsCache.has(cacheKey)) {
        audio.src = ttsCache.get(cacheKey)!;
        audio.play().catch((e) => {
          console.error("캐시 오디오 재생 실패:", e);
          fallbackTTS(cleanTargetText);
        });
        return;
      }

      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) {
        fallbackTTS(cleanTargetText)
        return
      }

      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
      
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null)
      const safeText = cleanTargetText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const speedRate = isSlowMode ? "-20%" : "0%";
      
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${ttsVoice}">
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
                fallbackTTS(cleanTargetText);
              });
            } else {
              fallbackTTS(cleanTargetText);
            }
          } else {
            console.warn("Azure TTS 합성 실패, 기본 TTS로 전환합니다.")
            fallbackTTS(cleanTargetText)
          }
          synthesizer.close()
        },
        (err) => {
          console.error("Azure TTS 통신 에러:", err)
          fallbackTTS(cleanTargetText)
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
      const cleanText = text.replace(/\s*\/\s*/g, ' ').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText)
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

      if (activeAudioSource) {
        try { activeAudioSource.stop(); } catch(e) {}
        activeAudioSource.disconnect();
        activeAudioSource = null;
      }

      const res = await fetch(userAudioUrl);
      const arrayBuffer = await res.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(ctx.destination);
      
      const start = offsetSec;
      const dur = Math.max(0.1, durationSec); 
      
      activeAudioSource = source;
      source.start(0, start, dur);
    } catch(e) {
      console.error("단어 부분 재생 실패:", e);
    }
  }

  async function playComparison(targetText: string, offsetSec: number, durationSec: number) {
    playPronunciation(targetText);
    
    if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }

    const wordCount = targetText.trim().split(/\s+/).length;
    const estimatedTtsMs = wordCount * 600 + 800; 
    const delay = Math.max(estimatedTtsMs, durationSec * 1000 + 500);
    
    activeTimeout = setTimeout(() => {
      playUserWordAudio(offsetSec, durationSec);
    }, delay);
  }

  async function playFullUserAudio() {
    if (!userAudioUrl) return;
    try {
      if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
      if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }
      const audio = getGlobalAudio();
      if (audio) { audio.pause(); audio.currentTime = 0; }

      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch(userAudioUrl);
      const arrayBuffer = await res.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(ctx.destination);
      
      activeAudioSource = source;
      source.start(0);
    } catch (e) {
      console.error("전체 녹음 Web Audio 재생 실패:", e);
    }
  }

  async function handlePronunciationAssessment(targetText: string) {
    if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
    if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }

    setIsRecording(true)
    setIsMicReady(false)
    setPronResult(null)
    setWordScores([]) 
    setFeedback("idle")
    setAiCoachMsg(null)
    setUserAudioUrl(null)

    const cleanTargetText = targetText.replace(/\s*\/\s*/g, ' ').trim();

    let mediaStream: MediaStream | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];

    try {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) {
        alert("아빠에게 알려주세요: Azure 발음 평가 키가 등록되지 않았습니다.")
        setIsRecording(false)
        return
      }

      mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechRecognitionLanguage = "en-US"
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1200");

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()

      const pronConfig = new sdk.PronunciationAssessmentConfig(
        cleanTargetText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )
      
      pronConfig.enableProsodyAssessment = true;

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.start();

      recognizer.sessionStarted = (s, e) => {
        setIsMicReady(true)
      }

      const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
            setUserAudioUrl(URL.createObjectURL(blob));
          };
          mediaRecorder.stop();
          mediaRecorder = null;
        }
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          mediaStream = null;
        }
      }

      recognizer.recognizeOnceAsync(
        async (result) => {
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
              offsetSec: typeof w.Offset === 'number' ? w.Offset / 10000000 : undefined, 
              durationSec: typeof w.Duration === 'number' ? w.Duration / 10000000 : undefined,
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

            setIsCoachLoading(true);
            const coachRes = await generateSpeakingCoachFeedback({
              sentence: cleanTargetText,
              childName: currentName,
              pronResult: finalResult,
              wordScores: mappedWords
            });
            setIsCoachLoading(false);

            if (coachRes.success && coachRes.feedback) {
              setAiCoachMsg(coachRes.feedback);
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
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false)
      setIsMicReady(false)
    }
  }

  function retryTest(onlyWrong: boolean) {
    if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
    if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }

    let nextDeck = deck;
    let nextContext = contextData;

    if (onlyWrong) {
      nextDeck = answered.filter((a) => !a.correct).map((a) => a.word);
      if (quizType === "context" || quizType === "speaking") {
        nextContext = nextDeck.map(w => 
          contextData.find(c => c.word.toLowerCase() === w.word.toLowerCase())!
        ).filter(Boolean);
      }
    }

    setDeck(nextDeck);
    if (quizType === "context" || quizType === "speaking") {
      setContextData(nextContext);
    }

    setIndex(0);
    setValue("");
    setFeedback("idle");
    setAnswered([]);
    setStreak(0);
    setBestStreak(0);
    setHintUsed(false);
    setUsedHintInQuiz(false);
    setPronResult(null);
    setWordScores([]);
    setAiCoachMsg(null);
    setUserAudioUrl(null);
    setPhase("quiz");

    if (quizType !== "speaking") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    
    if (quizType === "listening" && nextDeck.length > 0) {
      setTimeout(() => playPronunciation(nextDeck[0].word), 800);
    } else if (quizType === "speaking" && nextContext.length > 0 && nextDeck.length > 0) {
      setTimeout(() => playPronunciation(nextContext[0].sentence.replace(/___/g, nextDeck[0].word)), 800);
    }
  }

  async function begin(list: QuizWord[]) {
    try {
      if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
      if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }
      
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
    setAiCoachMsg(null)
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
    if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
    if (activeAudioSource) { try { activeAudioSource.stop(); } catch(e){} activeAudioSource = null; }

    const nextAnswered = [...answered, record]
    const nextIndex = index + 1
    if (nextIndex < total) {
      setAnswered(nextAnswered); setIndex(nextIndex); setValue(""); setFeedback("idle"); setHintUsed(false); setPronResult(null); setWordScores([]); setAiCoachMsg(null); setUserAudioUrl(null);
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
            <BrainCircuit className="size-14 animate-pulse" style={{ color: accent }} />
            <Sparkles className="absolute -top-2 -right-2 size-8 text-amber-400 animate-bounce" />
          </div>
          <h3 className="mb-2 text-xl font-black text-foreground tracking-tight">AI 시험지 제작 중</h3>
          <p className="min-h-6 text-sm font-bold text-muted-foreground animate-in slide-in-from-bottom-2 fade-in duration-300">
            {loadingMessages[loadingMsgIdx]}
          </p>
          <div className="mt-8 flex gap-1.5">
            <div className="size-2.5 rounded-full animate-bounce" style={{ animationDelay: "0ms", backgroundColor: accent }} />
            <div className="size-2.5 rounded-full animate-bounce" style={{ animationDelay: "150ms", backgroundColor: accent }} />
            <div className="size-2.5 rounded-full animate-bounce" style={{ animationDelay: "300ms", backgroundColor: accent }} />
          </div>
        </div>
      )}

      {phase === "quiz" && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background sm:bg-background/95 sm:backdrop-blur-sm sm:p-6 animate-in fade-in duration-200">
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[850px] sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl transition-all duration-500" style={streak >= 5 ? { boxShadow: "0 0 30px rgba(245, 158, 11, 0.4)", borderColor: "#f59e0b" } : undefined}>
            <div className="h-1.5 w-full bg-muted shrink-0">
              <div className="h-1.5 transition-all duration-300" style={{ width: `${((index + 1) / total) * 100}%`, backgroundColor: streak >= 5 ? "#f59e0b" : accent }} />
            </div>

            <div className="flex justify-between items-center p-4 pb-0 shrink-0 gap-2">
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setIsSlowMode(!isSlowMode)} 
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors border",
                    !isSlowMode && "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  )}
                  style={isSlowMode ? { backgroundColor: accent + '1A', borderColor: accent + '33', color: accent } : undefined}
                >
                  {isSlowMode ? "🐢 느리게" : "🐇 보통"}
                </button>
                <select
                  value={ttsVoice}
                  onChange={(e) => handleTtsVoiceChange(e.target.value)}
                  className="rounded-full bg-muted/50 border border-transparent px-2.5 py-1 text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-muted cursor-pointer"
                >
                  {TTS_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <button 
                onClick={() => { if (window.confirm("퀴즈를 중단할까요?")) setPhase("start") }} 
                className="flex items-center gap-1 rounded-full bg-muted/50 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
              >
                나가기 <X className="size-3" />
              </button>
            </div>

            <div className="flex flex-col px-6 pb-8 pt-2 flex-1 overflow-y-auto">
              
              {quizType === "speaking" ? (
                <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Mic className="size-4" style={{ color: accent }} /> <span className="font-bold text-foreground">스피킹 훈련</span></span>
                  <span className="rounded-full px-4 py-1 font-black border shadow-sm" style={{ color: accent, backgroundColor: accent + '1A', borderColor: accent + '33' }}>
                    {index + 1} / {total}
                  </span>
                  <span className="flex items-center gap-1 font-bold text-amber-500 animate-pulse"><Sparkles className="size-4" /> 자신감 UP!</span>
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>점수 <span className="font-bold text-foreground">{score}</span></span>
                  <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground">{index + 1} / {total}</span>
                  <span className={cn(streak >= 5 && "text-orange-500 animate-pulse font-bold")}>연속 <span className="font-black text-sm" style={streak >= 5 ? {} : { color: accent }}>{streak}</span></span>
                </div>
              )}

              <div className="h-8 w-full flex justify-center mb-2">
                {quizType !== "speaking" && streak >= 3 && (
                  <div key={streak} className="animate-in slide-in-from-bottom-2 fade-in zoom-in duration-300">
                    <span className={cn("rounded-full px-4 py-1.5 text-sm font-black text-white shadow-lg", streak >= 10 ? "bg-gradient-to-r from-red-500 to-orange-600 scale-110 shadow-red-500/50" : "bg-gradient-to-r from-amber-400 to-orange-500 shadow-orange-500/40")}>
                      {streak >= 10 ? `🔥🔥 ${currentName} 폭주 중!! 멈출 수 없어!` : `🔥 ${currentName} ${streak}연속 정답!`}
                    </span>
                  </div>
                )}
              </div>

              {quizType === "speaking" && contextData[index] ? (
                <div className="mb-4 flex flex-col items-center justify-center w-full">
                  
                  {wordScores.length > 0 ? (
                    <div className="mb-6 text-center text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-relaxed flex flex-wrap justify-center items-baseline gap-x-1 gap-y-2 px-1">
                      {(() => {
                        const fullSent = getFullSentence()
                        const availableScores = [...wordScores]
                        
                        let rawChunks = fullSent.split('/').map(c => c.trim()).filter(Boolean);
                        if (rawChunks.length === 1 && fullSent.split(' ').length > 3) {
                          const words = fullSent.split(' ');
                          rawChunks = [];
                          for (let i = 0; i < words.length; i += 3) {
                            rawChunks.push(words.slice(i, i + 3).join(' '));
                          }
                        }

                        return rawChunks.map((chunkStr, cIdx) => {
                          const chunkWords = chunkStr.split(' ');

                          let chunkStartSec = 9999;
                          let chunkEndSec = 0;
                          let isChunkOmitted = true;

                          const renderedWords = chunkWords.map((token, i) => {
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
                              } else {
                                isChunkOmitted = false;
                                if (scoreItem.offsetSec !== undefined) {
                                  chunkStartSec = Math.min(chunkStartSec, scoreItem.offsetSec);
                                  chunkEndSec = Math.max(chunkEndSec, scoreItem.offsetSec + (scoreItem.durationSec || 0));
                                }

                                if (scoreItem.score >= 80) colorClass = "text-green-500 dark:text-green-400"
                                else if (scoreItem.score >= 60) colorClass = "text-amber-500 dark:text-amber-400"
                                else colorClass = "text-red-500 dark:text-red-400"
                              }
                              availableScores.splice(scoreIdx, 1) 
                            }

                            const isTarget = cleanToken === current.word.toLowerCase()
                            const showPhonemes = scoreItem && (isTarget || scoreItem.score < 80);

                            return (
                              <span key={i} className="relative inline-flex items-center align-baseline px-0.5">
                                <span 
                                  className={cn("transition-colors duration-500 leading-tight", colorClass !== "text-foreground" ? colorClass : "", isTarget && "underline decoration-4 underline-offset-4")}
                                  style={colorClass === "text-foreground" && isTarget ? { color: accent, textDecorationColor: accent } : undefined}
                                >
                                  {token}
                                </span>
                                {isOmitted && (
                                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] font-bold text-red-400 opacity-90 whitespace-nowrap z-10">
                                    (누락)
                                  </span>
                                )}
                                {!isOmitted && showPhonemes && scoreItem?.phonemes && scoreItem.phonemes.length > 0 && (
                                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 flex gap-[1px] text-[12px] font-medium font-mono tracking-tighter opacity-90 whitespace-nowrap z-10">
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
                          });

                          const isClickable = !isChunkOmitted && userAudioUrl && chunkStartSec !== 9999;
                          const chunkDuration = Math.max(0.1, chunkEndSec - chunkStartSec - 0.02);

                          return (
                            <React.Fragment key={cIdx}>
                              {cIdx > 0 && <span className="text-muted-foreground/30 mx-1 align-baseline text-3xl font-light">/</span>}

                              <span
                                className={cn(
                                  "inline-flex flex-wrap items-baseline justify-center max-w-full group rounded-2xl px-2.5 transition-all duration-200 relative",
                                  "pt-2 pb-5 gap-x-1 gap-y-3 my-0",
                                  isClickable ? "cursor-pointer bg-card hover:bg-muted/80 shadow-sm border border-border/50 active:scale-[0.98]" : "border border-transparent"
                                )}
                                onClick={() => {
                                  if (isClickable) {
                                    playComparison(chunkStr.replace(/[^a-zA-Z0-9' ]/g, ''), chunkStartSec, chunkDuration)
                                  }
                                }}
                              >
                                {renderedWords}
                                {isClickable && (
                                  <span 
                                    className="inline-flex self-center items-center justify-center rounded-full p-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ backgroundColor: accent + '1A', color: accent }}
                                  >
                                    <Volume2 className="size-3" />
                                  </span>
                                )}
                              </span>
                            </React.Fragment>
                          )
                        })
                      })()}
                    </div>
                  ) : (
                    <div className="mb-6 text-balance text-center text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-relaxed px-1">
                      {getFullSentence().replace(/\s*\/\s*/g, ' ').split(new RegExp(`(${current.word})`, 'gi')).map((part, i) => 
                        part.toLowerCase() === current.word.toLowerCase() ? (
                          <span key={i} className="underline decoration-4 underline-offset-4" style={{ color: accent, textDecorationColor: accent }}>{part}</span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )}
                    </div>
                  )}
                  
                  <p className="text-base font-semibold text-muted-foreground mb-6 text-center px-4 leading-relaxed">
                    🇰🇷 {contextData[index].translation}
                  </p>

                  {pronResult && userAudioUrl && (
                    <div 
                      className="mb-4 flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold border animate-in fade-in zoom-in"
                      style={{ color: accent, backgroundColor: accent + '1A', borderColor: accent + '33' }}
                    >
                      👆 덩어리(청크)를 톡! 터치하면 구 단위로 비교하며 들을 수 있어요
                    </div>
                  )}

                  <div className="flex flex-col gap-2 w-full max-w-sm mb-2">
                    <div className="flex gap-2 w-full">
                      <button type="button" onClick={() => playPronunciation(getFullSentence())} className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground shadow-sm transition-transform hover:scale-105 active:scale-95">
                        <Volume2 className="size-5" />
                      </button>
                      
                      <button 
                        type="button" 
                        onClick={() => handlePronunciationAssessment(getFullSentence())}
                        disabled={isRecording}
                        className={cn("flex flex-1 items-center gap-2 rounded-2xl px-4 py-3 font-black text-white shadow-md transition-all active:scale-95 justify-center text-sm", 
                          isRecording && !isMicReady ? "bg-amber-500 opacity-90" : 
                          isRecording && isMicReady ? "bg-red-500 animate-pulse scale-105" : 
                          (pronResult ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:scale-105" : "hover:scale-105")
                        )}
                        style={(!isRecording && !pronResult) ? { backgroundColor: accent } : undefined}
                      >
                        {isRecording && !isMicReady && <Loader2 className="size-4 animate-spin" />}
                        {isRecording && isMicReady && <Mic className="size-4 animate-bounce" />}
                        {!isRecording && <Mic className="size-4" />}
                        
                        {isRecording && !isMicReady ? "연결 중..." : 
                         isRecording && isMicReady ? "🔴 이제 말씀하세요!" : 
                         (pronResult ? "다시 한번 채점하기" : "내 발음 채점하기")}
                      </button>
                    </div>

                    {pronResult && userAudioUrl && (
                      <button
                        type="button"
                        onClick={playFullUserAudio}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 font-bold text-sm shadow-sm transition-transform hover:opacity-80 active:scale-95 animate-in fade-in"
                        style={{ color: accent, backgroundColor: accent + '1A' }}
                      >
                        <Headphones className="size-4" /> 내 전체 녹음 듣기
                      </button>
                    )}
                  </div>
                  
                  {pronResult && (
                    <div className="mt-2 flex flex-col w-full items-center animate-in zoom-in duration-300">
                      <div className="grid grid-cols-4 gap-1.5 w-full max-w-sm mb-3">
                        <div className="flex flex-col items-center justify-center py-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">정확도</span>
                          <span className="text-lg font-black text-blue-500">{Math.round(pronResult.accuracy)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center py-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">유창성</span>
                          <span className="text-lg font-black text-indigo-500">{Math.round(pronResult.fluency)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center py-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">완전성</span>
                          <span className="text-lg font-black text-amber-500">{Math.round(pronResult.completeness)}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center py-2 bg-muted/80 rounded-xl border border-border/50">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">억양</span>
                          <span className="text-lg font-black text-purple-500">{Math.round(pronResult.prosody)}</span>
                        </div>
                      </div>
                      
                      <p className="text-[14px] font-black text-foreground mb-2">
                        {pronResult.score >= 90 ? "✨ Perfect! 원어민처럼 완벽해요!" :
                         pronResult.score >= 80 ? "✨ Excellent! 아주 훌륭해요!" :
                         pronResult.score >= 60 ? "👍 Good! 조금만 더 연습해볼까요?" :
                         "💪 Try Again! 다시 한번 또박또박 읽어보세요!"}
                      </p>

                      {(isCoachLoading || aiCoachMsg) && (
                        <div 
                          className="w-full max-w-sm animate-in slide-in-from-top-2 fade-in duration-500 rounded-2xl p-3.5 border text-center shadow-inner mt-2"
                          style={{ backgroundColor: accent + '0D', borderColor: accent + '33' }}
                        >
                          <p className="text-[11px] font-bold mb-1 flex items-center justify-center gap-1.5" style={{ color: accent }}>
                            <Sparkles className="size-3.5 animate-spin" /> AI 선생님의 맞춤 코칭
                          </p>

                          {isCoachLoading ? (
                            <p className="text-xs font-semibold text-muted-foreground animate-pulse py-1">
                              🤖 {currentName}이의 발음을 정밀 분석해서 코칭을 작성하는 중...
                            </p>
                          ) : (
                            <p className="text-[13px] sm:text-sm font-bold tracking-wide mt-1 text-foreground leading-relaxed">
                              {aiCoachMsg}
                            </p>
                          )}
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
          <QuizStart words={words} accent={accent} quizType={quizType} setQuizType={setQuizType} isGenerating={isGenerating} onBegin={() => begin(words)} isMonsterMode={isMonsterMode} />
        )}
        {phase === "result" && (
          <QuizResult 
            score={score} 
            correctCount={correctCount} 
            total={total} 
            bestStreak={bestStreak} 
            wrongWords={wrongWords} 
            accent={accent} 
            usedHint={usedHintInQuiz} 
            quizType={quizType} 
            onRetryWrong={() => retryTest(true)} 
            onRetryAll={() => retryTest(false)} 
          />
        )}
      </div>
    </>
  )
}
