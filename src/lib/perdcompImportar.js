/**
 * Importação do "Controle PER/DCOMP" (protótipo HTML ou o JSON exportado
 * por ele) para o ERP.
 *
 * Duas etapas, separadas de propósito:
 *  1. lerArquivoControle() + mapearParaErp(): puras, sem banco. Dá para
 *     mostrar a prévia antes de gravar e para testar fora do navegador.
 *  2. gravarImportacao(): grava com o supabase-js do usuário logado — a RLS
 *     vale normalmente.
 *
 * Reimportar é seguro: tudo é casado pela chave natural da Receita
 * (ID do crédito, nº do PER, nº da DCOMP). O que veio do e-CAC é
 * atualizado; o que a equipe lançou à mão (origem MANUAL) é preservado.
 */

const TIPOS_CONHECIDOS = {
  'retenção - lei nº 9.711/98': 'Retenção - Lei nº 9.711/98',
  'retencao - lei n 9.711/98': 'Retenção - Lei nº 9.711/98',
  'pagamento indevido ou a maior': 'Pagamento Indevido ou a Maior',
  'contribuição previdenciária indevida ou a maior': 'Contribuição Previdenciária Indevida ou a Maior',
  'salário-família e salário-maternidade': 'Salário-Família e Salário-Maternidade',
  'saldo negativo de irpj': 'Saldo Negativo de IRPJ',
  'saldo negativo de csll': 'Saldo Negativo de CSLL',
  'ressarcimento de ipi': 'Ressarcimento de IPI',
  'ressarcimento de pis/pasep não cumulativo': 'Ressarcimento de PIS/Pasep Não Cumulativo',
  'ressarcimento de cofins não cumulativa': 'Ressarcimento de Cofins Não Cumulativa',
  'crédito oriundo de ação judicial': 'Crédito Oriundo de Ação Judicial',
};

const normalizar = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
export const tipoCreditoDoCatalogo = (descricao) => TIPOS_CONHECIDOS[normalizar(descricao)] || 'Outro';

const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * O e-CAC entrega horários sem fuso, no horário de Brasília. Sem marcar o
 * fuso, o banco os leria como UTC e uma transmissão às 22h do último dia do
 * mês cairia no mês seguinte — o que muda o índice Selic.
 * (Brasília não tem horário de verão desde 2019.)
 */
const horarioBrasilia = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  return s.includes('T') ? `${s}-03:00` : `${s}T12:00:00-03:00`;
};
const dia1 = (ym) => (ym ? `${String(ym).slice(0, 7)}-01` : null);
const data = (v) => (v ? String(v).slice(0, 10) : null);
const num = (v) => (v == null || v === '' ? null : Number(v));

/**
 * Aceita o HTML do protótipo (extrai o bloco `const DB = {...}`) ou o
 * próprio objeto/JSON com as mesmas chaves.
 */
export const lerArquivoControle = (conteudo) => {
  if (conteudo && typeof conteudo === 'object') return validar(conteudo);
  const texto = String(conteudo || '');

  const noHtml = texto.match(/const\s+DB\s*=\s*(\{[\s\S]*?\});\s*\n/);
  const bruto = noHtml ? noHtml[1] : texto.trim();
  let db;
  try {
    db = JSON.parse(bruto);
  } catch {
    throw new Error('Arquivo não reconhecido. Envie o HTML do "Controle PER/DCOMP" ou o JSON exportado por ele.');
  }
  return validar(db);
};

const validar = (db) => {
  if (!Array.isArray(db?.creditos)) {
    throw new Error('O arquivo não traz a lista de créditos ("creditos"). É mesmo um controle PER/DCOMP?');
  }
  const cnpj = somenteDigitos(db.contribuinte?.cni || db.contribuinte?.cnpj);
  if (cnpj.length !== 14) {
    throw new Error('O arquivo não identifica o CNPJ do contribuinte ("contribuinte.cni").');
  }
  return db;
};

/**
 * Converte para as linhas do ERP. Os vínculos usam as chaves naturais da
 * Receita; os uuids são resolvidos na gravação.
 */
