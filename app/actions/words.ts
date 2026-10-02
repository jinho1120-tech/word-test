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

export async function getWords(profile: string, date: string): Promise {
  assertProfile(profile)
  return db
    .select()
    .from(wordEntries)
    .where(and(eq(wordEntries.profile, profile), eq(wordEntries.assignmentDate, date)))
    .orderBy(asc(wordEntries.createdAt))
}

export async function getWrongWords(profile: string): Promise {
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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
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

  const dateMap = new Map>()
  results.forEach((r) => {
    if (!dateMap.has(r.date)) dateMap.set(r.date, new Set())
    if (r.subject) dateMap.get(r.date)!.add(r.subject)
  })

  return Array.from(dateMap.entries()).map(([date, subjectSet]) => ({
    date,
    subjects: Array.from(subjectSet)
  }))
}

export async function getLatestActiveDate(profile: string): Promise {
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
      // 💡 [클로드 피드백 반영] 하이픈, 끊어읽기, 대명사 대문자 처리 규칙 수정
      promptText = `
      너는 한국의 초등학생을 위한 친절하고 다정한 영어 선생님이야.
      다음 제공된 영어 단어들을 사용해서, 아이들이 쉐도잉(Shadowing) 훈련을 할 수 있는 쉽고 자연스러운 영어 예문을 딱 1개씩 만들어줘.
      
      [필수 문장 작성 규칙]
      1. sentence (메인 예문):
         - 반드시 **정상적이고 완전한 표준 영어 문장**이어야 해.
         - 문장 첫 글자는 무조건 대문자로 시작하고, 표준 스펠링 및 대소문자 규칙을 완벽하게 지켜!
         - 절대로 sentence 항목에 대문자 강세 표시(예: SHAD-ow, RUN)나 음절 구분 하이픈(a-way)을 넣지 마!
         - 오직 의미 단위 청크 구분을 위한 빗금("/") 기호만 포함해.

      2. guide (하단 리듬 가이드):
         - 정답 단어가 포함된 완성된 문장을 바탕으로, 아래 [LINGUISTIC ANNOTATION RULES]를 엄격히 적용해 강세와 하이픈을 넣은 가이드를 작성해.

      3. 테마 및 난이도:
         - 문장은 초등학교 수준의 쉬운 단어로 구성하되, 테마 [\({randomTheme}]에 어울리는 재미있는 상황으로 구성해. (Seed:\){randomSeed})

      [LINGUISTIC ANNOTATION RULES (guide 전용 규칙)]
      1. STRESS & SYLLABLE SPLITTING: 
      - 강세를 받는 단어/음절만 대문자로, 나머지는 소문자로 써.
      - 2음절 이상 단어는 가장 강하게 발음되는 한 음절만 대문자로 써.
      - 명사, 본동사, 형용사, 부사, 지시대명사, 의문사, 부정어는 강세를 받음 (대문자).
      - 관사, 전치사, 인칭대명사(I, We, He, She, They 등 무조건 포함), 접속사, to부정사의 to, be동사, 긍정 조동사는 강세를 받지 않음 (소문자).
      - 예외: 부정 조동사 축약형(isn't, doesn't 등)이나 문장 끝에 홀로 남은 전치사/조동사는 대문자.
      - [CRITICAL HYPHENATION RULE]: 2음절 이상의 긴 단어가 늘어지게 발음될 때만 하이픈으로 음절을 구분해 (예: after -> AF-ter, body -> BO-dy). "hands"나 "looked"처럼 -s, -ed가 붙어도 1음절로 발음되는 단어는 절대로 하이픈으로 쪼개지 마! (hands -> HANDS, looked -> LOOKED)

      2. PAUSE (의미 단위 끊어 읽기 규칙 - sentence와 guide 공통 적용):
      - 초등학생이 호흡하기 좋은 자연스러운 의미 덩어리(Thought Group)로 잘라줘.
      - 5단어 이하의 짧은 문장은 굳이 자르지 않아도 돼.
      - "Mom says /", "He thinks /", "I know /" 처럼 전달동사 바로 뒤는 끊어주는 게 좋아.
      - 주어와 동사를 억지로 가르지 마.

      결과는 반드시 아래 JSON 배열 형식으로만 대답할 것.
      [
        { 
          "word": "shadow", 
          "sentence": "My funny shadow / tried to run away / from me.", 
          "translation": "내 재미있는 그림자가 나에게서 도망치려고 했어요.",
          "guide": "my FUNny SHAD-ow / TRIED to RUN a-WAY / from me."
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
      3. 이번 예문의 배경 테마는 [\({randomTheme}]야. 이 테마에 어울리는 상황을 상상해서 매번 완전히 새로운 문장을 만들어줘! (Seed:\){randomSeed})
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

    // 💡 [클로드 피드백 반영] 가이드 규칙의 정확도를 위해 temperature를 0.3으로 낮춤 (speaking일 때)
    const temp = quizType === "speaking" ? 0.3 : 0.9;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: temp }
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { success: false, isRateLimit: true, error: "AI 사용량 초과" };
      }
      return { success: false, error: `구글 AI 에러: ${response.status}` };
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

    const lowAccuracyWords = data.wordScores
      .filter(w => w.score < 80 || w.errorType === "Omission" || w.phonemes.some(p => p.score < 70))
      .map(w => {
        const badPhonemes = w.phonemes.filter(p => p.score < 70).map(p => p.phoneme).join(", ");
        return `- 단어: "\({w.text}" (점수:\){Math.round(w.score)}점, 상태: \({w.errorType || "발음미흡"}\){badPhonemes ? `, 미흡한 발음기호: [${badPhonemes}]` : ""})`;
      })
      .join("\n");

    const needsProsodyTip = data.pronResult.fluency < 80 || data.pronResult.prosody < 75;

    let wordRule = "";
    if (lowAccuracyWords.trim()) {
      wordRule = "3. [주의가 필요한 단어] 중 1개의 발음 팁(입모양 등)을 쉽게 알려줘.";
    } else {
      wordRule = "3. 모든 단어의 발음이 훌륭하므로, 특정 단어의 발음을 고치라는 지적이나 팁은 **절대로** 쓰지 마!";
    }

    let prosodyRule = "";
    let perfectExample = "";

    if (needsProsodyTip) {
      prosodyRule = `4. **[핵심 억양/리듬 팁]** 유창성이나 억양 점수가 낮으므로 화면의 스피커(원어민 목소리)를 듣고 '멜로디와 리듬'을 흉내내도록 유도해줘.`;
      perfectExample = `"예온아, 87점 정말 잘했어! 👏 ${lowAccuracyWords.trim() ? "'careful'은 입술을 살짝 깨물며 발음해보고, " : ""}스피커 버튼을 눌러서 원어민 선생님의 멜로디를 노래하듯 똑같이 흉내내볼까? 🎶"`;
    } else {
      prosodyRule = `4. **[핵심 억양/리듬 팁]** 유창성과 억양 점수가 이미 훌륭해! **따라서 리듬, 멜로디, 억양, 스피커 버튼 흉내내기에 대한 조언은 절대로 포함하지 마.** 오직 단어 발음 팁 하나만 주고 아주 깔끔하게 끝내.`;
      perfectExample = `"예온아, 완벽해! 👏 발음부터 억양까지 원어민 같아, 정말 대단해! ✨"`;
    }

    const promptText = `
