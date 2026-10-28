import type { Metadata } from "next";
import { SupplierCategorySitesPage } from "../../../components/supplier-categories-page";

export const metadata: Metadata = { title: "Categoria de fornecedores" };
export const instant = false;

export default async function SupplierCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  return <SupplierCategorySitesPage categoryId={categoryId} />;
}