export const mapearParaErp = (db) => {
  const contribuinte = {
    cnpj: somenteDigitos(db.contribuinte.cni || db.contribuinte.cnpj),
    razao_social: db.contribuinte.razaoSocial || db.contribuinte.razao_social || null,
  };

  const creditos = db.creditos.map((c) => ({
    id_credito_rfb: String(c.idCredito),
    competencia: dia1(c.competencia),
    tipo_credito: tipoCreditoDoCatalogo(c.tipoCredito?.descricao),
    tipo_credito_codigo: c.tipoCredito?.codigo ?? null,
    valor_credito: num(c.valorCredito),
    data_transmissao: horarioBrasilia(c.dataTransmissao),
    numero_per_original: c.numeroPerOriginal || null,
    forma_recebimento: c.formaRecebimento || null,
    termo_inicial_correcao: c.termoInicialCorrecao ? data(dia1(c.termoInicialCorrecao)) : null,
    origem: 'ECAC',
  }));

  const perVersoes = (db.perVersoes || []).map((v) => ({
    id_credito_rfb: String(v.idCredito),
    numero: String(v.idVersao),
    numero_anterior: v.idVersaoAnterior || null,
    data_transmissao: horarioBrasilia(v.dataTransmissao),
    vigente: !!v.vigente,
    valor_pedido: num(v.valorPedidoRestituicao),
    numero_recibo: v.numeroRecibo || null,
    forma_recebimento: v.formaRecebimento || null,
    origem: 'ECAC',
  }));

  const dcomps = (db.dcomps || []).map((d) => ({
    id_credito_rfb: String(d.idCredito),
    numero: String(d.idDcomp),
    data_transmissao: horarioBrasilia(d.dataTransmissao),
    situacao_documento: d.situacao || 'ativa',
    numero_referencia: d.idDocReferencia || null,
    credito_informado_entrega: num(d.creditoInformadoEntrega),
    credito_utilizado: num(d.creditoUtilizado) ?? 0,
    saldo_informado: num(d.saldoInformado),
    selic_acumulada: num(d.selicAcumulada),
    credito_atualizado: num(d.creditoAtualizado),
    total_debitos: num(d.totalDebitos),
    origem: 'ECAC',
  }));

  const debitos = (db.debitos || []).map((x) => ({
    numero_dcomp: String(x.idDcomp),
    codigo_receita: x.codigoReceita || null,
    periodo_apuracao: x.periodoApuracao ? dia1(x.periodoApuracao) : null,
    vencimento: data(x.vencimento),
    principal: num(x.principal) ?? 0,
    multa: num(x.multa),
    juros: num(x.juros),
    total: num(x.total) ?? 0,
  }));

  const eventos = (db.eventos || []).map((e) => ({
    entidade: e.entidade,
    documento: String(e.documento),
    data: data(e.data),
    tipo: e.tipo,
    processo: e.processo || null,
    valor: num(e.valor),
    conta: e.conta || null,
    observacao: e.observacao || null,
    origem: e.origem === 'MANUAL' ? 'MANUAL' : 'ECAC',
  }));

  const selic = (db.selicMensal || []).map((s) => ({
    competencia: dia1(s.competencia),
    taxa: num(s.taxa),
    fonte: s.fonte || 'RFB',
  }));

  return { contribuinte, extraidoEm: db.extraidoEm || null, creditos, perVersoes, dcomps, debitos, eventos, selic };
};

/** Números para a prévia antes de gravar. */
export const resumoImportacao = (mapa) => ({
  contribuinte: mapa.contribuinte,
  extraidoEm: mapa.extraidoEm,
  creditos: mapa.creditos.length,
  valorTotal: Math.round(mapa.creditos.reduce((s, c) => s + (c.valor_credito || 0), 0) * 100) / 100,
  perVersoes: mapa.perVersoes.length,
  dcomps: mapa.dcomps.length,
  debitos: mapa.debitos.length,
  eventos: mapa.eventos.length,
  selic: mapa.selic.length,
  tiposNaoReconhecidos: [...new Set(mapa.creditos.filter((c) => c.tipo_credito === 'Outro').map((c) => c.tipo_credito_codigo))],
});

// ---------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------

const lotes = (arr, n = 200) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const exigir = ({ data: d, error }) => {
  if (error) throw error;
  return d;
};

/**
 * @param supabase cliente autenticado
 * @param mapa     resultado de mapearParaErp
 * @param destino  { projeto_id, contribuinte_id }
 * @param autor    { id, nome } para o carimbo
 * @param aoProgredir (etapa:string) => void
 */
