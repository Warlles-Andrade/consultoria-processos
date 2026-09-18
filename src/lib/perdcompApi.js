/**
 * Acesso a dados do controle PER/DCOMP por crédito.
 *
 * O volume por contribuinte é pequeno (dezenas a centenas de documentos),
 * então a tela carrega tudo de um contribuinte de uma vez e calcula saldo,
 * extrato, Selic e alertas no navegador, com src/lib/perdcompRegras.js.
 * A RLS limita o que cada usuário recebe.
 */
import { supabase } from '@/lib/supabaseClient';

const exigir = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

/** Contribuintes que têm algum crédito PER/DCOMP, com contagem. */
export const listarContribuintesComPerdcomp = async () => {
  const creditos = exigir(await supabase
    .from('perdcomp_creditos')
    .select('contribuinte_id, projeto_id, contribuinte:contribuintes(id, razao_social, cnpj, cliente_id)'));
  const mapa = new Map();
  creditos.forEach((c) => {
    const atual = mapa.get(c.contribuinte_id) || { ...c.contribuinte, projeto_id: c.projeto_id, creditos: 0 };
    atual.creditos += 1;
    mapa.set(c.contribuinte_id, atual);
  });
  return [...mapa.values()].sort((a, b) => (a.razao_social || '').localeCompare(b.razao_social || ''));
};

/**
 * Tudo de um contribuinte, pronto para as regras.
 * A tabela Selic é global e vem inteira.
 */
export const carregarControle = async (contribuinteId) => {
  const creditos = exigir(await supabase
    .from('perdcomp_creditos')
    .select('*')
    .eq('contribuinte_id', contribuinteId)
    .order('competencia', { ascending: true }));

  const ids = creditos.map((c) => c.id);
  if (!ids.length) {
    return { creditos: [], perVersoes: [], dcomps: [], debitos: [], eventos: [], composicao: [], selic: [] };
  }

  const [perVersoes, dcomps, composicao, selic] = await Promise.all([
    supabase.from('perdcomp_per_versoes').select('*').in('perdcomp_credito_id', ids).order('data_transmissao'),
    supabase.from('perdcomp_dcomps').select('*').in('perdcomp_credito_id', ids).order('data_transmissao'),
    supabase.from('perdcomp_composicao').select('*').in('perdcomp_credito_id', ids).order('data_documento'),
    supabase.from('selic_mensal').select('competencia, taxa, fonte').order('competencia'),
  ]).then((r) => r.map(exigir));

  const idsDcomp = dcomps.map((d) => d.id);
  const documentos = [
    ...creditos.map((c) => c.numero_per_original).filter(Boolean),
    ...perVersoes.map((v) => v.numero),
    ...dcomps.map((d) => d.numero),
  ];

  const [debitos, eventos] = await Promise.all([
    idsDcomp.length
      ? supabase.from('perdcomp_dcomp_debitos').select('*').in('dcomp_id', idsDcomp)
      : Promise.resolve({ data: [] }),
    documentos.length
      ? supabase.from('perdcomp_eventos').select('*').in('documento', [...new Set(documentos)]).order('data')
      : Promise.resolve({ data: [] }),
  ]).then((r) => r.map(exigir));

  return { creditos, perVersoes, dcomps, debitos, eventos, composicao, selic };
};

// ---------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------

const autor = (usuario, userProfile) => ({
  created_by: usuario?.id || null,
  created_by_name: userProfile?.nome || usuario?.email || 'Usuário',
});

export const criarEvento = async (evento, usuario, userProfile) =>
  exigir(await supabase
    .from('perdcomp_eventos')
    .insert({ ...evento, origem: 'MANUAL', ...autor(usuario, userProfile) })
    .select()
    .single());

export const excluirEvento = async (id) =>
  exigir(await supabase.from('perdcomp_eventos').delete().eq('id', id).select());

