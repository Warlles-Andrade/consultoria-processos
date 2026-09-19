/**
 * Acesso a dados do e-CredAc (conta-corrente, boletos, arquivos, pedidos).
 * As contas ficam em src/lib/ecredacRegras.js; aqui só leitura e gravação.
 */
import { supabase } from '@/lib/supabaseClient';

const exigir = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

const autor = (usuario, userProfile) => ({
  created_by: usuario?.id || null,
  created_by_name: userProfile?.nome || usuario?.email || 'Usuário',
});

/** Lê tudo de uma tabela em páginas de 1000 (limite do PostgREST). */
const lerTudo = async (montar) => {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const lote = exigir(await montar().range(de, de + 999));
    todos.push(...lote);
    if (lote.length < 1000) return todos;
  }
};

export const listarContas = async () => {
  const contas = exigir(await supabase
    .from('ecredac_contas')
    .select('*, contribuinte:contribuintes(id, razao_social, cnpj, inscricao_estadual, cliente_id)')
    .order('created_at'));
  const saldos = exigir(await supabase.from('v_ecredac_saldos').select('*'));
  const porConta = new Map(saldos.map((s) => [s.conta_id, s]));
  return contas.map((c) => ({ ...c, resumo: porConta.get(c.id) || null }));
};

export const carregarConta = async (conta) => {
  const [movimentos, faturamentos, arquivos, pedidos] = await Promise.all([
    lerTudo(() => supabase.from('ecredac_movimentos').select('*').eq('conta_id', conta.id)
      .order('data').order('sequencia', { nullsFirst: false }).order('created_at')),
    supabase.from('ecredac_faturamentos').select('*').eq('conta_id', conta.id).order('data_emissao').then(exigir),
    supabase.from('ecredac_arquivos').select('*').eq('conta_id', conta.id).order('referencia').then(exigir),
    lerTudo(() => supabase.from('habilitacoes').select('*').eq('contribuinte_id', conta.contribuinte_id)
      .order('periodo_referencia_inicio')),
  ]);
  // "ordem" preserva a sequência do extrato dentro do mesmo dia
  return { movimentos: movimentos.map((m, i) => ({ ...m, ordem: i })), faturamentos, arquivos, pedidos };
};

export const criarConta = async (conta, usuario, userProfile) =>
  exigir(await supabase.from('ecredac_contas').insert({ ...conta, ...autor(usuario, userProfile) }).select().single());

export const atualizarConta = async (id, campos) =>
  exigir(await supabase.from('ecredac_contas').update(campos).eq('id', id).select().single());

// ---------------------------------------------------------------------
// Boletos de honorários
// ---------------------------------------------------------------------

export const criarFaturamento = async (f, usuario, userProfile) =>
  exigir(await supabase.from('ecredac_faturamentos').insert({ ...f, origem: 'MANUAL', ...autor(usuario, userProfile) }).select().single());

export const atualizarFaturamento = async (id, campos) =>
  exigir(await supabase.from('ecredac_faturamentos').update(campos).eq('id', id).select().single());

