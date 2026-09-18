/**
 * Catálogo de domínio fiscal/jurídico — CEP Consultoria.
 *
 * IMPORTANTE: as listas de opções abaixo espelham exatamente os CHECK
 * constraints das migrations em sql/2026-08-28_*.sql. Ao alterar uma lista
 * aqui, altere o CHECK correspondente no banco — e vice-versa. Divergência
 * vira erro 23514 no insert, não erro de validação amigável.
 */

// =====================================================================
// Contribuinte
// =====================================================================

export const regimeTributarioOptions = [
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Lucro Arbitrado',
  'Imune/Isento',
  'Não informado',
];

export const ufOptions = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

// =====================================================================
// Crédito
// =====================================================================

export const esferaOptions = ['Federal', 'Estadual', 'Municipal'];

export const tributoOptions = [
  'PIS', 'COFINS', 'PIS/COFINS', 'IPI', 'IRPJ', 'CSLL', 'IRPJ/CSLL',
  'INSS/CPRB', 'IRRF', 'ICMS', 'ICMS-ST', 'ISS', 'FGTS', 'Outros',
];

/** Qual esfera cada tributo pertence — usado para pré-selecionar o campo. */
export const tributoEsfera = {
  'PIS': 'Federal', 'COFINS': 'Federal', 'PIS/COFINS': 'Federal',
  'IPI': 'Federal', 'IRPJ': 'Federal', 'CSLL': 'Federal',
  'IRPJ/CSLL': 'Federal', 'INSS/CPRB': 'Federal', 'IRRF': 'Federal',
  'FGTS': 'Federal',
  'ICMS': 'Estadual', 'ICMS-ST': 'Estadual',
  'ISS': 'Municipal',
};

export const origemCreditoOptions = [
  'Administrativo',
  'Judicial',
  'Escritural',
  'Ressarcimento',
];

export const tipoLevantamentoOptions = [
  'LEV. TRIBUTÁRIO',
  'LEV. INSS',
  'E-CREDAC',
  'RESSARCIMENTO ICMS-ST',
  'LEV. AÇÃO JUDICIAL',
  'OUTROS',
];

export const situacaoCreditoOptions = [
  'Em levantamento',
  'Levantado',
  'Em habilitação',
  'Habilitado',
  'Em utilização',
  'Utilizado',
  'Indeferido',
  'Prescrito',
  'Encerrado',
];

/** Ordem do pipeline — usada como colunas do Kanban de créditos. */
export const pipelineCredito = [
  'Em levantamento',
  'Levantado',
  'Em habilitação',
  'Habilitado',
  'Em utilização',
  'Utilizado',
];

// =====================================================================
// Razão do crédito (credito_movimentos)
// =====================================================================

export const naturezaMovimentoOptions = [
  { value: 'C', label: 'Crédito (aumenta o saldo)' },
  { value: 'D', label: 'Débito (consome o saldo)' },
];

export const tipoMovimentoOptions = [
  'Apropriação',
  'Homologação',
  'Atualização monetária',
  'Ajuste a maior',
  'Compensação',
  'Ressarcimento em espécie',
  'Transferência a terceiros',
  'Liquidação de débito',
  'Glosa',
  'Estorno',
  'Ajuste a menor',
];

/** Natureza sugerida por tipo de movimento — evita erro de sinal no lançamento. */
export const naturezaPorTipoMovimento = {
  'Apropriação': 'C',
  'Homologação': 'C',
  'Atualização monetária': 'C',
  'Ajuste a maior': 'C',
  'Compensação': 'D',
  'Ressarcimento em espécie': 'D',
  'Transferência a terceiros': 'D',
  'Liquidação de débito': 'D',
  'Glosa': 'D',
  'Estorno': 'D',
  'Ajuste a menor': 'D',
};

// =====================================================================
// Habilitação — e-CredAc (SEFAZ)
// =====================================================================

export const regimeHabilitacaoOptions = [
  'CAT 207/2009',
  'CAT 83/2009',
  'CAT 26/2010',
  'Outro regime estadual',
];

export const regimeHabilitacaoDescricao = {
  'CAT 207/2009': 'Apropriação de crédito acumulado de ICMS (e-CredAc)',
  'CAT 83/2009': 'Ressarcimento do ICMS retido por substituição tributária',
  'CAT 26/2010': 'Regime especial correlato',
  'Outro regime estadual': 'Regime de outra unidade federativa',
};

