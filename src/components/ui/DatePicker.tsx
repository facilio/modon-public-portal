import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { inputClass } from "./Input";
import { useLang } from "../../i18n/LanguageContext";

interface DatePickerProps {
  id?: string;
  /** ISO date string `yyyy-mm-dd`, or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Optional inclusive lower bound as an ISO `yyyy-mm-dd` string. */
  min?: string;
  className?: string;
}

/** Local `yyyy-mm-dd` ⇄ Date helpers that never touch UTC (no tz drift). */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A styled calendar date picker that replaces the native `<input type="date">`.
 * Emits/consumes the same ISO `yyyy-mm-dd` string, so it's a drop-in for the
 * native control. Localized (month/weekday names, RTL) via the app language.
 */
export function DatePicker({
  id,
  value,
  onChange,
  invalid,
  min,
  className,
}: DatePickerProps) {
  const { t, lang, dir } = useLang();
  const [open, setOpen] = useState(false);
  // Which grid the popover shows: day cells, the 12 months, or a page of years.
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => (min ? parseISO(min) : null), [min]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // The month to land on when opening without a selection: today, unless `min`
  // is in a later month (then start there so the first view has pickable days
  // instead of a fully-disabled grid the user has to page past).
  const defaultView = useMemo(
    () => (minDate && minDate.getTime() > today.getTime() ? minDate : today),
    [minDate, today]
  );

  // The month currently shown in the grid; follows the selected value.
  const [viewMonth, setViewMonth] = useState<Date>(
    () => selected ?? defaultView
  );
  useEffect(() => {
    if (open) {
      setViewMonth(selected ?? defaultView);
      setView("days"); // always reopen on the day grid
    }
  }, [open, selected, defaultView]);

  // Flip the popover above the trigger when there isn't room below it.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const POPOVER_H = 360; // approximate calendar height
    const rect = rootRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setPlacement(below < POPOVER_H && rect.top > below ? "top" : "bottom");
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const locale = lang === "ar" ? "ar-AE" : "en-GB";
  const displayText = selected
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(selected)
    : t("f.date.ph");

  const monthTitle = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(viewMonth);

  // Sunday-first weekday headers (single-letter), localized.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2023, 0, 1 + i)) // 2023-01-01 was a Sunday
    );
  }, [locale]);

  // 6×7 grid of days, including leading/trailing days from adjacent months.
  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay()); // back to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  function isDisabled(d: Date): boolean {
    return !!minDate && d.getTime() < minDate.getTime();
  }

  function pick(d: Date) {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  }

  // Localized short month names ("Jan"…"Dec"), for the month-picker grid.
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)));
  }, [locale]);

  // A page of 12 years, aligned so the current year sits on a stable grid.
  const YEARS_PER_PAGE = 12;
  const yearPageStart =
    viewMonth.getFullYear() - (((viewMonth.getFullYear() % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE);
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i);
  const yearRangeTitle = `${yearPageStart} – ${yearPageStart + YEARS_PER_PAGE - 1}`;

  // A whole month/year is disabled only when its LAST day is before `min`.
  function monthDisabled(year: number, month: number): boolean {
    if (!minDate) return false;
    const lastDay = new Date(year, month + 1, 0);
    return lastDay.getTime() < minDate.getTime();
  }
  function yearDisabled(year: number): boolean {
    if (!minDate) return false;
    return new Date(year, 11, 31).getTime() < minDate.getTime();
  }

  // Header center-title click cycles days → months → years (drilling out).
  const titleLabel =
    view === "days" ? monthTitle : view === "months" ? String(viewMonth.getFullYear()) : yearRangeTitle;
  function onTitleClick() {
    setView((v) => (v === "days" ? "months" : v === "months" ? "years" : "days"));
  }
  // Prev/next step depends on the active view: ±1 month / ±1 year / ±12 years.
  function stepView(delta: number) {
    setViewMonth((m) => {
      if (view === "days") return new Date(m.getFullYear(), m.getMonth() + delta, 1);
      if (view === "months") return new Date(m.getFullYear() + delta, m.getMonth(), 1);
      return new Date(m.getFullYear() + delta * YEARS_PER_PAGE, m.getMonth(), 1);
    });
  }
  const prevLabel =
    view === "days" ? t("f.date.prev") : view === "months" ? t("f.date.prevYear") : t("f.date.prevYears");
  const nextLabel =
    view === "days" ? t("f.date.next") : view === "months" ? t("f.date.nextYear") : t("f.date.nextYears");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          inputClass,
          "flex items-center justify-between text-start",
          invalid ? "border-red-400" : "border-line",
          !selected && "text-muted/70",
          className
        )}
      >
        <span className="truncate">{displayText}</span>
        <Calendar className="ms-2 h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div
          dir={dir}
          role="dialog"
          className={cn(
            "absolute z-50 w-[19rem] rounded-xl border border-line bg-white p-3 shadow-lg",
            placement === "top" ? "bottom-full mb-2" : "mt-2"
          )}
        >
          {/* Nav — arrows step by month/year/decade; center title drills out */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={prevLabel}
              onClick={() => stepView(-1)}
              className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={onTitleClick}
              aria-label={view === "days" ? t("f.date.pickMonth") : t("f.date.pickYear")}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-ink transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {titleLabel}
            </button>
            <button
              type="button"
              aria-label={nextLabel}
              onClick={() => stepView(1)}
              className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>

          {view === "days" && (
            <>
              {/* Weekday header */}
              <div className="grid grid-cols-7 text-center">
                {weekdays.map((w, i) => (
                  <span key={i} className="py-1 text-xs font-medium text-muted">
                    {w}
                  </span>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  const inMonth = d.getMonth() === viewMonth.getMonth();
                  const isSel = selected && sameDay(d, selected);
                  const isToday = sameDay(d, today);
                  const disabled = isDisabled(d);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors",
                        isSel
                          ? "bg-primary font-semibold text-white hover:bg-primary-hover"
                          : disabled
                          ? "cursor-not-allowed text-muted/40"
                          : inMonth
                          ? "text-ink hover:bg-primary-soft hover:text-primary"
                          : "text-muted/50 hover:bg-primary-soft/60",
                        !isSel && isToday && "font-semibold text-primary"
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "months" && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {monthNames.map((name, m) => {
                const isSel = !!selected && selected.getMonth() === m && selected.getFullYear() === viewMonth.getFullYear();
                const disabled = monthDisabled(viewMonth.getFullYear(), m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setViewMonth(new Date(viewMonth.getFullYear(), m, 1));
                      setView("days");
                    }}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-lg text-sm transition-colors",
                      isSel
                        ? "bg-primary font-semibold text-white hover:bg-primary-hover"
                        : disabled
                        ? "cursor-not-allowed text-muted/40"
                        : "text-ink hover:bg-primary-soft hover:text-primary"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {view === "years" && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {years.map((y) => {
                const isSel = !!selected && selected.getFullYear() === y;
                const disabled = yearDisabled(y);
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setViewMonth(new Date(y, viewMonth.getMonth(), 1));
                      setView("months");
                    }}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-lg text-sm transition-colors",
                      isSel
                        ? "bg-primary font-semibold text-white hover:bg-primary-hover"
                        : disabled
                        ? "cursor-not-allowed text-muted/40"
                        : "text-ink hover:bg-primary-soft hover:text-primary"
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {t("f.date.clear")}
            </button>
            <button
              type="button"
              onClick={() => pick(today)}
              disabled={isDisabled(today)}
              className="rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover disabled:opacity-40"
            >
              {t("f.date.today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
