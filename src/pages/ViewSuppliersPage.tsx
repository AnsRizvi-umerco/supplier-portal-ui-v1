import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Copy, Pencil, Trash2 } from "lucide-react";
import { TableRowsLoader } from "@/components/umerco/LoadingBlock";
import { Pagination } from "@/components/umerco/Pagination";
import { supplierInitials, SupplierStatusBadge } from "@/components/suppliers/SupplierStatusBadge";
import { TableCheckbox } from "@/components/suppliers/TableCheckbox";
import { useToast } from "@/components/umerco/toast";
import { btnOutline, btnPrimary, btnSecondary, card } from "@/components/umerco/styles";
import { downloadSuppliersExcel } from "@/lib/export-suppliers-excel";
import {
  deleteSupplier,
  listSuppliers,
  type ManagedSupplier
} from "@/lib/master-portal-suppliers";
import { resolveOutboundApiUrl } from "@/lib/master-portal";
import { paths } from "@/paths";

const PAGE_SIZE_OPTIONS = [5, 10, 20];

function inboundUrlFor(supplier: ManagedSupplier): string {
  return resolveOutboundApiUrl(
    supplier.inbound_url,
    supplier.business_partner_id,
    supplier.id
  );
}

type StatusFilter = "all" | ManagedSupplier["status"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function statusLabel(
  t: (key: string) => string,
  status: ManagedSupplier["status"]
): string {
  if (status === "invited") return t("suppliers.statusInvited");
  if (status === "suspended") return t("suppliers.statusSuspended");
  return t("suppliers.statusActive");
}

export default function ViewSuppliersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<ManagedSupplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState<StatusFilter>("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ManagedSupplier[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const items = await listSuppliers();
        if (!cancelled) {
          setSuppliers(items);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t("suppliers.loadError");
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
  }, [t, toast]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target as Node)) {
        setBulkMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      const matchesSearch =
        !query ||
        supplier.full_name.toLowerCase().includes(query) ||
        supplier.email.toLowerCase().includes(query);
      const matchesStatus = appliedStatus === "all" || supplier.status === appliedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [suppliers, appliedSearch, appliedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pagedSuppliers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, safePage, pageSize]);

  const pageIds = useMemo(() => pagedSuppliers.map((supplier) => supplier.id), [pagedSuppliers]);
  const selectedOnPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = pageIds.length > 0 && selectedOnPageCount === pageIds.length;
  const somePageSelected = selectedOnPageCount > 0 && !allPageSelected;

  const selectedSuppliers = useMemo(
    () => suppliers.filter((supplier) => selectedIds.has(supplier.id)),
    [suppliers, selectedIds]
  );

  const hasActiveFilters = appliedSearch.trim().length > 0 || appliedStatus !== "all";

  const applyFilters = () => {
    setAppliedSearch(searchInput);
    setAppliedStatus(statusInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setStatusInput("all");
    setAppliedSearch("");
    setAppliedStatus("all");
    setPage(1);
  };

  const toggleSelected = (supplierId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(supplierId);
      else next.delete(supplierId);
      return next;
    });
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkMenuOpen(false);
  };

  const onCopyInboundUrl = async (supplier: ManagedSupplier) => {
    const url = inboundUrlFor(supplier);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("suppliers.inboundUrlCopied"));
    } catch {
      toast.error(t("suppliers.inboundUrlCopyFailed"));
    }
  };

  const exportSelected = () => {
    if (selectedSuppliers.length === 0) {
      toast.error(t("suppliers.exportEmpty"));
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadSuppliersExcel(
      selectedSuppliers,
      [
        { header: t("suppliers.fullName"), value: (supplier) => supplier.full_name },
        { header: t("suppliers.email"), value: (supplier) => supplier.email },
        { header: t("suppliers.status"), value: (supplier) => statusLabel(t, supplier.status) },
        {
          header: t("suppliers.firstLogin"),
          value: (supplier) => formatDate(supplier.first_login_at)
        },
        { header: t("suppliers.created"), value: (supplier) => formatDate(supplier.created_at) },
        {
          header: t("suppliers.mutuallyDefinedZz"),
          value: (supplier) => supplier.mutually_defined_zz ?? ""
        },
        { header: t("suppliers.duns"), value: (supplier) => supplier.duns ?? "" },
        { header: t("suppliers.as2"), value: (supplier) => supplier.as2 ?? "" },
        { header: t("suppliers.channelUrl"), value: (supplier) => supplier.channel_url ?? "" },
        { header: t("suppliers.inboundUrl"), value: (supplier) => inboundUrlFor(supplier) },
        {
          header: t("suppliers.documentTypes"),
          value: (supplier) => supplier.document_types.join(", ")
        }
      ],
      `suppliers-${dateStamp}.xlsx`
    );
    setBulkMenuOpen(false);
    toast.success(t("suppliers.exportSuccess", { count: selectedSuppliers.length }));
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete?.length) return;
    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        pendingDelete.map((supplier) => deleteSupplier(supplier.id))
      );
      const deletedIds = pendingDelete
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map((supplier) => supplier.id);
      const failedCount = pendingDelete.length - deletedIds.length;

      setSuppliers((current) => current.filter((item) => !deletedIds.includes(item.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of deletedIds) next.delete(id);
        return next;
      });
      setPendingDelete(null);

      if (failedCount > 0) {
        toast.error(
          t("suppliers.bulkDeletePartial", { deleted: deletedIds.length, failed: failedCount })
        );
      } else if (deletedIds.length > 1) {
        toast.success(t("suppliers.bulkDeleteSuccess", { count: deletedIds.length }));
      } else {
        toast.success(t("suppliers.deleteSuccess"));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("suppliers.deleteError");
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const bulkDisabled = selectedSuppliers.length === 0;
  const isBulkDelete = (pendingDelete?.length ?? 0) > 1;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 py-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="umerco-section-label">{t("nav.supplierManagement")}</p>
          <h2 className="mt-1 text-2xl font-semibold text-umerco-dark">{t("suppliers.viewTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-umerco-muted">{t("suppliers.viewSubtitle")}</p>
        </div>
        <Link to={paths.suppliers.create} className={`${btnPrimary} inline-flex h-10 items-center gap-2 px-4`}>
          + {t("nav.createSupplier")}
        </Link>
      </div>

      <section className={`${card} p-5`}>
        <div className="mb-5 flex flex-col gap-4 border-b border-umerco-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-umerco-dark">{t("suppliers.filterTitle")}</p>
            <p className="mt-0.5 text-sm text-umerco-muted">{t("suppliers.filterSubtitle")}</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label
                htmlFor="supplier-search"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-section text-umerco-muted"
              >
                {t("suppliers.filterSearchLabel")}
              </label>
              <input
                id="supplier-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyFilters();
                }}
                placeholder={t("suppliers.filterSearchPlaceholder")}
                className="umerco-input w-full py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="supplier-status"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-section text-umerco-muted"
              >
                {t("suppliers.status")}
              </label>
              <select
                id="supplier-status"
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value as StatusFilter)}
                className="umerco-input w-44 py-2 text-sm"
              >
                <option value="all">{t("suppliers.filterAllStatuses")}</option>
                <option value="invited">{t("suppliers.statusInvited")}</option>
                <option value="active">{t("suppliers.statusActive")}</option>
                <option value="suspended">{t("suppliers.statusSuspended")}</option>
              </select>
            </div>

            <button type="button" className={`${btnPrimary} h-[42px] px-4`} onClick={applyFilters}>
              {t("suppliers.applyFilters")}
            </button>

            {hasActiveFilters ? (
              <button type="button" className={`${btnOutline} h-[42px] px-4`} onClick={clearFilters}>
                {t("suppliers.clearFilters")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {selectedSuppliers.length > 0 ? (
              <>
                <p className="text-sm font-medium text-umerco-dark">
                  {t("suppliers.selectedCount", { count: selectedSuppliers.length })}
                </p>
                <button
                  type="button"
                  className="text-sm font-medium text-umerco-muted underline-offset-2 hover:text-umerco-dark hover:underline"
                  onClick={clearSelection}
                >
                  {t("suppliers.clearSelection")}
                </button>
              </>
            ) : (
              <p className="text-sm text-umerco-muted">{t("suppliers.selectHint")}</p>
            )}
            {hasActiveFilters ? (
              <p className="text-xs text-umerco-muted">{t("suppliers.filtersActive")}</p>
            ) : null}
          </div>

          <div className="relative" ref={bulkMenuRef}>
            <button
              type="button"
              className={`${btnOutline} inline-flex h-10 items-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-50`}
              aria-haspopup="menu"
              aria-expanded={bulkMenuOpen}
              disabled={bulkDisabled}
              onClick={() => setBulkMenuOpen((open) => !open)}
            >
              {t("suppliers.bulkAction")}
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                className={`text-umerco-muted transition-transform ${bulkMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {bulkMenuOpen && !bulkDisabled ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-umerco-border bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setBulkMenuOpen(false);
                    setPendingDelete(selectedSuppliers);
                  }}
                >
                  {t("suppliers.bulkDelete")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-sm text-umerco-dark hover:bg-umerco-beige/60"
                  onClick={exportSelected}
                >
                  {t("suppliers.bulkExportExcel")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-umerco-border/80">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-umerco-beige/50">
                  <tr className="text-[11px] uppercase tracking-section text-umerco-muted">
                    <th className="w-12 px-2 py-2">
                      <TableCheckbox
                        checked={allPageSelected}
                        indeterminate={somePageSelected}
                        onChange={togglePageSelection}
                        label={t("suppliers.selectAll")}
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">{t("suppliers.tableOrganization")}</th>
                    <th className="px-4 py-3 font-semibold">{t("suppliers.status")}</th>
                    <th className="px-4 py-3 font-semibold">{t("suppliers.tableContact")}</th>
                    <th className="px-4 py-3 font-semibold">{t("suppliers.firstLogin")}</th>
                    <th className="px-4 py-3 font-semibold">{t("suppliers.created")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("suppliers.tableActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableRowsLoader colSpan={7} message={t("suppliers.loading")} />
                  ) : null}
                  {!loading && suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <p className="text-sm font-medium text-umerco-dark">{t("suppliers.emptyTitle")}</p>
                        <p className="mt-1 text-sm text-umerco-muted">{t("suppliers.empty")}</p>
                        <Link
                          to={paths.suppliers.create}
                          className={`${btnPrimary} mt-4 inline-flex h-10 items-center px-4`}
                        >
                          + {t("nav.createSupplier")}
                        </Link>
                      </td>
                    </tr>
                  ) : null}
                  {!loading && suppliers.length > 0 && filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <p className="text-sm font-medium text-umerco-dark">{t("suppliers.noMatchesTitle")}</p>
                        <p className="mt-1 text-sm text-umerco-muted">{t("suppliers.noMatches")}</p>
                        <button type="button" className={`${btnSecondary} mt-4 h-10 px-4`} onClick={clearFilters}>
                          {t("suppliers.clearFilters")}
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  {!loading && filteredSuppliers.length > 0
                    ? pagedSuppliers.map((supplier) => {
                    const selected = selectedIds.has(supplier.id);
                    return (
                      <tr
                        key={supplier.id}
                        className={`border-t border-umerco-border/70 transition-colors hover:bg-umerco-beige/40 ${
                          supplier.status === "suspended" ? "bg-red-50/30" : ""
                        } ${selected ? "bg-umerco-primary-soft/40" : ""}`}
                      >
                        <td className="w-12 px-2 py-2">
                          <TableCheckbox
                            checked={selected}
                            onChange={(checked) => toggleSelected(supplier.id, checked)}
                            label={t("suppliers.selectSupplier", { name: supplier.full_name })}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                                supplier.status === "suspended"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-umerco-primary-soft text-umerco-primary"
                              }`}
                            >
                              {supplierInitials(supplier.full_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-umerco-dark">{supplier.full_name}</p>
                              {supplier.status === "suspended" ? (
                                <p className="text-xs text-red-600">{t("suppliers.loginDisabled")}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <SupplierStatusBadge status={supplier.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="min-w-[180px]">
                            <p className="text-umerco-dark">{supplier.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-umerco-muted">
                          {formatDate(supplier.first_login_at)}
                        </td>
                        <td className="px-4 py-3.5 text-umerco-muted">{formatDate(supplier.created_at)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className={`${btnOutline} inline-flex h-9 items-center gap-1.5 px-3 text-sm`}
                              onClick={() => void onCopyInboundUrl(supplier)}
                              title={t("suppliers.copyInboundUrl")}
                            >
                              <Copy size={14} strokeWidth={1.75} />
                              {t("suppliers.copyInboundUrl")}
                            </button>
                            <Link
                              to={paths.suppliers.edit(supplier.id)}
                              className={`${btnOutline} inline-flex h-9 w-9 items-center justify-center p-0`}
                              title={t("suppliers.editAction")}
                              aria-label={t("suppliers.editAction")}
                            >
                              <Pencil size={15} strokeWidth={1.75} />
                            </Link>
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700 transition-colors hover:bg-red-50"
                              onClick={() => setPendingDelete([supplier])}
                              title={t("suppliers.deleteAction")}
                              aria-label={t("suppliers.deleteAction")}
                            >
                              <Trash2 size={15} strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                    : null}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safePage}
              pageSize={pageSize}
              totalItems={loading ? 0 : filteredSuppliers.length}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              itemLabel={t("suppliers.supplierCountLabel")}
            />
          </div>
        )}
      </section>

      {pendingDelete?.length ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-umerco-border bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-supplier-title"
          >
            <h2 id="delete-supplier-title" className="text-lg font-semibold text-umerco-dark">
              {isBulkDelete ? t("suppliers.bulkDeleteTitle") : t("suppliers.deleteTitle")}
            </h2>
            <p className="mt-2 text-sm text-umerco-muted">
              {isBulkDelete
                ? t("suppliers.bulkDeleteBody", { count: pendingDelete.length })
                : t("suppliers.deleteBody", { name: pendingDelete[0].full_name })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className={btnOutline}
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
              >
                {t("suppliers.cancel")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                disabled={deleting}
                onClick={() => void onConfirmDelete()}
              >
                {deleting
                  ? t("suppliers.deleting")
                  : isBulkDelete
                    ? t("suppliers.bulkDeleteConfirm", { count: pendingDelete.length })
                    : t("suppliers.deleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
