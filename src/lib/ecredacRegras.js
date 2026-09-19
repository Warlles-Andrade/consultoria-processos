/**
 * Regras do e-CredAc (ICMS-SP, crédito acumulado) — funções puras, sem banco.
 *
 * Conta-corrente: C soma, D subtrai, "*" é informativo (o deferimento de
 * uma reserva não mexe no saldo: o débito já saiu na reserva).
 *
 * Honorários (contrato por percentual, padrão 8%):
 *   devidos   = % × (apropriações − reincorporações deferidas)
 *   faturável = % × reservas deferidas  → é o consumo do crédito no mês
 *   a faturar = faturável − boletos emitidos
 *   saldo     = devidos − boletos emitidos
 * Só entram movimentos a partir de conta.inicio_honorarios.
 */

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v) => (v == null || v === '' ? 0 : Number(v));
const mesDe = (iso) => String(iso).slice(0, 7);
const digitos = (v) => String(v ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------------
// Classificação do histórico do extrato
// ---------------------------------------------------------------------

export const OPERACOES = {
  RESERVA_TRANSFERENCIA: { rotulo: 'Reserva para transferência', grupo: 'Saída' },
  RESERVA_REINCORPORACAO: { rotulo: 'Reserva para reincorporação', grupo: 'Saída' },
  RESERVA_COMPENSACAO: { rotulo: 'Reserva para compensação', grupo: 'Saída' },
  RESERVA_FACCA: { rotulo: 'Reserva na FACCA', grupo: 'Saída' },
  DEFERIMENTO_RESERVA: { rotulo: 'Deferimento de reserva (consumo)', grupo: 'Informativo' },
  DEFERIMENTO_REINCORPORACAO: { rotulo: 'Deferimento de reincorporação', grupo: 'Informativo' },
  INDEFERIMENTO_RESERVA: { rotulo: 'Indeferimento de reserva (volta à conta)', grupo: 'Entrada' },
  NAO_ACEITE: { rotulo: 'Não aceite do destinatário (volta à conta)', grupo: 'Entrada' },
  DEFERIMENTO_PARCIAL_FACCA: { rotulo: 'Deferimento parcial na FACCA', grupo: 'Entrada' },
  INDEFERIMENTO_FACCA: { rotulo: 'Indeferimento na FACCA', grupo: 'Entrada' },
  RESGATE_FACCA: { rotulo: 'Resgate da FACCA', grupo: 'Entrada' },
  ESTORNO_RESGATE_FACCA: { rotulo: 'Estorno de resgate da FACCA', grupo: 'Saída' },
  APROPRIACAO: { rotulo: 'Apropriação (crédito homologado)', grupo: 'Entrada' },
  DEVOLUCAO_CREDITO: { rotulo: 'Devolução de crédito', grupo: 'Entrada' },
  OUTRO: { rotulo: 'Outro', grupo: 'Outro' },
};

const REGRAS_HISTORICO = [
  [/^RESERVA - Reincorpora/i, 'RESERVA_REINCORPORACAO'],
  [/^RESERVA - Compensa/i, 'RESERVA_COMPENSACAO'],
  [/^RESERVA - /i, 'RESERVA_TRANSFERENCIA'],
  [/^RESERVA d[ae] Ficha/i, 'RESERVA_FACCA'],
  [/^DEFERIMENTO PARCIAL n[ae] Ficha/i, 'DEFERIMENTO_PARCIAL_FACCA'],
  [/^DEFERIMENTO( AUTOM[ÁA]TICO)? - Reincorpora/i, 'DEFERIMENTO_REINCORPORACAO'],
  [/^DEFERIMENTO( AUTOM[ÁA]TICO)? - /i, 'DEFERIMENTO_RESERVA'],
  [/^INDEFERIMENTO n[ae] Ficha/i, 'INDEFERIMENTO_FACCA'],
  [/^INDEFERIMENTO - /i, 'INDEFERIMENTO_RESERVA'],
  [/^N[ÃA]O ACEITE/i, 'NAO_ACEITE'],
  [/^ESTORNO DO RESGATE/i, 'ESTORNO_RESGATE_FACCA'],
  [/^RESGATE d[ae] Ficha/i, 'RESGATE_FACCA'],
  [/^DISPONIBILIZA[ÇC][ÃA]O - Apropria/i, 'APROPRIACAO'],
  [/^DISPONIBILIZA[ÇC][ÃA]O - Devolu/i, 'DEVOLUCAO_CREDITO'],
];

/**
 * Lê o histórico do extrato e devolve a operação e os dados embutidos
 * (destinatário, referência e processo da apropriação, finalidade).
 */
export const classificar = (historico) => {
  const h = String(historico || '').trim();
  const regra = REGRAS_HISTORICO.find(([re]) => re.test(h));
  const operacao = regra ? regra[1] : 'OUTRO';

  const dest = h.match(/Destinat[áa]rio:\s*([\d./-]+)/i);
  const ref = h.match(/Refer[êe]ncia:\s*(\d{2})\/(\d{4})/i);
  const proc = h.match(/N[ºo°]\s*Processo:\s*([^\s].*?)\s*$/i);
  const fin = h.match(/^[^-]+-\s*(Transfer[êe]ncia para .*?\))\s*(?:-|$)/i);

  const cnpj = dest ? digitos(dest[1]) : '';
  return {
    operacao,
    destinatario_cnpj: cnpj.length === 14 ? cnpj : null,
    referencia: ref ? `${ref[2]}-${ref[1]}-01` : null,
    numero_processo: proc ? proc[1] : null,
    finalidade: fin ? fin[1] : null,
  };
};