export const excluirFaturamento = async (id) =>
  exigir(await supabase.from('ecredac_faturamentos').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Arquivos do mês
// ---------------------------------------------------------------------

export const salvarArquivo = async (a, usuario, userProfile) =>
  exigir(await supabase.from('ecredac_arquivos')
    .upsert({ ...a, ...autor(usuario, userProfile) }, { onConflict: 'conta_id,referencia,tipo' })
    .select().single());

export const excluirArquivo = async (id) =>
  exigir(await supabase.from('ecredac_arquivos').delete().eq('id', id).select());

// ---------------------------------------------------------------------
// Importação (idempotente)
// ---------------------------------------------------------------------

const lotes = (arr, n = 500) => {
  const r = [];
  for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
  return r;
};

/**
 * Grava o extrato lido por ecredacImportar.lerContaCorrente.
 * Movimentos: casados pela chave (reimportar não duplica).
 * Boletos vindos da planilha: substituídos; os lançados à mão ficam.
 */
export const importarContaCorrente = async (conta, lido, aoProgredir = () => {}) => {
  const linhas = lido.movimentos.map(({ ordem, ...m }) => ({
    ...m, sequencia: ordem, conta_id: conta.id, projeto_id: conta.projeto_id, origem: 'IMPORTACAO',
  }));
  let gravados = 0;
  for (const lote of lotes(linhas)) {
    const r = exigir(await supabase.from('ecredac_movimentos')
      .upsert(lote, { onConflict: 'conta_id,chave', ignoreDuplicates: true }).select('id'));
    gravados += r.length;
    aoProgredir(`Lançamentos: ${gravados} novos`);
  }

  exigir(await supabase.from('ecredac_faturamentos').delete()
    .eq('conta_id', conta.id).eq('origem', 'IMPORTACAO').select('id'));
  if (lido.faturamentos.length) {
    exigir(await supabase.from('ecredac_faturamentos').insert(lido.faturamentos.map((f) => ({
      ...f, conta_id: conta.id, projeto_id: conta.projeto_id,
    }))).select('id'));
  }

  const ajustes = {};
  if (!conta.data_saldo_inicial || lido.dataSaldoInicial < conta.data_saldo_inicial) {
    ajustes.saldo_inicial = lido.saldoInicial;
    ajustes.data_saldo_inicial = lido.dataSaldoInicial;
  }
  if (!conta.inicio_honorarios && lido.inicioHonorarios) ajustes.inicio_honorarios = lido.inicioHonorarios;
  if (Object.keys(ajustes).length) await atualizarConta(conta.id, ajustes);

  return { novos: gravados, lidos: linhas.length, boletos: lido.faturamentos.length };
};

/**
 * Pedidos do e-CredAc vão para habilitacoes, pendurados num crédito
 * "guarda-chuva" do tipo E-CREDAC do contribuinte (criado se faltar).
 * Casados pelo número do pedido: atualiza os existentes, cria os novos.
 */
export const importarPedidos = async (conta, lido, usuario, userProfile) => {
  let credito = exigir(await supabase.from('creditos').select('id')
    .eq('contribuinte_id', conta.contribuinte_id).eq('tipo_levantamento', 'E-CREDAC').limit(1))[0];
  if (!credito) {
    credito = exigir(await supabase.from('creditos').insert({
      contribuinte_id: conta.contribuinte_id,
      projeto_id: conta.projeto_id,
      titulo: `ICMS crédito acumulado — ${conta.sistematica}`,
      tributo: 'ICMS',
      esfera: 'Estadual',
      origem: 'Escritural',
      tipo_levantamento: 'E-CREDAC',
      situacao: 'Em habilitação',
      valor_levantado: 0,
      ...autor(usuario, userProfile),
    }).select('id').single());
  }

  const numeros = lido.pedidos.map((p) => p.numero_protocolo);
  const existentes = exigir(await supabase.from('habilitacoes').select('id, numero_protocolo')
    .eq('contribuinte_id', conta.contribuinte_id).in('numero_protocolo', numeros));
  const idPor = new Map(existentes.map((e) => [e.numero_protocolo, e.id]));

  let criados = 0;
  let atualizados = 0;
  for (const { cnpj, ...p } of lido.pedidos) {
    const linha = {
      ...p,
      uf: 'SP',
      credito_id: credito.id,
      projeto_id: conta.projeto_id,
      contribuinte_id: conta.contribuinte_id,
    };
    if (idPor.has(p.numero_protocolo)) {
      exigir(await supabase.from('habilitacoes').update(linha).eq('id', idPor.get(p.numero_protocolo)).select('id'));
      atualizados += 1;
    } else {
      exigir(await supabase.from('habilitacoes').insert({ ...linha, ...autor(usuario, userProfile) }).select('id'));
      criados += 1;
    }
  }
  return { criados, atualizados };
};
