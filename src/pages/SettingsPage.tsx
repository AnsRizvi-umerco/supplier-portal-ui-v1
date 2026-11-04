

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  FileStack,
  Fingerprint,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  Plug,
  Shield,
  User
} from "lucide-react";
import { Field } from "@/components/forms/Field";
import { SupplierStatusBadge, supplierInitials } from "@/components/suppliers/SupplierStatusBadge";
import { Loader } from "@/components/umerco/Loader";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { useToast } from "@/components/umerco/toast";
import { btnOutline, btnPrimary, btnSecondary, card, cardAccent, statusPill } from "@/components/umerco/styles";
import { extractApiError } from "@/lib/api-error";
import { useAuth } from "@/context/auth-context";
import { listSuppliers, getPortalMe, updatePortalProfile, type ManagedSupplier, type PortalMeUser } from "@/lib/master-portal-suppliers";
import { paths } from "@/paths";
import { apiRoutes, http } from "@/api";

type SettingsData = {
  id: string;
  code: string;
  name: string;
  email: string;
  language: string;
  status: string;
  phone: string | null;
  notification_email: string | null;
  deljit_email_alerts: boolean | null;
  default_currency: string | null;
  default_incoterm: string | null;
  default_payment_terms: string | null;
  default_facility: string | null;
  default_uom: string | null;
  default_transport_mode: string | null;
  default_carrier: string | null;
  default_response_code: string | null;
  authEmail: string;
};

type Buyer = {
  key: string;
  name: string;
  ediVersion: string;
  documentTypes: string[];
};

type IntegrationStatus = {
  iwhi_mode: "mock" | "live";
  sendgrid_configured: boolean;
  webhook_secret_configured: boolean;
  iwhi_url_preview: string;
};

type SaveState = {
  saving: boolean;
  saved: boolean;
  error: string | null;
};

type SectionId =
  | "profile"
  | "notifications"
  | "buyers"
  | "identity"
  | "defaults"
  | "integration";

const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED"] as const;
const INCOTERMS = ["EXW", "FOB", "CIF", "DAP", "DDP", "FCA"] as const;
const RESPONSE_CODES = [
  { value: "AC", label: "AC — Accepted" },
  { value: "IB", label: "IB — In Progress" },
  { value: "RJ", label: "RJ — Rejected" }
] as const;
const TRANSPORT_MODES = ["Road", "Sea", "Air", "Rail", "Courier"] as const;