너는 한국의 초등학생('${data.childName}')을 다정하게 지도하는 1:1 영어 선생님이야.
아이가 방금 읽은 문장의 평가 데이터를 바탕으로, 보완할 점을 **핵심만 아주 짧고 간결하게** 작성해줘.

[원문]
"${data.sentence}"

[평가 데이터]
- 종합점수: \({Math.round(data.pronResult.score)}점 (정확도:\){Math.round(data.pronResult.accuracy)}, 유창성: \({Math.round(data.pronResult.fluency)}, 억양:\){Math.round(data.pronResult.prosody)})
\({lowAccuracyWords ? `\n[주의가 필요한 단어들]\n\){lowAccuracyWords}` : "\n[모든 단어 발음 훌륭함]"}

[작성 규칙 (매우 중요)]
1. 반드시 1~2문장(최대 3줄 이내)으로 아주 짧고 명확하게 작성할 것! (불필요한 부연 설명 금지)
2. 첫 시작은 아이 이름(${data.childName})을 부르며 점수나 잘한 점을 짧게 칭찬해줘.
${wordRule}
${prosodyRule}
5. 다정하고 친근한 이모지를 사용해.

[완벽한 대답 예시]
${perfectExample}
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
    return { success: false, feedback: "💡 스피커 버튼을 누르고 선생님 목소리를 똑같이 따라 해볼까요? 🎶" };
  }
}

