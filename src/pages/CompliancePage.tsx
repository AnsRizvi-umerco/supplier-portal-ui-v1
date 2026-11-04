import { useState } from "react";
import {
  Check,
  Info,
  Circle
} from "lucide-react";
import { btnDark, card } from "@/components/umerco/styles";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";

const DOC_TYPES = ["DELFOR", "DELJIT", "ASN", "INVOIC"] as const;
type DocType = (typeof DOC_TYPES)[number];

const DOC_LABELS: Record<DocType, string> = {
  DELFOR: "planning schedule inbound",
  DELJIT: "just-in-time schedule inbound",
  ASN: "despatch advice outbound",
  INVOIC: "invoice outbound"
};

type ScoreStatus = "pass" | "in_progress" | "pending";

const SCORECARD: { id: DocType; label: string; status: ScoreStatus }[] = [
  { id: "DELFOR", label: "DELFOR", status: "pass" },
  { id: "DELJIT", label: "DELJIT", status: "pass" },
  { id: "ASN", label: "ASN (DESADV)", status: "in_progress" },
  { id: "INVOIC", label: "INVOIC", status: "pass" }
];

const ONBOARDING_STEPS = [
  { id: 1, label: "Register & ship-from codes", state: "done" as const },
  { id: 2, label: "Connectivity verified", state: "done" as const },
  { id: 3, label: "Document self-test", state: "current" as const },
  { id: 4, label: "Go / no-go checkpoint", state: "go" as const },
  { id: 5, label: "Production go-live", state: "pending" as const }
];

function StatusIcon({ status }: { status: ScoreStatus }) {
  if (status === "pass") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex h-6 w-6 items-center justify-center">
        <Circle size={10} className="fill-umerco-primary text-umerco-primary" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center">
      <Circle size={10} className="text-umerco-muted" />
    </span>
  );
}

function statusLabel(status: ScoreStatus) {
  if (status === "pass") return { text: "Pass", className: "text-emerald-600" };
  if (status === "in_progress") return { text: "In progress", className: "text-umerco-primary" };
  return { text: "Pending", className: "text-umerco-muted" };
}

export default function CompliancePage() {
  const [activeDoc, setActiveDoc] = useState<DocType>("DELFOR");
  const certifiedCount = SCORECARD.filter((s) => s.status === "pass").length;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div>
        <UmercoSectionLabel>Self-test environment</UmercoSectionLabel>
        <h2 className="text-2xl font-semibold text-umerco-dark">Compliance &amp; certification</h2>
      </div>

      <div className="flex gap-3 rounded-lg border border-umerco-primary/20 bg-umerco-primary-soft/50 px-4 py-3">
        <Info size={20} className="mt-0.5 shrink-0 text-umerco-primary" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-umerco-dark">
            Tests run against the live production ruleset
          </p>
          <p className="mt-0.5 text-sm text-umerco-muted">
            No separate linter — the same SAP validation that gates real documents validates your
            test submissions. A pass here means a pass in production.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className={`${card} p-5`}>
          <h3 className="text-base font-semibold text-umerco-dark">Document test runner</h3>

          <div className="mt-4 flex flex-wrap gap-2">
            {DOC_TYPES.map((doc) => {
              const active = doc === activeDoc;
              return (
                <button
                  key={doc}
                  type="button"
                  onClick={() => setActiveDoc(doc)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-umerco-dark text-white shadow-sm"
                      : "border border-umerco-border bg-white text-umerco-muted hover:border-umerco-dark/30 hover:text-umerco-dark"
                  }`}
                >
                  {doc}
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-umerco-dark">
              Testing {activeDoc} — {DOC_LABELS[activeDoc]}
            </p>

            <ol className="mt-4 space-y-4">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-sm font-medium text-umerco-dark">
                    Lucid sent realistic test data
                  </p>
                  <p className="mt-0.5 text-sm text-umerco-muted">
                    3 sample releases for parts 0 255 956 482, 0 209 011 773 — received 09:02
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-sm font-medium text-umerco-dark">
                    You responded with a functional acknowledgement
                  </p>
                  <p className="mt-0.5 text-sm text-umerco-muted">
                    CONTRL 997 returned — syntax valid
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-umerco-primary text-xs font-semibold text-white">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium text-umerco-dark">Production ruleset validation</p>
                  <p className="mt-0.5 text-sm text-umerco-muted">
                    Validating cumulative-qty continuity and date windows…
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <button type="button" className={`${btnDark} mt-6 px-4`}>
            Run test now
          </button>
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-umerco-dark">Compliance scorecard</h3>
              <span className="text-sm font-semibold text-umerco-primary">
                {certifiedCount} / {SCORECARD.length} certified
              </span>
            </div>

            <ul className="mt-4 space-y-3">
              {SCORECARD.map((row) => {
                const label = statusLabel(row.status);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-umerco-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <StatusIcon status={row.status} />
                      <span className="text-sm font-medium text-umerco-dark">{row.label}</span>
                    </div>
                    <span className={`text-sm font-medium ${label.className}`}>{label.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={`${card} p-5`}>
            <h3 className="text-base font-semibold text-umerco-dark">Certification progress</h3>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-umerco-border">
              <div
                className="h-full rounded-full bg-umerco-primary transition-all"
                style={{ width: `${(certifiedCount / SCORECARD.length) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-umerco-muted">
              Complete the ASN test to unlock the go-live checkpoint.
            </p>
          </section>
        </div>
      </div>

      <section className={`${card} p-5`}>
        <h3 className="text-base font-semibold text-umerco-dark">Onboarding task tracker</h3>

        <ol className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          {ONBOARDING_STEPS.map((step, index) => {
            const isLast = index === ONBOARDING_STEPS.length - 1;
            const nextDone =
              !isLast &&
              (ONBOARDING_STEPS[index + 1].state === "done" ||
                ONBOARDING_STEPS[index + 1].state === "current" ||
                step.state === "done" ||
                step.state === "current");

            return (
              <li key={step.id} className="relative flex flex-1 gap-3 sm:flex-col sm:items-center sm:text-center">
                {!isLast ? (
                  <span
                    className={`absolute left-3.5 top-7 hidden h-[calc(100%-1.75rem)] w-px sm:left-auto sm:top-3.5 sm:block sm:h-0.5 sm:w-[calc(100%-1.75rem)] sm:translate-x-[calc(50%+0.875rem)] ${
                      nextDone ? "bg-umerco-primary" : "bg-umerco-border"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}

                {step.state === "done" ? (
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                ) : step.state === "current" ? (
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-umerco-primary text-xs font-semibold text-white">
                    {step.id}
                  </span>
                ) : step.state === "go" ? (
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold uppercase text-white">
                    GO
                  </span>
                ) : (
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-umerco-muted/40 text-xs font-semibold text-white">
                    {step.id}
                  </span>
                )}

                <p className="text-sm font-medium text-umerco-dark sm:mt-2 sm:max-w-[8.5rem]">
                  {step.label}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
