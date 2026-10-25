import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { StockPage } from "../../components/stock-page";
import { IncomingStockPage } from "../../components/incoming-stock-page";
import { ContactsPage } from "../../components/contacts-page";
import { ExpensesPage } from "../../components/expenses-page";
import { PendingSalesPage } from "../../components/pending-sales-page";
import { CompletedSalesPage } from "../../components/completed-sales-page";
import { TaxSalesPage } from "../../components/tax-sales-page";
import { StatisticsPage } from "../../components/statistics-page";
import {
  navigationItems,
  pageTitles,
  type SectionId,
} from "../../lib/navigation";

export function generateStaticParams() {
  return navigationItems
    .filter((item): item is typeof item & { id: SectionId } => item.id !== "dashboard")
    .map((item) => ({ section: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  if (!Object.hasOwn(pageTitles, section)) return {};
  return { title: pageTitles[section as SectionId] };
}

async function SectionContent({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(pageTitles, section)) notFound();
  if (section === "stock") return <StockPage />;
  if (section === "produtos-a-caminho") return <IncomingStockPage />;
  if (section === "fornecedores") return <ContactsPage kind="suppliers" />;
  if (section === "clientes") return <ContactsPage kind="customers" />;
  if (section === "despesas") return <ExpensesPage />;
  if (section === "encomendas-pendentes") return <PendingSalesPage />;
  if (section === "vendas") return <CompletedSalesPage />;
  if (section === "vendas-iva-margem") return <TaxSalesPage />;
  if (section === "estatisticas-mensais") return <StatisticsPage mode="monthly" />;
  if (section === "estatisticas-trimestrais") return <StatisticsPage mode="quarterly" />;
  redirect("/");
}

export default function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<div className="page-stack" aria-busy="true">A carregar a secção...</div>}>
      <SectionContent params={params} />
    </Suspense>
  );
}
