/**
 * Importação das planilhas de controle do e-CredAc:
 *  - conta-corrente (extrato do e-CredAc copiado para Excel, com as colunas
 *    de honorários da consultoria);
 *  - controle de pedidos (Portaria CAT 83/2009).
 *
 * As colunas são localizadas pelo cabeçalho, não pela posição. Funções
 * puras sobre o workbook do SheetJS: dá para testar fora do navegador.
 */
import * as XLSX from 'xlsx';
import { classificar, round2 } from '@/lib/ecredacRegras';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase();
const digitos = (v) => String(v ?? '').replace(/\D/g, '');

/** Número pt-BR ou en-US, com ou sem "C"/"D" no fim; "-" e "***" viram null. */
export const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/\s*[CD]$/i, '').replace(/[R$\s]/g, '');
  if (!s || /^[-*]+$/.test(s)) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Data do Excel (serial, Date ou texto dd/mm/aaaa ou m/d/aa) → 'AAAA-MM-DD'. */
export const dataIso = (v) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};

const linhasDe = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

/** Acha a linha de cabeçalho que contém todos os títulos pedidos. */
const acharCabecalho = (linhas, obrigatorios) => {
  for (let i = 0; i < Math.min(linhas.length, 30); i += 1) {
    const cab = linhas[i].map(norm);
    if (obrigatorios.every((t) => cab.some((c) => c === t || c.startsWith(t)))) {
      const col = (t) => cab.findIndex((c) => c === t || c.startsWith(t));
      return { linha: i, col };
    }
  }
  return null;
};

// ---------------------------------------------------------------------
// Conta-corrente
// ---------------------------------------------------------------------

/**
 * @returns {{ movimentos, faturamentos, saldoInicial, dataSaldoInicial, inicioHonorarios, avisos, aba }}
 */
export const lerContaCorrente = (workbook) => {
  for (const aba of workbook.SheetNames) {
    const linhas = linhasDe(workbook.Sheets[aba]);
    const cab = acharCabecalho(linhas, ['DATA', 'HISTORICO', 'VALOR']);
    if (!cab) continue;
    const c = {
      data: cab.col('DATA'),
      codigo: cab.col('CODIGO'),
      documento: cab.col('DOCUMENTO'),
      historico: cab.col('HISTORICO'),
      valor: cab.col('VALOR'),
      natureza: cab.col('(D/*)') >= 0 ? cab.col('(D/*)') : cab.col('(D'),
      saldo: cab.col('SALDO'),
      devidos: cab.col('HONORARIOS DEVIDO'),
      faturado: cab.col('BOLETO FATURADO'),
    };
    if (c.natureza < 0) c.natureza = c.valor + 1; // coluna sem título logo após o valor

    const movimentos = [];
    const faturamentos = [];
    const avisos = [];
    const vistas = new Map();
    let inicioHonorarios = null;

    linhas.slice(cab.linha + 1).forEach((l, i) => {
      const data = dataIso(l[c.data]);
      const historico = String(l[c.historico] ?? '').trim();
      const valor = numero(l[c.valor]);
      if (!data || !historico || valor == null) return;
      const nat = String(l[c.natureza] ?? '').trim().toUpperCase();
      const natureza = ['C', 'D', '*'].includes(nat) ? nat : null;
      if (!natureza) {
        avisos.push(`Linha ${cab.linha + i + 2}: natureza "${l[c.natureza]}" não reconhecida — ignorada.`);
        return;
      }
      const documento = String(l[c.documento] ?? '').trim() || null;
      const cls = classificar(historico);
      const base = [data, documento || '', natureza, round2(Math.abs(valor)).toFixed(2), cls.operacao].join('|');
      const ocorrencia = (vistas.get(base) || 0) + 1;
      vistas.set(base, ocorrencia);

      movimentos.push({
        ordem: movimentos.length + 1,
        data,
        codigo: String(l[c.codigo] ?? '').trim() || null,
        documento,
        historico,
        valor: round2(Math.abs(valor)),
        natureza,
        saldo_extrato: c.saldo >= 0 ? numero(l[c.saldo]) : null,
        ...cls,
        chave: `${base}|${ocorrencia}`,
      });

      if (c.devidos >= 0 && !inicioHonorarios && numero(l[c.devidos]) != null && numero(l[c.devidos]) !== 0) {
        inicioHonorarios = data;
      }
      const fat = c.faturado >= 0 ? numero(l[c.faturado]) : null;
      if (fat && fat > 0) {
        faturamentos.push({
          data_emissao: data,
          competencia: `${data.slice(0, 7)}-01`,
          valor: round2(fat),
          situacao: 'Emitido',
          origem: 'IMPORTACAO',
          observacoes: `Importado da planilha (linha ${cab.linha + i + 2}).`,
        });
      }
    });

    if (!movimentos.length) continue;
    const primeiro = movimentos[0];
    const efeito = primeiro.natureza === 'C' ? primeiro.valor : primeiro.natureza === 'D' ? -primeiro.valor : 0;
    const saldoInicial = primeiro.saldo_extrato == null ? 0 : round2(primeiro.saldo_extrato - efeito);
    if (primeiro.saldo_extrato == null) avisos.push('A planilha não tem coluna de saldo: o saldo inicial foi considerado zero.');

    return {
      aba,
      movimentos,
      faturamentos,
      saldoInicial,
      dataSaldoInicial: primeiro.data,
      inicioHonorarios,
      avisos,
    };
  }
  throw new Error('Nenhuma aba com as colunas DATA, HISTÓRICO e VALOR foi encontrada.');
};

