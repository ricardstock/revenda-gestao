"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatEur, localDateString, makeId, roundMoney, sumMoney, type Expense } from "../lib/local-data";
import { useLocalData } from "./local-data-provider";
import { FinancialValue, PrivacyValue } from "./workspace-shell";

const categories = [
  "IVA",
  "Segurança Social",
  "Envios",
  "Embalagens",
  "Fita cola",
  "Contabilista",
  "Fees / comissões",
  "Outros",
];

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day
    ? new Intl.DateTimeFormat("pt-PT").format(new Date(year, month - 1, day))
    : value;
}

export function ExpensesPage() {
  const { data, ready, error, update } = useLocalData();
  const [month, setMonth] = useState("");
  const [today, setToday] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const editingExpense = data.expenses.find((expense) => expense.id === editingId);
  const thisMonthExpenses = data.expenses.filter((expense) => expense.incurredAt.startsWith(month));
  const monthTotal = sumMoney(thisMonthExpenses.map((expense) => expense.amount));
  const total = sumMoney(data.expenses.map((expense) => expense.amount));
  const rows = useMemo(
    () => [...data.expenses]
      .filter((expense) => showAll || expense.incurredAt.startsWith(month))
      .sort((a, b) => b.incurredAt.localeCompare(a.incurredAt)),
    [data.expenses, month, showAll],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const currentDate = localDateString(new Date());
      setToday(currentDate);
      setMonth(currentDate.slice(0, 7));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const category = String(values.get("category") ?? "").trim();
    const description = String(values.get("description") ?? "").trim();
    const incurredAt = String(values.get("incurredAt") ?? "");
    const amountValue = Number(values.get("amount"));
    try {
      if (!category || !description || !incurredAt) {
        throw new Error("Preenche a categoria, a descrição e a data.");
      }
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error("O valor tem de ser superior a zero.");
      }
      const expense: Expense = {
        id: editingId ?? makeId(),
        saleId: String(values.get("saleId") ?? ""),
        category,
        description,
        amount: roundMoney(amountValue),
        incurredAt,
      };
      update((current) => ({
        ...current,
        expenses: editingId
          ? current.expenses.map((item) => item.id === editingId ? expense : item)
          : [expense, ...current.expenses],
      }));
      setNotice(editingId ? "Despesa atualizada." : "Despesa registada.");
      setFormError("");
      setModalOpen(false);
      setEditingId(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível guardar a despesa.");
    }
  }

  function removeExpense(expense: Expense) {
    if (!window.confirm(`Eliminar a despesa “${expense.description}”?`)) return;
    try {
      update((current) => ({
        ...current,
        expenses: current.expenses.filter((item) => item.id !== expense.id),
      }));
      setNotice("Despesa eliminada.");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível eliminar a despesa.");
      setNotice("");
    }
  }

  return (
    <div className="page-stack stock-page expenses-page">
      <header className="stock-page__header">
        <div>
          <div className="eyebrow">CONTROLO DE CUSTOS</div>
          <h1>Despesas</h1>
          <p>Regista e acompanha os custos do negócio ao longo do tempo.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => {
          setEditingId(null);
          setFormError("");
          setModalOpen(true);
        }}>+ Adicionar despesa</button>
      </header>

      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {formError && !modalOpen && <p className="feedback feedback--error" role="alert">{formError}</p>}

      <section className="stock-summary" aria-label="Resumo das despesas">
        <div><span>Despesas em {month}</span><strong><FinancialValue value={-monthTotal}><PrivacyValue>{ready ? formatEur(monthTotal) : "…"}</PrivacyValue></FinancialValue></strong></div>
        <div><span>Total registado</span><strong><FinancialValue value={-total}><PrivacyValue>{ready ? formatEur(total) : "…"}</PrivacyValue></FinancialValue></strong></div>
        <div><span>Registos</span><strong>{ready ? data.expenses.length : "…"}</strong></div>
      </section>

      <section className="content-panel">
        <div className="content-panel__top expenses-list__top">
          <div><h2>Histórico de despesas</h2><p>{rows.length} registos</p></div>
          <div className="expenses-filters">
            {!showAll && <label className="form-field"><span>Mês</span><input aria-label="Filtrar despesas por mês" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}
            <label className="stock-archived-toggle">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              Mostrar todo o histórico
            </label>
          </div>
        </div>
        <div className="table-wrap expenses-table-wrap">
          <table className="data-table expenses-table">
            <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead>
            <tbody>
              {!ready
                ? <tr><td className="table-empty" colSpan={5}>A carregar despesas locais…</td></tr>
                : rows.length
                  ? rows.map((expense) => <tr key={expense.id}>
                    <td data-label="Data">{formatDate(expense.incurredAt)}</td>
                    <td data-label="Categoria"><span className="expense-category">{expense.category}</span></td>
                    <td data-label="Descrição">{expense.description}</td>
                    <td className="expense-amount" data-label="Valor"><FinancialValue value={-expense.amount}><PrivacyValue>{formatEur(expense.amount)}</PrivacyValue></FinancialValue></td>
                    <td className="expenses-actions-cell" data-label="Ações">
                      <button className="button button--small" type="button" onClick={() => {
                        setEditingId(expense.id);
                        setFormError("");
                        setModalOpen(true);
                      }}>Editar</button>
                      <button className="button button--small button--danger" type="button" onClick={() => removeExpense(expense)}>Eliminar</button>
                    </td>
                  </tr>)
                  : <tr><td className="table-empty" colSpan={5}>
                    {showAll ? "Ainda não há despesas registadas." : "Não há despesas neste mês."}
                  </td></tr>}
            </tbody>
          </table>
        </div>
        <p className="expenses-note">Registo local. Associa fees e outros custos diretamente à venda para os incluir nos detalhes. Se o envio já estiver preenchido na venda, a despesa associada da categoria Envios não é deduzida novamente. Despesas da categoria IVA também não são deduzidas novamente no lucro líquido estimado.</p>
      </section>

      {modalOpen && <div className="sale-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <section className="sale-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
          <header className="sale-modal__header">
            <h2 id="expense-modal-title">{editingExpense ? "Editar despesa" : "Adicionar despesa"}</h2>
            <button className="sale-modal__close" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)}>×</button>
          </header>
          <form onSubmit={saveExpense}>
            <div className="sale-modal__body">
              {formError && <p className="feedback feedback--error" role="alert">{formError}</p>}
              <div className="form-grid">
                <label className="form-field"><span>Categoria</span><select name="category" defaultValue={editingExpense?.category ?? "IVA"} required>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  {editingExpense && !categories.includes(editingExpense.category) && <option value={editingExpense.category}>{editingExpense.category}</option>}
                </select></label>
                <label className="form-field"><span>Data</span><input name="incurredAt" type="date" defaultValue={editingExpense?.incurredAt ?? today} required /></label>
                <label className="form-field stock-modal__wide"><span>Descrição</span><input name="description" required defaultValue={editingExpense?.description} /></label>
                <label className="form-field"><span>Valor (€)</span><input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editingExpense?.amount} /></label>
                <label className="form-field stock-modal__wide"><span>Venda associada (opcional)</span><select name="saleId" defaultValue={editingExpense?.saleId ?? ""}>
                  <option value="">Despesa geral, sem venda específica</option>
                  {data.sales.filter((sale) => sale.status !== "CANCELLED")
                    .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
                    .map((sale) => (
                      <option value={sale.id} key={sale.id}>
                        {formatDate(sale.soldAt)} · {sale.buyerName || "Cliente sem nome"} · {sale.lines[0]?.sku || sale.lines[0]?.productName || "Venda"}
                      </option>
                    ))}
                </select></label>
              </div>
            </div>
            <footer className="sale-modal__footer">
              <button className="button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="button button--primary" type="submit">Guardar despesa</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
