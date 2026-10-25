"use client";

import { useState } from "react";
import {
  deleteSaleAndRelatedData,
  makeId,
  roundMoney,
  saleOutstanding,
  type Sale,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";

type Props = {
  selectedIds: string[];
  onClear: () => void;
  onNotice: (message: string, isError?: boolean) => void;
};

const empty = {
  type: "", declared: "", soldAt: "", payment: "", supplierId: "",
  sku: "", size: "", productName: "", buyer: "", invoice: "", tracking: "", notes: "",
  price: "", cost: "", shipping: "",
};

function parseMoney(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function BulkSaleBar({ selectedIds, onClear, onNotice }: Props) {
  const { data, update } = useLocalData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setForm((current) => ({ ...current, ...patch }));
  const count = selectedIds.length;
  if (!count) return null;

  function apply() {
    const price = form.price.trim() ? parseMoney(form.price) : undefined;
    const cost = form.cost.trim() ? parseMoney(form.cost) : undefined;
    const shipping = form.shipping.trim() ? parseMoney(form.shipping) : undefined;
    if (price === null || cost === null || shipping === null || price === 0) {
      onNotice("Preço, custo e envio têm de ser números válidos (o preço superior a zero).", true);
      return;
    }
    if (form.tracking.trim()) {
      try {
        const url = new URL(form.tracking.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        onNotice("O link de rastreio tem de começar por http:// ou https://.", true);
        return;
      }
    }
    const ids = new Set(selectedIds);
    try {
      update((current) => {
        const sales = current.sales.map((sale): Sale => {
          if (!ids.has(sale.id)) return sale;
          const saleType = (form.type || sale.saleType) as Sale["saleType"];
          let declared = sale.declared;
          if (saleType === "PRIVATE") declared = "PRIVATE";
          else if (form.declared) declared = form.declared as Sale["declared"];
          else if (declared === "PRIVATE") declared = "NO";
          return {
            ...sale,
            saleType,
            declared,
            invoiceNumber: declared === "YES" ? form.invoice.trim() || sale.invoiceNumber : "",
            soldAt: form.soldAt || sale.soldAt,
            buyerName: form.buyer.trim() || sale.buyerName,
            supplierId: form.supplierId || sale.supplierId,
            trackingUrl: form.tracking.trim() || sale.trackingUrl,
            notes: form.notes.trim() || sale.notes,
            shippingCost: shipping === undefined ? sale.shippingCost : roundMoney(shipping),
            lines: sale.lines.map((line, index) => index > 0 ? line : {
              ...line,
              sku: form.sku.trim() || line.sku,
              size: form.size.trim() || line.size,
              productName: form.productName.trim() || line.productName,
              unitPrice: price === undefined ? line.unitPrice : roundMoney(price),
              unitCost: cost === undefined ? line.unitCost : roundMoney(cost),
            }),
          };
        });
        const newPayments = form.payment === "PAID"
          ? sales.filter((sale) => ids.has(sale.id)).flatMap((sale) => {
            const outstanding = saleOutstanding(sale, current.payments);
            return outstanding > 0
              ? [{
                id: makeId(),
                saleId: sale.id,
                amount: outstanding,
                method: "OTHER" as const,
                paidAt: form.soldAt || sale.soldAt.slice(0, 10),
                reference: "",
              }]
              : [];
          })
          : [];
        return { ...current, sales, payments: [...newPayments, ...current.payments] };
      });
      onNotice(`${count} ${count === 1 ? "venda atualizada" : "vendas atualizadas"}.`);
      setForm(empty);
      setOpen(false);
      onClear();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "Não foi possível atualizar as vendas.", true);
    }
  }

  function remove() {
    if (!window.confirm(`Eliminar ${count} vendas e os respetivos pagamentos, despesas e devoluções? Esta ação não pode ser anulada.`)) return;
    try {
      update((current) => selectedIds.reduce((acc, id) => deleteSaleAndRelatedData(acc, id), current));
      onNotice(`${count} vendas eliminadas.`);
      onClear();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "Não foi possível eliminar as vendas.", true);
    }
  }

  const text = (label: string, key: keyof typeof empty) => (
    <label className="form-field"><span>{label}</span>
      <input placeholder="Manter" value={form[key]} onChange={(event) => set({ [key]: event.target.value })} /></label>
  );

  return (
    <div className="bulk-sale-bar">
      <div className="bulk-sale-bar__top">
        <strong>{count} {count === 1 ? "venda selecionada" : "vendas selecionadas"}</strong>
        <div>
          <button className="button button--small button--primary" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "Fechar edição" : "Editar selecionadas"}
          </button>
          <button className="button button--small button--danger" type="button" onClick={remove}>Eliminar selecionadas</button>
          <button className="button button--small" type="button" onClick={onClear}>Limpar seleção</button>
        </div>
      </div>
      {open && (
        <div className="bulk-sale-bar__form">
          <p>Só os campos preenchidos são alterados, em todas as vendas selecionadas.</p>
          <div className="tax-sales-filters">
            {text("SKU", "sku")}
            {text("Tamanho", "size")}
            {text("Produto", "productName")}
            {text("Comprador", "buyer")}
            <label className="form-field"><span>Fornecedor</span>
              <select value={form.supplierId} onChange={(event) => set({ supplierId: event.target.value })}>
                <option value="">Manter</option>
                {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select></label>
            <label className="form-field"><span>Data</span>
              <input type="date" value={form.soldAt} onChange={(event) => set({ soldAt: event.target.value })} /></label>
            {text("Custo por unidade (€)", "cost")}
            {text("Venda por unidade (€)", "price")}
            {text("Custo envio (€)", "shipping")}
            <label className="form-field"><span>Tipo de venda</span>
              <select value={form.type} onChange={(event) => set({ type: event.target.value })}>
                <option value="">Manter</option>
                <option value="PRIVATE">Private</option>
                <option value="MARGIN">Margin</option>
                <option value="VAT23%">VAT 23%</option>
                <option value="VAT0%">VAT 0%</option>
              </select></label>
            <label className="form-field"><span>Declarado</span>
              <select value={form.declared} onChange={(event) => set({ declared: event.target.value })}>
                <option value="">Manter</option>
                <option value="YES">Sim</option>
                <option value="NO">Não</option>
              </select></label>
            {text("Nº da fatura", "invoice")}
            <label className="form-field"><span>Pagamento</span>
              <select value={form.payment} onChange={(event) => set({ payment: event.target.value })}>
                <option value="">Manter</option>
                <option value="PAID">Marcar como pago</option>
              </select></label>
            {text("Link rastreamento", "tracking")}
            {text("Obs", "notes")}
            <button className="button button--primary" type="button" onClick={apply}>Aplicar às {count}</button>
          </div>
        </div>
      )}
    </div>
  );
}