export async function extractSpeechScriptWithGemini(base64Image: string, mimeType: string) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const promptText = `
이 이미지는 초등학생의 영어 학습지(워크시트)입니다. 
인쇄된 영어 문장들과, 연필로 적힌 아이의 손글씨 정답들이 섞여 있습니다.

[당신의 임무]
1. 인쇄된 문장의 흐름을 파악하고, 빈칸(밑줄) 자리에 아이가 연필로 적은 손글씨 정답을 완벽하게 끼워 넣으세요.
2. 뚝뚝 끊어진 문장들을 하나로 자연스럽게 이어서, 아이가 발표(Speech) 연습을 할 수 있는 **하나의 완성된 영어 문단(Paragraph)**으로 만들어주세요.
3. 지저분한 기호, 화살표, 한글 뜻, 점수 표시 등은 모두 무시하고 오직 "완성된 영어 문단 텍스트"만 출력하세요.
4. "Here is the text" 같은 부연 설명은 절대 하지 말고, 오직 완성된 영어 텍스트만 결과로 반환하세요.
    `.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
        generationConfig: { temperature: 0.2 } 
      })
    });

    if (!response.ok) return { success: false, error: "구글 AI 응답 실패" };
    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      return { success: false, error: "응답 없음" };
    }

    const scriptText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!scriptText.trim()) {
       return { success: false, error: "텍스트를 추출하지 못했습니다." };
    }

    return { success: true, script: scriptText.trim() };
  } catch (e: any) {
    return { success: false, error: `서버 에러: ${e.message}` };
  }
}

export async function translateScriptWithGemini(script: string) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { success: false, error: "API 키가 등록되지 않았습니다." };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const promptText = `
다음 영어 대본을 한 문장씩 자연스러운 한국어로 번역하세요.
각 문장별 번역을 순수한 JSON 배열 형태로만 출력하세요. (다른 설명이나 마크다운 코드블록 절대 금지)

[대본]
${script}

[출력 예시]
["안녕, 얘들아!", "나는 방과 후 클럽에 가입할까 생각 중이야.", "뜨개질 클럽에 들어갈 거야."]
    `.trim();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.1 } 
      })
    });

    if (!response.ok) return { success: false, error: "구글 AI 응답 실패" };
    const data = await response.json();
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return { success: true, translations: JSON.parse(cleanText) };
  } catch (e: any) {
    return { success: false, error: `서버 에러: ${e.message}` };
  }
}

// 💡 [보안] 클라이언트(브라우저)에 API 키를 노출하지 않고 안전하게 일회용 토큰 발급
export async function getAzureSpeechToken() {
  try {
    const key = process.env.AZURE_SPEECH_KEY || process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION;

    if (!key || !region) return { success: false, error: "Azure 설정이 없습니다." };

    const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      cache: "no-store"
    });

    if (!response.ok) return { success: false, error: "토큰 발급 실패" };
    const token = await response.text();
    
    return { success: true, token, region };
  } catch (e: any) {
    return { success: false, error: `서버 에러: ${e.message}` };
  }
}
