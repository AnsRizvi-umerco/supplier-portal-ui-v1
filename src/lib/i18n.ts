import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import de from "@/i18n/locales/de.json";

export type PortalLanguage = "en" | "es" | "fr" | "de";

export const PORTAL_LANGUAGE_OPTIONS: { code: PortalLanguage; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "es", label: "Español", short: "ES" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "de", label: "Deutsch", short: "DE" }
];

export const PORTAL_LANGUAGES: PortalLanguage[] = PORTAL_LANGUAGE_OPTIONS.map((option) => option.code);

const PORTAL_LANGUAGE_SET = new Set<string>(PORTAL_LANGUAGES);

export function normalizePortalLanguage(value: string | null | undefined): PortalLanguage {
  const code = (value ?? "").split("-")[0].toLowerCase();
  if (PORTAL_LANGUAGE_SET.has(code)) return code as PortalLanguage;
  return "en";
}

export function getStoredLanguage(): PortalLanguage {
  if (typeof document === "undefined") return "en";

  const cookieMatch = document.cookie.match(/(?:^|;\s*)portal_lang=([^;]+)/);
  const fromCookie = cookieMatch?.[1];
  const fromStorage = localStorage.getItem("portal_lang");
  return normalizePortalLanguage(fromCookie || fromStorage);
}

export function applyDocumentLanguage(lang: PortalLanguage): void {
  if (typeof document === "undefined") return;

  document.documentElement.lang = lang;
  document.documentElement.dir = "ltr";
  localStorage.setItem("portal_lang", lang);
  document.cookie = `portal_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
}

export async function setPortalLanguage(lang: PortalLanguage): Promise<void> {
  applyDocumentLanguage(lang);
  await i18n.changeLanguage(lang);
}

const initialLanguage = getStoredLanguage();
applyDocumentLanguage(initialLanguage);

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de }
    },
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: { escapeValue: false }
  });
}

export default i18n;
