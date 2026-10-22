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

export const pageDescriptions: Record<SectionId, string> = {
  produtos: "Gira o catálogo e consulta as unidades disponíveis por produto.",
  vendas:
    "Registe cada venda e acompanhe o pagamento e o estado do stock.",
  "encomendas-pendentes":
    "Registe vendas por concluir e acompanhe pagamentos sem reservar stock.",
  "compras-entregas":
    "Acompanhe compras, entregas parciais e quantidades efetivamente recebidas.",
  "produtos-a-caminho":
    "Registe produtos encomendados e passe-os para o stock quando forem recebidos.",
  stock:
    "Consulte unidades disponíveis, custo de aquisição, localização e estado operacional.",
  inventario:
    "Prepare contagens e consulte movimentos de entrada, saída e devolução.",
  fornecedores: "Organize a informação de contacto e compras por fornecedor.",
  clientes: "Organize a informação de contacto e vendas por cliente.",
  despesas:
    "Acompanhe despesas associadas a vendas, como portes, comissões e taxas.",
  "devolucoes-reembolsos":
    "Registe devoluções, decisões de inspeção e reembolsos associados a vendas.",
  relatorios:
    "Prepare análises por período e exportações em formatos comuns.",
  "simulador-lucro":
    "Explore cenários de preço, custo e despesas sem alterar registos.",
  "assistente-ia":
    "Faça perguntas sobre os dados. O assistente será apenas de consulta.",
  definicoes:
    "Preferências da interface e opções da plataforma, disponíveis gradualmente.",
  "estatisticas-mensais":
    "Analise faturação, custos, lucros, clientes e produtos por mês.",
  "estatisticas-trimestrais":
    "Compare faturação, custos, lucros, clientes e produtos por trimestre.",
};
