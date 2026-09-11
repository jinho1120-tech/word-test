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
// ▼ 달력에 표시하기 위해 단어가 존재하는 날짜들만 가져오는 기능 ▼
export async function getActiveDates(profile: string): Promise<string[]> {
  assertProfile(profile)
  
  // 해당 프로필의 모든 날짜 데이터를 가져옵니다.
  const results = await db
    .select({ date: wordEntries.assignmentDate })
    .from(wordEntries)
    .where(eq(wordEntries.profile, profile))

  // 중복 날짜를 제거하고 순수한 날짜 배열만 반환합니다.
  const uniqueDates = Array.from(new Set(results.map((r) => r.date)))
  return uniqueDates
}
// ▼ [새로 추가됨] 가장 최근에 단어가 등록된 날짜를 찾는 기능 ▼
export async function getLatestActiveDate(profile: string): Promise<string | null> {
  assertProfile(profile)
  const result = await db
    .select({ date: wordEntries.assignmentDate })
    .from(wordEntries)
    .where(eq(wordEntries.profile, profile))
    .orderBy(desc(wordEntries.assignmentDate))
    .limit(1)

  return result.length > 0 ? result[0].date : null
}
// ▼ 기존 코드 맨 아래에 이 함수를 추가해 주세요! ▼

// app/actions/words.ts 파일의 맨 아래에 있는 함수를 이걸로 덮어써주세요!

export async function generateContextQuiz(words: { word: string, meaning: string }[]) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    // 안전하고 가장 빠른 1.5-flash 모델 사용
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const promptText = `
    너는 한국의 초등학생을 위한 친절하고 다정한 영어 선생님이야.
    다음 제공된 영어 단어들을 사용해서, 아이들이 문맥을 유추할 수 있는 쉽고 자연스러운 영어 예문을 딱 1개씩 만들어줘.
    
    [규칙]
    1. 대상 단어가 들어갈 자리는 세 개의 밑줄("___")로 비워둘 것.
    2. 문장은 초등학교 수준의 쉬운 단어로 구성할 것.
    3. clue(해설) 항목에는 문장 속 어떤 단어가 힌트가 되어서 이 정답이 나오게 되었는지, 초등학생에게 말하듯 친절하게 설명해 줄 것.
    4. 결과는 반드시 아래 JSON 배열 형식으로만 대답할 것 (다른 설명 절대 금지).
    
    [JSON 형식 예시]
    [
      { 
        "word": "apple", 
        "sentence": "I want to eat a red ___.", 
        "translation": "나는 빨간 사과를 먹고 싶어.",
        "clue": "문장에 'eat(먹다)'과 'red(빨간)'라는 힌트가 있지? 그러니까 먹을 수 있는 빨간색 과일을 찾아봐!"
      }
    ]

    [요청 단어 목록]
    ${JSON.stringify(words)}
    `.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        // 에러를 유발할 수 있는 강제 JSON 옵션을 제거하여 안정성 확보
        generationConfig: { temperature: 0.7 }
      })
    });

    // 구글 서버에서 에러를 뱉었을 때 실제 에러 내용을 확인하기 위한 코드
    if (!response.ok) {
      const errorText = await response.text();
      console.error("구글 API 상세 에러:", errorText);
      return { success: false, error: `구글 AI 에러: ${response.status} (자세한 건 콘솔 확인)` };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    // AI가 마크다운(```json ... ```)을 붙여서 보낼 경우를 대비해 깔끔하게 벗겨냄
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      return { success: true, quizData: JSON.parse(cleanText) };
    } catch {
      return { success: false, error: "AI가 준 답변을 해석할 수 없습니다." };
    }
  } catch (e: any) {
    return { success: false, error: `서버 통신 에러: ${e.message}` };
  }
}
