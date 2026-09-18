/**
 * Regras de negócio do controle PER/DCOMP.
 *
 * Transpostas do protótipo "Controle PER/DCOMP" (v2), cuja regra de Selic
 * foi conferida contra 23 DCOMPs reais. A equivalência com o protótipo é
 * verificada por scripts/verificar-perdcomp-regras.mjs — rode-o ao mexer aqui.
 *
 * Princípios herdados do protótipo:
 *  - Funções puras: recebem os dados, devolvem o resultado. Nenhuma tela
 *    guarda regra; o mesmo módulo pode rodar no servidor.
 *  - A FASE na Receita nunca é digitada: é o último evento registrado.
 *  - Só DCOMPs 'ativa' e 'retificadora' consomem crédito.
 *  - Selic: faltando um mês na tabela, não calcula — nunca estima.
 *
 * Convenção de meses: 'YYYY-MM'. As datas do banco ('YYYY-MM-DD' ou
 * timestamp) são convertidas com `mes()` na borda.
 */

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
export const round4 = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;

const MES_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/**
 * '2019-03' | '2019-03-01' | '2019-03-01T10:00:00' | '2019-03-31T23:30:00-03:00' → 'YYYY-MM'.
 *
 * Timestamps com fuso (como o banco devolve timestamptz) são lidos no fuso
 * de Brasília: uma DCOMP transmitida às 22h de 30/09 é de setembro, embora
 * em UTC já seja 01/10. Errar o mês muda o índice Selic.
 */
export const mes = (valor) => {
  if (!valor) return null;
  const s = String(valor);
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return MES_SP.format(d).slice(0, 7);
  }
  return s.slice(0, 7);
};

const num = (v) => (v == null || v === '' ? null : Number(v));

