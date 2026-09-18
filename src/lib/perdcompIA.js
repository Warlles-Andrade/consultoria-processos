/**
 * Leitura de PDF de PER/DCOMP com IA (api/ler-perdcomp.js) e conversão do
 * resultado para o formulário de revisão. Nada é gravado aqui.
 */
import { supabase } from '@/lib/supabaseClient';
import { onlyDigits, formatCNPJ, formatNumeroPerdcomp } from '@/data/fiscalDomain';

const LIMITE_BYTES = 3 * 1024 * 1024;

const paraBase64 = (arquivo) => new Promise((resolve, reject) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
  leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  leitor.readAsDataURL(arquivo);
});

export const lerPdfComIA = async (arquivo) => {
  if (!arquivo) throw new Error('Escolha um PDF.');
  if (arquivo.type && arquivo.type !== 'application/pdf') throw new Error('O arquivo precisa ser PDF.');
  if (arquivo.size > LIMITE_BYTES) throw new Error('PDF acima de 3 MB. Envie só as páginas do documento.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada. Entre de novo.');

  const resposta = await fetch('/api/ler-perdcomp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ arquivo: await paraBase64(arquivo), nome: arquivo.name }),
  });
  let corpo = {};
  try { corpo = await resposta.json(); } catch { /* corpo vazio */ }
  if (!resposta.ok) throw new Error(corpo.error || `Falha na leitura (${resposta.status}).`);
  return corpo.dados;
};

const n24 = (v) => {
  const d = onlyDigits(v);
  return d.length === 24 ? d : '';
};
const ym = (v) => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : '');
const ymd = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

/** Acha o crédito do ERP a que um número (PER, versão ou ID) pertence. */
const creditoPorNumero = (numero, { creditos, perVersoes, dcomps }) => {
  if (!numero) return null;
  const direto = creditos.find((c) => c.id_credito_rfb === numero || c.numero_per_original === numero);
  if (direto) return direto;
  const versao = perVersoes.find((v) => v.numero === numero);
  if (versao) return creditos.find((c) => c.id === versao.perdcomp_credito_id) || null;
  const dcomp = dcomps.find((d) => d.numero === numero);
  if (dcomp) return creditos.find((c) => c.id === dcomp.perdcomp_credito_id) || null;
  return null;
};

/**
 * @returns {{ modo: 'PER'|'DCOMP', inicial: { origem, campos, avisos } }}
 */
export const extracaoParaFormulario = (dados, { creditos = [], perVersoes = [], dcomps = [], contribuinte } = {}) => {
  if (!dados || dados.tipo_documento === 'NAO_IDENTIFICADO') {
    throw new Error('O PDF não parece ser um PER nem uma DCOMP.');
  }
  const ctx = { creditos, perVersoes, dcomps };
  const avisos = [...(dados.observacoes || [])];

  const cnpj = onlyDigits(dados.cnpj);
  if (contribuinte && cnpj && cnpj !== onlyDigits(contribuinte.cnpj)) {
    avisos.unshift(`O CNPJ do PDF (${formatCNPJ(cnpj)}) não é o do contribuinte selecionado (${formatCNPJ(contribuinte.cnpj)}).`);
  }
  if (dados.numero && !n24(dados.numero)) avisos.push('O número lido não tem 24 dígitos — confira.');

  const conta = dados.conta_restituicao || {};

  if (dados.tipo_documento === 'PER') {
    const anterior = n24(dados.numero_retificado);
    const credito = dados.retificador ? creditoPorNumero(anterior, ctx) : null;
    if (dados.retificador && !credito) {
      avisos.push(`PER retificador de ${anterior ? formatNumeroPerdcomp(anterior) : 'número não lido'}, que não está no controle. Cadastre o original antes ou lance este como original.`);
    }
    return {
      modo: 'PER',
      inicial: {
        origem: 'IA',
        avisos,
        campos: {
          versao: dados.retificador && credito ? 'retificador' : 'original',
          credito_existente: credito?.id || '',
          numero_anterior: anterior,
          numero: n24(dados.numero) || dados.numero || '',
          data_transmissao: dados.data_transmissao || '',
          tipo_credito: dados.tipo_credito || 'Outro',
          competencia: ym(dados.competencia),
          valor: dados.valor_pedido ?? null,
          numero_recibo: dados.numero_recibo || '',
          banco: conta.banco || '', agencia: conta.agencia || '', conta: conta.conta || '', dv: conta.dv || '',
          composicao: (dados.composicao || []).map((x) => ({
            tipo_item: x.tipo_item,
            documento: x.documento || '',
            cnpj_relacionado: onlyDigits(x.cnpj),
            nome_relacionado: x.nome || '',
            data_documento: ymd(x.data_documento),
            periodo_apuracao: ym(x.periodo_apuracao),
            codigo_receita: x.codigo_receita || '',
            valor: x.valor ?? null,
          })),
        },
      },
    };
  }

  // DCOMP
  const referencia = n24(dados.numero_credito_referencia);
  const retificada = n24(dados.numero_retificado);
  let credito = creditoPorNumero(referencia, ctx) || creditoPorNumero(retificada, ctx);
  if (!credito && dados.tipo_credito && dados.competencia) {
    const candidatos = creditos.filter((c) => c.tipo_credito === dados.tipo_credito && String(c.competencia).slice(0, 7) === ym(dados.competencia));
    if (candidatos.length === 1) {
      [credito] = candidatos;
      avisos.push('Crédito localizado pelo tipo e pela competência (o número de referência não bateu) — confira.');
    }
  }
  if (!credito) {
    avisos.push(`Crédito desta DCOMP não encontrado no controle${referencia ? ` (referência ${formatNumeroPerdcomp(referencia)})` : ''}. Selecione-o ou cadastre o PER antes.`);
  }
  const retificadaNoControle = retificada && dcomps.some((d) => d.numero === retificada);
  const somaDebitos = Math.round((dados.debitos || []).reduce((s, x) => s + Number(x.total || 0), 0) * 100) / 100;
  if (dados.total_debitos != null && dados.debitos?.length && Math.abs(somaDebitos - dados.total_debitos) > 0.01) {
    avisos.push(`Os débitos lidos somam ${somaDebitos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, mas o total impresso é ${Number(dados.total_debitos).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — falta ou sobra algum débito.`);
  }
  if (dados.retificador && !retificadaNoControle) {
    avisos.push('DCOMP retificadora de um documento que não está no controle — selecione a retificada.');
  }

  return {
    modo: 'DCOMP',
    inicial: {
      origem: 'IA',
      avisos,
      campos: {
        perdcomp_credito_id: credito?.id || '',
        numero: n24(dados.numero) || dados.numero || '',
        data_transmissao: dados.data_transmissao || '',
        situacao_documento: dados.retificador ? 'retificadora' : 'ativa',
        numero_referencia: retificadaNoControle ? retificada : '',
        credito_informado_entrega: dados.credito_original_na_entrega ?? null,
        credito_utilizado: dados.credito_original_utilizado ?? null,
        selic_acumulada: dados.selic_acumulada != null ? String(dados.selic_acumulada).replace('.', ',') : '',
        credito_atualizado: dados.credito_atualizado ?? null,
        saldo_informado: dados.saldo_credito_original ?? null,
        debitos: (dados.debitos || []).map((x) => ({
          codigo_receita: x.codigo_receita || '',
          periodo_apuracao: ym(x.periodo_apuracao),
          vencimento: ymd(x.vencimento),
          principal: x.principal ?? null,
          multa: x.multa ?? null,
          juros: x.juros ?? null,
          total: x.total ?? null,
        })),
      },
    },
  };
};
