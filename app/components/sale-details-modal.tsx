"use client";

import {
  calculateSaleFinancialMetrics,
  formatEur,
  paymentStatus,
  type LocalData,
  type Sale,
} from "../lib/local-data";
import { FinancialValue, PrivacyValue } from "./workspace-shell";

function valueLabel(value: number | null) {
  if (value === null) return "—";
  return <FinancialValue value={value}><PrivacyValue>{formatEur(value)}</PrivacyValue></FinancialValue>;
}

export function SaleDetailsModal({
  sale,
  data,
  onClose,
}: {
  sale: Sale;
  data: LocalData;
  onClose: () => void;
}) {
  const financials = calculateSaleFinancialMetrics(sale, data);
  const supplier = data.suppliers.find((item) => item.id === sale.supplierId);
  const customer = data.customers.find((item) => item.id === sale.customerId);
  const paid = paymentStatus(sale, data.payments);

  return (
    <div className="sale-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sale-modal sale-details-modal" role="dialog" aria-modal="true" aria-labelledby="sale-details-title">
        <header className="sale-modal__header">
          <div>
            <h2 id="sale-details-title">Detalhes da venda</h2>
            <p>{sale.buyerName || customer?.name || "Comprador não indicado"}</p>
          </div>
          <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <div className="sale-details__metrics">
          <div><span>Custo de compra</span><strong>{valueLabel(financials.cost)}</strong></div>
          <div><span>Preço de venda</span><strong>{valueLabel(financials.revenue)}</strong></div>
          <div><span>Lucro bruto</span><strong>{valueLabel(financials.grossProfit)}</strong></div>
          <div><span>Margem bruta sobre venda</span><strong>{financials.grossMarginPercent === null ? "—" : <PrivacyValue>{financials.grossMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue>}</strong></div>
          <div><span>Margem líquida estimada sobre venda</span><strong>{financials.netMarginPercent === null ? "—" : <PrivacyValue>{financials.netMarginPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue>}</strong></div>
          <div><span>Rentabilidade sobre custo total</span><strong>{financials.returnOnCostPercent === null ? "—" : <PrivacyValue>{financials.returnOnCostPercent.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</PrivacyValue>}</strong></div>
          <div><span>Lucro líquido estimado</span><strong>{valueLabel(financials.netProfitEstimate)}</strong></div>
          <div><span>IVA estimado</span><strong>{valueLabel(financials.vatEstimate)}</strong></div>
          <div><span>Envio</span><strong>{valueLabel(financials.shipping)}</strong></div>
          <div><span>Outras despesas associadas</span><strong>{valueLabel(financials.expenses)}</strong></div>
          <div><span>Reembolsos</span><strong>{valueLabel(financials.refunds)}</strong></div>
        </div>
        <p className="sale-details__financial-note">
          Os preços são considerados finais, com IVA incluído. O IVA e o lucro líquido são estimativas matemáticas com base no tipo selecionado; a aplicação não valida a elegibilidade legal para taxa zero ou regime da margem. Confirma o tratamento fiscal aplicável antes de usar estes valores para apuramento fiscal.
        </p>
        <div className="sale-details__lines">
          <h3>Produtos</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Produto</th><th>Tamanho</th><th>Qtd.</th><th>Custo unit.</th><th>Venda unit.</th></tr></thead>
              <tbody>{sale.lines.map((line, index) => (
                <tr key={`${line.productId}-${line.sku ?? ""}-${index}`}>
                  <td>{line.sku || "—"}</td>
                  <td>{line.productName || data.products.find((item) => item.id === line.productId)?.name || "Produto"}</td>
                  <td>{line.size || "—"}</td>
                  <td>{line.quantity}</td>
                  <td>{valueLabel(line.unitCost ?? null)}</td>
                  <td>{valueLabel(line.unitPrice)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <dl className="sale-details__list">
          <div><dt>Data</dt><dd>{new Intl.DateTimeFormat("pt-PT").format(new Date(`${sale.soldAt.slice(0, 10)}T12:00:00`))}</dd></div>
          <div><dt>Tipo</dt><dd>{sale.saleType.replace(/^VAT(\d+)%$/, "VAT $1%")}</dd></div>
          <div><dt>Nº da fatura</dt><dd>{sale.invoiceNumber || "—"}</dd></div>
          <div><dt>Pagamento</dt><dd>{paid}</dd></div>
          <div><dt>Fornecedor</dt><dd>{supplier?.name || "—"}</dd></div>
          <div><dt>Declarado?</dt><dd>{sale.saleType === "PRIVATE" ? "PRIVATE" : sale.declared === "YES" ? "Sim" : "Não"}</dd></div>
          <div><dt>Rastreamento</dt><dd>{sale.trackingUrl
            ? <a href={sale.trackingUrl} target="_blank" rel="noreferrer">Abrir link</a>
            : "—"}</dd></div>
          <div className="sale-details__notes"><dt>Obs</dt><dd>{sale.notes || "Sem observações."}</dd></div>
        </dl>
        <footer className="sale-modal__footer">
          <button className="button" type="button" onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>
  );
}
