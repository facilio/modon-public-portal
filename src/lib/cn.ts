// Minimal className joiner (no clsx dependency needed for this build).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
