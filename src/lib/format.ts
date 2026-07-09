import type { Lang } from "../i18n/strings";

// Business dates are always displayed in Asia/Dubai regardless of the browser TZ
// (per doc E-25). Input is an ISO date/datetime string.
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(d);
}

// Localised number (Arabic uses Eastern Arabic numerals via the ar-AE locale).
export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-US").format(n);
}
