

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
import {
  isTestConnectionSearch,
  TEST_BUYER_NAME,
  TEST_DELJIT_REF,
  TEST_FACILITY
} from "@/lib/test-connection";
import { useSessionEdiCodes } from "@/lib/session-edi";
import { ScheduleFacilityFields } from "@/components/forms/ScheduleFacilityFields";
import { primaryFacilityFromLines, uniqueFacilitiesFromLines } from "@/lib/facilities";
import { mapAckPrefillFromOrder } from "@/lib/ack-prefill";
import { resolveBuyerDisplayName, type SchedulePrefillMessage } from "@/lib/trading-partners";
import { apiRoutes, http } from "@/api";

type ScheduleLine = {
  lineNo: string;
  partNo: string;
  description: string;
  qtyRequested: number;
  qtyAccepted: number;
  promisedDate: string;
  uom: string;
  unitPrice: string;
};

type ScheduleLinePrefill = {
  part_no: string;
  description: string | null;
  qty_required: number;
  uom: string;
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

const EMPTY_SCHEDULE_LINE: ScheduleLine = {
  lineNo: "001",
  partNo: "",
  description: "",
  qtyRequested: 0,
  qtyAccepted: 0,
  promisedDate: todayLocalIsoDateInput(),
  uom: "EA",
  unitPrice: "0.00"
};

export default function ScheduleAckPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isTest = isTestConnectionSearch(params);
  const scheduleId = isTest ? null : params.get("schedule");
  const requiresSchedulePrefill = Boolean(scheduleId);
  const { supplierCode, tradingPartner } = useSessionEdiCodes();
  const { pending, result, lastRequest, submit } = useDocumentSubmit();
  const userEditedRef = useRef(false);
  const appliedScheduleIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    supplierCode,
    supplierName: "XYZ Parts International Ltd.",
    tradingPartner,
    buyerCompanyName: isTest ? TEST_BUYER_NAME : "",
    facility: isTest ? TEST_FACILITY : "",
    deljitReference: isTest ? TEST_DELJIT_REF : params.get("deljitRef") ?? params.get("scheduleRef") ?? "",
    poNumber: "",
    poDate: "",
    currency: "USD",
    buyerId: "",
    vendorId: "",
    responseDate: todayLocalIsoDateInput(),
    responseCode: "AC",
    scope: "FULL",
    note: ""
  });
  const [lines, setLines] = useState<ScheduleLine[]>(() =>
    requiresSchedulePrefill
      ? []
      : [
          {
            lineNo: "001",
            partNo: "LC-BATT-4680",
            description: "Battery Cell Module",
            qtyRequested: 500,
            qtyAccepted: 500,
            promisedDate: todayLocalIsoDateInput(),
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
    setForm((prev) => ({
      ...prev,
      supplierCode,
      tradingPartner
    }));
  }, [supplierCode, tradingPartner]);

  useToastMessage(prefillError, "error");
  useToastMessage(prefillWarning, "warning");

  const missingRequired =
    !form.tradingPartner.trim() ||
    !form.facility.trim() ||
    !form.deljitReference.trim() ||
    !form.responseDate.trim() ||
    !form.responseCode.trim() ||
    ((form.responseCode === "IB" || form.responseCode === "RJ") && !form.note.trim()) ||
    (form.scope === "PARTIAL" &&
      lines.some(
        (line) => !line.partNo.trim() || line.qtyAccepted < 0 || !line.promisedDate.trim()
      ));

  const payloadLines = useMemo(
    () =>
      lines.map((line) => ({
        lineNo: line.lineNo,
        partNo: line.partNo,
        description: line.description.trim() || line.partNo,
        qtyRequested: String(Math.max(0, Math.floor(Number(line.qtyRequested)) || 0)),
        qtyAccepted: String(Math.max(0, Math.floor(Number(line.qtyAccepted)) || 0)),
        promisedDate: toCompactYyyymmdd(line.promisedDate),
        uom: line.uom,
        unitPrice: line.unitPrice
      })),
    [lines]
  );

  const updateForm = (field: keyof typeof form, value: string) => {
    userEditedRef.current = true;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateLine = (idx: number, field: keyof ScheduleLine, value: string | number) => {
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

        if (!response.ok || !json.schedule) {
          setPrefillError("Could not load selected schedule details for acknowledgement prefill.");
          return;
        }

        if (userEditedRef.current) {
          setPrefillWarning("Schedule prefill was skipped because you already started editing this acknowledgement.");
          return;
        }

        const orderPrefill = mapAckPrefillFromOrder(json.purchaseOrder ?? json.canonical_json_raw);
        const nextLines =
          json.lines.length > 0
            ? json.lines.map((line, index) => {
                const matched =
                  orderPrefill?.lines.find((entry) => entry.partNo === line.part_no) ??
                  orderPrefill?.lines[index];
                return {
                  lineNo: matched?.poLine || String(index + 1).padStart(3, "0"),
                  partNo: line.part_no,
                  description: matched?.description || line.description?.trim() || line.part_no,
                  qtyRequested: line.qty_required,
                  qtyAccepted: line.qty_required,
                  promisedDate: toDateInputValue(line.deliver_by),
                  uom: matched?.uom || line.uom || "EA",
                  unitPrice: matched?.unitPrice || "0.00"
                };
              })
            : (orderPrefill?.lines ?? []).map((line) => ({
                lineNo: line.poLine,
                partNo: line.partNo,
                description: line.description,
                qtyRequested: line.qty,
                qtyAccepted: line.qty,
                promisedDate: todayLocalIsoDateInput(),
                uom: line.uom,
                unitPrice: line.unitPrice
              }));

        const facilities = uniqueFacilitiesFromLines(json.lines);
        const partner =
          json.message?.tradingPartner ?? json.schedule?.trading_partner ?? "";
        setScheduleFacilities(facilities);
        setForm((prev) => ({
          ...prev,
          deljitReference: json.schedule?.deljit_ref ?? prev.deljitReference,
          poNumber: orderPrefill?.poNumber || json.schedule?.deljit_ref || prev.poNumber,
          poDate: orderPrefill?.poDate || prev.poDate,
          currency: orderPrefill?.currency || prev.currency,
          buyerId: orderPrefill?.buyerId || prev.buyerId,
          vendorId: orderPrefill?.vendorId || prev.vendorId,
          buyerCompanyName: orderPrefill?.buyerCompanyName
            ? resolveBuyerDisplayName(orderPrefill.buyerCompanyName)
            : partner
              ? resolveBuyerDisplayName(partner)
              : prev.buyerCompanyName,
          supplierName: orderPrefill?.vendorName || prev.supplierName,
          facility: orderPrefill?.facility || primaryFacilityFromLines(json.lines)
        }));
        setLines(nextLines.length > 0 ? nextLines : [EMPTY_SCHEDULE_LINE]);
        if (nextLines.length === 0) {
          setPrefillWarning("Selected schedule has no lines. Add affected lines manually if needed.");
        }

        appliedScheduleIdRef.current = scheduleId;
      } catch {
        if (!cancelled) {
          setPrefillError("Could not load selected schedule details for acknowledgement prefill.");
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
      messageType: "APERAK",
      supplierCode: form.supplierCode,
      tradingPartner: form.tradingPartner,
      payload: {
        deljitReference: form.deljitReference,
        poNumber: form.poNumber.trim() || form.deljitReference,
        ...(form.poDate.trim() ? { poDate: toCompactYyyymmdd(form.poDate) } : {}),
        responseDate: toCompactYyyymmdd(form.responseDate),
        responseCode: form.responseCode,
        scope: form.scope,
        note: form.note,
        facility: form.facility,
        supplierName: form.supplierName,
        buyerCompanyName: form.buyerCompanyName,
        buyerId: form.buyerId.trim() || undefined,
        vendorId: form.vendorId.trim() || undefined,
        currency: form.currency || undefined,
        usageIndicator: isTest ? "T" : "P",
        lines: payloadLines
      }
    });
  };

  return (
    <DocumentTypeGate messageType="APERAK">
    <div className="w-full min-w-0 space-y-6 py-6">
        {isTest ? (
          <UmercoAlert variant="info">
            Test connection — sample schedule acknowledgement payload. Submit sends to your channel URL.
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
              Schedule Acknowledgement
            </h1>
            <p className="mt-1 text-sm text-umerco-muted">
              Confirm planning schedule reception and provide acceptance status
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
        {requiresSchedulePrefill && !prefillLoading && !form.tradingPartner.trim() && !prefillError ? (
          <div className="rounded-md border border-umerco-border bg-umerco-beige px-4 py-3 text-sm text-umerco-dark">
            Trading partner could not be loaded from the selected schedule.
          </div>
        ) : null}
        {requiresSchedulePrefill && !prefillLoading && !form.facility.trim() && !prefillError ? (
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
                value={form.supplierName}
                onChange={(e) => updateForm("supplierName", e.target.value)}
              />
              <input
                className="umerco-input-readonly font-mono text-sm"
                value={form.supplierCode || "—"}
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
                value={form.buyerCompanyName}
                readOnly
              />
              <ScheduleFacilityFields
                primaryFacility={form.facility}
                allFacilities={scheduleFacilities}
              />
              <div className="rounded-md border border-dashed border-umerco-border bg-umerco-canvas px-3 py-2 text-xs text-umerco-muted">
                Trading Partner:{" "}
                <span className="font-mono text-umerco-dark">{form.tradingPartner || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            Acknowledgement Details
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
            <input
              className="umerco-input text-sm"
              value={form.deljitReference}
              onChange={(e) => updateForm("deljitReference", e.target.value)}
              placeholder="DELJIT Reference *"
            />
            <input
              type="date"
              className="umerco-input text-sm"
              value={form.responseDate}
              onChange={(e) => updateForm("responseDate", e.target.value)}
            />
            <select
              className="umerco-input text-sm"
              value={form.responseCode}
              onChange={(e) => updateForm("responseCode", e.target.value)}
            >
              <option value="AC">Accepted (AC)</option>
              <option value="IB">Accepted With Changes (IB)</option>
              <option value="RJ">Rejected (RJ)</option>
            </select>
            <select
              className="umerco-input text-sm"
              value={form.scope}
              onChange={(e) => updateForm("scope", e.target.value)}
            >
              <option value="FULL">Full Acknowledgement</option>
              <option value="PARTIAL">Partial Acknowledgement</option>
            </select>
          </div>
        </div>

        {form.scope === "PARTIAL" ? (
          <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
            <h2 className="mb-4 umerco-section-label">
              Affected Schedule Lines
            </h2>
            <div className="overflow-x-auto rounded-md border border-umerco-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={tableHeader}>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Part #</th>
                    <th className="px-3 py-2 text-right">Qty Requested</th>
                    <th className="px-3 py-2 text-right">Qty Accepted</th>
                    <th className="px-3 py-2">Promised Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-umerco-border">
                  {isSchedulePrefillLocked ? (
                    <TableRowsLoader colSpan={5} message="Loading line items from schedule…" />
                  ) : (
                  lines.map((line, idx) => (
                    <tr key={`${line.lineNo}-${idx}`} className="hover:bg-umerco-beige">
                      <td className="px-3 py-2 font-mono text-xs text-umerco-muted">
                        {line.lineNo}
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
                          value={line.qtyRequested}
                          onChange={(e) =>
                            updateLine(idx, "qtyRequested", Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          className="w-28 rounded border border-umerco-border px-2 py-1 text-right"
                          value={line.qtyAccepted}
                          onChange={(e) =>
                            updateLine(idx, "qtyAccepted", Number(e.target.value))
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
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <label className="mb-2 block umerco-section-label">
            Response Note
          </label>
          <textarea
            rows={3}
            className="w-full umerco-input text-sm"
            value={form.note}
            onChange={(e) => updateForm("note", e.target.value)}
            placeholder="Required for changed or rejected acknowledgements"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-umerco-border bg-umerco-white p-4">
          <div className="text-xs text-umerco-muted">
            Note is required when response code is IB or RJ.
          </div>
          <button
            className={btnDark}
            disabled={pending || missingRequired || isSchedulePrefillLocked}
            onClick={onSubmit}
          >
            {pending ? "Submitting..." : "Submit Schedule Ack"}
          </button>
        </div>
        </fieldset>

        <SubmitRequestResponsePanel lastRequest={lastRequest} result={result} />
      </div>
    </DocumentTypeGate>
  );
}
