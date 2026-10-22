"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  calculateProfitability,
  formatEur,
  localDateString,
  saleOutstanding,
  saleTotal,
  sumMoney,
} from "../lib/local-data";
import { useLocalData } from "../components/local-data-provider";
import { FinancialValue, PrivacyValue } from "../components/workspace-shell";

type DashboardGoals = {
  profit: number;
  revenue: number;
  sales: number;
};

type GoalDraft = {
  profit: string;
  revenue: string;
  sales: string;
};

type WeeklyMetrics = {
  label: string;
  start: string;
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
};

const GOALS_STORAGE_KEY = "revenda-gestao.dashboard-goals.v1";
const saleTypeLabels: Record<string, string> = {
  PRIVATE: "Private",
  MARGIN: "Margin",
  "VAT23%": "VAT",
  "VAT0%": "VAT 0%",
};
const emptyGoals: DashboardGoals = { profit: 0, revenue: 0, sales: 0 };

function localDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekStart(date: Date) {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function shortDate(value: string) {
  const date = localDate(value);
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit" }).format(date);
}

function validGoals(value: unknown): value is DashboardGoals {
  if (!value || typeof value !== "object") return false;
  const goals = value as Record<string, unknown>;
  return ["profit", "revenue", "sales"].every((key) => {
    const number = goals[key];
    return typeof number === "number" && Number.isFinite(number) && number >= 0;
  });
}

function progress(value: number, goal: number) {
  return goal > 0 ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;
}

function DashboardMoney({ value }: { value: number }) {
  return (
    <FinancialValue value={value}>
      <PrivacyValue>{formatEur(value)}</PrivacyValue>
    </FinancialValue>
  );
}

export function DashboardView() {
  const { data, ready, error } = useLocalData();
  const [today, setToday] = useState("");
  const [goals, setGoals] = useState<DashboardGoals>(emptyGoals);
  const [goalDraft, setGoalDraft] = useState<GoalDraft>({ profit: "", revenue: "", sales: "" });
  const [goalsReady, setGoalsReady] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [goalNotice, setGoalNotice] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setToday(localDateString(new Date())), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(GOALS_STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (!validGoals(parsed)) throw new Error("O formato das metas guardadas não é reconhecido.");
          setGoals(parsed);
          setGoalDraft({
            profit: String(parsed.profit),
            revenue: String(parsed.revenue),
            sales: String(parsed.sales),
          });
        }
      } catch (cause) {
        setGoalError(cause instanceof Error
          ? `Não foi possível carregar as metas locais: ${cause.message}`
          : "Não foi possível carregar as metas locais.");
      } finally {
        setGoalsReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const metrics = useMemo(() => {
    const completedSales = data.sales.filter((sale) => sale.status === "COMPLETED");
    const profitability = calculateProfitability(data, completedSales);
    const receivables = sumMoney(
      data.sales
        .filter((sale) => sale.status === "PENDING" || sale.status === "COMPLETED")
        .map((sale) => saleOutstanding(sale, data.payments)),
    );
    const stockValue = sumMoney(
      data.units
        .filter((unit) => unit.status === "READY_TO_SHIP")
        .map((unit) => unit.acquisitionCost),
    );
    const incomingValue = sumMoney(
      data.incomingProducts
        .filter((item) => !item.receivedAt)
        .map((item) => item.quantity * item.unitCost),
    );
    const currentMonthSales = today
      ? completedSales.filter((sale) => sale.soldAt.slice(0, 7) === today.slice(0, 7))
      : [];
    const currentMonthStart = today ? `${today.slice(0, 7)}-01` : "";
    const [year, month] = today ? today.slice(0, 7).split("-").map(Number) : [0, 0];
    const currentMonthEnd = today
      ? localDateString(new Date(year, month, 0))
      : "";
    const monthProfitability = today
      ? calculateProfitability(data, currentMonthSales, currentMonthStart, currentMonthEnd)
      : null;
    return {
      completedSales,
      ...profitability,
      receivables,
      stockValue,
      incomingValue,
      monthRevenue: monthProfitability?.revenue ?? null,
      monthProfit: monthProfitability?.netProfitEstimate ?? null,
      monthSales: currentMonthSales.length,
    };
  }, [data, today]);

  const salesByType = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const sale of metrics.completedSales) {
      grouped.set(sale.saleType, (grouped.get(sale.saleType) ?? 0) + saleTotal(sale));
    }
    return [...grouped.entries()]
      .map(([type, value]) => ({ type, value: sumMoney([value]), label: saleTypeLabels[type] ?? type }))
      .sort((a, b) => b.value - a.value);
  }, [metrics.completedSales]);

  const salesTypeGradient = useMemo(() => {
    const total = sumMoney(salesByType.map((item) => item.value));
    if (!total) return "conic-gradient(var(--surface-muted) 0% 100%)";
    const colors = ["var(--accent)", "var(--green)", "var(--amber)", "var(--danger)"];
    let end = 0;
    const slices = salesByType.map((item, index) => {
      const next = end + (item.value / total) * 100;
      const slice = `${colors[index % colors.length]} ${end}% ${next}%`;
      end = next;
      return slice;
    });
    return `conic-gradient(${slices.join(", ")})`;
  }, [salesByType]);

  const topSkus = useMemo(() => {
    const grouped = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();
    for (const sale of metrics.completedSales) {
      for (const line of sale.lines) {
        const product = data.products.find((item) => item.id === line.productId);
        const sku = line.sku || product?.sku || "Sem SKU";
        const key = `${sku.toLocaleLowerCase("pt-PT")}::${line.size ?? product?.size ?? ""}`;
        const current = grouped.get(key) ?? {
          sku,
          name: line.productName || product?.name || sku,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += line.quantity;
        current.revenue += line.quantity * line.unitPrice;
        grouped.set(key, current);
      }
    }
    return [...grouped.values()]
      .map((item) => ({ ...item, revenue: sumMoney([item.revenue]) }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5);
  }, [data.products, metrics.completedSales]);

  const topCustomers = useMemo(() => {
    const grouped = new Map<string, { name: string; sales: number; revenue: number }>();
    for (const sale of metrics.completedSales) {
      const customer = data.customers.find((item) => item.id === sale.customerId);
      const name = customer?.name || sale.buyerName?.trim();
      if (!name) continue;
      const key = sale.customerId || name.toLocaleLowerCase("pt-PT");
      const current = grouped.get(key) ?? { name, sales: 0, revenue: 0 };
      current.sales += 1;
      current.revenue += saleTotal(sale);
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .map((item) => ({ ...item, revenue: sumMoney([item.revenue]) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [data.customers, metrics.completedSales]);

  const weeklyMetrics = useMemo<WeeklyMetrics[]>(() => {
    if (!today) return [];
    const currentMonday = weekStart(localDate(today));
    return Array.from({ length: 8 }, (_, index) => {
      const startDate = new Date(currentMonday);
      startDate.setDate(startDate.getDate() - (7 - index) * 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const start = localDateString(startDate);
      const end = localDateString(endDate);
      const sales = metrics.completedSales.filter((sale) => {
        const date = sale.soldAt.slice(0, 10);
        return date >= start && date <= end;
      });
      const profitability = calculateProfitability(data, sales, start, end);
      return {
        label: `${shortDate(start)}–${shortDate(end)}`,
        start,
        revenue: profitability.revenue,
        grossProfit: profitability.grossProfit,
        netProfit: profitability.netProfitEstimate,
      };
    });
  }, [data, metrics.completedSales, today]);

  const weeklyScale = Math.max(
    1,
    ...weeklyMetrics.flatMap((item) =>
      [item.revenue, item.grossProfit, item.netProfit]
        .filter((value): value is number => value !== null)
        .map(Math.abs),
    ),
  );
  const skuScale = Math.max(1, ...topSkus.map((item) => item.quantity));
  const customerScale = Math.max(1, ...topCustomers.map((item) => item.revenue));

  function saveGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = {
      profit: Number(goalDraft.profit || 0),
      revenue: Number(goalDraft.revenue || 0),
      sales: Number(goalDraft.sales || 0),
    };
    if (Object.values(parsed).some((value) => !Number.isFinite(value) || value < 0) ||
      !Number.isInteger(parsed.sales)) {
      setGoalError("As metas têm de ser números iguais ou superiores a zero; a meta de vendas tem de ser inteira.");
      setGoalNotice("");
      return;
    }
    try {
      window.localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(parsed));
      setGoals(parsed);
      setGoalError("");
      setGoalNotice("Metas mensais guardadas neste browser.");
    } catch (cause) {
      setGoalError(cause instanceof Error
        ? `Não foi possível guardar as metas: ${cause.message}`
        : "Não foi possível guardar as metas.");
      setGoalNotice("");
    }
  }

  const monthLabel = today
    ? new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(localDate(today))
    : "este mês";

  return (
    <div className="page-stack dashboard-page">
      <header className="dashboard-heading">
        <div>
          <div className="eyebrow">PLATAFORMA DE GESTÃO</div>
          <h1>Dashboard</h1>
          <p>Visão geral do negócio e do desempenho das vendas.</p>
        </div>
        <span className="panel__badge">Dados neste browser</span>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}

      <section className="dashboard-metrics" aria-label="Indicadores do negócio">
        <article className="dashboard-metric">
          <span>Valor em stock</span>
          <strong>{ready ? <DashboardMoney value={metrics.stockValue} /> : "…"}</strong>
          <small>Custo de aquisição das unidades disponíveis</small>
        </article>
        <article className="dashboard-metric">
          <span>Valor por receber</span>
          <strong>{ready ? <DashboardMoney value={metrics.receivables} /> : "…"}</strong>
          <small>Vendas pendentes e concluídas, menos pagamentos</small>
        </article>
        <article className="dashboard-metric">
          <span>Produtos a caminho</span>
          <strong>{ready ? <DashboardMoney value={metrics.incomingValue} /> : "…"}</strong>
          <small>Custo dos artigos ainda não recebidos</small>
        </article>
        <article className="dashboard-metric">
          <span>Faturamento total</span>
          <strong>{ready ? metrics.revenue === null ? "—" : <DashboardMoney value={metrics.revenue} /> : "…"}</strong>
          <small>Vendas concluídas, sem deduções</small>
        </article>
        <article className="dashboard-metric">
          <span>Lucro bruto</span>
          <strong>{ready ? metrics.grossProfit === null ? "—" : <DashboardMoney value={metrics.grossProfit} /> : "…"}</strong>
          <small>Faturamento menos custo dos produtos</small>
        </article>
        <article className="dashboard-metric dashboard-metric--highlight">
          <span>Lucro líquido estimado</span>
          <strong>{ready ? metrics.netProfitEstimate === null ? "—" : <DashboardMoney value={metrics.netProfitEstimate} /> : "…"}</strong>
          <small>Após IVA estimado, envios, despesas e reembolsos</small>
        </article>
        <article className="dashboard-metric">
          <span>Margem bruta</span>
          <strong>{ready ? metrics.grossMarginPercent === null ? "—" : <PrivacyValue>{metrics.grossMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>Lucro bruto / faturamento</small>
        </article>
        <article className="dashboard-metric">
          <span>Rentabilidade sobre custo total</span>
          <strong>{ready ? metrics.returnOnCostPercent === null ? "—" : <PrivacyValue>{metrics.returnOnCostPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>Lucro líquido estimado / custo de compra, envios e despesas</small>
        </article>
        <article className="dashboard-metric">
          <span>Margem líquida estimada</span>
          <strong>{ready ? metrics.netMarginPercent === null ? "—" : <PrivacyValue>{metrics.netMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue> : "…"}</strong>
          <small>Lucro líquido estimado / faturamento</small>
        </article>
        <article className="dashboard-metric">
          <span>IVA estimado</span>
          <strong>{ready ? metrics.vatEstimate === null ? "—" : <DashboardMoney value={-metrics.vatEstimate} /> : "…"}</strong>
          <small>Estimativa pelo tipo das vendas concluídas</small>
        </article>
        <article className="dashboard-metric">
          <span>Despesas</span>
          <strong>{ready ? <DashboardMoney value={-metrics.expenses} /> : "…"}</strong>
          <small>Despesas registadas, sem IVA nem envios já contados nas vendas</small>
        </article>
      </section>

      <section className="content-panel dashboard-goals">
        <div className="content-panel__top">
          <div>
            <h2>Metas mensais</h2>
            <p>Progresso de {monthLabel}</p>
          </div>
        </div>
        {goalError && <p className="feedback feedback--error dashboard-feedback" role="alert">{goalError}</p>}
        {goalNotice && <p className="feedback feedback--success dashboard-feedback" role="status">{goalNotice}</p>}
        <form className="dashboard-goals__form" onSubmit={saveGoals}>
          <label className="form-field">
            <span>Meta de lucro líquido (€)</span>
            <input type="number" min="0" step="0.01" value={goalDraft.profit}
              onChange={(event) => setGoalDraft((current) => ({ ...current, profit: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Meta de faturamento (€)</span>
            <input type="number" min="0" step="0.01" value={goalDraft.revenue}
              onChange={(event) => setGoalDraft((current) => ({ ...current, revenue: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Meta de vendas</span>
            <input type="number" min="0" step="1" value={goalDraft.sales}
              onChange={(event) => setGoalDraft((current) => ({ ...current, sales: event.target.value }))} />
          </label>
          <button className="button button--primary" type="submit" disabled={!goalsReady}>Guardar metas</button>
        </form>
        <div className="dashboard-goals__progress">
          <GoalProgress label="Lucro líquido estimado" value={metrics.monthProfit} goal={goals.profit} money />
          <GoalProgress label="Faturamento" value={metrics.monthRevenue} goal={goals.revenue} money />
          <GoalProgress label="Vendas concluídas" value={metrics.monthSales} goal={goals.sales} />
        </div>
      </section>

      <div className="dashboard-panels dashboard-panels--analytics">
        <section className="content-panel">
          <div className="content-panel__top">
            <div><h2>Vendas por tipo</h2><p>Distribuição do faturamento concluído</p></div>
          </div>
          <div className="dashboard-type-chart">
            <div className="dashboard-donut" role="img" aria-label="Gráfico de faturamento por tipo de venda"
              style={{ background: salesTypeGradient }}>
              <div><strong>{ready ? <PrivacyValue>{metrics.completedSales.length}</PrivacyValue> : "…"}</strong><span>vendas</span></div>
            </div>
            <div className="dashboard-chart-legend">
              {salesByType.length ? salesByType.map((item, index) => (
                <div className="dashboard-legend-item" key={item.type}>
                  <span className={`dashboard-legend-dot dashboard-legend-dot--${index % 4}`} />
                  <span>{item.label}</span>
                  <strong><PrivacyValue>{formatEur(item.value)}</PrivacyValue></strong>
                </div>
              )) : <p className="dashboard-empty">Ainda não há vendas concluídas.</p>}
            </div>
          </div>
        </section>

        <section className="content-panel dashboard-weekly">
          <div className="content-panel__top">
            <div><h2>Lucro e faturamento</h2><p>Análise semanal · últimas 8 semanas</p></div>
          </div>
          <div className="dashboard-weekly__legend">
            <span><i className="dashboard-bar-key dashboard-bar-key--revenue" />Faturamento</span>
            <span><i className="dashboard-bar-key dashboard-bar-key--gross" />Lucro bruto</span>
            <span><i className="dashboard-bar-key dashboard-bar-key--net" />Lucro líquido estimado</span>
          </div>
          <div className="dashboard-weekly__rows">
            {weeklyMetrics.map((week) => (
              <div className="dashboard-week-row" key={week.start}>
                <span className="dashboard-week-row__label">{week.label}</span>
                <div className="dashboard-week-row__bars">
                  <WeeklyBar label="Faturamento" value={week.revenue} scale={weeklyScale} tone="revenue" />
                  <WeeklyBar label="Lucro bruto" value={week.grossProfit} scale={weeklyScale} tone="gross" />
                  <WeeklyBar label="Lucro líquido estimado" value={week.netProfit} scale={weeklyScale} tone="net" />
                </div>
                <span className="dashboard-week-row__value"><PrivacyValue>{week.revenue === null ? "—" : formatEur(week.revenue)}</PrivacyValue></span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <p className="dashboard-footnote">
        IVA e lucro líquido são estimativas com as regras fiscais atualmente configuradas. As despesas da categoria IVA não são deduzidas novamente; confirma o tratamento fiscal e se os preços incluem IVA antes de usar os valores para apuramento.
      </p>

      <div className="dashboard-panels dashboard-panels--analytics">
        <section className="content-panel">
          <div className="content-panel__top"><div><h2>Top 5 SKUs</h2><p>Mais vendidos por quantidade</p></div><Link href="/stock">Ver stock</Link></div>
          <div className="dashboard-ranking">
            {topSkus.length ? topSkus.map((item, index) => (
              <div className="dashboard-ranking__row" key={`${item.sku}-${index}`}>
                <span className="dashboard-ranking__position">{index + 1}</span>
                <div className="dashboard-ranking__main">
                  <strong>{item.name}</strong>
                  <small>{item.sku}</small>
                  <div className="dashboard-ranking__track"><i style={{ width: `${(item.quantity / skuScale) * 100}%` }} /></div>
                </div>
                <span className="dashboard-ranking__value"><PrivacyValue>{item.quantity} un.</PrivacyValue></span>
              </div>
            )) : <p className="dashboard-empty">Ainda não há vendas concluídas.</p>}
          </div>
        </section>

        <section className="content-panel">
          <div className="content-panel__top"><div><h2>Top 5 clientes</h2><p>Ordenados pelo faturamento total</p></div><Link href="/clientes">Ver clientes</Link></div>
          <div className="dashboard-ranking">
            {topCustomers.length ? topCustomers.map((item, index) => (
              <div className="dashboard-ranking__row" key={`${item.name}-${index}`}>
                <span className="dashboard-ranking__position">{index + 1}</span>
                <div className="dashboard-ranking__main">
                  <strong>{item.name}</strong>
                  <small>{item.sales} {item.sales === 1 ? "venda" : "vendas"}</small>
                  <div className="dashboard-ranking__track"><i style={{ width: `${(item.revenue / customerScale) * 100}%` }} /></div>
                </div>
                <span className="dashboard-ranking__value"><PrivacyValue>{formatEur(item.revenue)}</PrivacyValue></span>
              </div>
            )) : <p className="dashboard-empty">Ainda não há vendas associadas a clientes.</p>}
          </div>
        </section>
      </div>

      <p className="dashboard-footnote">
        Os cálculos usam apenas dados locais deste browser. Um traço (—) indica que faltam dados de preço ou custo para calcular o indicador.
      </p>
    </div>
  );
}

function GoalProgress({
  label,
  value,
  goal,
  money = false,
}: {
  label: string;
  value: number | null;
  goal: number;
  money?: boolean;
}) {
  const percentage = value === null ? 0 : progress(value, goal);
  const formattedValue = value === null ? "—" : money ? formatEur(value) : String(value);
  const formattedGoal = money ? formatEur(goal) : String(goal);
  return (
    <div className="dashboard-goal">
      <div className="dashboard-goal__heading">
        <strong>{label}</strong>
        <span>
          <PrivacyValue>{formattedValue}</PrivacyValue>
          {" / "}
          {goal > 0 ? <PrivacyValue>{formattedGoal}</PrivacyValue> : "Sem meta"}
        </span>
      </div>
      <div className="dashboard-goal__track" role="progressbar" aria-label={`Progresso da meta: ${label}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
        <i style={{ width: `${percentage}%` }} />
      </div>
      <small>{value === null ? "Dados de custo ou IVA incompletos" : goal > 0 ? `${percentage.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}% da meta` : "Define uma meta para acompanhar o progresso"}</small>
    </div>
  );
}

function WeeklyBar({
  label,
  value,
  scale,
  tone,
}: {
  label: string;
  value: number | null;
  scale: number;
  tone: "revenue" | "gross" | "net";
}) {
  const width = value === null || value === 0 ? 0 : Math.max(1, (Math.abs(value) / scale) * 100);
  const labelValue = value === null ? "Dados incompletos" : formatEur(value);
  return (
    <div className={`dashboard-week-bar dashboard-week-bar--${tone}${value !== null && value < 0 ? " dashboard-week-bar--negative" : ""}`}
      title={`${label}: ${labelValue}`} aria-label={`${label}: ${labelValue}`}>
      <i style={{ width: `${width}%` }} />
    </div>
  );
}
