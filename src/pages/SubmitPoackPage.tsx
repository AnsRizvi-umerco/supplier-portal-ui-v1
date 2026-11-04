

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingBlock, TableRowsLoader } from "@/components/umerco/LoadingBlock";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { btnDark, tableHeader } from "@/components/umerco/styles";
import { useToastMessage } from "@/hooks/useToastMessage";
import { DocumentTypeGate } from "@/components/forms/DocumentTypeGate";
import { SubmitRequestResponsePanel } from "@/components/forms/SubmitRequestResponsePanel";
import { useDocumentSubmit } from "@/components/forms/useDocumentSubmit";
import { todayLocalIsoDateInput, toCompactYyyymmdd, toDateInputValue } from "@/lib/dates/compact";
import { isTestConnectionSearch, TEST_BUYER_NAME, TEST_FACILITY } from "@/lib/test-connection";
import { useSessionEdiCodes } from "@/lib/session-edi";
import { ScheduleFacilityFields } from "@/components/forms/ScheduleFacilityFields";
import { primaryFacilityFromLines, uniqueFacilitiesFromLines } from "@/lib/facilities";
import { mapAckPrefillFromOrder } from "@/lib/ack-prefill";
import { resolveBuyerDisplayName, type SchedulePrefillMessage } from "@/lib/trading-partners";
import { apiRoutes, http } from "@/api";

type PoLine = {
  poLine: string;
  partNo: string;
  description: string;
  qtyOrdered: number;
  qtyConfirmed: number;
  promisedDate: string;
  responseCode: "AC" | "IB" | "RJ";
  reasonCode: string;
  uom: string;
  unitPrice: string;
};

type ScheduleLinePrefill = {
  part_no: string;
  qty_required: number;
  deliver_by: string;
  facility: string;
};

type SchedulePrefillResponse = {
  schedule: {
    id: string;
    deljit_ref: string;
    trading_partner?: string | null;
  } | null;
  message: SchedulePrefillMessage | null;
  purchaseOrder?: unknown;
  canonical_json_raw?: unknown;
  lines: ScheduleLinePrefill[];
  error?: string;
};

const EMPTY_PO_LINE: PoLine = {
  poLine: "001",
  partNo: "",
  description: "",
  qtyOrdered: 0,
  qtyConfirmed: 0,
  promisedDate: todayLocalIsoDateInput(),
  responseCode: "AC",
  reasonCode: "NONE",
  uom: "EA",
  unitPrice: "0.00"
};

const RESPONSE_OPTIONS: Array<{ value: PoLine["responseCode"]; label: string }> = [
  { value: "AC", label: "Accepted (AC)" },
  { value: "IB", label: "Accepted With Changes (IB)" },
  { value: "RJ", label: "Rejected (RJ)" }
];

const REASON_CODES = [
  "NONE",
  "CAPACITY_CONSTRAINT",
  "MATERIAL_SHORTAGE",
  "PRICE_DISCREPANCY",
  "DATE_CHANGE_REQUEST"
];

