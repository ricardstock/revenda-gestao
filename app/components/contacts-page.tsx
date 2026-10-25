"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  calculateGrossProfit,
  calculateProfitRatio,
  calculateSaleFinancialMetrics,
  formatEur,
  makeId,
  refundsTotal,
  saleTotal,
  sumMoney,
  type Contact,
  type LocalData,
  type Supplier,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { FinancialValue, PrivacyValue } from "./workspace-shell";

type DirectoryKind = "suppliers" | "customers";
type DirectoryContact = Contact & { active?: boolean; discord?: string };
type SortBy = "roi" | "value" | "purchases" | "name";
type ContactMetrics = {
  purchases: number;
  value: number;
  profit: number | null;
  roi: number | null;
  lastPurchase: string;
};

function supplierMetrics(supplierId: string, data: LocalData): ContactMetrics {
  const purchases = data.purchases.filter(
    (purchase) => purchase.supplierId === supplierId && purchase.status !== "CANCELLED",
  );
  const incoming = data.incomingProducts.filter((item) => item.supplierId === supplierId);
  const stockBatches = data.units.filter(
    (unit) => unit.supplierId === supplierId && unit.acquisitionBatchId && !unit.incomingProductId,
  );
  const batchIds = new Set(stockBatches.map((unit) => unit.acquisitionBatchId));
  const value = sumMoney([
    ...purchases.flatMap((purchase) =>
      purchase.lines.map((line) => line.quantity * line.unitCost),
    ),
    ...incoming.map((item) => item.quantity * item.unitCost),
    ...stockBatches.map((unit) => unit.acquisitionCost),
  ]);
  const products = new Map(data.products.map((product) => [product.id, product]));
  const units = new Map(data.units.map((unit) => [unit.id, unit]));
  const margins: number[] = [];
  let profitComplete = true;

  data.sales.filter((sale) => sale.status === "COMPLETED").forEach((sale) => {
    sale.lines.forEach((line) => {
      const product = products.get(line.productId);
      if (line.unitIds.length) {
        line.unitIds.forEach((unitId) => {
          const unit = units.get(unitId);
          if ((unit?.supplierId ?? product?.supplierId) === supplierId) {
            const unitCost = unit?.acquisitionCost ?? line.unitCost;
            if (!Number.isFinite(line.unitPrice) || !Number.isFinite(unitCost) || (unitCost ?? -1) < 0) {
              profitComplete = false;
            } else {
              const grossProfit = calculateGrossProfit(line.unitPrice, unitCost ?? null);
              if (grossProfit === null) profitComplete = false;
              else margins.push(grossProfit);
            }
          }
        });
      } else if (product?.supplierId === supplierId) {
        if (!Number.isFinite(line.unitPrice) || !Number.isFinite(line.unitCost) || (line.unitCost ?? -1) < 0) {
          profitComplete = false;
        } else {
          const grossProfit = calculateGrossProfit(
            line.unitPrice * line.quantity,
            (line.unitCost ?? 0) * line.quantity,
          );
          if (grossProfit === null) profitComplete = false;
          else margins.push(grossProfit);
        }
      }
    });
  });

  const profit = profitComplete ? sumMoney(margins) : null;
  const lastPurchase = incoming
    .map((item) => item.orderedAt)
    .concat(purchases.map((purchase) => purchase.orderedAt))
    .sort()
    .at(-1) ?? "";

  return {
    purchases: purchases.length + incoming.length + batchIds.size,
    value,
    profit,
    roi: calculateProfitRatio(profit, value),
    lastPurchase,
  };
}

function customerMetrics(customer: Contact, data: LocalData): ContactMetrics {
  const customerName = customer.name.trim().toLocaleLowerCase("pt-PT");
  const sales = data.sales.filter((sale) =>
    sale.status === "COMPLETED" &&
    (sale.customerId === customer.id ||
      (!sale.customerId && sale.buyerName?.trim().toLocaleLowerCase("pt-PT") === customerName)),
  );
  const value = sumMoney(sales.map((sale) =>
    Math.max(0, saleTotal(sale) - refundsTotal(sale.id, data.refunds)),
  ));
  const saleProfitMetrics = sales.map((sale) => calculateSaleFinancialMetrics(sale, data));
  const profit = saleProfitMetrics.every((metrics) => metrics.netProfitEstimate !== null)
    ? sumMoney(saleProfitMetrics.map((metrics) => metrics.netProfitEstimate ?? 0))
    : null;
  const lastPurchase = sales.map((sale) => sale.soldAt).sort().at(-1) ?? "";

  return {
    purchases: sales.length,
    value,
    profit,
    roi: null,
    lastPurchase,
  };
}

function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-PT");
}

