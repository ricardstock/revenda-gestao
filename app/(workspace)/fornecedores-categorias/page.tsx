import type { Metadata } from "next";
import { SupplierCategoryFoldersPage } from "../../components/supplier-categories-page";

export const metadata: Metadata = { title: "Fornecedores por categoria" };

export default function SupplierCategoriesPage() {
  return <SupplierCategoryFoldersPage />;
}
