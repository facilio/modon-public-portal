import { useLang } from "../../i18n/LanguageContext";

export function Footer() {
  const { t } = useLang();
  const year = 2026;

  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="container-page py-6 text-center text-xs text-muted">
        © {year} {t("footer.rights")}
      </div>
    </footer>
  );
}
