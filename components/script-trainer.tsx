"use client"

import React, { useState, useRef } from "react"
import { Mic, Upload, Play, Sparkles, Loader2, RefreshCw } from "lucide-react"
import { extractSpeechScriptWithGemini, generateSpeakingCoachFeedback } from "@/app/actions/words"
import { cn } from "@/lib/utils"

interface ScriptTrainerProps {
  accent: string
  profileName: string
}

export function ScriptTrainer({ accent, profileName }: ScriptTrainerProps) {
  const [script, setScript] = useState("")
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isMicReady, setIsMicReady] = useState(false)
  const [pronResult, setPronResult] = useState<any>(null)
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null)
  const [isCoachLoading, setIsCoachLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 📸 이미지 업로드 및 AI 대본 변환
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsAnalyzingImage(true)
    setScript("")
    setPronResult(null)
    setAiCoachMsg(null)

    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(",")[1]
      const mimeType = file.type

      const res = await extractSpeechScriptWithGemini(base64String, mimeType)
      setIsAnalyzingImage(false)

      if (res.success && res.script) {
        setScript(res.script)
      } else {
        alert("대본을 읽어오는 데 실패했어요. 다시 찍어볼까요?\n(에러: " + res.error + ")")
      }
    }
    reader.readAsDataURL(file)
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
      // 긴 대본을 읽을 때 중간에 숨을 고르더라도 바로 끊기지 않도록 대기 시간을 늘립니다 (3초)
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "3000");

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()

      // 평가 설정 (단어 단위까지 상세하게 분석)
      const pronConfig = new sdk.PronunciationAssessmentConfig(
        script,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )
      pronConfig.enableProsodyAssessment = true;

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      recognizer.sessionStarted = () => setIsMicReady(true)

      // 긴 문장 인식을 위해 recognizeOnceAsync 대신 startContinuousRecognition을 사용할 수도 있으나, 
      // 초등학생 발표 분량(1~2분)은 recognizeOnceAsync로도 충분히 커버 가능하며 관리하기가 훨씬 깔끔합니다.
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

            // AI 맞춤 코칭 요청
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
              sentence: script, // 전체 스크립트를 전달
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

  // 🎧 AI 원어민 낭독 듣기 (TTS)
  const playTTS = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(script)
      utterance.lang = "en-US"
      // 약간 천천히 읽어주어 쉐도잉하기 좋게 설정
      utterance.rate = 0.85 
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in zoom-in-95 duration-300">
      
      {/* 1. 학습지 사진 업로드 영역 */}
      <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-6 text-center">
        <div 
          className="mb-4 flex size-14 items-center justify-center rounded-2xl shadow-sm text-white"
          style={{ backgroundColor: accent }}
        >
          {isAnalyzingImage ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
        </div>
        <h3 className="mb-2 text-lg font-black text-foreground">발표 대본 만들기</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          학습지를 찰칵 찍어서 올리면<br/>AI가 완벽한 발표 대본으로 만들어줘요!
        </p>
        
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
          className="hidden" 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzingImage || isRecording}
          className="rounded-xl px-5 py-2.5 font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {isAnalyzingImage ? "AI가 마법을 부리는 중... ✨" : "학습지 사진 찍기 / 올리기"}
        </button>
      </div>

      {/* 2. 대본 편집 및 연습 영역 */}
      {script && (
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-4" style={{ color: accent }}/> 완성된 대본
            </span>
            <button 
               onClick={playTTS}
               className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              <Play className="size-3" fill="currentColor" /> 원어민 듣기
            </button>
          </div>
          
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="w-full min-h-[200px] resize-none rounded-xl border-none bg-muted/30 p-4 text-[17px] font-medium leading-relaxed text-foreground outline-none focus:ring-2"
            style={{ '--tw-ring-color': accent } as any}
            placeholder="여기에 대본이 입력됩니다. 직접 수정할 수도 있어요!"
          />

          {/* 3. 평가 버튼 및 결과 */}
          <div className="mt-2 flex flex-col gap-4">
            <button
              onClick={startAssessment}
              disabled={isRecording || isAnalyzingImage}
              className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-black text-white shadow-md transition-all active:scale-[0.98]",
                isRecording && !isMicReady ? "bg-amber-500 opacity-90" : 
                isRecording && isMicReady ? "bg-red-500 animate-pulse" : ""
              )}
              style={!isRecording ? { backgroundColor: accent } : undefined}
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

                {/* AI 코칭 피드백 */}
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
        </div>
      )}
    </div>
  )
}