// ---------------------------------------------------------------------
// Controle de pedidos
// ---------------------------------------------------------------------

const SITUACOES = {
  PENDENTE: 'Protocolado',
  'EM ANALISE': 'Em análise',
  'EM EXIGENCIA': 'Em exigência',
  DEFERIDO: 'Deferido',
  'DEFERIDO PARCIALMENTE': 'Deferido parcialmente',
  INDEFERIDO: 'Indeferido',
  CANCELADO: 'Cancelado',
  ARQUIVADO: 'Arquivado',
};

const valorNota = (v) => {
  const s = String(v ?? '').trim();
  return !s || /^\*+$/.test(s) ? null : s;
};

/**
 * @returns {{ pedidos, avisos, aba }}  cada pedido já no formato de habilitacoes
 */
export const lerPedidos = (workbook) => {
  for (const aba of workbook.SheetNames) {
    const linhas = linhasDe(workbook.Sheets[aba]);
    const cab = acharCabecalho(linhas, ['NUMERO DO PEDIDO', 'VALOR']);
    if (!cab) continue;
    const c = {
      numero: cab.col('NUMERO DO PEDIDO'),
      natureza: cab.col('NATUREZA DO CREDITO'),
      sistematica: cab.col('SISTEMATICA'),
      processo: cab.col('NUMERO DO PROCESSO'),
      cnpj: cab.col('CNPJ'),
      dataSolic: cab.col('DATA DA SOLICITACAO'),
      referencia: cab.col('REFERENCIA'),
      valor: cab.col('VALOR'),
      situacao: cab.col('SITUACAO'),
      obs: cab.col('OBS'),
      notaRegistro: cab.col('NOTA NA DATA'),
      notaRecente: cab.col('NOTA MAIS RECENTE'),
      nota12: cab.col('NOTA REF. AOS ULTIMOS 12'),
    };
    const pedidos = [];
    const avisos = [];
    linhas.slice(cab.linha + 1).forEach((l, i) => {
      const numeroPedido = String(l[c.numero] ?? '').trim();
      if (!/^\d+\/\d{4}$/.test(numeroPedido)) return; // subtotais e linhas vazias
      const valor = numero(l[c.valor]);
      const situacaoSefaz = String(l[c.situacao] ?? '').trim();
      const sistematica = String(l[c.sistematica] ?? '');
      const referencia = dataIso(l[c.referencia]);
      if (valor == null) {
        avisos.push(`Linha ${cab.linha + i + 2}: pedido ${numeroPedido} sem valor — ignorado.`);
        return;
      }
      pedidos.push({
        numero_protocolo: numeroPedido,
        numero_processo_sefaz: String(l[c.processo] ?? '').trim() || null,
        cnpj: digitos(l[c.cnpj]),
        data_protocolo: dataIso(l[c.dataSolic]),
        periodo_referencia_inicio: referencia ? `${referencia.slice(0, 7)}-01` : null,
        periodo_referencia_fim: referencia ? `${referencia.slice(0, 7)}-01` : null,
        valor_pleiteado: round2(valor),
        regime: /207/.test(sistematica) ? 'CAT 207/2009' : 'CAT 83/2009',
        modalidade: /custeio/i.test(sistematica) ? 'Custeio' : /simplificad/i.test(sistematica) ? 'Simplificado' : null,
        natureza_credito: String(l[c.natureza] ?? '').trim() || null,
        situacao_sefaz: situacaoSefaz || null,
        situacao: SITUACOES[norm(situacaoSefaz)] || 'Protocolado',
        observacoes: String(l[c.obs] ?? '').trim() || null,
        nota_registro: valorNota(l[c.notaRegistro]),
        nota_recente: valorNota(l[c.notaRecente]),
        nota_12_meses: valorNota(l[c.nota12]),
      });
    });
    if (pedidos.length) return { aba, pedidos, avisos };
  }
  throw new Error('Nenhuma aba com a coluna "NÚMERO DO PEDIDO" foi encontrada.');
};
