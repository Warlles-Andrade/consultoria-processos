/**
 * Camada de acesso a dados do módulo fiscal/jurídico.
 *
 * Todas as funções lançam o erro do Supabase em caso de falha — os
 * componentes capturam e traduzem com getPublicErrorMessage(). A RLS do
 * banco já limita o que cada usuário enxerga; aqui não há filtro de
 * segurança, apenas de conveniência.
 */

import { supabase } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Nome de exibição do usuário logado, com fallbacks. */
export const autorNome = (usuario, userProfile) =>
  userProfile?.nome || usuario?.email || 'Usuário';

/**
 * Carimbo de auditoria. Em criação grava created_* e updated_*;
 * em edição grava apenas updated_*.
 */
export const carimbo = (usuario, userProfile, isNew) => {
  const nome = autorNome(usuario, userProfile);
  const base = {
    updated_by: usuario?.id || null,
    updated_by_name: nome,
  };
  if (!isNew) return base;
  return { ...base, created_by: usuario?.id || null, created_by_name: nome };
};

/** Carimbo para tabelas que só têm created_* (movimentos, andamentos). */
export const carimboCriacao = (usuario, userProfile) => ({
  created_by: usuario?.id || null,
  created_by_name: autorNome(usuario, userProfile),
});

/** Remove chaves com undefined para não sobrescrever colunas sem querer. */
const limpar = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------------
// Contribuintes
// ---------------------------------------------------------------------

export const listarContribuintes = async () =>
  unwrap(
    await supabase
      .from('contribuintes')
      .select('*, cliente:clientes(id, nome, cor)')
      .order('razao_social', { ascending: true })
  );

export const salvarContribuinte = async (dados, usuario, userProfile) => {
  const isNew = !dados.id;
  const payload = limpar({
    ...dados,
    cnpj: String(dados.cnpj || '').replace(/\D/g, ''),
    ...carimbo(usuario, userProfile, isNew),
  });
  if (isNew) delete payload.id;
  // contribuintes não tem updated_by; o trigger cuida de updated_at
  delete payload.updated_by;
  delete payload.updated_by_name;
  delete payload.cliente; // objeto do join, não é coluna

  return unwrap(
    await supabase.from('contribuintes').upsert(payload).select().single()
  );
};

