export type SectionId =
  | "produtos"
  | "vendas"
  | "encomendas-pendentes"
  | "compras-entregas"
  | "stock"
  | "inventario"
  | "fornecedores"
  | "clientes"
  | "despesas"
  | "devolucoes-reembolsos"
  | "produtos-a-caminho"
  | "relatorios"
  | "simulador-lucro"
  | "assistente-ia"
  | "definicoes"
  | "estatisticas-mensais"
  | "estatisticas-trimestrais";

export type NavigationItem = {
  id: "dashboard" | SectionId;
  label: string;
  href: string;
  description: string;
};

export const navigationItems: NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    description: "Resumo do negócio e indicadores do período.",
  },
  {
    id: "estatisticas-mensais",
    label: "Estatísticas mensais",
    href: "/estatisticas-mensais",
    description: "Analise faturação, lucros e vendas por mês.",
  },
  {
    id: "estatisticas-trimestrais",
    label: "Estatísticas trimestrais",
    href: "/estatisticas-trimestrais",
    description: "Compare o desempenho da plataforma por trimestre.",
  },
  {
    id: "produtos",
    label: "Produtos",
    href: "/produtos",
    description: "Gira o catálogo de produtos e referências.",
  },
  {
    id: "vendas",
    label: "Vendas concluídas",
    href: "/vendas",
    description: "Consulte vendas concluídas e o stock associado.",
  },
  {
    id: "encomendas-pendentes",
    label: "Vendas pendentes",
    href: "/encomendas-pendentes",
    description: "Registe vendas por concluir e acompanhe pagamentos sem reservar stock.",
  },
  {
    id: "compras-entregas",
    label: "Compras e entregas",
    href: "/compras-entregas",
    description: "Registe compras e acompanhe entregas totais ou parciais.",
  },
  {
    id: "produtos-a-caminho",
    label: "Produtos a caminho",
    href: "/produtos-a-caminho",
    description: "Registe compras por receber e adicione-as ao stock quando chegarem.",
  },
  {
    id: "stock",
    label: "Stock",
    href: "/stock",
    description: "Consulte unidades disponíveis, localização e estado operacional.",
  },
  {
    id: "inventario",
    label: "Inventário",
    href: "/inventario",
    description: "Prepare contagens e consulte o histórico de movimentos.",
  },
  {
    id: "fornecedores",
    label: "Fornecedores",
    href: "/fornecedores",
    description: "Consulte a informação dos seus fornecedores.",
  },
  {
    id: "clientes",
    label: "Clientes",
    href: "/clientes",
    description: "Consulte a informação dos seus clientes.",
  },
  {
    id: "despesas",
    label: "Despesas",
    href: "/despesas",
    description: "Acompanhe portes, comissões e outras despesas de venda.",
  },
  {
    id: "devolucoes-reembolsos",
    label: "Devoluções e reembolsos",
    href: "/devolucoes-reembolsos",
    description: "Registe devoluções, decisões de inspeção e reembolsos.",
  },
  {
    id: "relatorios",
    label: "Relatórios",
    href: "/relatorios",
    description: "Prepare relatórios e exportações dos seus dados.",
  },
  {
    id: "simulador-lucro",
    label: "Simulador de lucro",
    href: "/simulador-lucro",
    description: "Explore cenários de preço e margem sem os guardar.",
  },
  {
    id: "assistente-ia",
    label: "Assistente IA",
    href: "/assistente-ia",
    description: "Consulte informação sem permitir alterações aos dados.",
  },
  {
    id: "definicoes",
    label: "Definições",
    href: "/definicoes",
    description: "Configure as preferências da plataforma.",
  },
];

export const pageTitles: Record<SectionId, string> = {
  produtos: "Produtos",
  vendas: "Vendas concluídas",
  "encomendas-pendentes": "Vendas pendentes",
  "compras-entregas": "Compras e entregas",
  "produtos-a-caminho": "Produtos a caminho",
  stock: "Stock",
  inventario: "Inventário",
  fornecedores: "Fornecedores",
  clientes: "Clientes",
  despesas: "Despesas",
  "devolucoes-reembolsos": "Devoluções e reembolsos",
  relatorios: "Relatórios",
  "simulador-lucro": "Simulador de lucro",
  "assistente-ia": "Assistente IA",
  definicoes: "Definições",
  "estatisticas-mensais": "Estatísticas mensais",
  "estatisticas-trimestrais": "Estatísticas trimestrais",
};