export const modalidadeHabilitacaoOptions = [
  'Custeio',
  'Simplificado',
  'Automático',
  'Ressarcimento',
  'Compensação escritural',
  'Não se aplica',
];

/** Modalidades que fazem sentido para cada regime. */
export const modalidadesPorRegime = {
  'CAT 207/2009': ['Custeio', 'Simplificado', 'Automático'],
  'CAT 83/2009': ['Ressarcimento', 'Compensação escritural'],
  'CAT 26/2010': ['Não se aplica'],
  'Outro regime estadual': ['Não se aplica'],
};

export const situacaoHabilitacaoOptions = [
  'Em preparação',
  'Protocolado',
  'Em análise',
  'Em exigência',
  'Deferido',
  'Deferido parcialmente',
  'Indeferido',
  'Liquidado',
  'Arquivado',
  'Cancelado',
];

export const pipelineHabilitacao = [
  'Em preparação',
  'Protocolado',
  'Em análise',
  'Em exigência',
  'Deferido',
  'Liquidado',
];

// =====================================================================
// PER/DCOMP — federal
// =====================================================================

export const tipoPerdcompOptions = [
  'Restituição',
  'Ressarcimento',
  'Reembolso',
  'Compensação',
];

export const tipoDocumentoPerdcompOptions = ['PER', 'DCOMP', 'PER/DCOMP'];

export const situacaoPerdcompOptions = [
  'Em preparação',
  'Transmitido',
  'Em análise',
  'Deferido',
  'Deferido parcialmente',
  'Indeferido',
  'Homologado',
  'Homologado tacitamente',
  'Não homologado',
  'Retificado',
  'Cancelado',
];

export const pipelinePerdcomp = [
  'Em preparação',
  'Transmitido',
  'Em análise',
  'Deferido',
  'Homologado',
];

export const situacaoDebitoOptions = [
  'Compensado',
  'Não homologado',
  'Parcialmente homologado',
  'Cancelado',
];

// =====================================================================
// Contencioso administrativo
// =====================================================================

export const naturezaProcessoAdmOptions = [
  'Defesa',
  'Pleito de crédito',
  'Consulta',
];

export const tipoProcessoAdmOptions = [
  'Impugnação',
  'Defesa administrativa',
  'Recurso Voluntário',
  'Recurso de Ofício',
  'Recurso Especial',
  'Recurso Hierárquico',
  'Manifestação de Inconformidade',
  'Pedido de Restituição',
  'Consulta Formal',
  'Outro',
];

export const instanciaAdmOptions = [
  '1ª instância',
  '2ª instância',
  'Instância especial',
  'Encerrado',
];

export const situacaoProcessoAdmOptions = [
  'Em elaboração',
  'Protocolado',
  'Aguardando julgamento',
  'Em diligência',
  'Em exigência',
  'Pauta de julgamento',
  'Procedente',
  'Parcialmente procedente',
  'Improcedente',
  'Encerrado',
  'Prescrito',
  'Arquivado',
];

export const pipelineProcessoAdm = [
  'Em elaboração',
  'Protocolado',
  'Aguardando julgamento',
  'Em diligência',
  'Pauta de julgamento',
  'Encerrado',
];

/**
 * Catálogo de órgãos julgadores — SUGESTÕES editáveis.
 * O campo `orgao_atual` é texto livre no banco justamente para permitir
 * órgãos não listados aqui. Cada estado tem seu próprio tribunal.
 */
