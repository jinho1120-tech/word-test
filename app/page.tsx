import Link from "next/link"
import { getWords, getWrongWords, getLatestActiveDate, type Profile } from "@/app/actions/words"
import { StudyApp } from "@/components/study-app"
import { DateNav } from "@/components/date-nav"
import { cn } from "@/lib/utils"

// ▼ 이 한 줄을 반드시 추가해 주세요! (캐시 박제 방지, 항상 서버 실시간 접속) ▼
export const dynamic = "force-dynamic"

const PROFILES: { name: Profile; accent: string }[] = [
  { name: "지온", accent: "#6366f1" },
  { name: "예온", accent: "#ec4899" },
]

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; date?: string }>
}) {
  const params = await searchParams
  const profile: Profile = params.profile === "예온" ? "예온" : "지온"
  const today = todayInSeoul()
  
  // 1. URL에 명시된 날짜가 있는지 확인합니다 (없으면 undefined)
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined

  // 2. URL에 날짜가 없을 때 (북마크/홈 화면 아이콘으로 처음 접속 시)
  if (!date) {
    const todayWords = await getWords(profile, today)
    
    if (todayWords.length === 0) {
      // 오늘 등록한 단어가 없으면 최신 날짜를 찾아서 화면에 띄울 날짜로 설정 (주소창은 안 바뀜!)
      const latestDate = await getLatestActiveDate(profile)
      date = latestDate || today
    } else {
      // 오늘 등록한 단어가 있으면 오늘 날짜 유지
      date = today
    }
  }

  const active = PROFILES.find((p) => p.name === profile)!

  // 날짜별 단어(words)와 누적 오답 단어(wrongWords)를 동시에 불러옵니다
  const words = await getWords(profile, date)
  const wrongWords = await getWrongWords(profile)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-black tracking-tight text-foreground">우리집 영단어 숙제</h1>
        <p className="text-sm text-muted-foreground">외울 단어를 골라 퀴즈로 연습해요</p>
      </header>

      <nav className="grid grid-cols-2 gap-2" aria-label="딸 선택">
        {PROFILES.map((p) => {
          const isActive = p.name === profile
          return (
            <Link
              key={p.name}
              href={`/?profile=${encodeURIComponent(p.name)}&date=${date}`}
              scroll={false}
              className={cn(
                "flex items-center justify-center rounded-2xl border py-3 text-base font-bold transition-all",
                isActive
                  ? "border-transparent text-white shadow-md"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
              style={isActive ? { backgroundColor: p.accent } : undefined}
            >
              {p.name}
            </Link>
          )
        })}
      </nav>

      <DateNav profile={profile} date={date} today={today} accent={active.accent} />

      {/* StudyApp에 오답 노트 데이터(wrongWords)를 추가로 넘겨줍니다 */}
      <StudyApp profile={profile} date={date} words={words} wrongWords={wrongWords} accent={active.accent} />
    </main>
  )
}
