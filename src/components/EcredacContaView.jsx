import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import {
  Wallet, FileUp, Loader2, Plus, Receipt, TrendingDown, FileWarning, Hourglass, AlertTriangle, Search,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import * as E from '@/lib/ecredacRegras';
import { lerContaCorrente, lerPedidos } from '@/lib/ecredacImportar';
import {
  listarContas, carregarConta, criarConta, criarFaturamento, atualizarFaturamento, excluirFaturamento,
  salvarArquivo, importarContaCorrente, importarPedidos,
} from '@/lib/ecredacApi';
import { listarContribuintes } from '@/lib/fiscalApi';
import { formatMoeda, formatMoedaCompacta, formatData, formatMesAno, formatCNPJ } from '@/data/fiscalDomain';

const TODAS = '__todas__';
const CHAVE_CONTA = 'ecredac.conta';
const lerPref = () => { try { return localStorage.getItem(CHAVE_CONTA); } catch { return null; } };
const gravarPref = (v) => { try { localStorage.setItem(CHAVE_CONTA, v); } catch { /* sem storage */ } };
const mesAtual = () => new Date().toISOString().slice(0, 7);
const rotuloMes = (ym) => formatMesAno(`${ym}-01`);

const Th = ({ children, direita }) => (
  <th className={`p-2 font-semibold text-slate-600 whitespace-nowrap ${direita ? 'text-right' : 'text-left'}`}>{children}</th>
);

const corConciliacao = {
  'Apropriado integralmente': 'bg-green-100 text-green-800 border-green-300',
  'Apropriado parcialmente': 'bg-amber-100 text-amber-800 border-amber-300',
  'Aguardando apropriação': 'bg-blue-100 text-blue-800 border-blue-300',
};
const corArquivo = {
  'Pedido registrado': 'bg-green-100 text-green-800 border-green-300',
  Dispensado: 'bg-gray-100 text-gray-600 border-gray-300',
  'Arquivo transmitido, sem pedido': 'bg-amber-100 text-amber-800 border-amber-300',
  'Em elaboração': 'bg-blue-100 text-blue-800 border-blue-300',
  'Arquivo com erro': 'bg-red-100 text-red-800 border-red-300',
  Pendente: 'bg-red-100 text-red-800 border-red-300',
};

/**
 * e-CredAc — conta-corrente do crédito acumulado (ICMS-SP): saldo, consumo
 * mensal para faturamento dos honorários, pedidos pendentes de apropriação
 * e arquivos do mês a transmitir. Contas em src/lib/ecredacRegras.js.
 */
const EcredacContaView = ({ usuario, userProfile, projetos = [] }) => {
  const { toast } = useToast();
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState(null);
  const [dados, setDados] = useState({ movimentos: [], faturamentos: [], arquivos: [], pedidos: [] });
  const [carregando, setCarregando] = useState(true);
  const [secao, setSecao] = useState('faturamento');

  const [importar, setImportar] = useState(false);
  const [novaConta, setNovaConta] = useState(false);
  const [boleto, setBoleto] = useState(null);
  const [arquivo, setArquivo] = useState(null);

  const [fOperacao, setFOperacao] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(200);

  const conta = contas.find((c) => c.id === contaId) || null;

  const carregarContas = useCallback(async () => {
    const lista = await listarContas();
    setContas(lista);
    return lista;
  }, []);

  const carregar = useCallback(async (c, silencioso = false) => {
    if (!c) { setCarregando(false); return; }
    if (!silencioso) setCarregando(true);
    try {
      setDados(await carregarConta(c));
    } catch (e) {
      toast({ title: 'Erro ao carregar a conta', description: getPublicErrorMessage(e), variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await carregarContas();
        const escolhida = lista.find((c) => c.id === lerPref()) || lista[0];
        setContaId(escolhida?.id || null);
        await carregar(escolhida);
      } catch (e) {
        setCarregando(false);
        const msg = e?.code === '42P01' ? 'Aplique a migration sql/2026-09-19_01_ecredac_conta_corrente.sql.' : getPublicErrorMessage(e);
        toast({ title: 'Erro ao carregar o e-CredAc', description: msg, variant: 'destructive' });
      }
    })();
  }, [carregarContas, carregar, toast]);

  const trocarConta = (id) => {
    setContaId(id);
    gravarPref(id);
    carregar(contas.find((c) => c.id === id));
  };

  const recarregar = async () => {
    const lista = await carregarContas();
    await carregar(lista.find((c) => c.id === contaId), true);
  };

  // ------------------------------------------------------------ cálculos
  const calc = useMemo(() => {
    if (!conta) return null;
    const { movimentos, faturamentos, arquivos, pedidos } = dados;
    const extrato = E.extrato(conta, movimentos);
    const saldo = E.saldo(conta, movimentos);
    const hon = E.honorarios(conta, movimentos, faturamentos);
    const conc = E.conciliarPedidos(pedidos, movimentos);
    const semPedido = E.apropriacoesSemPedido(pedidos, movimentos);
    const cal = E.calendarioArquivos({ pedidos, arquivos, desde: conta.inicio_honorarios?.slice(0, 7) });
    const mes = hon.porMes.find((l) => l.mes === mesAtual());
    const divergencias = extrato.filter((l) => l.divergencia != null && Math.abs(l.divergencia) > 0.01);
    const naoClassificados = movimentos.filter((m) => m.operacao === 'OUTRO');
    return { extrato, saldo, hon, conc, semPedido, cal, mes, divergencias, naoClassificados };
  }, [conta, dados]);

  const extratoVisivel = useMemo(() => {
    if (!calc) return [];
    const t = busca.trim().toLowerCase();
    return [...calc.extrato].reverse().filter((l) => (fOperacao === TODAS || l.operacao === fOperacao)
      && (!t || `${l.documento} ${l.historico} ${l.destinatario_cnpj || ''}`.toLowerCase().includes(t)));
  }, [calc, fOperacao, busca]);

  // ------------------------------------------------------------ ações
  const gravarBoleto = async () => {
    if (!(boleto.valor > 0) || !boleto.data_emissao) {
      toast({ title: 'Informe data e valor do boleto', variant: 'destructive' });
      return;
    }
    try {
      await criarFaturamento({
        conta_id: conta.id,
        projeto_id: conta.projeto_id,
        data_emissao: boleto.data_emissao,
        competencia: boleto.competencia ? `${boleto.competencia}-01` : null,
        valor: boleto.valor,
        numero_boleto: boleto.numero_boleto || null,
        numero_nf: boleto.numero_nf || null,
        vencimento: boleto.vencimento || null,
        observacoes: boleto.observacoes || null,
      }, usuario, userProfile);
      toast({ title: 'Boleto registrado', className: 'bg-green-500 text-white' });
      setBoleto(null);
      recarregar();
    } catch (e) {
      toast({ title: 'Erro ao registrar boleto', description: getPublicErrorMessage(e), variant: 'destructive' });
    }
  };

  const mudarSituacaoBoleto = async (f, situacao) => {
    try {
      if (situacao === '__excluir__') await excluirFaturamento(f.id);
      else await atualizarFaturamento(f.id, { situacao });
      recarregar();
    } catch (e) {
      toast({ title: 'Erro', description: getPublicErrorMessage(e), variant: 'destructive' });
    }
  };

  const gravarArquivo = async () => {
    try {
      await salvarArquivo({
        conta_id: conta.id,
        projeto_id: conta.projeto_id,
        referencia: `${arquivo.referencia}-01`,
        tipo: 'Arquivo digital de custeio',
        situacao: arquivo.situacao,
        data_transmissao: arquivo.data_transmissao || null,
        protocolo: arquivo.protocolo || null,
        observacoes: arquivo.observacoes || null,
      }, usuario, userProfile);
      toast({ title: `Referência ${rotuloMes(arquivo.referencia)} atualizada`, className: 'bg-green-500 text-white' });
      setArquivo(null);
      recarregar();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: getPublicErrorMessage(e), variant: 'destructive' });
    }
  };

  // ------------------------------------------------------------ render
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">e-CredAc — Conta corrente</h1>
            <p className="text-sm text-slate-500">Crédito acumulado de ICMS-SP: saldo, consumo mensal, honorários, pedidos e arquivos do mês</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNovaConta(true)}><Plus className="h-4 w-4 mr-1" /> Nova conta</Button>
          <Button onClick={() => setImportar(true)} disabled={!conta} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">
            <FileUp className="h-4 w-4 mr-2" /> Importar planilhas
          </Button>
        </div>
      </div>

      {contas.length > 0 && (
        <Select value={contaId || undefined} onValueChange={trocarConta}>
          <SelectTrigger className="md:w-[30rem]"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
          <SelectContent>
            {contas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.contribuinte?.razao_social} · {formatCNPJ(c.contribuinte?.cnpj)}{c.inscricao_estadual ? ` · IE ${c.inscricao_estadual}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {carregando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
      ) : !conta ? (
        <Card className="glass-card rounded-2xl"><CardContent className="py-12 text-center text-slate-500">
          Nenhuma conta do e-CredAc cadastrada. Clique em <strong>Nova conta</strong> e depois importe as planilhas.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard titulo="Saldo da conta" valor={formatMoedaCompacta(calc.saldo)}
              detalhe={calc.extrato.length ? `até ${formatData(calc.extrato[calc.extrato.length - 1].data)}` : 'sem lançamentos'}
              icone={Wallet} cor="border-teal-200 bg-teal-50 text-teal-800" />
            <KpiCard titulo={`Consumo ${rotuloMes(mesAtual())}`} valor={formatMoedaCompacta(calc.mes?.consumo || 0)}
              detalhe={`honorários ${formatMoeda(calc.mes?.honorariosConsumo || 0)}`} icone={TrendingDown} delay={0.05} />
            <KpiCard titulo="Honorários a faturar" valor={formatMoedaCompacta(calc.hon.aFaturar)}
              detalhe={`${calc.hon.percentual}% do consumo · faturado ${formatMoedaCompacta(calc.hon.faturado)}`} icone={Receipt}
              cor={calc.hon.aFaturar > 0.01 ? 'border-amber-200 bg-amber-50 text-amber-800' : undefined} delay={0.1} />
            <KpiCard titulo="Pedidos aguardando" valor={String(calc.conc.filter((p) => p.statusConciliacao === 'Aguardando apropriação').length)}
              detalhe={formatMoedaCompacta(calc.conc.filter((p) => p.statusConciliacao === 'Aguardando apropriação').reduce((s, p) => s + Number(p.valor_pleiteado), 0))}
              icone={Hourglass} cor="border-blue-200 bg-blue-50 text-blue-800" delay={0.15} />
            <KpiCard titulo="Meses com arquivo pendente" valor={String(calc.cal.filter((l) => l.pendente).length)}
              detalhe={calc.cal.find((l) => l.pendente) ? `desde ${rotuloMes(calc.cal.find((l) => l.pendente).referencia)}` : 'em dia'}
              icone={FileWarning} cor={calc.cal.some((l) => l.pendente) ? 'border-red-200 bg-red-50 text-red-800' : undefined} delay={0.2} />
          </div>

          {(calc.divergencias.length > 0 || calc.naoClassificados.length > 0) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>
                {calc.divergencias.length > 0 && <>{calc.divergencias.length} linha(s) com saldo diferente do extrato do e-CredAc (a primeira em {formatData(calc.divergencias[0].data)}). </>}
                {calc.naoClassificados.length > 0 && <>{calc.naoClassificados.length} lançamento(s) com histórico não reconhecido — não entram nos honorários.</>}
              </span>
            </div>
          )}

          <Card className="glass-card border-white/60 rounded-2xl">
            <CardContent className="pt-6">
              <Tabs value={secao} onValueChange={setSecao}>
                <TabsList className="flex flex-wrap h-auto">
                  <TabsTrigger value="faturamento">Consumo e faturamento</TabsTrigger>
                  <TabsTrigger value="extrato">Conta corrente ({calc.extrato.length})</TabsTrigger>
                  <TabsTrigger value="pedidos">Pedidos ({calc.conc.length})</TabsTrigger>
                  <TabsTrigger value="arquivos">
                    Arquivos do mês
                    {calc.cal.some((l) => l.pendente) && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{calc.cal.filter((l) => l.pendente).length}</span>}
                  </TabsTrigger>
                </TabsList>

                {/* ---------------------------------------- FATURAMENTO */}
                <TabsContent value="faturamento" className="pt-4 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    {[
                      ['Honorários devidos', calc.hon.devidos, `${calc.hon.percentual}% das apropriações`],
                      ['Faturável (consumo)', calc.hon.faturavel, `${calc.hon.percentual}% das reservas deferidas`],
                      ['Faturado', calc.hon.faturado, 'boletos emitidos e pagos'],
                      ['Saldo de honorários', calc.hon.saldo, 'devidos − faturado'],
                    ].map(([r, v, d]) => (
                      <div key={r} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{r}</p>
                        <p className="text-lg font-bold tabular-nums text-slate-800">{formatMoeda(v)}</p>
                        <p className="text-xs text-slate-500">{d}</p>
                      </div>
                    ))}
                  </div>
                  {conta.inicio_honorarios && (
                    <p className="text-xs text-slate-500">Contrato de honorários considerado a partir de {formatData(conta.inicio_honorarios)}.</p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>Mês</Th><Th direita>Consumo (reservas deferidas)</Th><Th direita>Honorários do consumo</Th>
                          <Th direita>Apropriado</Th><Th direita>Boletos no mês</Th><Th direita>A faturar acumulado</Th><Th />
                        </tr>
                      </thead>
                      <tbody>
                        {[...calc.hon.porMes].reverse().map((l) => (
                          <tr key={l.mes} className="border-b border-slate-100">
                            <td className="p-2 font-medium text-slate-800">{rotuloMes(l.mes)}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(l.consumo)}</td>
                            <td className="p-2 text-right tabular-nums font-semibold text-teal-700">{formatMoeda(l.honorariosConsumo)}</td>
                            <td className="p-2 text-right tabular-nums text-slate-600">{l.apropriado ? formatMoeda(l.apropriado) : '—'}</td>
                            <td className="p-2 text-right tabular-nums">{l.faturado ? formatMoeda(l.faturado) : '—'}</td>
                            <td className={`p-2 text-right tabular-nums ${l.aFaturarAcumulado > 0.01 ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{formatMoeda(l.aFaturarAcumulado)}</td>
                            <td className="p-2 text-right">
                              {l.honorariosConsumo > 0 && (
                                <Button size="sm" variant="outline" onClick={() => setBoleto({
                                  competencia: l.mes, data_emissao: new Date().toISOString().slice(0, 10), valor: l.honorariosConsumo,
                                  numero_boleto: '', numero_nf: '', vencimento: '', observacoes: `Honorários sobre o consumo de ${rotuloMes(l.mes)}`,
                                })}>
                                  Registrar boleto
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700">Boletos emitidos</h3>
                    {dados.faturamentos.length === 0 ? <p className="text-sm text-slate-500">Nenhum boleto registrado.</p> : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50"><tr><Th>Emissão</Th><Th>Competência</Th><Th>Boleto / NF</Th><Th direita>Valor</Th><Th>Situação</Th><Th>Origem</Th></tr></thead>
                        <tbody>
                          {[...dados.faturamentos].reverse().map((f) => (
                            <tr key={f.id} className="border-b border-slate-100">
                              <td className="p-2">{formatData(f.data_emissao)}</td>
                              <td className="p-2">{f.competencia ? formatMesAno(f.competencia) : '—'}</td>
                              <td className="p-2 text-slate-600">{[f.numero_boleto, f.numero_nf].filter(Boolean).join(' / ') || '—'}</td>
                              <td className="p-2 text-right tabular-nums font-medium">{formatMoeda(f.valor)}</td>
                              <td className="p-2">
                                <Select value={f.situacao} onValueChange={(v) => mudarSituacaoBoleto(f, v)}>
                                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {['Emitido', 'Pago', 'Cancelado'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    {f.origem === 'MANUAL' && <SelectItem value="__excluir__">Excluir</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-2 text-xs text-slate-500">{f.origem === 'IMPORTACAO' ? 'planilha' : f.created_by_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </TabsContent>

                {/* ---------------------------------------- EXTRATO */}
                <TabsContent value="extrato" className="pt-4 space-y-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative md:w-96">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Documento, histórico ou CNPJ do destinatário" className="pl-9" />
                    </div>
                    <Select value={fOperacao} onValueChange={setFOperacao}>
                      <SelectTrigger className="md:w-80"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODAS}>Todas as operações</SelectItem>
                        {Object.entries(E.OPERACOES).map(([k, v]) => <SelectItem key={k} value={k}>{v.rotulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50"><tr><Th>Data</Th><Th>Documento</Th><Th>Operação</Th><Th>Histórico</Th><Th direita>Valor</Th><Th direita>Saldo</Th></tr></thead>
                      <tbody>
                        {extratoVisivel.slice(0, limite).map((l) => (
                          <tr key={l.id} className={`border-b border-slate-100 ${l.divergencia && Math.abs(l.divergencia) > 0.01 ? 'bg-red-50' : ''}`}>
                            <td className="p-2 whitespace-nowrap">{formatData(l.data)}</td>
                            <td className="p-2 font-mono text-xs">{l.documento || '—'}</td>
                            <td className="p-2 text-xs text-slate-600">{E.OPERACOES[l.operacao]?.rotulo}</td>
                            <td className="p-2 text-xs text-slate-700 max-w-md">{l.historico}</td>
                            <td className={`p-2 text-right tabular-nums whitespace-nowrap ${l.natureza === 'D' ? 'text-red-700' : l.natureza === 'C' ? 'text-green-700' : 'text-slate-400'}`}>
                              {formatMoeda(l.valor)} {l.natureza}
                            </td>
                            <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatMoeda(l.saldoCorrido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extratoVisivel.length > limite && (
                    <div className="text-center"><Button variant="outline" size="sm" onClick={() => setLimite((n) => n + 500)}>Mostrar mais ({extratoVisivel.length - limite} restantes)</Button></div>
                  )}
                  <p className="text-xs text-slate-500">Mais recentes primeiro. "*" é informativo: o deferimento confirma a reserva e não muda o saldo.</p>
                </TabsContent>

                {/* ---------------------------------------- PEDIDOS */}
                <TabsContent value="pedidos" className="pt-4 space-y-3">
                  <p className="text-sm text-slate-600">
                    Cada pedido é conferido com as apropriações do extrato pelo número do pedido.
                    {calc.semPedido.length > 0 && <> Há <strong>{calc.semPedido.length}</strong> apropriação(ões) no extrato de pedidos que não estão cadastrados aqui.</>}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr><Th>Pedido</Th><Th>Referência</Th><Th>Processo</Th><Th direita>Pedido</Th><Th direita>Apropriado</Th><Th direita>Diferença</Th><Th>Conciliação</Th><Th>Situação SEFAZ</Th><Th>Nota</Th></tr>
                      </thead>
                      <tbody>
                        {[...calc.conc].reverse().map((p) => (
                          <tr key={p.id} className="border-b border-slate-100">
                            <td className="p-2 font-mono text-xs">{p.numero_protocolo}</td>
                            <td className="p-2">{p.periodo_referencia_inicio ? formatMesAno(p.periodo_referencia_inicio) : '—'}</td>
                            <td className="p-2 text-xs text-slate-600">{p.numero_processo_sefaz || '—'}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoeda(p.valor_pleiteado)}</td>
                            <td className="p-2 text-right tabular-nums text-green-700">{p.apropriado ? formatMoeda(p.apropriado) : '—'}</td>
                            <td className={`p-2 text-right tabular-nums ${p.diferenca > 0.01 ? 'text-amber-700' : 'text-slate-500'}`}>{formatMoeda(p.diferenca)}</td>
                            <td className="p-2">
                              <Badge variant="outline" className={corConciliacao[p.statusConciliacao]}>{p.statusConciliacao}</Badge>
                              {p.ultimaApropriacao && <p className="text-xs text-slate-500 mt-0.5">{p.apropriacoes.length} parcela(s), última em {formatData(p.ultimaApropriacao)}</p>}
                            </td>
                            <td className="p-2 text-xs text-slate-600">{p.situacao_sefaz || p.situacao}</td>
                            <td className="p-2 text-xs text-slate-600">{p.nota_registro || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ---------------------------------------- ARQUIVOS */}
                <TabsContent value="arquivos" className="pt-4 space-y-3">
                  <p className="text-sm text-slate-600">
                    Referências mensais do custeio. Mês com pedido registrado está em dia; sem pedido e sem arquivo transmitido, é pendência.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50"><tr><Th>Referência</Th><Th>Situação</Th><Th>Pedido(s)</Th><Th direita>Valor pedido</Th><Th>Arquivo</Th><Th /></tr></thead>
                      <tbody>
                        {[...calc.cal].reverse().map((l) => {
                          const arq = l.arquivos[0];
                          return (
                            <tr key={l.referencia} className={`border-b border-slate-100 ${l.pendente ? 'bg-red-50/40' : ''}`}>
                              <td className="p-2 font-medium">{rotuloMes(l.referencia)}</td>
                              <td className="p-2"><Badge variant="outline" className={corArquivo[l.situacao]}>{l.situacao}</Badge></td>
                              <td className="p-2 font-mono text-xs">{l.pedidos.map((p) => p.numero_protocolo).join(', ') || '—'}</td>
                              <td className="p-2 text-right tabular-nums">{l.valorPedido ? formatMoeda(l.valorPedido) : '—'}</td>
                              <td className="p-2 text-xs text-slate-600">
                                {arq ? `${arq.situacao}${arq.data_transmissao ? ` em ${formatData(arq.data_transmissao)}` : ''}${arq.protocolo ? ` · ${arq.protocolo}` : ''}` : '—'}
                              </td>
                              <td className="p-2 text-right">
                                <Button size="sm" variant="outline" onClick={() => setArquivo({
                                  referencia: l.referencia,
                                  situacao: arq?.situacao || 'Transmitido',
                                  data_transmissao: arq?.data_transmissao || '',
                                  protocolo: arq?.protocolo || '',
                                  observacoes: arq?.observacoes || '',
                                })}>
                                  Atualizar
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {/* ------------------------------------------------ diálogos */}
      <ImportarPlanilhasDialog
        aberto={importar}
        onClose={() => setImportar(false)}
        conta={conta}
        usuario={usuario}
        userProfile={userProfile}
        onImportado={() => { setImportar(false); recarregar(); }}
      />

      <NovaContaDialog
        aberto={novaConta}
        onClose={() => setNovaConta(false)}
        projetos={projetos}
        existentes={contas}
        usuario={usuario}
        userProfile={userProfile}
        onCriada={async (c) => { setNovaConta(false); await carregarContas(); trocarConta(c.id); }}
      />

      <Dialog open={!!boleto} onOpenChange={() => setBoleto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar boleto de honorários</DialogTitle>
            <DialogDescription>O valor sugerido é o percentual do contrato sobre o consumo do mês.</DialogDescription>
          </DialogHeader>
          {boleto && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Competência</Label><Input type="month" value={boleto.competencia} onChange={(e) => setBoleto((b) => ({ ...b, competencia: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Emissão</Label><Input type="date" value={boleto.data_emissao} onChange={(e) => setBoleto((b) => ({ ...b, data_emissao: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Valor</Label><CurrencyInput value={boleto.valor} onChange={(v) => setBoleto((b) => ({ ...b, valor: v }))} /></div>
              <div className="space-y-1"><Label>Vencimento</Label><Input type="date" value={boleto.vencimento} onChange={(e) => setBoleto((b) => ({ ...b, vencimento: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Nº do boleto</Label><Input value={boleto.numero_boleto} onChange={(e) => setBoleto((b) => ({ ...b, numero_boleto: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Nº da NF</Label><Input value={boleto.numero_nf} onChange={(e) => setBoleto((b) => ({ ...b, numero_nf: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1"><Label>Observação</Label><Input value={boleto.observacoes} onChange={(e) => setBoleto((b) => ({ ...b, observacoes: e.target.value }))} /></div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBoleto(null)}>Cancelar</Button>
                <Button onClick={gravarBoleto} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">Registrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!arquivo} onOpenChange={() => setArquivo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Arquivo de {arquivo ? rotuloMes(arquivo.referencia) : ''}</DialogTitle></DialogHeader>
          {arquivo && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Situação</Label>
                <Select value={arquivo.situacao} onValueChange={(v) => setArquivo((a) => ({ ...a, situacao: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Pendente', 'Em elaboração', 'Transmitido', 'Com erro', 'Pedido registrado', 'Dispensado'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Data de transmissão</Label><Input type="date" value={arquivo.data_transmissao} onChange={(e) => setArquivo((a) => ({ ...a, data_transmissao: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Protocolo</Label><Input value={arquivo.protocolo} onChange={(e) => setArquivo((a) => ({ ...a, protocolo: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1"><Label>Observação</Label><Input value={arquivo.observacoes} onChange={(e) => setArquivo((a) => ({ ...a, observacoes: e.target.value }))} /></div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setArquivo(null)}>Cancelar</Button>
                <Button onClick={gravarArquivo} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">Salvar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ----------------------------------------------------------------------
// Importação das planilhas
// ----------------------------------------------------------------------

const ImportarPlanilhasDialog = ({ aberto, onClose, conta, usuario, userProfile, onImportado }) => {
  const { toast } = useToast();
  const [cc, setCc] = useState(null);
  const [ped, setPed] = useState(null);
  const [etapa, setEtapa] = useState(null);
  const refCc = useRef(null);
  const refPed = useRef(null);

  const ler = async (e, leitor, set) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      set({ nome: f.name, ...leitor(wb) });
    } catch (err) {
      toast({ title: 'Planilha não reconhecida', description: err.message, variant: 'destructive' });
    }
  };

  const gravar = async () => {
    try {
      const partes = [];
      if (cc) {
        setEtapa('Conta corrente');
        const r = await importarContaCorrente(conta, cc, setEtapa);
        partes.push(`${r.lidos} lançamentos lidos (${r.novos} novos), ${r.boletos} boletos`);
      }
      if (ped) {
        setEtapa('Pedidos');
        const r = await importarPedidos(conta, ped, usuario, userProfile);
        partes.push(`${r.criados} pedidos novos, ${r.atualizados} atualizados`);
      }
      toast({ title: 'Importação concluída', description: partes.join(' · '), className: 'bg-green-500 text-white' });
      setCc(null); setPed(null); setEtapa(null);
      onImportado();
    } catch (err) {
      setEtapa(null);
      toast({ title: 'Erro na importação', description: getPublicErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={() => !etapa && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar planilhas do e-CredAc</DialogTitle>
          <DialogDescription>
            Reimportar é seguro: lançamentos já gravados são reconhecidos e não duplicam. Boletos vindos da planilha são substituídos; os lançados no sistema ficam.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium">Conta corrente (extrato com colunas de honorários)</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refCc.current?.click()}>Escolher .xlsx</Button>
            <input ref={refCc} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => ler(e, lerContaCorrente, setCc)} />
            {cc && (
              <p className="text-xs text-slate-600 mt-2">
                {cc.nome}: {cc.movimentos.length} lançamentos de {formatData(cc.dataSaldoInicial)} a {formatData(cc.movimentos[cc.movimentos.length - 1].data)},
                saldo inicial {formatMoeda(cc.saldoInicial)}, {cc.faturamentos.length} boletos
                {cc.inicioHonorarios && <>, honorários desde {formatData(cc.inicioHonorarios)}</>}.
                {cc.avisos.length > 0 && <span className="text-amber-700"> {cc.avisos.length} aviso(s).</span>}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium">Controle de pedidos (CAT 83/2009)</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refPed.current?.click()}>Escolher .xlsx</Button>
            <input ref={refPed} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => ler(e, lerPedidos, setPed)} />
            {ped && (
              <p className="text-xs text-slate-600 mt-2">
                {ped.nome}: {ped.pedidos.length} pedidos, {formatMoeda(ped.pedidos.reduce((s, p) => s + p.valor_pleiteado, 0))}.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={!!etapa}>Cancelar</Button>
          <Button onClick={gravar} disabled={(!cc && !ped) || !!etapa} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">
            {etapa ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {etapa}</> : 'Importar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ----------------------------------------------------------------------
// Nova conta
// ----------------------------------------------------------------------

const NovaContaDialog = ({ aberto, onClose, projetos, existentes, usuario, userProfile, onCriada }) => {
  const { toast } = useToast();
  const [contribuintes, setContribuintes] = useState([]);
  const [f, setF] = useState({ contribuinte_id: '', projeto_id: '', inscricao_estadual: '', percentual_honorarios: 8, inicio_honorarios: '' });

  useEffect(() => {
    if (!aberto) return;
    listarContribuintes().then((l) => setContribuintes((l || []).filter((c) => !existentes.some((e) => e.contribuinte_id === c.id))))
      .catch(() => setContribuintes([]));
  }, [aberto, existentes]);

  const contrib = contribuintes.find((c) => c.id === f.contribuinte_id);
  const doCliente = projetos.filter((p) => contrib && p.cliente_id === contrib.cliente_id);

  const criar = async () => {
    if (!f.contribuinte_id || !f.projeto_id) {
      toast({ title: 'Selecione contribuinte e projeto', variant: 'destructive' });
      return;
    }
    try {
      const c = await criarConta({
        contribuinte_id: f.contribuinte_id,
        projeto_id: f.projeto_id,
        inscricao_estadual: f.inscricao_estadual || contrib?.inscricao_estadual || null,
        percentual_honorarios: Number(f.percentual_honorarios) || 0,
        inicio_honorarios: f.inicio_honorarios || null,
      }, usuario, userProfile);
      toast({ title: 'Conta criada — agora importe as planilhas', className: 'bg-green-500 text-white' });
      onCriada(c);
    } catch (e) {
      toast({ title: 'Erro ao criar a conta', description: getPublicErrorMessage(e), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conta do e-CredAc</DialogTitle>
          <DialogDescription>Uma por estabelecimento. O contribuinte precisa estar cadastrado em Configurações → Contribuintes.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Contribuinte</Label>
            <Select value={f.contribuinte_id || undefined} onValueChange={(v) => setF((x) => ({ ...x, contribuinte_id: v, projeto_id: '' }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{contribuintes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social} · {formatCNPJ(c.cnpj)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Projeto</Label>
            <Select value={f.projeto_id || undefined} onValueChange={(v) => setF((x) => ({ ...x, projeto_id: v }))}>
              <SelectTrigger><SelectValue placeholder={contrib ? 'Selecione' : 'Escolha o contribuinte'} /></SelectTrigger>
              <SelectContent>{doCliente.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Inscrição estadual</Label><Input value={f.inscricao_estadual} onChange={(e) => setF((x) => ({ ...x, inscricao_estadual: e.target.value }))} placeholder={contrib?.inscricao_estadual || ''} /></div>
          <div className="space-y-1"><Label>Honorários (%)</Label><Input type="number" step="0.01" value={f.percentual_honorarios} onChange={(e) => setF((x) => ({ ...x, percentual_honorarios: e.target.value }))} /></div>
          <div className="col-span-2 space-y-1">
            <Label>Início do contrato de honorários</Label>
            <Input type="date" value={f.inicio_honorarios} onChange={(e) => setF((x) => ({ ...x, inicio_honorarios: e.target.value }))} />
            <p className="text-xs text-slate-500">Em branco, a importação da planilha preenche com a primeira linha de honorários.</p>
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={criar} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">Criar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EcredacContaView;
