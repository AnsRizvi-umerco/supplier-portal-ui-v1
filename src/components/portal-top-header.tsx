import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  ChevronDown,
  Globe,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  UserCircle
} from "lucide-react";
import { NotificationPopup } from "@/components/NotificationPopup";
import { useMountedOpen } from "@/hooks/useMountedOpen";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/context/auth-context";
import {
  normalizePortalLanguage,
  PORTAL_LANGUAGE_OPTIONS,
  setPortalLanguage,
  type PortalLanguage
} from "@/lib/i18n";
import { paths } from "@/paths";

const LOGO_LIGHT_SRC = "/logo/logo-light.svg";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PortalTopHeader({
  menuOpen,
  onMenuToggle
}: {
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user: authUser, logout, signingOut } = useAuth();
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { items: notificationItems, unreadCount, markAllRead, markOneRead } =
    useNotifications();
  const notificationsMounted = useMountedOpen(notificationsOpen, 180);
  const langMounted = useMountedOpen(langOpen, 180);
  const profileMounted = useMountedOpen(profileOpen, 180);

  const currentLang = normalizePortalLanguage(i18n.language);
  const langShort =
    PORTAL_LANGUAGE_OPTIONS.find((lang) => lang.code === currentLang)?.short ?? "EN";

  const companyName = authUser?.business_partner_name?.trim() || t("login.subtitle");
  const roleLabel =
    authUser?.actor === "partner_admin"
      ? t("shell.roleAdmin")
      : authUser?.actor === "supplier"
        ? t("shell.roleSupplier")
        : t("shell.loadingProfile");
  const email = authUser?.email?.trim() || "";
  const subtitle = email ? `${roleLabel} · ${email}` : roleLabel;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const onLogout = () => {
    setProfileOpen(false);
    void logout();
  };

  const onLanguageChange = (lang: PortalLanguage) => {
    setLangOpen(false);
    if (lang === currentLang) return;
    void setPortalLanguage(lang);
  };

  return (
    <header className="portal-top-header sticky top-0 z-50 h-14 shrink-0">
      <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className={`portal-top-icon-btn portal-top-menu-btn ${menuOpen ? "portal-top-menu-btn-open" : ""}`}
            aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
            aria-expanded={menuOpen}
            aria-controls="portal-sidebar"
            onClick={onMenuToggle}
          >
            {menuOpen ? (
              <PanelLeftClose className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            )}
          </button>

          <Link to={paths.schedules} className="flex min-w-0 items-center gap-3">
            <img
              src={LOGO_LIGHT_SRC}
              alt={authUser?.business_partner_name ?? t("login.subtitle")}
              className="h-7 w-auto shrink-0 object-contain"
            />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm leading-tight">
                <span className="font-semibold text-white">
                  {authUser?.business_partner_name ?? t("login.subtitle")}
                </span>{" "}
                <span className="font-normal text-gray-400">{t("login.title")}</span>
              </p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={langRef}>
            <button
              type="button"
              className="portal-top-lang-btn"
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              onClick={() => {
                setLangOpen((open) => !open);
                setProfileOpen(false);
                setNotificationsOpen(false);
              }}
            >
              <Globe className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
              <span className="text-sm font-medium text-gray-200">{langShort}</span>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform ${langOpen ? "rotate-180" : ""}`}
                strokeWidth={1.75}
              />
            </button>

            {langMounted ? (
              <div
                className={`portal-top-dropdown absolute end-0 top-[calc(100%+0.5rem)] z-50 min-w-[10rem] origin-top-right py-1 ${
                  langOpen ? "animate-dropdown-in" : "pointer-events-none animate-dropdown-out"
                }`}
                role="listbox"
              >
                {PORTAL_LANGUAGE_OPTIONS.map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    role="option"
                    aria-selected={currentLang === code}
                    className={`portal-top-dropdown-item w-full ${
                      currentLang === code ? "portal-top-dropdown-item-active" : ""
                    }`}
                    onClick={() => onLanguageChange(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              className="portal-top-icon-btn relative"
              aria-label={t("shell.notifications")}
              aria-expanded={notificationsOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setNotificationsOpen((open) => {
                  const next = !open;
                  if (next) void markAllRead();
                  return next;
                });
                setLangOpen(false);
                setProfileOpen(false);
              }}
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} />
              {unreadCount > 0 ? (
                <span className="portal-top-notification-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>

            {notificationsMounted ? (
              <NotificationPopup
                open={notificationsOpen}
                items={notificationItems}
                onClose={() => setNotificationsOpen(false)}
                onMarkAllRead={() => {
                  void markAllRead();
                }}
                onItemClick={(id) => {
                  void markOneRead(id);
                }}
              />
            ) : null}
          </div>

          <div className="hidden h-8 w-px bg-white/10 sm:block" aria-hidden />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="portal-top-profile-btn"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              onClick={() => {
                setProfileOpen((open) => !open);
                setLangOpen(false);
                setNotificationsOpen(false);
              }}
            >
              <span className="portal-top-avatar">{initials(companyName)}</span>
              <span className="hidden min-w-0 text-left md:block">
                <span className="block truncate text-sm font-semibold text-white">
                  {companyName}
                </span>
                <span className="block truncate text-xs text-gray-400">{subtitle}</span>
              </span>
              <ChevronDown
                className={`hidden h-4 w-4 shrink-0 text-gray-500 transition-transform md:block ${profileOpen ? "rotate-180" : ""}`}
                strokeWidth={1.75}
              />
            </button>

            {profileMounted ? (
              <div
                className={`portal-top-dropdown absolute end-0 top-[calc(100%+0.5rem)] z-50 min-w-[12rem] origin-top-right py-1 ${
                  profileOpen ? "animate-dropdown-in" : "pointer-events-none animate-dropdown-out"
                }`}
                role="menu"
              >
                <Link
                  to={paths.profile}
                  className="portal-top-dropdown-item flex items-center gap-2"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <UserCircle className="h-4 w-4" strokeWidth={1.75} />
                  {t("nav.profile")}
                </Link>
                <Link
                  to={paths.settings}
                  className="portal-top-dropdown-item flex items-center gap-2"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings className="h-4 w-4" strokeWidth={1.75} />
                  {t("nav.settings")}
                </Link>
                <div className="my-1 border-t border-umerco-border/70" />
                <button
                  type="button"
                  className="portal-top-dropdown-item flex w-full items-center gap-2 text-red-600"
                  role="menuitem"
                  disabled={signingOut}
                  onClick={() => void onLogout()}
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  {signingOut ? t("login.signingOut") : t("button.logout")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
