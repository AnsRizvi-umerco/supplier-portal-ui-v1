import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { FormField, FormSection } from "@/components/suppliers/FormField";
import { DocumentTypeMultiSelect } from "@/components/suppliers/DocumentTypeMultiSelect";
import {
  supplierInitials,
  SupplierStatusBadge
} from "@/components/suppliers/SupplierStatusBadge";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";
import { Loader } from "@/components/umerco/Loader";
import { useToast } from "@/components/umerco/toast";
import { btnOutline, btnPrimary, btnSecondary, card } from "@/components/umerco/styles";
import { useAuth } from "@/context/auth-context";
import {
  getSupplier,
  updateSupplier,
  SUPPLIER_DOCUMENT_TYPE_OPTIONS,
  type ManagedSupplier,
  type SupplierDocumentType,
  type SupplierStatus
} from "@/lib/master-portal-suppliers";
import { resolveOutboundApiUrl } from "@/lib/master-portal";
import { paths } from "@/paths";

function generatePassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function EditSupplierPage() {
  const { supplierId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState<ManagedSupplier | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SupplierStatus>("invited");
  const [mutuallyDefinedZz, setMutuallyDefinedZz] = useState("");
  const [duns, setDuns] = useState("");
  const [as2, setAs2] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [inboundUrl, setInboundUrl] = useState("");
  const [documentTypes, setDocumentTypes] = useState<SupplierDocumentType[]>([]);
  const [includeComms, setIncludeComms] = useState(false);
  const [commsUsername, setCommsUsername] = useState("");
  const [commsPassword, setCommsPassword] = useState("");
  const [showCommsPassword, setShowCommsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supplierId) {
        setLoading(false);
        setError(t("suppliers.notFound"));
        return;
      }

      try {
        const data = await getSupplier(supplierId);
        if (cancelled) return;
        setSupplier(data);
        setFullName(data.full_name);
        setEmail(data.email);
        setStatus(data.status);
        setMutuallyDefinedZz(data.mutually_defined_zz ?? "");
        setDuns(data.duns ?? "");
        setAs2(data.as2 ?? "");
        setChannelUrl(data.channel_url ?? "");
        setInboundUrl(
          resolveOutboundApiUrl(data.inbound_url, data.business_partner_id, data.id)
        );
        setDocumentTypes(data.document_types ?? []);
        const hasComms = Boolean(data.comms_username || data.comms_password);
        setIncludeComms(hasComms);
        setCommsUsername(data.comms_username ?? "");
        setCommsPassword(data.comms_password ?? "");
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t("suppliers.loadError");
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supplierId, t]);

  const previewInitials = useMemo(() => supplierInitials(fullName), [fullName]);
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
    ediReady &&
    documentsReady &&
    commsReady &&
    (!resetPassword || password.trim().length >= 8);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !supplierId) return;

    setError(null);
    setPending(true);

    try {
      const payload: Parameters<typeof updateSupplier>[1] = {
        full_name: fullName.trim(),
        email: email.trim(),
        status,
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
      };
      if (resetPassword && password.trim()) {
        payload.password = password;
      }

      await updateSupplier(supplierId, payload);
      toast.success(t("suppliers.updateSuccess"));
      navigate(paths.suppliers.list);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("suppliers.updateError");
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const onGeneratePassword = () => {
    setPassword(generatePassword());
    setResetPassword(true);
    setShowPassword(true);
  };

  const onCopyInboundUrl = async () => {
    if (!inboundUrl) return;
    try {
      await navigator.clipboard.writeText(inboundUrl);
      toast.success(t("suppliers.inboundUrlCopied"));
    } catch {
      toast.error(t("suppliers.inboundUrlCopyFailed"));
    }
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

  if (loading) {
    return (
      <div className="relative flex min-h-[calc(100dvh-9.5rem)] w-full items-center justify-center">
        <LoadingBlock message={t("suppliers.loadingOne")} size="md" />
      </div>
    );
  }

  if (error && !supplier) {
    return (
      <div className="w-full min-w-0 py-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
        <Link
          to={paths.suppliers.list}
          className="mt-4 inline-flex text-sm font-medium text-umerco-primary hover:underline"
        >
          {t("suppliers.backToList")}
        </Link>
      </div>
    );
  }

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
          <li className="text-umerco-dark">{t("suppliers.editTitle")}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="umerco-section-label">{t("nav.supplierManagement")}</p>
          <h2 className="mt-1 text-2xl font-semibold text-umerco-dark">{t("suppliers.editTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-umerco-muted">{t("suppliers.editSubtitle")}</p>
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
              description={t("suppliers.editDetailsDescription")}
            >
              <div className="sm:col-span-2">
                <FormField label={t("suppliers.fullName")} htmlFor="full_name">
                  <input
                    id="full_name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="umerco-input"
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2">
                <FormField label={t("suppliers.email")} htmlFor="email" hint={t("suppliers.emailHint")}>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="umerco-input"
                  />
                </FormField>
              </div>

              <FormField label={t("suppliers.status")} htmlFor="status">
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SupplierStatus)}
                  className="umerco-input"
                >
                  <option value="invited">{t("suppliers.statusInvited")}</option>
                  <option value="active">{t("suppliers.statusActive")}</option>
                  <option value="suspended">{t("suppliers.statusSuspended")}</option>
                </select>
              </FormField>
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
                    className="umerco-input"
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2">
                <FormField
                  label={t("suppliers.inboundUrl")}
                  htmlFor="inbound_url"
                  hint={t("suppliers.inboundUrlHint")}
                >
                  <div className="flex gap-2">
                    <input
                      id="inbound_url"
                      type="url"
                      value={inboundUrl}
                      readOnly
                      className="umerco-input-readonly font-mono text-sm"
                    />
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={() => void onCopyInboundUrl()}
                      disabled={!inboundUrl}
                    >
                      <Copy size={16} strokeWidth={1.75} />
                      {t("suppliers.copy")}
                    </button>
                  </div>
                </FormField>
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
              description={t("suppliers.editPasswordDescription")}
            >
              <div className="sm:col-span-2">
                <div className={`portal-access-panel ${resetPassword ? "portal-access-panel-active" : ""}`}>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-umerco-primary-soft text-umerco-primary">
                      <ShieldCheck size={18} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-umerco-dark">
                        {t("suppliers.resetPasswordTitle")}
                      </p>
                      <p className="mt-0.5 text-xs text-umerco-muted">
                        {t("suppliers.resetPasswordDescription")}
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-umerco-dark">
                      <input
                        type="checkbox"
                        checked={resetPassword}
                        onChange={(e) => {
                          setResetPassword(e.target.checked);
                          if (!e.target.checked) setPassword("");
                        }}
                        className="rounded border-umerco-border"
                      />
                      {t("suppliers.resetPasswordToggle")}
                    </label>
                  </div>

                  {resetPassword ? (
                    <FormField label={t("suppliers.newPassword")} htmlFor="password">
                      <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
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
                    {t("suppliers.saving")}
                  </>
                ) : (
                  t("suppliers.saveChanges")
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
                  <p className="truncate font-semibold text-umerco-dark">{fullName || "—"}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-umerco-muted">{email || "—"}</p>
                  <div className="mt-2">
                    <SupplierStatusBadge status={status} />
                  </div>
                </div>
              </div>

              <PreviewGroup title={t("suppliers.previewContact")}>
                <PreviewRow label={t("suppliers.email")} value={email.trim() || "—"} />
                <PreviewRow
                  label={t("suppliers.firstLogin")}
                  value={formatDate(supplier?.first_login_at ?? null)}
                />
              </PreviewGroup>

              <PreviewGroup title={t("suppliers.previewEdi")}>
                <PreviewRow label={t("suppliers.mutuallyDefinedZz")} value={mutuallyDefinedZz.trim() || "—"} />
                <PreviewRow label={t("suppliers.duns")} value={duns.trim() || "—"} />
                <PreviewRow label={t("suppliers.as2")} value={as2.trim() || "—"} />
                <PreviewRow label={t("suppliers.channelUrl")} value={channelUrl.trim() || "—"} />
                <PreviewRow label={t("suppliers.inboundUrl")} value={inboundUrl.trim() || "—"} />
                <PreviewRow
                  label={t("suppliers.previewDocuments")}
                  value={documentTypes.length > 0 ? documentTypes.join(", ") : "—"}
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
          </section>
        </aside>
      </div>
    </div>
  );
}
