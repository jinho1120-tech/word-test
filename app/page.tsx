import { redirect } from "next/navigation"
import { getWords, getLatestActiveDate, type Profile } from "@/app/actions/words"
import { ProfileSelector } from "@/components/profile-selector"
import { DateNav } from "@/components/date-nav"
import { WordManager } from "@/components/word-manager"
import { WordQuiz } from "@/components/word-quiz"
import { ModeSelector } from "@/components/mode-selector"

const ACCENT_COLORS = {
  지온: "#F43F5E", // Rose-500
  예온: "#3B82F6", // Blue-500
}

export default async function Home({
  searchParams,
}: {
  searchParams: { profile?: string; date?: string; mode?: string }
}) {
  const profile = (searchParams.profile as Profile) || "지온"
  const accent = ACCENT_COLORS[profile]
  
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(now.getTime() + kstOffset)
  const today = kstDate.toISOString().split("T")[0]

  let date = searchParams.date

  if (!date) {
    const todayWords = await getWords(profile, today)
    
    if (todayWords.length === 0) {
      const latestDate = await getLatestActiveDate(profile)
      if (latestDate && latestDate !== today) {
        redirect(`/?profile=${encodeURIComponent(profile)}&date=${latestDate}`)
      }
    }
    date = today
  }

  const mode = searchParams.mode || "quiz"
  const words = await getWords(profile, date)

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background shadow-2xl sm:border-x sm:border-border">
      <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-border bg-background/80 p-5 backdrop-blur-xl">
        <ProfileSelector currentProfile={profile} accent={accent} />
        <DateNav profile={profile} date={date} today={today} accent={accent} />
        <ModeSelector currentMode={mode} accent={accent} />
      </header>

      <main className="flex-1 p-5">
        {mode === "manage" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <WordManager profile={profile} date={date} words={words} accent={accent} />
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <WordQuiz words={words} accent={accent} />
          </div>
        )}
      </main>
    </div>
  )
}