export const excluirContribuinte = async (id) =>
  unwrap(await supabase.from('contribuintes').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------

const CREDITO_SELECT = `
  *,
  contribuinte:contribuintes(id, razao_social, nome_fantasia, cnpj, uf, cliente_id),
  projeto:projetos(id, nome, cliente_id)
`;

export const listarCreditos = async () =>
  unwrap(
    await supabase
      .from('creditos')
      .select(CREDITO_SELECT)
      .order('created_at', { ascending: false })
  );

/** Saldos derivados (view v_credito_saldos), indexados por credito_id. */
export const listarSaldos = async () => {
  const linhas = unwrap(await supabase.from('v_credito_saldos').select('*'));
  const mapa = {};
  (linhas || []).forEach((l) => {
    mapa[l.credito_id] = l;
  });
  return mapa;
};

/** Créditos já enriquecidos com o saldo derivado. */
export const listarCreditosComSaldo = async () => {
  const [creditos, saldos] = await Promise.all([
    listarCreditos(),
    listarSaldos(),
  ]);
  return (creditos || []).map((c) => ({
    ...c,
    saldo: saldos[c.id] || null,
  }));
};

export const salvarCredito = async (dados, usuario, userProfile) => {
  const isNew = !dados.id;
  const payload = limpar({
    ...dados,
    ...carimbo(usuario, userProfile, isNew),
  });
  if (isNew) delete payload.id;
  // Colunas geradas não podem ir no payload
  delete payload.data_limite_prescricao;
  delete payload.saldo;
  delete payload.contribuinte;
  delete payload.projeto;

  return unwrap(
    await supabase.from('creditos').upsert(payload).select(CREDITO_SELECT).single()
  );
};

export const excluirCredito = async (id) =>
  unwrap(await supabase.from('creditos').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Razão do crédito (credito_movimentos)
// ---------------------------------------------------------------------

export const listarMovimentos = async (creditoId) =>
  unwrap(
    await supabase
      .from('credito_movimentos')
      .select('*')
      .eq('credito_id', creditoId)
      .order('data_movimento', { ascending: false })
      .order('created_at', { ascending: false })
  );

export const criarMovimento = async (dados, usuario, userProfile) =>
  unwrap(
    await supabase
      .from('credito_movimentos')
      .insert(limpar({ ...dados, ...carimboCriacao(usuario, userProfile) }))
      .select()
      .single()
  );

export const excluirMovimento = async (id) =>
  unwrap(await supabase.from('credito_movimentos').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Habilitações — e-CredAc (CAT 207/2009 e CAT 83/2009)
// ---------------------------------------------------------------------

const HABILITACAO_SELECT = `
  *,
  credito:creditos(id, codigo, titulo, tributo),
  contribuinte:contribuintes(id, razao_social, cnpj, uf),
  projeto:projetos(id, nome)
`;

export const listarHabilitacoes = async () =>
  unwrap(
    await supabase
      .from('habilitacoes')
      .select(HABILITACAO_SELECT)
      .order('created_at', { ascending: false })
  );

export const salvarHabilitacao = async (dados, usuario, userProfile) => {
  const isNew = !dados.id;
  const payload = limpar({ ...dados, ...carimbo(usuario, userProfile, isNew) });
  if (isNew) delete payload.id;
  delete payload.credito;
  delete payload.contribuinte;
  delete payload.projeto;

  return unwrap(
    await supabase
      .from('habilitacoes')
      .upsert(payload)
      .select(HABILITACAO_SELECT)
      .single()
  );
};

export const excluirHabilitacao = async (id) =>
  unwrap(await supabase.from('habilitacoes').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// PER/DCOMP
// ---------------------------------------------------------------------

/**
 * Saldo de cada crédito PER/DCOMP (v_perdcomp_saldos). O controle completo
 * — versões, DCOMPs, eventos, Selic — fica em src/lib/perdcompApi.js.
 */
export const listarSaldosPerdcomp = async () =>
  unwrap(
    await supabase
      .from('v_perdcomp_saldos')
      .select('*')
  );

// ---------------------------------------------------------------------
// Contencioso administrativo
// ---------------------------------------------------------------------

const PROC_ADM_SELECT = `
  *,
  credito:creditos(id, codigo, titulo),
  contribuinte:contribuintes(id, razao_social, cnpj, uf),
  projeto:projetos(id, nome)
`;

export const listarProcessosAdministrativos = async () =>
  unwrap(
    await supabase
      .from('processos_administrativos')
      .select(PROC_ADM_SELECT)
      .order('created_at', { ascending: false })
  );

export const salvarProcessoAdministrativo = async (dados, usuario, userProfile) => {
  const isNew = !dados.id;
  const payload = limpar({ ...dados, ...carimbo(usuario, userProfile, isNew) });
  if (isNew) delete payload.id;
  delete payload.credito;
  delete payload.contribuinte;
  delete payload.projeto;

  return unwrap(
    await supabase
      .from('processos_administrativos')
      .upsert(payload)
      .select(PROC_ADM_SELECT)
      .single()
  );
};

export const excluirProcessoAdministrativo = async (id) =>
  unwrap(
    await supabase.from('processos_administrativos').delete().eq('id', id).select()
  );

// ---------------------------------------------------------------------
// Contencioso judicial
// ---------------------------------------------------------------------

const PROC_JUD_SELECT = `
  *,
  credito:creditos(id, codigo, titulo),
  contribuinte:contribuintes(id, razao_social, cnpj, uf),
  projeto:projetos(id, nome)
`;

export const listarProcessosJudiciais = async () =>
  unwrap(
    await supabase
      .from('processos_judiciais')
      .select(PROC_JUD_SELECT)
      .order('created_at', { ascending: false })
  );

export const salvarProcessoJudicial = async (dados, usuario, userProfile) => {
  const isNew = !dados.id;
  const payload = limpar({ ...dados, ...carimbo(usuario, userProfile, isNew) });
  if (isNew) delete payload.id;
  delete payload.prazo_compensacao; // coluna gerada
  delete payload.credito;
  delete payload.contribuinte;
  delete payload.projeto;

  return unwrap(
    await supabase
      .from('processos_judiciais')
      .upsert(payload)
      .select(PROC_JUD_SELECT)
      .single()
  );
};

export const excluirProcessoJudicial = async (id) =>
  unwrap(await supabase.from('processos_judiciais').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Andamentos (linha do tempo)
// ---------------------------------------------------------------------

export const listarAndamentos = async (entidadeTipo, entidadeId) =>
  unwrap(
    await supabase
      .from('andamentos')
      .select('*')
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
      .order('data_andamento', { ascending: false })
  );

export const criarAndamento = async (dados, usuario, userProfile) =>
  unwrap(
    await supabase
      .from('andamentos')
      .insert(limpar({ ...dados, ...carimboCriacao(usuario, userProfile) }))
      .select()
      .single()
  );

export const marcarAndamentoCumprido = async (id, cumprido) =>
  unwrap(
    await supabase
      .from('andamentos')
      .update({
        cumprido,
        data_cumprimento: cumprido ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', id)
      .select()
      .single()
  );

export const excluirAndamento = async (id) =>
  unwrap(await supabase.from('andamentos').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Prazos críticos (view consolidada)
// ---------------------------------------------------------------------

/**
 * Prazos em aberto ordenados do mais urgente para o menos.
 * @param {number|null} limiteDias - se informado, traz só até N dias restantes
 *                                   (vencidos sempre entram).
 */
export const listarPrazosCriticos = async (limiteDias = null) => {
  let query = supabase
    .from('v_prazos_criticos')
    .select('*')
    .order('dias_restantes', { ascending: true });

  if (limiteDias != null) query = query.lte('dias_restantes', limiteDias);

  return unwrap(await query);
};
