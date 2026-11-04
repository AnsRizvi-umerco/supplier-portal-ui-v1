

import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileCheck,
  Package,
  Receipt,
  Search,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { apiRoutes, http, withQuery } from "@/api";
import {
  btnOutline,
  btnPrimary,
  btnSecondary,
  statusPill,
  tableBase,
  tableHeader,
  tableRowClass,
  tableWrap,
  tdBase,
  trHover
} from "@/components/umerco/styles";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";
import { Collapse } from "@/components/umerco/Collapse";
import { Pagination } from "@/components/umerco/Pagination";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { useToast } from "@/components/umerco/toast";
import { useAuth } from "@/context/auth-context";
import { isDocumentTypeAllowed } from "@/lib/document-types";
import { PORTAL_INBOUND_SCHEDULE_EVENT } from "@/hooks/useNotifications";
import type { DeljitMessage } from "@/lib/schemas/deljit";

type DateRangeValue = "24h" | "7d" | "30d" | "12m" | "all" | "custom";

type ScheduleDateBasis = "period" | "received" | "release";

type ScheduleSummary = {
  id: string;
  deljit_ref: string;
  period_start: string;
  period_end: string;
  status: string;
  received_at?: string;
  release_date?: string | null;
  supplier_name?: string | null;
  supplier_code?: string | null;
  supplier_email?: string | null;
  sent_docs?: string[];
};

type ScheduleListResponse = {
  schedules: ScheduleSummary[];
  error?: string;
};

type FilterArgs = {
  basis: ScheduleDateBasis;
  range: DateRangeValue;
  customFrom: string;
  customTo: string;
  deljitRef: string;
};

const INITIAL_FILTERS: FilterArgs = {
  basis: "period",
  range: "all",
  customFrom: "",
  customTo: "",
  deljitRef: ""
};

function serializeFilterKey(args: FilterArgs): string {
  return `${args.basis}|${args.range}|${args.customFrom}|${args.customTo}|${args.deljitRef}`;
}

type ScheduleLineRow = {
  id: string;
  part_no: string;
  description: string | null;
  qty_required: number;
  uom: string;
  deliver_by: string;
  facility: string;
};

type PurchaseOrderLine = {
  lineNo?: string;
  itemCode: string;
  itemCodeQualifier?: string;
  description: string;
  quantity: string;
  uom: string;
  unitPrice?: string;
  lineAmount?: string;
};

type PurchaseOrder = {
  interchange: {
    senderId?: string;
    receiverId?: string;
    interchangeControlNo?: string;
  };
  message: {
    messageType: string;
    functionalGroup?: string;
    version?: string;
  };
  payload: {
    poNumber: string;
    poDate: string;
    requestedDeliveryDate: string;
    currency?: string;
    buyerId?: string;
    buyerName?: string;
    vendorId?: string;
    vendorName?: string;
    shipTo?: {
      id?: string;
      name?: string;
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      countryCode?: string;
    };
    lines: PurchaseOrderLine[];
    summary?: {
      lineCount?: string;
      quantityHashTotal?: string;
      orderTotal?: string;
    };
  };
};

type ScheduleDetailResponse = {
  schedule: {
    id: string;
    deljit_ref: string;
    release_date: string | null;
    period_start: string;
    period_end: string;
    status: string;
    received_at: string;
    supplier_name?: string | null;
    supplier_code?: string | null;
    supplier_email?: string | null;
    sent_docs?: string[];
  } | null;
  lines: ScheduleLineRow[];
  message: DeljitMessage | null;
  purchaseOrder?: PurchaseOrder | null;
  canonical_parse_error: string | null;
  canonical_json_raw: unknown;
  lines_consistent_with_message: boolean | null;
  error?: string;
};

function formatInboundDate(value: string) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function statusLabel(status: string) {
  if (status === "invoice_sent") return "Invoice sent";
  if (status === "completed") return "Completed";
  if (status === "acknowledged") return "Acknowledged";
  if (status === "pending") return "Pending";
  return status;
}

function normalizeSentDocs(docs: string[] | null | undefined): string[] {
  return (docs ?? []).map((doc) => doc.trim().toUpperCase()).filter(Boolean);
}

function sentDocFlags(schedule: { status: string; sent_docs?: string[] | null }) {
  const docs = new Set(normalizeSentDocs(schedule.sent_docs));
  return {
    ack: docs.has("ORDRSP") || docs.has("APERAK") || schedule.status === "acknowledged",
    asn: docs.has("DESADV"),
    invoice: docs.has("INVOIC") || schedule.status === "invoice_sent"
  };
}

type SentDocBadge = { key: "ack" | "asn" | "invoice"; label: string; className: string };

function sentDocBadges(schedule: { status: string; sent_docs?: string[] | null }): SentDocBadge[] {
  const flags = sentDocFlags(schedule);
  const badges: SentDocBadge[] = [];
  if (flags.ack) {
    badges.push({ key: "ack", label: "Ack", className: "doc-sent-badge doc-sent-badge-ack" });
  }
  if (flags.asn) {
    badges.push({ key: "asn", label: "ASN", className: "doc-sent-badge doc-sent-badge-asn" });
  }
  if (flags.invoice) {
    badges.push({ key: "invoice", label: "Invoice", className: "doc-sent-badge doc-sent-badge-invoice" });
  }
  return badges;
}

