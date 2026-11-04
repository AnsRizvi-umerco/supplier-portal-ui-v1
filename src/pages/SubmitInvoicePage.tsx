

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Field } from "@/components/forms/Field";
import { LoadingBlock, TableRowsLoader } from "@/components/umerco/LoadingBlock";
import { UmercoAlert } from "@/components/umerco/UmercoAlert";
import { UmercoSectionLabel } from "@/components/umerco/UmercoSectionLabel";
import { useToastMessage } from "@/hooks/useToastMessage";
import {
  btnDark,
  btnSecondary,
  card,
  tableBase,
  tableHeader,
  tableWrap,
  tdBase,
  trHover
} from "@/components/umerco/styles";
import { DocumentTypeGate } from "@/components/forms/DocumentTypeGate";
import { SubmitRequestResponsePanel } from "@/components/forms/SubmitRequestResponsePanel";
import { useDocumentSubmit } from "@/components/forms/useDocumentSubmit";
import { todayLocalIsoDateInput, toCompactYyyymmdd } from "@/lib/dates/compact";
import { isTestConnectionSearch, TEST_BUYER_NAME, TEST_FACILITY } from "@/lib/test-connection";
import { useSessionEdiCodes } from "@/lib/session-edi";
import { ScheduleFacilityFields } from "@/components/forms/ScheduleFacilityFields";
import { uniqueFacilitiesFromLines } from "@/lib/facilities";
import { mapInvoicePrefillFromOrder } from "@/lib/invoice-prefill";
import { useAuth } from "@/context/auth-context";
import { apiRoutes, http } from "@/api";

type InvoiceLine = {
  poLine: string;
  partNo: string;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
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
  purchaseOrder?: unknown;
  canonical_json_raw?: unknown;
  lines: ScheduleLinePrefill[];
  error?: string;
};

const EMPTY_LINE: InvoiceLine = {
  poLine: "001",
  partNo: "",
  description: "",
  qty: 0,
  uom: "EA",
  unitPrice: 0
};

const PAYMENT_TERMS = ["NET30", "NET45", "NET60", "NET90", "DUE_ON_RECEIPT"];
const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED"];
const UOM_OPTIONS = ["EA", "PC", "PCE", "KG", "LB", "M", "FT", "L", "GAL", "PCS", "SET"];
const INVOICE_TYPES = ["STANDARD", "CREDIT_NOTE", "DEBIT_NOTE", "PROFORMA"];
const INCOTERMS = ["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"];