// ---------------------------------------------------------------------
// Saldo e extrato
// ---------------------------------------------------------------------

const efeito = (m) => (m.natureza === 'C' ? num(m.valor) : m.natureza === 'D' ? -num(m.valor) : 0);

/** Ordem do extrato: data e, no mesmo dia, a ordem de gravação. */
export const ordenar = (movs) => [...movs].sort((a, b) =>
  String(a.data).localeCompare(String(b.data)) || (num(a.ordem) - num(b.ordem)));

export const saldo = (conta, movs) =>
  round2(num(conta?.saldo_inicial) + movs.reduce((s, m) => s + efeito(m), 0));

/**
 * Extrato com saldo corrido. `divergencia` compara com o saldo impresso
 * no extrato do e-CredAc, quando ele veio na importação.
 */
export const extrato = (conta, movs) => {
  let s = num(conta?.saldo_inicial);
  return ordenar(movs).map((m) => {
    s = round2(s + efeito(m));
    const impresso = m.saldo_extrato == null ? null : num(m.saldo_extrato);
    return { ...m, saldoCorrido: s, divergencia: impresso == null ? null : round2(s - impresso) };
  });
};

// ---------------------------------------------------------------------
// Honorários e faturamento
// ---------------------------------------------------------------------

const noContrato = (conta, m) => !conta?.inicio_honorarios || String(m.data) >= String(conta.inicio_honorarios);

/**
 * Consolidado e mês a mês. `faturamentos` são os boletos emitidos
 * (cancelados não contam).
 */
export const honorarios = (conta, movs, faturamentos = []) => {
  const pct = num(conta?.percentual_honorarios ?? 8) / 100;
  const meses = new Map();
  const mes = (k) => {
    if (!meses.has(k)) meses.set(k, { mes: k, consumo: 0, apropriado: 0, reincorporado: 0, faturado: 0 });
    return meses.get(k);
  };

  movs.filter((m) => noContrato(conta, m)).forEach((m) => {
    const linha = mes(mesDe(m.data));
    if (m.operacao === 'DEFERIMENTO_RESERVA') linha.consumo += num(m.valor);
    if (m.operacao === 'APROPRIACAO') linha.apropriado += num(m.valor);
    if (m.operacao === 'DEFERIMENTO_REINCORPORACAO') linha.reincorporado += num(m.valor);
  });
  faturamentos.filter((f) => f.situacao !== 'Cancelado').forEach((f) => {
    mes(mesDe(f.competencia || f.data_emissao)).faturado += num(f.valor);
  });

  let faturavelAc = 0;
  let faturadoAc = 0;
  const porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((l) => {
    const honorariosConsumo = round2(l.consumo * pct);
    faturavelAc = round2(faturavelAc + honorariosConsumo);
    faturadoAc = round2(faturadoAc + l.faturado);
    return {
      ...l,
      consumo: round2(l.consumo),
      apropriado: round2(l.apropriado),
      reincorporado: round2(l.reincorporado),
      faturado: round2(l.faturado),
      honorariosConsumo,
      honorariosApropriacao: round2((l.apropriado - l.reincorporado) * pct),
      aFaturarAcumulado: round2(faturavelAc - faturadoAc),
    };
  });

  const soma = (k) => round2(porMes.reduce((s, l) => s + l[k], 0));
  const devidos = soma('honorariosApropriacao');
  const faturavel = soma('honorariosConsumo');
  const faturado = soma('faturado');
  return {
    percentual: pct * 100,
    devidos,
    faturavel,
    faturado,
    aFaturar: round2(faturavel - faturado),
    saldo: round2(devidos - faturado),
    consumoTotal: soma('consumo'),
    porMes,
  };
};