export function ContactsPage({ kind }: { kind: DirectoryKind }) {
  const { data, ready, error, update } = useLocalData();
  const isSupplier = kind === "suppliers";
  const title = isSupplier ? "Fornecedores" : "Clientes";
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>(isSupplier ? "roi" : "value");
  const [filter, setFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const contacts: DirectoryContact[] = isSupplier ? data.suppliers : data.customers;
  const rows = useMemo(() => contacts
    .filter((contact) => showArchived || contact.active !== false)
    .map((contact) => ({
      contact,
      metrics: isSupplier
        ? supplierMetrics(contact.id, data)
        : customerMetrics(contact, data),
    }))
    .filter(({ contact, metrics }) => {
      const searchText = `${contact.name} ${contact.phone} ${contact.email} ${contact.discord ?? ""}`
        .toLocaleLowerCase("pt-PT");
      return searchText.includes(query.trim().toLocaleLowerCase("pt-PT")) &&
        (filter === "all" || (filter === "with-purchases" ? metrics.purchases > 0 : metrics.purchases === 0));
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.contact.name.localeCompare(b.contact.name, "pt-PT");
      if (sortBy === "purchases") return b.metrics.purchases - a.metrics.purchases;
      if (sortBy === "roi") return (b.metrics.roi ?? -Infinity) - (a.metrics.roi ?? -Infinity);
      return b.metrics.value - a.metrics.value;
    }), [contacts, data, filter, isSupplier, query, showArchived, sortBy]);

  function openNewContact() {
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
  }

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    if (!name) {
      setFormError("Indica o nome.");
      return;
    }
    const email = String(values.get("email") ?? "").trim();
    const phone = String(values.get("phone") ?? "").trim();
    const existing = contacts.find((contact) => contact.id === editingId);
    const address = String(values.get("address") ?? existing?.address ?? "").trim();
    const notes = String(values.get("notes") ?? existing?.notes ?? "").trim();
    const discord = String(values.get("discord") ?? "").trim();
    const id = existing?.id ?? makeId();

    try {
      if (isSupplier) {
        const supplier: Supplier = {
          id, name, email, phone, address, notes, discord,
          active: existing?.active ?? true,
        };
        update((current) => {
          const duplicate = current.suppliers.some((item) =>
            item.id !== id &&
            item.active !== false &&
            item.name.trim().toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"),
          );
          if (duplicate) throw new Error("Já existe um fornecedor ativo com esse nome.");
          return {
            ...current,
            suppliers: existing
              ? current.suppliers.map((item) => item.id === id ? supplier : item)
              : [supplier, ...current.suppliers],
          };
        });
      } else {
        const customer = {
          id, name, email, phone, address, notes,
          active: existing?.active ?? true,
        };
        update((current) => {
          const duplicate = current.customers.some((item) =>
            item.id !== id &&
            item.active !== false &&
            item.name.trim().toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"),
          );
          if (duplicate) throw new Error("Já existe um cliente ativo com esse nome.");
          return {
            ...current,
            customers: existing
              ? current.customers.map((item) => item.id === id ? customer : item)
              : [customer, ...current.customers],
          };
        });
      }
      setNotice(`${isSupplier ? "Fornecedor" : "Cliente"} ${existing ? "atualizado" : "adicionado"}.`);
      setFormError("");
      setModalOpen(false);
      setEditingId(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : `Não foi possível guardar ${title.toLocaleLowerCase("pt-PT")}.`);
    }
  }

  function archiveContact(contact: DirectoryContact) {
    if (!window.confirm(`Remover “${contact.name}”? O registo e o histórico serão preservados.`)) return;
    try {
      update((current) => isSupplier
        ? { ...current, suppliers: current.suppliers.map((item) => item.id === contact.id ? { ...item, active: false } : item) }
        : { ...current, customers: current.customers.map((item) => item.id === contact.id ? { ...item, active: false } : item) },
      );
      setNotice(`“${contact.name}” foi removido. O histórico foi preservado.`);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível remover o registo.");
    }
  }

  function restoreContact(contact: DirectoryContact) {
    try {
      update((current) => isSupplier
        ? { ...current, suppliers: current.suppliers.map((item) => item.id === contact.id ? { ...item, active: true } : item) }
        : { ...current, customers: current.customers.map((item) => item.id === contact.id ? { ...item, active: true } : item) },
      );
      setNotice(`“${contact.name}” foi restaurado.`);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível restaurar o registo.");
    }
  }

  const editingContact = contacts.find((contact) => contact.id === editingId);

  return (
    <div className="page-stack contacts-page">
      <header className="contacts-page__header">
        <h1>{title}</h1>
        <div className="contacts-page__tools">
          <input
            className="table-search"
            type="search"
            placeholder="Pesquisar..."
            aria-label={`Pesquisar ${title.toLocaleLowerCase("pt-PT")}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select aria-label="Ordenar por" value={isSupplier || sortBy !== "roi" ? sortBy : "value"} onChange={(event) => setSortBy(event.target.value as SortBy)}>
            {isSupplier
              ? <><option value="roi">Melhor ROI</option><option value="value">Maior valor</option></>
              : <option value="value">Maior gasto</option>}
            <option value="purchases">Mais compras</option>
            <option value="name">Nome</option>
          </select>
          <select aria-label="Filtrar registos" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="with-purchases">Com compras</option>
            <option value="without-purchases">Sem compras</option>
          </select>
          <button className="button button--primary" type="button" onClick={openNewContact}>+ Novo</button>
        </div>
      </header>
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}
      <section className="content-panel contacts-panel">
        <div className="contacts-panel__toolbar">
          <label className="stock-archived-toggle">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            Mostrar removidos
          </label>
        </div>
        <div className="table-wrap contacts-table-wrap">
          <table className="data-table contacts-table">
            <thead>
              {isSupplier
                ? <tr><th>Nome</th><th>Contacto</th><th>Discord</th><th>Email</th><th>Compras</th><th>Valor</th><th>ROI</th><th>Lucro bruto</th><th>Ações</th></tr>
                : <tr><th>Nome</th><th>Compras</th><th>Total gasto</th><th>Lucro líquido estimado</th><th>Última compra</th><th>Ações</th></tr>}
            </thead>
            <tbody>
              {!ready
                ? <tr><td className="table-empty" colSpan={isSupplier ? 9 : 6}>A carregar dados locais…</td></tr>
                : rows.length
                  ? rows.map(({ contact, metrics }) => <tr key={contact.id}>
                    <td className="contacts-name-cell" data-label="Nome">
                      <strong>{contact.name}</strong>
                      {contact.active === false && <small>Removido</small>}
                    </td>
                    {isSupplier
                      ? <>
                        <td data-label="Contacto">{contact.phone || "—"}</td>
                        <td data-label="Discord">{contact.discord || "—"}</td>
                        <td data-label="Email">{contact.email || "—"}</td>
                        <td data-label="Compras"><span className="stock-quantity">{metrics.purchases}</span></td>
                        <td data-label="Valor"><FinancialValue value={metrics.value}><PrivacyValue>{formatEur(metrics.value)}</PrivacyValue></FinancialValue></td>
                        <td className="contacts-roi-cell" data-label="ROI">
                          <PrivacyValue>{metrics.roi === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(metrics.roi)}</PrivacyValue>
                        </td>
                        <td data-label="Lucro">{metrics.profit === null ? "—" : <FinancialValue value={metrics.profit}><PrivacyValue>{formatEur(metrics.profit)}</PrivacyValue></FinancialValue>}</td>
                      </>
                      : <>
                        <td data-label="Compras"><span className="stock-quantity">{metrics.purchases}</span></td>
                        <td data-label="Total gasto"><FinancialValue value={-metrics.value}><PrivacyValue>{formatEur(metrics.value)}</PrivacyValue></FinancialValue></td>
                        <td data-label="Lucro líquido estimado">{metrics.profit === null ? "—" : <FinancialValue value={metrics.profit}><PrivacyValue>{formatEur(metrics.profit)}</PrivacyValue></FinancialValue>}</td>
                        <td data-label="Última compra">{displayDate(metrics.lastPurchase)}</td>
                      </>}
                    <td className="contacts-actions-cell" data-label="Ações">
                      {contact.active === false
                        ? <button className="button button--small" type="button" onClick={() => restoreContact(contact)}>Restaurar</button>
                        : <>
                          <button className="button button--small" type="button" onClick={() => {
                            setEditingId(contact.id);
                            setFormError("");
                            setModalOpen(true);
                          }}>Editar</button>
                          <button className="button button--small button--danger" type="button" onClick={() => archiveContact(contact)}>Remover</button>
                        </>}
                    </td>
                  </tr>)
                  : <tr><td className="table-empty" colSpan={isSupplier ? 9 : 6}>
                    {query || filter !== "all" ? "Não há registos que correspondam aos filtros." : `Ainda não existem ${title.toLocaleLowerCase("pt-PT")}.`}
                  </td></tr>}
            </tbody>
          </table>
        </div>
        <p className="contacts-note">
          {isSupplier
            ? "O ROI compara o lucro bruto das vendas concluídas com os custos registados de compras e stock."
            : "Gasto e lucro incluem vendas concluídas; o lucro desconta custo do produto, portes, despesas e reembolsos."}
        </p>
      </section>

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
          <header className="sale-modal__header">
            <h2 id="contact-modal-title">{editingContact ? `Editar ${isSupplier ? "fornecedor" : "cliente"}` : `Novo ${isSupplier ? "fornecedor" : "cliente"}`}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form onSubmit={saveContact}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field stock-modal__wide"><span>Nome</span><input name="name" required defaultValue={editingContact?.name} autoFocus /></label>
                <label className="form-field"><span>Contacto</span><input name="phone" type="tel" defaultValue={editingContact?.phone} /></label>
                <label className="form-field"><span>Email</span><input name="email" type="email" defaultValue={editingContact?.email} /></label>
                {isSupplier
                  ? <label className="form-field stock-modal__wide"><span>Discord</span><input name="discord" placeholder="Utilizador ou convite" defaultValue={editingContact?.discord} /></label>
                  : <>
                    <label className="form-field stock-modal__wide"><span>Morada (opcional)</span><input name="address" defaultValue={editingContact?.address} /></label>
                    <label className="form-field stock-modal__wide"><span>Notas (opcional)</span><textarea name="notes" rows={3} defaultValue={editingContact?.notes} /></label>
                  </>}
              </div>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">Guardar</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