export default function InvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTest = isTestConnectionSearch(searchParams);
  const scheduleId = isTest ? null : searchParams.get("schedule");
  const requiresSchedulePrefill = Boolean(scheduleId);
  const { user } = useAuth();
  const { supplierCode, tradingPartner } = useSessionEdiCodes();
  const supplierCompanyName = user?.full_name?.trim() || user?.business_partner_name?.trim() || "";
  const { pending, result, lastRequest, submit } = useDocumentSubmit();
  const userEditedRef = useRef(false);
  const appliedScheduleIdRef = useRef<string | null>(null);
  const [header, setHeader] = useState({
    supplierCode,
    supplierName: supplierCompanyName,
    supplierTaxId: "",
    supplierAddress: "",
    supplierApEmail: "",
    tradingPartner,
    buyerCompanyName: isTest ? TEST_BUYER_NAME : "",
    invoiceNo: "INV-2026-00123",
    invoiceDate: todayLocalIsoDateInput(),
    dueDate: "",
    poReference: "",
    asnReference: "",
    currency: "USD",
    paymentTerms: "NET30",
    facility: isTest ? TEST_FACILITY : "",
    invoiceType: "STANDARD",
    incoterm: "FCA",
    notes: ""
  });
  const [lines, setLines] = useState<InvoiceLine[]>(() =>
    requiresSchedulePrefill
      ? []
      : isTest
        ? [
            {
              poLine: "001",
              partNo: "LC-BATT-4680",
              description: "Battery Cell Module",
              qty: 250,
              uom: "EA",
              unitPrice: 200
            },
            {
              poLine: "002",
              partNo: "LC-MOT-2210",
              description: "Electric Drive Motor",
              qty: 75,
              uom: "EA",
              unitPrice: 2000
            },
            {
              poLine: "003",
              partNo: "LC-CTRL-8891",
              description: "Battery Management Controller",
              qty: 120,
              uom: "EA",
              unitPrice: 20000
            }
          ]
        : [
            {
              poLine: "001",
              partNo: "LC-BATT-4680",
              description: "Battery Cell Module",
              qty: 500,
              uom: "EA",
              unitPrice: 142.5
            }
          ]
  );
  const [scheduleFacilities, setScheduleFacilities] = useState<string[]>([]);
  const [prefillLoading, setPrefillLoading] = useState(requiresSchedulePrefill);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [shippingAmount, setShippingAmount] = useState(0);
  const isSchedulePrefillLocked = requiresSchedulePrefill && prefillLoading;

  useEffect(() => {
    setHeader((prev) => ({
      ...prev,
      supplierCode: prev.supplierCode.trim() || supplierCode,
      tradingPartner: prev.tradingPartner.trim() || tradingPartner,
      supplierName: prev.supplierName.trim() || supplierCompanyName
    }));
  }, [supplierCode, supplierCompanyName, tradingPartner]);

  useToastMessage(prefillError, "error");
  useToastMessage(prefillWarning, "warning");

  const computedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        lineTotal: Number((line.qty * line.unitPrice).toFixed(2))
      })),
    [lines]
  );
  const subtotal = useMemo(
    () => Number(computedLines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2)),
    [computedLines]
  );
  const taxAmount = useMemo(() => Number((subtotal * (taxRate / 100)).toFixed(2)), [subtotal, taxRate]);
  const totalAmount = useMemo(
    () => Number((subtotal + shippingAmount + taxAmount - discountAmount).toFixed(2)),
    [subtotal, shippingAmount, taxAmount, discountAmount]
  );

  const missingRequired =
    !header.tradingPartner.trim() ||
    !header.facility.trim() ||
    !header.invoiceNo.trim() ||
    !header.invoiceDate.trim() ||
    !header.poReference.trim() ||
    !header.supplierCode.trim() ||
    lines.length === 0 ||
    lines.some((line) => !line.partNo.trim() || line.qty <= 0 || line.unitPrice <= 0);

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
          setPrefillError("Could not load selected schedule details for invoice prefill.");
          return;
        }

        if (userEditedRef.current) {
          setPrefillWarning("Schedule prefill was skipped because you already started editing this invoice.");
          return;
        }

        const mapped = mapInvoicePrefillFromOrder(
          json.purchaseOrder ?? json.canonical_json_raw,
          supplierCompanyName
        );

        const fallbackLines = json.lines.map((line, index) => ({
          poLine: String(index + 1).padStart(3, "0"),
          partNo: line.part_no,
          description: line.description ?? "",
          qty: line.qty_required,
          uom: line.uom,
          unitPrice: 0
        }));
        const nextLines = mapped?.lines.length ? mapped.lines : fallbackLines;
        const facilities =
          mapped?.facilities.length ? mapped.facilities : uniqueFacilitiesFromLines(json.lines);

        setScheduleFacilities(facilities);
        setHeader((prev) => ({
          ...prev,
          supplierName: mapped?.supplierName || supplierCompanyName || prev.supplierName,
          supplierCode: mapped?.supplierCode || prev.supplierCode || supplierCode,
          tradingPartner: mapped?.tradingPartner || prev.tradingPartner || tradingPartner,
          buyerCompanyName: mapped?.buyerCompanyName || prev.buyerCompanyName,
          facility: mapped?.facility || facilities[0] || prev.facility,
          poReference: mapped?.poReference || json.schedule?.deljit_ref || prev.poReference,
          currency: mapped?.currency || prev.currency
        }));
        setLines(nextLines.length > 0 ? nextLines : [EMPTY_LINE]);

        if (nextLines.length === 0) {
          setPrefillWarning("Selected schedule has no lines. Add invoice lines manually.");
        }

        appliedScheduleIdRef.current = scheduleId;
      } catch {
        if (!cancelled) {
          setPrefillError("Could not load selected schedule details for invoice prefill.");
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
  }, [scheduleId, supplierCode, supplierCompanyName, tradingPartner]);

  const updateHeader = (field: keyof typeof header, value: string) => {
    userEditedRef.current = true;
    setHeader((prev) => ({ ...prev, [field]: value }));
  };

  const updateLine = (index: number, field: keyof InvoiceLine, value: string | number) => {
    userEditedRef.current = true;
    setLines((prev) => prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const addLine = () => {
    userEditedRef.current = true;
    setLines((prev) => [
      ...prev,
      {
        poLine: String(prev.length + 1).padStart(3, "0"),
        partNo: "",
        description: "",
        qty: 0,
        uom: "EA",
        unitPrice: 0
      }
    ]);
  };

  const removeLine = (index: number) => {
    userEditedRef.current = true;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const onSubmit = async () => {
    await submit({
      messageType: "INVOIC",
      supplierCode: header.supplierCode,
      tradingPartner: header.tradingPartner,
      payload: {
        invoiceNo: header.invoiceNo,
        invoiceDate: toCompactYyyymmdd(header.invoiceDate),
        dueDate: header.dueDate.trim() === "" ? "" : toCompactYyyymmdd(header.dueDate),
        poReference: header.poReference,
        asnReference: header.asnReference,
        deljitReference: "",
        currency: header.currency,
        paymentTerms: header.paymentTerms,
        invoiceType: header.invoiceType,
        incoterm: header.incoterm,
        facility: header.facility,
        buyerCompanyName: header.buyerCompanyName,
        supplierName: header.supplierName,
        supplierTaxId: header.supplierTaxId,
        supplierAddress: header.supplierAddress,
        supplierApEmail: header.supplierApEmail,
        notes: header.notes,
        subtotal: subtotal.toFixed(2),
        shippingAmount: shippingAmount.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        lines: computedLines.map((line) => ({
          poLine: line.poLine,
          partNo: line.partNo,
          description: line.description,
          qty: String(line.qty),
          uom: line.uom,
          unitPrice: line.unitPrice.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2)
        })),
        totalAmount: totalAmount.toFixed(2)
      }
    });
  };

  const formatMoney = (amount: number) => `${header.currency} ${amount.toFixed(2)}`;

  return (
    <DocumentTypeGate messageType="INVOIC">
    <div className="w-full min-w-0 space-y-5 py-6">
      {isTest ? (
        <UmercoAlert variant="info">
          Test connection — sample invoice payload. Submit sends to your channel URL.
        </UmercoAlert>
      ) : null}
      <button
        type="button"
        onClick={() => navigate("/schedules")}
        className={`inline-flex items-center gap-2 ${btnSecondary} text-sm`}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Schedules
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <UmercoSectionLabel>Outbound Document</UmercoSectionLabel>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-umerco-dark sm:text-2xl">Submit Invoice</h1>
            <span className="rounded-full bg-umerco-primary-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-umerco-primary">
              Invoice
            </span>
          </div>
          <p className="mt-1 text-sm text-umerco-muted">
            Prepare an invoice for the buyer through IWHI integration.
          </p>
        </div>
        <span className="rounded-full bg-umerco-beige px-3 py-1 text-xs font-medium text-umerco-muted">
          Draft
        </span>
      </div>

      {prefillLoading ? (
        <LoadingBlock variant="banner" message="Loading selected schedule line items…" />
      ) : null}
      {!scheduleId ? (
        <UmercoAlert variant="info">
          Open this form from a delivery schedule to load the trading partner and line items.
        </UmercoAlert>
      ) : null}
      {(!header.supplierCode.trim() || !header.tradingPartner.trim()) && !prefillLoading ? (
        <UmercoAlert variant="warning">
          Supplier or company Mutually Defined is missing from the signed-in session. Sign in again
          as the supplier after those fields are saved.
        </UmercoAlert>
      ) : null}
      {requiresSchedulePrefill && !prefillLoading && !header.facility.trim() && !prefillError ? (
        <UmercoAlert variant="warning">
          Ship-to facility could not be loaded from the selected schedule.
        </UmercoAlert>
      ) : null}

      <fieldset
        disabled={isSchedulePrefillLocked}
        className={`space-y-5 ${isSchedulePrefillLocked ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className={`${card} p-5`}>
            <p className="umerco-section-label">From — Supplier</p>
            <div className="mt-4 grid gap-3">
              <Field label="Legal Name">
                <input
                  className="umerco-input text-sm"
                  value={header.supplierName}
                  onChange={(e) => updateHeader("supplierName", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Supplier Code">
                  <input
                    className="umerco-input-readonly font-mono text-sm"
                    value={header.supplierCode || "—"}
                    readOnly
                  />
                </Field>
                <Field label="Tax / VAT ID">
                  <input
                    className="umerco-input text-sm"
                    value={header.supplierTaxId}
                    onChange={(e) => updateHeader("supplierTaxId", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="AP Contact Email">
                <input
                  type="email"
                  className="umerco-input text-sm"
                  value={header.supplierApEmail}
                  onChange={(e) => updateHeader("supplierApEmail", e.target.value)}
                />
              </Field>
              <Field label="Remit-to Address">
                <textarea
                  rows={2}
                  className="umerco-input text-sm"
                  value={header.supplierAddress}
                  onChange={(e) => updateHeader("supplierAddress", e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className={`${card} p-5`}>
            <p className="umerco-section-label">To — Buyer</p>
            <div className="mt-4 space-y-3">
              <Field label="Buyer Company">
                <input className="umerco-input-readonly" value={header.buyerCompanyName || "—"} readOnly />
              </Field>
              <ScheduleFacilityFields
                primaryFacility={header.facility}
                allFacilities={scheduleFacilities}
              />
              <div className="rounded-lg border border-dashed border-umerco-border bg-umerco-canvas/60 px-3 py-2.5">
                <p className="text-xs text-umerco-muted">Trading partner</p>
                <p className="mt-0.5 font-mono text-sm text-umerco-dark">{header.tradingPartner || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h2 className="umerco-section-label">Invoice Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Field label="Invoice Number *">
              <input
                className="umerco-input text-sm"
                value={header.invoiceNo}
                onChange={(e) => updateHeader("invoiceNo", e.target.value)}
              />
            </Field>
            <Field label="Invoice Date *">
              <input
                type="date"
                className="umerco-input text-sm"
                value={header.invoiceDate}
                onChange={(e) => updateHeader("invoiceDate", e.target.value)}
              />
            </Field>
            <Field label="Due Date">
              <input
                type="date"
                className="umerco-input text-sm"
                value={header.dueDate}
                onChange={(e) => updateHeader("dueDate", e.target.value)}
              />
            </Field>
            <Field label="Invoice Type">
              <select
                className="umerco-input text-sm"
                value={header.invoiceType}
                onChange={(e) => updateHeader("invoiceType", e.target.value)}
              >
                {INVOICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment Terms">
              <select
                className="umerco-input text-sm"
                value={header.paymentTerms}
                onChange={(e) => updateHeader("paymentTerms", e.target.value)}
              >
                {PAYMENT_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                className="umerco-input text-sm"
                value={header.currency}
                onChange={(e) => updateHeader("currency", e.target.value)}
              >
                {[header.currency, ...CURRENCIES]
                  .filter((currency, index, all) => currency && all.indexOf(currency) === index)
                  .map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Incoterm">
              <select
                className="umerco-input text-sm"
                value={header.incoterm}
                onChange={(e) => updateHeader("incoterm", e.target.value)}
              >
                {INCOTERMS.map((incoterm) => (
                  <option key={incoterm} value={incoterm}>
                    {incoterm}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-6 border-t border-umerco-border pt-5">
            <h3 className="umerco-section-label">References</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="PO Reference *">
                <input
                  className="umerco-input text-sm"
                  value={header.poReference}
                  onChange={(e) => updateHeader("poReference", e.target.value)}
                />
              </Field>
              <Field label="ASN Reference">
                <input
                  className="umerco-input text-sm"
                  value={header.asnReference}
                  onChange={(e) => updateHeader("asnReference", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="umerco-section-label">Line Items</h2>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 ${btnSecondary} text-xs`}
              onClick={addLine}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add Line
            </button>
          </div>

          <div className={tableWrap}>
            <div className="overflow-x-auto">
                <table className={tableBase}>
                  <thead>
                    <tr>
                      <th className={`${tableHeader} w-12`}>#</th>
                      <th className={tableHeader}>Part Number</th>
                      <th className={tableHeader}>Description</th>
                      <th className={`${tableHeader} text-right`}>Qty</th>
                      <th className={tableHeader}>UOM</th>
                      <th className={`${tableHeader} text-right`}>Unit Price</th>
                      <th className={`${tableHeader} text-right`}>Line Total</th>
                      <th className={`${tableHeader} w-16`} />
                    </tr>
                  </thead>
                  <tbody>
                    {isSchedulePrefillLocked ? (
                      <TableRowsLoader colSpan={8} message="Loading line items from schedule…" />
                    ) : (
                    computedLines.map((line, idx) => (
                      <tr className={trHover} key={`${line.poLine}-${idx}`}>
                        <td className={`${tdBase} font-mono text-xs text-umerco-muted`}>{line.poLine}</td>
                        <td className={tdBase}>
                          <input
                            className="umerco-input py-1.5 text-sm"
                            value={line.partNo}
                            onChange={(e) => updateLine(idx, "partNo", e.target.value)}
                          />
                        </td>
                        <td className={tdBase}>
                          <input
                            className="umerco-input py-1.5 text-sm"
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                          />
                        </td>
                        <td className={tdBase}>
                          <input
                            type="number"
                            min={0}
                            className="umerco-input ml-auto w-24 py-1.5 text-right text-sm"
                            value={line.qty}
                            onChange={(e) => updateLine(idx, "qty", Number(e.target.value))}
                          />
                        </td>
                        <td className={tdBase}>
                          <select
                            className="umerco-input w-24 py-1.5 text-sm"
                            value={line.uom}
                            onChange={(e) => updateLine(idx, "uom", e.target.value)}
                          >
                            {[line.uom, ...UOM_OPTIONS]
                              .filter((uom, index, all) => uom && all.indexOf(uom) === index)
                              .map((uom) => (
                              <option key={uom} value={uom}>
                                {uom}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={tdBase}>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="umerco-input ml-auto w-28 py-1.5 text-right text-sm"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value))}
                          />
                        </td>
                        <td className={`${tdBase} text-right font-medium text-umerco-dark`}>
                          {formatMoney(line.lineTotal)}
                        </td>
                        <td className={`${tdBase} text-center`}>
                          {lines.length > 1 ? (
                            <button
                              type="button"
                              className="text-xs text-umerco-muted hover:text-red-600"
                              onClick={() => removeLine(idx)}
                              title="Remove line"
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </div>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="schedule-panel w-full max-w-xs space-y-2.5 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-umerco-muted">Subtotal</span>
                <span className="font-medium text-umerco-dark">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-umerco-muted">Shipping</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="umerco-input w-28 py-1.5 text-right text-sm"
                  value={shippingAmount}
                  onChange={(e) => {
                    userEditedRef.current = true;
                    setShippingAmount(Number(e.target.value));
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-umerco-muted">Discount</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="umerco-input w-28 py-1.5 text-right text-sm"
                  value={discountAmount}
                  onChange={(e) => {
                    userEditedRef.current = true;
                    setDiscountAmount(Number(e.target.value));
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-umerco-muted">Tax %</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="umerco-input w-28 py-1.5 text-right text-sm"
                  value={taxRate}
                  onChange={(e) => {
                    userEditedRef.current = true;
                    setTaxRate(Number(e.target.value));
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-umerco-muted">Tax Amount</span>
                <span className="font-medium text-umerco-dark">{formatMoney(taxAmount)}</span>
              </div>
              <div className="border-t border-umerco-border pt-2.5">
                <div className="flex items-center justify-between text-base font-semibold text-umerco-dark">
                  <span>Total Amount</span>
                  <span>{formatMoney(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <Field label="Additional Notes">
            <textarea
              rows={3}
              className="umerco-input text-sm"
              placeholder="Payment instructions, billing clarifications, or remarks"
              value={header.notes}
              onChange={(e) => updateHeader("notes", e.target.value)}
            />
          </Field>
        </div>

        <div className={`${card} flex flex-wrap items-center justify-between gap-4 p-4`}>
          <p className="text-xs text-umerco-muted">
            Fields marked with * are required. Ensure all line quantities and prices are greater than zero.
          </p>
          <button
            type="button"
            className={`${btnDark} px-5 py-2.5 text-sm font-semibold`}
            disabled={pending || missingRequired || isSchedulePrefillLocked}
            onClick={onSubmit}
          >
            {pending ? "Submitting…" : "Submit Invoice to IWHI"}
          </button>
        </div>
      </fieldset>

      <SubmitRequestResponsePanel lastRequest={lastRequest} result={result} />
    </div>
    </DocumentTypeGate>
  );
}
