"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  formatEur,
  findOrCreateCustomer,
  findOrCreateSupplier,
  localDateString,
  makeId,
  deleteSaleAndRelatedData,
  duplicateSaleWithPayments,
  paymentStatus,
  paymentsTotal,
  saleOutstanding,
  calculateSaleFinancialMetrics,
  roundMoney,
  saleTotal,
  type Sale,
  type SaleLine,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { SaleFiltersBar, applySaleFilters, defaultSaleFilters, type SaleFilters } from "./sale-filters";
import { FinancialValue, PaymentStatusBadge, PrivacyValue } from "./workspace-shell";
import { CustomerAutocomplete } from "./customer-autocomplete";
import { SaleDetailsModal } from "./sale-details-modal";
import { SupplierAutocomplete } from "./supplier-autocomplete";

type PaymentMode = "KEEP" | "PENDING" | "PARTIAL" | "PAID";

const saleTypes = [
  { value: "PRIVATE", label: "Private" },
  { value: "MARGIN", label: "Margin" },
  { value: "VAT23%", label: "VAT 23%" },
  { value: "VAT0%", label: "VAT 0%" },
] as const;

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day
    ? new Intl.DateTimeFormat("pt-PT").format(new Date(year, month - 1, day))
    : value;
}

function saleProductText(sale: Sale) {
  return sale.lines
    .map((line) => `${line.productName ?? ""} ${line.sku ?? ""} ${line.size ?? ""}`)
    .join(" ");
}

