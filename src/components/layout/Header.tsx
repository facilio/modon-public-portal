import { Link } from "react-router-dom";
import { Globe } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { cn } from "../../lib/cn";
import facilioLogo from "../../assets/facilio-logo.svg";
import cwrcLogo from "../../assets/cwrc-logo.svg";

/** facilio logo (brand SVG). */
export function FacilioMark({ className }: { className?: string }) {
  return (
    <img
      src={facilioLogo}
      alt="facilio"
      className={cn("h-6 w-auto", className)}
    />
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <FacilioMark />
      <span className="h-6 w-px bg-line" />
      <img
        src={cwrcLogo}
        alt="CWRC — Construction Workers Residential City"
        width={98}
        height={36}
        className="h-9 w-auto"
      />
    </Link>
  );
}

export function Header() {
  const { t, toggle } = useLang();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Logo />
        <button
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Globe className="h-4 w-4" />
          {t("lang.toggle")}
        </button>
      </div>
    </header>
  );
}