const SECTIONS: {
  id: SectionId;
  label: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    id: "profile",
    label: "Profile & Account",
    description: "Company details, sign-in email, and password.",
    icon: User
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Email alerts for inbound schedules and documents.",
    icon: Bell
  },
  {
    id: "buyers",
    label: "Trading Partners",
    description: "Suppliers and buyers connected to your account.",
    icon: Building2
  },
  {
    id: "identity",
    label: "Supplier Identity",
    description: "EDI identity and commercial defaults.",
    icon: Fingerprint
  },
  {
    id: "defaults",
    label: "Submission Defaults",
    description: "Pre-filled values for outbound forms.",
    icon: FileStack
  },
  {
    id: "integration",
    label: "Integration",
    description: "Connectivity and platform configuration.",
    icon: Plug
  }
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusLabel(status: string): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function SettingsPanel({
  title,
  description,
  children,
  footer
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className={`${card} overflow-hidden`}>
      <header className="border-b border-umerco-border px-5 py-4 sm:px-6 sm:py-5">
        <h3 className="text-base font-semibold text-umerco-dark sm:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-umerco-muted">{description}</p> : null}
      </header>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      {footer ? (
        <footer className="border-t border-umerco-border bg-umerco-canvas/50 px-5 py-4 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

function SettingsNav({
  active,
  onChange
}: {
  active: SectionId;
  onChange: (id: SectionId) => void;
}) {
  return (
    <nav className={`${card} p-2 lg:sticky lg:top-24 lg:self-start`} aria-label="Settings sections">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.id;
          return (
            <li key={section.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onChange(section.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors lg:gap-3 lg:px-3.5 lg:py-3 ${
                  isActive
                    ? "bg-umerco-primary-soft text-umerco-primary"
                    : "text-umerco-muted hover:bg-umerco-beige hover:text-umerco-dark"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="whitespace-nowrap lg:whitespace-normal">{section.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="schedule-panel flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-umerco-dark">{label}</p>
        {hint ? <p className="mt-1 text-xs text-umerco-muted">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "toggle-track-on" : "toggle-track-off"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SaveFooter({
  saveState,
  onSave,
  label = "Save Changes"
}: {
  saveState: SaveState;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={`inline-flex items-center gap-2 ${btnPrimary}`}
        disabled={saveState.saving}
        onClick={onSave}
      >
        {saveState.saving ? (
          <>
            <Loader size="sm" className="!w-4" />
            Saving…
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

function IntegrationCard({
  label,
  value,
  detail,
  variant,
  icon
}: {
  label: string;
  value: string;
  detail?: string;
  variant: "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
}) {
  const dotClass = {
    success: "bg-umerco-success",
    warning: "bg-amber-500",
    danger: "bg-umerco-danger",
    neutral: "bg-umerco-muted"
  }[variant];

  return (
    <div className="schedule-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-umerco-primary-soft text-umerco-primary">
          {icon}
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      </div>
      <p className="umerco-section-label mt-4">{label}</p>
      <p className="mt-1 text-sm font-semibold text-umerco-dark">{value}</p>
      {detail ? <p className="mt-1 truncate font-mono text-xs text-umerco-muted">{detail}</p> : null}
    </div>
  );
}

export default function SettingsPage() {
  const { logout, user, loading: authLoading, updateUser, signingOut } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [portalProfile, setPortalProfile] = useState<PortalMeUser | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [managedSuppliers, setManagedSuppliers] = useState<ManagedSupplier[]>([]);
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");

  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [deljitNotifications, setDeljitNotifications] = useState(true);
  const [defaultFacility, setDefaultFacility] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [defaultIncoterm, setDefaultIncoterm] = useState("");
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState("");
  const [defaultResponseCode, setDefaultResponseCode] = useState("AC");
  const [defaultUom, setDefaultUom] = useState("");
  const [defaultTransportMode, setDefaultTransportMode] = useState("");
  const [defaultCarrier, setDefaultCarrier] = useState("");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [profileSave, setProfileSave] = useState<SaveState>({ saving: false, saved: false, error: null });
  const [notificationsSave, setNotificationsSave] = useState<SaveState>({
    saving: false,
    saved: false,
    error: null
  });
  const [identitySave, setIdentitySave] = useState<SaveState>({ saving: false, saved: false, error: null });
  const [defaultsSave, setDefaultsSave] = useState<SaveState>({ saving: false, saved: false, error: null });

  const activeMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];
  const isPartnerAdmin =
    portalProfile?.actor === "partner_admin" || user?.actor === "partner_admin";
  const displayName =
    portalProfile?.business_partner_name ||
    portalProfile?.full_name ||
    settings?.name ||
    "—";
  const displayCode = portalProfile?.business_partner_code || settings?.code || "—";
  const displayEmail = portalProfile?.email || settings?.authEmail || "—";
  const roleLabel = isPartnerAdmin ? "Admin" : "Supplier";

  const applySettings = useCallback((data: SettingsData) => {
    setSettings(data);
    setName(data.name ?? "");
    setPhone(data.phone ?? "");
    setDeljitNotifications(data.deljit_email_alerts ?? true);
    setDefaultFacility(data.default_facility ?? "");
    setDefaultCurrency(data.default_currency ?? "USD");
    setDefaultIncoterm(data.default_incoterm ?? "");
    setDefaultPaymentTerms(data.default_payment_terms ?? "");
    setDefaultResponseCode(data.default_response_code ?? "AC");
    setDefaultUom(data.default_uom ?? "");
    setDefaultTransportMode(data.default_transport_mode ?? "");
    setDefaultCarrier(data.default_carrier ?? "");
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const me = await getPortalMe();
        if (cancelled) return;
        setPortalProfile(me);
        setFullName(me.full_name ?? "");

        const suppliersPromise =
          me.actor === "partner_admin"
            ? listSuppliers().catch(() => [] as ManagedSupplier[])
            : Promise.resolve([] as ManagedSupplier[]);

        const [suppliers, settingsRes, partnersRes, integrationRes] = await Promise.all([
          suppliersPromise,
          http.get(apiRoutes.settings.root).catch(() => null),
          http.get(apiRoutes.settings.tradingPartners).catch(() => null),
          http.get(apiRoutes.settings.integrationStatus).catch(() => null)
        ]);

        if (cancelled) return;

        setManagedSuppliers(suppliers);

        if (settingsRes?.ok) {
          applySettings((await settingsRes.json()) as SettingsData);
        }

        if (partnersRes?.ok) {
          const data = (await partnersRes.json()) as { buyers: Buyer[] };
          setBuyers(data.buyers ?? []);
        }

        if (integrationRes?.ok) {
          setIntegration((await integrationRes.json()) as IntegrationStatus);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Could not load account settings from Master Portal.";
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [applySettings, authLoading, toast]);

  const patchSettings = async (
    body: Record<string, unknown>,
    setSaveState: React.Dispatch<React.SetStateAction<SaveState>>
  ) => {
    setSaveState({ saving: true, saved: false, error: null });
    try {
      const res = await http.patch(apiRoutes.settings.root, body);
      const data = await res.json();
      if (!res.ok) {
        const errMsg = extractApiError(data, "Failed to save");
        setSaveState({ saving: false, saved: false, error: errMsg });
        toast.error(errMsg);
        return;
      }
      applySettings(data as SettingsData);
      setSaveState({ saving: false, saved: true, error: null });
      toast.success("Settings saved successfully.");
      setTimeout(() => setSaveState((s) => ({ ...s, saved: false })), 2000);
    } catch {
      const errMsg = "Failed to save";
      setSaveState({ saving: false, saved: false, error: errMsg });
      toast.error(errMsg);
    }
  };

  const onChangePassword = async () => {
    toast.error("Password changes are managed through your organization administrator.");
  };

  const onLogout = () => {
    void logout();
  };

  if (loading) {
    return (
      <div className="relative flex min-h-[calc(100dvh-9.5rem)] w-full items-center justify-center">
        <LoadingBlock message="Loading settings…" size="md" />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 py-6">
      <header>
        <UmercoSectionLabel>Settings</UmercoSectionLabel>
        <h2 className="mt-1 text-xl font-semibold text-umerco-dark">Account Settings</h2>
        <p className="mt-1 text-sm text-umerco-muted">
          Manage your company profile, defaults, trading partners, and integrations.
        </p>
      </header>

      <div className={`${cardAccent} p-5`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="surface-dark flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold">
            {initials(displayName !== "—" ? displayName : "Supplier")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold text-umerco-dark">{displayName}</h3>
              <span className={statusPill("active")}>{roleLabel}</span>
            </div>
            <p className="mt-1 font-mono text-sm text-umerco-muted">{displayCode}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-umerco-muted">
              <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              {displayEmail}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-umerco-beige px-3 py-1 text-xs font-medium text-umerco-dark">
              {`${portalProfile?.supplier_count ?? 0} supplier${(portalProfile?.supplier_count ?? 0) === 1 ? "" : "s"}`}
            </span>
            {integration ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  integration.iwhi_mode === "live"
                    ? "bg-umerco-success-soft text-umerco-success"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                IWHI {integration.iwhi_mode === "live" ? "Live" : "Mock"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_1fr] xl:grid-cols-[16rem_1fr]">
        <SettingsNav active={activeSection} onChange={setActiveSection} />

        <div className="min-w-0">
          {activeSection === "profile" && (
            <SettingsPanel
              title={activeMeta.label}
              description={activeMeta.description}
              footer={
                <SaveFooter
                  saveState={profileSave}
                  onSave={async () => {
                    const nextName = fullName.trim();
                    if (!nextName) {
                      toast.error("Full name is required.");
                      return;
                    }
                    setProfileSave({ saving: true, saved: false, error: null });
                    try {
                      const updated = await updatePortalProfile({ full_name: nextName });
                      setPortalProfile(updated);
                      setFullName(updated.full_name);
                      updateUser({
                        full_name: updated.full_name,
                        mutually_defined_zz: updated.mutually_defined_zz,
                        duns: updated.duns,
                        as2: updated.as2,
                        company_mutually_defined_zz: updated.company_mutually_defined_zz,
                        company_duns: updated.company_duns,
                        company_as2: updated.company_as2,
                        channel_url: updated.channel_url,
                        inbound_url: updated.inbound_url,
                        comms_username: updated.comms_username,
                        comms_password: updated.comms_password,
                        document_types: updated.document_types,
                        supplier_count: updated.supplier_count
                      });
                      setProfileSave({ saving: false, saved: true, error: null });
                      toast.success("Full name saved.");
                      setTimeout(() => setProfileSave((s) => ({ ...s, saved: false })), 2000);
                    } catch (err) {
                      const message =
                        err instanceof Error ? err.message : "Could not save full name.";
                      setProfileSave({ saving: false, saved: false, error: message });
                      toast.error(message);
                    }
                  }}
                />
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Company Name">
                  <input
                    className="umerco-input-readonly text-sm"
                    value={portalProfile?.business_partner_name ?? ""}
                    readOnly
                  />
                </Field>
                <Field label="Partner Code">
                  <input
                    className="umerco-input-readonly font-mono text-sm"
                    value={portalProfile?.business_partner_code ?? ""}
                    readOnly
                  />
                </Field>
                <Field label="Full Name">
                  <input
                    className="umerco-input text-sm"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Sign-in Email">
                  <input
                    className="umerco-input-readonly text-sm"
                    value={portalProfile?.email ?? ""}
                    readOnly
                  />
                </Field>
                <Field label="Role">
                  <input className="umerco-input-readonly text-sm" value={roleLabel} readOnly />
                </Field>
              </div>

              <div className="mt-6 border-t border-umerco-border pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-umerco-dark">Password</p>
                    <p className="mt-0.5 text-xs text-umerco-muted">Update your portal sign-in password.</p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 ${btnSecondary}`}
                    onClick={() => setShowPasswordForm((value) => !value)}
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                    {showPasswordForm ? "Hide" : "Change Password"}
                  </button>
                </div>

                {showPasswordForm ? (
                  <div className="schedule-panel mt-4 grid gap-4 p-4 md:grid-cols-2">
                    <Field label="New Password">
                      <input
                        type="password"
                        className="umerco-input text-sm"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </Field>
                    <Field label="Confirm New Password">
                      <input
                        type="password"
                        className="umerco-input text-sm"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </Field>
                    <div className="flex items-end gap-3 md:col-span-2">
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={passwordSaving}
                        onClick={onChangePassword}
                      >
                        {passwordSaving ? "Updating…" : "Update Password"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 border-t border-umerco-border pt-6">
                <div className="schedule-panel flex flex-wrap items-center justify-between gap-4 border-red-100 bg-red-50/60 p-4">
                  <div>
                    <p className="text-sm font-medium text-umerco-dark">Sign out</p>
                    <p className="mt-0.5 text-xs text-umerco-muted">End your session on this device.</p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 ${btnOutline} border-red-200 text-red-700 hover:bg-red-50`}
                    disabled={signingOut}
                    onClick={onLogout}
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.75} />
                    {signingOut ? "Signing out…" : "Logout"}
                  </button>
                </div>
              </div>
            </SettingsPanel>
          )}

          {activeSection === "notifications" && (
            <SettingsPanel
              title={activeMeta.label}
              description={activeMeta.description}
              footer={
                <SaveFooter
                  saveState={notificationsSave}
                  onSave={() =>
                    patchSettings({ deljit_email_alerts: deljitNotifications }, setNotificationsSave)
                  }
                />
              }
            >
              <ToggleSwitch
                checked={deljitNotifications}
                onChange={setDeljitNotifications}
                label="DELJIT schedule alerts"
                hint="Send an email when a new DELJIT delivery schedule is received."
              />
              <UmercoAlert variant="info" className="mt-4 text-xs">
                Email delivery depends on platform configuration. Contact your administrator if alerts are not
                arriving.
              </UmercoAlert>
            </SettingsPanel>
          )}

          {activeSection === "buyers" && (
            <SettingsPanel
              title={isPartnerAdmin ? "Suppliers" : activeMeta.label}
              description={
                isPartnerAdmin
                  ? "Supplier accounts under your business partner."
                  : activeMeta.description
              }
            >
              {isPartnerAdmin ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-umerco-muted">
                      These are the supplier accounts you manage in the portal.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link to={paths.suppliers.list} className={btnSecondary}>
                        View all
                      </Link>
                      <Link to={paths.suppliers.create} className={btnPrimary}>
                        Create supplier
                      </Link>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {managedSuppliers.map((supplier) => (
                      <article key={supplier.id} className="schedule-panel p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-umerco-primary-soft text-sm font-semibold text-umerco-primary">
                            {supplierInitials(supplier.full_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-umerco-dark">{supplier.full_name}</p>
                              <SupplierStatusBadge status={supplier.status} />
                            </div>
                            <p className="mt-0.5 truncate text-xs text-umerco-muted">{supplier.email}</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <Link
                            to={paths.suppliers.edit(supplier.id)}
                            className={`${btnOutline} inline-flex text-xs`}
                          >
                            Edit supplier
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                  {managedSuppliers.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-dashed border-umerco-border bg-umerco-canvas/50 px-4 py-8 text-center text-sm text-umerco-muted">
                      {(portalProfile?.supplier_count ?? 0) > 0 ? (
                        <>
                          {portalProfile?.supplier_count} supplier
                          {(portalProfile?.supplier_count ?? 0) === 1 ? "" : "s"} in this company.{" "}
                          <Link to={paths.suppliers.list} className="font-medium text-umerco-primary underline">
                            View suppliers
                          </Link>
                          .
                        </>
                      ) : (
                        <>
                          No suppliers yet.{" "}
                          <Link to={paths.suppliers.create} className="font-medium text-umerco-primary underline">
                            Create your first supplier
                          </Link>
                          .
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-umerco-muted">
                    Trading partners are managed by your administrator. The list below shows buyers currently
                    connected to your account.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {buyers.map((buyer) => (
                      <article key={buyer.key} className="schedule-panel p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-umerco-primary-soft text-umerco-primary">
                            <Building2 className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-umerco-dark">{buyer.name}</p>
                            <p className="mt-0.5 text-xs text-umerco-muted">EDI {buyer.ediVersion}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {buyer.documentTypes.map((doc) => (
                            <span
                              key={doc}
                              className="rounded-md bg-umerco-beige px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-umerco-dark"
                            >
                              {doc}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  {buyers.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-dashed border-umerco-border bg-umerco-canvas/50 px-4 py-8 text-center text-sm text-umerco-muted">
                      No connected buyers configured yet.
                    </div>
                  ) : null}
                </>
              )}
            </SettingsPanel>
          )}

          {activeSection === "identity" && (
            <SettingsPanel
              title={activeMeta.label}
              description={activeMeta.description}
              footer={
                <SaveFooter
                  saveState={identitySave}
                  onSave={() =>
                    patchSettings(
                      {
                        default_facility: defaultFacility,
                        default_currency: defaultCurrency,
                        default_incoterm: defaultIncoterm,
                        default_payment_terms: defaultPaymentTerms
                      },
                      setIdentitySave
                    )
                  }
                />
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Supplier Code">
                    <div className="relative">
                      <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-umerco-muted" />
                      <input
                        className="umerco-input-readonly pl-10 font-mono"
                        value={portalProfile?.business_partner_code ?? settings?.code ?? ""}
                        readOnly
                      />
                    </div>
                    <p className="mt-1 text-xs text-umerco-muted">
                      Used in all outbound EDI messages. Contact your administrator to change.
                    </p>
                  </Field>
                </div>
                <Field label="Default Facility">
                  <input
                    className="umerco-input text-sm"
                    value={defaultFacility}
                    onChange={(e) => setDefaultFacility(e.target.value)}
                  />
                </Field>
                <Field label="Default Currency">
                  <select
                    className="umerco-input text-sm"
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default Incoterm">
                  <select
                    className="umerco-input text-sm"
                    value={defaultIncoterm}
                    onChange={(e) => setDefaultIncoterm(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {INCOTERMS.map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default Payment Terms">
                  <input
                    className="umerco-input text-sm"
                    value={defaultPaymentTerms}
                    onChange={(e) => setDefaultPaymentTerms(e.target.value)}
                    placeholder="Net 30"
                  />
                </Field>
              </div>
            </SettingsPanel>
          )}

          {activeSection === "defaults" && (
            <SettingsPanel
              title={activeMeta.label}
              description={activeMeta.description}
              footer={
                <SaveFooter
                  saveState={defaultsSave}
                  onSave={() =>
                    patchSettings(
                      {
                        default_response_code: defaultResponseCode,
                        default_uom: defaultUom,
                        default_transport_mode: defaultTransportMode,
                        default_carrier: defaultCarrier
                      },
                      setDefaultsSave
                    )
                  }
                />
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Default Response Code">
                  <select
                    className="umerco-input text-sm"
                    value={defaultResponseCode}
                    onChange={(e) => setDefaultResponseCode(e.target.value)}
                  >
                    {RESPONSE_CODES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default Unit of Measure (UOM)">
                  <input
                    className="umerco-input text-sm"
                    value={defaultUom}
                    onChange={(e) => setDefaultUom(e.target.value)}
                    placeholder="EA, KG, PCS"
                  />
                </Field>
                <Field label="Default Transport Mode">
                  <select
                    className="umerco-input text-sm"
                    value={defaultTransportMode}
                    onChange={(e) => setDefaultTransportMode(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {TRANSPORT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default Carrier Name">
                  <input
                    className="umerco-input text-sm"
                    value={defaultCarrier}
                    onChange={(e) => setDefaultCarrier(e.target.value)}
                  />
                </Field>
              </div>
              <p className="mt-4 text-sm text-umerco-muted">
                These values pre-fill outbound submission forms so you can submit documents faster.
              </p>
            </SettingsPanel>
          )}

          {activeSection === "integration" && (
            <SettingsPanel title={activeMeta.label} description={activeMeta.description}>
              {integration ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <IntegrationCard
                    label="IWHI Connection"
                    value={integration.iwhi_mode === "live" ? "Live" : "Mock"}
                    variant={integration.iwhi_mode === "live" ? "success" : "warning"}
                    icon={<Plug className="h-4 w-4" strokeWidth={1.75} />}
                  />
                  <IntegrationCard
                    label="Email Delivery"
                    value={integration.sendgrid_configured ? "Configured" : "Not configured"}
                    variant={integration.sendgrid_configured ? "success" : "danger"}
                    icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
                  />
                  <IntegrationCard
                    label="Webhook Secret"
                    value={integration.webhook_secret_configured ? "Configured" : "Not configured"}
                    variant={integration.webhook_secret_configured ? "success" : "danger"}
                    icon={<Shield className="h-4 w-4" strokeWidth={1.75} />}
                  />
                  <IntegrationCard
                    label="IWHI Endpoint"
                    value="Endpoint"
                    detail={integration.iwhi_url_preview}
                    variant="neutral"
                    icon={<Link2 className="h-4 w-4" strokeWidth={1.75} />}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-umerco-border bg-umerco-canvas/50 px-4 py-8 text-center text-sm text-umerco-muted">
                  Unable to load integration status.
                </div>
              )}
            </SettingsPanel>
          )}
        </div>
      </div>
    </div>
  );
}