function SentDocBadges({ schedule }: { schedule: { status: string; sent_docs?: string[] | null } }) {
  const badges = sentDocBadges(schedule);
  if (badges.length === 0) return null;

  return (
    <>
      {badges.map((badge) => (
        <span key={badge.key} className={badge.className}>
          {badge.label}
        </span>
      ))}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold tracking-tight text-umerco-dark">{children}</h4>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-sm text-umerco-muted">{children}</p>;
}

function OverviewField({
  label,
  children,
  mono
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-umerco-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm text-umerco-dark ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function formatDeliverByDisplay(value: string) {
  const formatted = formatInboundDate(value);
  return formatted === value ? value : `${value} (${formatted})`;
}

function formatInboundDateDisplay(value: string | null | undefined) {
  if (!value) return "Not specified";
  const formatted = formatInboundDate(value);
  return formatted === value ? value : `${value} (${formatted})`;
}

const DETAIL_CLOSE_MS = 300;
const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

type OpenPanel = "filter" | "search" | null;

function formatSupplierLabel(schedule: {
  supplier_name?: string | null;
  supplier_code?: string | null;
  supplier_email?: string | null;
}) {
  const name = schedule.supplier_name?.trim();
  const code = schedule.supplier_code?.trim();
  const email = schedule.supplier_email?.trim();

  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  if (email) return email;
  return "Unknown supplier";
}

function formatPeriod(start: string, end: string) {
  const format = (value: string) => {
    const dayMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    const normalized = dayMatch?.[1] ?? formatInboundDate(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return new Date(`${normalized}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }
    return normalized;
  };

  const startLabel = format(start);
  const endLabel = format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function formatReceivedAt(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function panelToggleClass(open: boolean, active: boolean) {
  const base = "inline-flex items-center gap-2 transition-all duration-200 ease-out";
  if (open) return `${base} ${btnPrimary}`;
  if (active) return `${base} ${btnSecondary} ring-2 ring-umerco-primary/20`;
  return `${base} ${btnSecondary}`;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={`h-4 w-4 shrink-0 text-umerco-muted transition-transform duration-300 ease-out ${
        expanded ? "rotate-180" : ""
      }`}
      strokeWidth={1.75}
    />
  );
}

export function SchedulesBoard() {
  const toast = useToast();
  const { user } = useAuth();
  const isPartnerAdmin = user?.actor === "partner_admin";
  const pathname = useLocation().pathname;
  const [searchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(() => searchParams.get("schedule"));

  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listFetchError, setListFetchError] = useState<string | null>(null);
  const [pendingBasis, setPendingBasis] = useState<ScheduleDateBasis>(INITIAL_FILTERS.basis);
  const [pendingRange, setPendingRange] = useState<DateRangeValue>(INITIAL_FILTERS.range);
  const [pendingCustomFrom, setPendingCustomFrom] = useState(INITIAL_FILTERS.customFrom);
  const [pendingCustomTo, setPendingCustomTo] = useState(INITIAL_FILTERS.customTo);
  const [pendingDeljitRef, setPendingDeljitRef] = useState(INITIAL_FILTERS.deljitRef);
  const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);
  const [lastAppliedDeljitRef, setLastAppliedDeljitRef] = useState("");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const listTopRef = useRef<HTMLDivElement>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const deljitSearchInputRef = useRef<HTMLInputElement>(null);
  const appliedFiltersRef = useRef<FilterArgs>(INITIAL_FILTERS);

  const [detail, setDetail] = useState<ScheduleDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFetchError, setDetailFetchError] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runListFetch = useCallback(async (args: FilterArgs, signal: AbortSignal, silent = false) => {
    if (args.range === "custom" && (!args.customFrom || !args.customTo)) {
      setListFetchError("Choose both From and To dates for a custom range.");
      return;
    }

    setListFetchError(null);
    if (!silent) setListLoading(true);
    try {
      const params = new URLSearchParams({
        basis: args.basis,
        range: args.range
      });
      if (args.range === "custom") {
        params.set("from", args.customFrom);
        params.set("to", args.customTo);
      }
      if (args.deljitRef) {
        params.set("deljitRef", args.deljitRef);
      }
      const response = await http.get(withQuery(apiRoutes.schedules.list, params), { signal });
      const json = (await response.json()) as ScheduleListResponse;
      if (signal.aborted) return;
      if (!response.ok) {
        throw new Error(json.error ?? `Schedules API returned ${response.status}`);
      }
      setSchedules(json.schedules ?? []);
      setLastAppliedKey(serializeFilterKey(args));
      setLastAppliedDeljitRef(args.deljitRef);
      appliedFiltersRef.current = args;
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (silent) return;
      const message = error instanceof Error ? error.message : "Failed to load schedules";
      setListFetchError(message);
      toast.error(message);
    } finally {
      if (!signal.aborted && !silent) setListLoading(false);
    }
  }, [toast]);

  const startListFetch = useCallback(
    (args: FilterArgs, silent = false) => {
      if (!silent) {
        listAbortRef.current?.abort();
      }
      const ac = new AbortController();
      if (!silent) listAbortRef.current = ac;
      void runListFetch(args, ac.signal, silent);
    },
    [runListFetch]
  );

  useEffect(() => {
    startListFetch(INITIAL_FILTERS);
    return () => {
      listAbortRef.current?.abort();
    };
  }, [startListFetch]);

  useEffect(() => {
    const refresh = () => startListFetch(appliedFiltersRef.current, true);
    window.addEventListener(PORTAL_INBOUND_SCHEDULE_EVENT, refresh);
    const timer = window.setInterval(refresh, 20000);
    return () => {
      window.removeEventListener(PORTAL_INBOUND_SCHEDULE_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, [startListFetch]);

  const pendingFilterArgs = useMemo(
    (): FilterArgs => ({
      basis: pendingBasis,
      range: pendingRange,
      customFrom: pendingCustomFrom,
      customTo: pendingCustomTo,
      deljitRef: pendingDeljitRef.trim()
    }),
    [pendingBasis, pendingCustomFrom, pendingCustomTo, pendingDeljitRef, pendingRange]
  );

  const pendingKey = useMemo(() => serializeFilterKey(pendingFilterArgs), [pendingFilterArgs]);

  const customIncomplete = pendingRange === "custom" && (!pendingCustomFrom || !pendingCustomTo);
  const applyDisabled =
    listLoading ||
    customIncomplete ||
    (lastAppliedKey !== null && pendingKey === lastAppliedKey && !listFetchError);
  const searchDisabled = listLoading || customIncomplete || !pendingDeljitRef.trim();

  const filtersActive =
    lastAppliedKey !== null &&
    lastAppliedKey !== serializeFilterKey({ ...INITIAL_FILTERS, deljitRef: lastAppliedDeljitRef });
  const searchActive = lastAppliedDeljitRef.length > 0;
  const searchClearVisible = searchActive || pendingDeljitRef.trim().length > 0;
  const showFilterPanel = openPanel === "filter";
  const showSearchPanel = openPanel === "search";

  const onApplyFilters = () => {
    startListFetch(pendingFilterArgs);
    setOpenPanel("filter");
  };

  const onSearchDeljit = () => {
    if (!pendingDeljitRef.trim()) return;
    startListFetch(pendingFilterArgs);
    setOpenPanel("search");
  };

  const onClearFilters = () => {
    setPendingBasis(INITIAL_FILTERS.basis);
    setPendingRange(INITIAL_FILTERS.range);
    setPendingCustomFrom(INITIAL_FILTERS.customFrom);
    setPendingCustomTo(INITIAL_FILTERS.customTo);
    startListFetch({
      ...INITIAL_FILTERS,
      deljitRef: pendingDeljitRef.trim()
    });
  };

  const onClearSearch = () => {
    const hadAppliedSearch = searchActive;
    setPendingDeljitRef("");
    if (hadAppliedSearch) {
      startListFetch({
        basis: pendingBasis,
        range: pendingRange,
        customFrom: pendingCustomFrom,
        customTo: pendingCustomTo,
        deljitRef: ""
      });
    }
  };

  const toggleFiltersPanel = () => {
    setOpenPanel((current) => (current === "filter" ? null : "filter"));
  };

  const toggleSearchPanel = () => {
    setOpenPanel((current) => (current === "search" ? null : "search"));
  };

  const closePanels = () => setOpenPanel(null);

  useEffect(() => {
    if (openPanel === "search") {
      deljitSearchInputRef.current?.focus();
    }
  }, [openPanel]);

  useEffect(() => {
    setPage(1);
  }, [lastAppliedKey]);

  useEffect(() => {
    if (!activeId || schedules.length === 0) return;
    const index = schedules.findIndex((schedule) => schedule.id === activeId);
    if (index >= 0) {
      setPage(Math.floor(index / pageSize) + 1);
    }
  }, [activeId, schedules, pageSize]);

  const totalPages = Math.max(1, Math.ceil(schedules.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedSchedules = useMemo(() => {
    const start = (page - 1) * pageSize;
    return schedules.slice(start, start + pageSize);
  }, [page, pageSize, schedules]);

  const handlePageChange = (nextPage: number) => {
    const start = (nextPage - 1) * pageSize;
    const pageItems = schedules.slice(start, start + pageSize);
    if (activeId && !pageItems.some((schedule) => schedule.id === activeId)) {
      cancelCloseTimer();
      setActiveId(null);
      setClosingId(null);
      updateScheduleUrl(null, "replace");
    }
    setPage(nextPage);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateScheduleUrl = useCallback(
    (id: string | null, mode: "push" | "replace") => {
      const params = new URLSearchParams(window.location.search);
      if (id) params.set("schedule", id);
      else params.delete("schedule");
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [pathname]
  );

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeSchedule = useCallback(() => {
    if (!activeId) return;
    cancelCloseTimer();
    const idToClose = activeId;
    setClosingId(idToClose);
    closeTimerRef.current = setTimeout(() => {
      setActiveId(null);
      updateScheduleUrl(null, "replace");
      closeTimerRef.current = null;
    }, DETAIL_CLOSE_MS);
  }, [activeId, cancelCloseTimer, updateScheduleUrl]);

  const openSchedule = useCallback(
    (id: string) => {
      cancelCloseTimer();
      setClosingId(null);
      setActiveId(id);
      updateScheduleUrl(id, "push");
    },
    [cancelCloseTimer, updateScheduleUrl]
  );

  useEffect(() => () => cancelCloseTimer(), [cancelCloseTimer]);

  useEffect(() => {
    if (!activeId) setClosingId(null);
  }, [activeId]);

  useEffect(() => {
    const onPopState = () => {
      cancelCloseTimer();
      const id = new URLSearchParams(window.location.search).get("schedule");
      setActiveId(id);
      setClosingId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cancelCloseTimer]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      setDetailFetchError(null);
      setDetailLoading(false);
      setRawExpanded(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailFetchError(null);
    setDetail(null);

    http.get(apiRoutes.schedules.byId(activeId))
      .then(async (res) => {
        const json = (await res.json()) as ScheduleDetailResponse;
        if (cancelled) return;
        if (!res.ok || !json.schedule) {
          const message = json.error ?? "Could not load this schedule.";
          setDetailFetchError(message);
          toast.error(message);
          setDetail(null);
          return;
        }
        setDetail(json);
      })
      .catch(() => {
        if (!cancelled) {
          const message = "Network error while loading schedule.";
          setDetailFetchError(message);
          toast.error(message);
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, toast]);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSchedule();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, closeSchedule]);

  useEffect(() => {
    if (!activeId || closingId) return;
    const id = window.requestAnimationFrame(() => {
      detailAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeId, closingId]);

  const toggleSchedule = (id: string) => {
    if (activeId === id) {
      if (closingId === id) return;
      closeSchedule();
      return;
    }
    openSchedule(id);
  };

  const scheduleStats = useMemo(() => {
    let pending = 0;
    let acknowledged = 0;
    let asnSent = 0;
    let invoiceSent = 0;

    for (const schedule of schedules) {
      const flags = sentDocFlags(schedule);
      if (schedule.status === "pending") pending += 1;
      if (flags.ack) acknowledged += 1;
      if (flags.asn) asnSent += 1;
      if (flags.invoice) invoiceSent += 1;
    }

    return { total: schedules.length, pending, acknowledged, asnSent, invoiceSent };
  }, [schedules]);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-5 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <UmercoSectionLabel>Delivery Schedules</UmercoSectionLabel>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-umerco-dark">Delivery Schedules</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-umerco-muted">
            {isPartnerAdmin
              ? "Monitor inbound purchase orders and delivery releases sent to each supplier across your trading network."
              : "Review inbound purchase orders and delivery releases, then acknowledge, create ASNs, or invoice."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={panelToggleClass(showFilterPanel, filtersActive)}
            aria-expanded={showFilterPanel}
            aria-controls="schedules-filter-panel"
            onClick={toggleFiltersPanel}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
            Filter
          </button>
          <button
            type="button"
            className={panelToggleClass(showSearchPanel, searchActive)}
            aria-expanded={showSearchPanel}
            aria-controls="schedules-search-panel"
            onClick={toggleSearchPanel}
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
            Search
          </button>
        </div>
      </div>

      <Collapse id="schedules-filter-panel" open={showFilterPanel}>
        <div className="schedule-panel mb-2 mt-4 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-umerco-dark">Date filters</p>
              <p className="mt-0.5 text-xs text-umerco-muted">Narrow schedules by period, received, or release date.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            {filtersActive ? (
              <button
                type="button"
                className={`${btnSecondary} gap-1.5 px-2.5 py-1.5 text-xs`}
                aria-label="Clear date filters"
                onClick={onClearFilters}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                Clear
              </button>
            ) : null}
              <button
                type="button"
                className={`${btnSecondary} px-2 py-1.5`}
                aria-label="Close filters"
                onClick={closePanels}
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block umerco-section-label">Date basis</span>
                <select
                  className="umerco-input px-2 py-2"
                  value={pendingBasis}
                  onChange={(e) => setPendingBasis(e.target.value as ScheduleDateBasis)}
                >
                  <option value="period">Schedule period</option>
                  <option value="received">Received date</option>
                  <option value="release">Release date</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block umerco-section-label">Range</span>
                <select
                  className="umerco-input px-2 py-2"
                  value={pendingRange}
                  onChange={(e) => setPendingRange(e.target.value as DateRangeValue)}
                >
                  <option value="24h">24H</option>
                  <option value="7d">7D</option>
                  <option value="30d">30D</option>
                  <option value="12m">12M</option>
                  <option value="custom">Custom</option>
                  <option value="all">All</option>
                </select>
              </label>
              <Collapse open={pendingRange === "custom"}>
                <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block umerco-section-label">From</span>
                    <input
                      className="umerco-input px-2 py-2"
                      type="date"
                      value={pendingCustomFrom}
                      onChange={(e) => setPendingCustomFrom(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block umerco-section-label">To</span>
                    <input
                      className="umerco-input px-2 py-2"
                      type="date"
                      value={pendingCustomTo}
                      onChange={(e) => setPendingCustomTo(e.target.value)}
                    />
                  </label>
                </div>
              </Collapse>
            </div>
            <button
              type="button"
              className={`shrink-0 ${btnPrimary} px-4`}
              disabled={applyDisabled}
              onClick={onApplyFilters}
            >
              Apply filters
            </button>
          </div>
          {customIncomplete ? (
            <p className="mt-2 text-xs text-umerco-muted">Select both dates for a custom range before applying.</p>
          ) : null}
        </div>
      </Collapse>

      <Collapse id="schedules-search-panel" open={showSearchPanel}>
        <div className="schedule-panel mb-2 mt-4 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-umerco-dark">Reference search</p>
              <p className="mt-0.5 text-xs text-umerco-muted">Find a schedule by PO number.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            {searchClearVisible ? (
              <button
                type="button"
                className={`${btnSecondary} gap-1.5 px-2.5 py-1.5 text-xs`}
                aria-label="Clear search"
                onClick={onClearSearch}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                Clear
              </button>
            ) : null}
              <button
                type="button"
                className={`${btnSecondary} px-2 py-1.5`}
                aria-label="Close search"
                onClick={closePanels}
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block umerco-section-label">PO number</span>
              <input
                ref={deljitSearchInputRef}
                className="umerco-input w-full px-2 py-2 font-mono"
                type="text"
                placeholder="e.g. PO-55231"
                value={pendingDeljitRef}
                onChange={(e) => setPendingDeljitRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pendingDeljitRef.trim() && !searchDisabled) {
                    onSearchDeljit();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={`shrink-0 ${btnPrimary} px-4`}
              disabled={searchDisabled}
              onClick={onSearchDeljit}
            >
              Search
            </button>
          </div>
        </div>
      </Collapse>

      <div className="schedule-panel grid grid-cols-2 overflow-hidden sm:grid-cols-5">
        <StatCard label="Total" value={scheduleStats.total} />
        <StatCard label="Pending" value={scheduleStats.pending} tone="pending" />
        <StatCard label="Ack" value={scheduleStats.acknowledged} tone="acknowledged" />
        <StatCard label="ASN" value={scheduleStats.asnSent} tone="asn" />
        <StatCard label="Invoice" value={scheduleStats.invoiceSent} tone="invoice_sent" />
      </div>

      {listFetchError ? (
        <p className="text-xs text-umerco-muted">{listFetchError}</p>
      ) : null}

      <div ref={listTopRef}>
        {listLoading ? (
          <div className="schedule-panel flex min-h-[12rem] items-center justify-center px-6 py-14">
            <LoadingBlock message="Loading schedules…" size="sm" className="py-0" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="schedule-panel flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-umerco-primary-soft text-umerco-primary">
              <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="mt-4 text-sm font-medium text-umerco-dark">No schedules found</p>
            <p className="mt-1 max-w-sm text-sm text-umerco-muted">
              {lastAppliedDeljitRef
                ? "No schedules match this reference. Try a different PO number, or clear the search."
                : "No schedules match these filters. Adjust your date range or clear filters to see more results."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={schedules.length}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="schedules"
            />

            {paginatedSchedules.map((schedule) => {
        const isOpen = activeId === schedule.id;
        const isClosing = closingId === schedule.id;
        const expanded = isOpen && !isClosing;
        const panelOpen = isOpen && !isClosing;
        const showPanel = isOpen;
        const detailPanelId = `schedule-detail-${schedule.id}`;
        const outboundBadges = sentDocBadges(schedule);

        return (
          <div
            key={schedule.id}
            className={`schedule-card overflow-hidden ${expanded ? "schedule-card-expanded" : ""}`}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailPanelId}
              onClick={() => toggleSchedule(schedule.id)}
              className="w-full px-5 py-3.5 text-left transition-colors hover:bg-umerco-canvas/30"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-umerco-primary-soft text-umerco-primary">
                    <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className="font-mono text-sm font-semibold text-umerco-dark">{schedule.deljit_ref}</p>
                      {outboundBadges.length > 0 ? (
                        <SentDocBadges schedule={schedule} />
                      ) : (
                        <span className={statusPill(schedule.status)}>{statusLabel(schedule.status)}</span>
                      )}
                      <span className="text-sm text-umerco-muted">
                        {formatPeriod(schedule.period_start, schedule.period_end)}
                      </span>
                    </div>
                    {isPartnerAdmin ? (
                      <p className="mt-1 text-sm text-umerco-dark">
                        <span className="text-umerco-muted">Sent to </span>
                        <span className="font-medium">{formatSupplierLabel(schedule)}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-umerco-primary sm:inline-flex">
                  {expanded ? "Hide details" : "View details"}
                  <ChevronIcon expanded={expanded} />
                </span>
                <span className="sm:hidden">
                  <ChevronIcon expanded={expanded} />
                </span>
              </div>
            </button>

            <div
              className="border-t border-umerco-border/70 px-5 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              {isPartnerAdmin ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-umerco-canvas text-umerco-primary">
                      <Users className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-umerco-muted">Supplier</p>
                      <p className="mt-0.5 text-sm font-medium text-umerco-dark">{formatSupplierLabel(schedule)}</p>
                      {schedule.supplier_email?.trim() ? (
                        <p className="mt-0.5 truncate text-sm text-umerco-muted">{schedule.supplier_email.trim()}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-umerco-muted">Received</p>
                    <p className="mt-0.5 text-sm text-umerco-dark">{formatReceivedAt(schedule.received_at)}</p>
                    <p className="mt-1 text-xs text-umerco-muted">
                      Supplier actions are completed in the supplier portal.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {isDocumentTypeAllowed(user, "ORDRSP") ? (
                    <ScheduleActionLink
                      icon={<FileCheck className="h-4 w-4" strokeWidth={1.75} />}
                      label="PO Acknowledgement"
                      to={`/submit/poack?schedule=${schedule.id}`}
                      variant="secondary"
                    />
                  ) : null}
                  {isDocumentTypeAllowed(user, "APERAK") ? (
                    <ScheduleActionLink
                      icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
                      label="Acknowledge Schedule"
                      to={`/submit/scheduleack?schedule=${schedule.id}&deljitRef=${encodeURIComponent(schedule.deljit_ref)}`}
                      variant="secondary"
                    />
                  ) : null}
                  {isDocumentTypeAllowed(user, "DESADV") ? (
                    <ScheduleActionLink
                      icon={<Package className="h-4 w-4" strokeWidth={1.75} />}
                      label="Create ASN"
                      to={`/submit/asn?schedule=${schedule.id}`}
                      variant="primary"
                      disabled={sentDocFlags(schedule).asn}
                      disabledTitle="ASN already sent. The shipping label is in Shipping Labels."
                    />
                  ) : null}
                  {isDocumentTypeAllowed(user, "INVOIC") ? (
                    <ScheduleActionLink
                      icon={<Receipt className="h-4 w-4" strokeWidth={1.75} />}
                      label="Create Invoice"
                      to={`/submit/invoice?schedule=${schedule.id}`}
                      variant="outline"
                    />
                  ) : null}
                  {!isDocumentTypeAllowed(user, "APERAK") &&
                  !isDocumentTypeAllowed(user, "ORDRSP") &&
                  !isDocumentTypeAllowed(user, "DESADV") &&
                  !isDocumentTypeAllowed(user, "INVOIC") ? (
                    <p className="text-sm text-umerco-muted">
                      No outbound document types are enabled for this supplier.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                panelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {showPanel ? (
                  <ScheduleDetailPanel
                    id={detailPanelId}
                    detailRef={detailAnchorRef}
                    loading={detailLoading}
                    fetchError={detailFetchError}
                    detail={detail}
                    rawExpanded={rawExpanded}
                    setRawExpanded={setRawExpanded}
                    onClose={closeSchedule}
                    isPartnerAdmin={isPartnerAdmin}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={schedules.length}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="schedules"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleDetailPanel({
  id,
  detailRef,
  loading,
  fetchError,
  detail,
  rawExpanded,
  setRawExpanded,
  onClose,
  isPartnerAdmin
}: {
  id: string;
  detailRef: React.Ref<HTMLDivElement>;
  loading: boolean;
  fetchError: string | null;
  detail: ScheduleDetailResponse | null;
  rawExpanded: boolean;
  setRawExpanded: (v: boolean) => void;
  onClose: () => void;
  isPartnerAdmin: boolean;
}) {
  return (
    <div
      ref={detailRef}
      id={id}
      role="region"
      aria-label="Schedule order details"
      className="scroll-mt-24 animate-detail-in border-t border-umerco-border/70 bg-white/80"
    >
      <div className="flex items-center justify-between gap-3 border-b border-umerco-border/70 px-5 py-3">
        <div>
          <p className="text-sm font-medium text-umerco-dark">Schedule details</p>
          <p className="mt-0.5 text-xs text-umerco-muted">
            {loading
              ? "Loading schedule details…"
              : detail?.schedule
                ? `Received ${new Date(detail.schedule.received_at).toLocaleString()}`
                : "Order lines and technical payload"}
          </p>
        </div>
        <button type="button" className={`${btnSecondary} gap-1.5 px-3 py-1.5 text-xs`} onClick={onClose}>
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          Close
        </button>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <LoadingBlock message="Loading schedule details…" />
        ) : fetchError ? (
          <p className="text-sm text-umerco-muted">{fetchError}</p>
        ) : detail?.schedule ? (
          <>
            {isPartnerAdmin ? (
              <section className="mb-5 rounded-xl border border-umerco-border/70 bg-umerco-canvas/40 p-4">
                <SectionTitle>Supplier assignment</SectionTitle>
                <SectionSubtitle>This inbound schedule was routed to the supplier below.</SectionSubtitle>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <OverviewField label="Supplier">{formatSupplierLabel(detail.schedule)}</OverviewField>
                  <OverviewField label="Email">
                    {detail.schedule.supplier_email?.trim() || "—"}
                  </OverviewField>
                  <OverviewField label="Received">{formatReceivedAt(detail.schedule.received_at)}</OverviewField>
                </dl>
              </section>
            ) : null}
            {detail.purchaseOrder ? (
              <PurchaseOrderDetailBody
                detail={detail}
                rawExpanded={rawExpanded}
                setRawExpanded={setRawExpanded}
              />
            ) : (
              <DeljitDetailBody detail={detail} rawExpanded={rawExpanded} setRawExpanded={setRawExpanded} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function formatShipTo(shipTo: PurchaseOrder["payload"]["shipTo"]): string {
  if (!shipTo) return "Not specified";
  const parts = [
    shipTo.name,
    shipTo.street,
    [shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(" "),
    shipTo.countryCode
  ].filter((part) => part && part.trim());
  return parts.length > 0 ? parts.join(", ") : shipTo.id || "Not specified";
}

function PurchaseOrderDetailBody({
  detail,
  rawExpanded,
  setRawExpanded
}: {
  detail: ScheduleDetailResponse;
  rawExpanded: boolean;
  setRawExpanded: (v: boolean) => void;
}) {
  const { schedule, purchaseOrder } = detail;
  if (!schedule || !purchaseOrder) return null;
  const { payload, message, interchange } = purchaseOrder;

  return (
    <div className="space-y-4">
      <section>
        <SectionTitle>Purchase order</SectionTitle>
        <SectionSubtitle>Inbound 850 stored for this supplier.</SectionSubtitle>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
          <OverviewField label="PO number" mono>
            {payload.poNumber}
          </OverviewField>
          <OverviewField label="Document" mono>
            {message.messageType}
          </OverviewField>
          <OverviewField label="PO date" mono>
            {formatInboundDateDisplay(payload.poDate)}
          </OverviewField>
          <OverviewField label="Requested delivery" mono>
            {formatInboundDateDisplay(payload.requestedDeliveryDate)}
          </OverviewField>
          {payload.currency ? <OverviewField label="Currency">{payload.currency}</OverviewField> : null}
          {payload.buyerName || payload.buyerId ? (
            <OverviewField label="Buyer">{payload.buyerName || payload.buyerId}</OverviewField>
          ) : null}
          {payload.vendorName || payload.vendorId ? (
            <OverviewField label="Vendor">{payload.vendorName || payload.vendorId}</OverviewField>
          ) : null}
          <OverviewField label="Sender" mono>
            {interchange.senderId || "—"}
          </OverviewField>
          <OverviewField label="Receiver" mono>
            {interchange.receiverId || "—"}
          </OverviewField>
          {interchange.interchangeControlNo ? (
            <OverviewField label="Control no" mono>
              {interchange.interchangeControlNo}
            </OverviewField>
          ) : null}
        </dl>
      </section>

      {payload.shipTo ? (
        <section>
          <SectionTitle>Ship to</SectionTitle>
          <SectionSubtitle>{formatShipTo(payload.shipTo)}</SectionSubtitle>
        </section>
      ) : null}

      <section>
        <SectionTitle>Order lines</SectionTitle>
        <SectionSubtitle>Items on this purchase order.</SectionSubtitle>
        <OrderTable
          headers={["Line", "Item", "Description", "Qty", "UoM", "Unit price", "Amount"]}
          rows={payload.lines.map((line, i) => ({
            key: `${line.itemCode}-${line.lineNo ?? i}`,
            cells: [
              { content: line.lineNo || String(i + 1), mono: true },
              { content: line.itemCode, mono: true },
              { content: line.description },
              { content: line.quantity, align: "right" as const },
              { content: line.uom },
              { content: line.unitPrice || "—", align: "right" as const },
              { content: line.lineAmount || "—", align: "right" as const }
            ]
          }))}
        />
        {payload.summary?.orderTotal ? (
          <p className="mt-3 text-right text-sm font-medium text-umerco-dark">
            Order total {payload.summary.orderTotal}
            {payload.currency ? ` ${payload.currency}` : ""}
          </p>
        ) : null}
      </section>

      <section className="border-t border-umerco-border pt-4">
        <SectionTitle>Technical</SectionTitle>
        <SectionSubtitle>Raw payload for troubleshooting and integrations.</SectionSubtitle>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-umerco-dark"
          onClick={() => setRawExpanded(!rawExpanded)}
        >
          {rawExpanded ? "Hide" : "Show"} canonical JSON
        </button>
        {rawExpanded ? (
          <pre className="mt-3 rounded-xl border border-umerco-border bg-umerco-canvas p-4 text-xs leading-relaxed text-umerco-dark">
            {JSON.stringify(detail.canonical_json_raw, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}

function DeljitDetailBody({
  detail,
  rawExpanded,
  setRawExpanded
}: {
  detail: ScheduleDetailResponse;
  rawExpanded: boolean;
  setRawExpanded: (v: boolean) => void;
}) {
  const { schedule, lines, message, canonical_parse_error, lines_consistent_with_message } = detail;
  if (!schedule) return null;

  const showSplitOrder = message !== null && lines_consistent_with_message === false;
  const showSingleOrderFromMessage = message !== null && lines_consistent_with_message !== false;
  const showSystemOrderOnly = !message && lines.length > 0;

  return (
    <div className="space-y-4">
      <section>
        <SectionTitle>Overview</SectionTitle>
        <SectionSubtitle>Portal record, trading partners, and schedule window.</SectionSubtitle>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
          <OverviewField label="Reference" mono>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span>{schedule.deljit_ref}</span>
              <SentDocBadges schedule={schedule} />
            </span>
          </OverviewField>
          <OverviewField label="Period">
            {schedule.period_start} to {schedule.period_end}
          </OverviewField>
          {schedule.release_date ? (
            <OverviewField label="Release date">{schedule.release_date}</OverviewField>
          ) : null}
          {message ? (
            <>
              <OverviewField label="Document" mono>
                {message.messageType}
              </OverviewField>
              <OverviewField label="Supplier" mono>
                {message.supplierCode}
              </OverviewField>
              <OverviewField label="Partner" mono>
                {message.tradingPartner}
              </OverviewField>
              <OverviewField label="Release (inbound)" mono>
                {formatInboundDateDisplay(message.payload.releaseDate)}
              </OverviewField>
              <OverviewField label="Period start (inbound)" mono>
                {formatInboundDateDisplay(message.payload.periodStart)}
              </OverviewField>
              <OverviewField label="Period end (inbound)" mono>
                {formatInboundDateDisplay(message.payload.periodEnd)}
              </OverviewField>
            </>
          ) : null}
        </dl>
      </section>

      {canonical_parse_error ? (
        <UmercoAlert variant="warning">
          <p className="font-medium">This stored message no longer matches the expected DELJIT format.</p>
          <p className="mt-2 break-all font-mono text-xs leading-relaxed text-umerco-muted">
            {canonical_parse_error}
          </p>
        </UmercoAlert>
      ) : null}

      {lines_consistent_with_message === false ? (
        <UmercoAlert variant="warning">
          <p className="font-medium">Order data differs between the stored message and the portal copy.</p>
          <p className="mt-1 text-umerco-muted">Both views are shown below for traceability.</p>
        </UmercoAlert>
      ) : null}

      <section>
        <SectionTitle>Order</SectionTitle>
        <SectionSubtitle>
          {showSplitOrder
            ? "Compare message payload with the normalized portal record."
            : showSingleOrderFromMessage
              ? "Schedule lines for this delivery release."
              : showSystemOrderOnly
                ? "Schedule lines stored for this release."
                : "No schedule lines for this release."}
        </SectionSubtitle>

        {showSingleOrderFromMessage && message ? (
          <OrderTable
            headers={["Part number", "Description", "Qty", "UoM", "Deliver by", "Facility"]}
            rows={message.payload.lines.map((line, i) => ({
              key: `${line.partNo}-${line.facility}-${i}`,
              cells: [
                { content: line.partNo, mono: true },
                { content: line.description },
                { content: String(line.qtyRequired), align: "right" as const },
                { content: line.uom },
                { content: formatDeliverByDisplay(line.deliverBy), mono: true },
                { content: line.facility, mono: true }
              ]
            }))}
          />
        ) : null}

        {showSplitOrder && message ? (
          <div className="mt-3 space-y-3">
            <p className="umerco-section-label">As received</p>
            <OrderTable
              headers={["Part number", "Description", "Qty", "UoM", "Deliver by", "Facility"]}
              rows={message.payload.lines.map((line, i) => ({
                key: `m-${line.partNo}-${line.facility}-${i}`,
                cells: [
                  { content: line.partNo, mono: true },
                  { content: line.description },
                  { content: String(line.qtyRequired), align: "right" as const },
                  { content: line.uom },
                  { content: formatDeliverByDisplay(line.deliverBy), mono: true },
                  { content: line.facility, mono: true }
                ]
              }))}
            />
            <p className="umerco-section-label">System record</p>
            <OrderTable
              headers={["Line ID", "Part number", "Description", "Qty", "UoM", "Deliver by", "Facility"]}
              rows={lines.map((line) => ({
                key: line.id,
                cells: [
                  { content: `${line.id.slice(0, 8)}…`, mono: true, small: true },
                  { content: line.part_no, mono: true },
                  { content: line.description ?? "—" },
                  { content: String(line.qty_required), align: "right" as const },
                  { content: line.uom },
                  { content: line.deliver_by, mono: true },
                  { content: line.facility, mono: true }
                ]
              }))}
            />
          </div>
        ) : null}

        {showSystemOrderOnly ? (
          <OrderTable
            headers={["Line ID", "Part number", "Description", "Qty", "UoM", "Deliver by", "Facility"]}
            rows={lines.map((line) => ({
              key: line.id,
              cells: [
                { content: `${line.id.slice(0, 8)}…`, mono: true, small: true },
                { content: line.part_no, mono: true },
                { content: line.description ?? "—" },
                { content: String(line.qty_required), align: "right" as const },
                { content: line.uom },
                { content: line.deliver_by, mono: true },
                { content: line.facility, mono: true }
              ]
            }))}
          />
        ) : null}

        {!showSingleOrderFromMessage && !showSplitOrder && !showSystemOrderOnly ? (
          <p className="mt-3 rounded-lg border border-dashed border-umerco-border bg-umerco-canvas px-4 py-4 text-center text-sm text-umerco-muted">
            No order lines on file.
          </p>
        ) : null}
      </section>

      <section className="border-t border-umerco-border pt-4">
        <SectionTitle>Technical</SectionTitle>
        <SectionSubtitle>Raw payload for troubleshooting and integrations.</SectionSubtitle>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-umerco-dark"
          onClick={() => setRawExpanded(!rawExpanded)}
        >
          {rawExpanded ? "Hide" : "Show"} canonical JSON
        </button>
        {rawExpanded ? (
          <pre className="mt-3 rounded-xl border border-umerco-border bg-umerco-canvas p-4 text-xs leading-relaxed text-umerco-dark">
            {JSON.stringify(detail.canonical_json_raw, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}

type OrderTableProps = {
  headers: string[];
  rows: {
    key: string;
    cells: {
      content: React.ReactNode;
      mono?: boolean;
      small?: boolean;
      align?: "right";
    }[];
  }[];
};

function OrderTable({ headers, rows }: OrderTableProps) {
  return (
    <div className={`mt-2 ${tableWrap}`}>
      <table className={tableBase}>
        <thead className="border-b border-umerco-border">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className={`${tableHeader} ${header === "Qty" ? "text-right" : ""}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key} className={`${trHover} ${tableRowClass(index)}`}>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={`${row.key}-${cellIndex}`}
                  className={`${tdBase} ${cell.mono ? "font-mono text-xs" : ""} ${cell.small ? "text-[11px] text-umerco-muted" : ""} ${cell.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {cell.content}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "pending" | "acknowledged" | "completed" | "invoice_sent" | "asn";
}) {
  const toneClass =
    tone === "pending"
      ? "text-umerco-dark"
      : tone === "acknowledged"
        ? "text-umerco-primary"
        : tone === "asn"
          ? "text-violet-700"
        : tone === "completed" || tone === "invoice_sent"
          ? "text-umerco-success"
          : "text-umerco-dark";

  const barClass =
    tone === "pending"
      ? "bg-umerco-muted"
      : tone === "acknowledged"
        ? "bg-umerco-primary"
        : tone === "asn"
          ? "bg-violet-600"
        : tone === "completed" || tone === "invoice_sent"
          ? "bg-umerco-success"
          : "bg-umerco-dark";

  return (
    <div className="schedule-stat-cell">
      <span className={`mb-3 block h-0.5 w-7 rounded-full ${barClass}`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-umerco-muted">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold tabular-nums leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}

function ScheduleActionLink({
  icon,
  label,
  to,
  variant,
  disabled,
  disabledTitle
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  variant: "primary" | "secondary" | "outline";
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const variantClass =
    variant === "primary" ? btnPrimary : variant === "outline" ? btnOutline : btnSecondary;

  if (disabled) {
    return (
      <span
        title={disabledTitle}
        aria-disabled="true"
        className={`${variantClass} h-10 w-full cursor-not-allowed gap-2 px-4 text-sm opacity-50`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <Link className={`${variantClass} h-10 w-full gap-2 px-4 text-sm transition-all duration-200 ease-out`} to={to}>
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
