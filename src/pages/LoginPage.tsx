import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, FileCheck, Lock, Mail, Truck } from "lucide-react";
import { LoginSystemsBackdrop } from "@/components/auth/LoginSystemsBackdrop";
import { LoginField } from "@/components/forms/LoginField";
import { LanguageToggle } from "@/components/language-toggle";
import { Loader } from "@/components/umerco/Loader";
import { ReportIssueWidget } from "@/components/ReportIssueWidget";
import { useToast } from "@/components/umerco/toast";
import { btnPrimaryLg } from "@/components/umerco/styles";
import { useAuth } from "@/context/auth-context";
import { paths } from "@/paths";

const highlights = [
  { key: "login.feature.schedules", icon: Truck },
  { key: "login.feature.edi", icon: FileCheck },
  { key: "login.feature.analytics", icon: BarChart3 }
] as const;

const LOGO_LIGHT_SRC = "/logo/logo-light.svg";
const LOGO_DARK_SRC = "/logo/logo-dark.svg";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={paths.dashboard} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      toast.success(t("login.success", { defaultValue: "Signed in successfully." }));
      navigate(paths.dashboard);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="login-brand-panel relative flex flex-col justify-between overflow-hidden lg:w-[58%] xl:w-[62%]">
        <div className="login-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 end-0 w-px bg-white/10" aria-hidden />

        <div className="relative z-10 flex flex-1 flex-col justify-end px-8 py-10 lg:justify-center lg:px-14 lg:py-16">
          <img
            src={LOGO_LIGHT_SRC}
            alt={t("login.subtitle")}
            className="h-10 w-auto max-w-[220px] object-contain object-left rtl:object-right"
          />
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-blue-300">
            {t("login.title")}
          </p>

          <h1 className="login-brand-title mt-7 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white lg:mt-8 lg:text-4xl">
            {t("login.headline")}
          </h1>
          <p className="login-brand-copy mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            {t("login.description")}
          </p>

          <ul className="mt-10 hidden space-y-0 border-t border-white/10 lg:block">
            {highlights.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-center gap-3.5 border-b border-white/10 py-3.5 text-sm text-white/80"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 hidden px-14 pb-8 text-xs text-white/45 lg:block">
          © {new Date().getFullYear()} {t("login.subtitle")}. {t("login.rights")}
        </p>
      </section>

      <section className="login-form-panel relative flex flex-1 flex-col lg:w-[42%] xl:w-[38%]">
        <LoginSystemsBackdrop />

        <header className="relative z-20 flex items-center justify-between border-b border-umerco-border/70 bg-white/70 px-6 py-4 backdrop-blur-sm lg:border-none lg:bg-transparent lg:justify-end lg:px-8 lg:pt-6">
          <img
            src={LOGO_DARK_SRC}
            alt={t("login.subtitle")}
            className="h-7 w-auto object-contain object-left rtl:object-right lg:hidden"
          />
          <LanguageToggle />
        </header>

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-10 lg:px-8">
          <div className="auth-form-card animate-login-in w-full max-w-[440px] p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-umerco-dark">{t("login.welcome")}</h2>
              <p className="mt-1.5 text-sm text-umerco-muted">{t("login.welcomeHint")}</p>
            </div>

            <form className="space-y-5" onSubmit={onSubmit} noValidate>
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <LoginField
                label={t("login.email")}
                icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
                type="email"
                name="email"
                autoComplete="email"
                required
                disabled={pending}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
                error={Boolean(error)}
              />

              <LoginField
                label={t("login.password")}
                icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
                showPasswordToggle
                showPasswordLabel={t("login.showPassword")}
                hidePasswordLabel={t("login.hidePassword")}
                name="password"
                autoComplete="current-password"
                required
                disabled={pending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                error={Boolean(error)}
              />

              <div className="flex justify-end">
                <Link
                  to={paths.forgotPassword}
                  className="text-sm font-medium text-umerco-primary hover:underline"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>

              <button
                type="submit"
                disabled={pending}
                className={`${btnPrimaryLg} login-submit-btn h-12 w-full gap-2.5 disabled:opacity-80`}
              >
                {pending ? (
                  <>
                    <Loader size="xs" variant="light" />
                    <span>{t("login.signingIn")}</span>
                  </>
                ) : (
                  t("button.login")
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      <ReportIssueWidget defaultCategory="login_access" />
    </main>
  );
}
