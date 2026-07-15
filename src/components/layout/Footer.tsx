import { MessageCircle, Phone, Mail, Globe } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";

export function Footer() {
  const { t, toggle } = useLang();
  const year = 2026;

  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="container-page flex flex-col justify-between gap-10 py-12 md:flex-row">
        <div className="max-w-xs">
          <span className="text-xl font-extrabold tracking-tight text-ink">
            MODON
          </span>
          <p className="mt-3 text-sm text-muted">{t("footer.tagline")}</p>
          <button
            onClick={toggle}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Globe className="h-4 w-4" />
            {t("lang.toggle")}
          </button>
        </div>

        <div className="md:text-start">
          <h4 className="text-sm font-semibold text-ink">
            {t("footer.contact")}
          </h4>
          <ul className="mt-3 space-y-2.5 text-sm text-muted">
            <li>
              <a
                href="https://wa.me/9718006636"
                className="inline-flex items-center gap-2 hover:text-primary"
              >
                <MessageCircle className="h-4 w-4" />
                {t("footer.whatsapp")}
              </a>
            </li>
            <li>
              <a
                href="tel:+9718006636"
                className="inline-flex items-center gap-2 hover:text-primary"
              >
                <Phone className="h-4 w-4" />
                {t("footer.phone")}
              </a>
            </li>
            <li>
              <a
                href="mailto:leasing@modon.example"
                className="inline-flex items-center gap-2 hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                {t("footer.email")}
              </a>
            </li>
          </ul>
        </div>

      </div>

      <div className="border-t border-line">
        <div className="container-page py-4 text-xs text-muted">
          © {year} {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
