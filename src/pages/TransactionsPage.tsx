import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { btnOutline, card, tableBase, tableHeader, tdBase } from "@/components/umerco/styles";
import { Pagination } from "@/components/umerco/Pagination";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { TableRowsLoader } from "@/components/umerco/LoadingBlock";
import { apiRoutes, http, withQuery } from "@/api";
import { extractApiError } from "@/lib/api-error";
import { SupplierScopeFilter } from "@/components/integrations/SupplierScopeFilter";
import { useAdminSupplierFilter } from "@/hooks/useAdminSupplierFilter";
import { usePortalRole } from "@/hooks/usePortalRole";
import { paths } from "@/paths";

type Direction = "IN" | "OUT";
type DocStatus = "Accepted" | "Rejected" | "In process";
type DirectionFilter = "all" | Direction;

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type TxRow = {
  id: string;
  dir: Direction;
  docType: string;
  date: string;
  refNo: string;
  shipFrom: string;
  shipTo: string;
  sender: string;
  receiver: string;
  docStatus: DocStatus;
  supplierName?: string;
  supplierId?: string | null;
  href?: string | null;
};

type TransactionsResponse = {
  transactions?: TxRow[];
  error?: string;
};

function docStatusDot(status: DocStatus) {
  if (status === "Accepted") return "bg-emerald-500";
  if (status === "Rejected") return "bg-red-500";
  return "bg-umerco-primary";
}

function formatLogDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function scheduleHrefFromRow(row: TxRow): string | null {
  if (row.href) return row.href;
  if (row.dir !== "IN") return null;
  const scheduleId = row.id.startsWith("IN-") ? row.id.slice(3) : "";
  if (!scheduleId) return null;
  return `${paths.schedules}?schedule=${encodeURIComponent(scheduleId)}`;
}

