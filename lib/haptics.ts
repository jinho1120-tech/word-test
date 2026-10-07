export function haptic(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    // 미지원 기기에서는 에러를 무시합니다.
  }
}