export function CompletedSalesPage() {
  const { data, ready, error, update } = useLocalData();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SaleFilters>(defaultSaleFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
  const [today, setToday] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("PENDING");
  const [saleType, setSaleType] = useState<(typeof saleTypes)[number]["value"]>("PRIVATE");
  const [declaredValue, setDeclaredValue] = useState<"YES" | "NO">("NO");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const completedSales = data.sales.filter((sale) => sale.status === "COMPLETED");
  const total = completedSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-PT");
    return applySaleFilters(
      data.sales.filter((sale) => sale.status === "COMPLETED"),
      filters,
      data,
      (sale) => paymentStatus(sale, data.payments),
    )
      .filter((sale) => `${sale.buyerName ?? ""} ${saleProductText(sale)} ${sale.notes}`
        .toLocaleLowerCase("pt-PT")
        .includes(search));
  }, [data, query, filters]);

  function openModal() {
    setToday(localDateString(new Date()));
    setBuyerName("");
    setCustomerId("");
    setSupplierName("");
    setSupplierId("");
    setDeclaredValue("NO");
    setInvoiceNumber("");
    setPaymentMode("PENDING");
    setSaleType("PRIVATE");
    setEditingSale(null);
    setFormError("");
    setModalOpen(true);
  }

  function saveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const soldAt = String(values.get("soldAt") ?? "");
    const enteredBuyerName = String(values.get("buyerName") ?? "").trim();
    const sku = String(values.get("sku") ?? "").trim();
    const size = String(values.get("size") ?? "").trim();
    const productName = String(values.get("productName") ?? "").trim();
    const cost = Number(values.get("cost"));
    const price = Number(values.get("salePrice"));
    const shippingCost = Number(values.get("shippingCost"));
    const submittedSaleType = String(values.get("saleType") ?? "");
    const paidAmount = Number(values.get("paidAmount"));
    const trackingUrl = String(values.get("trackingUrl") ?? "").trim();
    const declared = saleType === "PRIVATE" ? "PRIVATE" : declaredValue;
    const notes = String(values.get("notes") ?? "").trim();
    const enteredSupplierName = String(values.get("supplierName") ?? "").trim();
    const enteredInvoiceNumber = String(values.get("invoiceNumber") ?? "").trim();
    const saleQuantity = Number(values.get("saleQuantity") ?? 1);
    const submittedPaymentMode = String(values.get("paymentMode") ?? paymentMode);

    try {
      if (!soldAt || !enteredBuyerName || !sku || !productName) {
        throw new Error("Preenche a data, o comprador, o SKU e o produto.");
      }
      if (!editingSale && (!Number.isSafeInteger(saleQuantity) || saleQuantity < 1 || saleQuantity > 100)) {
        throw new Error("A quantidade tem de ser um número inteiro entre 1 e 100.");
      }
      if (!Number.isFinite(cost) || cost < 0) throw new Error("Indica um custo válido.");
      if (!Number.isFinite(price) || price <= 0) throw new Error("O valor de venda tem de ser superior a zero.");
      if (!Number.isFinite(shippingCost) || shippingCost < 0) throw new Error("Indica um custo de envio válido.");
      const selectedSaleType = saleTypes.find((type) => type.value === submittedSaleType);
      if (!selectedSaleType) throw new Error("Seleciona um tipo de venda válido.");
      if (
        !["PENDING", "PARTIAL", "PAID"].includes(submittedPaymentMode) &&
        !(editingSale && submittedPaymentMode === "KEEP")
      ) throw new Error("Seleciona um estado de pagamento válido.");
      if (!editingSale && submittedPaymentMode === "PARTIAL" &&
        (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount >= price)) {
        throw new Error("A parte paga tem de ser superior a zero e inferior ao valor da venda.");
      }
      if (editingSale && submittedPaymentMode === "PARTIAL" &&
        (!Number.isFinite(paidAmount) || paidAmount <= 0)) {
        throw new Error("Indica um pagamento parcial superior a zero.");
      }
      if (trackingUrl) {
        const url = new URL(trackingUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("O link de rastreio tem de usar http:// ou https://.");
      }
      if (saleType !== "PRIVATE" && declared !== "YES" && declared !== "NO") throw new Error("Seleciona uma opção válida para Declarado.");

      const id = editingSale?.id ?? makeId();
      const line: SaleLine = {
        productId: editingSale?.lines[0]?.productId ?? "",
        quantity: editingSale?.lines[0]?.quantity ?? 1,
        unitPrice: roundMoney(price),
        unitIds: editingSale?.lines[0]?.unitIds ?? [],
        sku,
        size,
        productName,
        unitCost: roundMoney(cost),
      };
      const sale: Sale = {
        id,
        createdAt: editingSale?.createdAt ?? new Date().toISOString(),
        soldAt,
        customerId,
        buyerName: enteredBuyerName,
        saleType: selectedSaleType.value,
        invoiceNumber: declared === "YES" ? enteredInvoiceNumber : "",
        declared,
        shippingCost: roundMoney(shippingCost),
        supplierId: supplierId || undefined,
        trackingUrl,
        notes,
        status: editingSale?.status ?? "COMPLETED",
        lines: [line, ...(editingSale?.lines.slice(1) ?? [])],
      };
      const amountReceived = editingSale ? 0 : submittedPaymentMode === "PAID"
        ? roundMoney(price)
        : submittedPaymentMode === "PARTIAL"
          ? roundMoney(paidAmount)
          : 0;

      update((current) => {
        if (editingSale && !current.sales.some((item) => item.id === editingSale.id && item.status === "COMPLETED")) {
          throw new Error("Esta venda já não está concluída e não pode ser editada aqui.");
        }
        const customerResult = findOrCreateCustomer(current.customers, customerId, enteredBuyerName);
        const supplierResult = findOrCreateSupplier(current.suppliers, supplierId, enteredSupplierName);
        const product = current.products.find((item) =>
          item.active &&
          item.sku.trim().toLocaleLowerCase("pt-PT") === sku.toLocaleLowerCase("pt-PT") &&
          (item.size ?? "").trim().toLocaleLowerCase("pt-PT") === size.toLocaleLowerCase("pt-PT"),
        );
        const savedSale = {
          ...sale,
          customerId: customerResult.customer.id,
          supplierId: supplierResult.supplier?.id,
          lines: [
            { ...line, productId: product?.id ?? editingSale?.lines[0]?.productId ?? "" },
            ...(editingSale?.lines.slice(1) ?? []),
          ],
        };
        const paymentAmount = editingSale
          ? submittedPaymentMode === "PAID"
            ? saleOutstanding(savedSale, current.payments)
            : submittedPaymentMode === "PARTIAL"
              ? roundMoney(paidAmount)
              : 0
          : amountReceived;
        if (editingSale && submittedPaymentMode === "PARTIAL" &&
          paymentAmount >= saleOutstanding(savedSale, current.payments)) {
          throw new Error("O pagamento parcial tem de ser inferior ao valor ainda por receber. Para liquidar, seleciona “Marcar como pago”.");
        }
        const sales = editingSale
          ? current.sales.map((item) => item.id === editingSale.id ? savedSale : item)
          : Array.from({ length: saleQuantity }, (_, index) => ({
            ...savedSale,
            id: index === 0 ? id : makeId(),
            lines: savedSale.lines.map((savedLine) => ({
              ...savedLine,
              unitIds: [...savedLine.unitIds],
            })),
          }));
        const payments = sales.flatMap((saved) => amountReceived
          ? [{
            id: makeId(),
            saleId: saved.id,
            amount: paymentAmount,
            method: "OTHER" as const,
            paidAt: soldAt,
            reference: "",
          }]
          : []);
        const editPayment = editingSale && paymentAmount > 0
          ? [{
            id: makeId(),
            saleId: id,
            amount: paymentAmount,
            method: "OTHER" as const,
            paidAt: soldAt,
            reference: "",
          }]
          : [];
        return {
          ...current,
          customers: customerResult.customers,
          suppliers: supplierResult.suppliers,
          sales: editingSale ? sales : [...sales, ...current.sales],
          payments: [...editPayment, ...payments, ...current.payments],
        };
      });
      setModalOpen(false);
      setEditingSale(null);
      setFormError("");
      setNotice(editingSale
        ? submittedPaymentMode === "PAID"
          ? `Venda de “${enteredBuyerName}” atualizada e marcada como paga. O valor em falta foi registado como pagamento.`
          : submittedPaymentMode === "PARTIAL"
            ? `Venda de “${enteredBuyerName}” atualizada e pagamento parcial registado.`
            : `Venda de “${enteredBuyerName}” atualizada. Os pagamentos existentes foram preservados.`
        : `${saleQuantity} ${saleQuantity === 1 ? "venda" : "vendas"} de “${enteredBuyerName}” ${saleQuantity === 1 ? "registada" : "registadas"} como concluída${saleQuantity === 1 ? "" : "s"}.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar a venda.");
    }
  }

  function editSale(sale: Sale) {
    setEditingSale(sale);
    setBuyerName(sale.buyerName ?? "");
    setCustomerId(sale.customerId);
    setDeclaredValue(sale.declared === "YES" ? "YES" : "NO");
    setInvoiceNumber(sale.invoiceNumber ?? "");
    setSupplierId(sale.supplierId ?? "");
    setSupplierName(data.suppliers.find((supplier) => supplier.id === sale.supplierId)?.name ?? "");
    setSaleType(sale.saleType);
    setPaymentMode("KEEP");
    setFormError("");
    setModalOpen(true);
  }

  function deleteSale(sale: Sale) {
    const buyer = sale.buyerName || "este comprador";
    if (!window.confirm(`Eliminar permanentemente a venda de “${buyer}” e os respetivos pagamentos, despesas, reembolsos e devoluções? O stock não será alterado.`)) return;
    try {
      update((current) => {
        const currentSale = current.sales.find((item) => item.id === sale.id);
        if (!currentSale || currentSale.status !== "COMPLETED") {
          throw new Error("Esta venda já não está concluída. Atualiza a página e tenta novamente.");
        }
        return deleteSaleAndRelatedData(current, sale.id);
      });
      setFormError("");
      setNotice("Venda e registos associados eliminados. O stock não foi alterado.");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível eliminar a venda.");
      setNotice("");
    }
  }

  function duplicateSale(sale: Sale) {
    const buyer = sale.buyerName || "este comprador";
    if (!window.confirm(
      `Duplicar a venda de “${buyer}”, incluindo os pagamentos registados e o mesmo número de fatura? Os valores recebidos serão duplicados. Despesas, reembolsos e devoluções não serão copiados.`,
    )) return;
    try {
      update((current) => duplicateSaleWithPayments(current, sale.id));
      setFormError("");
      setNotice(`Venda de “${buyer}” duplicada com o mesmo estado e pagamentos.`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível duplicar a venda.");
      setNotice("");
    }
  }

  return (
    <div className="page-stack stock-page pending-sales-page completed-sales-page">
      <header className="stock-page__header">
        <div>
          <div className="eyebrow">GESTÃO DE VENDAS</div>
          <h1>Vendas concluídas</h1>
          <p>Consulta as vendas finalizadas e os pagamentos registados.</p>
        </div>
        <div className="pending-sales__header-actions">
          <button className="button button--primary" type="button" disabled={!ready || Boolean(error)} onClick={openModal}>+ Nova venda</button>
        </div>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}

      <section className="stock-summary" aria-label="Resumo das vendas concluídas">
        <div><span>Vendas concluídas</span><strong>{ready ? completedSales.length : "…"}</strong></div>
        <div><span>Valor vendido</span><strong><FinancialValue value={total}><PrivacyValue>{ready ? formatEur(total) : "…"}</PrivacyValue></FinancialValue></strong></div>
        <div><span>Pagamentos em falta</span><strong>{ready ? completedSales.filter((sale) => paymentStatus(sale, data.payments) !== "Pago").length : "…"}</strong></div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top pending-sales__top">
          <div><h2>Histórico de vendas</h2><p>{rows.length} registos</p></div>
          <input
            className="table-search"
            type="search"
            aria-label="Pesquisar vendas concluídas"
            placeholder="Pesquisar comprador, SKU ou produto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <SaleFiltersBar filters={filters} onChange={setFilters} />
        <div className="table-wrap pending-sales-table-wrap">
          <table className="data-table pending-sales-table completed-sales-table">
            <thead><tr><th>Data</th><th>SKU / Nome</th><th>Tam.</th><th>Comprador</th><th>Custo</th><th>Venda</th><th>Lucro bruto</th><th>Margem bruta</th><th>Lucro final estimado</th><th>Margem líquida estimada</th><th>Tipo</th><th>Fornecedor</th><th>IVA estimado</th><th>Pagamento</th><th>Declarado?</th><th>Track</th><th className="sales-actions-heading">Ações</th></tr></thead>
            <tbody>
              {!ready
                ? <tr><td className="table-empty" colSpan={17}>A carregar vendas locais…</td></tr>
                : rows.length
                  ? rows.map((sale) => {
                    const financials = calculateSaleFinancialMetrics(sale, data);
                    const supplier = data.suppliers.find((item) => item.id === sale.supplierId);
                    const firstLine = sale.lines[0];
                    return <tr key={sale.id}>
                    <td data-label="Data">{formatDate(sale.soldAt)}</td>
                    <td data-label="SKU / Nome">
                      <strong>{firstLine?.sku || "—"}</strong>
                      <span className="pending-sale-product-detail">{sale.lines.map((line) => line.productName || "Produto").join(", ")}</span>
                    </td>
                    <td data-label="Tam.">{sale.lines.map((line) => line.size).filter(Boolean).join(", ") || "—"}</td>
                    <td data-label="Comprador">{sale.buyerName || "—"}</td>
                    <td data-label="Custo">{financials.cost === null ? "—" : <FinancialValue value={-financials.cost}><PrivacyValue>{formatEur(financials.cost)}</PrivacyValue></FinancialValue>}</td>
                    <td data-label="Venda">{financials.revenue === null ? "—" : <FinancialValue value={financials.revenue}><PrivacyValue>{formatEur(financials.revenue)}</PrivacyValue></FinancialValue>}</td>
                    <td data-label="Lucro bruto">{financials.grossProfit === null ? "—" : <FinancialValue value={financials.grossProfit}><PrivacyValue>{formatEur(financials.grossProfit)}</PrivacyValue></FinancialValue>}</td>
                    <td data-label="Margem bruta">{financials.grossMarginPercent === null ? "—" : <PrivacyValue>{financials.grossMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</PrivacyValue>}</td>
                    <td data-label="Lucro final estimado">{financials.netProfitEstimate === null ? "—" : <FinancialValue value={financials.netProfitEstimate}><PrivacyValue>{formatEur(financials.netProfitEstimate)}</PrivacyValue></FinancialValue>}</td>
                    <td data-label="Margem líquida estimada">{financials.netMarginPercent === null ? "—" : <PrivacyValue>{financials.netMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</PrivacyValue>}</td>
                    <td data-label="Tipo">{sale.saleType.replace(/^VAT(\d+)%$/, "VAT $1%")}</td>
                    <td data-label="Fornecedor">{supplier?.name || "—"}</td>
                    <td data-label="IVA estimado">{financials.vatEstimate === null ? "—" : <FinancialValue value={-financials.vatEstimate}><PrivacyValue>{formatEur(financials.vatEstimate)}</PrivacyValue></FinancialValue>}</td>
                    <td data-label="Pagamento"><PaymentStatusBadge sale={sale} payments={data.payments} /></td>
                    <td data-label="Declarado?">{sale.saleType === "PRIVATE" ? "PRIVATE" : sale.declared === "YES" ? <span className="declared-badge declared-badge--yes">Sim</span> : <span className="declared-badge declared-badge--no">Não</span>}</td>
                    <td data-label="Track">{sale.trackingUrl ? <a href={sale.trackingUrl} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                    <td className="pending-sale-actions sales-actions-cell" data-label="Ações">
                      <button className="button button--small" type="button" onClick={() => setDetailsSale(sale)}>Detalhes</button>
                      <button className="button button--small" type="button" onClick={() => duplicateSale(sale)}>Duplicar</button>
                      <button className="button button--small" type="button" onClick={() => editSale(sale)}>Editar</button>
                      <button className="button button--small button--danger" type="button" onClick={() => deleteSale(sale)}>Eliminar</button>
                    </td>
                  </tr>;
                  })
                  : <tr><td className="table-empty" colSpan={17}>
                    {query ? "Não foram encontradas vendas." : "Ainda não há vendas concluídas."}
                  </td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detailsSale && <SaleDetailsModal sale={detailsSale} data={data} onClose={() => setDetailsSale(null)} />}

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="completed-sale-modal-title">
          <header className="sale-modal__header">
            <h2 id="completed-sale-modal-title">{editingSale ? "Editar Venda Concluída" : "Nova Venda Concluída"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form key={editingSale?.id ?? "new-sale"} onSubmit={saveSale}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field"><span>Data</span><input name="soldAt" type="date" defaultValue={editingSale?.soldAt.slice(0, 10) ?? today} required /></label>
                <CustomerAutocomplete
                  customers={data.customers}
                  value={buyerName}
                  selectedCustomerId={customerId}
                  onChange={(value) => {
                    setBuyerName(value);
                    setCustomerId("");
                  }}
                  onSelect={(customer) => {
                    setBuyerName(customer.name);
                    setCustomerId(customer.id);
                  }}
                />
                {!editingSale && <label className="form-field"><span>Quantidade de vendas iguais</span><input name="saleQuantity" type="number" min="1" max="100" step="1" defaultValue="1" required /></label>}
                <label className="form-field"><span>SKU</span><input name="sku" required maxLength={80} defaultValue={editingSale?.lines[0]?.sku} /></label>
                <label className="form-field"><span>Tamanho</span><input name="size" maxLength={40} defaultValue={editingSale?.lines[0]?.size} /></label>
                <label className="form-field pending-sale-product-field"><span>Produto</span><input name="productName" required maxLength={160} defaultValue={editingSale?.lines[0]?.productName} /></label>
                <label className="form-field"><span>Custo</span><input name="cost" type="number" min="0" step="0.01" defaultValue={editingSale?.lines[0]?.unitCost ?? 0} required /></label>
                <label className="form-field"><span>Venda</span><input name="salePrice" type="number" min="0.01" step="0.01" defaultValue={editingSale?.lines[0]?.unitPrice} required /></label>
                <label className="form-field"><span>Custo Envio</span><input name="shippingCost" type="number" min="0" step="0.01" defaultValue={editingSale?.shippingCost ?? 0} required /></label>
                <label className="form-field"><span>Tipo</span><select name="saleType" value={saleType} onChange={(event) => {
                  const value = saleTypes.find((type) => type.value === event.target.value)?.value;
                  if (value) setSaleType(value);
                }}>{saleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label className="form-field"><span>Pagamento</span><select name="paymentMode" value={paymentMode} onChange={(event) => {
                  if (event.target.value === "KEEP" || event.target.value === "PENDING" || event.target.value === "PARTIAL" || event.target.value === "PAID") setPaymentMode(event.target.value);
                }}>
                  {editingSale
                    ? <>
                      <option value="KEEP">Manter pagamentos atuais</option>
                      <option value="PARTIAL">Registar pagamento parcial</option>
                      <option value="PAID">Marcar como pago</option>
                    </>
                    : <>
                      <option value="PENDING">Pendente</option>
                      <option value="PARTIAL">Parcial</option>
                      <option value="PAID">Pago</option>
                    </>}
                </select>
                  {editingSale && <small>Recebido: {formatEur(paymentsTotal(editingSale.id, data.payments))}</small>}
                </label>
                {paymentMode === "PARTIAL" && <label className="form-field"><span>{editingSale ? "Novo pagamento parcial" : "Parte paga / Caução"}</span><input name="paidAmount" type="number" min="0.01" step="0.01" defaultValue="0" required /></label>}
                <SupplierAutocomplete
                  suppliers={data.suppliers}
                  value={supplierName}
                  selectedSupplierId={supplierId}
                  onChange={(value) => {
                    setSupplierName(value);
                    setSupplierId("");
                  }}
                  onSelect={(supplier) => {
                    setSupplierName(supplier.name);
                    setSupplierId(supplier.id);
                  }}
                />
                <label className="form-field"><span>Link Rastreamento</span><input name="trackingUrl" type="url" placeholder="https://..." defaultValue={editingSale?.trackingUrl} /></label>
                <label className="form-field"><span>Declarado?</span>{saleType === "PRIVATE"
                  ? <input value="PRIVATE" readOnly aria-label="Declarado: PRIVATE" />
                  : <select name="declared" value={declaredValue} onChange={(event) => {
                    if (event.target.value === "YES" || event.target.value === "NO") setDeclaredValue(event.target.value);
                  }}><option value="NO">Não</option><option value="YES">Sim</option></select>}</label>
                {saleType !== "PRIVATE" && declaredValue === "YES" && <label className="form-field"><span>Nº da fatura</span><input name="invoiceNumber" maxLength={80} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>}
                <label className="form-field sale-modal__notes"><span>Obs</span><textarea name="notes" rows={3} maxLength={1000} defaultValue={editingSale?.notes} /></label>
              </div>
              <p className="form-note">{editingSale
                ? "Os pagamentos registados serão preservados. A edição não altera o stock."
                : "Cria vendas independentes com os mesmos dados (máximo 100). Não exige stock e não altera unidades disponíveis."} Os preços de venda são considerados finais, com IVA incluído. O IVA é uma estimativa matemática do tipo selecionado; a aplicação não valida a elegibilidade legal para taxa zero ou regime da margem.</p>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">{editingSale ? "Guardar alterações" : "Guardar venda"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