const proximoMes = (ym) => {
  let [a, m] = ym.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------
// Documento: consome crédito?
// ---------------------------------------------------------------------

export const SITUACOES_QUE_CONSOMEM = ['ativa', 'retificadora'];
export const consome = (dcomp) => SITUACOES_QUE_CONSOMEM.includes(dcomp.situacao_documento);

// ---------------------------------------------------------------------
// Eventos e fase na Receita
// ---------------------------------------------------------------------

export const EVENTOS_PER = {
  TRANSMISSAO:            { rotulo: 'Transmitido',                    fase: 'TRANSMITIDO',       tag: 'transmitida' },
  CIENCIA_ANALISE:        { rotulo: 'Em análise na RFB',              fase: 'EM_ANALISE',        tag: 'analise' },
  DESPACHO_DEFERIMENTO:   { rotulo: 'Deferido',                       fase: 'DEFERIDO',          tag: 'deferida' },
  DESPACHO_PARCIAL:       { rotulo: 'Deferido em parte',              fase: 'DEFERIDO_PARCIAL',  tag: 'parcial' },
  DESPACHO_INDEFERIMENTO: { rotulo: 'Indeferido',                     fase: 'INDEFERIDO',        tag: 'indeferida' },
  MANIFESTACAO:           { rotulo: 'Manifestação de inconformidade', fase: 'EM_LITIGIO',        tag: 'analise' },
  PAGAMENTO:              { rotulo: 'Restituição paga',               fase: 'PAGO',              tag: 'paga' },
  CANCELAMENTO:           { rotulo: 'Cancelado',                      fase: 'CANCELADO',         tag: 'cancelada' },
};

export const EVENTOS_DCOMP = {
  TRANSMISSAO:         { rotulo: 'Transmitida',                    fase: 'TRANSMITIDA',        tag: 'transmitida' },
  CIENCIA_ANALISE:     { rotulo: 'Em análise na RFB',              fase: 'EM_ANALISE',         tag: 'analise' },
  HOMOLOGACAO:         { rotulo: 'Homologada',                     fase: 'HOMOLOGADA',         tag: 'homologada' },
  HOMOLOGACAO_PARCIAL: { rotulo: 'Homologada em parte',            fase: 'HOMOLOGADA_PARCIAL', tag: 'parcial' },
  NAO_HOMOLOGACAO:     { rotulo: 'Não homologada',                 fase: 'NAO_HOMOLOGADA',     tag: 'nao' },
  MANIFESTACAO:        { rotulo: 'Manifestação de inconformidade', fase: 'EM_LITIGIO',         tag: 'analise' },
  HOMOLOGACAO_TACITA:  { rotulo: 'Homologação tácita (prazo)',     fase: 'HOMOLOGADA_TACITA',  tag: 'homologada' },
  CANCELAMENTO:        { rotulo: 'Cancelada',                      fase: 'CANCELADA',          tag: 'cancelada' },
};

export const eventosDe = (documento, eventos) =>
  eventos
    .filter((e) => e.documento === documento)
    // desempate estável: mesma data → ordem de criação
    .sort((a, b) =>
      (a.data + (a.created_at || '')).localeCompare(b.data + (b.created_at || '')));

export const fase = (documento, entidade, eventos) => {
  const mapa = entidade === 'PER' ? EVENTOS_PER : EVENTOS_DCOMP;
  const historico = eventosDe(documento, eventos);
  const ultimo = [...historico].reverse().find((e) => mapa[e.tipo]);
  const base = ultimo
    ? mapa[ultimo.tipo]
    : { rotulo: 'Sem evento registrado', fase: 'SEM_EVENTO', tag: 'sem' };
  return { ...base, desde: ultimo?.data || null, processo: ultimo?.processo || null, eventos: historico };
};

export const valorPago = (documento, eventos) =>
  round2(eventosDe(documento, eventos)
    .filter((e) => e.tipo === 'PAGAMENTO')
    .reduce((s, e) => s + (num(e.valor) || 0), 0));

// ---------------------------------------------------------------------
// Crédito e conta-corrente das compensações
// ---------------------------------------------------------------------

const dcompsDoCredito = (credito, dcomps) =>
  dcomps
    .filter((d) => d.perdcomp_credito_id === credito.id)
    .sort((a, b) => String(a.data_transmissao).localeCompare(String(b.data_transmissao)));

/**
 * Extrato: cada DCOMP em ordem de transmissão, com o saldo antes e depois.
 * `divergencia` compara o crédito que a DCOMP declarou ter na entrega com
 * o saldo que o sistema apurou até ali.
 */
export const extrato = (credito, dcomps) => {
  let saldo = num(credito.valor_credito) || 0;
  let ordem = 0;
  return dcompsDoCredito(credito, dcomps).map((d) => {
    ordem += 1;
    const consumido = consome(d) ? (num(d.credito_utilizado) || 0) : 0;
    const saldoAnterior = saldo;
    saldo = round2(saldo - consumido);
    const informado = num(d.credito_informado_entrega);
    const divergencia = consome(d) && informado != null ? round2(informado - saldoAnterior) : null;
    return { ...d, ordem, consumido, saldoAnterior, saldoApos: saldo, divergencia };
  });
};

export const saldo = (credito, dcomps) => {
  const utilizado = dcomps
    .filter((d) => d.perdcomp_credito_id === credito.id && consome(d))
    .reduce((s, d) => s + (num(d.credito_utilizado) || 0), 0);
  return { utilizado: round2(utilizado), saldo: round2((num(credito.valor_credito) || 0) - utilizado) };
};

// ---------------------------------------------------------------------
// Atualização pela Selic
//
// Fórmula comum a todos os roteiros do PER/DCOMP Web:
//   índice = Σ Selic mensal, do MÊS INICIAL até o mês anterior ao da entrega
//            da DCOMP, + 1,00% referente ao mês corrente.
//   Entrega antes do mês inicial → sem atualização (índice zero).
//
// O que muda por tipo de crédito é o mês inicial = marco + deslocamento.
// Cada linha abaixo cita o trecho do manual oficial (pasta "Pasta manual
// Perdcomp"). A regra de Retenção foi conferida contra 23 DCOMPs reais.
// ---------------------------------------------------------------------

const somarMeses = (ym, k) => {
  let [a, m] = ym.split('-').map(Number);
  m += k;
  while (m > 12) { m -= 12; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
};

const somarDiasIso = (iso, dias) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * marco(credito) devolve 'YYYY-MM' ou null. `null` = não dá para calcular
 * sem o usuário informar termo_inicial_correcao.
 */
export const REGRAS_SELIC = {
  'Retenção - Lei nº 9.711/98': {
    // "desde o 2º mês seguinte ao da competência"
    deslocamento: 2,
    marco: (c) => mes(c.termo_inicial_correcao || c.competencia),
    fonte: 'Manual Retenção Previdenciária PJ: 2º mês seguinte ao da competência.',
  },
  'Pagamento Indevido ou a Maior': {
    // "desde o mês seguinte à data do pagamento"
    deslocamento: 1,
    marco: (c) => mes(c.termo_inicial_correcao),
    fonte: 'Manual Pagamento Indevido ou a Maior PJ: mês seguinte à data do pagamento.',
    exige: 'data do pagamento (DARF) em "termo inicial de correção"',
  },
  'Contribuição Previdenciária Indevida ou a Maior': {
    deslocamento: 1,
    marco: (c) => mes(c.termo_inicial_correcao),
    fonte: 'Manual Contribuição Previdenciária Indevida PJ: mês seguinte à data do pagamento.',
    exige: 'data do pagamento (GPS) em "termo inicial de correção"',
  },
  'Saldo Negativo de IRPJ': {
    // "desde o mês seguinte ao final do período de apuração do crédito"
    deslocamento: 1,
    marco: (c) => mes(c.termo_inicial_correcao || c.competencia),
    fonte: 'Manual Saldo Negativo IRPJ/CSLL: mês seguinte ao final do período de apuração.',
    exige: 'competência = mês de encerramento do período de apuração',
  },
  'Saldo Negativo de CSLL': {
    deslocamento: 1,
    marco: (c) => mes(c.termo_inicial_correcao || c.competencia),
    fonte: 'Manual Saldo Negativo IRPJ/CSLL: mês seguinte ao final do período de apuração.',
    exige: 'competência = mês de encerramento do período de apuração',
  },
  'Ressarcimento de PIS/Pasep Não Cumulativo': {
    // "desde o mês seguinte ao do 361º dia, contado da transmissão do pedido
    //  de ressarcimento original". Contagem do CTN (art. 210): exclui o dia
    //  da transmissão, então o 361º dia = transmissão + 361.
    deslocamento: 1,
    marco: (c) => (c.termo_inicial_correcao
      ? mes(c.termo_inicial_correcao)
      : (c.data_transmissao ? mes(somarDiasIso(c.data_transmissao, 361)) : null)),
    fonte: 'Manual Ressarcimento PIS/Cofins: mês seguinte ao 361º dia da transmissão do pedido original.',
    exige: 'data de transmissão do pedido de ressarcimento original',
  },
  'Ressarcimento de Cofins Não Cumulativa': {
    deslocamento: 1,
    marco: (c) => (c.termo_inicial_correcao
      ? mes(c.termo_inicial_correcao)
      : (c.data_transmissao ? mes(somarDiasIso(c.data_transmissao, 361)) : null)),
    fonte: 'Manual Ressarcimento PIS/Cofins: mês seguinte ao 361º dia da transmissão do pedido original.',
    exige: 'data de transmissão do pedido de ressarcimento original',
  },
};

/**
 * Tipos cujos manuais NÃO definem a regra (IPI, salário-família, ação
 * judicial, outro): o sistema não inventa. Se o usuário informar o termo
 * inicial, ele é tomado como o próprio mês inicial da soma.
 */
const regraSelicDe = (credito) => REGRAS_SELIC[credito.tipo_credito] || {
  deslocamento: 0,
  marco: (c) => mes(c.termo_inicial_correcao),
  fonte: 'Regra não definida no manual deste tipo: informe o mês inicial em "termo inicial de correção" e confira com a DCOMP.',
  exige: 'mês inicial da Selic em "termo inicial de correção"',
};

/** Soma a partir de um mês inicial já resolvido. */
export const indicePorInicio = (inicio, ateMes, selicMensal) => {
  const ate = mes(ateMes);
  if (!inicio) return { percentual: null, meses: 0, faltando: [], semMarco: true };
  if (inicio > ate) return { percentual: 0, meses: 0, faltando: [] };

  const taxas = new Map(selicMensal.map((s) => [mes(s.competencia), num(s.taxa)]));
  const meses = [];
  const faltando = [];
  for (let k = inicio; k < ate; k = proximoMes(k)) {
    meses.push(k);
    if (!taxas.has(k)) faltando.push(k);
  }
  if (faltando.length) return { percentual: null, meses: meses.length, faltando };
  const soma = meses.reduce((s, k) => s + taxas.get(k), 0);
  return { percentual: round4(soma + 1), meses: meses.length, faltando: [] };
};

/**
 * Regra de Retenção a partir da competência — mantida com a mesma
 * assinatura do protótipo para a prova de equivalência.
 */
export const indiceSelic = (competencia, ateMes, selicMensal) =>
  indicePorInicio(somarMeses(mes(competencia), 2), ateMes, selicMensal);

/** Índice aplicável a um crédito, respeitando a regra do seu tipo. */
export const indiceSelicCredito = (credito, ateMes, selicMensal) => {
  const regra = regraSelicDe(credito);
  const marco = regra.marco(credito);
  const inicio = marco ? somarMeses(marco, regra.deslocamento) : null;
  return { ...indicePorInicio(inicio, ateMes, selicMensal), inicio, regra: regra.fonte, exige: regra.exige };
};

/**
 * Mês a usar como "entrega" de uma DCOMP. Pelos manuais, na retificação
 * vale a data da DCOMP ORIGINAL. Só se sobe a cadeia quando o documento é
 * retificador/retificado: numero_referencia também aponta, em DCOMPs
 * comuns, para a DCOMP anterior que usou o crédito — e aí não se aplica.
 */
export const mesDeEntrega = (dcomp, dcomps) => {
  const porNumero = new Map(dcomps.map((d) => [d.numero, d]));
  const ehRetificacao = (d) => ['retificadora', 'retificada'].includes(d?.situacao_documento);
  let atual = dcomp;
  let menor = String(dcomp.data_transmissao);
  const visitados = new Set([dcomp.numero]);
  while (ehRetificacao(atual) && atual.numero_referencia && !visitados.has(atual.numero_referencia)) {
    const ref = porNumero.get(atual.numero_referencia);
    if (!ref || !ehRetificacao(ref)) break;
    visitados.add(ref.numero);
    if (String(ref.data_transmissao) < menor) menor = String(ref.data_transmissao);
    atual = ref;
  }
  return mes(menor);
};

/** Índice que a DCOMP deveria declarar, pela regra do tipo do crédito. */
export const indiceSelicDcomp = (dcomp, credito, dcomps, selicMensal) =>
  indiceSelicCredito(credito, mesDeEntrega(dcomp, dcomps), selicMensal);

export const corrigir = (valor, competencia, ateMes, selicMensal) => {
  const i = indiceSelic(competencia, ateMes, selicMensal);
  if (i.percentual == null) return { ...i, valor: null, juros: null };
  return {
    ...i,
    juros: round2(valor * i.percentual / 100),
    valor: round2(valor * (1 + i.percentual / 100)),
  };
};

/** Correção pela regra do tipo do crédito. */
export const corrigirCredito = (valor, credito, ateMes, selicMensal) => {
  const i = indiceSelicCredito(credito, ateMes, selicMensal);
  if (i.percentual == null) return { ...i, valor: null, juros: null };
  return {
    ...i,
    juros: round2(valor * i.percentual / 100),
    valor: round2(valor * (1 + i.percentual / 100)),
  };
};

/** Último mês com taxa na tabela — a data de referência padrão. */
export const mesReferencia = (selicMensal) => {
  const meses = selicMensal.map((s) => mes(s.competencia)).sort();
  return meses[meses.length - 1] || new Date().toISOString().slice(0, 7);
};

/** Saldo original e saldo corrigido pela regra do tipo, até o mês de referência. */
export const saldoCorrigido = (credito, dcomps, selicMensal, ateMes) => {
  const s = saldo(credito, dcomps);
  const c = corrigirCredito(s.saldo, credito, ateMes || mesReferencia(selicMensal), selicMensal);
  return { ...s, ...c };
};

// ---------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------

const chaveDebito = (x) => [x.codigo_receita, mes(x.periodo_apuracao), round2(num(x.total) || 0)].join('|');

/** Débitos idênticos (receita + PA + total) em mais de uma DCOMP que consome. */
export const duplicidades = (debitos, dcomps) => {
  const ativas = new Set(dcomps.filter(consome).map((d) => d.id));
  const mapa = new Map();
  debitos.filter((x) => ativas.has(x.dcomp_id)).forEach((x) => {
    const k = chaveDebito(x);
    mapa.set(k, [...(mapa.get(k) || []), x.dcomp_id]);
  });
  const repetidos = new Map();
  mapa.forEach((ids, k) => { if (new Set(ids).size > 1) repetidos.set(k, [...new Set(ids)]); });
  return repetidos;
};

const moeda = (v) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * @param ctx { dcomps, debitos, eventos, perVersoes, composicao }
 * Nível 'grave' = dado impossível (saldo negativo); 'aviso' = conferir.
 */
export const alertas = (credito, ctx) => {
  const { dcomps = [], debitos = [], eventos = [], perVersoes = [], composicao = [] } = ctx;
  const av = [];
  const numeroPorId = new Map(dcomps.map((d) => [d.id, d.numero]));

  const { saldo: s } = saldo(credito, dcomps);
  if (s < -0.01) {
    av.push({ nivel: 'grave', texto: `Saldo negativo de ${moeda(Math.abs(s))}: as compensações declaradas superam o crédito.` });
  }

  extrato(credito, dcomps).forEach((l) => {
    if (l.divergencia != null && Math.abs(l.divergencia) > 0.01) {
      av.push({
        nivel: 'aviso',
        texto: `DCOMP ${l.numero} informa crédito disponível de ${moeda(l.credito_informado_entrega)}, mas o saldo até ali era ${moeda(l.saldoAnterior)}.`,
      });
    }
  });

  const meus = new Set(dcompsDoCredito(credito, dcomps).map((d) => d.id));
  duplicidades(debitos, dcomps).forEach((ids, k) => {
    if (ids.some((i) => meus.has(i))) {
      const [codigo, pa, total] = k.split('|');
      av.push({
        nivel: 'aviso',
        texto: `Débito ${codigo} (PA ${pa}) de ${moeda(Number(total))} compensado em mais de uma DCOMP ativa: ${ids.map((i) => numeroPorId.get(i) || i).join(', ')}.`,
      });
    }
  });

  const vigentes = perVersoes.filter((v) => v.perdcomp_credito_id === credito.id && v.vigente);
  if (vigentes.length > 1) {
    av.push({ nivel: 'aviso', texto: `Há ${vigentes.length} versões vigentes do PER apontando para o mesmo original.` });
  }

  const pago = valorPago(credito.numero_per_original, eventos);
  if (pago > 0 && pago - s > 0.01) {
    av.push({ nivel: 'aviso', texto: `Valor pago (${moeda(pago)}) supera o saldo do crédito (${moeda(s)}).` });
  }

  // Novo em relação ao protótipo: a composição, quando lançada, precisa fechar.
  const itens = composicao.filter((c) => c.perdcomp_credito_id === credito.id);
  if (itens.length) {
    const soma = round2(itens.reduce((t, c) => t + (num(c.valor) || 0), 0));
    const valor = num(credito.valor_credito) || 0;
    if (Math.abs(soma - valor) > 0.01) {
      av.push({
        nivel: 'aviso',
        texto: `A composição soma ${moeda(soma)}, mas o crédito é de ${moeda(valor)} (diferença de ${moeda(round2(soma - valor))}).`,
      });
    }
  }

  return av;
};

// ---------------------------------------------------------------------
// Prazos derivados dos eventos
// ---------------------------------------------------------------------

const FASES_FINAIS_DCOMP = ['HOMOLOGACAO', 'HOMOLOGACAO_PARCIAL', 'NAO_HOMOLOGACAO', 'HOMOLOGACAO_TACITA', 'CANCELAMENTO'];
const EVENTOS_COM_MANIFESTACAO = ['NAO_HOMOLOGACAO', 'HOMOLOGACAO_PARCIAL', 'DESPACHO_INDEFERIMENTO', 'DESPACHO_PARCIAL'];

const somarDias = (iso, dias) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
const somarAnos = (iso, anos) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setFullYear(d.getFullYear() + anos);
  return d.toISOString().slice(0, 10);
};

/**
 * - Homologação tácita: DCOMP que consome e ainda sem decisão → transmissão + 5 anos
 *   (Lei 9.430/96, art. 74, §5º).
 * - Manifestação de inconformidade: 30 dias do despacho desfavorável, enquanto
 *   não houver MANIFESTACAO registrada depois dele. A data do despacho é tomada
 *   como a da ciência — registre o evento na data da ciência.
 */
export const prazos = ({ dcomps = [], eventos = [], creditos = [] }) => {
  const lista = [];

  dcomps.filter(consome).forEach((d) => {
    const hist = eventosDe(d.numero, eventos);
    if (hist.some((e) => FASES_FINAIS_DCOMP.includes(e.tipo))) return;
    lista.push({
      tipo: 'Homologação tácita (5 anos)',
      entidade: 'DCOMP',
      documento: d.numero,
      perdcomp_credito_id: d.perdcomp_credito_id,
      data: somarAnos(d.data_transmissao, 5),
    });
  });

  const documentos = new Set(eventos.map((e) => e.documento));
  documentos.forEach((doc) => {
    const hist = eventosDe(doc, eventos);
    const desfavoravel = [...hist].reverse().find((e) => EVENTOS_COM_MANIFESTACAO.includes(e.tipo));
    if (!desfavoravel) return;
    const jaManifestou = hist.some((e) => e.tipo === 'MANIFESTACAO' && e.data >= desfavoravel.data);
    if (jaManifestou) return;
    const dcomp = dcomps.find((d) => d.numero === doc);
    const credito = creditos.find((c) => c.numero_per_original === doc);
    lista.push({
      tipo: 'Manifestação de inconformidade (30 dias)',
      entidade: desfavoravel.entidade,
      documento: doc,
      perdcomp_credito_id: dcomp?.perdcomp_credito_id || credito?.id || null,
      data: somarDias(desfavoravel.data, 30),
    });
  });

  return lista.sort((a, b) => a.data.localeCompare(b.data));
};

// ---------------------------------------------------------------------
// Validações — `bloqueiam` impede gravar; `avisos` só alertam
// ---------------------------------------------------------------------

export const validarDcomp = (d, credito, dcomps) => {
  const bloqueiam = [];
  const avisos = [];
  if (!credito) bloqueiam.push('Crédito não encontrado.');
  if (!d.numero?.trim()) bloqueiam.push('Informe o número da DCOMP.');
  if (dcomps.some((x) => x.numero === d.numero?.trim() && x.id !== d.id)) bloqueiam.push('Já existe DCOMP com esse número.');
  if (!(num(d.credito_utilizado) > 0)) bloqueiam.push('Crédito utilizado deve ser maior que zero.');
  if (!d.data_transmissao) bloqueiam.push('Informe a data de transmissão.');

  if (credito && consome(d)) {
    const outras = dcomps.filter((x) => x.id !== d.id);
    const { saldo: s } = saldo(credito, outras);
    if (num(d.credito_utilizado) > s + 0.01) {
      avisos.push(`O crédito utilizado (${moeda(d.credito_utilizado)}) supera o saldo disponível (${moeda(s)}).`);
    }
    const informado = num(d.credito_informado_entrega);
    if (informado != null && Math.abs(informado - s) > 0.01) {
      avisos.push(`O crédito informado na entrega (${moeda(informado)}) difere do saldo do sistema (${moeda(s)}).`);
    }
  }
  return { bloqueiam, avisos };
};

export const validarEvento = (ev) => {
  if (!ev.documento) return 'Informe o documento.';
  if (!ev.tipo) return 'Informe o tipo de evento.';
  if (!ev.data) return 'Informe a data.';
  if (ev.tipo === 'PAGAMENTO' && !(num(ev.valor) > 0)) return 'Informe o valor pago.';
  const mapa = ev.entidade === 'PER' ? EVENTOS_PER : EVENTOS_DCOMP;
  if (!mapa[ev.tipo]) return 'Tipo de evento inválido para este documento.';
  return null;
};

// ---------------------------------------------------------------------
// Resumo em linguagem natural (determinístico — não inventa nada)
// ---------------------------------------------------------------------

export const resumirDcomp = (d, { credito, debitos = [], dcomps = [], eventos = [] }) => {
  const linhas = [];
  const f = fase(d.numero, 'DCOMP', eventos);
  const linhaExtrato = credito ? extrato(credito, dcomps).find((l) => l.id === d.id) : null;
  const dataTx = d.data_transmissao ? new Date(d.data_transmissao).toLocaleDateString('pt-BR') : '—';

  linhas.push(`DCOMP ${d.numero}, transmitida em ${dataTx}, documento "${d.situacao_documento}", fase na Receita "${f.rotulo}".`);
  if (credito && linhaExtrato) {
    linhas.push(`Usa o crédito de ${mes(credito.competencia)}, consumindo ${moeda(linhaExtrato.consumido)} e deixando saldo de ${moeda(linhaExtrato.saldoApos)}.`);
  }

  const meus = debitos.filter((x) => x.dcomp_id === d.id);
  if (meus.length) {
    const porReceita = {};
    meus.forEach((x) => { porReceita[x.codigo_receita] = round2((porReceita[x.codigo_receita] || 0) + (num(x.total) || 0)); });
    const pas = [...new Set(meus.map((x) => mes(x.periodo_apuracao)))];
    const total = round2(meus.reduce((s, x) => s + (num(x.total) || 0), 0));
    linhas.push(
      `Quita ${meus.length} débito(s) de ${pas.length === 1 ? `PA ${pas[0]}` : `${pas.length} períodos de apuração`}, ` +
      `somando ${moeda(total)}: ${Object.entries(porReceita).map(([c, v]) => `${c} ${moeda(v)}`).join('; ')}.`,
    );
    const encargos = round2(meus.reduce((s, x) => s + (num(x.multa) || 0) + (num(x.juros) || 0), 0));
    if (encargos > 0) linhas.push(`Do total, ${moeda(encargos)} são multa e juros — débitos quitados em atraso.`);
  } else {
    linhas.push('Nenhum débito cadastrado para esta DCOMP.');
  }

  if (num(d.selic_acumulada)) {
    linhas.push(`A DCOMP informa Selic acumulada de ${num(d.selic_acumulada).toLocaleString('pt-BR')}%, o que atualiza ${moeda(d.credito_utilizado)} para ${moeda(d.credito_atualizado)}.`);
  }

  const pontos = [];
  if (linhaExtrato?.divergencia != null && Math.abs(linhaExtrato.divergencia) > 0.01) {
    pontos.push(`o crédito informado na entrega (${moeda(d.credito_informado_entrega)}) não bate com o saldo apurado (${moeda(linhaExtrato.saldoAnterior)}), diferença de ${moeda(linhaExtrato.divergencia)}`);
  }
  if (!consome(d)) pontos.push(`o documento está "${d.situacao_documento}" e por isso não consome crédito, embora permaneça no histórico`);
  const dup = duplicidades(debitos, dcomps);
  const repetidos = meus.filter((x) => dup.has(chaveDebito(x)));
  if (repetidos.length && consome(d)) pontos.push(`${repetidos.length} débito(s) idênticos aparecem em outra DCOMP ativa`);
  if (linhaExtrato && linhaExtrato.saldoApos < -0.01) pontos.push(`após esta compensação o crédito fica negativo em ${moeda(Math.abs(linhaExtrato.saldoApos))}`);

  return { linhas, pontos };
};
