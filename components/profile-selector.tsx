"use client"

import { useRouter } from "next/navigation"
import { HapticButton } from "./haptic-button"
import { cn } from "@/lib/utils"

interface ProfileSelectorProps {
  profiles: { name: string; accent: string }[]
  currentProfile: string
  date?: string
}

export function ProfileSelector({ profiles, currentProfile, date }: ProfileSelectorProps) {
  const router = useRouter()

  return (
    <nav className="grid grid-cols-2 gap-2" aria-label="딸 선택">
      {profiles.map((p) => {
        const isActive = p.name === currentProfile
        return (
          <HapticButton
            key={p.name}
            hapticLabel={`${p.name} 프로필 선택`}
            onClick={() => router.push(`/?profile=${encodeURIComponent(p.name)}&date=${date || ''}`, { scroll: false })}
            wrapperClassName="relative flex w-full"
            className={cn(
              "w-full flex items-center justify-center rounded-2xl border py-3 text-base font-bold transition-all",
              isActive
                ? "border-transparent text-white shadow-md"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
            style={isActive ? { backgroundColor: p.accent } : undefined}
          >
            {p.name}
          </HapticButton>
        )
      })}
    </nav>
  )
}