export const gravarImportacao = async (supabase, mapa, destino, autor = {}, aoProgredir = () => {}) => {
  const { projeto_id, contribuinte_id } = destino;
  const carimbo = { created_by: autor.id || null, created_by_name: autor.nome || null };

  // 1. Créditos — upsert pelo ID da RFB
  aoProgredir('Créditos');
  const linhasCredito = mapa.creditos.map((c) => ({ ...c, projeto_id, contribuinte_id, ...carimbo }));
  const creditosGravados = [];
  for (const lote of lotes(linhasCredito)) {
    creditosGravados.push(...exigir(await supabase
      .from('perdcomp_creditos')
      .upsert(lote, { onConflict: 'id_credito_rfb' })
      .select('id, id_credito_rfb')));
  }
  const idCredito = new Map(creditosGravados.map((c) => [c.id_credito_rfb, c.id]));

  // 2. Versões do PER — upsert pelo número
  aoProgredir('Versões do PER');
  const linhasPer = mapa.perVersoes
    .filter((v) => idCredito.has(v.id_credito_rfb))
    .map(({ id_credito_rfb, ...v }) => ({ ...v, perdcomp_credito_id: idCredito.get(id_credito_rfb), projeto_id }));
  for (const lote of lotes(linhasPer)) {
    exigir(await supabase.from('perdcomp_per_versoes').upsert(lote, { onConflict: 'numero' }).select('id'));
  }

  // 3. DCOMPs — upsert pelo número
  aoProgredir('DCOMPs');
  const linhasDcomp = mapa.dcomps
    .filter((d) => idCredito.has(d.id_credito_rfb))
    .map(({ id_credito_rfb, ...d }) => ({ ...d, perdcomp_credito_id: idCredito.get(id_credito_rfb), projeto_id, ...carimbo }));
  const dcompsGravadas = [];
  for (const lote of lotes(linhasDcomp)) {
    dcompsGravadas.push(...exigir(await supabase
      .from('perdcomp_dcomps')
      .upsert(lote, { onConflict: 'numero' })
      .select('id, numero')));
  }
  const idDcomp = new Map(dcompsGravadas.map((d) => [d.numero, d.id]));

  // 4. Débitos — sem chave natural: os das DCOMPs importadas são substituídos
  aoProgredir('Débitos');
  const idsDcomp = [...idDcomp.values()];
  for (const lote of lotes(idsDcomp)) {
    exigir(await supabase.from('perdcomp_dcomp_debitos').delete().in('dcomp_id', lote).select('id'));
  }
  const linhasDebito = mapa.debitos
    .filter((x) => idDcomp.has(x.numero_dcomp))
    .map(({ numero_dcomp, ...x }) => ({ ...x, dcomp_id: idDcomp.get(numero_dcomp), projeto_id }));
  for (const lote of lotes(linhasDebito)) {
    exigir(await supabase.from('perdcomp_dcomp_debitos').insert(lote).select('id'));
  }

  // 5. Eventos — os de origem e-CAC dos documentos importados são
  //    substituídos; os lançados à mão pela equipe ficam intocados.
  aoProgredir('Eventos');
  const documentos = [...new Set([
    ...mapa.creditos.map((c) => c.numero_per_original).filter(Boolean),
    ...mapa.perVersoes.map((v) => v.numero),
    ...mapa.dcomps.map((d) => d.numero),
  ])];
  for (const lote of lotes(documentos)) {
    exigir(await supabase.from('perdcomp_eventos').delete()
      .eq('projeto_id', projeto_id).eq('origem', 'ECAC').in('documento', lote).select('id'));
  }
  const linhasEvento = mapa.eventos
    .filter((e) => e.origem !== 'MANUAL')
    .map((e) => ({ ...e, projeto_id, ...carimbo }));
  for (const lote of lotes(linhasEvento)) {
    exigir(await supabase.from('perdcomp_eventos').insert(lote).select('id'));
  }

  // 6. Selic — tabela global; só administrador grava (RLS). Falha aqui não
  //    invalida o resto: o cálculo apenas indica os meses faltantes.
  aoProgredir('Tabela Selic');
  let selicGravada = 0;
  let avisoSelic = null;
  if (mapa.selic.length) {
    const { data: s, error } = await supabase
      .from('selic_mensal')
      .upsert(mapa.selic, { onConflict: 'competencia' })
      .select('competencia');
    if (error) avisoSelic = 'A tabela Selic não foi atualizada (só administradores podem gravá-la).';
    else selicGravada = s.length;
  }

  return {
    creditos: creditosGravados.length,
    perVersoes: linhasPer.length,
    dcomps: dcompsGravadas.length,
    debitos: linhasDebito.length,
    eventos: linhasEvento.length,
    selic: selicGravada,
    avisoSelic,
  };
};
