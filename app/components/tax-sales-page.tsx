"use client";

import { useMemo, useState } from "react";
import {
  calculateSaleFinancialMetrics,
  formatEur,
  sumMoney,
  type Sale,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { FinancialValue, PaymentStatusBadge, PrivacyValue } from "./workspace-shell";
import { SaleDetailsModal } from "./sale-details-modal";

const taxTypes = [
  { value: "VAT23%", label: "VAT 23%" },
  { value: "VAT0%", label: "VAT 0%" },
  { value: "MARGIN", label: "Margin" },
] as const;

type TaxType = (typeof taxTypes)[number]["value"];

function isTaxType(value: string): value is TaxType {
  return taxTypes.some((item) => item.value === value);
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day
    ? new Intl.DateTimeFormat("pt-PT").format(new Date(year, month - 1, day))
    : value;
}

function Money({ value, negative = false }: { value: number | null; negative?: boolean }) {
  if (value === null) return <>—</>;
  return (
    <FinancialValue value={negative ? -value : value}>
      <PrivacyValue>{formatEur(value)}</PrivacyValue>
    </FinancialValue>
  );
}

export function TaxSalesPage() {
  const { data, ready, error } = useLocalData();
  const [filter, setFilter] = useState<"ALL" | TaxType>("ALL");
  const [query, setQuery] = useState("");
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [declared, setDeclared] = useState("ALL");
  const [sort, setSort] = useState("date-desc");

  const taxSales = useMemo(() => {
    const value = (sale: Sale, key: string) => {
      const metrics = calculateSaleFinancialMetrics(sale, data);
      if (key === "revenue") return metrics.revenue ?? 0;
      if (key === "profit") return metrics.grossProfit ?? 0;
      return 0;
    };
    const [key, direction] = sort.split("-");
    const factor = direction === "asc" ? 1 : -1;
    return data.sales
      .filter((sale) => sale.status === "COMPLETED" && isTaxType(sale.saleType))
      .filter((sale) => !from || sale.soldAt.slice(0, 10) >= from)
      .filter((sale) => !to || sale.soldAt.slice(0, 10) <= to)
      .filter((sale) => declared === "ALL" || sale.declared === declared)
      .sort((a, b) => factor * (key === "date"
        ? a.soldAt.localeCompare(b.soldAt)
        : value(a, key) - value(b, key)));
  }, [data, from, to, declared, sort]);

  const summaries = useMemo(() => {
    const build = (sales: Sale[]) => {
      const metrics = sales.map((sale) => calculateSaleFinancialMetrics(sale, data));
      const sum = (pick: (item: (typeof metrics)[number]) => number | null) =>
        sumMoney(metrics.map((item) => pick(item) ?? 0));
      return {
        count: sales.length,
        revenue: sum((item) => item.revenue),
        grossProfit: sum((item) => item.grossProfit),
        vat: sum((item) => item.vatEstimate),
        netProfit: sum((item) => item.netProfitEstimate),
      };
    };
    return {
      ALL: build(taxSales),
      ...Object.fromEntries(
        taxTypes.map((type) => [type.value, build(taxSales.filter((sale) => sale.saleType === type.value))]),
      ),
    } as Record<"ALL" | TaxType, ReturnType<typeof build>>;
  }, [data, taxSales]);

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-PT");
    return taxSales
      .filter((sale) => filter === "ALL" || sale.saleType === filter)
      .filter((sale) => !search || `${sale.buyerName ?? ""} ${sale.notes} ${sale.lines
        .map((line) => `${line.productName ?? ""} ${line.sku ?? ""} ${line.size ?? ""}`)
        .join(" ")}`.toLocaleLowerCase("pt-PT").includes(search));
  }, [filter, query, taxSales]);

  const current = summaries[filter];

  return (
    <div className="page-stack stock-page tax-sales-page">
      <header className="stock-page__header">
        <div>
          <div className="eyebrow">GESTÃO DE VENDAS</div>
          <h1>Vendas VAT e Margin</h1>
          <p>Vendas concluídas dos tipos VAT 23%, VAT 0% e Margin. As vendas pendentes só aparecem aqui depois de concluídas.</p>
        </div>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}

      <div className="tax-sales-tabs" role="tablist" aria-label="Filtrar por tipo">
        {[{ value: "ALL" as const, label: "Todas" }, ...taxTypes].map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            className={`tax-sales-tab${filter === item.value ? " tax-sales-tab--active" : ""}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>{ready ? summaries[item.value].count : "…"}</span>
          </button>
        ))}
      </div>

      <section className="tax-sales-filters" aria-label="Filtros">
        <label className="form-field"><span>De</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="form-field"><span>Até</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="form-field"><span>Declarado</span>
          <select value={declared} onChange={(event) => setDeclared(event.target.value)}>
            <option value="ALL">Todos</option>
            <option value="YES">Sim</option>
            <option value="NO">Não</option>
          </select></label>
        <label className="form-field"><span>Ordenar por</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="date-desc">Data (mais recente)</option>
            <option value="date-asc">Data (mais antiga)</option>
            <option value="revenue-desc">Venda (maior)</option>
            <option value="revenue-asc">Venda (menor)</option>
            <option value="profit-desc">Lucro (maior)</option>
            <option value="profit-asc">Lucro (menor)</option>
          </select></label>
        {(from || to || declared !== "ALL" || sort !== "date-desc") && (
          <button className="button button--small" type="button"
            onClick={() => { setFrom(""); setTo(""); setDeclared("ALL"); setSort("date-desc"); }}>
            Limpar filtros
          </button>
        )}
      </section>

      <section className="stock-summary tax-sales-summary" aria-label="Estatísticas">
        <div><span>Vendas</span><strong>{ready ? current.count : "…"}</strong></div>
        <div><span>Faturação</span><strong>{ready ? <Money value={current.revenue} /> : "…"}</strong></div>
        <div><span>Lucro bruto</span><strong>{ready ? <Money value={current.grossProfit} /> : "…"}</strong></div>
        <div><span>IVA estimado</span><strong>{ready ? <Money value={current.vat} negative /> : "…"}</strong></div>
        <div><span>Lucro líquido estimado</span><strong>{ready ? <Money value={current.netProfit} /> : "…"}</strong></div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top">
          <div><h2>Histórico</h2><p>{rows.length} registos</p></div>
          <input
            className="table-search"
            type="search"
            aria-label="Pesquisar vendas"
            placeholder="Pesquisar comprador, SKU ou produto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="table-wrap pending-sales-table-wrap">
          <table className="data-table tax-sales-table">
            <thead>
              <tr>
                <th>Data</th><th>SKU / Nome</th><th>Tam.</th><th>Comprador</th><th>Tipo</th>
                <th>Custo</th><th>Venda</th><th>Lucro bruto</th><th>IVA estimado</th>
                <th>Lucro final</th><th>Pagamento</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!ready
                ? <tr><td className="table-empty" colSpan={12}>A carregar vendas…</td></tr>
                : rows.length
                  ? rows.map((sale) => {
                    const financials = calculateSaleFinancialMetrics(sale, data);
                    return <tr key={sale.id}>
                      <td>{formatDate(sale.soldAt)}</td>
                      <td>
                        <strong>{sale.lines[0]?.sku || "—"}</strong>
                        <span className="pending-sale-product-detail">{sale.lines.map((line) => line.productName || "Produto").join(", ")}</span>
                      </td>
                      <td>{sale.lines.map((line) => line.size).filter(Boolean).join(", ") || "—"}</td>
                      <td>{sale.buyerName || "—"}</td>
                      <td>{taxTypes.find((type) => type.value === sale.saleType)?.label}</td>
                      <td><Money value={financials.cost} negative /></td>
                      <td><Money value={financials.revenue} /></td>
                      <td><Money value={financials.grossProfit} /></td>
                      <td><Money value={financials.vatEstimate} negative /></td>
                      <td><Money value={financials.netProfitEstimate} /></td>
                      <td><PaymentStatusBadge sale={sale} payments={data.payments} /></td>
                      <td><button className="button button--small" type="button" onClick={() => setDetailsSale(sale)}>Detalhes</button></td>
                    </tr>;
                  })
                  : <tr><td className="table-empty" colSpan={12}>
                    {query ? "Não foram encontradas vendas." : "Ainda não há vendas concluídas destes tipos."}
                  </td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detailsSale && <SaleDetailsModal sale={detailsSale} data={data} onClose={() => setDetailsSale(null)} />}
    </div>
  );
}
