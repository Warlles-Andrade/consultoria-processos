/**
 * Prova de equivalência: src/lib/perdcompRegras.js × protótipo original.
 *
 * Roda as regras do protótipo "Controle PER/DCOMP" (v2) e as do ERP sobre o
 * MESMO conjunto de dados e compara, crédito a crédito e DCOMP a DCOMP:
 * saldo, extrato (saldo anterior/posterior/divergência), índice Selic,
 * saldo corrigido e alertas. Também confere a alegação do protótipo de que
 * a regra de Selic bate com o índice que cada DCOMP real declarou.
 *
 * Uso:
 *   node scripts/verificar-perdcomp-regras.mjs "<caminho>/controle-perdcomp.html"
 *
 * O HTML contém dados reais de cliente — NÃO versionar. Este script não
 * grava nada: só lê o arquivo e imprime o resultado.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import * as erp from '../src/lib/perdcompRegras.js';

const caminho = process.argv[2];
if (!caminho) {
  console.error('Informe o caminho do controle-perdcomp.html');
  process.exit(2);
}

// --- carrega DB + regras do protótipo num sandbox --------------------------
const html = fs.readFileSync(caminho, 'utf8');
const js = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const fim = js.indexOf('/* 4. FORMATAÇÃO');
const blocoFmt = js.slice(fim, js.indexOf('const $', fim));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  js.slice(0, fim).replace(/\bconst (DB|api|regras|round2|round4|ia|proximoId)\b/g, 'var $1') +
  blocoFmt.replace(/\bconst fmt\b/, 'var fmt'),
  sandbox,
);
const { DB, regras: proto } = sandbox;

// --- converte para o formato do ERP (snake_case, ids = chaves naturais) ------
const creditos = DB.creditos.map((c) => ({
  id: c.idCredito,
  id_credito_rfb: c.idCredito,
  competencia: `${c.competencia}-01`,
  tipo_credito: c.tipoCredito?.descricao,
  termo_inicial_correcao: c.termoInicialCorrecao,
  data_transmissao: c.dataTransmissao,
  valor_credito: c.valorCredito,
  numero_per_original: c.numeroPerOriginal,
}));
const dcomps = DB.dcomps.map((d) => ({
  id: d.idDcomp,
  numero: d.idDcomp,
  perdcomp_credito_id: d.idCredito,
  data_transmissao: d.dataTransmissao,
  situacao_documento: d.situacao,
  numero_referencia: d.idDocReferencia,
  credito_informado_entrega: d.creditoInformadoEntrega,
  credito_utilizado: d.creditoUtilizado,
  selic_acumulada: d.selicAcumulada,
}));
const debitos = DB.debitos.map((x) => ({
  dcomp_id: x.idDcomp,
  codigo_receita: x.codigoReceita,
  periodo_apuracao: x.periodoApuracao,
  total: x.total,
}));
const eventos = DB.eventos.map((e) => ({ ...e, created_at: String(e.idEvento).padStart(6, '0') }));
const perVersoes = DB.perVersoes.map((v) => ({ perdcomp_credito_id: v.idCredito, vigente: v.vigente }));
const selic = DB.selicMensal.map((s) => ({ competencia: `${s.competencia}-01`, taxa: s.taxa }));

// --- compara ---------------------------------------------------------------
let checagens = 0;
const falhas = [];
const igual = (rotulo, a, b) => {
  checagens += 1;
  const ok = (a == null && b == null) || (typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) < 0.005 : JSON.stringify(a) === JSON.stringify(b));
  if (!ok) falhas.push(`${rotulo}: protótipo=${JSON.stringify(a)} ERP=${JSON.stringify(b)}`);
};

for (const c of DB.creditos) {
  const e = creditos.find((x) => x.id === c.idCredito);

  const sp = proto.saldo(c, DB.dcomps);
  const se = erp.saldo(e, dcomps);
  igual(`saldo ${c.competencia}`, sp.saldo, se.saldo);
  igual(`utilizado ${c.competencia}`, sp.utilizado, se.utilizado);

  const xp = proto.extrato(c, DB.dcomps);
  const xe = erp.extrato(e, dcomps);
  igual(`qtd extrato ${c.competencia}`, xp.length, xe.length);
  xp.forEach((l, i) => {
    igual(`saldoAnterior ${l.idDcomp}`, l.saldoAnterior, xe[i]?.saldoAnterior);
    igual(`saldoApos ${l.idDcomp}`, l.saldoApos, xe[i]?.saldoApos);
    igual(`divergencia ${l.idDcomp}`, l.divergencia, xe[i]?.divergencia);
  });

  const ref = DB.selicUltimoMes;
  const cp = proto.saldoCorrigido(c, DB.dcomps, DB.selicMensal, ref);
  const ce = erp.saldoCorrigido(e, dcomps, selic, ref);
  igual(`indice corrigido ${c.competencia}`, cp.percentual, ce.percentual);
  igual(`valor corrigido ${c.competencia}`, cp.valor, ce.valor);

  const ap = proto.alertas(c, DB.dcomps, DB.debitos, DB.eventos).map((a) => a.nivel);
  const ae = erp.alertas(e, { dcomps, debitos, eventos, perVersoes }).map((a) => a.nivel);
  igual(`alertas ${c.competencia}`, ap, ae);
}

// Selic de cada DCOMP real: regra do protótipo × regra do ERP × valor declarado
let batemComDeclarado = 0;
let comparaveis = 0;
let batemPorTipo = 0;
let comparaveisTipo = 0;
const falhasTipo = [];
for (const d of DB.dcomps) {
  const c = DB.creditos.find((x) => x.idCredito === d.idCredito);
  const ate = d.dataTransmissao.slice(0, 7);
  const ip = proto.indiceSelic(c.competencia, ate, DB.selicMensal).percentual;
  const ie = erp.indiceSelic(`${c.competencia}-01`, ate, selic).percentual;
  igual(`indiceSelic ${d.idDcomp}`, ip, ie);
  if (d.selicAcumulada != null && ie != null) {
    comparaveis += 1;
    if (Math.abs(ie - d.selicAcumulada) < 0.005) batemComDeclarado += 1;
  }

  // Regra por tipo do ERP (marco + deslocamento, e data da DCOMP original na
  // retificação) contra o índice que a DCOMP real declarou.
  const ce = creditos.find((x) => x.id === d.idCredito);
  const de = dcomps.find((x) => x.id === d.idDcomp);
  const it = erp.indiceSelicDcomp(de, ce, dcomps, selic).percentual;
  if (d.selicAcumulada != null && it != null) {
    comparaveisTipo += 1;
    if (Math.abs(it - d.selicAcumulada) < 0.005) batemPorTipo += 1;
    else falhasTipo.push(`${d.idDcomp}: declarado ${d.selicAcumulada} × regra por tipo ${it}`);
  }
}

console.log(`Créditos: ${DB.creditos.length} | DCOMPs: ${DB.dcomps.length} | débitos: ${DB.debitos.length} | eventos: ${DB.eventos.length}`);
console.log(`Checagens protótipo × ERP: ${checagens} | divergências: ${falhas.length}`);
console.log(`Selic do ERP igual à declarada na DCOMP real: ${batemComDeclarado}/${comparaveis}`);
console.log(`Selic pela regra por TIPO igual à declarada:   ${batemPorTipo}/${comparaveisTipo}`);
falhasTipo.forEach((f) => console.log('  ' + f));
if (falhasTipo.length) falhas.push(...falhasTipo);
if (falhas.length) {
  console.log('\nDIVERGÊNCIAS:');
  falhas.slice(0, 30).forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log('\nOK — o módulo do ERP reproduz o protótipo em todos os pontos verificados.');