export default function PoAckPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTest = isTestConnectionSearch(searchParams);
  const scheduleId = isTest ? null : searchParams.get("schedule");
  const requiresSchedulePrefill = Boolean(scheduleId);
  const { supplierCode, tradingPartner } = useSessionEdiCodes();
  const { pending, result, lastRequest, submit } = useDocumentSubmit();
  const userEditedRef = useRef(false);
  const appliedScheduleIdRef = useRef<string | null>(null);
  const [header, setHeader] = useState({
    supplierCode,
    supplierName: "XYZ Parts International Ltd.",
    tradingPartner,
    buyerCompanyName: isTest ? TEST_BUYER_NAME : "",
    facility: isTest ? TEST_FACILITY : "",
    poReference: "PO-84201",
    poDate: "",
    currency: "USD",
    buyerId: "",
    vendorId: "",
    responseDate: todayLocalIsoDateInput(),
    note: ""
  });
  const [lines, setLines] = useState<PoLine[]>(() =>
    requiresSchedulePrefill
      ? []
      : [
          {
            poLine: "001",
            partNo: "LC-BATT-4680",
            description: "Battery Cell Module",
            qtyOrdered: 500,
            qtyConfirmed: 500,
            promisedDate: todayLocalIsoDateInput(),
            responseCode: "AC",
            reasonCode: "NONE",
            uom: "EA",
            unitPrice: "100.00"
          }
        ]
  );
  const [scheduleFacilities, setScheduleFacilities] = useState<string[]>([]);
  const [prefillLoading, setPrefillLoading] = useState(requiresSchedulePrefill);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const isSchedulePrefillLocked = requiresSchedulePrefill && prefillLoading;

  useEffect(() => {
    setHeader((prev) => ({
      ...prev,
      supplierCode,
      tradingPartner
    }));
  }, [supplierCode, tradingPartner]);

  useToastMessage(prefillError, "error");
  useToastMessage(prefillWarning, "warning");

  const payloadLines = useMemo(
    () =>
      lines.map((line) => ({
        poLine: line.poLine,
        partNo: line.partNo,
        description: line.description.trim() || line.partNo,
        qtyOrdered: String(Math.max(0, Math.floor(Number(line.qtyOrdered)) || 0)),
        qtyConfirmed: String(Math.max(0, Math.floor(Number(line.qtyConfirmed)) || 0)),
        promisedDate: toCompactYyyymmdd(line.promisedDate),
        responseCode: line.responseCode,
        reasonCode: line.reasonCode,
        uom: line.uom,
        unitPrice: line.unitPrice
      })),
    [lines]
  );

  const summary = useMemo(
    () => ({
      total: lines.length,
      accepted: lines.filter((line) => line.responseCode === "AC").length,
      changed: lines.filter((line) => line.responseCode === "IB").length,
      rejected: lines.filter((line) => line.responseCode === "RJ").length
    }),
    [lines]
  );

  const missingRequired =
    !header.tradingPartner.trim() ||
    !header.facility.trim() ||
    !header.poReference.trim() ||
    !header.responseDate.trim() ||
    lines.length === 0 ||
    lines.some(
      (line) =>
        !line.partNo.trim() ||
        line.qtyOrdered < 0 ||
        line.qtyConfirmed < 0 ||
        !line.promisedDate.trim() ||
        (line.responseCode !== "AC" && line.reasonCode === "NONE")
    );

  const updateHeader = (field: keyof typeof header, value: string) => {
    userEditedRef.current = true;
    setHeader((prev) => ({ ...prev, [field]: value }));
  };

  const updateLine = (idx: number, field: keyof PoLine, value: string | number) => {
    userEditedRef.current = true;
    setLines((prev) =>
      prev.map((line, index) => (index === idx ? { ...line, [field]: value } : line))
    );
  };

  useEffect(() => {
    if (!scheduleId) return;
    if (appliedScheduleIdRef.current === scheduleId) return;

    let cancelled = false;
    setPrefillLoading(true);
    setPrefillError(null);
    setPrefillWarning(null);

    const fetchSchedulePrefill = async () => {
      try {
        const response = await http.get(apiRoutes.schedules.byId(scheduleId));
        const json = (await response.json()) as SchedulePrefillResponse;
        if (cancelled) return;

        const schedule = json.schedule;
        if (!response.ok || !schedule) {
          setPrefillError("Could not load selected schedule details for PO acknowledgement prefill.");
          return;
        }

        if (userEditedRef.current) {
          setPrefillWarning("Schedule prefill was skipped because you already started editing this PO acknowledgement.");
          return;
        }

        const orderPrefill = mapAckPrefillFromOrder(json.purchaseOrder ?? json.canonical_json_raw);
        const nextLines =
          orderPrefill && orderPrefill.lines.length > 0
            ? orderPrefill.lines.map((line, index) => ({
                poLine: line.poLine,
                partNo: line.partNo,
                description: line.description,
                qtyOrdered: line.qty,
                qtyConfirmed: line.qty,
                promisedDate: toDateInputValue(json.lines[index]?.deliver_by || todayLocalIsoDateInput()),
                responseCode: "AC" as const,
                reasonCode: "NONE",
                uom: line.uom,
                unitPrice: line.unitPrice
              }))
            : json.lines.map((line, index) => ({
                poLine: String(index + 1).padStart(3, "0"),
                partNo: line.part_no,
                description: "",
                qtyOrdered: line.qty_required,
                qtyConfirmed: line.qty_required,
                promisedDate: toDateInputValue(line.deliver_by),
                responseCode: "AC" as const,
                reasonCode: "NONE",
                uom: "EA",
                unitPrice: "0.00"
              }));

        const facilities = uniqueFacilitiesFromLines(json.lines);
        const partner =
          json.message?.tradingPartner ?? json.schedule?.trading_partner ?? "";
        setScheduleFacilities(facilities);
        setHeader((prev) => ({
          ...prev,
          buyerCompanyName: orderPrefill?.buyerCompanyName
            ? resolveBuyerDisplayName(orderPrefill.buyerCompanyName)
            : partner
              ? resolveBuyerDisplayName(partner)
              : prev.buyerCompanyName,
          supplierName: orderPrefill?.vendorName || prev.supplierName,
          facility: orderPrefill?.facility || primaryFacilityFromLines(json.lines),
          poReference: orderPrefill?.poNumber || schedule.deljit_ref,
          poDate: orderPrefill?.poDate || prev.poDate,
          currency: orderPrefill?.currency || prev.currency,
          buyerId: orderPrefill?.buyerId || prev.buyerId,
          vendorId: orderPrefill?.vendorId || prev.vendorId
        }));
        setLines(nextLines.length > 0 ? nextLines : [EMPTY_PO_LINE]);
        if (nextLines.length === 0) {
          setPrefillWarning("Selected schedule has no lines. Add PO lines manually.");
        }

        appliedScheduleIdRef.current = scheduleId;
      } catch {
        if (!cancelled) {
          setPrefillError("Could not load selected schedule details for PO acknowledgement prefill.");
        }
      } finally {
        if (!cancelled) {
          setPrefillLoading(false);
        }
      }
    };

    fetchSchedulePrefill();
    return () => {
      cancelled = true;
    };
  }, [scheduleId]);

  const onSubmit = async () => {
    await submit({
      messageType: "ORDRSP",
      supplierCode: header.supplierCode,
      tradingPartner: header.tradingPartner,
      payload: {
        poReference: header.poReference,
        ...(header.poDate.trim() ? { poDate: toCompactYyyymmdd(header.poDate) } : {}),
        responseDate: toCompactYyyymmdd(header.responseDate),
        facility: header.facility,
        supplierName: header.supplierName,
        buyerCompanyName: header.buyerCompanyName,
        buyerId: header.buyerId.trim() || undefined,
        vendorId: header.vendorId.trim() || undefined,
        currency: header.currency || undefined,
        usageIndicator: isTest ? "T" : "P",
        note: header.note,
        lines: payloadLines
      }
    });
  };

  return (
    <DocumentTypeGate messageType="ORDRSP">
    <div className="w-full min-w-0 space-y-6 py-6">
        {isTest ? (
          <UmercoAlert variant="info">
            Test connection — sample PO acknowledgement payload. Submit sends to your channel URL.
          </UmercoAlert>
        ) : null}
        <button
          type="button"
          onClick={() => navigate("/schedules")}
          className="inline-flex items-center gap-2 rounded-lg border border-umerco-border bg-umerco-white px-3 py-2 text-sm font-medium text-umerco-dark hover:bg-umerco-beige inline-flex items-center gap-2"
        >
          <span aria-hidden>←</span>
          Back to Schedules
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-umerco-dark">
              PO Acknowledgement
            </h1>
            <p className="mt-1 text-sm text-umerco-muted">
              Respond to purchase orders with accepted, changed, or rejected lines
            </p>
          </div>
          <span className="rounded-full bg-umerco-tan px-3 py-1 text-xs font-medium text-umerco-dark">
            Draft
          </span>
        </div>
        {prefillLoading ? (
          <LoadingBlock variant="banner" message="Loading selected schedule line items…" />
        ) : null}
        {!scheduleId ? (
          <div className="rounded-md border border-umerco-border bg-umerco-tan/40 px-4 py-3 text-sm text-umerco-dark">
            Open this form from a delivery schedule to load the trading partner and line items.
          </div>
        ) : null}
        {requiresSchedulePrefill && !prefillLoading && !header.tradingPartner.trim() && !prefillError ? (
          <div className="rounded-md border border-umerco-border bg-umerco-beige px-4 py-3 text-sm text-umerco-dark">
            Trading partner could not be loaded from the selected schedule.
          </div>
        ) : null}
        {requiresSchedulePrefill && !prefillLoading && !header.facility.trim() && !prefillError ? (
          <div className="rounded-md border border-umerco-border bg-umerco-beige px-4 py-3 text-sm text-umerco-dark">
            Ship-to facility could not be loaded from the selected schedule.
          </div>
        ) : null}

        <fieldset
          disabled={isSchedulePrefillLocked}
          className={isSchedulePrefillLocked ? "pointer-events-none opacity-60" : undefined}
        >

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
            <p className="umerco-section-label">
              From — Supplier
            </p>
            <div className="mt-4 grid gap-3">
              <input
                className="umerco-input text-sm"
                value={header.supplierName}
                onChange={(e) => updateHeader("supplierName", e.target.value)}
                placeholder="Supplier legal name"
              />
              <input
                className="umerco-input-readonly font-mono text-sm"
                value={header.supplierCode || "—"}
                readOnly
              />
            </div>
          </div>

          <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
            <p className="umerco-section-label">
              To — Buyer
            </p>
            <div className="mt-4 grid gap-3">
              <input
                className="umerco-input-readonly"
                value={header.buyerCompanyName}
                readOnly
              />
              <ScheduleFacilityFields
                primaryFacility={header.facility}
                allFacilities={scheduleFacilities}
              />
              <div className="rounded-md border border-dashed border-umerco-border bg-umerco-canvas px-3 py-2 text-xs text-umerco-muted">
                Trading Partner:{" "}
                <span className="font-mono text-umerco-dark">{header.tradingPartner || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            Acknowledgement Details
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <input
              className="umerco-input text-sm"
              value={header.poReference}
              onChange={(e) => updateHeader("poReference", e.target.value)}
              placeholder="PO Reference *"
            />
            <input
              type="date"
              className="umerco-input text-sm"
              value={header.responseDate}
              onChange={(e) => updateHeader("responseDate", e.target.value)}
            />
            <div className="rounded-md border border-umerco-border bg-umerco-tan/40 px-3 py-2 text-xs text-umerco-dark">
              Response SLA: acknowledge within 24 hours.
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-umerco-border bg-umerco-white p-3 text-sm">
            <p className="umerco-section-label">Total Lines</p>
            <p className="mt-1 text-lg font-semibold text-umerco-dark">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-umerco-border bg-umerco-beige p-3 text-sm">
            <p className="umerco-section-label">Accepted</p>
            <p className="mt-1 text-lg font-semibold text-umerco-dark">{summary.accepted}</p>
          </div>
          <div className="rounded-lg border border-umerco-border bg-umerco-tan/50 p-3 text-sm">
            <p className="umerco-section-label">Changed</p>
            <p className="mt-1 text-lg font-semibold text-umerco-dark">{summary.changed}</p>
          </div>
          <div className="rounded-lg border border-umerco-border bg-umerco-canvas p-3 text-sm">
            <p className="umerco-section-label">Rejected</p>
            <p className="mt-1 text-lg font-semibold text-umerco-dark">{summary.rejected}</p>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            PO Lines
          </h2>
          <div className="overflow-x-auto rounded-md border border-umerco-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeader}>
                  <th className="px-3 py-2">PO Line</th>
                  <th className="px-3 py-2">Part Number</th>
                  <th className="px-3 py-2 text-right">Qty Ordered</th>
                  <th className="px-3 py-2 text-right">Qty Confirmed</th>
                  <th className="px-3 py-2">Promised Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-umerco-border">
                {isSchedulePrefillLocked ? (
                  <TableRowsLoader colSpan={7} message="Loading line items from schedule…" />
                ) : (
                lines.map((line, idx) => (
                  <tr key={`${line.poLine}-${idx}`} className="hover:bg-umerco-beige">
                    <td className="px-3 py-2 font-mono text-xs text-umerco-muted">
                      {line.poLine}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-umerco-border px-2 py-1"
                        value={line.partNo}
                        onChange={(e) => updateLine(idx, "partNo", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-28 rounded border border-umerco-border px-2 py-1 text-right"
                        value={line.qtyOrdered}
                        onChange={(e) =>
                          updateLine(idx, "qtyOrdered", Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-28 rounded border border-umerco-border px-2 py-1 text-right"
                        value={line.qtyConfirmed}
                        onChange={(e) =>
                          updateLine(idx, "qtyConfirmed", Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className="rounded border border-umerco-border px-2 py-1"
                        value={line.promisedDate}
                        onChange={(e) => updateLine(idx, "promisedDate", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-umerco-border bg-umerco-white px-2 py-1"
                        value={line.responseCode}
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "responseCode",
                            e.target.value as PoLine["responseCode"]
                          )
                        }
                      >
                        {RESPONSE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-umerco-border bg-umerco-white px-2 py-1"
                        value={line.reasonCode}
                        onChange={(e) => updateLine(idx, "reasonCode", e.target.value)}
                      >
                        {REASON_CODES.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <label className="mb-2 block umerco-section-label">
            Response Note
          </label>
          <textarea
            rows={3}
            className="w-full umerco-input text-sm"
            value={header.note}
            onChange={(e) => updateHeader("note", e.target.value)}
            placeholder="Provide context for changed or rejected lines"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-umerco-border bg-umerco-white p-4">
          <div className="text-xs text-umerco-muted">
            Provide reason codes for all changed or rejected lines.
          </div>
          <button
            className={btnDark}
            disabled={pending || missingRequired || isSchedulePrefillLocked}
            onClick={onSubmit}
          >
            {pending ? "Submitting..." : "Submit PO Ack"}
          </button>
        </div>
        </fieldset>

        <SubmitRequestResponsePanel lastRequest={lastRequest} result={result} />
      </div>
    </DocumentTypeGate>
  );
}
