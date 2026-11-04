import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download } from "lucide-react";
import { btnDark, btnOutline, card } from "@/components/umerco/styles";
import { Pagination } from "@/components/umerco/Pagination";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { apiRoutes, http, withQuery } from "@/api";
import { extractApiError } from "@/lib/api-error";
import { SupplierScopeFilter } from "@/components/integrations/SupplierScopeFilter";
import { useAdminSupplierFilter } from "@/hooks/useAdminSupplierFilter";

type EnvMode = "production" | "test";
type ExceptionKind = "business" | "supplier" | "technical";

const PAGE_SIZE_OPTIONS = [5, 10, 20];

type ExceptionItem = {
  id: string;
  kind: ExceptionKind;
  title: string;
  meta: string;
  description: string;
  fix: string;
  href?: string | null;
  docType?: string;
  refNo?: string;
  date?: string;
  counterparty?: string;
  supplierName?: string;
  supplierId?: string | null;
};

type MessageHubResponse = {
  exceptions?: ExceptionItem[];
  error?: string;
};

function kindBadge(kind: ExceptionKind) {
  if (kind === "business") {
    return {
      label: "Business validation",
      className: "bg-red-100 text-red-700"
    };
  }
  if (kind === "supplier") {
    return {
      label: "Supplier induced",
      className: "bg-amber-100 text-amber-800"
    };
  }
  return {
    label: "Technical",
    className: "bg-gray-100 text-gray-700"
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export default function MessageHubPage() {
  const { isPartnerAdmin, supplierId, setSupplierId, suppliers, suppliersLoading } =
    useAdminSupplierFilter();
  const [env, setEnv] = useState<EnvMode>("production");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void http
      .get(withQuery(apiRoutes.messageHub, { supplierId: supplierId || undefined }))
      .then(async (response) => {
        const json = (await response.json()) as MessageHubResponse;
        if (!response.ok) {
          throw new Error(extractApiError(json, "Could not load exceptions."));
        }
        if (cancelled) return;
        setExceptions(json.exceptions ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load exceptions.");
        setExceptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const counts = useMemo(() => {
    const business = exceptions.filter((item) => item.kind === "business").length;
    const supplier = exceptions.filter((item) => item.kind === "supplier").length;
    const technical = exceptions.filter((item) => item.kind === "technical").length;
    return { business, supplier, technical };
  }, [exceptions]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return exceptions;
    return exceptions.filter((item) =>
      [item.title, item.meta, item.description, item.docType, item.refNo, item.counterparty, item.supplierName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [exceptions, filter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filter, supplierId]);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageSize, rows, safePage]);

  const onExport = () => {
    const header = isPartnerAdmin
      ? ["Kind", "Title", "Meta", "Supplier", "Description", "Fix"]
      : ["Kind", "Title", "Meta", "Description", "Fix"];
    const lines = [
      header.join(","),
      ...rows.map((item) =>
        (isPartnerAdmin
          ? [item.kind, item.title, item.meta, item.supplierName ?? "—", item.description, item.fix]
          : [item.kind, item.title, item.meta, item.description, item.fix])
          .map((value) => csvEscape(String(value)))
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "exceptions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <UmercoSectionLabel>Integrations</UmercoSectionLabel>
          <h2 className="text-2xl font-semibold text-umerco-dark">Message Hub</h2>
          <p className="mt-1 text-sm text-umerco-muted">
            Exceptions from documents sent and received with the trading partner
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-[#eceff3] p-1">
            {(["production", "test"] as const).map((mode) => {
              const active = env === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEnv(mode)}
                  className={`rounded-full px-4 py-1.5 text-sm capitalize transition-all ${
                    active
                      ? "bg-white font-semibold text-umerco-dark shadow-sm"
                      : "font-medium text-umerco-muted hover:text-umerco-dark"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={`${btnOutline} gap-2 px-3`}
            onClick={onExport}
            disabled={loading || rows.length === 0}
          >
            <Download size={16} strokeWidth={1.75} />
            Export
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className={`${card} border-red-200 p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0 text-amber-600" strokeWidth={2} />
            <h3 className="text-base font-semibold text-umerco-dark">Exceptions</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-sm font-medium">
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">
              {counts.business} business
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
              {counts.supplier} supplier-induced
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              {counts.technical} technical
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          {isPartnerAdmin ? (
            <SupplierScopeFilter
              suppliers={suppliers}
              value={supplierId}
              onChange={setSupplierId}
              disabled={suppliersLoading || loading}
            />
          ) : null}
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter exceptions by ref, doc type, or error…"
            className="umerco-input w-full max-w-md rounded-lg border border-umerco-border bg-white px-3 py-2 text-sm text-umerco-dark placeholder:text-umerco-muted"
          />
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <LoadingBlock message="Loading exceptions…" size="sm" className="min-h-[12rem]" />
          ) : null}
          {!loading
            ? pagedRows.map((item) => {
            const badge = kindBadge(item.kind);
            return (
              <article
                key={item.id}
                className="rounded-lg border border-umerco-border bg-umerco-canvas/40 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <h4 className="mt-2 text-sm font-semibold text-umerco-dark">
                      {item.title}{" "}
                      <span className="font-normal text-umerco-muted">
                        ·{" "}
                        {!isPartnerAdmin && item.href && item.refNo ? (
                          <Link to={item.href} className="text-umerco-primary hover:underline">
                            {item.meta}
                          </Link>
                        ) : (
                          item.meta
                        )}
                      </span>
                    </h4>
                    {isPartnerAdmin && item.supplierName ? (
                      <p className="mt-1 text-sm text-umerco-dark">
                        <span className="text-umerco-muted">Supplier:</span> {item.supplierName}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-umerco-muted">{item.description}</p>
                    <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      <span className="font-semibold">Fix:</span> {item.fix}
                    </p>
                  </div>
                  {!isPartnerAdmin ? (
                    item.href ? (
                      <Link to={item.href} className={`${btnDark} shrink-0 px-4`}>
                        Resolve &amp; resubmit
                      </Link>
                    ) : (
                      <button type="button" className={`${btnDark} shrink-0 px-4`} disabled>
                        Resolve &amp; resubmit
                      </button>
                    )
                  ) : null}
                </div>
              </article>
            );
          })
            : null}

          {!loading && rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-umerco-muted">
              {exceptions.length === 0
                ? "No exceptions. Failed outbound documents will appear here."
                : "No exceptions match this filter."}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <Pagination
            page={safePage}
            pageSize={pageSize}
            totalItems={loading ? 0 : rows.length}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
            itemLabel="exceptions"
          />
        </div>
      </section>
    </div>
  );
}
