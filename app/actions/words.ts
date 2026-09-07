"use server"

import { db } from "@/lib/db"
import { wordEntries, type WordEntry } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type Profile = "지온" | "예온"

const PROFILES: Profile[] = ["지온", "예온"]

function assertProfile(profile: string): asserts profile is Profile {
  if (!PROFILES.includes(profile as Profile)) {
    throw new Error("알 수 없는 프로필입니다.")
  }
}

export async function getWords(profile: string, date: string): Promise<WordEntry[]> {
  assertProfile(profile)
  return db
    .select()
    .from(wordEntries)
    .where(and(eq(wordEntries.profile, profile), eq(wordEntries.assignmentDate, date)))
    .orderBy(asc(wordEntries.createdAt))
}

export async function addWord(input: {
  profile: string
  date: string
  word: string
  meaning: string
  example?: string
}) {
  assertProfile(input.profile)

  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null

  if (!word || !meaning) {
    throw new Error("단어와 뜻을 모두 입력해 주세요.")
  }

  await db.insert(wordEntries).values({
    profile: input.profile,
    assignmentDate: input.date,
    word,
    meaning,
    example,
  })

  revalidatePath("/")
}

export async function deleteWord(id: number) {
  await db.delete(wordEntries).where(eq(wordEntries.id, id))
  revalidatePath("/")
}

export async function clearWords(profile: string, date: string) {
  assertProfile(profile)
  await db
    .delete(wordEntries)
    .where(and(eq(wordEntries.profile, profile), eq(wordEntries.assignmentDate, date)))
  revalidatePath("/")
}
export async function updateWord(
  id: number,
  input: { word: string; meaning: string; example?: string }
) {
  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null

  if (!word || !meaning) {
    throw new Error("단어와 뜻을 모두 입력해 주세요.")
  }

  // 데이터베이스에서 해당 id의 단어 데이터를 새 내용으로 덮어씁니다
  await db
    .update(wordEntries)
    .set({ word, meaning, example })
    .where(eq(wordEntries.id, id))

  revalidatePath("/")
}
