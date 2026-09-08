"use client"

import type React from "react"
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, BookMarked, AlignLeft, MousePointerClick, Pencil, X, Check, Camera } from "lucide-react"
import { addWord, deleteWord, clearWords, addWordsBulk, updateWord, scanImageWithGemini, type Profile } from "@/app/actions/words"
import type { QuizWord } from "@/components/word-quiz"
import { cn } from "@/lib/utils"

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
  
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  
  const [bulkText, setBulkText] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editWord, setEditWord] = useState("")
  const [editMeaning, setEditMeaning] = useState("")
  const [editExample, setEditExample] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsScanning(true)
    setError(null)
    setIsBulkMode(true)

    try {
      const image = new Image()
      const objectUrl = URL.createObjectURL(file)
      image.src = objectUrl
      await new Promise((resolve) => { image.onload = resolve })
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement('canvas')
      const MAX_WIDTH = 1000
      const scale = Math.min(MAX_WIDTH / image.width, 1)
      
      canvas.width = image.width * scale
      canvas.height = image.height * scale
      
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error("사진 변환 중 오류가 발생했습니다.")
      
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7)
      const base64Data = compressedDataUrl.split(',')[1]
      const mimeType = 'image/jpeg'
      
      const result = await scanImageWithGemini(base64Data, mimeType)
      
      if (!result.success) {
        setError(result.error)
        setIsScanning(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }

      const wordsList = result.words
      if (Array.isArray(wordsList) && wordsList.length > 0) {
        const formattedText = wordsList.map((w: any) => `${w.word}, ${w.meaning}`).join('\n')
        setBulkText((prev) => prev ? prev + '\n' + formattedText : formattedText)
      } else {
        setError("단어를 찾지 못했습니다. 표가 잘 보이게 다시 찍어주세요.")
      }
    } catch (err: any) {
      console.error(err)
      setError(`[앱 사진 처리 에러] ${err.message || '알 수 없는 오류'}`)
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
        await addWord({ profile, date, word, meaning, example })
        setWord(""); setMeaning(""); setExample("")
        router.refresh()
      } catch (err) { setError("저장에 실패했어요.") }
    })
  }

  function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const lines = bulkText.split("\n").filter(line => line.trim() !== "")
    const parsedWords = lines.map(line => {
      const parts = line.split(/[\t,]/).map(p => p.trim())
      return { word: parts[0] || "", meaning: parts[1] || "", example: parts[2] || "" }
    }).filter(w => w.word && w.meaning)

    if (parsedWords.length === 0) {
      setError("단어와 뜻을 쉼표(,)로 구분해 주세요. (예: apple, 사과)")
      return
    }

    startTransition(async () => {
      try {
        await addWordsBulk({ profile, date, words: parsedWords })
        setBulkText(""); setIsBulkMode(false)
        router.refresh()
      } catch (err) { setError("저장에 실패했어요.") }
    })
  }

  function startEditing(w: QuizWord) {
    setEditingId(w.id); setEditWord(w.word); setEditMeaning(w.meaning); setEditExample(w.example || "")
  }

  function handleUpdateSubmit(id: number) {
    if (!editWord.trim() || !editMeaning.trim()) return
    startTransition(async () => {
      await updateWord(id, { word: editWord, meaning: editMeaning, example: editExample })
      setEditingId(null)
      router.refresh()
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => { await deleteWord(id); router.refresh() })
  }

  function handleClearAll() {
    if (!window.confirm("오늘 추가한 모든 단어를 정말로 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) {
      return
    }
    startTransition(async () => {
      await clearWords(profile, date)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
        {/* ▼ 모바일 최적화: 제목과 버튼이 좁은 화면에서 위아래로 깔끔하게 배치되도록 수정 ▼ */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-foreground pl-1">{profile}의 오늘 단어 추가</p>
          <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-lg w-full sm:w-auto sm:flex">
            <button 
              onClick={() => { setIsBulkMode(false); setError(null); }} 
              className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 px-1 sm:px-3 text-[11px] sm:text-xs font-bold transition-all", !isBulkMode ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
            >
              <MousePointerClick className="size-3 hidden sm:inline-block" /> 하나씩
            </button>
            <button 
              onClick={() => { setIsBulkMode(true); setError(null); }} 
              className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 px-1 sm:px-3 text-[11px] sm:text-xs font-bold transition-all", isBulkMode ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
            >
              <AlignLeft className="size-3 hidden sm:inline-block" /> 일괄 입력
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isScanning} 
              className="flex items-center justify-center gap-1.5 rounded-md py-2 px-1 sm:px-3 text-[11px] sm:text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
              {isScanning ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3 hidden sm:inline-block" />}
              {isScanning ? "분석중" : "AI 스캔"}
            </button>
          </div>
        </div>

        {!isBulkMode ? (
          <form onSubmit={handleSingleSubmit} className="flex flex-col gap-3 mt-1">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="영단어 (예: apple)" className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="뜻 (예: 사과)" className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="예문 (선택)" className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            {error && <p className="text-sm font-medium text-red-500 break-words">{error}</p>}
            <button type="submit" disabled={isPending} className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accent }}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 단어 추가
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="flex flex-col gap-3 mt-1">
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={isScanning ? "AI가 표를 분석하고 있습니다. 잠시만요..." : "사진을 스캔하거나 직접 입력하세요.\n(예: apple, 사과)"} className="min-h-40 rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
            {error && <p className="text-sm font-bold text-red-500 break-words bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
            <button type="submit" disabled={isPending || isScanning || !bulkText.trim()} className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: accent }}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <AlignLeft className="size-4" />} 일괄 저장하기
            </button>
          </form>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BookMarked className="size-4" style={{ color: accent }} /> 오늘의 단어 목록 ({words.length})
          </div>
          {words.length > 0 && (
            <button 
              onClick={handleClearAll} 
              disabled={isPending}
              className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="size-3" /> 전체 삭제
            </button>
          )}
        </div>
        
        {words.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">아직 추가된 단어가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {words.map((w) => (
              <li key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 overflow-hidden">
                {editingId === w.id ? (
                  <div className="flex w-full flex-col gap-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex gap-2">
                      <input value={editWord} onChange={(e) => setEditWord(e.target.value)} className="flex-1 rounded-lg border border-input px-3 py-1.5 text-sm font-bold outline-none focus:border-primary" placeholder="단어" />
                      <input value={editMeaning} onChange={(e) => setEditMeaning(e.target.value)} className="flex-1 rounded-lg border border-input px-3 py-1.5 text-sm outline-none focus:border-primary" placeholder="뜻" />
                    </div>
                    <input value={editExample} onChange={(e) => setEditExample(e.target.value)} className="w-full rounded-lg border border-input px-3 py-1.5 text-sm outline-none focus:border-primary" placeholder="예문" />
                    <div className="flex justify-end gap-2 mt-1">
                      <button onClick={() => setEditingId(null)} disabled={isPending} className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80"><X className="size-3" /> 취소</button>
                      <button onClick={() => handleUpdateSubmit(w.id)} disabled={isPending} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm" style={{ backgroundColor: accent }}>{isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} 저장</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2"><span className="font-bold text-foreground">{w.word}</span><span className="text-sm text-muted-foreground">{w.meaning}</span></p>
                      {w.example && <p className="mt-0.5 truncate text-xs italic text-muted-foreground">{w.example}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEditing(w)} disabled={isPending} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"><Pencil className="size-4" /></button>
                      <button onClick={() => handleDelete(w.id)} disabled={isPending} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"><Trash2 className="size-4" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
