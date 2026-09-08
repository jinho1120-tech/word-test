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

export async function addWordsBulk(inputs: {
  profile: string
  date: string
  words: { word: string; meaning: string; example?: string }[]
}) {
  assertProfile(inputs.profile)
  if (inputs.words.length === 0) return

  const values = inputs.words.map((w) => ({
    profile: inputs.profile,
    assignmentDate: inputs.date,
    word: w.word.trim(),
    meaning: w.meaning.trim(),
    example: w.example?.trim() || null,
  }))

  await db.insert(wordEntries).values(values)
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

  await db
    .update(wordEntries)
    .set({ word, meaning, example })
    .where(eq(wordEntries.id, id))

  revalidatePath("/")
}

// ▼ 암호 공백 제거(.trim()) 및 표준 규격을 적용한 최종 스캔 로직 ▼
export async function scanImageWithGemini(base64Image: string, mimeType: string) {
  try {
    // 핵심 해결책: Vercel 환경변수 복사 시 딸려 들어간 공백/줄바꿈을 강제로 잘라냅니다.
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, error: "Vercel 서버에 API 키가 등록되지 않았습니다." };
    }

    // 가장 안정적인 최신 v1beta 표준 모델 주소
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "이 이미지 속의 표나 텍스트에서 '영어 단어'와 '한글 뜻'을 완벽하게 짝지어 추출해줘. 추출한 결과는 반드시 [{\"word\": \"apple\", \"meaning\": \"사과\"}] 형태의 순수한 JSON 배열 형식으로만 대답해. 마크다운 기호나 설명은 절대 추가하지 마." },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: `[구글 AI 거부] ${errorData?.error?.message || response.statusText}` };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const words = JSON.parse(cleanText);
    return { success: true, words };
    
  } catch (e: any) {
    return { success: false, error: `[서버 내부 문제] ${e.message}` };
  }
}
