"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import { Mic, Upload, Play, Sparkles, Loader2, Save, FolderOpen, Trash2, Edit3, Square, Brain } from "lucide-react"
import confetti from "canvas-confetti"
// 💡 방금 추가한 translateScriptWithGemini 불러오기 추가
import { extractSpeechScriptWithGemini, generateSpeakingCoachFeedback, translateScriptWithGemini } from "@/app/actions/words"
import { cn } from "@/lib/utils"

interface ScriptTrainerProps {
  accent: string
  profileName: string
}

interface SavedScript {
  id: string
  title: string
  script: string
  date: string
}

const TTS_VOICES = [
  { id: "en-US-AnaNeural", label: "👧 Ana (아동)" },
  { id: "en-US-JennyNeural", label: "👩 Jenny (여성)" },
  { id: "en-US-GuyNeural", label: "👨 Guy (남성)" },
  { id: "en-US-AriaNeural", label: "👩 Aria (표준)" },
]

export function ScriptTrainer({ accent, profileName }: ScriptTrainerProps) {
  const [activeTab, setActiveTab] = useState<"practice" | "archive">("practice")
  const [script, setScript] = useState("")
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([])
  const [ttsVoice, setTtsVoice] = useState<string>("en-US-AnaNeural")
  
  // 💡 훈련 모드 상태 및 한 문장씩 쪼개기
  const [trainingMode, setTrainingMode] = useState<"full" | "step" | "interpret">("full")
  const [memoLevel, setMemoLevel] = useState<number>(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [koTranslations, setKoTranslations] = useState<string[]>([])
  const [isTranslating, setIsTranslating] = useState(false)

  const sentences = useMemo(() => {
    if (!script) return []
    const match = script.match(/[^.!?]+[.!?]+/g)
    if (match) return match.map(s => s.trim()).filter(Boolean)
    return [script.trim()]
  }, [script])
  
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsSessionId = useRef<number>(0)
  
  const [isRecording, setIsRecording] = useState(false)
  const [isMicReady, setIsMicReady] = useState(false)
  const [isProcessingResult, setIsProcessingResult] = useState(false)
  const [recognizerInstance, setRecognizerInstance] = useState<any>(null)
  const assessmentDataRef = useRef({ totalScore: 0, totalAcc: 0, totalFluency: 0, totalComp: 0, totalProsody: 0, chunks: 0, allWords: [] as any[] })

  const [pronResult, setPronResult] = useState<any>(null)
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null)
  const [isCoachLoading, setIsCoachLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(`saved_scripts_${profileName}`)
    if (saved) setSavedScripts(JSON.parse(saved))
    const savedVoice = localStorage.getItem("script_tts_voice")
    if (savedVoice) setTtsVoice(savedVoice)
    
    return () => {
      if (recognizerInstance) { try { recognizerInstance.close() } catch(e) {} }
      stopTTS()
    }
  }, [profileName, recognizerInstance])

  useEffect(() => {
    if (trainingMode === "full" && memoLevel === 0 && textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [script, memoLevel, trainingMode])

  // 대본이 바뀌면 번역 데이터와 스텝을 초기화
  useEffect(() => {
    setKoTranslations([])
    setStepIndex(0)
    setTrainingMode("full")
  }, [script])

  const saveCurrentScript = () => {
    if (!script.trim()) return alert("저장할 대본 내용이 없습니다.")
    const title = prompt("이 대본의 제목을 입력하세요 (예: 학원 발표 숙제)")
    if (!title) return

    const newScript: SavedScript = {
      id: Date.now().toString(),
      title: title.trim(),
      script: script.trim(),
      date: new Date().toLocaleDateString("ko-KR")
    }
    const updated = [newScript, ...savedScripts]
    setSavedScripts(updated)
    localStorage.setItem(`saved_scripts_${profileName}`, JSON.stringify(updated))
    alert(`[${title}] 대본이 보관함에 저장되었습니다! 📁`)
  }

  const deleteScript = (id: string) => {
    if (!confirm("이 대본을 삭제할까요?")) return
    const updated = savedScripts.filter(s => s.id !== id)
    setSavedScripts(updated)
    localStorage.setItem(`saved_scripts_${profileName}`, JSON.stringify(updated))
  }

  const loadScript = (targetScript: string) => {
    setScript(targetScript)
    setPronResult(null)
    setAiCoachMsg(null)
    setMemoLevel(0)
    setTrainingMode("full")
    setActiveTab("practice")
  }

  const handleModeChange = async (mode: "full" | "step" | "interpret") => {
    setTrainingMode(mode)
    setPronResult(null)
    stopTTS()

    if (mode === "interpret" && koTranslations.length === 0) {
      setIsTranslating(true)
      const res = await translateScriptWithGemini(script)
      if (res.success && res.translations) {
        setKoTranslations(res.translations)
      } else {
        alert("번역을 불러오지 못했습니다. 다시 시도해주세요.")
        setTrainingMode("step")
      }
      setIsTranslating(false)
    }
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 1200
          let width = img.width
          let height = img.height
          if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          ctx?.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1])
        }
        img.src = event.target?.result as string
      }
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsAnalyzingImage(true)
    setScript("")
    setPronResult(null)
    setAiCoachMsg(null)

    try {
      const base64String = await compressImage(file)
      const res = await extractSpeechScriptWithGemini(base64String, "image/jpeg")
      if (res.success && res.script) {
        setScript(res.script)
      } else {
        alert("대본을 읽어오는 데 실패했어요.\n(이유: " + res.error + ")")
      }
    } catch (error) {
      alert("사진 처리 중 에러가 발생했습니다.")
    } finally {
      setIsAnalyzingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const stopTTS = () => {
    ttsSessionId.current += 1 
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlayingTTS(false)
  }

  const playAzureTTS = async () => {
    const targetText = trainingMode === "full" ? script : (sentences[stepIndex] || "")
    if (!targetText.trim()) return

    if (isPlayingTTS) { stopTTS(); return }

    try {
      stopTTS() 
      setIsPlayingTTS(true)
      const currentSession = ttsSessionId.current

      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) { alert("Azure TTS 설정이 없습니다."); setIsPlayingTTS(false); return }

      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null)
      const safeText = targetText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${ttsVoice}"><prosody rate="-10%">${safeText}</prosody></voice>
        </speak>
      `.trim()

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (ttsSessionId.current !== currentSession) { synthesizer.close(); return }
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const url = URL.createObjectURL(new Blob([result.audioData], { type: "audio/wav" }))
            audioRef.current = new Audio(url)
            audioRef.current.onended = () => setIsPlayingTTS(false)
            audioRef.current.play().catch(() => setIsPlayingTTS(false))
          } else { setIsPlayingTTS(false) }
          synthesizer.close()
        },
        (err) => { console.error(err); if (ttsSessionId.current === currentSession) setIsPlayingTTS(false); synthesizer.close() }
      )
    } catch (error) { console.error(error); setIsPlayingTTS(false) }
  }

  const startContinuousAssessment = async () => {
    const targetText = trainingMode === "full" ? script : (sentences[stepIndex] || "")
    if (!targetText.trim()) return

    setIsRecording(true)
    setIsMicReady(false)
    setPronResult(null)
    setAiCoachMsg(null)
    assessmentDataRef.current = { totalScore: 0, totalAcc: 0, totalFluency: 0, totalComp: 0, totalProsody: 0, chunks: 0, allWords: [] }

    try {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) throw new Error("Azure Key Missing")

      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechRecognitionLanguage = "en-US"

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()
      const pronConfig = new sdk.PronunciationAssessmentConfig(
        targetText, // 💡 전체 대본이 아닌 현재 훈련 모드의 문장만 평가
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )
      pronConfig.enableProsodyAssessment = true

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      recognizer.sessionStarted = () => setIsMicReady(true)

      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const pron = sdk.PronunciationAssessmentResult.fromResult(e.result)
          const data = assessmentDataRef.current
          data.totalScore += pron.pronunciationScore
          data.totalAcc += pron.accuracyScore
          data.totalFluency += pron.fluencyScore
          data.totalComp += pron.completenessScore
          data.totalProsody += pron.prosodyScore || pron.pronunciationScore
          data.chunks++

          const wordsDetail = pron.detailResult?.Words || []
          const mappedWords = wordsDetail.map((w: any) => ({
            text: w.Word,
            score: w.PronunciationAssessment.AccuracyScore,
            errorType: w.PronunciationAssessment.ErrorType,
            phonemes: w.Phonemes?.map((p: any) => ({ phoneme: p.Phoneme, score: p.PronunciationAssessment.AccuracyScore })) || []
          }))
          data.allWords = [...data.allWords, ...mappedWords]
        }
      }

      recognizer.startContinuousRecognitionAsync()
      setRecognizerInstance(recognizer)

    } catch (error) { console.error(error); setIsRecording(false) }
  }

  const stopContinuousAssessment = () => {
    if (!recognizerInstance) return
    
    setIsRecording(false)
    setIsProcessingResult(true) 
    const targetText = trainingMode === "full" ? script : (sentences[stepIndex] || "")

    recognizerInstance.stopContinuousRecognitionAsync(async () => {
      recognizerInstance.close()
      setRecognizerInstance(null)

      const data = assessmentDataRef.current
      if (data.chunks > 0) {
        const finalResult = {
          score: data.totalScore / data.chunks,
          accuracy: data.totalAcc / data.chunks,
          fluency: data.totalFluency / data.chunks,
          completeness: data.totalComp / data.chunks,
          prosody: data.totalProsody / data.chunks
        }
        setPronResult(finalResult)
        
        // 💡 80점 통과 시 팡파르 터트리기!
        if (finalResult.score >= 80 && trainingMode !== "full") {
          const colors = [accent, '#fbbf24'];
          confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors });
          confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors });
        }
        
        setIsCoachLoading(true)
        const coachRes = await generateSpeakingCoachFeedback({
          sentence: targetText,
          childName: profileName,
          pronResult: finalResult,
          wordScores: data.allWords
        })
        setIsCoachLoading(false)
        setIsProcessingResult(false)

        if (coachRes.success && coachRes.feedback) { setAiCoachMsg(coachRes.feedback) }
      } else {
        setIsProcessingResult(false)
        alert("인식된 목소리가 없어요. 마이크를 켜고 씩씩하게 다시 읽어볼까요?")
      }
    })
  }

  const maskedScript = useMemo(() => {
    if (memoLevel === 0 || !script) return script
    return script.split(/(\s+)/).map((word, index) => {
      if (!word.trim()) return word
      const cleanWord = word.replace(/[^a-zA-Z]/g, '')
      if (cleanWord.length <= 1 && memoLevel !== 3) return word

      const rand = Math.abs(Math.sin(index * 123.456)) 
      let mask = false

      if (memoLevel === 1 && rand < 0.3) mask = true 
      else if (memoLevel === 2 && rand < 0.7) mask = true 

      if (memoLevel === 3) {
        let firstFound = false;
        return word.split('').map(char => {
          if (/[a-zA-Z]/.test(char)) {
            if (!firstFound) { firstFound = true; return char; }
            return '_';
          }
          return char;
        }).join('')
      }
      if (mask) return word.replace(/[a-zA-Z]/g, '_')
      return word
    }).join('')
  }, [script, memoLevel])

  return (
    <div className="flex flex-col gap-5 w-full animate-in fade-in zoom-in-95 duration-300">
      
      {/* 상단 탭 */}
      <div className="flex bg-muted rounded-xl p-1">
        <button 
          onClick={() => setActiveTab("practice")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold rounded-lg transition-all", activeTab === "practice" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Edit3 className="size-4" /> 대본 작성/연습
        </button>
        <button 
          onClick={() => setActiveTab("archive")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold rounded-lg transition-all", activeTab === "archive" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <FolderOpen className="size-4" /> 내 보관함 ({savedScripts.length})
        </button>
      </div>

      {activeTab === "practice" && (
        <>
          {/* 학습지 사진 업로드 */}
          {!script && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-6 text-center shadow-sm animate-in zoom-in-95">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl shadow-sm text-white" style={{ backgroundColor: accent }}>
                {isAnalyzingImage ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </div>
              <h3 className="mb-2 text-lg font-black text-foreground">새로운 발표 대본</h3>
              <p className="mb-5 text-sm text-muted-foreground">학습지를 찰칵 찍어서 올리거나,<br/>아래 텍스트 박스에 직접 대본을 쳐보세요!</p>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()} disabled={isAnalyzingImage}
                className="w-full rounded-xl py-3.5 font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 mb-3"
                style={{ backgroundColor: accent }}
              >
                {isAnalyzingImage ? "AI가 마법을 부리는 중... ✨" : "📷 학습지 사진 찍어서 자동 입력"}
              </button>
            </div>
          )}

          {/* 대본 편집 및 연습 영역 */}
          <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm animate-in slide-in-from-bottom-4">
            
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="text-sm font-bold text-foreground flex items-center gap-1.5 shrink-0">
                <Brain className="size-4" style={{ color: accent }}/> {script ? "대본 암기 훈련" : "직접 대본 입력"}
              </span>
              
              <div className="flex flex-wrap gap-1.5 shrink-0">
                <button onClick={() => setActiveTab("archive")} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"><FolderOpen className="size-3" /> 불러오기</button>
                {script && <button onClick={saveCurrentScript} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 transition-colors"><Save className="size-3" /> 저장</button>}
                {script && <button onClick={() => { if(confirm("대본을 지울까요?")) { stopTTS(); setScript(""); setMemoLevel(0); } }} className="flex items-center text-xs font-bold px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">지우기</button>}
              </div>
            </div>

            {/* 💡 훈련 모드 탭 추가 */}
            {script && (
              <div className="flex bg-muted/50 p-1 rounded-xl mb-1 border border-border/50">
                <button onClick={() => handleModeChange("full")} className={cn("flex-1 text-[12px] sm:text-[13px] font-bold py-2 rounded-lg transition-all", trainingMode === "full" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:bg-muted")}>📝 전체 대본</button>
                <button onClick={() => handleModeChange("step")} className={cn("flex-1 text-[12px] sm:text-[13px] font-bold py-2 rounded-lg transition-all", trainingMode === "step" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:bg-muted")}>🎯 한 문장씩</button>
                <button onClick={() => handleModeChange("interpret")} className={cn("flex-1 text-[12px] sm:text-[13px] font-bold py-2 rounded-lg transition-all", trainingMode === "interpret" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:bg-muted")}>🇰🇷 동시통역</button>
              </div>
            )}

            {/* 📝 전체 모드 UI */}
            {trainingMode === "full" ? (
              <>
                {script && (
                  <div className="flex bg-muted/30 p-1 rounded-lg border border-border/30">
                    {[{ id: 0, label: "Lv.1\n전체보기" }, { id: 1, label: "Lv.2\n빈칸 30%" }, { id: 2, label: "Lv.3\n빈칸 70%" }, { id: 3, label: "Lv.4\n첫 글자만" }].map(lvl => (
                      <button key={lvl.id} onClick={() => setMemoLevel(lvl.id)} className={cn("flex-1 text-[11px] sm:text-[12px] font-bold py-1.5 rounded-md transition-all whitespace-pre-wrap leading-tight", memoLevel === lvl.id ? "bg-background shadow-sm border border-border/50" : "text-muted-foreground")} style={memoLevel === lvl.id ? { color: accent } : undefined}>{lvl.label}</button>
                    ))}
                  </div>
                )}
                
                {memoLevel === 0 ? (
                  <textarea ref={textareaRef} value={script} onChange={(e) => setScript(e.target.value)} className="w-full min-h-[120px] resize-none overflow-hidden rounded-xl border-2 border-muted bg-background p-4 text-[16px] sm:text-[17px] font-medium leading-relaxed text-foreground outline-none focus:border-transparent focus:ring-2 transition-shadow shadow-inner placeholder:text-muted-foreground/50" style={{ '--tw-ring-color': accent } as any} placeholder="여기를 터치해서 대본을 직접 쓰거나 수정할 수 있습니다! ✍️" />
                ) : (
                  <div className="w-full min-h-[120px] rounded-xl border-2 border-transparent bg-muted/30 p-4 text-[16px] sm:text-[17px] font-medium leading-relaxed text-foreground shadow-inner whitespace-pre-wrap select-none">{maskedScript}</div>
                )}
              </>
            ) : (
              // 🎯 한 문장씩 & 동시통역 모드 UI (Step Card)
              <div className="flex flex-col items-center justify-center py-8 px-4 sm:px-6 bg-card border-2 border-muted rounded-2xl shadow-sm relative overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="absolute top-3 left-3 text-[11px] font-black text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                  STEP {stepIndex + 1} <span className="opacity-50">/ {sentences.length}</span>
                </div>
                
                <div className="mt-5 mb-4 min-h-[80px] flex items-center justify-center w-full">
                  {trainingMode === "step" && (
                    <h3 className="text-xl sm:text-2xl font-black text-foreground text-center leading-relaxed text-balance">
                      {sentences[stepIndex]}
                    </h3>
                  )}
                  {trainingMode === "interpret" && (
                    isTranslating ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        <p className="text-xs font-bold text-muted-foreground">AI가 한글로 번역 중...</p>
                      </div>
                    ) : (
                      <h3 className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 text-center leading-relaxed text-balance">
                        {koTranslations[stepIndex] || "번역을 불러올 수 없습니다."}
                      </h3>
                    )
                  )}
                </div>
                
                {/* 진행률 바 */}
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden absolute bottom-0 left-0">
                   <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${((stepIndex + 1) / sentences.length) * 100}%` }} />
                </div>
              </div>
            )}

            {script && (
              <div className="mt-2 flex flex-col gap-4 animate-in slide-in-from-bottom-2">
                
                {/* Azure 목소리 & 버튼 영역 */}
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <select value={ttsVoice} onChange={(e) => { setTtsVoice(e.target.value); localStorage.setItem("script_tts_voice", e.target.value) }} disabled={isPlayingTTS} className="sm:flex-1 rounded-xl bg-muted border border-border px-3 py-3.5 text-sm font-bold text-foreground outline-none transition-colors cursor-pointer disabled:opacity-50">
                    {TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                  <button onClick={playAzureTTS} disabled={isRecording || isProcessingResult || isAnalyzingImage} className={cn("flex sm:flex-1 items-center justify-center gap-2 font-bold px-4 py-3.5 rounded-xl shadow-md text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50", isPlayingTTS ? "bg-slate-600 dark:bg-slate-500" : "")} style={!isPlayingTTS ? { backgroundColor: accent, textShadow: "0 1px 2px rgba(0,0,0,0.15)" } : { textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
                    {isPlayingTTS ? <Square className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
                    {isPlayingTTS ? "듣기 멈춤" : "AI 원어민 듣기"}
                  </button>
                </div>

                <button onClick={isRecording && isMicReady ? stopContinuousAssessment : startContinuousAssessment} disabled={(isRecording && !isMicReady) || isPlayingTTS || isAnalyzingImage || isProcessingResult} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-black text-white shadow-md transition-all active:scale-[0.98]", isRecording && !isMicReady ? "bg-amber-500 opacity-90" : isRecording && isMicReady ? "bg-red-500 animate-pulse" : isProcessingResult ? "bg-indigo-500 opacity-90" : "")} style={(!isRecording && !isProcessingResult) ? { backgroundColor: accent, textShadow: "0 1px 2px rgba(0,0,0,0.2)" } : undefined}>
                  {(isRecording && !isMicReady) || isProcessingResult ? <Loader2 className="size-4 animate-spin" /> : isRecording && isMicReady ? <Square className="size-4" fill="currentColor" /> : <Mic className="size-4" />}
                  {isRecording && !isMicReady ? "마이크 연결 중..." : isRecording && isMicReady ? "다 읽었으면 여기를 눌러 완료하세요! ◼️️" : isProcessingResult ? "결과를 집계하고 있어요..." : (pronResult ? "다시 발표하기" : "발표 시작하기!")}
                </button>

                {/* 💡 80점 통과 시 다음 문장으로 넘어가는 버튼 (도장 깨기 핵심!) */}
                {pronResult && pronResult.score >= 80 && trainingMode !== "full" && (
                  <div className="mt-1 w-full animate-in slide-in-from-bottom-2">
                    {stepIndex < sentences.length - 1 ? (
                      <button onClick={() => { setStepIndex(i => i + 1); setPronResult(null); }} className="w-full py-4 bg-green-500 text-white font-black rounded-2xl shadow-md hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                        🎉 통과! 다음 문장으로 ➔
                      </button>
                    ) : (
                      <div className="w-full py-4 bg-indigo-500 text-white font-black rounded-2xl shadow-md text-center">
                        🏆 모든 문장 클리어! 완벽하게 외웠어요!
                      </div>
                    )}
                  </div>
                )}

                {/* 평가 결과 표시 */}
                {pronResult && (
                  <div className="flex flex-col items-center animate-in zoom-in-95 duration-300 bg-muted/20 p-4 rounded-2xl border border-border/50">
                    <div className="grid grid-cols-4 gap-2 w-full mb-4">
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm"><span className="text-[10px] text-muted-foreground font-bold mb-0.5">정확도</span><span className="text-lg font-black text-blue-500">{Math.round(pronResult.accuracy)}</span></div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm"><span className="text-[10px] text-muted-foreground font-bold mb-0.5">유창성</span><span className="text-lg font-black text-indigo-500">{Math.round(pronResult.fluency)}</span></div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm"><span className="text-[10px] text-muted-foreground font-bold mb-0.5">완전성</span><span className="text-lg font-black text-amber-500">{Math.round(pronResult.completeness)}</span></div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm"><span className="text-[10px] text-muted-foreground font-bold mb-0.5">억양</span><span className="text-lg font-black text-purple-500">{Math.round(pronResult.prosody)}</span></div>
                    </div>
                    <p className="text-[15px] font-black text-foreground mb-3 text-center">
                      {pronResult.score >= 90 ? "✨ 아나운서 같아요! 완벽한 발표입니다!" : pronResult.score >= 80 ? "👏 아주 훌륭한 발표였어요!" : pronResult.score >= 60 ? "👍 좋아요! 자신감 있게 한 번만 더 연습해볼까요?" : "💪 긴장했나요? 심호흡하고 천천히 다시 해봐요!"}
                    </p>
                    {(isCoachLoading || aiCoachMsg) && (
                      <div className="w-full rounded-xl p-3.5 border shadow-inner text-center" style={{ backgroundColor: accent + '1A', borderColor: accent + '33' }}>
                         <p className="text-[11px] font-bold mb-1.5 flex items-center justify-center gap-1.5" style={{ color: accent }}><Sparkles className="size-3.5 animate-spin" /> AI 원어민 선생님의 코칭</p>
                         {isCoachLoading ? <p className="text-xs font-semibold text-muted-foreground animate-pulse py-1">로봇 선생님이 {profileName}이의 발표를 꼼꼼히 듣고 있어요...</p> : <p className="text-[13px] font-bold text-foreground leading-relaxed">{aiCoachMsg}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 보관함 탭 화면 */}
      {activeTab === "archive" && (
        <div className="flex flex-col gap-3 animate-in slide-in-from-right-4">
          {savedScripts.length === 0 ? (
             <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border p-10 text-center bg-card">
               <FolderOpen className="size-10 text-muted-foreground/30 mb-3" />
               <p className="text-sm font-bold text-muted-foreground">아직 보관함에 저장된 대본이 없어요.</p>
             </div>
          ) : (
            savedScripts.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-foreground/20 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <h4 className="font-black text-foreground text-base truncate pr-2 max-w-[200px] sm:max-w-[300px]">{item.title}</h4>
                    <span className="text-[11px] font-bold text-muted-foreground">{item.date}</span>
                  </div>
                  <button onClick={() => deleteScript(item.id)} className="p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="size-4" /></button>
                </div>
                <p className="text-[13px] text-muted-foreground line-clamp-3 leading-relaxed bg-muted/40 p-2.5 rounded-lg italic">{item.script}</p>
                <button onClick={() => loadScript(item.script)} className="mt-1 w-full py-3 rounded-xl font-bold text-[13px] text-white shadow-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5" style={{ backgroundColor: accent, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}><Edit3 className="size-4" /> 이 대본으로 연습하기</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
