import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import {
  Receipt, Search, Loader2, Download, FileUp, Sparkles, Plus, AlertOctagon, AlertTriangle,
  Banknote, ArrowLeftRight, Wallet, TrendingUp, Clock, ChevronRight,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import * as R from '@/lib/perdcompRegras';
import { listarContribuintes } from '@/lib/fiscalApi';
import { listarContribuintesComPerdcomp, carregarControle } from '@/lib/perdcompApi';
import { lerPdfComIA, extracaoParaFormulario } from '@/lib/perdcompIA';
import { exportarControlePerdcomp } from '@/lib/fiscalExport';
import PerdcompCreditoDetalhe from '@/components/PerdcompCreditoDetalhe';
import PerdcompImportarDialog from '@/components/PerdcompImportarDialog';
import PerdcompDocumentoForm from '@/components/PerdcompDocumentoForm';
import {
  formatMoeda, formatMoedaCompacta, formatData, formatMesAno, formatNumeroPerdcomp, formatCNPJ,
  onlyDigits, tipoCreditoCurto, corFase, corSituacaoDocumento,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';
const CHAVE_CONTRIBUINTE = 'perdcomp.contribuinte';

/** Abas fixas: aparecem mesmo vazias, para o time ver onde cada pedido entra. */
const TIPOS_FIXOS = [
  'Retenção - Lei nº 9.711/98',
  'Ressarcimento de PIS/Pasep Não Cumulativo',
  'Ressarcimento de Cofins Não Cumulativa',
];

const VAZIO = { creditos: [], perVersoes: [], dcomps: [], debitos: [], eventos: [], composicao: [], selic: [] };

const lerPreferencia = () => {
  try { return localStorage.getItem(CHAVE_CONTRIBUINTE); } catch { return null; }
};
const gravarPreferencia = (v) => {
  try { localStorage.setItem(CHAVE_CONTRIBUINTE, v); } catch { /* sem storage */ }
};

const dataHora = (ts) => (ts
  ? new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
  : '—');

const diasAte = (iso) => {
  const alvo = new Date(`${iso}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
};

const Th = ({ children, direita }) => (
  <th className={`p-2 font-semibold text-slate-600 whitespace-nowrap ${direita ? 'text-right' : 'text-left'}`}>{children}</th>
);

const PerdcompControleView = ({ usuario, userProfile, projetos = [] }) => {
  const { toast } = useToast();
  const entradaPdf = useRef(null);

  const [contribuintes, setContribuintes] = useState([]);
  const [contribuinteId, setContribuinteId] = useState(null);
  const [ctx, setCtx] = useState(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [tipo, setTipo] = useState(TODOS);
  const [secao, setSecao] = useState('creditos');
  const [busca, setBusca] = useState('');
  const [fSituacao, setFSituacao] = useState('consomem');

  const [detalheId, setDetalheId] = useState(null);
  const [importarAberto, setImportarAberto] = useState(false);
  const [formulario, setFormulario] = useState(null); // { modo, inicial }
  const [lendoPdf, setLendoPdf] = useState(false);

  // ------------------------------------------------------------ carga
  const carregarContribuintes = useCallback(async () => {
    const [todos, comPerdcomp] = await Promise.all([listarContribuintes(), listarContribuintesComPerdcomp()]);
    const contagem = new Map(comPerdcomp.map((c) => [c.id, c.creditos]));
    const lista = (todos || [])
      .map((c) => ({ ...c, creditos: contagem.get(c.id) || 0 }))
      .sort((a, b) => (b.creditos > 0) - (a.creditos > 0) || a.razao_social.localeCompare(b.razao_social));
    setContribuintes(lista);
    return lista;
  }, []);

  const carregar = useCallback(async (id, silencioso = false) => {
    if (!id) {
      setCtx(VAZIO);
      setCarregando(false);
      return;
    }
    if (!silencioso) setCarregando(true);
    try {
      setCtx(await carregarControle(id));
    } catch (e) {
      toast({ title: 'Erro ao carregar o controle', description: getPublicErrorMessage(e), variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await carregarContribuintes();
        const salvo = lerPreferencia();
        const escolhido = lista.find((c) => c.id === salvo) || lista.find((c) => c.creditos > 0) || lista[0];
        setContribuinteId(escolhido?.id || null);
        await carregar(escolhido?.id);
      } catch (e) {
        setCarregando(false);
        toast({ title: 'Erro ao carregar contribuintes', description: getPublicErrorMessage(e), variant: 'destructive' });
      }
    })();
  }, [carregarContribuintes, carregar, toast]);

  const trocarContribuinte = (id) => {
    setContribuinteId(id);
    gravarPreferencia(id);
    setTipo(TODOS);
    carregar(id);
  };

  const recarregar = async () => {
    await carregar(contribuinteId, true);
    carregarContribuintes().catch(() => {});
  };

  const contribuinte = contribuintes.find((c) => c.id === contribuinteId) || null;

  // ------------------------------------------------------------ tipos
  const tiposPresentes = useMemo(() => {
    const extras = [...new Set(ctx.creditos.map((c) => c.tipo_credito))].filter((t) => !TIPOS_FIXOS.includes(t));
    return [...TIPOS_FIXOS, ...extras.sort()];
  }, [ctx.creditos]);

  const contagemTipo = useMemo(() => {
    const m = new Map();
    ctx.creditos.forEach((c) => m.set(c.tipo_credito, (m.get(c.tipo_credito) || 0) + 1));
    return m;
  }, [ctx.creditos]);

  // ------------------------------------------------------------ recorte
  const termo = busca.trim().toLowerCase();
  const termoDigitos = onlyDigits(busca);

  const creditosDoTipo = useMemo(
    () => ctx.creditos.filter((c) => tipo === TODOS || c.tipo_credito === tipo),
    [ctx.creditos, tipo],
  );
  const idsDoTipo = useMemo(() => new Set(creditosDoTipo.map((c) => c.id)), [creditosDoTipo]);
  const porId = useMemo(() => new Map(ctx.creditos.map((c) => [c.id, c])), [ctx.creditos]);

  /** Uma passada pelas regras por crédito; o resto da tela lê daqui. */
  const linhas = useMemo(() => creditosDoTipo.map((c) => {
    const s = R.saldoCorrigido(c, ctx.dcomps, ctx.selic);
    const alertas = R.alertas(c, ctx);
    return {
      credito: c,
      ...s,
      alertas,
      graves: alertas.filter((a) => a.nivel === 'grave').length,
      fasePer: c.numero_per_original ? R.fase(c.numero_per_original, 'PER', ctx.eventos) : null,
      pago: c.numero_per_original ? R.valorPago(c.numero_per_original, ctx.eventos) : 0,
      qtdDcomps: ctx.dcomps.filter((d) => d.perdcomp_credito_id === c.id).length,
    };
  }), [creditosDoTipo, ctx]);

  /** Casa pelo texto ('09/2025') ou pelos dígitos (número com ou sem pontuação). */
  const casa = (...valores) => !termo || valores.some((v) => v && (
    String(v).toLowerCase().includes(termo)
    || (termoDigitos.length >= 4 && onlyDigits(v).includes(termoDigitos))));

  const linhasVisiveis = linhas.filter(({ credito: c }) =>
    casa(c.id_credito_rfb, c.numero_per_original, formatMesAno(c.competencia)));

  const versoesVisiveis = ctx.perVersoes
    .filter((v) => idsDoTipo.has(v.perdcomp_credito_id))
    .filter((v) => casa(v.numero, v.numero_anterior, formatMesAno(porId.get(v.perdcomp_credito_id)?.competencia)))
    .sort((a, b) => String(b.data_transmissao).localeCompare(String(a.data_transmissao)));

  const dcompsVisiveis = ctx.dcomps
    .filter((d) => idsDoTipo.has(d.perdcomp_credito_id))
    .filter((d) => (fSituacao === TODOS ? true : fSituacao === 'consomem' ? R.consome(d) : !R.consome(d)))
    .filter((d) => casa(d.numero, d.numero_referencia, formatMesAno(porId.get(d.perdcomp_credito_id)?.competencia)))
    .sort((a, b) => String(b.data_transmissao).localeCompare(String(a.data_transmissao)));

  const kpis = useMemo(() => {
    const soma = (f) => R.round2(linhas.reduce((t, l) => t + (f(l) || 0), 0));
    const semCorrecao = linhas.filter((l) => l.valor == null && Math.abs(l.saldo) > 0.01).length;
    return {
      valor: soma((l) => Number(l.credito.valor_credito)),
      utilizado: soma((l) => l.utilizado),
      saldo: soma((l) => l.saldo),
      corrigido: soma((l) => (l.valor ?? l.saldo)),
      semCorrecao,
      pago: soma((l) => l.pago),
      graves: linhas.reduce((t, l) => t + l.graves, 0),
      avisos: linhas.reduce((t, l) => t + l.alertas.length - l.graves, 0),
    };
  }, [linhas]);

  const prazos = useMemo(
    () => R.prazos({ dcomps: ctx.dcomps, eventos: ctx.eventos, creditos: ctx.creditos })
      .filter((p) => !p.perdcomp_credito_id || idsDoTipo.has(p.perdcomp_credito_id)),
    [ctx, idsDoTipo],
  );
  /** Passados 5 anos sem decisão, a DCOMP está homologada tacitamente: não é prazo perdido. */
  const tacitaConsumada = (p) => p.tipo.startsWith('Homologação') && diasAte(p.data) < 0;
  const prazosProximos = prazos.filter((p) => !tacitaConsumada(p) && diasAte(p.data) <= 60);
  const mesRef = R.mesReferencia(ctx.selic);

  // ------------------------------------------------------------ ações
  const exportar = () => {
    try {
      const arquivo = exportarControlePerdcomp({ ...ctx, creditos: creditosDoTipo }, contribuinte);
      toast({ title: 'Exportação concluída', description: `${arquivo} foi baixado.`, className: 'bg-green-500 text-white' });
    } catch (e) {
      toast({ title: 'Erro na exportação', description: getPublicErrorMessage(e), variant: 'destructive' });
    }
  };

  const lerPdf = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setLendoPdf(true);
    try {
      const dados = await lerPdfComIA(arquivo);
      setFormulario(extracaoParaFormulario(dados, { ...ctx, contribuinte }));
    } catch (err) {
      toast({ title: 'Leitura do PDF', description: err.message || getPublicErrorMessage(err), variant: 'destructive' });
    } finally {
      setLendoPdf(false);
    }
  };

  const aposImportar = async (id) => {
    setImportarAberto(false);
    await carregarContribuintes();
    trocarContribuinte(id);
  };

  const detalhe = detalheId ? porId.get(detalheId) : null;

  // ------------------------------------------------------------ render
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-md">
            <Receipt className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">PER/DCOMP</h1>
            <p className="text-sm text-slate-500">Pedidos, composição dos créditos e conta-corrente das compensações</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setImportarAberto(true)}>
            <FileUp className="h-4 w-4 mr-2" /> Importar controle
          </Button>
          <Button variant="outline" onClick={() => entradaPdf.current?.click()} disabled={!contribuinte || lendoPdf}>
            {lendoPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2 text-violet-600" />}
            {lendoPdf ? 'Lendo PDF…' : 'Ler PDF com IA'}
          </Button>
          <input ref={entradaPdf} type="file" accept="application/pdf,.pdf" className="hidden" onChange={lerPdf} />
          <Button variant="outline" onClick={exportar} disabled={!creditosDoTipo.length}>
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
          <Button onClick={() => setFormulario({ modo: 'PER', inicial: null })} disabled={!contribuinte}
            className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> PER
          </Button>
          <Button onClick={() => setFormulario({ modo: 'DCOMP', inicial: null })} disabled={!ctx.creditos.length}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> DCOMP
          </Button>
        </div>
      </div>

      {/* Contribuinte */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Select value={contribuinteId || undefined} onValueChange={trocarContribuinte}>
          <SelectTrigger className="md:w-[28rem]"><SelectValue placeholder="Selecione o contribuinte" /></SelectTrigger>
          <SelectContent className="max-h-80">
            {contribuintes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.razao_social} · {formatCNPJ(c.cnpj)}{c.creditos ? ` · ${c.creditos} crédito(s)` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ctx.selic.length > 0 && (
          <p className="text-xs text-slate-500">Selic cadastrada até {formatMesAno(`${mesRef}-01`)} — é a data-base do saldo corrigido.</p>
        )}
      </div>

      {/* Tipo de crédito */}
      <div className="flex flex-wrap gap-2">
        {[TODOS, ...tiposPresentes].map((t) => {
          const n = t === TODOS ? ctx.creditos.length : (contagemTipo.get(t) || 0);
          const ativo = tipo === t;
          return (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${ativo
                ? 'border-blue-600 bg-blue-600 text-white'
                : n ? 'border-slate-300 bg-white text-slate-700 hover:border-blue-400' : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-blue-400'}`}>
              {t === TODOS ? 'Todos' : (tipoCreditoCurto[t] || t)} <span className={ativo ? 'text-blue-100' : 'text-slate-400'}>({n})</span>
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : !contribuinte ? (
        <Card className="glass-card rounded-2xl"><CardContent className="py-12 text-center text-slate-500">
          Cadastre um contribuinte em Configurações → Contribuintes para começar.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard titulo="Créditos" valor={formatMoedaCompacta(kpis.valor)} detalhe={`${creditosDoTipo.length} crédito(s)`} icone={Banknote} />
            <KpiCard titulo="Utilizado em DCOMP" valor={formatMoedaCompacta(kpis.utilizado)}
              detalhe="Só ativas e retificadoras" icone={ArrowLeftRight} cor="border-orange-200 bg-orange-50 text-orange-800" delay={0.05} />
            <KpiCard titulo="Saldo" valor={formatMoedaCompacta(kpis.saldo)}
              detalhe={kpis.pago ? `Restituição paga: ${formatMoedaCompacta(kpis.pago)}` : 'Valor original'} icone={Wallet}
              cor={kpis.saldo < -0.01 ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'} delay={0.1} />
            <KpiCard titulo="Saldo corrigido" valor={formatMoedaCompacta(kpis.corrigido)}
              detalhe={kpis.semCorrecao ? `${kpis.semCorrecao} sem Selic calculável` : `Selic até ${formatMesAno(`${mesRef}-01`)}`}
              icone={TrendingUp} cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.15} />
            <KpiCard titulo="Alertas" valor={String(kpis.graves)} detalhe={`graves · ${kpis.avisos} para conferir`}
              icone={AlertOctagon} cor={kpis.graves ? 'border-red-300 bg-red-50 text-red-800' : undefined} delay={0.2} />
          </div>

          {kpis.graves > 0 && (
            <button type="button" onClick={() => setSecao('alertas')}
              className="w-full flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-800 hover:bg-red-100">
              <AlertOctagon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">
                <strong>{kpis.graves} alerta(s) grave(s):</strong> compensações declaradas acima do crédito disponível. Confira no e-CAC antes da próxima transmissão.
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          <Card className="glass-card border-white/60 rounded-2xl">
            <CardContent className="pt-6">
              <Tabs value={secao} onValueChange={setSecao}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="creditos">Créditos ({creditosDoTipo.length})</TabsTrigger>
                    <TabsTrigger value="per">PER — pedidos ({ctx.perVersoes.filter((v) => idsDoTipo.has(v.perdcomp_credito_id)).length})</TabsTrigger>
                    <TabsTrigger value="dcomp">DCOMP — compensações ({ctx.dcomps.filter((d) => idsDoTipo.has(d.perdcomp_credito_id)).length})</TabsTrigger>
                    <TabsTrigger value="alertas">
                      Alertas e prazos
                      {(kpis.graves + prazosProximos.length) > 0 && (
                        <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{kpis.graves + prazosProximos.length}</span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <div className="relative md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº do PER/DCOMP ou competência" className="pl-9" />
                  </div>
                </div>

                {/* -------------------------------------------- CRÉDITOS */}
                <TabsContent value="creditos" className="pt-4">
                  {linhasVisiveis.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      {ctx.creditos.length ? 'Nenhum crédito neste recorte.' : 'Nenhum crédito ainda. Importe o controle, leia um PDF com IA ou registre um PER.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <Th>Competência</Th>
                            {tipo === TODOS && <Th>Tipo</Th>}
                            <Th>PER / ID do crédito</Th>
                            <Th>Pedido</Th>
                            <Th direita>Crédito</Th>
                            <Th direita>Utilizado</Th>
                            <Th direita>Saldo</Th>
                            <Th direita>Saldo corrigido</Th>
                            <Th direita>DCOMPs</Th>
                            <Th />
                          </tr>
                        </thead>
                        <tbody>
                          {linhasVisiveis.map((l) => {
                            const c = l.credito;
                            return (
                              <tr key={c.id} onClick={() => setDetalheId(c.id)}
                                className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/50 ${l.graves ? 'bg-red-50/60' : ''}`}>
                                <td className="p-2 font-medium text-slate-800">{formatMesAno(c.competencia)}</td>
                                {tipo === TODOS && <td className="p-2 text-slate-600">{tipoCreditoCurto[c.tipo_credito] || c.tipo_credito}</td>}
                                <td className="p-2 font-mono text-xs text-slate-700">{formatNumeroPerdcomp(c.numero_per_original || c.id_credito_rfb)}</td>
                                <td className="p-2">
                                  {l.fasePer ? <Badge variant="outline" className={corFase[l.fasePer.tag]}>{l.fasePer.rotulo}</Badge> : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="p-2 text-right tabular-nums">{formatMoeda(c.valor_credito)}</td>
                                <td className="p-2 text-right tabular-nums text-orange-700">{l.utilizado ? formatMoeda(l.utilizado) : '—'}</td>
                                <td className={`p-2 text-right tabular-nums font-semibold ${l.saldo < -0.01 ? 'text-red-700' : 'text-blue-700'}`}>{formatMoeda(l.saldo)}</td>
                                <td className="p-2 text-right tabular-nums text-emerald-700">
                                  {l.valor != null ? formatMoeda(l.valor) : <span className="text-slate-400" title={l.exige || 'Selic incompleta'}>—</span>}
                                </td>
                                <td className="p-2 text-right text-slate-600">{l.qtdDcomps || '—'}</td>
                                <td className="p-2 text-right whitespace-nowrap">
                                  {l.graves > 0 && <AlertOctagon className="inline h-4 w-4 text-red-600" title="Alerta grave" />}
                                  {l.alertas.length > l.graves && <AlertTriangle className="inline h-4 w-4 text-amber-500 ml-1" title="Conferir" />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 font-semibold">
                          <tr>
                            <td className="p-2" colSpan={tipo === TODOS ? 4 : 3}>Total ({linhasVisiveis.length})</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(R.round2(linhasVisiveis.reduce((t, l) => t + Number(l.credito.valor_credito), 0)))}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(R.round2(linhasVisiveis.reduce((t, l) => t + l.utilizado, 0)))}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(R.round2(linhasVisiveis.reduce((t, l) => t + l.saldo, 0)))}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(R.round2(linhasVisiveis.reduce((t, l) => t + (l.valor ?? l.saldo), 0)))}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                      <p className="mt-2 text-xs text-slate-500">Clique num crédito para ver a conta-corrente, a composição, as versões do pedido e os eventos.</p>
                    </div>
                  )}
                </TabsContent>

                {/* -------------------------------------------- PER */}
                <TabsContent value="per" className="pt-4">
                  {versoesVisiveis.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">Nenhum pedido neste recorte.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <Th>Nº do PER</Th>
                            <Th>Crédito</Th>
                            <Th>Versão</Th>
                            <Th>Transmissão</Th>
                            <Th direita>Valor pedido</Th>
                            <Th>Fase</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {versoesVisiveis.map((v) => {
                            const c = porId.get(v.perdcomp_credito_id);
                            let f = R.fase(v.numero, 'PER', ctx.eventos);
                            if (f.tag === 'sem' && v.vigente && c?.numero_per_original) f = R.fase(c.numero_per_original, 'PER', ctx.eventos);
                            return (
                              <tr key={v.id} onClick={() => setDetalheId(v.perdcomp_credito_id)}
                                className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/50 ${v.vigente ? '' : 'opacity-60'}`}>
                                <td className="p-2 font-mono text-xs">{formatNumeroPerdcomp(v.numero)}</td>
                                <td className="p-2 text-slate-700">
                                  {formatMesAno(c?.competencia)}
                                  {tipo === TODOS && <span className="text-slate-500"> · {tipoCreditoCurto[c?.tipo_credito] || c?.tipo_credito}</span>}
                                </td>
                                <td className="p-2">
                                  {v.numero_anterior ? 'Retificador' : 'Original'}
                                  {v.vigente
                                    ? <Badge variant="outline" className="ml-2 border-green-300 bg-green-50 text-green-800">vigente</Badge>
                                    : <Badge variant="outline" className="ml-2 border-gray-300 bg-gray-50 text-gray-500">substituído</Badge>}
                                </td>
                                <td className="p-2 text-slate-700">{dataHora(v.data_transmissao)}</td>
                                <td className="p-2 text-right tabular-nums">{formatMoeda(v.valor_pedido)}</td>
                                <td className="p-2"><Badge variant="outline" className={corFase[f.tag]}>{f.rotulo}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* -------------------------------------------- DCOMP */}
                <TabsContent value="dcomp" className="pt-4 space-y-3">
                  <Select value={fSituacao} onValueChange={setFSituacao}>
                    <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consomem">Ativas e retificadoras (consomem crédito)</SelectItem>
                      <SelectItem value="historico">Retificadas e canceladas</SelectItem>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                    </SelectContent>
                  </Select>
                  {dcompsVisiveis.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">Nenhuma DCOMP neste recorte.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <Th>Nº da DCOMP</Th>
                            <Th>Crédito</Th>
                            <Th>Transmissão</Th>
                            <Th>Documento</Th>
                            <Th direita>Crédito utilizado</Th>
                            <Th direita>Débitos</Th>
                            <Th>Fase</Th>
                            <Th>Homologação tácita</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {dcompsVisiveis.map((d) => {
                            const c = porId.get(d.perdcomp_credito_id);
                            const f = R.fase(d.numero, 'DCOMP', ctx.eventos);
                            const tacita = prazos.find((p) => p.documento === d.numero && p.tipo.startsWith('Homologação'));
                            return (
                              <tr key={d.id} onClick={() => setDetalheId(d.perdcomp_credito_id)}
                                className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/50 ${R.consome(d) ? '' : 'opacity-60'}`}>
                                <td className="p-2 font-mono text-xs">{formatNumeroPerdcomp(d.numero)}</td>
                                <td className="p-2 text-slate-700">
                                  {formatMesAno(c?.competencia)}
                                  {tipo === TODOS && <span className="text-slate-500"> · {tipoCreditoCurto[c?.tipo_credito] || c?.tipo_credito}</span>}
                                </td>
                                <td className="p-2 text-slate-700">{dataHora(d.data_transmissao)}</td>
                                <td className="p-2"><Badge variant="outline" className={corSituacaoDocumento[d.situacao_documento]}>{d.situacao_documento}</Badge></td>
                                <td className="p-2 text-right tabular-nums text-orange-700">{formatMoeda(d.credito_utilizado)}</td>
                                <td className="p-2 text-right tabular-nums">{d.total_debitos != null ? formatMoeda(d.total_debitos) : '—'}</td>
                                <td className="p-2"><Badge variant="outline" className={corFase[f.tag]}>{f.rotulo}</Badge></td>
                                <td className="p-2 text-slate-600">{tacita ? formatData(tacita.data) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* -------------------------------------------- ALERTAS */}
                <TabsContent value="alertas" className="pt-4 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">Prazos</h3>
                    {prazos.length === 0 ? (
                      <p className="text-sm text-slate-500">Nenhum prazo em aberto.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr><Th>Vence em</Th><Th>Prazo</Th><Th>Documento</Th><Th>Crédito</Th></tr>
                        </thead>
                        <tbody>
                          {prazos.map((p, i) => {
                            const d = diasAte(p.data);
                            const c = porId.get(p.perdcomp_credito_id);
                            const tacita = tacitaConsumada(p);
                            const cor = tacita ? 'text-emerald-700' : d < 0 ? 'text-red-700 font-semibold' : d <= 15 ? 'text-red-700' : d <= 60 ? 'text-amber-700' : 'text-slate-700';
                            return (
                              <tr key={i} onClick={() => p.perdcomp_credito_id && setDetalheId(p.perdcomp_credito_id)}
                                className="border-b border-slate-100 cursor-pointer hover:bg-blue-50/50">
                                <td className={`p-2 whitespace-nowrap ${cor}`}>
                                  <Clock className="inline h-3.5 w-3.5 mr-1" />{formatData(p.data)}
                                  <span className="text-xs ml-1">({tacita ? 'homologada tacitamente — registre o evento' : d < 0 ? `vencido há ${-d} dias` : `${d} dias`})</span>
                                </td>
                                <td className="p-2 text-slate-700">{p.tipo}</td>
                                <td className="p-2 font-mono text-xs">{p.entidade} {formatNumeroPerdcomp(p.documento)}</td>
                                <td className="p-2 text-slate-700">{c ? formatMesAno(c.competencia) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">Alertas por crédito</h3>
                    {linhas.every((l) => !l.alertas.length) ? (
                      <p className="text-sm text-slate-500">Nenhum alerta. Saldos, versões e débitos conferem.</p>
                    ) : (
                      [...linhas].filter((l) => l.alertas.length).sort((a, b) => b.graves - a.graves).map((l) => (
                        <button key={l.credito.id} type="button" onClick={() => setDetalheId(l.credito.id)}
                          className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 space-y-1.5">
                          <p className="text-sm font-semibold text-slate-800">
                            Crédito {formatMesAno(l.credito.competencia)} · {tipoCreditoCurto[l.credito.tipo_credito] || l.credito.tipo_credito}
                            <span className="ml-2 font-normal text-slate-500">saldo {formatMoeda(l.saldo)}</span>
                          </p>
                          {l.alertas.map((a, i) => (
                            <p key={i} className={`flex items-start gap-2 text-sm ${a.nivel === 'grave' ? 'text-red-700' : 'text-amber-700'}`}>
                              {a.nivel === 'grave' ? <AlertOctagon className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                              {a.texto}
                            </p>
                          ))}
                        </button>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      <PerdcompCreditoDetalhe
        isOpen={!!detalhe}
        onClose={() => setDetalheId(null)}
        credito={detalhe}
        ctx={ctx}
        usuario={usuario}
        userProfile={userProfile}
        onChanged={recarregar}
      />

      <PerdcompImportarDialog
        isOpen={importarAberto}
        onClose={() => setImportarAberto(false)}
        projetos={projetos}
        usuario={usuario}
        userProfile={userProfile}
        onImportado={aposImportar}
      />

      {formulario && (
        <PerdcompDocumentoForm
          isOpen={!!formulario}
          onClose={() => setFormulario(null)}
          modo={formulario.modo}
          inicial={formulario.inicial}
          ctx={ctx}
          contribuinte={contribuinte}
          projetos={projetos}
          usuario={usuario}
          userProfile={userProfile}
          onSalvo={async () => { setFormulario(null); await recarregar(); }}
        />
      )}
    </div>
  );
};

export default PerdcompControleView;
