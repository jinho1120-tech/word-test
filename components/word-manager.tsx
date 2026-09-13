"use client"

import type React from "react"
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, BookMarked, AlignLeft, MousePointerClick, Pencil, X, Check, Camera } from "lucide-react"
import { addWord, deleteWord, clearWords, addWordsBulk, updateWord, scanImageWithGemini, type Profile } from "@/app/actions/words"
import type { QuizWord } from "@/components/word-quiz"
import { cn } from "@/lib/utils"

const INPUT_SUBJECTS = ["리딩", "스피킹", "문법", "단어"]
// ▼ 목록 보기용 필터 탭 (전체 포함)
const FILTER_SUBJECTS = ["전체", ...INPUT_SUBJECTS] 

export function WordManager({
  profile,
  date,
  words,
  accent,
}: {
  profile: Profile
  date: string
  words: QuizWord[]
  accent: string
}) {
  const router = useRouter()
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [subject, setSubject] = useState("리딩")
  
  // ▼ 현재 보고 있는 단어 목록의 필터 상태 추가
  const [filterSubject, setFilterSubject] = useState("전체")
  
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  
  const [bulkText, setBulkText] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubject, setEditSubject] = useState("리딩")
  const [editWord, setEditWord] = useState("")
  const [editMeaning, setEditMeaning] = useState("")
  const [editExample, setEditExample] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ▼ 화면에 보여줄(렌더링할) 단어들을 필터링합니다.
  const filteredWords = filterSubject === "전체" 
    ? words 
    : words.filter((w) => w.subject === filterSubject)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsScanning(true); setError(null); setIsBulkMode(true)

    try {
      const image = new Image()
      const objectUrl = URL.createObjectURL(file)
      image.src = objectUrl
      await new Promise((resolve) => { image.onload = resolve })
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement('canvas')
      const scale = Math.min(1000 / image.width, 1)
      canvas.width = image.width * scale
      canvas.height = image.height * scale
      
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error("사진 변환 오류")
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      
      const base64Data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      const result = await scanImageWithGemini(base64Data, 'image/jpeg')
      
      if (!result.success) {
        setError(result.error)
        setIsScanning(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }

      if (Array.isArray(result.words) && result.words.length > 0) {
        const formattedText = result.words.map((w: any) => 
          (w.example && w.example.trim() !== "") ? `${w.word} | ${w.meaning} | ${w.example}` : `${w.word} | ${w.meaning}`
        ).join('\n')
        setBulkText((prev) => prev ? prev + '\n' + formattedText : formattedText)
      } else {
        setError("단어를 찾지 못했습니다.")
      }
    } catch (err: any) {
      setError(`[앱 사진 처리 에러] ${err.message}`)
    } finally {
      setIsScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!word.trim() || !meaning.trim()) {
      setError("단어와 뜻을 모두 입력해 주세요.")
      return
    }
    startTransition(async () => {
      try {
        await addWord({ profile, date, subject, word, meaning, example })
        setWord(""); setMeaning(""); setExample("")
        // 방금 추가한 과목 탭으로 자동 이동시켜 줍니다.
        setFilterSubject(subject) 
        router.refresh()
      } catch (err) { setError("저장에 실패했어요.") }
    })
  }

  function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const lines = bulkText.split("\n").filter(line => line.trim() !== "")
    
    const parsedWords = lines.map(line => {
      let parts: string[] = []
      if (line.includes("|")) parts = line.split("|").map(p => p.trim())
      else if (line.includes("\t")) parts = line.split("\t").map(p => p.trim())
      else parts = line.split(",").map(p => p.trim())
      return { word: parts[0] || "", meaning: parts[1] || "", example: parts[2] || "" }
    }).filter(w => w.word && w.meaning)

    if (parsedWords.length === 0) return setError("단어와 뜻을 구분하여 입력해 주세요.")

    startTransition(async () => {
      try {
        await addWordsBulk({ profile, date, subject, words: parsedWords })
        setBulkText(""); setIsBulkMode(false)
        // 방금 일괄 추가한 과목 탭으로 자동 이동시켜 줍니다.
        setFilterSubject(subject)
        router.refresh()
      } catch (err) { setError("저장에 실패했어요.") }
    })
  }

  function startEditing(w: QuizWord) {
    setEditingId(w.id); setEditSubject(w.subject); setEditWord(w.word); setEditMeaning(w.meaning); setEditExample(w.example || "")
  }

  function handleUpdateSubmit(id: number) {
    if (!editWord.trim() || !editMeaning.trim()) return
    startTransition(async () => {
      await updateWord(id, { subject: editSubject, word: editWord, meaning: editMeaning, example: editExample })
      setEditingId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

      {/* 입력 영역 */}
      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-foreground">{profile}의<br />단어 추가</p>
          <div className="flex gap-2 bg-muted/50 p-1 rounded-lg overflow-x-auto">
            <button onClick={() => { setIsBulkMode(false); setError(null); }} className={cn("px-2.5 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 shrink-0", !isBulkMode ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}><MousePointerClick className="size-3" /> 하나씩</button>
            <button onClick={() => { setIsBulkMode(true); setError(null); }} className={cn("px-2.5 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 shrink-0", isBulkMode ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}><AlignLeft className="size-3" /> 일괄 입력</button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isScanning} className="px-2.5 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 shrink-0 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
              {isScanning ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
              {isScanning ? "AI 분석 중..." : "AI 사진"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-muted-foreground shrink-0">분류:</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {INPUT_SUBJECTS.map(s => (
              <button key={s} type="button" onClick={() => setSubject(s)} className={cn("px-3 py-1 text-xs font-bold rounded-lg shrink-0 transition-colors", subject === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{s}</button>
            ))}
          </div>
        </div>

        {!isBulkMode ? (
          <form onSubmit={handleSingleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="영단어 (예: apple)" className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="뜻" className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="영어 뜻/힌트 (선택)" className="rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            {error && <p className="text-sm font-medium text-red-500 break-words">{error}</p>}
            <button type="submit" disabled={isPending} className="flex justify-center items-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accent }}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} [{subject}] 단어 추가
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="flex flex-col gap-3">
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="단어 | 뜻 | 힌트" className="min-h-40 rounded-xl border border-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
            {error && <p className="text-sm font-bold text-red-500 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
            <button type="submit" disabled={isPending || isScanning || !bulkText.trim()} className="flex justify-center items-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accent }}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <AlignLeft className="size-4" />} [{subject}] 일괄 저장
            </button>
          </form>
        )}
      </div>

      {/* 목록 영역 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BookMarked className="size-4" style={{ color: accent }} /> 단어 목록 ({filteredWords.length})
          </div>
          
          {/* ▼ 현재 선택된 탭(filterSubject) 정보를 넘겨주며 삭제하도록 업데이트! */}
          {filteredWords.length > 0 && (
            <button 
              onClick={() => { 
                const confirmMsg = filterSubject === "전체" 
                  ? "오늘 추가한 모든 단어를 정말 삭제할까요?" 
                  : `오늘 추가한 [${filterSubject}] 단어를 모두 삭제할까요?`
                if(window.confirm(confirmMsg)) { 
                  startTransition(async () => { 
                    await clearWords(profile, date, filterSubject); 
                    router.refresh() 
                  }) 
                } 
              }} 
              disabled={isPending} 
              className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="size-3" /> {filterSubject === "전체" ? "전체 삭제" : `[${filterSubject}] 삭제`}
            </button>
          )}
        </div>

        {/* ▼ 과목 필터링 탭 UI 추가 */}
        {words.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
            {FILTER_SUBJECTS.map(s => {
              // 탭에 보여줄 개수 계산 (전체일 경우 전체 개수, 특정 과목일 경우 해당 과목 개수)
              const count = s === "전체" ? words.length : words.filter(w => w.subject === s).length
              if (s !== "전체" && count === 0) return null // 해당 과목 단어가 없으면 탭 숨김

              return (
                <button 
                  key={s} 
                  type="button"
                  onClick={() => setFilterSubject(s)} 
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-bold rounded-lg shrink-0 transition-colors shadow-sm border", 
                    filterSubject === s 
                      ? "bg-foreground text-background border-foreground" 
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {s} <span className={cn("ml-1 px-1.5 rounded-full text-[9px]", filterSubject === s ? "bg-background/20 text-background" : "bg-muted-foreground/20 text-muted-foreground")}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
        
        {/* ▼ 전체 words가 아닌 filteredWords를 화면에 그려줍니다. */}
        <ul className="flex flex-col gap-2">
          {filteredWords.length === 0 && words.length > 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm font-medium text-muted-foreground">
              해당 과목에 등록된 단어가 없습니다.
            </div>
          ) : (
            filteredWords.map((w) => (
              <li key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                {editingId === w.id ? (
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="flex flex-1 gap-2">
                        <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="shrink-0 rounded-lg border border-input px-2 py-1.5 text-xs font-bold text-muted-foreground outline-none focus:border-primary">
                          {INPUT_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input value={editWord} onChange={(e) => setEditWord(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-input px-3 py-1.5 text-sm font-bold outline-none focus:border-primary" placeholder="단어" />
                      </div>
                      <input value={editMeaning} onChange={(e) => setEditMeaning(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-input px-3 py-1.5 text-sm outline-none focus:border-primary" placeholder="뜻" />
                    </div>
                    <input value={editExample} onChange={(e) => setEditExample(e.target.value)} className="w-full min-w-0 rounded-lg border border-input px-3 py-1.5 text-sm outline-none focus:border-primary" placeholder="힌트" />
                    <div className="flex justify-end gap-2 mt-1">
                      <button onClick={() => setEditingId(null)} disabled={isPending} className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80"><X className="size-3 inline" /> 취소</button>
                      <button onClick={() => handleUpdateSubmit(w.id)} disabled={isPending} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm" style={{ backgroundColor: accent }}><Check className="size-3 inline" /> 저장</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{w.subject}</span>
                        <span className="font-bold text-foreground">{w.word}</span>
                        <span className="text-sm text-muted-foreground">{w.meaning}</span>
                      </p>
                      {w.example && <p className="mt-1 truncate text-xs italic text-muted-foreground">{w.example}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEditing(w)} disabled={isPending} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"><Pencil className="size-4" /></button>
                      <button onClick={() => { if(window.confirm("정말 이 단어를 삭제할까요?")) { startTransition(async () => { await deleteWord(w.id); router.refresh() }) } }} disabled={isPending} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"><Trash2 className="size-4" /></button>
                    </div>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
