import Link from "next/link"
import { getWords, getWrongWords, getLatestActiveDate, type Profile } from "@/app/actions/words"
import { StudyApp } from "@/components/study-app"
import { DateNav } from "@/components/date-nav"
import { cn } from "@/lib/utils"

// 캐시 박제 방지, 항상 서버 실시간 접속
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
  
  // URL에 지정된 날짜가 있는지 확인합니다.
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined

  // 지정된 날짜가 없을 때 (앱 처음 켰을 때 / 북마크로 들어왔을 때)
  if (!date) {
    const todayWords = await getWords(profile, today)
    
    // 1. 오늘 등록된 단어가 없다면
    if (todayWords.length === 0) {
      const latestDate = await getLatestActiveDate(profile)
      // 주소창(URL)을 강제로 바꾸지 않고, 화면에 그릴 '기준 날짜'만 조용히 최신 날짜로 바꿉니다.
      date = latestDate || today
    } else {
      // 2. 단어가 있으면 오늘 날짜 유지
      date = today
    }
  }

  const active = PROFILES.find((p) => p.name === profile)!

  // 결정된 날짜를 바탕으로 단어 데이터를 불러옵니다
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

      <StudyApp profile={profile} date={date} words={words} wrongWords={wrongWords} accent={active.accent} />
    </main>
  )
}
