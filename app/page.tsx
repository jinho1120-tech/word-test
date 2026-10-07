import { getWords, getWrongWords, getLatestActiveDate, type Profile } from "@/app/actions/words"
import { StudyApp } from "@/components/study-app"
import { DateNav } from "@/components/date-nav"
import { ProfileSelector } from "@/components/profile-selector"

export const dynamic = "force-dynamic"

const PROFILES: { name: Profile; accent: string }[] = [
  { name: "지온", accent: "#c4b5fd" },
  { name: "예온", accent: "#2dd4bf" },
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
  
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined

  if (!date) {
    const todayWords = await getWords(profile, today)
    if (todayWords.length === 0) {
      const latestDate = await getLatestActiveDate(profile)
      date = latestDate || today
    } else {
      date = today
    }
  }

  const active = PROFILES.find((p) => p.name === profile)!
  const words = await getWords(profile, date)
  const wrongWords = await getWrongWords(profile)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-black tracking-tight text-foreground">우리집 영단어 숙제</h1>
        <p className="text-sm text-muted-foreground">외울 단어를 골라 퀴즈로 연습해요</p>
      </header>

      {/* 💡 햅틱이 적용된 클라이언트 컴포넌트로 교체 완료 */}
      <ProfileSelector profiles={PROFILES} currentProfile={profile} date={date} />

      <DateNav profile={profile} date={date} today={today} accent={active.accent} />

      <StudyApp profile={profile} date={date} words={words} wrongWords={wrongWords} accent={active.accent} />
    </main>
  )
}