// ---------------------------------------------------------------------
// Pedidos × apropriações
// ---------------------------------------------------------------------

const normPedido = (v) => String(v || '').replace(/\s/g, '').replace(/^0+/, '');

/**
 * Cruza cada pedido (habilitação) com as apropriações do extrato pelo
 * número do pedido, que o e-CredAc usa como "documento" da apropriação.
 */
export const conciliarPedidos = (pedidos, movs) => {
  const aprop = new Map();
  movs.filter((m) => m.operacao === 'APROPRIACAO').forEach((m) => {
    const k = normPedido(m.documento);
    aprop.set(k, [...(aprop.get(k) || []), m]);
  });
  return pedidos.map((p) => {
    const lista = (aprop.get(normPedido(p.numero_protocolo)) || []).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const apropriado = round2(lista.reduce((s, m) => s + num(m.valor), 0));
    const pedido = num(p.valor_pleiteado);
    let status;
    if (!lista.length) status = 'Aguardando apropriação';
    else if (apropriado + 0.01 >= pedido) status = 'Apropriado integralmente';
    else status = 'Apropriado parcialmente';
    return {
      ...p,
      apropriacoes: lista,
      apropriado,
      diferenca: round2(pedido - apropriado),
      primeiraApropriacao: lista[0]?.data || null,
      ultimaApropriacao: lista[lista.length - 1]?.data || null,
      statusConciliacao: status,
    };
  });
};

/** Apropriações do extrato sem pedido cadastrado — pedidos a completar no controle. */
export const apropriacoesSemPedido = (pedidos, movs) => {
  const conhecidos = new Set(pedidos.map((p) => normPedido(p.numero_protocolo)));
  return movs.filter((m) => m.operacao === 'APROPRIACAO' && !conhecidos.has(normPedido(m.documento)));
};

// ---------------------------------------------------------------------
// Arquivos do mês (custeio): calendário de pendências
// ---------------------------------------------------------------------

const somarMeses = (ym, n) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Para cada mês de referência, do mais antigo conhecido até o mês anterior
 * ao atual: há arquivo transmitido? há pedido registrado? Um mês sem os
 * dois é pendência de transmissão.
 * @param desde 'AAAA-MM' opcional para começar o calendário
 */
export const calendarioArquivos = ({ pedidos = [], arquivos = [], desde, ate } = {}) => {
  const hoje = new Date();
  const fim = ate || somarMeses(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`, -1);
  const refsPedidos = pedidos.map((p) => p.periodo_referencia_inicio && mesDe(p.periodo_referencia_inicio)).filter(Boolean);
  const refsArquivos = arquivos.map((a) => mesDe(a.referencia));
  const inicio = desde || [...refsPedidos, ...refsArquivos].sort()[0];
  if (!inicio) return [];

  const linhas = [];
  for (let k = inicio; k <= fim; k = somarMeses(k, 1)) {
    const peds = pedidos.filter((p) => p.periodo_referencia_inicio && mesDe(p.periodo_referencia_inicio) === k);
    const arqs = arquivos.filter((a) => mesDe(a.referencia) === k);
    const transmitido = arqs.some((a) => ['Transmitido', 'Pedido registrado'].includes(a.situacao));
    const dispensado = arqs.some((a) => a.situacao === 'Dispensado');
    let situacao;
    if (peds.length) situacao = 'Pedido registrado';
    else if (dispensado) situacao = 'Dispensado';
    else if (transmitido) situacao = 'Arquivo transmitido, sem pedido';
    else if (arqs.some((a) => a.situacao === 'Com erro')) situacao = 'Arquivo com erro';
    else if (arqs.some((a) => a.situacao === 'Em elaboração')) situacao = 'Em elaboração';
    else situacao = 'Pendente';
    linhas.push({
      referencia: k,
      situacao,
      pendente: ['Pendente', 'Arquivo com erro', 'Em elaboração', 'Arquivo transmitido, sem pedido'].includes(situacao),
      pedidos: peds,
      arquivos: arqs,
      valorPedido: round2(peds.reduce((s, p) => s + num(p.valor_pleiteado), 0)),
    });
  }
  return linhas;
};
