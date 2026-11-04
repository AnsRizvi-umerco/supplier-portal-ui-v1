import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMountedOpen } from "@/hooks/useMountedOpen";
import {
  normalizePortalLanguage,
  PORTAL_LANGUAGE_OPTIONS,
  setPortalLanguage,
  type PortalLanguage
} from "@/lib/i18n";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = normalizePortalLanguage(i18n.language);
  const currentLabel =
    PORTAL_LANGUAGE_OPTIONS.find((lang) => lang.code === current)?.label ?? "English";
  const [open, setOpen] = useState(false);
  const mounted = useMountedOpen(open, 180);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setLang = (lang: PortalLanguage) => {
    setOpen(false);
    if (lang === current) return;
    void setPortalLanguage(lang);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="login-lang-btn"
        aria-label={t("common.language")}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <Globe className="h-4 w-4 text-umerco-muted" strokeWidth={1.75} />
        <span>{currentLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-umerco-muted transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>

      {mounted ? (
        <div
          className={`portal-top-dropdown absolute end-0 top-[calc(100%+0.5rem)] z-50 min-w-[10.5rem] origin-top-right py-1 ${
            open ? "animate-dropdown-in" : "pointer-events-none animate-dropdown-out"
          }`}
          role="listbox"
        >
          {PORTAL_LANGUAGE_OPTIONS.map(({ code, label }) => {
            const selected = current === code;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                className={`portal-top-dropdown-item flex w-full items-center justify-between gap-3 ${
                  selected ? "portal-top-dropdown-item-active" : ""
                }`}
                onClick={() => setLang(code)}
              >
                <span>{label}</span>
                {selected ? <Check className="h-4 w-4" strokeWidth={1.75} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
