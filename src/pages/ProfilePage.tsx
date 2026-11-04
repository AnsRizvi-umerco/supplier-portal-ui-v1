import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Hash, Mail, Settings as SettingsIcon, Shield } from "lucide-react";
import { Loader } from "@/components/umerco/Loader";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { useToast } from "@/components/umerco/toast";
import { btnPrimary, btnSecondary, card, cardAccent, statusPill } from "@/components/umerco/styles";
import { useAuth } from "@/context/auth-context";
import {
  getPortalMe,
  updatePortalProfile,
  type PortalMeUser
} from "@/lib/master-portal-suppliers";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(actor: PortalMeUser["actor"], t: (key: string) => string): string {
  return actor === "partner_admin" ? t("shell.roleAdmin") : t("shell.roleSupplier");
}

function DetailRow({
  label,
  children,
  mono
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-umerco-border py-2.5 last:border-b-0">
      <dt className="text-sm text-umerco-muted">{label}</dt>
      <dd className={`text-sm text-umerco-dark ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-umerco-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { logout, updateUser, signingOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PortalMeUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mutuallyDefinedZz, setMutuallyDefinedZz] = useState("");
  const [duns, setDuns] = useState("");
  const [as2, setAs2] = useState("");
  const [savingEdi, setSavingEdi] = useState(false);
  const [ediError, setEdiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const me = await getPortalMe();
        if (cancelled) return;
        setProfile(me);
        setMutuallyDefinedZz(me.mutually_defined_zz ?? "");
        setDuns(me.duns ?? "");
        setAs2(me.as2 ?? "");
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Could not load your profile.";
          setError(message);
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
  }, [toast]);

  const onLogout = () => {
    void logout();
  };

  const onSaveEdi = async (event: FormEvent) => {
    event.preventDefault();
    setEdiError(null);
    setSavingEdi(true);
    try {
      const updated = await updatePortalProfile({
        mutually_defined_zz: mutuallyDefinedZz.trim() || null,
        duns: duns.trim() || null,
        as2: as2.trim() || null
      });
      setProfile(updated);
      setMutuallyDefinedZz(updated.mutually_defined_zz ?? "");
      setDuns(updated.duns ?? "");
      setAs2(updated.as2 ?? "");
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
        document_types: updated.document_types
      });
      toast.success(t("profile.ediSaved"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("profile.ediSaveError");
      setEdiError(message);
      toast.error(message);
    } finally {
      setSavingEdi(false);
    }
  };

  if (loading) {
    return (
      <div className="relative flex min-h-[calc(100dvh-9.5rem)] w-full items-center justify-center">
        <LoadingBlock message={t("shell.loadingProfile")} size="md" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="w-full min-w-0 py-6">
        <UmercoSectionLabel>Profile</UmercoSectionLabel>
        <h2 className="mt-1 mb-4 text-xl font-semibold text-umerco-dark">Profile</h2>
        <div className="rounded-md border border-umerco-border bg-umerco-beige px-4 py-3 text-sm text-umerco-dark">
          {error ?? "Could not load your profile."}
        </div>
      </div>
    );
  }

  const role = roleLabel(profile.actor, t);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 py-6">
      <div>
        <UmercoSectionLabel>Profile</UmercoSectionLabel>
        <h2 className="mt-1 text-xl font-semibold text-umerco-dark">Profile</h2>
      </div>

      <div className={`${cardAccent} p-5`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="surface-dark flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold">
            {initials(profile.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold text-umerco-dark">{profile.full_name || "—"}</h3>
              <span className={statusPill("active")}>{role}</span>
            </div>
            <p className="mt-1 text-sm text-umerco-muted">{profile.business_partner_name}</p>
            <p className="mt-1 font-mono text-xs text-umerco-muted">{profile.business_partner_code}</p>
          </div>
          <Link to="/settings" className={`${btnSecondary} inline-flex items-center gap-2`}>
            <SettingsIcon size={16} strokeWidth={1.75} />
            Edit in Settings
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${card} p-5`}>
          <UmercoSectionLabel>Contact Information</UmercoSectionLabel>
          <dl className="mt-3">
            <DetailRow label="Full Name">{profile.full_name || "—"}</DetailRow>
            <DetailRow label="Email">
              <span className="inline-flex items-center gap-2">
                <Mail size={14} strokeWidth={1.75} className="text-umerco-muted" />
                {profile.email || "—"}
              </span>
            </DetailRow>
            <DetailRow label="Role">
              <span className="inline-flex items-center gap-2">
                <Shield size={14} strokeWidth={1.75} className="text-umerco-muted" />
                {role}
              </span>
            </DetailRow>
          </dl>
        </div>

        <div className={`${card} p-5`}>
          <UmercoSectionLabel>Organization</UmercoSectionLabel>
          <dl className="mt-3">
            <DetailRow label="Company">
              <span className="inline-flex items-center gap-2">
                <Building2 size={14} strokeWidth={1.75} className="text-umerco-muted" />
                {profile.business_partner_name || "—"}
              </span>
            </DetailRow>
            <DetailRow label="Partner Code" mono>
              {profile.business_partner_code || "—"}
            </DetailRow>
            {profile.actor === "partner_admin" ? (
              <DetailRow label="Suppliers">
                {profile.supplier_count ?? 0}
              </DetailRow>
            ) : null}
            <DetailRow label="Partner ID" mono>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Hash size={12} strokeWidth={1.75} className="text-umerco-muted" />
                {profile.business_partner_id}
              </span>
            </DetailRow>
            <DetailRow label="Account ID" mono>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Hash size={12} strokeWidth={1.75} className="text-umerco-muted" />
                {profile.id}
              </span>
            </DetailRow>
          </dl>
        </div>
      </div>

      <form onSubmit={onSaveEdi} className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <UmercoSectionLabel>{t("profile.ediTitle")}</UmercoSectionLabel>
            <p className="mt-1 text-sm text-umerco-muted">{t("profile.ediDescription")}</p>
          </div>
          <button type="submit" disabled={savingEdi} className={`${btnPrimary} shrink-0`}>
            {savingEdi ? (
              <span className="inline-flex items-center gap-2">
                <Loader size="sm" className="!w-4" />
                {t("profile.savingEdi")}
              </span>
            ) : (
              t("profile.saveEdi")
            )}
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label={t("suppliers.mutuallyDefinedZz")} htmlFor="profile-mutually-defined">
            <input
              id="profile-mutually-defined"
              className="umerco-input font-mono text-sm"
              value={mutuallyDefinedZz}
              onChange={(e) => setMutuallyDefinedZz(e.target.value)}
              placeholder={t("suppliers.mutuallyDefinedZzPlaceholder")}
              autoComplete="off"
            />
          </Field>
          <Field label={t("suppliers.as2")} htmlFor="profile-as2">
            <input
              id="profile-as2"
              className="umerco-input font-mono text-sm"
              value={as2}
              onChange={(e) => setAs2(e.target.value)}
              placeholder={t("suppliers.as2Placeholder")}
              autoComplete="off"
            />
          </Field>
          <Field label={t("suppliers.duns")} htmlFor="profile-duns">
            <input
              id="profile-duns"
              className="umerco-input font-mono text-sm"
              value={duns}
              onChange={(e) => setDuns(e.target.value)}
              placeholder={t("suppliers.dunsPlaceholder")}
              autoComplete="off"
            />
          </Field>
        </div>

        {ediError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {ediError}
          </p>
        ) : null}
      </form>

      <div className={`${card} p-5`}>
        <UmercoSectionLabel>Quick Actions</UmercoSectionLabel>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/settings" className={`${btnSecondary} inline-flex items-center gap-2`}>
            <SettingsIcon size={16} strokeWidth={1.75} />
            Go to Settings
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? <Loader size="sm" className="!w-4" /> : null}
            {signingOut ? t("login.signingOut") : t("button.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
