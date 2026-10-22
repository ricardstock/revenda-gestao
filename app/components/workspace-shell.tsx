"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  calculateOperationalMetrics,
  formatEur,
  localDateString,
  paymentStatus,
  type Payment,
  type Sale,
} from "../lib/local-data";
import { signOut } from "../login/actions";
import { Icon } from "./icons";
import { useLocalData } from "./local-data-provider";
import { useTheme } from "./theme-provider";

const visiblePages = [
  { label: "Dashboard", href: "/", icon: "dashboard" as const },
  { label: "Estatísticas mensais", href: "/estatisticas-mensais", icon: "dashboard" as const },
  { label: "Estatísticas trimestrais", href: "/estatisticas-trimestrais", icon: "dashboard" as const },
  { label: "Stock", href: "/stock", icon: "stock" as const },
  { label: "Vendas concluídas", href: "/vendas", icon: "sales" as const },
  { label: "Vendas pendentes", href: "/encomendas-pendentes", icon: "sales" as const },
  { label: "Produtos a caminho", href: "/produtos-a-caminho", icon: "purchases" as const },
  { label: "Fornecedores", href: "/fornecedores", icon: "suppliers" as const },
  { label: "Clientes", href: "/clientes", icon: "customers" as const },
  { label: "Despesas", href: "/despesas", icon: "expenses" as const },
];

const StreamModeContext = createContext(false);

export function PrivacyValue({ children }: { children: ReactNode }) {
  const streamMode = useContext(StreamModeContext);
  return (
    <span aria-label={streamMode ? "Valor oculto" : undefined}>
      {streamMode ? "••••" : children}
    </span>
  );
}

export function FinancialValue({ value, children }: { value: number; children: ReactNode }) {
  const tone = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  return <span className={`financial-value financial-value--${tone}`}>{children}</span>;
}

export function PaymentStatusBadge({ sale, payments }: { sale: Sale; payments: Payment[] }) {
  const status = paymentStatus(sale, payments);
  const tone = status === "Pago" ? "paid" : "unpaid";
  return <span className={`payment-status payment-status--${tone}`}>{status}</span>;
}

