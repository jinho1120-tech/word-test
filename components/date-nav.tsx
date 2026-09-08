"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { getActiveDates, type Profile } from "@/app/actions/words"
import { cn } from "@/lib/utils"

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
  const [isOpen, setIsOpen] = useState(false)
  const [activeDates, setActiveDates] = useState<string[]>([])
  const popoverRef = useRef<HTMLDivElement>(null)

  const [calYear, calMonth] = date.split("-").map(Number)
  const [viewDate, setViewDate] = useState(new Date(calYear, calMonth - 1, 1))

  useEffect(() => {
    getActiveDates(profile).then(setActiveDates).catch(console.error)
  }, [profile])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  function go(newDate: string) {
    router.push(`/?profile=${encodeURIComponent(profile)}&date=${newDate}`, { scroll: false })
    setIsOpen(false)
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  return (
    <div className="relative flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3" ref={popoverRef}>
      <div className="flex items-center gap-2">
        <CalendarIcon className="size-4" style={{ color: accent }} />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">{formatKorean(date)}</span>
          {date === today && (
            <span className="text-xs font-medium" style={{ color: accent }}>오늘</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        >
          날짜 변경
        </button>
        {date !== today && (
          <button
            onClick={() => go(today)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            오늘
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute right-0 top-16 z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-lg animate-in fade-in zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="rounded-md p-1 hover:bg-muted">
              <ChevronLeft className="size-5" />
            </button>
            <span className="text-sm font-bold">{year}년 {month + 1}월</span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="rounded-md p-1 hover:bg-muted">
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
            <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d, i) => {
              if (!d) return <div key={i} />
              
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
              const isSelected = dateStr === date
              const isToday = dateStr === today
              const hasData = activeDates.includes(dateStr)

              // 미래 날짜 제한(disabled) 로직을 제거했습니다.
              return (
                <button
                  key={i}
                  onClick={() => go(dateStr)}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors hover:bg-muted",
                    isSelected && "font-bold text-white hover:opacity-90",
                    isToday && !isSelected && "font-bold text-foreground bg-muted"
                  )}
                  style={isSelected ? { backgroundColor: accent } : {}}
                >
                  {d}
                  {hasData && (
                    <span 
                      className={cn(
                        "absolute bottom-1 h-1 w-1 rounded-full",
                        isSelected ? "bg-white" : "bg-blue-500"
                      )} 
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