export const orgaosPorEsfera = {
  Federal: [
    { uf: null, nome: 'RFB — Delegacia da Receita Federal', instancia: '1ª instância' },
    { uf: null, nome: 'DRJ — Delegacia de Julgamento', instancia: '1ª instância' },
    { uf: null, nome: 'CARF — Conselho Administrativo de Recursos Fiscais', instancia: '2ª instância' },
    { uf: null, nome: 'CSRF — Câmara Superior de Recursos Fiscais', instancia: 'Instância especial' },
    { uf: null, nome: 'PGFN — Procuradoria-Geral da Fazenda Nacional', instancia: null },
  ],
  Estadual: [
    { uf: 'SP', nome: 'SEFAZ-SP — Posto Fiscal', instancia: '1ª instância' },
    { uf: 'SP', nome: 'DRT — Delegacia Regional Tributária', instancia: '1ª instância' },
    { uf: 'SP', nome: 'TIT-SP — Tribunal de Impostos e Taxas', instancia: '2ª instância' },
    { uf: 'SP', nome: 'Câmara Superior do TIT-SP', instancia: 'Instância especial' },
    { uf: 'MS', nome: 'SEFAZ-MS', instancia: '1ª instância' },
    { uf: 'MS', nome: 'TAT/MS — Tribunal Administrativo Tributário', instancia: '2ª instância' },
    { uf: 'MG', nome: 'CC/MG — Conselho de Contribuintes de Minas Gerais', instancia: '2ª instância' },
    { uf: 'PR', nome: 'CCRF/PR — Conselho de Contribuintes e Recursos Fiscais', instancia: '2ª instância' },
    { uf: 'GO', nome: 'CAT/GO — Conselho Administrativo Tributário', instancia: '2ª instância' },
    { uf: 'BA', nome: 'CONSEF/BA — Conselho de Fazenda Estadual', instancia: '2ª instância' },
    { uf: null, nome: 'SEFAZ (outra UF)', instancia: '1ª instância' },
    { uf: null, nome: 'Tribunal/Conselho Administrativo (outra UF)', instancia: '2ª instância' },
  ],
  Municipal: [
    { uf: null, nome: 'Secretaria Municipal de Fazenda', instancia: '1ª instância' },
    { uf: null, nome: 'Conselho Municipal de Tributos', instancia: '2ª instância' },
  ],
};

/** Nomes de órgãos para um dropdown simples, filtrado por esfera. */
export const orgaosDaEsfera = (esfera) =>
  (orgaosPorEsfera[esfera] || []).map((o) => o.nome);

// =====================================================================
// Contencioso judicial
// =====================================================================

export const tipoAcaoJudicialOptions = [
  'Mandado de Segurança',
  'Ação Ordinária',
  'Ação Declaratória',
  'Ação Anulatória',
  'Repetição de Indébito',
  'Embargos à Execução Fiscal',
  'Execução Fiscal',
  'Exceção de Pré-executividade',
  'Ação Rescisória',
  'Outra',
];

export const poloOptions = ['Ativo', 'Passivo'];

export const instanciaJudicialOptions = [
  '1º grau',
  '2º grau',
  'STJ',
  'STF',
  'Encerrado',
];

export const situacaoProcessoJudicialOptions = [
  'Em elaboração',
  'Ajuizada',
  'Em andamento',
  'Liminar deferida',
  'Liminar indeferida',
  'Sentença favorável',
  'Sentença desfavorável',
  'Acórdão favorável',
  'Acórdão desfavorável',
  'Aguardando trânsito em julgado',
  'Transitada em julgado',
  'Em cumprimento de sentença',
  'Arquivada',
  'Extinta',
];

export const situacaoHabilitacaoPreviaOptions = [
  'Não solicitada',
  'Solicitada',
  'Deferida',
  'Indeferida',
];

// =====================================================================
// Andamentos (linha do tempo)
// =====================================================================

export const tipoAndamentoOptions = [
  'Protocolo',
  'Intimação',
  'Ciência',
  'Exigência',
  'Diligência',
  'Despacho',
  'Decisão',
  'Recurso',
  'Juntada',
  'Pagamento',
  'Trânsito em julgado',
  'Prazo',
  'Outro',
];

export const entidadeTipoOptions = [
  'credito',
  'habilitacao',
  'perdcomp',
  'processo_administrativo',
  'processo_judicial',
];

export const entidadeTipoLabel = {
  credito: 'Crédito',
  habilitacao: 'Habilitação (e-CredAc)',
  perdcomp: 'PER/DCOMP',
  processo_administrativo: 'Processo administrativo',
  processo_judicial: 'Processo judicial',
};

// =====================================================================
// Cores de situação (Tailwind) — mesmo padrão de src/data/mockData.js
// =====================================================================

