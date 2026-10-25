"use client";

import { calculateSaleFinancialMetrics, type LocalData, type Sale } from "../lib/local-data";

export type SaleFilters = {
  type: string;
  declared: string;
  payment: string;
  from: string;
  to: string;
  sort: string;
};

export const defaultSaleFilters: SaleFilters = {
  type: "ALL",
  declared: "ALL",
  payment: "ALL",
  from: "",
  to: "",
  sort: "date-desc",
};

export function applySaleFilters(
  sales: Sale[],
  filters: SaleFilters,
  data: LocalData,
  paymentOf: (sale: Sale) => string,
) {
  const [key, direction] = filters.sort.split("-");
  const factor = direction === "asc" ? 1 : -1;
  const metric = (sale: Sale) => {
    const metrics = calculateSaleFinancialMetrics(sale, data);
    return (key === "profit" ? metrics.grossProfit : metrics.revenue) ?? 0;
  };
  return sales
    .filter((sale) => filters.type === "ALL" || sale.saleType === filters.type)
    .filter((sale) => filters.declared === "ALL" || sale.declared === filters.declared)
    .filter((sale) => filters.payment === "ALL" || paymentOf(sale) === filters.payment)
    .filter((sale) => !filters.from || sale.soldAt.slice(0, 10) >= filters.from)
    .filter((sale) => !filters.to || sale.soldAt.slice(0, 10) <= filters.to)
    .sort((a, b) => factor * (key === "date" ? a.soldAt.localeCompare(b.soldAt) : metric(a) - metric(b)));
}

export function SaleFiltersBar({
  filters,
  onChange,
}: {
  filters: SaleFilters;
  onChange: (filters: SaleFilters) => void;
}) {
  const set = (patch: Partial<SaleFilters>) => onChange({ ...filters, ...patch });
  const active = JSON.stringify(filters) !== JSON.stringify(defaultSaleFilters);
  return (
    <div className="tax-sales-filters sale-filters">
      <label className="form-field"><span>Tipo de venda</span>
        <select value={filters.type} onChange={(event) => set({ type: event.target.value })}>
          <option value="ALL">Todos</option>
          <option value="PRIVATE">Private</option>
          <option value="MARGIN">Margin</option>
          <option value="VAT23%">VAT 23%</option>
          <option value="VAT0%">VAT 0%</option>
        </select></label>
      <label className="form-field"><span>Declarado</span>
        <select value={filters.declared} onChange={(event) => set({ declared: event.target.value })}>
          <option value="ALL">Todos</option>
          <option value="YES">Sim</option>
          <option value="NO">Não</option>
          <option value="PRIVATE">Private</option>
        </select></label>
      <label className="form-field"><span>Pagamento</span>
        <select value={filters.payment} onChange={(event) => set({ payment: event.target.value })}>
          <option value="ALL">Todos</option>
          <option value="Pago">Pago</option>
          <option value="Parcial">Parcial</option>
          <option value="Por receber">Por receber</option>
        </select></label>
      <label className="form-field"><span>De</span>
        <input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} /></label>
      <label className="form-field"><span>Até</span>
        <input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} /></label>
      <label className="form-field"><span>Ordenar por</span>
        <select value={filters.sort} onChange={(event) => set({ sort: event.target.value })}>
          <option value="date-desc">Data (mais recente)</option>
          <option value="date-asc">Data (mais antiga)</option>
          <option value="revenue-desc">Venda (maior)</option>
          <option value="revenue-asc">Venda (menor)</option>
          <option value="profit-desc">Lucro (maior)</option>
          <option value="profit-asc">Lucro (menor)</option>
        </select></label>
      {active && (
        <button className="button button--small" type="button" onClick={() => onChange(defaultSaleFilters)}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}
