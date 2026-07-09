import { useLang } from "../../i18n/LanguageContext";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { cn } from "../../lib/cn";
import type { Question } from "../../lib/api/types";

export type AnswerValue = string | number | boolean | string[] | undefined;

/**
 * Renders a single template question by its `type`. The portal has zero
 * hard-coded dynamic questions — this is a pure renderer for whatever the
 * fetched template returns. Answers are stored keyed by question id upstream.
 */
export function DynamicField({
  question,
  value,
  onChange,
  error,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  error?: string;
}) {
  const { t, lang } = useLang();
  const label = lang === "ar" ? question.label_ar : question.label_en;
  const optionalText = t("common.optional");

  return (
    <Field
      label={label}
      required={question.required}
      optionalText={optionalText}
      error={error}
      htmlFor={question.id}
    >
      {renderWidget()}
    </Field>
  );

  function renderWidget() {
    switch (question.type) {
      case "longtext":
        return (
          <textarea
            id={question.id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className={cn(
              "w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary",
              error ? "border-red-400" : "border-line"
            )}
          />
        );

      case "number":
        return (
          <Input
            id={question.id}
            type="number"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
          />
        );

      case "date":
        return (
          <Input
            id={question.id}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
          />
        );

      case "dropdown":
        return (
          <Select
            id={question.id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
          >
            <option value="">—</option>
            {question.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        );

      case "multiselect": {
        const arr = (value as string[]) ?? [];
        const toggle = (opt: string) =>
          onChange(
            arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]
          );
        return (
          <div className="flex flex-wrap gap-2.5">
            {question.options.map((opt) => {
              const active = arr.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-white text-ink-soft hover:border-primary/40"
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }

      case "boolean": {
        const bool = value === true;
        const boolFalse = value === false;
        return (
          <div className="flex gap-2.5">
            <ToggleBtn active={bool} onClick={() => onChange(true)}>
              {t("f.yes")}
            </ToggleBtn>
            <ToggleBtn active={boolFalse} onClick={() => onChange(false)}>
              {t("f.no")}
            </ToggleBtn>
          </div>
        );
      }

      case "text":
      default:
        return (
          <Input
            id={question.id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
          />
        );
    }
  }
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-[5rem] rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-line bg-white text-ink-soft hover:border-primary/40"
      )}
    >
      {children}
    </button>
  );
}

/** Human-readable rendering of an answer for the review step. */
export function formatAnswer(
  question: Question,
  value: AnswerValue,
  dash: string,
  yes: string,
  no: string
): string {
  if (value === undefined || value === "" || value === null) return dash;
  if (question.type === "boolean") return value ? yes : no;
  if (question.type === "multiselect") {
    const arr = value as string[];
    return arr.length ? arr.join("، ") : dash;
  }
  return String(value);
}