const NEUTRO = 'bg-gray-100 text-gray-800 border-gray-300';
const AZUL = 'bg-blue-100 text-blue-800 border-blue-300';
const AMBAR = 'bg-amber-100 text-amber-800 border-amber-300';
const LARANJA = 'bg-orange-100 text-orange-800 border-orange-300';
const VERDE = 'bg-green-100 text-green-800 border-green-300';
const ESMERALDA = 'bg-emerald-100 text-emerald-800 border-emerald-300';
const VERMELHO = 'bg-red-100 text-red-800 border-red-300';
const ROXO = 'bg-purple-100 text-purple-800 border-purple-300';

const CORES_SITUACAO = {
  // Crédito
  'Em levantamento': NEUTRO,
  'Levantado': AZUL,
  'Em habilitação': AMBAR,
  'Habilitado': ESMERALDA,
  'Em utilização': ROXO,
  'Utilizado': VERDE,
  'Prescrito': VERMELHO,

  // Habilitação / PER/DCOMP / contencioso
  'Em preparação': NEUTRO,
  'Em elaboração': NEUTRO,
  'Protocolado': AZUL,
  'Transmitido': AZUL,
  'Em análise': AMBAR,
  'Aguardando julgamento': AMBAR,
  'Em exigência': LARANJA,
  'Em diligência': LARANJA,
  'Pauta de julgamento': ROXO,
  'Deferido': VERDE,
  'Procedente': VERDE,
  'Homologado': VERDE,
  'Homologado tacitamente': ESMERALDA,
  'Liquidado': ESMERALDA,
  'Deferido parcialmente': AMBAR,
  'Parcialmente procedente': AMBAR,
  'Parcialmente homologado': AMBAR,
  'Indeferido': VERMELHO,
  'Improcedente': VERMELHO,
  'Não homologado': VERMELHO,
  'Compensado': VERDE,
  'Retificado': ROXO,
  'Cancelado': NEUTRO,
  'Encerrado': NEUTRO,
  'Arquivado': NEUTRO,

  // Judicial
  'Ajuizada': AZUL,
  'Em andamento': AZUL,
  'Liminar deferida': VERDE,
  'Liminar indeferida': VERMELHO,
  'Sentença favorável': VERDE,
  'Sentença desfavorável': VERMELHO,
  'Acórdão favorável': VERDE,
  'Acórdão desfavorável': VERMELHO,
  'Aguardando trânsito em julgado': AMBAR,
  'Transitada em julgado': ESMERALDA,
  'Em cumprimento de sentença': ROXO,
  'Arquivada': NEUTRO,
  'Extinta': NEUTRO,
};

export const getSituacaoColor = (situacao) => CORES_SITUACAO[situacao] || NEUTRO;

// =====================================================================
// Prazos — severidade e cores
// =====================================================================

/**
 * Classifica um prazo pelos dias restantes.
 * Negativo = vencido. Até 30 dias = crítico. Até 90 = atenção.
 */
export const getPrazoSeveridade = (diasRestantes) => {
  if (diasRestantes == null) return 'sem-prazo';
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= 30) return 'critico';
  if (diasRestantes <= 90) return 'atencao';
  return 'ok';
};

export const prazoSeveridadeConfig = {
  'vencido': { label: 'Vencido', color: VERMELHO, dot: 'bg-red-500' },
  'critico': { label: 'Crítico', color: LARANJA, dot: 'bg-orange-500' },
  'atencao': { label: 'Atenção', color: AMBAR, dot: 'bg-amber-500' },
  'ok': { label: 'No prazo', color: VERDE, dot: 'bg-green-500' },
  'sem-prazo': { label: 'Sem prazo', color: NEUTRO, dot: 'bg-gray-400' },
};

// =====================================================================
// Formatadores
// =====================================================================

export const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

