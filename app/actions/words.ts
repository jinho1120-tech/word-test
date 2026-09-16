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

export async function clearWords(profile: string, date: string, subject?: string) {
  assertProfile(profile)
  
  if (subject && subject !== "전체") {
    await db.delete(wordEntries).where(
      and(
        eq(wordEntries.profile, profile),
        eq(wordEntries.assignmentDate, date),
        eq(wordEntries.subject, subject)
      )
    )
  } else {
    await db.delete(wordEntries).where(
      and(
        eq(wordEntries.profile, profile),
        eq(wordEntries.assignmentDate, date)
      )
    )
  }
  
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

export async function getActiveDates(profile: string): Promise<{ date: string, subjects: string[] }[]> {
  assertProfile(profile)
  
  const results = await db
    .select({ date: wordEntries.assignmentDate, subject: wordEntries.subject })
    .from(wordEntries)
    .where(eq(wordEntries.profile, profile))

  const dateMap = new Map<string, Set<string>>()
  results.forEach((r) => {
    if (!dateMap.has(r.date)) dateMap.set(r.date, new Set())
    if (r.subject) dateMap.get(r.date)!.add(r.subject)
  })

  return Array.from(dateMap.entries()).map(([date, subjectSet]) => ({
    date,
    subjects: Array.from(subjectSet)
  }))
}

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

export async function generateContextQuiz(words: { word: string, meaning: string }[], quizType: "context" | "speaking" = "context") {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const themes = ["신나는 학교 생활", "가족과의 따뜻한 일상", "신나는 해외 여행", "베스트 프렌드와의 놀이", "즐거운 취미 생활"];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    const randomSeed = Math.random().toString(36).substring(7);

    let promptText = "";

    if (quizType === "speaking") {
      promptText = `
      너는 한국의 초등학생을 위한 친절하고 다정한 영어 선생님이야.
      다음 제공된 영어 단어들을 사용해서, 아이들이 쉐도잉(Shadowing) 훈련을 할 수 있는 쉽고 자연스러운 영어 예문을 딱 1개씩 만들어줘.
      
      [필수 문장 작성 규칙]
      1. sentence (메인 예문):
         - 반드시 **정상적이고 완전한 표준 영어 문장**이어야 해.
         - 문장 첫 글자는 무조건 대문자로 시작하고, 표준 스펠링 및 대소문자 규칙을 완벽하게 지켜!
         - 절대로 sentence 항목에 대문자 강세 표시(예: SHAD-ow, RUN)나 음절 구분 하이픈(a-way)을 넣지 마!
         - 오직 의미 단위 청크 구분을 위한 빗금("/") 기호만 포함해.
         - 예시: "My funny shadow / tried to run away / from me."

      2. guide (하단 리듬 가이드):
         - 정답 단어가 포함된 완성된 문장을 바탕으로, 아래 [LINGUISTIC ANNOTATION RULES]를 엄격히 적용해 강세와 하이픈을 넣은 가이드를 작성해.
         - 예시: "my FUNny SHAD-ow / TRIED to RUN a-WAY / from ME."

      3. 테마 및 난이도:
         - 문장은 초등학교 수준의 쉬운 단어로 구성하되, 테마 [${randomTheme}]에 어울리는 재미있는 상황으로 구성해. (Seed: ${randomSeed})

      [LINGUISTIC ANNOTATION RULES (guide 전용 규칙)]
      1. STRESS & SYLLABLE SPLITTING: Capitalize stressed syllables/words. Lowercase unstressed ones. For words with 2+ syllables, capitalize ONLY the primary-stressed syllable.
      - Stress (capitalize) content words: nouns, main/lexical verbs, adjectives, adverbs, demonstratives, question words, negatives.
      - Do NOT stress (lowercase) function words: articles, prepositions, pronouns, conjunctions, infinitive "to", the verb "be", and AFFIRMATIVE auxiliary/modal verbs.
        1) articles (a, an, the)
        2) prepositions (in, on, at, for, of, etc.)
        3) possessive determiners (my, your, his, her, our, their) <- 'our', 'my' 대문자 금지!
        4) 'be' verbs (am, is, are, was, were) <- 'IS' 대문자 금지!
        5) pronouns, conjunctions, infinitive "to"
      - EXCEPTION 1: negative auxiliary contractions (isn't, doesn't, can't, etc.) ARE stressed.
      - EXCEPTION 2 (stranded at clause end): a preposition or infinitive "to" left with no object/verb following it takes its full form and is stressed (e.g., "WHO are you TALKing TO?").
      - EXCEPTION 3 (verb standing alone): an auxiliary/modal verb with no main verb following it is stressed (e.g., "i CAN'T RUN as FAST as she CAN.").
      - EXCEPTION 4: Articles ("a", "an", "the") must ALWAYS be lowercase, even at the very beginning of the sentence (e.g., "a BOY...", "the DOG..."). However, subject pronouns ("I", "We", "He", "She", "They") at the beginning of a sentence CAN be capitalized if they naturally carry stress (e.g., "WE FOUND...").
      - [CRITICAL HYPHENATION RULE]: If a word sounds like it stretches or has a trailing sound (even 1-syllable words with -s or -ed like "hands" or "looked"), heavily use hyphens to separate the strong and weak parts phonetically (e.g., hands -> HAN-ds, looked -> LOOK-ed, after -> AF-ter, body -> BO-dy, towel -> TOW-el). 
        

      2. PAUSE (의미 단위 끊어 읽기 규칙 - sentence와 guide 공통 적용):
      - 초등학생이 호흡하기 좋은 2~3개의 자연스러운 의미 덩어리(Thought Group)로 잘라줘.
      - "Mom says /", "He thinks /", "I know /" 처럼 전달동사 바로 뒤는 무조건 끊어줄 것!
      - 주어구와 동사를 어색하게 가르지 말고, [전달절 / 주어구 / 동사+부사구] 또는 [주어+동사 / 전치사구] 구조를 엄격히 지킬 것.
      
      [올바른 청크 예시]
      - Mom says / the fun game / will start right now. (O)
      - Careful, / don't step / on my robot toy. (O)
      - The magic alien / ate a glowing red apple. (O)


      결과는 반드시 아래 JSON 배열 형식으로만 대답할 것.
      [
        { 
          "word": "shadow", 
          "sentence": "My funny shadow / tried to run away / from me.", 
          "translation": "내 재미있는 그림자가 나에게서 도망치려고 했어요.",
          "guide": "my FUNny SHAD-ow / TRIED to RUN a-WAY / from ME."
        }
      ]

      [요청 단어 목록]
      ${JSON.stringify(words)}
      `.trim();
    } else {
      promptText = `
      너는 한국의 초등학생을 위한 친절하고 다정한 영어 선생님이야.
      다음 제공된 영어 단어들을 사용해서, 아이들이 문맥을 유추할 수 있는 쉽고 자연스러운 영어 예문을 딱 1개씩 만들어줘.
      
      [규칙]
      1. 대상 단어가 들어갈 자리는 세 개의 밑줄("___")로 비워둘 것.
      2. 문장은 초등학교 수준의 쉬운 단어로 구성하되, 절대 뻔한 교과서 예문(예: I like apples)을 반복하지 마.
      3. 이번 예문의 배경 테마는 [${randomTheme}]야. 이 테마에 어울리는 상황을 상상해서 매번 완전히 새로운 문장을 만들어줘! (Seed: ${randomSeed})
      4. clue(해설) 항목에는 문장 속 어떤 단어가 힌트가 되어서 이 정답이 나오게 되었는지 아이들 눈높이에서 친절하게 설명해 줄 것.
      
      결과는 반드시 아래 JSON 배열 형식으로만 대답할 것 (다른 설명 절대 금지).
      [
        { 
          "word": "apple", 
          "sentence": "The magic alien ate a glowing red ___.", 
          "translation": "마법 외계인이 빛나는 빨간 사과를 먹었어요.",
          "clue": "문장에 'ate(먹었다)'과 외계인이 좋아하는 'red(빨간)' 과일이 힌트야! 정답은 무엇일까?"
        }
      ]

      [요청 단어 목록]
      ${JSON.stringify(words)}
      `.trim();
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { 
          temperature: 0.9, 
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("구글 API 상세 에러:", errorText);
      
      if (response.status === 429) {
        return { success: false, isRateLimit: true, error: "AI 사용량 초과" };
      }
      return { success: false, error: `구글 AI 에러: ${response.status} (자세한 건 콘솔 확인)` };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
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

// 💡 [수정됨] Gemini AI를 통한 실시간 스피킹 코칭 피드백 생성 (문맥 맞춤형 억양 팁 반영)
export async function generateSpeakingCoachFeedback(data: {
  sentence: string;
  childName: string;
  pronResult: { score: number; accuracy: number; fluency: number; completeness: number; prosody: number };
  wordScores: { text: string; score: number; errorType?: string; phonemes: { phoneme: string; score: number }[] }[];
}) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

    // 단어 전체 점수가 80점 이상이더라도, 세부 발음 기호 중 70점 미만이 하나라도 있으면 코치에게 전달
    const lowAccuracyWords = data.wordScores
      .filter(w => w.score < 80 || w.errorType === "Omission" || w.phonemes.some(p => p.score < 70))
      .map(w => {
        const badPhonemes = w.phonemes.filter(p => p.score < 70).map(p => p.phoneme).join(", ");
        return `- 단어: "${w.text}" (점수: ${Math.round(w.score)}점, 상태: ${w.errorType || "발음미흡"}${badPhonemes ? `, 미흡한 발음기호: [${badPhonemes}]` : ""})`;
      })
      .join("\n");

    const promptText = `
너는 한국의 초등학생('${data.childName}')을 다정하게 지도하는 1:1 영어 선생님이야.
아이가 방금 읽은 문장의 평가 데이터를 바탕으로, 보완할 점을 **핵심만 아주 짧고 간결하게** 작성해줘.

[원문]
"${data.sentence}"

[평가 데이터]
- 종합점수: ${Math.round(data.pronResult.score)}점 (정확도: ${Math.round(data.pronResult.accuracy)}, 유창성: ${Math.round(data.pronResult.fluency)}, 억양: ${Math.round(data.pronResult.prosody)})
${lowAccuracyWords ? `\n[주의가 필요한 단어들]\n${lowAccuracyWords}` : "\n[모든 단어 발음 훌륭함]"}

[작성 규칙 (매우 중요)]
1. 반드시 1~2문장(최대 3줄 이내)으로 아주 짧고 명확하게 작성할 것! (불필요한 부연 설명 절대 금지)
2. 첫 시작은 아이 이름(${data.childName})을 부르며 점수나 잘한 점을 짧게 칭찬해줘.
3. [주의가 필요한 단어] 중 1개의 발음 팁(입모양 등)을 알려줘.
4. 억양이나 유창성이 낮다면 기계적인 팁(마침표에서 내리기 등)은 버리고, **반드시 주어진 [원문]의 뜻과 문장 부호, 핵심 단어(동사/명사 등)에 맞춘 맞춤형 리듬 팁**을 줘!
   (예: 물음표면 끝을 올리기, 감탄사면 신나게, 이 문장에서 제일 중요한 특정 단어를 콕 집어서 강하게 읽기, 쉼표에서 쉬기 등)
5. 단어 팁과 억양 팁을 한 문장으로 자연스럽게 이어 말해줘. 다정하고 친근한 이모지도 사용해.

[완벽한 대답 예시]
"예온아, 87점 정말 잘했어! 👏 'step'은 입술을 톡 떼며 발음해보고, 이 문장에선 제일 중요한 단어인 'block'을 아주 강하고 확실하게 강조해서 읽어볼까? ✨"
    `.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    if (!response.ok) return { success: false, error: "구글 AI 응답 실패" };
    const resData = await response.json();
    const feedback = resData.candidates?.[0]?.content?.parts?.[0]?.text || "💡 조금만 더 힘을 내서 또박또박 읽어볼까요?";

    return { success: true, feedback: feedback.trim() };
  } catch (error: any) {
    console.error("AI 코칭 피드백 생성 에러:", error);
    return { success: false, feedback: "💡 다시 한번 또박또박 자신감 있게 읽어볼까요?" };
  }
}
