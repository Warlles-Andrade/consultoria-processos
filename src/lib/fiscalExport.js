/**
 * Exportação para Excel dos módulos fiscais.
 *
 * Regra de ouro: valores monetários saem como NÚMERO com formato de moeda
 * aplicado na célula — nunca como texto "R$ 1.234,56". Só assim o time
 * consegue somar, filtrar e dinamizar na planilha.
 */

import * as XLSX from 'xlsx';
import { formatCNPJ, formatCNJ, onlyDigits } from '@/data/fiscalDomain';

const FMT_MOEDA = 'R$ #,##0.00';
const FMT_PCT = '0.000"%"';

/** ISO → dd/mm/aaaa. Vazio vira string vazia, não "Invalid Date". */
const dt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR') : '');

/** Número ou null — nunca NaN, que o Excel mostra como erro. */
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const cnpj = (v) => (v ? formatCNPJ(v) : '');

const cnj = (v) => (onlyDigits(v).length === 20 ? formatCNJ(v) : v || '');

/**
 * Monta uma aba a partir das colunas declaradas.
 * @param {Array<object>} registros - já mapeados para {titulo: valor}
 * @param {Array<{titulo: string, largura: number, formato?: 'moeda'|'pct'}>} colunas
 */
const criarAba = (registros, colunas) => {
  const cabecalho = colunas.map((c) => c.titulo);
  const ws = XLSX.utils.json_to_sheet(registros, { header: cabecalho });
  ws['!cols'] = colunas.map((c) => ({ wch: c.largura }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  if (!ws['!ref']) return ws;
  const range = XLSX.utils.decode_range(ws['!ref']);

  colunas.forEach((coluna, indice) => {
    if (!coluna.formato) return;
    const z = coluna.formato === 'moeda' ? FMT_MOEDA : FMT_PCT;
    for (let linha = range.s.r + 1; linha <= range.e.r; linha += 1) {
      const celula = ws[XLSX.utils.encode_cell({ r: linha, c: indice })];
      if (celula && typeof celula.v === 'number') {
        celula.t = 'n';
        celula.z = z;
      }
    }
  });

  return ws;
};

/** Dispara o download com sufixo de data no nome. */
const baixar = (abas, nomeBase) => {
  const wb = XLSX.utils.book_new();
  abas.forEach(({ nome, ws }) => XLSX.utils.book_append_sheet(wb, ws, nome));
  const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const arquivo = `${nomeBase}_${data}.xlsx`;
  XLSX.writeFile(wb, arquivo);
  return arquivo;
};

// ---------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------

const COLUNAS_CREDITOS = [
  { titulo: 'Código', largura: 14 },
  { titulo: 'Título', largura: 42 },
  { titulo: 'Contribuinte', largura: 32 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Projeto', largura: 22 },
  { titulo: 'Esfera', largura: 12 },
  { titulo: 'Tributo', largura: 13 },
  { titulo: 'Origem', largura: 16 },
  { titulo: 'Tipo de levantamento', largura: 24 },
  { titulo: 'Competência inicial', largura: 18 },
  { titulo: 'Competência final', largura: 18 },
  { titulo: 'Valor levantado', largura: 18, formato: 'moeda' },
  { titulo: 'Valor homologado', largura: 18, formato: 'moeda' },
  { titulo: 'Total creditado', largura: 18, formato: 'moeda' },
  { titulo: 'Total utilizado', largura: 18, formato: 'moeda' },
  { titulo: 'Saldo disponível', largura: 18, formato: 'moeda' },
  { titulo: 'Honorários (%)', largura: 14, formato: 'pct' },
  { titulo: 'Situação', largura: 18 },
  { titulo: 'Data-base prescrição', largura: 19 },
  { titulo: 'Limite prescricional', largura: 19 },
  { titulo: 'Dias p/ prescrição', largura: 17 },
  { titulo: 'Responsável', largura: 22 },
  { titulo: 'Base legal', largura: 40 },
  { titulo: 'Observações', largura: 40 },
];

export const exportarCreditos = (creditos) => {
  const registros = creditos.map((c) => ({
    'Código': c.codigo || '',
    'Título': c.titulo || '',
    'Contribuinte': c.contribuinte?.razao_social || '',
    'CNPJ': cnpj(c.contribuinte?.cnpj),
    'Projeto': c.projeto?.nome || '',
    'Esfera': c.esfera || '',
    'Tributo': c.tributo || '',
    'Origem': c.origem || '',
    'Tipo de levantamento': c.tipo_levantamento || '',
    'Competência inicial': dt(c.competencia_inicio),
    'Competência final': dt(c.competencia_fim),
    'Valor levantado': num(c.valor_levantado),
    'Valor homologado': num(c.valor_homologado),
    'Total creditado': num(c.saldo?.total_creditado),
    'Total utilizado': num(c.saldo?.total_utilizado),
    'Saldo disponível': num(c.saldo?.saldo_disponivel),
    'Honorários (%)': num(c.valor_honorarios_pct),
    'Situação': c.situacao || '',
    'Data-base prescrição': dt(c.data_base_prescricao),
    'Limite prescricional': dt(c.data_limite_prescricao),
    'Dias p/ prescrição': num(c.saldo?.dias_para_prescricao),
    'Responsável': c.responsavel_nome || '',
    'Base legal': c.base_legal || '',
    'Observações': c.observacoes || '',
  }));

  return baixar([{ nome: 'Créditos', ws: criarAba(registros, COLUNAS_CREDITOS) }], 'creditos');
};

// ---------------------------------------------------------------------
// Habilitações (e-CredAc)
// ---------------------------------------------------------------------

const COLUNAS_HABILITACOES = [
  { titulo: 'Protocolo', largura: 20 },
  { titulo: 'Processo SEFAZ', largura: 22 },
  { titulo: 'Regime', largura: 16 },
  { titulo: 'Modalidade', largura: 20 },
  { titulo: 'UF', largura: 6 },
  { titulo: 'Posto fiscal', largura: 20 },
  { titulo: 'Crédito', largura: 36 },
  { titulo: 'Contribuinte', largura: 32 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Referência inicial', largura: 17 },
  { titulo: 'Referência final', largura: 17 },
  { titulo: 'Valor pleiteado', largura: 18, formato: 'moeda' },
  { titulo: 'Valor autorizado', largura: 18, formato: 'moeda' },
  { titulo: 'Valor glosado', largura: 18, formato: 'moeda' },
  { titulo: 'Situação', largura: 20 },
  { titulo: 'Data protocolo', largura: 15 },
  { titulo: 'Última exigência', largura: 17 },
  { titulo: 'Prazo de resposta', largura: 17 },
  { titulo: 'Data despacho', largura: 15 },
  { titulo: 'Data liquidação', largura: 16 },
  { titulo: 'Responsável', largura: 22 },
  { titulo: 'Observações', largura: 40 },
];

export const exportarHabilitacoes = (habilitacoes) => {
  const registros = habilitacoes.map((h) => ({
    'Protocolo': h.numero_protocolo || '',
    'Processo SEFAZ': h.numero_processo_sefaz || '',
    'Regime': h.regime || '',
    'Modalidade': h.modalidade || '',
    'UF': h.uf || '',
    'Posto fiscal': h.posto_fiscal || '',
    'Crédito': h.credito ? `${h.credito.codigo || ''} ${h.credito.titulo || ''}`.trim() : '',
    'Contribuinte': h.contribuinte?.razao_social || '',
    'CNPJ': cnpj(h.contribuinte?.cnpj),
    'Referência inicial': dt(h.periodo_referencia_inicio),
    'Referência final': dt(h.periodo_referencia_fim),
    'Valor pleiteado': num(h.valor_pleiteado),
    'Valor autorizado': num(h.valor_autorizado),
    'Valor glosado': num(h.valor_glosado),
    'Situação': h.situacao || '',
    'Data protocolo': dt(h.data_protocolo),
    'Última exigência': dt(h.data_ultima_exigencia),
    'Prazo de resposta': dt(h.prazo_resposta),
    'Data despacho': dt(h.data_despacho),
    'Data liquidação': dt(h.data_liquidacao),
    'Responsável': h.responsavel_nome || '',
    'Observações': h.observacoes || '',
  }));

  return baixar([{ nome: 'e-CredAc', ws: criarAba(registros, COLUNAS_HABILITACOES) }], 'habilitacoes_ecredac');
};

// ---------------------------------------------------------------------
// PER/DCOMP (com aba de débitos)
// ---------------------------------------------------------------------

const COLUNAS_PERDCOMP = [
  { titulo: 'Número', largura: 26 },
  { titulo: 'Tipo', largura: 16 },
  { titulo: 'Documento', largura: 13 },
  { titulo: 'Crédito', largura: 36 },
  { titulo: 'Contribuinte', largura: 32 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Transmissão', largura: 14 },
  { titulo: 'Homologação tácita', largura: 19 },
  { titulo: 'Apuração inicial', largura: 16 },
  { titulo: 'Apuração final', largura: 16 },
  { titulo: 'Crédito original', largura: 18, formato: 'moeda' },
  { titulo: 'Crédito atualizado', largura: 18, formato: 'moeda' },
  { titulo: 'Compensado', largura: 18, formato: 'moeda' },
  { titulo: 'Deferido', largura: 18, formato: 'moeda' },
  { titulo: 'Glosado', largura: 18, formato: 'moeda' },
  { titulo: 'Situação', largura: 22 },
  { titulo: 'Processo administrativo', largura: 24 },
  { titulo: 'Ciência do despacho', largura: 18 },
  { titulo: 'Prazo de manifestação', largura: 20 },
  { titulo: 'Responsável', largura: 22 },
  { titulo: 'Observações', largura: 40 },
];

const COLUNAS_DEBITOS = [
  { titulo: 'PER/DCOMP', largura: 26 },
  { titulo: 'Código da receita', largura: 17 },
  { titulo: 'Denominação', largura: 40 },
  { titulo: 'Período de apuração', largura: 19 },
  { titulo: 'Vencimento', largura: 14 },
  { titulo: 'Principal', largura: 16, formato: 'moeda' },
  { titulo: 'Multa', largura: 16, formato: 'moeda' },
  { titulo: 'Juros', largura: 16, formato: 'moeda' },
  { titulo: 'Total', largura: 16, formato: 'moeda' },
  { titulo: 'Situação', largura: 22 },
];

/**
 * @param {Array} perdcomps
 * @param {Array} debitos - opcional; cada item precisa de perdcomp_id
 */
export const exportarPerdcomps = (perdcomps, debitos = []) => {
  const registros = perdcomps.map((p) => ({
    'Número': p.numero || '',
    'Tipo': p.tipo || '',
    'Documento': p.tipo_documento || '',
    'Crédito': p.credito ? `${p.credito.codigo || ''} ${p.credito.titulo || ''}`.trim() : '',
    'Contribuinte': p.contribuinte?.razao_social || '',
    'CNPJ': cnpj(p.contribuinte?.cnpj),
    'Transmissão': dt(p.data_transmissao),
    'Homologação tácita': dt(p.data_limite_homologacao),
    'Apuração inicial': dt(p.periodo_apuracao_inicio),
    'Apuração final': dt(p.periodo_apuracao_fim),
    'Crédito original': num(p.valor_credito_original),
    'Crédito atualizado': num(p.valor_credito_atualizado),
    'Compensado': num(p.valor_compensado),
    'Deferido': num(p.valor_deferido),
    'Glosado': num(p.valor_glosado),
    'Situação': p.situacao || '',
    'Processo administrativo': p.numero_processo_administrativo || '',
    'Ciência do despacho': dt(p.data_ciencia_despacho),
    'Prazo de manifestação': dt(p.prazo_manifestacao),
    'Responsável': p.responsavel_nome || '',
    'Observações': p.observacoes || '',
  }));

  const abas = [{ nome: 'PER-DCOMP', ws: criarAba(registros, COLUNAS_PERDCOMP) }];

  if (debitos.length > 0) {
    const numeroPorId = new Map(perdcomps.map((p) => [p.id, p.numero]));
    const linhasDebito = debitos.map((d) => ({
      'PER/DCOMP': numeroPorId.get(d.perdcomp_id) || '',
      'Código da receita': d.codigo_receita || '',
      'Denominação': d.denominacao || '',
      'Período de apuração': dt(d.periodo_apuracao),
      'Vencimento': dt(d.vencimento),
      'Principal': num(d.valor_principal),
      'Multa': num(d.valor_multa),
      'Juros': num(d.valor_juros),
      'Total': num(d.valor_total),
      'Situação': d.situacao || '',
    }));
    abas.push({ nome: 'Débitos', ws: criarAba(linhasDebito, COLUNAS_DEBITOS) });
  }

  return baixar(abas, 'perdcomp');
};

// ---------------------------------------------------------------------
// Contencioso
// ---------------------------------------------------------------------

const COLUNAS_ADM = [
  { titulo: 'Nº do processo', largura: 24 },
  { titulo: 'Auto de infração', largura: 22 },
  { titulo: 'Acórdão', largura: 18 },
  { titulo: 'Esfera', largura: 12 },
  { titulo: 'UF', largura: 6 },
  { titulo: 'Órgão atual', largura: 32 },
  { titulo: 'Órgão julgador', largura: 24 },
  { titulo: 'Relator', largura: 24 },
  { titulo: 'Instância', largura: 18 },
  { titulo: 'Natureza', largura: 18 },
  { titulo: 'Tipo de peça', largura: 26 },
  { titulo: 'Contribuinte', largura: 32 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Crédito', largura: 30 },
  { titulo: 'Valor autuado', largura: 18, formato: 'moeda' },
  { titulo: 'Valor em discussão', largura: 18, formato: 'moeda' },
  { titulo: 'Valor cancelado', largura: 18, formato: 'moeda' },
  { titulo: 'Valor mantido', largura: 18, formato: 'moeda' },
  { titulo: 'Situação', largura: 24 },
  { titulo: 'Ciência', largura: 13 },
  { titulo: 'Prazo de defesa', largura: 16 },
  { titulo: 'Protocolo', largura: 13 },
  { titulo: 'Julgamento', largura: 13 },
  { titulo: 'Próximo prazo', largura: 15 },
  { titulo: 'O que vence', largura: 34 },
  { titulo: 'Responsável', largura: 22 },
  { titulo: 'Advogado', largura: 24 },
  { titulo: 'Observações', largura: 40 },
];

const COLUNAS_JUD = [
  { titulo: 'Nº CNJ', largura: 26 },
  { titulo: 'Tipo de ação', largura: 28 },
  { titulo: 'Polo', largura: 10 },
  { titulo: 'Tribunal', largura: 18 },
  { titulo: 'Vara', largura: 24 },
  { titulo: 'Comarca', largura: 22 },
  { titulo: 'UF', largura: 6 },
  { titulo: 'Instância', largura: 14 },
  { titulo: 'Contribuinte', largura: 32 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Crédito', largura: 30 },
  { titulo: 'Situação', largura: 28 },
  { titulo: 'Ajuizamento', largura: 14 },
  { titulo: 'Sentença', largura: 13 },
  { titulo: 'Acórdão', largura: 13 },
  { titulo: 'Trânsito em julgado', largura: 18 },
  { titulo: 'Prazo p/ compensar', largura: 18 },
  { titulo: 'Próximo prazo', largura: 15 },
  { titulo: 'O que vence', largura: 34 },
  { titulo: 'Valor da causa', largura: 18, formato: 'moeda' },
  { titulo: 'Crédito estimado', largura: 18, formato: 'moeda' },
  { titulo: 'Depósito judicial', largura: 18, formato: 'moeda' },
  { titulo: 'Exige habilitação RFB', largura: 20 },
  { titulo: 'Situação da habilitação', largura: 22 },
  { titulo: 'Data da habilitação', largura: 18 },
  { titulo: 'Processo de habilitação', largura: 24 },
  { titulo: 'Responsável', largura: 22 },
  { titulo: 'Advogado', largura: 24 },
  { titulo: 'Observações', largura: 40 },
];

const linhaAdm = (p) => ({
  'Nº do processo': p.numero_processo || '',
  'Auto de infração': p.numero_auto_infracao || '',
  'Acórdão': p.numero_acordao || '',
  'Esfera': p.esfera || '',
  'UF': p.uf || '',
  'Órgão atual': p.orgao_atual || '',
  'Órgão julgador': p.orgao_julgador || '',
  'Relator': p.relator || '',
  'Instância': p.instancia || '',
  'Natureza': p.natureza || '',
  'Tipo de peça': p.tipo || '',
  'Contribuinte': p.contribuinte?.razao_social || '',
  'CNPJ': cnpj(p.contribuinte?.cnpj),
  'Crédito': p.credito ? `${p.credito.codigo || ''} ${p.credito.titulo || ''}`.trim() : '',
  'Valor autuado': num(p.valor_autuado),
  'Valor em discussão': num(p.valor_em_discussao),
  'Valor cancelado': num(p.valor_cancelado),
  'Valor mantido': num(p.valor_mantido),
  'Situação': p.situacao || '',
  'Ciência': dt(p.data_ciencia),
  'Prazo de defesa': dt(p.prazo_impugnacao),
  'Protocolo': dt(p.data_protocolo),
  'Julgamento': dt(p.data_julgamento),
  'Próximo prazo': dt(p.proximo_prazo),
  'O que vence': p.proximo_prazo_descricao || '',
  'Responsável': p.responsavel_nome || '',
  'Advogado': p.advogado_responsavel || '',
  'Observações': p.observacoes || '',
});

const linhaJud = (p) => ({
  'Nº CNJ': cnj(p.numero_cnj),
  'Tipo de ação': p.tipo_acao || '',
  'Polo': p.polo || '',
  'Tribunal': p.tribunal || '',
  'Vara': p.vara || '',
  'Comarca': p.comarca || '',
  'UF': p.uf || '',
  'Instância': p.instancia || '',
  'Contribuinte': p.contribuinte?.razao_social || '',
  'CNPJ': cnpj(p.contribuinte?.cnpj),
  'Crédito': p.credito ? `${p.credito.codigo || ''} ${p.credito.titulo || ''}`.trim() : '',
  'Situação': p.situacao || '',
  'Ajuizamento': dt(p.data_ajuizamento),
  'Sentença': dt(p.data_sentenca),
  'Acórdão': dt(p.data_acordao),
  'Trânsito em julgado': dt(p.data_transito_julgado),
  'Prazo p/ compensar': dt(p.prazo_compensacao),
  'Próximo prazo': dt(p.proximo_prazo),
  'O que vence': p.proximo_prazo_descricao || '',
  'Valor da causa': num(p.valor_causa),
  'Crédito estimado': num(p.valor_estimado_credito),
  'Depósito judicial': num(p.deposito_judicial),
  'Exige habilitação RFB': p.habilitacao_previa_rfb ? 'Sim' : 'Não',
  'Situação da habilitação': p.situacao_habilitacao_previa || '',
  'Data da habilitação': dt(p.data_habilitacao_previa),
  'Processo de habilitação': p.numero_processo_habilitacao || '',
  'Responsável': p.responsavel_nome || '',
  'Advogado': p.advogado_responsavel || '',
  'Observações': p.observacoes || '',
});

export const exportarProcessosAdministrativos = (lista) =>
  baixar(
    [{ nome: 'Administrativo', ws: criarAba(lista.map(linhaAdm), COLUNAS_ADM) }],
    'contencioso_administrativo'
  );

export const exportarProcessosJudiciais = (lista) =>
  baixar(
    [{ nome: 'Judicial', ws: criarAba(lista.map(linhaJud), COLUNAS_JUD) }],
    'contencioso_judicial'
  );

// ---------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------

const COLUNAS_PRAZOS = [
  { titulo: 'Data', largura: 13 },
  { titulo: 'Dias restantes', largura: 15 },
  { titulo: 'Severidade', largura: 14 },
  { titulo: 'Tipo de prazo', largura: 36 },
  { titulo: 'Módulo', largura: 26 },
  { titulo: 'Referência', largura: 26 },
  { titulo: 'Descrição', largura: 46 },
  { titulo: 'Situação', largura: 24 },
  { titulo: 'Responsável', largura: 22 },
];

/**
 * @param {Array} prazos - linhas de v_prazos_criticos
 * @param {(dias:number)=>string} rotuloSeveridade
 * @param {Record<string,string>} rotuloModulo
 */
export const exportarPrazos = (prazos, rotuloSeveridade, rotuloModulo) => {
  const registros = prazos.map((p) => ({
    'Data': dt(p.data_prazo),
    'Dias restantes': num(p.dias_restantes),
    'Severidade': rotuloSeveridade(p.dias_restantes),
    'Tipo de prazo': p.tipo_prazo || '',
    'Módulo': rotuloModulo[p.entidade_tipo] || p.entidade_tipo || '',
    'Referência': p.referencia || '',
    'Descrição': p.descricao || '',
    'Situação': p.situacao || '',
    'Responsável': p.responsavel_nome || '',
  }));

  return baixar([{ nome: 'Prazos', ws: criarAba(registros, COLUNAS_PRAZOS) }], 'prazos');
};
