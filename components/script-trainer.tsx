"use client"

import React, { useState, useRef, useEffect } from "react"
import { Mic, Upload, Play, Sparkles, Loader2, Save, FolderOpen, Trash2, Edit3 } from "lucide-react"
import { extractSpeechScriptWithGemini, generateSpeakingCoachFeedback } from "@/app/actions/words"
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
  
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isMicReady, setIsMicReady] = useState(false)
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)
  const [pronResult, setPronResult] = useState<any>(null)
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null)
  const [isCoachLoading, setIsCoachLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 💾 컴포넌트 로드 시 저장된 대본과 설정 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(`saved_scripts_${profileName}`)
    if (saved) setSavedScripts(JSON.parse(saved))
    
    const savedVoice = localStorage.getItem("script_tts_voice")
    if (savedVoice) setTtsVoice(savedVoice)
  }, [profileName])

  // 💾 대본 보관함에 저장하기
  const saveCurrentScript = () => {
    if (!script.trim()) return alert("저장할 대본 내용이 없습니다.")
    const title = prompt("이 대본의 제목을 입력하세요 (예: Joining a Club)")
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

  // 🗑️ 대본 삭제
  const deleteScript = (id: string) => {
    if (!confirm("이 대본을 삭제할까요?")) return
    const updated = savedScripts.filter(s => s.id !== id)
    setSavedScripts(updated)
    localStorage.setItem(`saved_scripts_${profileName}`, JSON.stringify(updated))
  }

  // 📂 보관함에서 대본 불러오기
  const loadScript = (targetScript: string) => {
    setScript(targetScript)
    setPronResult(null)
    setAiCoachMsg(null)
    setActiveTab("practice")
  }

  // 브라우저 단에서 이미지 압축 (Vercel 용량 초과 방지)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 1000
          let width = img.width
          let height = img.height
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width)
            width = MAX_WIDTH
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          ctx?.drawImage(img, 0, 0, width, height)
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]
          resolve(compressedBase64)
        }
        img.src = event.target?.result as string
      }
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(file)
    })
  }

  // 📸 이미지 업로드 및 AI 대본 변환
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
        alert("대본을 읽어오는 데 실패했어요. 다시 찍어볼까요?\n(이유: " + res.error + ")")
      }
    } catch (error) {
      alert("사진 처리 중 에러가 발생했습니다.")
    } finally {
      setIsAnalyzingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // 🎧 고음질 Azure 원어민 낭독 듣기 (TTS)
  const playAzureTTS = async () => {
    if (!script.trim() || isPlayingTTS) return

    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }

      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) {
        alert("Azure TTS 설정이 없습니다.")
        return
      }

      setIsPlayingTTS(true)
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null)
      const safeText = script.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      
      // 쉐도잉하기 좋게 약간 천천히(-10%) 읽도록 설정
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${ttsVoice}">
            <prosody rate="-10%">${safeText}</prosody>
          </voice>
        </speak>
      `.trim()

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const blob = new Blob([result.audioData], { type: "audio/wav" })
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audio.onended = () => setIsPlayingTTS(false)
            audio.play().catch(() => setIsPlayingTTS(false))
          } else {
            setIsPlayingTTS(false)
          }
          synthesizer.close()
        },
        (err) => {
          console.error(err)
          setIsPlayingTTS(false)
          synthesizer.close()
        }
      )
    } catch (error) {
      console.error(error)
      setIsPlayingTTS(false)
    }
  }

  // 🗣️ Azure 음성 평가 (긴 호흡)
  const startAssessment = async () => {
    if (!script.trim()) return

    setIsRecording(true)
    setIsMicReady(false)
    setPronResult(null)
    setAiCoachMsg(null)

    try {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const key = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY
      const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION

      if (!key || !region) throw new Error("Azure Key Missing")

      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
      speechConfig.speechRecognitionLanguage = "en-US"
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "3000")

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()
      const pronConfig = new sdk.PronunciationAssessmentConfig(
        script,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )
      pronConfig.enableProsodyAssessment = true

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      recognizer.sessionStarted = () => setIsMicReady(true)

      recognizer.recognizeOnceAsync(
        async (result) => {
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

            setIsCoachLoading(true)
            const wordsDetail = pron.detailResult?.Words || []
            const mappedWords = wordsDetail.map((w: any) => ({
              text: w.Word,
              score: w.PronunciationAssessment.AccuracyScore,
              errorType: w.PronunciationAssessment.ErrorType,
              phonemes: w.Phonemes?.map((p: any) => ({
                phoneme: p.Phoneme,
                score: p.PronunciationAssessment.AccuracyScore
              })) || []
            }))

            const coachRes = await generateSpeakingCoachFeedback({
              sentence: script,
              childName: profileName,
              pronResult: finalResult,
              wordScores: mappedWords
            })
            setIsCoachLoading(false)

            if (coachRes.success && coachRes.feedback) {
              setAiCoachMsg(coachRes.feedback)
            }
          } else {
             alert("목소리가 끊겼거나 너무 작았어요. 다시 한번 씩씩하게 읽어볼까요?")
          }
          recognizer.close()
          setIsRecording(false)
        },
        (err) => {
          console.error(err)
          alert("마이크 연결에 문제가 발생했습니다.")
          recognizer.close()
          setIsRecording(false)
        }
      )
    } catch (error) {
      console.error(error)
      setIsRecording(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full animate-in fade-in zoom-in-95 duration-300">
      
      {/* 상단 탭 (새로 연습 vs 보관함) */}
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
          {/* 1. 학습지 사진 업로드 (대본이 없을 때만 크게 표시) */}
          {!script && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-6 text-center shadow-sm">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl shadow-sm text-white" style={{ backgroundColor: accent }}>
                {isAnalyzingImage ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </div>
              <h3 className="mb-2 text-lg font-black text-foreground">새로운 발표 대본</h3>
              <p className="mb-5 text-sm text-muted-foreground">
                학습지를 찰칵 찍어서 올리거나,<br/>아래 빈칸에 직접 영어 대본을 쳐보세요!
              </p>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzingImage}
                className="w-full rounded-xl py-3 font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 mb-3"
                style={{ backgroundColor: accent }}
              >
                {isAnalyzingImage ? "AI가 마법을 부리는 중... ✨" : "📷 학습지 사진 찍어서 자동 입력"}
              </button>
            </div>
          )}

          {/* 2. 대본 편집 및 연습 영역 */}
          <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4" style={{ color: accent }}/> {script ? "대본 수정 및 연습" : "직접 대본 입력"}
              </span>
              <div className="flex gap-1.5">
                {script && (
                  <button onClick={saveCurrentScript} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                    <Save className="size-3" /> 보관함 저장
                  </button>
                )}
                {script && (
                  <button onClick={() => { if(confirm("대본을 지울까요?")) setScript("") }} className="flex items-center text-xs font-bold px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                    지우기
                  </button>
                )}
              </div>
            </div>
            
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full min-h-[160px] resize-none rounded-xl border-2 border-muted bg-background p-4 text-[16px] font-medium leading-relaxed text-foreground outline-none focus:border-transparent focus:ring-2 transition-all shadow-inner placeholder:text-muted-foreground/50"
              style={{ '--tw-ring-color': accent } as any}
              placeholder="여기를 터치해서 대본을 직접 쓰거나 수정할 수 있습니다! ✍️"
            />

            {script && (
              <div className="mt-2 flex flex-col gap-4 animate-in slide-in-from-bottom-2">
                
                {/* 💡 Azure 목소리 선택 & 듣기 버튼 */}
                <div className="flex items-center gap-2">
                  <select
                    value={ttsVoice}
                    onChange={(e) => {
                      setTtsVoice(e.target.value)
                      localStorage.setItem("script_tts_voice", e.target.value)
                    }}
                    className="flex-1 rounded-xl bg-muted border border-border px-3 py-3 text-sm font-bold text-muted-foreground outline-none transition-colors"
                  >
                    {TTS_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.label}</option>
                    ))}
                  </select>

                  <button 
                    onClick={playAzureTTS}
                    disabled={isPlayingTTS}
                    className="flex flex-1 items-center justify-center gap-2 font-bold px-3 py-3 rounded-xl shadow-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: accent }}
                  >
                    {isPlayingTTS ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" fill="currentColor" />}
                    {isPlayingTTS ? "읽는 중..." : "AI 원어민 듣기"}
                  </button>
                </div>

                <button
                  onClick={startAssessment}
                  disabled={isRecording || isPlayingTTS}
                  className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-black text-white shadow-md transition-all active:scale-[0.98]",
                    isRecording && !isMicReady ? "bg-amber-500 opacity-90" : 
                    isRecording && isMicReady ? "bg-red-500 animate-pulse" : "bg-foreground"
                  )}
                >
                  {isRecording && !isMicReady && <Loader2 className="size-4 animate-spin" />}
                  {isRecording && isMicReady && <Mic className="size-4 animate-bounce" />}
                  {!isRecording && <Mic className="size-4" />}
                  
                  {isRecording && !isMicReady ? "마이크 연결 중..." : 
                   isRecording && isMicReady ? "🔴 대본을 보고 쭉 읽어주세요!" : 
                   (pronResult ? "다시 발표하기" : "발표 시작하기!")}
                </button>

                {/* 평가 결과 표시 */}
                {pronResult && (
                  <div className="flex flex-col items-center animate-in zoom-in-95 duration-300 bg-muted/20 p-4 rounded-2xl border border-border/50">
                    <div className="grid grid-cols-4 gap-2 w-full mb-4">
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">정확도</span>
                          <span className="text-lg font-black text-blue-500">{Math.round(pronResult.accuracy)}</span>
                       </div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">유창성</span>
                          <span className="text-lg font-black text-indigo-500">{Math.round(pronResult.fluency)}</span>
                       </div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">완전성</span>
                          <span className="text-lg font-black text-amber-500">{Math.round(pronResult.completeness)}</span>
                       </div>
                       <div className="flex flex-col items-center justify-center py-2 bg-card rounded-xl border border-border shadow-sm">
                          <span className="text-[10px] text-muted-foreground font-bold mb-0.5">억양</span>
                          <span className="text-lg font-black text-purple-500">{Math.round(pronResult.prosody)}</span>
                       </div>
                    </div>

                    <p className="text-[15px] font-black text-foreground mb-3 text-center">
                      {pronResult.score >= 90 ? "✨ 아나운서 같아요! 완벽한 발표입니다!" :
                       pronResult.score >= 80 ? "👏 아주 훌륭한 발표였어요!" :
                       pronResult.score >= 60 ? "👍 좋아요! 자신감 있게 한 번만 더 연습해볼까요?" :
                       "💪 긴장했나요? 심호흡하고 천천히 다시 해봐요!"}
                    </p>

                    {(isCoachLoading || aiCoachMsg) && (
                      <div className="w-full rounded-xl p-3.5 border shadow-inner text-center" style={{ backgroundColor: accent + '1A', borderColor: accent + '33' }}>
                         <p className="text-[11px] font-bold mb-1.5 flex items-center justify-center gap-1.5" style={{ color: accent }}>
                            <Sparkles className="size-3.5 animate-spin" /> AI 원어민 선생님의 코칭
                         </p>
                         {isCoachLoading ? (
                            <p className="text-xs font-semibold text-muted-foreground animate-pulse py-1">
                               로봇 선생님이 {profileName}이의 발표를 꼼꼼히 듣고 있어요...
                            </p>
                         ) : (
                            <p className="text-[13px] font-bold text-foreground leading-relaxed">
                               {aiCoachMsg}
                            </p>
                         )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 3. 보관함 탭 화면 */}
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
                  <button 
                    onClick={() => deleteScript(item.id)}
                    className="p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed bg-muted/40 p-2 rounded-lg italic">
                  {item.script}
                </p>
                <button
                  onClick={() => loadScript(item.script)}
                  className="mt-1 w-full py-2.5 rounded-xl font-bold text-sm bg-foreground text-background shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  이 대본으로 연습하기 ➔
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