/** 12345678000195 → 12.345.678/0001-95 */
export const formatCNPJ = (cnpj) => {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return cnpj || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** Validação com dígitos verificadores. */
export const isValidCNPJ = (cnpj) => {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigito = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  if (calcDigito(d.slice(0, 12)) !== Number(d[12])) return false;
  return calcDigito(d.slice(0, 13)) === Number(d[13]);
};

const moedaFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatMoeda = (valor) => {
  if (valor == null || valor === '') return '—';
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (Number.isNaN(n)) return '—';
  return moedaFormatter.format(n);
};

/** Versão compacta para cards: R$ 1,2 mi / R$ 340 mil */
export const formatMoedaCompacta = (valor) => {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (valor == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return moedaFormatter.format(n);
};

/** '1.234,56' ou 'R$ 1.234,56' → 1234.56 */
export const parseMoeda = (texto) => {
  if (typeof texto === 'number') return texto;
  if (!texto) return null;
  const limpo = String(texto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
};

/** '2026-08-28' → '28/08/2026' */
export const formatData = (iso) => {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
};

/** '2026-01-01' + '2026-06-30' → '01/2026 a 06/2026' */
export const formatCompetencia = (inicio, fim) => {
  const mesAno = (iso) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  const a = mesAno(inicio);
  const b = mesAno(fim);
  if (a && b) return a === b ? a : `${a} a ${b}`;
  return a || b || '—';
};

/** 00000000000000000000 → 0000000-00.0000.0.00.0000 */
export const formatCNJ = (numero) => {
  const d = onlyDigits(numero);
  if (d.length !== 20) return numero || '';
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
};

export const formatPercentual = (valor) => {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (Number.isNaN(n)) return '—';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`;
};

// =====================================================================
// PER/DCOMP por crédito
// =====================================================================

/** 24 dígitos → '12345.67890.010126.1.3.15-1234' (padrão do PER/DCOMP Web). */
export const formatNumeroPerdcomp = (numero) => {
  const d = onlyDigits(numero);
  if (d.length !== 24) return numero || '—';
  return `${d.slice(0, 5)}.${d.slice(5, 10)}.${d.slice(10, 16)}.${d[16]}.${d[17]}.${d.slice(18, 20)}-${d.slice(20)}`;
};

/** '2025-09-01' → '09/2025' */
export const formatMesAno = (iso) => {
  if (!iso) return '—';
  const [a, m] = String(iso).split('-');
  return m && a ? `${m}/${a}` : String(iso);
};

/** Rótulo curto de cada tipo de crédito, para abas e badges. */
export const tipoCreditoCurto = {
  'Pagamento Indevido ou a Maior': 'Pagto. indevido',
  'Contribuição Previdenciária Indevida ou a Maior': 'Contrib. prev. indevida',
  'Retenção - Lei nº 9.711/98': 'Retenção INSS',
  'Salário-Família e Salário-Maternidade': 'Sal.-família/maternidade',
  'Saldo Negativo de IRPJ': 'Saldo neg. IRPJ',
  'Saldo Negativo de CSLL': 'Saldo neg. CSLL',
  'Ressarcimento de IPI': 'IPI',
  'Ressarcimento de PIS/Pasep Não Cumulativo': 'PIS',
  'Ressarcimento de Cofins Não Cumulativa': 'COFINS',
  'Crédito Oriundo de Ação Judicial': 'Ação judicial',
  'Outro': 'Outro',
};

export const tiposCreditoPerdcomp = Object.keys(tipoCreditoCurto);

export const situacaoDocumentoDcomp = ['ativa', 'retificadora', 'retificada', 'cancelada'];

export const tiposItemComposicao = [
  'Nota fiscal com retenção', 'DARF', 'GPS', 'DCTFWeb', 'Estimativa mensal',
  'Retenção na fonte', 'Nota fiscal de entrada', 'Decisão judicial', 'Outro',
];

/** Cor da fase na Receita (tag vinda de perdcompRegras.fase). */
export const corFase = {
  transmitida: 'bg-blue-100 text-blue-800 border-blue-300',
  analise: 'bg-amber-100 text-amber-800 border-amber-300',
  deferida: 'bg-green-100 text-green-800 border-green-300',
  homologada: 'bg-green-100 text-green-800 border-green-300',
  paga: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  parcial: 'bg-amber-100 text-amber-800 border-amber-300',
  indeferida: 'bg-red-100 text-red-800 border-red-300',
  nao: 'bg-red-100 text-red-800 border-red-300',
  cancelada: 'bg-gray-100 text-gray-600 border-gray-300',
  sem: 'bg-gray-100 text-gray-600 border-gray-300',
};

export const corSituacaoDocumento = {
  ativa: 'bg-green-100 text-green-800 border-green-300',
  retificadora: 'bg-blue-100 text-blue-800 border-blue-300',
  retificada: 'bg-gray-100 text-gray-600 border-gray-300',
  cancelada: 'bg-gray-100 text-gray-500 border-gray-300 line-through',
};
