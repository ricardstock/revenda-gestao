"use client";

import { useState } from "react";
import {
  deleteSaleAndRelatedData,
  roundMoney,
  type Sale,
} from "../lib/local-data";
import { useLocalData } from "./local-data-provider";

type Props = {
  selectedIds: string[];
  onClear: () => void;
  onNotice: (message: string, isError?: boolean) => void;
};

const empty = { type: "", declared: "", soldAt: "", price: "", cost: "", shipping: "", buyer: "" };

function parseMoney(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function BulkSaleBar({ selectedIds, onClear, onNotice }: Props) {
  const { update } = useLocalData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setForm((current) => ({ ...current, ...patch }));
  const count = selectedIds.length;
  if (!count) return null;

  function apply() {
    const price = form.price.trim() ? parseMoney(form.price) : undefined;
    const cost = form.cost.trim() ? parseMoney(form.cost) : undefined;
    const shipping = form.shipping.trim() ? parseMoney(form.shipping) : undefined;
    if (price === null || cost === null || shipping === null) {
      onNotice("Preço, custo e envio têm de ser números válidos.", true);
      return;
    }
    const ids = new Set(selectedIds);
    try {
      update((current) => ({
        ...current,
        sales: current.sales.map((sale): Sale => {
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
            invoiceNumber: declared === "YES" ? sale.invoiceNumber : "",
            soldAt: form.soldAt || sale.soldAt,
            buyerName: form.buyer.trim() || sale.buyerName,
            shippingCost: shipping === undefined ? sale.shippingCost : roundMoney(shipping),
            lines: sale.lines.map((line) => ({
              ...line,
              unitPrice: price === undefined ? line.unitPrice : roundMoney(price),
              unitCost: cost === undefined ? line.unitCost : roundMoney(cost),
            })),
          };
        }),
      }));
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
      update((current) => selectedIds.reduce((data, id) => deleteSaleAndRelatedData(data, id), current));
      onNotice(`${count} vendas eliminadas.`);
      onClear();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "Não foi possível eliminar as vendas.", true);
    }
  }

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
            <label className="form-field"><span>Data</span>
              <input type="date" value={form.soldAt} onChange={(event) => set({ soldAt: event.target.value })} /></label>
            <label className="form-field"><span>Preço por unidade (€)</span>
              <input inputMode="decimal" placeholder="Manter" value={form.price} onChange={(event) => set({ price: event.target.value })} /></label>
            <label className="form-field"><span>Custo por unidade (€)</span>
              <input inputMode="decimal" placeholder="Manter" value={form.cost} onChange={(event) => set({ cost: event.target.value })} /></label>
            <label className="form-field"><span>Envio (€)</span>
              <input inputMode="decimal" placeholder="Manter" value={form.shipping} onChange={(event) => set({ shipping: event.target.value })} /></label>
            <label className="form-field"><span>Comprador</span>
              <input placeholder="Manter" value={form.buyer} onChange={(event) => set({ buyer: event.target.value })} /></label>
            <button className="button button--primary" type="button" onClick={apply}>Aplicar às {count}</button>
          </div>
        </div>
      )}
    </div>
  );
}
