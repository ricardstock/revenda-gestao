"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateProfitability,
  formatEur,
  localDateString,
  saleOutstanding,
  saleTotal,
  sumMoney,
  type LocalData,
  type Sale,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { FinancialValue, PrivacyValue } from "./workspace-shell";

type StatisticsMode = "monthly" | "quarterly";

type PeriodMetrics = {
  sales: Sale[];
  revenue: number | null;
  cost: number | null;
  grossProfit: number | null;
  vat: number | null;
  shipping: number;
  expenses: number;
  refunds: number;
  netProfit: number | null;
  outstanding: number;
  grossMarginPercent: number | null;
  returnOnCostPercent: number | null;
  netMarginPercent: number | null;
};

function periodMetrics(data: LocalData, start: string, end: string): PeriodMetrics {
  const inPeriod = (date: string) => date.slice(0, 10) >= start && date.slice(0, 10) <= end;
  const sales = data.sales.filter((sale) => sale.status === "COMPLETED" && inPeriod(sale.soldAt));
  const profitability = calculateProfitability(data, sales, start, end);
  const periodSales = data.sales.filter((sale) =>
    (sale.status === "PENDING" || sale.status === "COMPLETED") && inPeriod(sale.soldAt),
  );
  return {
    sales,
    revenue: profitability.revenue,
    cost: profitability.cost,
    grossProfit: profitability.grossProfit,
    vat: profitability.vatEstimate,
    shipping: profitability.shipping,
    expenses: profitability.expenses,
    refunds: profitability.refunds,
    netProfit: profitability.netProfitEstimate,
    outstanding: sumMoney(periodSales.map((sale) => saleOutstanding(sale, data.payments))),
    grossMarginPercent: profitability.grossMarginPercent,
    returnOnCostPercent: profitability.returnOnCostPercent,
    netMarginPercent: profitability.netMarginPercent,
  };
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start: localDateString(start), end: localDateString(end) };
}

function quarterRange(year: number, quarter: number) {
  const firstMonth = (quarter - 1) * 3;
  return {
    start: localDateString(new Date(year, firstMonth, 1)),
    end: localDateString(new Date(year, firstMonth + 3, 0)),
  };
}

function StatMoney({ value }: { value: number | null }) {
  if (value === null) return <>—</>;
  return <FinancialValue value={value}><PrivacyValue>{formatEur(value)}</PrivacyValue></FinancialValue>;
}

function StatBar({ value, max, tone }: { value: number | null; max: number; tone: string }) {
  const width = value === null || value === 0 ? 0 : Math.max(1, (Math.abs(value) / max) * 100);
  return <div className={`dashboard-week-bar dashboard-week-bar--${tone}${value !== null && value < 0 ? " dashboard-week-bar--negative" : ""}`}><i style={{ width: `${width}%` }} /></div>;
}

function comparePeriodRows(data: LocalData, mode: StatisticsMode, year: number) {
  const count = mode === "monthly" ? 12 : 4;
  return Array.from({ length: count }, (_, index) => {
    const period = mode === "monthly"
      ? monthRange(year, index)
      : quarterRange(year, index + 1);
    const metrics = periodMetrics(data, period.start, period.end);
    return {
      ...metrics,
      key: index,
      label: mode === "monthly"
        ? new Intl.DateTimeFormat("pt-PT", { month: "short" }).format(new Date(year, index, 1))
        : `T${index + 1}`,
    };
  });
}

function topProducts(sales: Sale[], data: LocalData) {
  const rows = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const product = data.products.find((item) => item.id === line.productId);
      const sku = line.sku || product?.sku || "Sem SKU";
      const name = line.productName || product?.name || sku;
      const key = `${sku.toLocaleLowerCase("pt-PT")}::${line.size ?? product?.size ?? ""}`;
      const row = rows.get(key) ?? { sku, name, quantity: 0, revenue: 0 };
      row.quantity += line.quantity;
      row.revenue += line.quantity * line.unitPrice;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, revenue: sumMoney([row.revenue]) }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5);
}

