

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoadingBlock, TableRowsLoader } from "@/components/umerco/LoadingBlock";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { btnDark, tableHeader } from "@/components/umerco/styles";
import { useToastMessage } from "@/hooks/useToastMessage";
import { Field } from "@/components/forms/Field";
import { DocumentTypeGate } from "@/components/forms/DocumentTypeGate";
import { SubmitRequestResponsePanel } from "@/components/forms/SubmitRequestResponsePanel";
import { useDocumentSubmit } from "@/components/forms/useDocumentSubmit";
import { toCompactYyyymmdd, todayLocalIsoDateInput } from "@/lib/dates/compact";
import { isTestConnectionSearch, TEST_BUYER_NAME, TEST_FACILITY } from "@/lib/test-connection";
import { useSessionEdiCodes } from "@/lib/session-edi";
import { apiRoutes, http } from "@/api";
import { ScheduleFacilityFields } from "@/components/forms/ScheduleFacilityFields";
import { primaryFacilityFromLines, uniqueFacilitiesFromLines } from "@/lib/facilities";
import { mapAsnPrefillFromOrder } from "@/lib/asn-prefill";
import { paths } from "@/paths";
import { resolveBuyerDisplayName, type SchedulePrefillMessage } from "@/lib/trading-partners";

type AsnLine = {
  poNumber: string;
  poLine: string;
  partNo: string;
  description: string;
  qtyShipped: number;
  uom: string;
  containerType: string;
  poDate: string;
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
    sent_docs?: string[];
  } | null;
  message: SchedulePrefillMessage | null;
  purchaseOrder?: unknown;
  canonical_json_raw?: unknown;
  lines: ScheduleLinePrefill[];
  error?: string;
};

type SettingsDefaults = {
  default_facility: string | null;
  default_uom: string | null;
  default_transport_mode: string | null;
  default_carrier: string | null;
};

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

const EMPTY_ASN_LINE: AsnLine = {
  poNumber: "",
  poLine: "001",
  partNo: "",
  description: "",
  qtyShipped: 0,
  uom: "EA",
  containerType: "PALLET",
  poDate: ""
};

/** Deterministic stand-in when no buyer PO exists in data (traceable for support / logs). */
function poPlaceholder(anchorRef: string, lineIndex: number): string {
  const safe = anchorRef
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 48) || "REF";
  return `PO-PENDING-${safe}-L${String(lineIndex + 1).padStart(3, "0")}`;
}

const TRANSPORT_MODES = ["TRUCK", "AIR", "SEA", "RAIL"];
const UOM_OPTIONS = ["EA", "KG", "LB", "M", "FT", "L", "GAL", "PCS", "SET"];
const CONTAINER_OPTIONS = ["PALLET", "CRATE", "BOX"];
const PACKAGE_TYPES = ["PALLET", "CARTON", "CRATE", "TOTE"];
const WEIGHT_UOMS = ["LB", "KG"];
const DIMENSION_UOMS = ["IN", "CM", "FT", "M"];

function optionalDecimal(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : undefined;
}