export default function TransactionsPage() {
  const { isPartnerAdmin: isAdminViewer } = usePortalRole();
  const { isPartnerAdmin, supplierId, setSupplierId, suppliers, suppliersLoading } =
    useAdminSupplierFilter();
  const [filter, setFilter] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void http
      .get(withQuery(apiRoutes.transactions, { supplierId: supplierId || undefined }))
      .then(async (response) => {
        const json = (await response.json()) as TransactionsResponse;
        if (!response.ok) {
          throw new Error(extractApiError(json, "Could not load transactions."));
        }
        if (cancelled) return;
        setTransactions(json.transactions ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load transactions.");
        setTransactions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const counts = useMemo(() => {
    const inbound = transactions.filter((row) => row.dir === "IN").length;
    const outbound = transactions.filter((row) => row.dir === "OUT").length;
    return { inbound, outbound };
  }, [transactions]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return transactions.filter((row) => {
      if (direction !== "all" && row.dir !== direction) return false;
      if (!q) return true;
      return [row.refNo, row.docType, row.shipFrom, row.shipTo, row.sender, row.receiver, row.dir, row.docStatus, row.supplierName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [direction, filter, transactions]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [direction, filter, supplierId]);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageSize, rows, safePage]);

  const onExport = () => {
    const header = isPartnerAdmin
      ? ["Dir", "Doc type", "Date", "Ref no.", "Supplier", "Ship-from", "Ship-to", "Sender", "Receiver", "Doc status"]
      : ["Dir", "Doc type", "Date", "Ref no.", "Ship-from", "Ship-to", "Sender", "Receiver", "Doc status"];
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        (isPartnerAdmin
          ? [
              row.dir,
              row.docType,
              formatLogDate(row.date),
              row.refNo,
              row.supplierName ?? "—",
              row.shipFrom,
              row.shipTo,
              row.sender,
              row.receiver,
              row.docStatus
            ]
          : [
              row.dir,
              row.docType,
              formatLogDate(row.date),
              row.refNo,
              row.shipFrom,
              row.shipTo,
              row.sender,
              row.receiver,
              row.docStatus
            ])
          .map((value) => csvEscape(String(value)))
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const columnCount = isPartnerAdmin ? 10 : 9;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <UmercoSectionLabel>Integrations</UmercoSectionLabel>
          <h2 className="text-2xl font-semibold text-umerco-dark">Transactions</h2>
          <p className="mt-1 text-sm text-umerco-muted">
            Inbound documents received by the portal and outbound documents sent to the buyer.
          </p>
        </div>

        <button type="button" className={`${btnOutline} gap-2 px-3`} onClick={onExport} disabled={loading || rows.length === 0}>
          <Download size={16} strokeWidth={1.75} />
          Export
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className={`${card} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-umerco-dark">Transaction log</h3>
            <p className="mt-0.5 text-xs text-umerco-muted">
              {counts.inbound} inbound · {counts.outbound} outbound
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {isPartnerAdmin ? (
              <SupplierScopeFilter
                suppliers={suppliers}
                value={supplierId}
                onChange={setSupplierId}
                disabled={suppliersLoading || loading}
              />
            ) : null}
            <div className="inline-flex rounded-full bg-[#eceff3] p-1">
              {(
                [
                  ["all", "All"],
                  ["IN", "Inbound"],
                  ["OUT", "Outbound"]
                ] as const
              ).map(([value, label]) => {
                const active = direction === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDirection(value)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-all ${
                      active
                        ? "bg-white font-semibold text-umerco-dark shadow-sm"
                        : "font-medium text-umerco-muted hover:text-umerco-dark"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by ref, doc type, ship-to, sender…"
              className="umerco-input w-full max-w-sm rounded-lg border border-umerco-border bg-white px-3 py-2 text-sm text-umerco-dark placeholder:text-umerco-muted"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className={tableBase}>
            <thead>
              <tr>
                {[
                  "Dir",
                  "Doc type",
                  "Date",
                  "Ref no.",
                  ...(isPartnerAdmin ? ["Supplier"] : []),
                  "Ship-from",
                  "Ship-to",
                  "Sender",
                  "Receiver",
                  "Doc status"
                ].map((heading) => (
                  <th key={heading} className={tableHeader}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowsLoader colSpan={columnCount} message="Loading transactions…" />
              ) : null}
              {!loading
                ? pagedRows.map((row) => {
                    const poHref = isAdminViewer ? null : scheduleHrefFromRow(row);
                    return (
                <tr key={row.id} className="hover:bg-umerco-beige/60">
                  <td className={tdBase}>
                    <span className="font-mono text-xs font-semibold text-umerco-dark">{row.dir}</span>
                  </td>
                  <td className={tdBase}>
                    <span className="font-medium">{row.docType}</span>
                  </td>
                  <td className={`${tdBase} whitespace-nowrap text-umerco-muted`}>
                    {formatLogDate(row.date)}
                  </td>
                  <td className={`${tdBase} font-mono text-xs`}>
                    {poHref ? (
                      <Link to={poHref} className="text-umerco-primary hover:underline">
                        {row.refNo}
                      </Link>
                    ) : (
                      row.refNo
                    )}
                  </td>
                  {isPartnerAdmin ? <td className={tdBase}>{row.supplierName ?? "—"}</td> : null}
                  <td className={tdBase}>{row.shipFrom}</td>
                  <td className={tdBase}>{row.shipTo}</td>
                  <td className={tdBase}>{row.sender}</td>
                  <td className={tdBase}>{row.receiver}</td>
                  <td className={tdBase}>
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 rounded-full ${docStatusDot(row.docStatus)}`} />
                      {row.docStatus}
                    </span>
                  </td>
                </tr>
                    );
                  })
                : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className={`${tdBase} py-8 text-center text-umerco-muted`}>
                    {transactions.length === 0
                      ? "No inbound or outbound transactions yet."
                      : "No transactions match this filter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
            itemLabel="transactions"
          />
        </div>
      </section>
    </div>
  );
}
