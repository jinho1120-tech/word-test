"use client"

import { useRouter } from "next/navigation"
import { Calendar } from "lucide-react"
import type { Profile } from "@/app/actions/words"

function formatKorean(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][dt.getUTCDay()]
  return `${m}월 ${d}일 (${weekday})`
}

export function DateNav({
  profile,
  date,
  today,
  accent,
}: {
  profile: Profile
  date: string
  today: string
  accent: string
}) {
  const router = useRouter()

  function go(newDate: string) {
    router.push(`/?profile=${encodeURIComponent(profile)}&date=${newDate}`, { scroll: false })
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Calendar className="size-4" style={{ color: accent }} />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">{formatKorean(date)}</span>
          {date === today && (
            <span className="text-xs font-medium" style={{ color: accent }}>
              오늘
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          aria-label="날짜 선택"
        />
        {date !== today && (
          <button
            onClick={() => go(today)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            오늘
          </button>
        )}
      </div>
    </div>
  )
}
