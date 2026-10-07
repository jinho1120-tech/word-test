"use client"

import { ButtonHTMLAttributes, ReactNode } from "react"
import { haptic } from "@/lib/haptics"

interface HapticButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick?: () => void
  hapticLabel: string
  wrapperClassName?: string
  stopPropagation?: boolean
  children: ReactNode
}

export function HapticButton({
  onClick,
  hapticLabel,
  wrapperClassName = "relative inline-block",
  stopPropagation = false,
  disabled,
  className,
  children,
  ...rest
}: HapticButtonProps) {
  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
        className={className}
        {...rest}
      >
        {children}
      </button>

      <input
        type="checkbox"
        {...({ switch: "" } as Record<string, string>)}
        checked={false}
        disabled={disabled}
        aria-label={hapticLabel}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 disabled:cursor-not-allowed"
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onMouseDown={(e) => e.preventDefault()} // 💡 입력창 포커스 뺏김 완벽 방지!
        onChange={(e) => {
          e.currentTarget.checked = false; 
          haptic();
          onClick?.();
        }}
      />
    </span>
  )
}