export default function SubmitAsnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTest = isTestConnectionSearch(searchParams);
  const scheduleId = isTest ? null : searchParams.get("schedule");
  const requiresSchedulePrefill = Boolean(scheduleId);
  const { supplierCode, tradingPartner } = useSessionEdiCodes();
  const { pending, result, lastRequest, submit } = useDocumentSubmit();
  const userEditedRef = useRef(false);
  const appliedScheduleIdRef = useRef<string | null>(null);
  const appliedSettingsRef = useRef(false);
  const [form, setForm] = useState({
    supplierName: "XYZ Parts International Ltd.",
    tradingPartner,
    buyerCompanyName: isTest ? TEST_BUYER_NAME : "",
    asnRef: `ASN-${new Date().getFullYear()}-0001`,
    shipDate: isTest ? todayLocalIsoDateInput() : "",
    shipTime: "10:00",
    transportMode: isTest ? "TRUCK" : "",
    carrier: isTest ? "TEST CARRIER" : "",
    trackingNo: isTest ? "TRK-TEST-001" : "",
    bolNumber: isTest ? "BOL-TEST-001" : "",
    shipToFacility: isTest ? TEST_FACILITY : "",
    shipToId: "",
    shipFromId: "",
    packageCount: "1",
    packageType: "PALLET",
    grossWeight: "",
    netWeight: "",
    weightUom: "LB",
    length: "",
    width: "",
    height: "",
    dimensionUom: "IN",
    notes: "",
    supplierCode
  });
  const [lines, setLines] = useState<AsnLine[]>(() =>
    requiresSchedulePrefill
      ? []
      : [
          {
            poNumber: "PO-84201",
            poLine: "001",
            partNo: "LC-BATT-4680",
            description: "Battery Cell Module",
            qtyShipped: 250,
            uom: "EA",
            containerType: "PALLET",
            poDate: "20260810"
          }
        ]
  );
  const [scheduleFacilities, setScheduleFacilities] = useState<string[]>([]);
  const [prefillLoading, setPrefillLoading] = useState(requiresSchedulePrefill);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [asnAlreadySent, setAsnAlreadySent] = useState(false);
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

  const payload = useMemo(() => {
    const pkg = Math.max(1, Math.floor(Number(form.packageCount)) || 1);
    return {
      supplierName: form.supplierName,
      buyerCompanyName: form.buyerCompanyName,
      asnRef: form.asnRef,
      shipDate: toCompactYyyymmdd(form.shipDate),
      shipTime: form.shipTime,
      transportMode: form.transportMode,
      carrier: form.carrier,
      trackingNo: form.trackingNo.trim() || "NO-TRACKING-YET",
      bolNumber: form.bolNumber.trim() || "NO-BOL-YET",
      shipToFacility: form.shipToFacility,
      shipToId: form.shipToId.trim() || undefined,
      shipFromId: form.shipFromId.trim() || undefined,
      usageIndicator: isTest ? "T" : "P",
      packageCount: String(pkg),
      packageType: form.packageType,
      grossWeight: optionalDecimal(form.grossWeight) ?? "0",
      netWeight: optionalDecimal(form.netWeight) ?? "0",
      weightUom: form.weightUom,
      length: optionalDecimal(form.length),
      width: optionalDecimal(form.width),
      height: optionalDecimal(form.height),
      dimensionUom:
        optionalDecimal(form.length) || optionalDecimal(form.width) || optionalDecimal(form.height)
          ? form.dimensionUom
          : undefined,
      notes: form.notes,
      lines: lines.map((line, idx) => ({
        poNumber: line.poNumber.trim() || poPlaceholder(form.asnRef.trim() || "ASN", idx),
        poLine: line.poLine,
        partNo: line.partNo,
        description: line.description.trim() || line.partNo.trim() || "Item",
        qtyShipped: String(Math.max(0, Math.floor(Number(line.qtyShipped)) || 0)),
        uom: line.uom,
        containerType: line.containerType,
        ...(line.poDate.trim() ? { poDate: line.poDate.trim() } : {})
      }))
    };
  }, [form, lines, isTest]);

  const onSubmit = async () => {
    await submit({
      messageType: "DESADV",
      supplierCode: form.supplierCode,
      tradingPartner: form.tradingPartner,
      payload
    });
  };

  const missingRequired =
    !form.tradingPartner.trim() ||
    !form.shipToFacility.trim() ||
    !form.asnRef.trim() ||
    !form.shipDate.trim() ||
    Number(form.packageCount) < 1 ||
    lines.length === 0 ||
    lines.some((line) => !line.partNo.trim() || Number(line.qtyShipped) <= 0);

  const updateForm = (key: keyof typeof form, value: string) => {
    userEditedRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateLine = <K extends keyof AsnLine>(idx: number, key: K, value: AsnLine[K]) => {
    userEditedRef.current = true;
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, [key]: value } : line)));
  };

  useEffect(() => {
    if (appliedSettingsRef.current) return;

    let cancelled = false;

    const fetchSettingsDefaults = async () => {
      try {
        const response = await http.get(apiRoutes.settings.root);
        if (cancelled || !response.ok) return;

        const settings = (await response.json()) as SettingsDefaults;
        if (cancelled) return;

        if (userEditedRef.current) return;

        appliedSettingsRef.current = true;

        setForm((prev) => ({
          ...prev,
          ...(isBlank(prev.shipToFacility) && !isBlank(settings.default_facility)
            ? { shipToFacility: settings.default_facility!.trim() }
            : {}),
          ...(isBlank(prev.transportMode) && !isBlank(settings.default_transport_mode)
            ? { transportMode: settings.default_transport_mode!.trim() }
            : {}),
          ...(isBlank(prev.carrier) && !isBlank(settings.default_carrier)
            ? { carrier: settings.default_carrier!.trim() }
            : {})
        }));

        setLines((prev) =>
          !isBlank(settings.default_uom)
            ? prev.map((line) =>
                isBlank(line.uom) ? { ...line, uom: settings.default_uom!.trim() } : line
              )
            : prev
        );
      } catch {
        // Fail silently — form keeps empty/demo initial state
      }
    };

    fetchSettingsDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scheduleId) return;
    if (appliedScheduleIdRef.current === scheduleId) return;

    let cancelled = false;
    setPrefillLoading(true);
    setPrefillError(null);
    setPrefillWarning(null);
    setAsnAlreadySent(false);

    const fetchSchedulePrefill = async () => {
      try {
        const response = await http.get(apiRoutes.schedules.byId(scheduleId));
        const json = (await response.json()) as SchedulePrefillResponse;
        if (cancelled) return;

        const schedule = json.schedule;
        if (!response.ok || !schedule) {
          setPrefillError("Could not load selected schedule details for ASN prefill.");
          return;
        }

        if (
          (schedule.sent_docs ?? []).some((doc) => doc.trim().toUpperCase() === "DESADV")
        ) {
          setAsnAlreadySent(true);
        }

        if (userEditedRef.current) {
          setPrefillWarning("Schedule prefill was skipped because you already started editing this ASN.");
          return;
        }

        const orderPrefill = mapAsnPrefillFromOrder(json.purchaseOrder ?? json.canonical_json_raw);
        const deljitRef = schedule.deljit_ref;
        const nextLines =
          orderPrefill && orderPrefill.lines.length > 0
            ? orderPrefill.lines.map((line) => ({
                poNumber: line.poNumber || deljitRef || poPlaceholder(deljitRef, 0),
                poLine: line.poLine,
                partNo: line.partNo,
                description: line.description,
                qtyShipped: line.qtyShipped,
                uom: line.uom,
                containerType: "PALLET",
                poDate: line.poDate
              }))
            : json.lines.map((line, index) => ({
                poNumber: deljitRef || poPlaceholder(deljitRef, index),
                poLine: String(index + 1).padStart(3, "0"),
                partNo: line.part_no,
                description: line.description?.trim() || line.part_no,
                qtyShipped: line.qty_required,
                uom: line.uom,
                containerType: "PALLET",
                poDate: ""
              }));

        const facilities = uniqueFacilitiesFromLines(json.lines);
        const partner =
          json.message?.tradingPartner ?? json.schedule?.trading_partner ?? "";
        setScheduleFacilities(facilities);
        setForm((prev) => ({
          ...prev,
          buyerCompanyName: orderPrefill?.buyerCompanyName
            ? resolveBuyerDisplayName(orderPrefill.buyerCompanyName)
            : partner
              ? resolveBuyerDisplayName(partner)
              : prev.buyerCompanyName,
          supplierName: orderPrefill?.vendorName || prev.supplierName,
          shipToFacility: orderPrefill?.shipToName || primaryFacilityFromLines(json.lines),
          shipToId: orderPrefill?.shipToId || prev.shipToId,
          shipFromId: orderPrefill?.vendorId || prev.shipFromId
        }));
        setLines(nextLines.length > 0 ? nextLines : [EMPTY_ASN_LINE]);
        if (nextLines.length === 0) {
          setPrefillWarning("Selected schedule has no lines. Add ASN lines manually.");
        }

        appliedScheduleIdRef.current = scheduleId;
      } catch {
        if (!cancelled) {
          setPrefillError("Could not load selected schedule details for ASN prefill.");
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

  return (
    <DocumentTypeGate messageType="DESADV">
    <div className="w-full min-w-0 space-y-6 py-6">
        {isTest ? (
          <UmercoAlert variant="info">
            Test connection — sample ASN payload. Submit sends to your channel URL.
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
            <h1 className="text-2xl font-bold tracking-tight text-umerco-dark">Submit ASN</h1>
            <p className="mt-1 text-sm text-umerco-muted">
              Prepare an advanced ship notice with shipment, transport, and package details
            </p>
          </div>
          <span className="rounded-full bg-umerco-tan px-3 py-1 text-xs font-medium text-umerco-dark">
            Draft
          </span>
        </div>
        {asnAlreadySent ? (
          <UmercoAlert variant="info">
            ASN already sent. The shipping label is in{" "}
            <Link className="font-medium text-umerco-primary underline" to={paths.labels}>
              Shipping Labels
            </Link>
            .
          </UmercoAlert>
        ) : null}
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
        {requiresSchedulePrefill && !prefillLoading && !form.shipToFacility.trim() && !prefillError ? (
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
                primaryFacility={form.shipToFacility}
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
            Shipment Identity
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="ASN Number *">
              <input
                className="umerco-input text-sm"
                value={form.asnRef}
                onChange={(e) => updateForm("asnRef", e.target.value)}
                placeholder="e.g. ASN-2026-0001"
              />
            </Field>
            <Field label="Ship Date *">
              <input
                type="date"
                className="umerco-input text-sm"
                value={form.shipDate}
                onChange={(e) => updateForm("shipDate", e.target.value)}
              />
            </Field>
            <Field label="Ship Time">
              <input
                type="time"
                className="umerco-input text-sm"
                value={form.shipTime}
                onChange={(e) => updateForm("shipTime", e.target.value)}
              />
            </Field>
            <Field label="Transport Mode *">
              <select
                className="umerco-input text-sm"
                value={form.transportMode}
                onChange={(e) => updateForm("transportMode", e.target.value)}
              >
                <option value="">Select mode</option>
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            Transport Details
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Carrier">
              <input
                className="umerco-input text-sm"
                value={form.carrier}
                onChange={(e) => updateForm("carrier", e.target.value)}
                placeholder="Carrier name"
              />
            </Field>
            <Field label="Tracking Number">
              <input
                className="umerco-input text-sm"
                value={form.trackingNo}
                onChange={(e) => updateForm("trackingNo", e.target.value)}
                placeholder="Tracking number"
              />
            </Field>
            <Field label="Bill of Lading">
              <input
                className="umerco-input text-sm"
                value={form.bolNumber}
                onChange={(e) => updateForm("bolNumber", e.target.value)}
                placeholder="BOL number"
              />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            Packaging Details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Package Count *">
              <input
                type="number"
                min={1}
                className="umerco-input text-sm"
                value={form.packageCount}
                onChange={(e) => updateForm("packageCount", e.target.value)}
                placeholder="e.g. 1"
              />
            </Field>
            <Field label="Package Type">
              <select
                className="umerco-input text-sm"
                value={form.packageType}
                onChange={(e) => updateForm("packageType", e.target.value)}
              >
                {PACKAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Gross Weight">
              <input
                type="number"
                min={0}
                step="any"
                className="umerco-input text-sm"
                value={form.grossWeight}
                onChange={(e) => updateForm("grossWeight", e.target.value)}
                placeholder="e.g. 250"
              />
            </Field>
            <Field label="Net Weight">
              <input
                type="number"
                min={0}
                step="any"
                className="umerco-input text-sm"
                value={form.netWeight}
                onChange={(e) => updateForm("netWeight", e.target.value)}
                placeholder="e.g. 240"
              />
            </Field>
            <Field label="Weight UOM">
              <select
                className="umerco-input text-sm"
                value={form.weightUom}
                onChange={(e) => updateForm("weightUom", e.target.value)}
              >
                {WEIGHT_UOMS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Length">
              <input
                type="number"
                min={0}
                step="any"
                className="umerco-input text-sm"
                value={form.length}
                onChange={(e) => updateForm("length", e.target.value)}
                placeholder="e.g. 48"
              />
            </Field>
            <Field label="Width">
              <input
                type="number"
                min={0}
                step="any"
                className="umerco-input text-sm"
                value={form.width}
                onChange={(e) => updateForm("width", e.target.value)}
                placeholder="e.g. 40"
              />
            </Field>
            <Field label="Height">
              <input
                type="number"
                min={0}
                step="any"
                className="umerco-input text-sm"
                value={form.height}
                onChange={(e) => updateForm("height", e.target.value)}
                placeholder="e.g. 36"
              />
            </Field>
            <Field label="Dimension UOM">
              <select
                className="umerco-input text-sm"
                value={form.dimensionUom}
                onChange={(e) => updateForm("dimensionUom", e.target.value)}
              >
                {DIMENSION_UOMS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-umerco-border bg-umerco-white p-5">
          <h2 className="mb-4 umerco-section-label">
            Line Items
          </h2>
          <div className="overflow-x-auto rounded-md border border-umerco-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeader}>
                  <th className="px-3 py-2">PO #</th>
                  <th className="px-3 py-2">PO Line</th>
                  <th className="px-3 py-2">Part #</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty Shipped</th>
                  <th className="px-3 py-2">UOM</th>
                  <th className="px-3 py-2">Container</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-umerco-border">
                {isSchedulePrefillLocked ? (
                  <TableRowsLoader colSpan={7} message="Loading line items from schedule…" />
                ) : (
                lines.map((line, idx) => (
                  <tr key={`${line.poLine}-${idx}`} className="hover:bg-umerco-beige">
                    <td className="px-3 py-2 font-mono text-xs text-umerco-muted">{line.poNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs text-umerco-muted">{line.poLine}</td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-umerco-border px-2 py-1"
                        value={line.partNo}
                        onChange={(e) => updateLine(idx, "partNo", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-umerco-border px-2 py-1"
                        value={line.description}
                        onChange={(e) => updateLine(idx, "description", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-28 rounded border border-umerco-border px-2 py-1 text-right"
                        value={line.qtyShipped}
                        onChange={(e) => updateLine(idx, "qtyShipped", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-umerco-border bg-umerco-white px-2 py-1"
                        value={line.uom}
                        onChange={(e) => updateLine(idx, "uom", e.target.value)}
                      >
                        {UOM_OPTIONS.map((uom) => (
                          <option key={uom} value={uom}>
                            {uom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-umerco-border bg-umerco-white px-2 py-1"
                        value={line.containerType}
                        onChange={(e) => updateLine(idx, "containerType", e.target.value)}
                      >
                        {CONTAINER_OPTIONS.map((container) => (
                          <option key={container} value={container}>
                            {container}
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
            Additional Notes
          </label>
          <textarea
            rows={3}
            className="w-full umerco-input text-sm"
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
            placeholder="Special shipment handling instructions"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-umerco-border bg-umerco-white p-4">
          <div className="text-xs text-umerco-muted">
            Ship date, package count, and positive shipped quantity are required.
          </div>
          <button
            className={btnDark}
            disabled={pending || missingRequired || isSchedulePrefillLocked || asnAlreadySent}
            onClick={onSubmit}
          >
            {pending ? "Submitting..." : "Submit ASN"}
          </button>
        </div>
        </fieldset>

        <SubmitRequestResponsePanel lastRequest={lastRequest} result={result} />
      </div>
    </DocumentTypeGate>
  );
}
