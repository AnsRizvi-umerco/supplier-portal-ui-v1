import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { FormField, FormSection } from "@/components/suppliers/FormField";
import { DocumentTypeMultiSelect } from "@/components/suppliers/DocumentTypeMultiSelect";
import { supplierInitials, SupplierStatusBadge } from "@/components/suppliers/SupplierStatusBadge";
import { Loader } from "@/components/umerco/Loader";
import { useToast } from "@/components/umerco/toast";
import { btnOutline, btnPrimary, btnSecondary, card } from "@/components/umerco/styles";
import { useAuth } from "@/context/auth-context";
import {
  createSupplier,
  SUPPLIER_DOCUMENT_TYPE_OPTIONS,
  type SupplierDocumentType
} from "@/lib/master-portal-suppliers";
import { paths } from "@/paths";

function generatePassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function passwordStrength(password: string): "weak" | "fair" | "strong" {
  if (password.length >= 12) return "strong";
  if (password.length >= 8) return "fair";
  return "weak";
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-umerco-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-umerco-dark">{value}</dd>
    </div>
  );
}

function PreviewGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-umerco-border pt-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-section text-umerco-muted">
        {title}
      </p>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

export default function CreateSupplierPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mutuallyDefinedZz, setMutuallyDefinedZz] = useState("");
  const [duns, setDuns] = useState("");
  const [as2, setAs2] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [documentTypes, setDocumentTypes] = useState<SupplierDocumentType[]>([]);
  const [includeComms, setIncludeComms] = useState(false);
  const [commsUsername, setCommsUsername] = useState("");
  const [commsPassword, setCommsPassword] = useState("");
  const [showCommsPassword, setShowCommsPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewInitials = useMemo(() => supplierInitials(fullName), [fullName]);
  const strength = passwordStrength(password);
  const portalReady = email.trim().length > 0 && password.trim().length >= 8;
  const ediReady =
    mutuallyDefinedZz.trim().length > 0 &&
    duns.trim().length > 0 &&
    as2.trim().length > 0 &&
    channelUrl.trim().length > 0;
  const documentsReady = documentTypes.length > 0;
  const commsReady =
    !includeComms ||
    (commsUsername.trim().length > 0 && commsPassword.trim().length > 0);
  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    ediReady &&
    documentsReady &&
    commsReady;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setPending(true);

    try {
      await createSupplier({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        mutually_defined_zz: mutuallyDefinedZz.trim(),
        duns: duns.trim(),
        as2: as2.trim(),
        channel_url: channelUrl.trim(),
        document_types: documentTypes,
        ...(includeComms
          ? {
              comms_username: commsUsername.trim(),
              comms_password: commsPassword
            }
          : {
              comms_username: null,
              comms_password: null
            })
      });
      toast.success(t("suppliers.createSuccess"));
      navigate(paths.suppliers.list);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("suppliers.createError");
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const onGeneratePassword = () => {
    setPassword(generatePassword());
    setShowPassword(true);
  };

  const onCopyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t("suppliers.passwordCopied"));
    } catch {
      toast.error(t("suppliers.passwordCopyFailed"));
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 py-2">
      <nav className="text-sm text-umerco-muted" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to={paths.suppliers.list} className="font-medium text-umerco-primary hover:underline">
              {t("nav.supplierManagement")}
            </Link>
          </li>
          <li>/</li>
          <li className="text-umerco-dark">{t("suppliers.createBreadcrumb")}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="umerco-section-label">{t("nav.supplierManagement")}</p>
          <h2 className="mt-1 text-2xl font-semibold text-umerco-dark">{t("suppliers.createTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-umerco-muted">{t("suppliers.createSubtitle")}</p>
        </div>
        <Link to={paths.suppliers.list} className={`${btnSecondary} h-10 px-4`}>
          {t("suppliers.cancel")}
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`${card} p-6`}>
          <form onSubmit={onSubmit} noValidate>
            <FormSection
              title={t("suppliers.detailsSectionTitle")}
              description={t("suppliers.detailsSectionDescription")}
            >
              <div className="sm:col-span-2">
                <FormField
                  label={t("suppliers.fullName")}
                  htmlFor="full_name"
                  hint={t("suppliers.fullNameHint")}
                >
                  <input
                    id="full_name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder={t("suppliers.fullNamePlaceholder")}
                    className="umerco-input"
                    autoComplete="name"
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2">
                <FormField
                  label={t("suppliers.email")}
                  htmlFor="email"
                  hint={t("suppliers.emailHint")}
                >
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder={t("suppliers.emailPlaceholder")}
                    className="umerco-input"
                    autoComplete="email"
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection
              title={t("suppliers.ediSectionTitle")}
              description={t("suppliers.ediSectionDescription")}
            >
              <FormField
                label={t("suppliers.mutuallyDefinedZz")}
                htmlFor="mutually_defined_zz"
                hint={t("suppliers.mutuallyDefinedZzHint")}
              >
                <input
                  id="mutually_defined_zz"
                  type="text"
                  value={mutuallyDefinedZz}
                  onChange={(e) => setMutuallyDefinedZz(e.target.value)}
                  required
                  placeholder={t("suppliers.mutuallyDefinedZzPlaceholder")}
                  className="umerco-input"
                />
              </FormField>

              <FormField label={t("suppliers.duns")} htmlFor="duns" hint={t("suppliers.dunsHint")}>
                <input
                  id="duns"
                  type="text"
                  value={duns}
                  onChange={(e) => setDuns(e.target.value)}
                  required
                  placeholder={t("suppliers.dunsPlaceholder")}
                  className="umerco-input"
                />
              </FormField>

              <FormField label={t("suppliers.as2")} htmlFor="as2" hint={t("suppliers.as2Hint")}>
                <input
                  id="as2"
                  type="text"
                  value={as2}
                  onChange={(e) => setAs2(e.target.value)}
                  required
                  placeholder={t("suppliers.as2Placeholder")}
                  className="umerco-input"
                />
              </FormField>

              <div className="sm:col-span-2">
                <FormField
                  label={t("suppliers.channelUrl")}
                  htmlFor="channel_url"
                  hint={t("suppliers.channelUrlHint")}
                >
                  <input
                    id="channel_url"
                    type="url"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    required
                    placeholder={t("suppliers.channelUrlPlaceholder")}
                    className="umerco-input"
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-umerco-muted">{t("suppliers.inboundUrlCreateHint")}</p>
              </div>

              <div className="sm:col-span-2">
                <FormField
                  label={t("suppliers.documentTypes")}
                  htmlFor="document_types"
                  hint={t("suppliers.documentTypesHint")}
                >
                  <DocumentTypeMultiSelect
                    id="document_types"
                    options={SUPPLIER_DOCUMENT_TYPE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey)
                    }))}
                    value={documentTypes}
                    onChange={(next) => setDocumentTypes(next as SupplierDocumentType[])}
                    placeholder={t("suppliers.documentTypesPlaceholder")}
                    selectedLabel={(count) =>
                      t("suppliers.documentTypesSelected", { count })
                    }
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection
              title={t("suppliers.commsSectionTitle")}
              description={t("suppliers.commsSectionDescription")}
            >
              <div className="sm:col-span-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-umerco-dark">
                  <input
                    type="checkbox"
                    checked={includeComms}
                    onChange={(e) => {
                      setIncludeComms(e.target.checked);
                      if (!e.target.checked) {
                        setCommsUsername("");
                        setCommsPassword("");
                      }
                    }}
                    className="rounded border-umerco-border"
                  />
                  {t("suppliers.commsToggle")}
                </label>
              </div>

              {includeComms ? (
                <>
                  <FormField label={t("suppliers.commsUsername")} htmlFor="comms_username">
                    <input
                      id="comms_username"
                      type="text"
                      value={commsUsername}
                      onChange={(e) => setCommsUsername(e.target.value)}
                      required={includeComms}
                      placeholder={t("suppliers.commsUsernamePlaceholder")}
                      className="umerco-input"
                      autoComplete="off"
                    />
                  </FormField>

                  <FormField label={t("suppliers.commsPassword")} htmlFor="comms_password">
                    <div className="relative">
                      <input
                        id="comms_password"
                        type={showCommsPassword ? "text" : "password"}
                        value={commsPassword}
                        onChange={(e) => setCommsPassword(e.target.value)}
                        required={includeComms}
                        placeholder={t("suppliers.commsPasswordPlaceholder")}
                        className="umerco-input pe-10"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 end-0 flex items-center px-3 text-umerco-muted hover:text-umerco-dark"
                        onClick={() => setShowCommsPassword((value) => !value)}
                        aria-label={showCommsPassword ? t("login.hidePassword") : t("login.showPassword")}
                      >
                        {showCommsPassword ? (
                          <EyeOff size={16} strokeWidth={1.75} />
                        ) : (
                          <Eye size={16} strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </FormField>
                </>
              ) : null}
            </FormSection>

            <FormSection
              title={t("suppliers.portalSectionTitle")}
              description={t("suppliers.portalSectionDescription")}
            >
              <div className="sm:col-span-2">
                <div className={`portal-access-panel ${portalReady ? "portal-access-panel-active" : ""}`}>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-umerco-primary-soft text-umerco-primary">
                      <ShieldCheck size={18} strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-umerco-dark">
                        {t("suppliers.portalAccountTitle")}
                      </p>
                      <p className="mt-0.5 text-xs text-umerco-muted">
                        {t("suppliers.portalAccountDescription")}
                      </p>
                    </div>
                  </div>

                  <FormField
                    label={t("suppliers.password")}
                    htmlFor="password"
                    hint={t("suppliers.passwordHint")}
                  >
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          placeholder={t("suppliers.passwordPlaceholder")}
                          className="umerco-input pe-10"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center px-3 text-umerco-muted hover:text-umerco-dark"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                        >
                          {showPassword ? (
                            <EyeOff size={16} strokeWidth={1.75} />
                          ) : (
                            <Eye size={16} strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`${btnOutline} inline-flex h-[42px] items-center gap-1.5 px-3`}
                        onClick={onGeneratePassword}
                      >
                        <RefreshCw size={14} strokeWidth={1.75} />
                        {t("suppliers.generate")}
                      </button>
                      <button
                        type="button"
                        className={`${btnOutline} inline-flex h-[42px] items-center gap-1.5 px-3`}
                        onClick={() => void onCopyPassword()}
                        disabled={!password}
                      >
                        <Copy size={14} strokeWidth={1.75} />
                        {t("suppliers.copy")}
                      </button>
                    </div>
                  </FormField>

                  {password ? (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-umerco-border">
                        <div
                          className={`h-full rounded-full transition-all ${
                            strength === "strong"
                              ? "w-full bg-emerald-500"
                              : strength === "fair"
                                ? "w-2/3 bg-amber-500"
                                : "w-1/3 bg-red-500"
                          }`}
                        />
                      </div>
                      <p className="mt-1 text-xs text-umerco-muted">
                        {strength === "strong"
                          ? t("suppliers.passwordStrong")
                          : strength === "fair"
                            ? t("suppliers.passwordFair")
                            : t("suppliers.passwordWeak")}
                      </p>
                    </div>
                  ) : null}

                  {!email.trim() ? (
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {t("suppliers.emailRequiredForPortal")}
                    </p>
                  ) : null}
                </div>
              </div>
            </FormSection>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="form-actions-bar">
              <Link to={paths.suppliers.list} className={btnSecondary}>
                {t("suppliers.discard")}
              </Link>
              <button
                type="submit"
                disabled={pending || !canSubmit}
                className={`${btnPrimary} inline-flex h-10 items-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {pending ? (
                  <>
                    <Loader size="xs" variant="light" />
                    {t("suppliers.creating")}
                  </>
                ) : (
                  t("suppliers.createAction")
                )}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className={`${card} sticky top-20 p-5`}>
            <p className="text-[11px] font-semibold uppercase tracking-section text-umerco-muted">
              {t("suppliers.previewTitle")}
            </p>

            <div className="form-preview-card mt-3">
              <div className="flex items-start gap-3">
                <div className="form-preview-avatar">{previewInitials}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-umerco-dark">
                    {fullName.trim() || t("suppliers.previewNameFallback")}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-umerco-muted">
                    {email.trim() || t("suppliers.previewEmailFallback")}
                  </p>
                  <div className="mt-2">
                    <SupplierStatusBadge status="invited" />
                  </div>
                </div>
              </div>

              <PreviewGroup title={t("suppliers.previewContact")}>
                <PreviewRow label={t("suppliers.email")} value={email.trim() || "—"} />
                <PreviewRow
                  label={t("suppliers.previewPortalAccess")}
                  value={
                    portalReady
                      ? t("suppliers.previewPortalReady")
                      : t("suppliers.previewPortalPending")
                  }
                />
              </PreviewGroup>

              <PreviewGroup title={t("suppliers.previewEdi")}>
                <PreviewRow label={t("suppliers.mutuallyDefinedZz")} value={mutuallyDefinedZz.trim() || "—"} />
                <PreviewRow label={t("suppliers.duns")} value={duns.trim() || "—"} />
                <PreviewRow label={t("suppliers.as2")} value={as2.trim() || "—"} />
                <PreviewRow label={t("suppliers.channelUrl")} value={channelUrl.trim() || "—"} />
                <PreviewRow
                  label={t("suppliers.inboundUrl")}
                  value={t("suppliers.inboundUrlAuto")}
                />
                <PreviewRow
                  label={t("suppliers.previewDocuments")}
                  value={
                    documentTypes.length > 0
                      ? documentTypes.join(", ")
                      : "—"
                  }
                />
                <PreviewRow
                  label={t("suppliers.previewComms")}
                  value={
                    includeComms && commsUsername.trim()
                      ? t("suppliers.previewCommsConfigured")
                      : t("suppliers.previewCommsNotSet")
                  }
                />
              </PreviewGroup>

              <PreviewGroup title={t("suppliers.previewOrganization")}>
                <PreviewRow
                  label={t("suppliers.previewPartner")}
                  value={user?.business_partner_name || "—"}
                />
                <PreviewRow
                  label={t("suppliers.previewPartnerCode")}
                  value={user?.business_partner_code || "—"}
                />
              </PreviewGroup>
            </div>

            <ul className="mt-4 space-y-2 text-xs text-umerco-muted">
              <li className="flex gap-2">
                <span className="text-umerco-primary">1.</span>
                {t("suppliers.previewStep1")}
              </li>
              <li className="flex gap-2">
                <span className="text-umerco-primary">2.</span>
                {t("suppliers.previewStep2")}
              </li>
              <li className="flex gap-2">
                <span className="text-umerco-primary">3.</span>
                {t("suppliers.previewStep3")}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
