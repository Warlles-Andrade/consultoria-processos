export const initialMockProcesses = [
  {
    id: 1,
    cliente: 'Empresa Alpha S.A.',
    tipoCredito: 'PIS/COFINS',
    status: 'Não Iniciado',
    responsavel: 'Ana Paula',
    periodo: '01/2024 a 06/2024',
    observacoes: 'Processo aguardando documentação inicial.',
    empresa: 'Empresa Alpha S.A.'
  },
  {
    id: 2,
    cliente: 'Comércio Beta Ltda',
    tipoCredito: 'ICMS ST',
    status: 'Em Andamento',
    responsavel: 'Carlos Silva',
    periodo: '03/2024 a 05/2024',
    observacoes: 'Análise de documentos fiscais em progresso.',
    empresa: 'Comércio Beta Ltda'
  },
  {
    id: 3,
    cliente: 'Indústria Gama S.A.',
    tipoCredito: 'IRPJ/CSLL',
    status: 'Concluído',
    responsavel: 'Sofia Costa',
    periodo: '01/2023 a 12/2023',
    observacoes: 'Crédito recuperado com sucesso e enviado ao cliente.',
    empresa: 'Indústria Gama S.A.'
  },
  {
    id: 4,
    cliente: 'Serviços Delta Ltda',
    tipoCredito: 'PIS/COFINS',
    status: 'Paralisado',
    responsavel: 'Lucas Mendes',
    periodo: '02/2024 a 04/2024',
    observacoes: 'Processo paralisado aguardando decisão judicial.',
    empresa: 'Serviços Delta Ltda'
  }
];

export const statusOptions = [
  'Não Iniciado',
  'Em Andamento',
  'Paralisado',
  'Concluído'
];

export const tiposCreditoOptions = [
  'LEV. TRIBUTÁRIO',
  'LEV. INSS',
  'E-CREDAC',
  'RESSARCIMENTO ICMS-ST',
  'LEV. AÇÃO JUDICIAL',
  'OUTROS'
];

export const initialResponsaveis = [
  { name: 'Ana Paula', email: 'ana.paula@email.com' },
  { name: 'Carlos Silva', email: 'carlos.silva@email.com' },
  { name: 'Sofia Costa', email: 'sofia.costa@email.com' },
  { name: 'Lucas Mendes', email: 'lucas.mendes@email.com' },
  { name: 'Mariana Lima', email: 'mariana.lima@email.com' }
];

export const initialEmpresas = [
    'Empresa Alpha S.A.',
    'Comércio Beta Ltda',
    'Indústria Gama S.A.',
    'Serviços Delta Ltda',
    'Consultoria Epsilon'
];

export const getStatusColor = (status, forBorder = false) => {
  const colors = {
    'Não Iniciado': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', borderTop: 'border-t-gray-400' },
    'Em Andamento': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', borderTop: 'border-t-blue-500' },
    'Paralisado': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', borderTop: 'border-t-orange-500' },
    'Concluído': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', borderTop: 'border-t-green-500' },
  };
  const defaultColor = { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', borderTop: 'border-t-yellow-400' };
  const colorSet = colors[status] || defaultColor;
  
  if (forBorder) {
    return colorSet.borderTop;
  }
  return `${colorSet.bg} ${colorSet.text} ${colorSet.border}`;
};

// Retorna { dias, isOverdue } para exibição da contagem de dias do processo.
// Se concluído, usa o valor gravado em dias_processo.
// Se ativo, calcula entre data_inicio e hoje; se passou do prazo, isOverdue = true.
export const calcDiasProcesso = (process) => {
  if (!process.data_inicio) return null;

  if (process.status === 'Concluído') {
    if (process.dias_processo != null) return { dias: process.dias_processo, isOverdue: false };
    return null;
  }

  const inicio = new Date(process.data_inicio + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.max(0, Math.round((hoje - inicio) / (1000 * 60 * 60 * 24)));

  let isOverdue = false;
  if (process.prazo) {
    const prazo = new Date(process.prazo + 'T00:00:00');
    isOverdue = hoje > prazo;
  }

  return { dias, isOverdue };
};

// Retorna 'overdue' se passou do prazo, 'today' se é hoje, 'ok' caso contrário.
// Ignora processos Concluídos.
export const getPrazoStatus = (process) => {
  if (!process.prazo || process.status === 'Concluído') return 'ok';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(process.prazo + 'T00:00:00');
  if (prazo < hoje) return 'overdue';
  if (prazo.getTime() === hoje.getTime()) return 'today';
  return 'ok';
};

export const getPriorityColor = (priority) => {
  const colors = {
    'Alta':  'bg-red-100 text-red-800 border-red-300',
    'Média': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'Baixa': 'bg-green-100 text-green-800 border-green-300',
  };
  return colors[priority] || 'bg-gray-100 text-gray-600 border-gray-300';
};

export const getProgressByStatus = (status) => {
  const progress = {
    'Não Iniciado': 5,
    'Em Andamento': 50,
    'Paralisado': 25,
    'Concluído': 100,
  };
  return progress[status] || 0;
};
