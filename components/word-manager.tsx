"use client"

import type React from "react"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, BookMarked } from "lucide-react"
import { addWord, deleteWord, type Profile } from "@/app/actions/words"
import type { QuizWord } from "@/components/word-quiz"

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
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!word.trim() || !meaning.trim()) {
      setError("단어와 뜻을 모두 입력해 주세요.")
      return
    }
    startTransition(async () => {
      try {
        await addWord({ profile, date, word, meaning, example })
        setWord("")
        setMeaning("")
        setExample("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했어요.")
      }
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteWord(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm"
      >
        <p className="text-sm font-semibold text-foreground">
          {profile}의 오늘 단어 추가
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="영단어 (예: apple)"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="뜻 (예: 사과)"
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <input
          value={example}
          onChange={(e) => setExample(e.target.value)}
          placeholder="예문 (선택) — 힌트에서 단어를 가려서 보여줘요"
          className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          단어 추가
        </button>
      </form>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <BookMarked className="size-4" style={{ color: accent }} />
          오늘의 단어 목록 ({words.length})
        </div>
        {words.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            아직 추가된 단어가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {words.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="font-bold text-foreground">{w.word}</span>
                    <span className="text-sm text-muted-foreground">{w.meaning}</span>
                  </p>
                  {w.example && (
                    <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                      {w.example}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(w.id)}
                  disabled={isPending}
                  aria-label={`${w.word} 삭제`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
