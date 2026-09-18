/**
 * Exportação para Excel dos módulos fiscais.
 *
 * Regra de ouro: valores monetários saem como NÚMERO com formato de moeda
 * aplicado na célula — nunca como texto "R$ 1.234,56". Só assim o time
 * consegue somar, filtrar e dinamizar na planilha.
 */

import * as XLSX from 'xlsx';
import { formatCNPJ, formatCNJ, onlyDigits, formatNumeroPerdcomp, tipoCreditoCurto } from '@/data/fiscalDomain';
import * as R from '@/lib/perdcompRegras';

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
// Controle PER/DCOMP por crédito (conta-corrente)
// ---------------------------------------------------------------------

/** Timestamp do e-CAC → dd/mm/aaaa no horário de Brasília. */
const dtBr = (ts) => (ts
  ? new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  : '');
const mesAno = (iso) => (iso ? `${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '');

const COLUNAS_CTRL_CREDITOS = [
  { titulo: 'Competência', largura: 12 },
  { titulo: 'Tipo de crédito', largura: 34 },
  { titulo: 'ID do crédito (RFB)', largura: 30 },
  { titulo: 'PER original', largura: 30 },
  { titulo: 'Transmissão do PER', largura: 18 },
  { titulo: 'Fase do pedido', largura: 22 },
  { titulo: 'Valor do crédito', largura: 18, formato: 'moeda' },
  { titulo: 'Composição lançada', largura: 18, formato: 'moeda' },
  { titulo: 'Utilizado em DCOMP', largura: 18, formato: 'moeda' },
  { titulo: 'Restituição paga', largura: 18, formato: 'moeda' },
  { titulo: 'Saldo', largura: 18, formato: 'moeda' },
  { titulo: 'Selic acumulada', largura: 14, formato: 'pct' },
  { titulo: 'Saldo corrigido', largura: 18, formato: 'moeda' },
  { titulo: 'DCOMPs', largura: 9 },
  { titulo: 'Alertas', largura: 60 },
];

const COLUNAS_CTRL_EXTRATO = [
  { titulo: 'Competência do crédito', largura: 14 },
  { titulo: 'Tipo de crédito', largura: 22 },
  { titulo: 'DCOMP', largura: 30 },
  { titulo: 'Transmissão', largura: 13 },
  { titulo: 'Situação do documento', largura: 14 },
  { titulo: 'Fase na RFB', largura: 22 },
  { titulo: 'Crédito declarado na entrega', largura: 20, formato: 'moeda' },
  { titulo: 'Saldo antes', largura: 18, formato: 'moeda' },
  { titulo: 'Consumido', largura: 18, formato: 'moeda' },
  { titulo: 'Saldo depois', largura: 18, formato: 'moeda' },
  { titulo: 'Divergência', largura: 16, formato: 'moeda' },
  { titulo: 'Selic declarada', largura: 13, formato: 'pct' },
  { titulo: 'Selic pela regra', largura: 13, formato: 'pct' },
  { titulo: 'Total dos débitos', largura: 18, formato: 'moeda' },
];

const COLUNAS_CTRL_PER = [
  { titulo: 'PER', largura: 30 },
  { titulo: 'Competência do crédito', largura: 14 },
  { titulo: 'Tipo de crédito', largura: 22 },
  { titulo: 'Versão', largura: 12 },
  { titulo: 'Retifica', largura: 30 },
  { titulo: 'Vigente', largura: 9 },
  { titulo: 'Transmissão', largura: 13 },
  { titulo: 'Valor pedido', largura: 18, formato: 'moeda' },
  { titulo: 'Recibo', largura: 22 },
];

const COLUNAS_CTRL_DEBITOS = [
  { titulo: 'DCOMP', largura: 30 },
  { titulo: 'Situação do documento', largura: 14 },
  { titulo: 'Código da receita', largura: 16 },
  { titulo: 'Período de apuração', largura: 14 },
  { titulo: 'Vencimento', largura: 13 },
  { titulo: 'Principal', largura: 16, formato: 'moeda' },
  { titulo: 'Multa', largura: 16, formato: 'moeda' },
  { titulo: 'Juros', largura: 16, formato: 'moeda' },
  { titulo: 'Total', largura: 16, formato: 'moeda' },
];

const COLUNAS_CTRL_COMPOSICAO = [
  { titulo: 'Competência do crédito', largura: 14 },
  { titulo: 'Tipo', largura: 24 },
  { titulo: 'Documento', largura: 18 },
  { titulo: 'CNPJ', largura: 20 },
  { titulo: 'Nome', largura: 34 },
  { titulo: 'Data', largura: 12 },
  { titulo: 'Período de apuração', largura: 14 },
  { titulo: 'Código da receita', largura: 14 },
  { titulo: 'Valor', largura: 16, formato: 'moeda' },
];

const COLUNAS_CTRL_ALERTAS = [
  { titulo: 'Nível', largura: 9 },
  { titulo: 'Competência do crédito', largura: 14 },
  { titulo: 'Tipo de crédito', largura: 22 },
  { titulo: 'Alerta', largura: 110 },
];

/**
 * Exporta o controle de um contribuinte (já filtrado pela tela) com as
 * mesmas contas da tela — tudo vem de perdcompRegras.
 * @param ctx { creditos, perVersoes, dcomps, debitos, eventos, composicao, selic }
 * @param contribuinte { razao_social, cnpj }
 */
export const exportarControlePerdcomp = (ctx, contribuinte) => {
  const { creditos, perVersoes, dcomps, debitos, eventos, composicao, selic } = ctx;
  const ids = new Set(creditos.map((c) => c.id));
  const porId = new Map(creditos.map((c) => [c.id, c]));
  const curto = (c) => tipoCreditoCurto[c?.tipo_credito] || c?.tipo_credito || '';
  const minhasDcomps = dcomps.filter((d) => ids.has(d.perdcomp_credito_id));
  const dcompPorId = new Map(minhasDcomps.map((d) => [d.id, d]));

  const linhasCreditos = creditos.map((c) => {
    const s = R.saldoCorrigido(c, dcomps, selic);
    const itens = composicao.filter((x) => x.perdcomp_credito_id === c.id);
    return {
      'Competência': mesAno(c.competencia),
      'Tipo de crédito': c.tipo_credito,
      'ID do crédito (RFB)': formatNumeroPerdcomp(c.id_credito_rfb),
      'PER original': c.numero_per_original ? formatNumeroPerdcomp(c.numero_per_original) : '',
      'Transmissão do PER': dtBr(c.data_transmissao),
      'Fase do pedido': c.numero_per_original ? R.fase(c.numero_per_original, 'PER', eventos).rotulo : '',
      'Valor do crédito': num(c.valor_credito),
      'Composição lançada': itens.length ? R.round2(itens.reduce((t, x) => t + Number(x.valor || 0), 0)) : null,
      'Utilizado em DCOMP': s.utilizado,
      'Restituição paga': c.numero_per_original ? R.valorPago(c.numero_per_original, eventos) || null : null,
      'Saldo': s.saldo,
      'Selic acumulada': s.percentual,
      'Saldo corrigido': s.valor,
      'DCOMPs': minhasDcomps.filter((d) => d.perdcomp_credito_id === c.id).length,
      'Alertas': R.alertas(c, ctx).map((a) => a.texto).join(' | '),
    };
  });

  const linhasExtrato = creditos.flatMap((c) => R.extrato(c, dcomps).map((l) => ({
    'Competência do crédito': mesAno(c.competencia),
    'Tipo de crédito': curto(c),
    'DCOMP': formatNumeroPerdcomp(l.numero),
    'Transmissão': dtBr(l.data_transmissao),
    'Situação do documento': l.situacao_documento,
    'Fase na RFB': R.fase(l.numero, 'DCOMP', eventos).rotulo,
    'Crédito declarado na entrega': num(l.credito_informado_entrega),
    'Saldo antes': l.saldoAnterior,
    'Consumido': l.consumido || null,
    'Saldo depois': l.saldoApos,
    'Divergência': l.divergencia != null && Math.abs(l.divergencia) > 0.01 ? l.divergencia : null,
    'Selic declarada': num(l.selic_acumulada),
    'Selic pela regra': R.indiceSelicDcomp(l, c, dcomps, selic).percentual,
    'Total dos débitos': num(l.total_debitos),
  })));

  const linhasPer = perVersoes.filter((v) => ids.has(v.perdcomp_credito_id)).map((v) => {
    const c = porId.get(v.perdcomp_credito_id);
    return {
      'PER': formatNumeroPerdcomp(v.numero),
      'Competência do crédito': mesAno(c?.competencia),
      'Tipo de crédito': curto(c),
      'Versão': v.numero_anterior ? 'Retificadora' : 'Original',
      'Retifica': v.numero_anterior ? formatNumeroPerdcomp(v.numero_anterior) : '',
      'Vigente': v.vigente ? 'Sim' : 'Não',
      'Transmissão': dtBr(v.data_transmissao),
      'Valor pedido': num(v.valor_pedido),
      'Recibo': v.numero_recibo || '',
    };
  });

  const linhasDebitos = debitos.filter((x) => dcompPorId.has(x.dcomp_id)).map((x) => {
    const d = dcompPorId.get(x.dcomp_id);
    return {
      'DCOMP': formatNumeroPerdcomp(d.numero),
      'Situação do documento': d.situacao_documento,
      'Código da receita': x.codigo_receita || '',
      'Período de apuração': mesAno(x.periodo_apuracao),
      'Vencimento': dt(x.vencimento),
      'Principal': num(x.principal),
      'Multa': num(x.multa),
      'Juros': num(x.juros),
      'Total': num(x.total),
    };
  });

  const linhasComposicao = composicao.filter((x) => ids.has(x.perdcomp_credito_id)).map((x) => ({
    'Competência do crédito': mesAno(porId.get(x.perdcomp_credito_id)?.competencia),
    'Tipo': x.tipo_item,
    'Documento': x.documento || '',
    'CNPJ': cnpj(x.cnpj_relacionado),
    'Nome': x.nome_relacionado || '',
    'Data': dt(x.data_documento),
    'Período de apuração': mesAno(x.periodo_apuracao),
    'Código da receita': x.codigo_receita || '',
    'Valor': num(x.valor),
  }));

  const linhasAlertas = creditos.flatMap((c) => R.alertas(c, ctx).map((a) => ({
    'Nível': a.nivel === 'grave' ? 'GRAVE' : 'Conferir',
    'Competência do crédito': mesAno(c.competencia),
    'Tipo de crédito': curto(c),
    'Alerta': a.texto,
  })));

  const abas = [
    { nome: 'Créditos', ws: criarAba(linhasCreditos, COLUNAS_CTRL_CREDITOS) },
    { nome: 'Conta-corrente', ws: criarAba(linhasExtrato, COLUNAS_CTRL_EXTRATO) },
    { nome: 'PER', ws: criarAba(linhasPer, COLUNAS_CTRL_PER) },
    { nome: 'Débitos DCOMP', ws: criarAba(linhasDebitos, COLUNAS_CTRL_DEBITOS) },
  ];
  if (linhasComposicao.length) abas.push({ nome: 'Composição', ws: criarAba(linhasComposicao, COLUNAS_CTRL_COMPOSICAO) });
  if (linhasAlertas.length) abas.push({ nome: 'Alertas', ws: criarAba(linhasAlertas, COLUNAS_CTRL_ALERTAS) });

  return baixar(abas, `perdcomp_${onlyDigits(contribuinte?.cnpj) || 'controle'}`);
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
