

import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { LoginSystemsBackdrop } from "@/components/auth/LoginSystemsBackdrop";
import { LoginField } from "@/components/forms/LoginField";
import { OtpInput } from "@/components/forms/OtpInput";
import { LanguageToggle } from "@/components/language-toggle";
import { btnPrimaryLg, btnSecondary } from "@/components/umerco/styles";
import { paths } from "@/paths";

const LOGO_LIGHT_SRC = "/logo/logo-light.svg";
const LOGO_DARK_SRC = "/logo/logo-dark.svg";

type Step = "email" | "otp" | "password";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const onEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStep("otp");
  };

  const onOtpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length < 6) return;
    setStep("password");
  };

  const onPasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const backToEmail = () => {
    setStep("email");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
  };

  const backToOtp = () => {
    setStep("otp");
    setPassword("");
    setConfirmPassword("");
  };

  const stepTitle =
    step === "email" ? t("forgot.title") : step === "otp" ? t("forgot.verifyTitle") : t("forgot.passwordTitle");

  const stepSubtitle =
    step === "email"
      ? t("forgot.subtitle")
      : step === "otp"
        ? t("forgot.verifySubtitle", { email })
        : t("forgot.passwordSubtitle");

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="login-brand-panel relative flex flex-col justify-between overflow-hidden lg:w-[58%] xl:w-[62%]">
        <div className="login-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 end-0 w-px bg-white/10" aria-hidden />

        <div className="relative z-10 flex flex-1 flex-col justify-center px-8 py-12 lg:px-14 lg:py-16">
          <img
            src={LOGO_LIGHT_SRC}
            alt={t("login.subtitle")}
            className="h-10 w-auto max-w-[220px] object-contain object-left rtl:object-right"
          />
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-blue-300">
            {t("login.title")}
          </p>

          <h1 className="login-brand-title mt-8 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white lg:text-4xl">
            {t("forgot.headline")}
          </h1>
          <p className="login-brand-copy mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            {t("forgot.description")}
          </p>

          <ul className="mt-10 hidden space-y-0 border-t border-white/10 lg:block">
            <li className="flex items-center gap-3.5 border-b border-white/10 py-3.5 text-sm text-white/80">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span>{t("forgot.stepEmailHint")}</span>
            </li>
            <li className="flex items-center gap-3.5 border-b border-white/10 py-3.5 text-sm text-white/80">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span>{t("forgot.stepOtpHint")}</span>
            </li>
            <li className="flex items-center gap-3.5 border-b border-white/10 py-3.5 text-sm text-white/80">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                <KeyRound className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span>{t("forgot.stepPasswordHint")}</span>
            </li>
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
          <div className="w-full max-w-[440px]">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-umerco-dark">{stepTitle}</h2>
              <p className="mt-1.5 text-sm text-umerco-muted">{stepSubtitle}</p>
            </div>

            <div className="mb-6 flex items-center gap-2">
              <StepBadge
                active={step === "email"}
                complete={step === "otp" || step === "password"}
                label="1"
                title={t("forgot.stepEmail")}
              />
              <div className="h-px w-4 shrink-0 bg-umerco-border" aria-hidden />
              <StepBadge
                active={step === "otp"}
                complete={step === "password"}
                label="2"
                title={t("forgot.stepOtp")}
              />
              <div className="h-px w-4 shrink-0 bg-umerco-border" aria-hidden />
              <StepBadge active={step === "password"} complete={false} label="3" title={t("forgot.stepPassword")} />
            </div>

            <div className="auth-form-card p-7 lg:p-8">
              {step === "email" ? (
                <form className="space-y-5" onSubmit={onEmailSubmit} noValidate>
                  <LoginField
                    label={t("login.email")}
                    icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("login.emailPlaceholder")}
                  />

                  <button type="submit" className={`${btnPrimaryLg} login-submit-btn h-12 w-full gap-2.5`}>
                    {t("forgot.sendCode")}
                  </button>
                </form>
              ) : step === "otp" ? (
                <form className="space-y-5" onSubmit={onOtpSubmit} noValidate>
                  <OtpInput label={t("forgot.otpLabel")} value={otp} onChange={setOtp} />

                  <p className="text-center text-sm text-umerco-muted">
                    {t("forgot.resendPrompt")}{" "}
                    <button type="button" className="font-medium text-umerco-primary hover:underline">
                      {t("forgot.resendCode")}
                    </button>
                  </p>

                  <button type="submit" className={`${btnPrimaryLg} login-submit-btn h-12 w-full gap-2.5`}>
                    {t("forgot.verifyCode")}
                  </button>

                  <button
                    type="button"
                    onClick={backToEmail}
                    className={`${btnSecondary} h-11 w-full gap-2 text-sm`}
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                    {t("forgot.changeEmail")}
                  </button>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={onPasswordSubmit} noValidate>
                  <LoginField
                    label={t("forgot.newPassword")}
                    icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
                    showPasswordToggle
                    showPasswordLabel={t("login.showPassword")}
                    hidePasswordLabel={t("login.hidePassword")}
                    name="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("forgot.newPasswordPlaceholder")}
                  />

                  <LoginField
                    label={t("forgot.confirmPassword")}
                    icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
                    showPasswordToggle
                    showPasswordLabel={t("login.showPassword")}
                    hidePasswordLabel={t("login.hidePassword")}
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t("forgot.confirmPasswordPlaceholder")}
                  />

                  <button type="submit" className={`${btnPrimaryLg} login-submit-btn h-12 w-full gap-2.5`}>
                    {t("forgot.resetPassword")}
                  </button>

                  <button
                    type="button"
                    onClick={backToOtp}
                    className={`${btnSecondary} h-11 w-full gap-2 text-sm`}
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                    {t("forgot.backToOtp")}
                  </button>
                </form>
              )}
            </div>

            <p className="mt-6 text-center text-sm text-umerco-muted">
              <Link to={paths.login} className="inline-flex items-center gap-1.5 font-medium text-umerco-primary hover:underline">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                {t("forgot.backToLogin")}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function StepBadge({
  active,
  complete,
  label,
  title
}: {
  active: boolean;
  complete: boolean;
  label: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
          active || complete ? "step-badge-active" : "bg-umerco-beige text-umerco-muted"
        ].join(" ")}
      >
        {label}
      </span>
      <span className={`truncate text-xs font-medium ${active ? "text-umerco-dark" : "text-umerco-muted"}`}>
        {title}
      </span>
    </div>
  );
}
