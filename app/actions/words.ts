"use server"

import { db } from "@/lib/db"
import { wordEntries, type WordEntry } from "@/lib/db/schema"
import { and, asc, desc, eq, gt } from "drizzle-orm"
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

export async function getWrongWords(profile: string): Promise<WordEntry[]> {
  assertProfile(profile)
  return db
    .select()
    .from(wordEntries)
    .where(and(eq(wordEntries.profile, profile), gt(wordEntries.wrongCount, 0)))
    .orderBy(desc(wordEntries.wrongCount), asc(wordEntries.createdAt))
}

export async function recordQuizResult(id: number, isCorrect: boolean) {
  const [word] = await db.select().from(wordEntries).where(eq(wordEntries.id, id))
  if (!word) return
  const newCount = isCorrect ? Math.max(0, word.wrongCount - 1) : word.wrongCount + 1
  await db.update(wordEntries).set({ wrongCount: newCount }).where(eq(wordEntries.id, id))
  revalidatePath("/")
}

export async function addWord(input: {
  profile: string
  date: string
  subject: string
  word: string
  meaning: string
  example?: string
}) {
  assertProfile(input.profile)
  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null
  if (!word || !meaning) throw new Error("단어와 뜻을 모두 입력해 주세요.")

  await db.insert(wordEntries).values({
    profile: input.profile,
    assignmentDate: input.date,
    subject: input.subject,
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
  await db.delete(wordEntries).where(and(eq(wordEntries.profile, profile), eq(wordEntries.assignmentDate, date)))
  revalidatePath("/")
}

export async function addWordsBulk(inputs: {
  profile: string
  date: string
  subject: string
  words: { word: string; meaning: string; example?: string }[]
}) {
  assertProfile(inputs.profile)
  if (inputs.words.length === 0) return

  const values = inputs.words.map((w) => ({
    profile: inputs.profile,
    assignmentDate: inputs.date,
    subject: inputs.subject,
    word: w.word.trim(),
    meaning: w.meaning.trim(),
    example: w.example?.trim() || null,
  }))

  await db.insert(wordEntries).values(values)
  revalidatePath("/")
}

export async function updateWord(
  id: number,
  input: { subject: string; word: string; meaning: string; example?: string }
) {
  const word = input.word.trim()
  const meaning = input.meaning.trim()
  const example = input.example?.trim() || null
  if (!word || !meaning) throw new Error("단어와 뜻을 모두 입력해 주세요.")

  await db.update(wordEntries).set({ subject: input.subject, word, meaning, example }).where(eq(wordEntries.id, id))
  revalidatePath("/")
}

export async function scanImageWithGemini(base64Image: string, mimeType: string) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    
    // ▼ 제가 누락시켰던 상세 명령어(영어 뜻 추출 규칙)를 예전처럼 복구했습니다!
    const promptText = `
이 이미지 속 표나 텍스트에서 '단어' 목록만 필터링하여 추출해줘.

[필터링 예외 규칙]
1. 단순 회화 문장(예: "Where are you from?", "I'm from Singapore.", 마침표/물음표로 끝나는 문장)은 단어가 아니므로 절대 제외해.
2. 오직 단어나 명사구(예: Canada, the United Kingdom)만 추출해.

[추출 항목]
- 'word': 영어 단어
- 'meaning': 한글 뜻 (뜻이 따로 기재되지 않은 경우 빈값 "")
- 'example': 이미지 표에 '영어 뜻(English Definition)'이나 '예문/설명' 열이 있다면 그 내용을 추출해줘. 없으면 빈값 "".

결과는 반드시 [{"word": "Canada", "meaning": "캐나다", "example": ""}] 형태의 순수 JSON 배열로만 출력해.
    `.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    });

    if (!response.ok) return { success: false, error: "구글 AI 응답 실패" };
    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      return { success: false, error: "응답 없음" };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      return { success: true, words: JSON.parse(cleanText) };
    } catch {
      return { success: false, error: "파싱 실패" };
    }
  } catch (e: any) {
    return { success: false, error: `서버 에러: ${e.message}` };
  }
}