function topCustomers(sales: Sale[], data: LocalData) {
  const rows = new Map<string, { name: string; sales: number; revenue: number }>();
  for (const sale of sales) {
    const customer = data.customers.find((item) => item.id === sale.customerId);
    const name = customer?.name || sale.buyerName?.trim();
    if (!name) continue;
    const key = sale.customerId || name.toLocaleLowerCase("pt-PT");
    const row = rows.get(key) ?? { name, sales: 0, revenue: 0 };
    row.sales += 1;
    row.revenue += saleTotal(sale);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, revenue: sumMoney([row.revenue]) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export function StatisticsPage({ mode }: { mode: StatisticsMode }) {
  const { data, ready, error } = useLocalData();
  const [period, setPeriod] = useState("");
  const quarterly = mode === "quarterly";

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      setPeriod(quarterly ? `${year}-Q${Math.floor(month / 3) + 1}` : `${year}-${String(month + 1).padStart(2, "0")}`);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [quarterly]);

  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  const month = Number(period.slice(5, 7)) - 1;
  const range = quarterly
    ? quarterRange(year, quarter)
    : monthRange(year, month);
  const selected = useMemo(
    () => period ? periodMetrics(data, range.start, range.end) : null,
    [data, period, range.end, range.start],
  );
  const comparison = useMemo(
    () => period ? comparePeriodRows(data, mode, year) : [],
    [data, mode, period, year],
  );
  const productRows = useMemo(() => selected ? topProducts(selected.sales, data) : [], [data, selected]);
  const customerRows = useMemo(() => selected ? topCustomers(selected.sales, data) : [], [data, selected]);
  const salesTypeRows = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const sale of selected?.sales ?? []) {
      grouped.set(sale.saleType, (grouped.get(sale.saleType) ?? 0) + saleTotal(sale));
    }
    return [...grouped.entries()]
      .map(([type, amount]) => ({
        type,
        amount: sumMoney([amount]),
        label: type.replace(/^VAT(\d+)%$/, "VAT $1%"),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [selected]);
  const chartMax = Math.max(1, ...comparison.flatMap((item) =>
    [item.revenue, item.grossProfit, item.netProfit]
      .filter((value): value is number => value !== null)
      .map(Math.abs),
  ));
  const productsMax = Math.max(1, ...productRows.map((item) => item.quantity));
  const customersMax = Math.max(1, ...customerRows.map((item) => item.revenue));
  const salesTypeMax = Math.max(1, ...salesTypeRows.map((item) => item.amount));
  const years = useMemo(() => {
    const available = new Set<number>([new Date().getFullYear()]);
    for (const date of [
      ...data.sales.map((sale) => sale.soldAt),
      ...data.expenses.map((expense) => expense.incurredAt),
      ...data.refunds.map((refund) => refund.refundedAt),
    ]) {
      const value = Number(date.slice(0, 4));
      if (Number.isInteger(value) && value > 1900) available.add(value);
    }
    return [...available].sort((a, b) => b - a);
  }, [data.expenses, data.refunds, data.sales]);
  const periodTitle = quarterly
    ? `${quarter}º trimestre de ${year}`
    : period ? new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(new Date(year, month, 1)) : "…";

  return (
    <div className="page-stack dashboard-page statistics-page">
      <header className="dashboard-heading">
        <div>
          <div className="eyebrow">ANÁLISE DO NEGÓCIO</div>
          <h1>{quarterly ? "Estatísticas trimestrais" : "Estatísticas mensais"}</h1>
          <p>Indicadores calculados a partir dos registos locais da plataforma.</p>
        </div>
        <label className="form-field statistics-period">
          <span>{quarterly ? "Trimestre" : "Mês"}</span>
          {quarterly
            ? <div className="statistics-period__quarter">
              <select aria-label="Selecionar trimestre" value={period.slice(-2)} onChange={(event) => setPeriod(`${year}-${event.target.value}`)}>
                {[1, 2, 3, 4].map((number) => <option key={number} value={`Q${number}`}>T{number}</option>)}
              </select>
              <select aria-label="Selecionar ano" value={String(year || "")} onChange={(event) => setPeriod(`${event.target.value}-${period.slice(-2)}`)}>
                {years.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            : <input type="month" aria-label="Selecionar mês" value={period} onChange={(event) => setPeriod(event.target.value)} />}
        </label>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      <section className="dashboard-metrics" aria-label={`Indicadores de ${periodTitle}`}>
        <StatCard label="Faturamento" value={selected?.revenue ?? null} detail="Vendas concluídas no período" ready={ready && Boolean(selected)} />
        <StatCard label="Custo dos produtos" value={selected?.cost === null || selected?.cost === undefined ? null : -selected.cost} detail="Custo de aquisição associado às vendas" ready={ready && Boolean(selected)} />
        <StatCard label="Lucro bruto" value={selected?.grossProfit ?? null} detail="Faturamento menos custo dos produtos" ready={ready && Boolean(selected)} />
        <StatCard label="IVA estimado" value={selected?.vat === null || selected?.vat === undefined ? null : -selected.vat} detail="Estimativa conforme o regime atual" ready={ready && Boolean(selected)} />
        <StatCard label="Envios" value={-(selected?.shipping ?? 0)} detail="Custos de envio das vendas" ready={ready && Boolean(selected)} />
        <StatCard label="Despesas e fees" value={-(selected?.expenses ?? 0)} detail="Despesas registadas no período" ready={ready && Boolean(selected)} />
        <StatCard label="Lucro líquido estimado" value={selected?.netProfit ?? null} detail="Após IVA estimado, envios, despesas e reembolsos" ready={ready && Boolean(selected)} />
        <article className="dashboard-metric">
          <span>Vendas concluídas</span>
          <strong>{ready && selected ? <PrivacyValue>{selected.sales.length}</PrivacyValue> : "…"}</strong>
          <small>no período selecionado</small>
        </article>
        <article className="dashboard-metric">
          <span>Margem bruta</span>
          <strong>{ready && selected ? selected.grossMarginPercent === null ? "—" : <PrivacyValue>{selected.grossMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>lucro bruto / faturamento</small>
        </article>
        <article className="dashboard-metric">
          <span>Rentabilidade sobre custo total</span>
          <strong>{ready && selected ? selected.returnOnCostPercent === null ? "—" : <PrivacyValue>{selected.returnOnCostPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>lucro líquido estimado / custo de compra, envios e despesas</small>
        </article>
        <article className="dashboard-metric">
          <span>Margem líquida estimada</span>
          <strong>{ready && selected ? selected.netMarginPercent === null ? "—" : <PrivacyValue>{selected.netMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>lucro líquido estimado / faturamento</small>
        </article>
        <StatCard label="Por receber" value={selected?.outstanding ?? 0} detail="Vendas pendentes ou concluídas no período" ready={ready && Boolean(selected)} />
      </section>

      <section className="content-panel dashboard-weekly">
        <div className="content-panel__top">
          <div><h2>{quarterly ? "Comparação trimestral" : "Comparação mensal"}</h2><p>Faturamento e lucro durante {year}</p></div>
        </div>
        <div className="dashboard-weekly__legend">
          <span><i className="dashboard-bar-key dashboard-bar-key--revenue" />Faturamento</span>
          <span><i className="dashboard-bar-key dashboard-bar-key--gross" />Lucro bruto</span>
          <span><i className="dashboard-bar-key dashboard-bar-key--net" />Lucro líquido estimado</span>
        </div>
        <div className="dashboard-weekly__rows statistics-chart">
          {comparison.map((item) => (
            <div className="dashboard-week-row" key={item.key}>
              <span className="dashboard-week-row__label">{item.label}</span>
              <div className="dashboard-week-row__bars">
                <StatBar value={item.revenue} max={chartMax} tone="revenue" />
                <StatBar value={item.grossProfit} max={chartMax} tone="gross" />
                <StatBar value={item.netProfit} max={chartMax} tone="net" />
              </div>
              <span className="dashboard-week-row__value"><PrivacyValue>{item.revenue === null ? "—" : formatEur(item.revenue)}</PrivacyValue></span>
            </div>
          ))}
        </div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top"><div><h2>Vendas por tipo</h2><p>Faturamento por regime no período</p></div></div>
        <div className="dashboard-ranking">
          {salesTypeRows.length ? salesTypeRows.map((item, index) => (
            <div className="dashboard-ranking__row" key={item.type}>
              <span className={`dashboard-legend-dot dashboard-legend-dot--${index % 4}`} />
              <div className="dashboard-ranking__main">
                <strong>{item.label}</strong>
                <div className="dashboard-ranking__track"><i style={{ width: `${(item.amount / salesTypeMax) * 100}%` }} /></div>
              </div>
              <span className="dashboard-ranking__value"><PrivacyValue>{formatEur(item.amount)}</PrivacyValue></span>
            </div>
          )) : <p className="dashboard-empty">Sem vendas concluídas neste período.</p>}
        </div>
      </section>

      <div className="dashboard-panels dashboard-panels--analytics">
        <section className="content-panel">
          <div className="content-panel__top"><div><h2>Top 5 SKUs</h2><p>Unidades vendidas neste período</p></div></div>
          <div className="dashboard-ranking">
            {productRows.length ? productRows.map((item, index) => (
              <div className="dashboard-ranking__row" key={`${item.sku}-${index}`}>
                <span className="dashboard-ranking__position">{index + 1}</span>
                <div className="dashboard-ranking__main">
                  <strong>{item.name}</strong><small>{item.sku}</small>
                  <div className="dashboard-ranking__track"><i style={{ width: `${(item.quantity / productsMax) * 100}%` }} /></div>
                </div>
                <span className="dashboard-ranking__value"><PrivacyValue>{item.quantity} un.</PrivacyValue></span>
              </div>
            )) : <p className="dashboard-empty">Sem vendas de produtos neste período.</p>}
          </div>
        </section>
        <section className="content-panel">
          <div className="content-panel__top"><div><h2>Top 5 clientes</h2><p>Por faturamento neste período</p></div></div>
          <div className="dashboard-ranking">
            {customerRows.length ? customerRows.map((item, index) => (
              <div className="dashboard-ranking__row" key={`${item.name}-${index}`}>
                <span className="dashboard-ranking__position">{index + 1}</span>
                <div className="dashboard-ranking__main">
                  <strong>{item.name}</strong><small><PrivacyValue>{item.sales} {item.sales === 1 ? "venda" : "vendas"}</PrivacyValue></small>
                  <div className="dashboard-ranking__track"><i style={{ width: `${(item.revenue / customersMax) * 100}%` }} /></div>
                </div>
                <span className="dashboard-ranking__value"><PrivacyValue>{formatEur(item.revenue)}</PrivacyValue></span>
              </div>
            )) : <p className="dashboard-empty">Sem vendas associadas a clientes neste período.</p>}
          </div>
        </section>
      </div>
      <p className="dashboard-footnote">IVA e lucro líquido são estimativas com as regras fiscais atualmente configuradas. Despesas da categoria IVA não são deduzidas novamente; confirma o tratamento fiscal e se os preços incluem IVA antes de usar estes valores para apuramento. Um traço (—) indica dados de preço ou custo incompletos.</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  ready,
}: {
  label: string;
  value: number | null;
  detail: string;
  ready: boolean;
}) {
  return (
    <article className="dashboard-metric">
      <span>{label}</span>
      <strong>{ready ? <StatMoney value={value} /> : "…"}</strong>
      <small>{detail}</small>
    </article>
  );
}
