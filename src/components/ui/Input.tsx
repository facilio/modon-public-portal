import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const inputClass =
  "h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, onWheel, ...rest },
  ref
) {
  // A focused <input type="number"> changes its value when the wheel scrolls
  // over it — so scrolling the page to the next field silently edits the number.
  // Blur on wheel to stop that (the page still scrolls normally).
  const handleWheel: InputProps["onWheel"] =
    rest.type === "number"
      ? (e) => {
          e.currentTarget.blur();
          onWheel?.(e);
        }
      : onWheel;

  return (
    <input
      ref={ref}
      className={cn(
        inputClass,
        invalid ? "border-red-400" : "border-line",
        className
      )}
      onWheel={handleWheel}
      {...rest}
    />
  );
});
