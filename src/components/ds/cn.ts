/** Склейка классов: ложные значения пропускаются */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