export const criarDcomp = async (dcomp, debitos, usuario, userProfile) => {
  const gravada = exigir(await supabase
    .from('perdcomp_dcomps')
    .insert({ ...dcomp, origem: dcomp.origem || 'MANUAL', ...autor(usuario, userProfile) })
    .select()
    .single());
  if (debitos?.length) {
    exigir(await supabase
      .from('perdcomp_dcomp_debitos')
      .insert(debitos.map((x) => ({ ...x, dcomp_id: gravada.id, projeto_id: dcomp.projeto_id })))
      .select('id'));
  }
  // A retificadora substitui a anterior, que deixa de consumir crédito.
  if (gravada.situacao_documento === 'retificadora' && gravada.numero_referencia) {
    exigir(await supabase
      .from('perdcomp_dcomps')
      .update({ situacao_documento: 'retificada' })
      .eq('numero', gravada.numero_referencia)
      .select('id'));
  }
  // Toda DCOMP nasce com o evento de transmissão: é ele que dá a fase.
  await supabase.from('perdcomp_eventos').insert({
    projeto_id: dcomp.projeto_id,
    entidade: 'DCOMP',
    documento: gravada.numero,
    data: String(gravada.data_transmissao).slice(0, 10),
    tipo: 'TRANSMISSAO',
    observacao: 'Transmissão registrada no ERP.',
    origem: dcomp.origem || 'MANUAL',
    ...autor(usuario, userProfile),
  });
  return gravada;
};

export const criarCredito = async (credito, usuario, userProfile) =>
  exigir(await supabase
    .from('perdcomp_creditos')
    .insert({ ...credito, origem: credito.origem || 'MANUAL', ...autor(usuario, userProfile) })
    .select()
    .single());

/**
 * PER original: cria o crédito (ID da RFB = nº do PER, como no e-CAC), a
 * versão vigente, a composição e o evento de transmissão.
 * @param credito linha de perdcomp_creditos (sem id)
 * @param versao  { numero, data_transmissao, valor_pedido, numero_recibo, forma_recebimento }
 */
export const criarPerOriginal = async ({ credito, versao, composicao = [], origem = 'MANUAL' }, usuario, userProfile) => {
  const c = await criarCredito({ ...credito, origem }, usuario, userProfile);
  exigir(await supabase.from('perdcomp_per_versoes').insert({
    ...versao, perdcomp_credito_id: c.id, projeto_id: c.projeto_id, numero_anterior: null, vigente: true, origem,
  }).select('id'));
  if (composicao.length) {
    exigir(await supabase.from('perdcomp_composicao').insert(composicao.map((x) => ({
      ...x, perdcomp_credito_id: c.id, projeto_id: c.projeto_id, origem, ...autor(usuario, userProfile),
    }))).select('id'));
  }
  await supabase.from('perdcomp_eventos').insert({
    projeto_id: c.projeto_id, entidade: 'PER', documento: versao.numero,
    data: String(versao.data_transmissao || new Date().toISOString()).slice(0, 10),
    tipo: 'TRANSMISSAO', observacao: 'Transmissão registrada no ERP.', origem, ...autor(usuario, userProfile),
  });
  return c;
};

/**
 * PER retificador: nova versão vigente; as anteriores deixam de ser.
 * O valor do crédito passa a ser o valor pedido na retificadora — é o que
 * a Receita considera a partir dela. A fase continua no PER original.
 */
export const criarPerRetificador = async ({ credito, versao, origem = 'MANUAL' }, usuario, userProfile) => {
  exigir(await supabase.from('perdcomp_per_versoes')
    .update({ vigente: false }).eq('perdcomp_credito_id', credito.id).select('id'));
  const v = exigir(await supabase.from('perdcomp_per_versoes').insert({
    ...versao, perdcomp_credito_id: credito.id, projeto_id: credito.projeto_id, vigente: true, origem,
  }).select().single());
  if (versao.valor_pedido != null && Number(versao.valor_pedido) !== Number(credito.valor_credito)) {
    const quem = autor(usuario, userProfile);
    exigir(await supabase.from('perdcomp_creditos').update({
      valor_credito: versao.valor_pedido,
      ...(versao.forma_recebimento ? { forma_recebimento: versao.forma_recebimento } : {}),
      updated_by: quem.created_by, updated_by_name: quem.created_by_name,
    }).eq('id', credito.id).select('id'));
  }
  return v;
};

export const criarItemComposicao = async (item, usuario, userProfile) =>
  exigir(await supabase
    .from('perdcomp_composicao')
    .insert({ ...item, ...autor(usuario, userProfile) })
    .select()
    .single());

export const excluirItemComposicao = async (id) =>
  exigir(await supabase.from('perdcomp_composicao').delete().eq('id', id).select());