type GlobalSearchResult = {
  id: string;
  label: string;
  detail: string;
  href: string;
  searchText: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-PT");
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { data, ready, error, sync, retrySync } = useLocalData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [streamMode, setStreamMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [periodDates, setPeriodDates] = useState({ today: "", weekStart: "", weekEnd: "" });
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const todayDate = new Date();
      const monday = new Date(todayDate);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      setPeriodDates({
        today: localDateString(todayDate),
        weekStart: localDateString(monday),
        weekEnd: localDateString(sunday),
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const { today, weekStart, weekEnd } = periodDates;
  const profits = useMemo(() => ({
    today: calculateOperationalMetrics(data, today, today).operationalResult,
    week: calculateOperationalMetrics(data, weekStart, weekEnd).operationalResult,
  }), [data, today, weekEnd, weekStart]);
  const searchResults = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim());
    if (!query) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    const results: GlobalSearchResult[] = [
      ...data.products.map((product) => ({
        id: `product-${product.id}`,
        label: product.name,
        detail: `Stock · ${product.sku}${product.size ? ` · ${product.size}` : ""}`,
        href: "/stock",
        searchText: [
          product.name,
          product.sku,
          product.size,
          product.brand,
          product.imageUrl,
          product.purchaseType,
          data.suppliers.find((supplier) => supplier.id === product.supplierId)?.name,
          ...data.units
            .filter((unit) => unit.productId === product.id)
            .flatMap((unit) => [
              unit.internalIdentifier,
              unit.serialNumber,
              unit.acquisitionCost,
              unit.status,
              unit.locationId,
              data.locations.find((location) => location.id === unit.locationId)?.name,
            ]),
        ].join(" "),
      })),
      ...data.incomingProducts.map((product) => ({
        id: `incoming-${product.id}`,
        label: product.name,
        detail: `A caminho · ${product.sku}${product.size ? ` · ${product.size}` : ""}`,
        href: "/produtos-a-caminho",
        searchText: [
          product.name,
          product.sku,
          product.size,
          product.quantity,
          product.unitCost,
          product.purchaseType,
          product.supplierId,
          data.suppliers.find((supplier) => supplier.id === product.supplierId)?.name,
          product.orderedAt,
          product.trackingUrl,
          product.imageUrl,
          product.receivedAt,
        ].join(" "),
      })),
      ...data.suppliers.map((supplier) => ({
        id: `supplier-${supplier.id}`,
        label: supplier.name,
        detail: "Fornecedor",
        href: "/fornecedores",
        searchText: [
          supplier.name,
          supplier.phone,
          supplier.email,
          supplier.discord,
          supplier.address,
          supplier.notes,
        ].join(" "),
      })),
      ...data.customers.map((customer) => ({
        id: `customer-${customer.id}`,
        label: customer.name,
        detail: "Cliente",
        href: "/clientes",
        searchText: [
          customer.name,
          customer.phone,
          customer.email,
          customer.address,
          customer.notes,
          ...data.sales
            .filter((sale) => sale.customerId === customer.id)
            .map((sale) => sale.buyerName),
        ].join(" "),
      })),
      ...data.expenses.map((expense) => ({
        id: `expense-${expense.id}`,
        label: expense.description,
        detail: `Despesa · ${expense.category}`,
        href: "/despesas",
        searchText: [
          expense.description,
          expense.category,
          expense.amount,
          expense.incurredAt,
          expense.saleId,
          data.sales.find((sale) => sale.id === expense.saleId)?.buyerName,
        ].join(" "),
      })),
      ...data.purchases.map((purchase) => ({
        id: `purchase-${purchase.id}`,
        label: purchase.orderNumber || "Encomenda",
        detail: `Encomenda · ${purchase.status}`,
        href: "/produtos-a-caminho",
        searchText: [
          purchase.orderNumber,
          purchase.orderedAt,
          purchase.expectedAt,
          purchase.tracking,
          purchase.notes,
          purchase.status,
          data.suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name,
          ...purchase.lines.flatMap((line) => {
            const product = data.products.find((item) => item.id === line.productId);
            return [product?.name, product?.sku, product?.size, line.quantity, line.unitCost, line.received];
          }),
        ].join(" "),
      })),
      ...data.sales.map((sale) => {
        const customer = data.customers.find((item) => item.id === sale.customerId);
        const supplier = data.suppliers.find((item) => item.id === sale.supplierId);
        const status = sale.status === "COMPLETED"
          ? "concluída"
          : sale.status === "CANCELLED" ? "cancelada" : "pendente";
        return {
          id: `sale-${sale.id}`,
          label: sale.buyerName || sale.lines[0]?.productName || "Venda",
          detail: `Venda ${status}${sale.trackingUrl ? " · Tracking associado" : ""} · ${sale.lines.map((line) => line.sku).filter(Boolean).join(" ")}`,
          href: sale.status === "COMPLETED" ? "/vendas" : "/encomendas-pendentes",
          searchText: [
            sale.id,
            sale.status,
            status,
            sale.soldAt,
            sale.createdAt,
            sale.buyerName,
            customer?.name,
            customer?.phone,
            customer?.email,
            supplier?.name,
            sale.invoiceNumber,
            sale.declared,
            sale.saleType,
            sale.shippingCost,
            sale.trackingUrl,
            sale.notes,
            ...sale.lines.flatMap((line) => [
              line.productName,
              line.sku,
              line.size,
              line.quantity,
              line.unitPrice,
              line.unitCost,
            ]),
            ...data.payments
              .filter((payment) => payment.saleId === sale.id)
              .flatMap((payment) => [
                payment.amount,
                payment.method,
                payment.paidAt,
                payment.reference,
              ]),
            ...data.expenses
              .filter((expense) => expense.saleId === sale.id)
              .flatMap((expense) => [
                expense.description,
                expense.category,
                expense.amount,
              ]),
            ...data.refunds
              .filter((refund) => refund.saleId === sale.id)
              .flatMap((refund) => [
                refund.amount,
                refund.method,
                refund.refundedAt,
                refund.reference,
                refund.notes,
              ]),
            ...data.returns
              .filter((record) => record.saleId === sale.id)
              .flatMap((record) => [
                record.receivedAt,
                record.status,
                record.unitId,
              ]),
          ].join(" "),
        };
      }),
      ...data.movements.map((movement) => {
        const unit = data.units.find((item) => item.id === movement.unitId);
        const product = data.products.find((item) => item.id === unit?.productId);
        return {
          id: `movement-${movement.id}`,
          label: product?.name || "Movimento de stock",
          detail: `Stock · ${movement.type}`,
          href: "/stock",
          searchText: [
            movement.type,
            movement.occurredAt,
            movement.notes,
            movement.fromLocationId,
            movement.toLocationId,
            data.locations.find((location) => location.id === movement.fromLocationId)?.name,
            data.locations.find((location) => location.id === movement.toLocationId)?.name,
            movement.quantityDelta,
            unit?.internalIdentifier,
            unit?.serialNumber,
            product?.name,
            product?.sku,
            product?.size,
          ].join(" "),
        };
      }),
    ];
    return results.filter((result) =>
      terms.every((term) => normalizeSearchText(result.searchText).includes(term)),
    ).slice(0, 20);
  }, [data, searchQuery]);

  return (
    <StreamModeContext.Provider value={streamMode}>
    <div className={`workspace${mobileOpen ? " workspace--mobile-open" : ""}${sidebarCollapsed ? " workspace--collapsed" : ""}${streamMode ? " workspace--stream-mode" : ""}`}>
      {mobileOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}>
        <Link
          className="brand"
          href="/"
          aria-label="Revenda Gestão — Dashboard"
          onClick={() => setMobileOpen(false)}
        >
          <span className="brand__mark">R</span>
          <span className="brand__name">
            <strong>Revenda</strong>
            <span>GESTÃO</span>
          </span>
        </Link>
        <div className="sidebar__section-label">ESPAÇO DE TRABALHO</div>
        <nav className="sidebar__nav" aria-label="Navegação principal">
          {visiblePages.map((item, index) => {
            const active = item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <div key={item.href}>
                {index === 1 && <div className="sidebar__divider" aria-hidden="true" />}
                <Link
                  className={`nav-link${active ? " nav-link--active" : ""}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <div className="local-status">
            <span className="local-status__dot" />
            <div>
              <strong>{sync === "error" ? "Sem ligação" : "Online"}</strong>
              <span>{error ? "Erro no armazenamento" : !ready ? "A carregar dados…" : sync === "saved" ? "Guardado na base de dados" : sync === "saving" ? "A guardar…" : sync === "error" ? "Não guardado online" : "A ligar…"}</span>
            </div>
          </div>
          <button
            className="collapse-button"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Ocultar menu lateral"}
            title={sidebarCollapsed ? "Expandir menu lateral" : "Ocultar menu lateral"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <Icon name="chevron" className="collapse-button__icon" />
            <span>{sidebarCollapsed ? "Mostrar menu" : "Ocultar menu"}</span>
          </button>
        </div>
      </aside>

      <div className="workspace__main">
        <header className="topbar">
          <button
            className="icon-button desktop-sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "Mostrar menu lateral" : "Ocultar menu lateral"}
            title={sidebarCollapsed ? "Mostrar menu lateral" : "Ocultar menu lateral"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <Icon name="chevron" className={sidebarCollapsed ? "sidebar-toggle-icon--collapsed" : undefined} />
          </button>
          <button
            className="icon-button mobile-menu-button"
            type="button"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Icon name={mobileOpen ? "close" : "menu"} />
          </button>
          <div className="topbar__section-title">
            {pathname === "/stock"
              ? "Stock"
              : pathname === "/estatisticas-mensais"
                ? "Estatísticas mensais"
                : pathname === "/estatisticas-trimestrais"
                  ? "Estatísticas trimestrais"
              : pathname === "/produtos-a-caminho"
                ? "Produtos a caminho"
                : pathname === "/fornecedores"
                  ? "Fornecedores"
                  : pathname === "/clientes"
                    ? "Clientes"
                    : pathname === "/despesas"
                      ? "Despesas"
                      : pathname === "/encomendas-pendentes"
                        ? "Vendas pendentes"
                        : pathname === "/vendas"
                          ? "Vendas concluídas"
                      : "Dashboard"}
          </div>
          <div className="topbar__profits" aria-label="Lucro líquido estimado">
            <div><span>Hoje</span><strong>{!ready || !today ? "…" : profits.today === null ? "—" : <FinancialValue value={profits.today}><PrivacyValue>{formatEur(profits.today)}</PrivacyValue></FinancialValue>}</strong></div>
            <div title="De segunda a domingo"><span>Semana</span><strong>{!ready || !today ? "…" : profits.week === null ? "—" : <FinancialValue value={profits.week}><PrivacyValue>{formatEur(profits.week)}</PrivacyValue></FinancialValue>}</strong></div>
          </div>
          <div
            className="topbar__search-wrap"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false);
            }}
          >
            <label className="search-box">
              <Icon name="search" size={16} />
              <input
                type="search"
                role="combobox"
                aria-label="Pesquisa global"
                aria-autocomplete="list"
                aria-controls="global-search-results"
                aria-expanded={searchOpen && Boolean(searchQuery.trim())}
                placeholder="Pesquisa global..."
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
              />
            </label>
            {searchOpen && searchQuery.trim() && <div id="global-search-results" className="search-results" role="listbox">
              {!ready
                ? <div className="search-result search-result--empty">A carregar dados…</div>
                : searchResults.length
                  ? searchResults.map((result) => <Link
                    key={result.id}
                    className="search-result"
                    href={result.href}
                    onClick={() => {
                      setSearchQuery("");
                      setSearchOpen(false);
                    }}
                  >
                    <span><strong>{result.label}</strong><small>{result.detail}</small></span>
                  </Link>)
                  : <div className="search-result search-result--empty">Sem resultados.</div>}
            </div>}
          </div>
          <div className="topbar__actions">
            <button
              className={`stream-mode-button${streamMode ? " stream-mode-button--active" : ""}`}
              type="button"
              aria-label={streamMode ? "Desativar modo stream" : "Ativar modo stream"}
              aria-pressed={streamMode}
              onClick={() => setStreamMode((active) => !active)}
            >
              <Icon name="eye" size={17} />
              <span>Stream</span>
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} size={19} />
            </button>
            <span className="topbar__divider" />
            <div className="profile-link" aria-label="Perfil local">
              <span className="profile-avatar">U</span>
              <span className="profile-link__text">
                <strong>Utilizador</strong>
                <small>Perfil local</small>
              </span>
            </div>
            <form action={signOut}>
              <button type="submit" className="button button--small" title="Terminar sessão">
                Sair
              </button>
            </form>
          </div>
        </header>
        <main className={`main-content${pathname === "/vendas" || pathname === "/encomendas-pendentes" ? " main-content--sales" : ""}`}>{children}</main>
        <footer className="workspace-footer">
          <span>Revenda Gestão</span>
          <span>
            {sync === "saved" && "Dados guardados na base de dados"}
            {sync === "saving" && "A guardar…"}
            {sync === "loading" && "A ligar à base de dados…"}
            {sync === "error" && (
              <>
                Não guardado online ·{" "}
                <button type="button" className="button button--small" onClick={retrySync}>
                  Tentar de novo
                </button>
              </>
            )}
          </span>
        </footer>
      </div>
    </div>
    </StreamModeContext.Provider>
  );
}
