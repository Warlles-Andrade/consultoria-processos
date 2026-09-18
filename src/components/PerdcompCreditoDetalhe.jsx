import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2, Loader2, Landmark,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import * as R from '@/lib/perdcompRegras';
import { criarEvento, excluirEvento, criarItemComposicao, excluirItemComposicao } from '@/lib/perdcompApi';
import {
  formatMoeda, formatData, formatMesAno, formatNumeroPerdcomp, formatCNPJ, onlyDigits,
  corFase, corSituacaoDocumento, tiposItemComposicao, tipoCreditoCurto,
} from '@/data/fiscalDomain';

const hoje = () => new Date().toISOString().slice(0, 10);
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

const Linha = ({ rotulo, children }) => (
  <div>
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{rotulo}</p>
    <div className="text-sm text-slate-800 mt-0.5">{children ?? '—'}</div>
  </div>
);

const Alerta = ({ a }) => (
  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
    a.nivel === 'grave' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
    {a.nivel === 'grave' ? <AlertOctagon className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
    <span><strong>{a.nivel === 'grave' ? 'Grave: ' : 'Conferir: '}</strong>{a.texto}</span>
  </div>
);

const recebimento = (f) => {
  if (!f) return '—';
  if (f.tipo === 'PIX') return 'PIX';
  if (f.tipo === 'CONTA_CORRENTE') return `${f.banco || 'Banco'} · ag. ${f.agencia || '—'} · c/c ${f.conta || '—'}${f.dv ? `-${f.dv}` : ''}`;
  return f.tipo || '—';
};

const composicaoInicial = () => ({
  tipo_item: 'Nota fiscal com retenção', documento: '', cnpj_relacionado: '', nome_relacionado: '',
  data_documento: '', periodo_apuracao: '', codigo_receita: '', valor: null,
});

const eventoInicial = (documento, entidade) => ({
  documento, entidade, tipo: '', data: hoje(), processo: '', valor: null, observacao: '',
});

/**
 * Detalhe de um crédito: conta-corrente das DCOMPs, composição, pedido e
 * versões, atualização Selic e eventos. Toda conta vem de perdcompRegras.
 */
const PerdcompCreditoDetalhe = ({ isOpen, onClose, credito, ctx, usuario, userProfile, onChanged }) => {
  const { toast } = useToast();
  const [aberta, setAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [formComp, setFormComp] = useState(composicaoInicial());
  const [mostrarComp, setMostrarComp] = useState(false);
  const [formEv, setFormEv] = useState(null);
  const [aExcluir, setAExcluir] = useState(null);

  const dados = useMemo(() => {
    if (!credito) return null;
    const { dcomps, debitos, eventos, perVersoes, composicao, selic } = ctx;
    const extrato = R.extrato(credito, dcomps);
    const corrigido = R.saldoCorrigido(credito, dcomps, selic);
    const alertas = R.alertas(credito, { dcomps, debitos, eventos, perVersoes, composicao });
    const versoes = perVersoes.filter((v) => v.perdcomp_credito_id === credito.id);
    const itens = composicao.filter((c) => c.perdcomp_credito_id === credito.id);
    const faseper = credito.numero_per_original ? R.fase(credito.numero_per_original, 'PER', eventos) : null;
    const documentos = [
      ...(credito.numero_per_original ? [{ numero: credito.numero_per_original, entidade: 'PER' }] : []),
      ...extrato.map((d) => ({ numero: d.numero, entidade: 'DCOMP' })),
    ];
    const eventosDoCredito = eventos
      .filter((e) => documentos.some((d) => d.numero === e.documento))
      .sort((a, b) => (b.data + (b.created_at || '')).localeCompare(a.data + (a.created_at || '')));
    return { extrato, corrigido, alertas, versoes, itens, faseper, documentos, eventosDoCredito };
  }, [credito, ctx]);

  if (!credito || !dados) return null;

  const somaComposicao = R.round2(dados.itens.reduce((s, c) => s + Number(c.valor || 0), 0));
  const mesRef = R.mesReferencia(ctx.selic);

  const gravarComposicao = async () => {
    if (!(formComp.valor > 0)) {
      toast({ title: 'Informe o valor do item', variant: 'destructive' });
      return;
    }
    const cnpj = onlyDigits(formComp.cnpj_relacionado);
    if (cnpj && cnpj.length !== 14) {
      toast({ title: 'CNPJ do tomador/fonte deve ter 14 dígitos', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await criarItemComposicao({
        perdcomp_credito_id: credito.id,
        projeto_id: credito.projeto_id,
        tipo_item: formComp.tipo_item,
        documento: formComp.documento.trim() || null,
        cnpj_relacionado: cnpj || null,
        nome_relacionado: formComp.nome_relacionado.trim() || null,
        data_documento: formComp.data_documento || null,
        periodo_apuracao: formComp.periodo_apuracao ? `${formComp.periodo_apuracao}-01` : null,
        codigo_receita: formComp.codigo_receita.trim() || null,
        valor: formComp.valor,
        origem: 'MANUAL',
      }, usuario, userProfile);
      toast({ title: 'Item incluído na composição', className: 'bg-green-500 text-white' });
      setFormComp(composicaoInicial());
      setMostrarComp(false);
      onChanged?.();
    } catch (e) {
      toast({ title: 'Erro ao incluir', description: getPublicErrorMessage(e), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const gravarEvento = async () => {
    const erro = R.validarEvento(formEv);
    if (erro) {
      toast({ title: erro, variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await criarEvento({
        projeto_id: credito.projeto_id,
        entidade: formEv.entidade,
        documento: formEv.documento,
        tipo: formEv.tipo,
        data: formEv.data,
        processo: formEv.processo?.trim() || null,
        valor: formEv.valor ?? null,
        observacao: formEv.observacao?.trim() || null,
      }, usuario, userProfile);
      toast({ title: 'Evento registrado — a fase foi atualizada', className: 'bg-green-500 text-white' });
      setFormEv(null);
      onChanged?.();
    } catch (e) {
      toast({ title: 'Erro ao registrar evento', description: getPublicErrorMessage(e), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    try {
      if (aExcluir.tipo === 'comp') await excluirItemComposicao(aExcluir.id);
      else await excluirEvento(aExcluir.id);
      toast({ title: 'Excluído', className: 'bg-green-500 text-white' });
      onChanged?.();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(e), variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  const mapaEventos = formEv?.entidade === 'PER' ? R.EVENTOS_PER : R.EVENTOS_DCOMP;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Landmark className="h-5 w-5 text-indigo-600" />
              <span>Crédito de {formatMesAno(credito.competencia)}</span>
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                {tipoCreditoCurto[credito.tipo_credito] || credito.tipo_credito}
              </Badge>
              {dados.faseper && (
                <Badge variant="outline" className={corFase[dados.faseper.tag]}>
                  Pedido: {dados.faseper.rotulo}
                </Badge>
              )}
            </DialogTitle>
            <p className="text-xs text-slate-500 font-mono">ID do crédito na RFB: {formatNumeroPerdcomp(credito.id_credito_rfb)}</p>
          </DialogHeader>

          {/* Números */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ['Valor do crédito', formatMoeda(credito.valor_credito), 'border-slate-200 bg-white'],
              ['Utilizado', formatMoeda(dados.corrigido.utilizado), 'border-orange-200 bg-orange-50'],
              ['Saldo', formatMoeda(dados.corrigido.saldo), dados.corrigido.saldo < -0.01 ? 'border-red-300 bg-red-50' : 'border-indigo-200 bg-indigo-50'],
              [`Saldo corrigido (${formatMesAno(`${mesRef}-01`)})`, dados.corrigido.valor != null ? formatMoeda(dados.corrigido.valor) : 'não calculável', 'border-emerald-200 bg-emerald-50'],
              ['DCOMPs', String(dados.extrato.length), 'border-slate-200 bg-white'],
            ].map(([rot, val, cor]) => (
              <div key={rot} className={`rounded-xl border p-3 ${cor}`}>
                <p className="text-xs font-semibold uppercase text-slate-500">{rot}</p>
                <p className="text-lg font-bold tabular-nums text-slate-800">{val}</p>
              </div>
            ))}
          </div>

          {dados.alertas.length > 0 && (
            <div className="space-y-2">
              {dados.alertas.map((a, i) => <Alerta key={i} a={a} />)}
            </div>
          )}

          <Tabs defaultValue="conta">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="conta">Conta-corrente ({dados.extrato.length})</TabsTrigger>
              <TabsTrigger value="composicao">Composição ({dados.itens.length})</TabsTrigger>
              <TabsTrigger value="pedido">Pedido e versões ({dados.versoes.length})</TabsTrigger>
              <TabsTrigger value="selic">Selic</TabsTrigger>
              <TabsTrigger value="eventos">Eventos ({dados.eventosDoCredito.length})</TabsTrigger>
            </TabsList>

            {/* ------------------------------------------------ CONTA-CORRENTE */}
            <TabsContent value="conta" className="pt-4">
              {dados.extrato.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Nenhuma DCOMP usou este crédito ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="p-2 w-6" />
                        <th className="text-left p-2 font-semibold text-slate-600">DCOMP</th>
                        <th className="text-left p-2 font-semibold text-slate-600">Transmissão</th>
                        <th className="text-left p-2 font-semibold text-slate-600">Documento</th>
                        <th className="text-right p-2 font-semibold text-slate-600">Declarou ter</th>
                        <th className="text-right p-2 font-semibold text-slate-600">Saldo antes</th>
                        <th className="text-right p-2 font-semibold text-slate-600">Consumiu</th>
                        <th className="text-right p-2 font-semibold text-slate-600">Saldo depois</th>
                        <th className="text-left p-2 font-semibold text-slate-600">Fase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.extrato.map((l) => {
                        const f = R.fase(l.numero, 'DCOMP', ctx.eventos);
                        const diverge = l.divergencia != null && Math.abs(l.divergencia) > 0.01;
                        const exp = aberta === l.id;
                        const resumo = exp ? R.resumirDcomp(l, { credito, debitos: ctx.debitos, dcomps: ctx.dcomps, eventos: ctx.eventos }) : null;
                        const debs = exp ? ctx.debitos.filter((x) => x.dcomp_id === l.id) : [];
                        const selicCalc = R.indiceSelicDcomp(l, credito, ctx.dcomps, ctx.selic).percentual;
                        const selicDiverge = selicCalc != null && l.selic_acumulada != null && Math.abs(selicCalc - Number(l.selic_acumulada)) > 0.005;
                        return (
                          <React.Fragment key={l.id}>
                            <tr className={`border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer ${!R.consome(l) ? 'opacity-60' : ''}`}
                              onClick={() => setAberta(exp ? null : l.id)}>
                              <td className="p-2 text-slate-400">{exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                              <td className="p-2 font-mono text-xs text-slate-700">{formatNumeroPerdcomp(l.numero)}</td>
                              <td className="p-2 text-slate-700">{dataHora(l.data_transmissao)}</td>
                              <td className="p-2">
                                <Badge variant="outline" className={corSituacaoDocumento[l.situacao_documento]}>{l.situacao_documento}</Badge>
                              </td>
                              <td className={`p-2 text-right tabular-nums ${diverge ? 'text-red-700 font-semibold' : 'text-slate-700'}`}>
                                {formatMoeda(l.credito_informado_entrega)}
                              </td>
                              <td className="p-2 text-right tabular-nums text-slate-700">{formatMoeda(l.saldoAnterior)}</td>
                              <td className="p-2 text-right tabular-nums text-orange-700">{l.consumido ? formatMoeda(l.consumido) : '—'}</td>
                              <td className={`p-2 text-right tabular-nums font-semibold ${l.saldoApos < -0.01 ? 'text-red-700' : 'text-indigo-700'}`}>
                                {formatMoeda(l.saldoApos)}
                              </td>
                              <td className="p-2"><Badge variant="outline" className={corFase[f.tag]}>{f.rotulo}</Badge></td>
                            </tr>
                            {exp && (
                              <tr className="bg-slate-50/70">
                                <td />
                                <td colSpan={8} className="p-3 space-y-3">
                                  <div className="text-sm text-slate-700 space-y-1">
                                    {resumo.linhas.map((t, i) => <p key={i}>{t}</p>)}
                                  </div>
                                  {resumo.pontos.length > 0 && (
                                    <ul className="text-sm text-amber-800 list-disc pl-5">
                                      {resumo.pontos.map((t, i) => <li key={i}>{t}</li>)}
                                    </ul>
                                  )}
                                  <p className={`text-xs ${selicDiverge ? 'text-red-700 font-semibold' : 'text-slate-500'}`}>
                                    Selic declarada: {l.selic_acumulada != null ? `${Number(l.selic_acumulada).toLocaleString('pt-BR')}%` : '—'}
                                    {' · '}pela regra do manual: {selicCalc != null ? `${selicCalc.toLocaleString('pt-BR')}%` : 'não calculável'}
                                    {selicDiverge && ' — DIVERGE, conferir'}
                                  </p>
                                  {debs.length > 0 && (
                                    <table className="w-full text-xs bg-white rounded border border-slate-200">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="text-left p-1.5">Receita</th>
                                          <th className="text-left p-1.5">PA</th>
                                          <th className="text-left p-1.5">Vencimento</th>
                                          <th className="text-right p-1.5">Principal</th>
                                          <th className="text-right p-1.5">Multa</th>
                                          <th className="text-right p-1.5">Juros</th>
                                          <th className="text-right p-1.5">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {debs.map((x) => (
                                          <tr key={x.id} className="border-t border-slate-100">
                                            <td className="p-1.5 font-mono">{x.codigo_receita}</td>
                                            <td className="p-1.5">{formatMesAno(x.periodo_apuracao)}</td>
                                            <td className="p-1.5">{x.vencimento ? formatData(x.vencimento) : '—'}</td>
                                            <td className="p-1.5 text-right tabular-nums">{formatMoeda(x.principal)}</td>
                                            <td className="p-1.5 text-right tabular-nums">{x.multa ? formatMoeda(x.multa) : '—'}</td>
                                            <td className="p-1.5 text-right tabular-nums">{x.juros ? formatMoeda(x.juros) : '—'}</td>
                                            <td className="p-1.5 text-right tabular-nums font-semibold">{formatMoeda(x.total)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-500 mt-2">
                    Só DCOMPs <strong>ativas</strong> e <strong>retificadoras</strong> consomem crédito. Retificadas e canceladas
                    ficam no histórico, esmaecidas. Clique numa linha para ver os débitos.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ------------------------------------------------ COMPOSIÇÃO */}
            <TabsContent value="composicao" className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Documentos que formam o valor do crédito. Soma: <strong className="tabular-nums">{formatMoeda(somaComposicao)}</strong>
                  {dados.itens.length > 0 && Math.abs(somaComposicao - Number(credito.valor_credito)) > 0.01 && (
                    <span className="text-amber-700"> — difere do crédito em {formatMoeda(R.round2(somaComposicao - Number(credito.valor_credito)))}</span>
                  )}
                </p>
                <Button size="sm" onClick={() => setMostrarComp((v) => !v)} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                  <Plus className="h-4 w-4 mr-1" /> Incluir documento
                </Button>
              </div>

              {mostrarComp && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={formComp.tipo_item} onValueChange={(v) => setFormComp((f) => ({ ...f, tipo_item: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{tiposItemComposicao.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Nº do documento</Label>
                      <Input value={formComp.documento} onChange={(e) => setFormComp((f) => ({ ...f, documento: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>CNPJ tomador / fonte</Label>
                      <Input value={formComp.cnpj_relacionado} onChange={(e) => setFormComp((f) => ({ ...f, cnpj_relacionado: e.target.value }))} placeholder="só números" />
                    </div>
                    <div className="space-y-1">
                      <Label>Nome</Label>
                      <Input value={formComp.nome_relacionado} onChange={(e) => setFormComp((f) => ({ ...f, nome_relacionado: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Data do documento</Label>
                      <Input type="date" value={formComp.data_documento} onChange={(e) => setFormComp((f) => ({ ...f, data_documento: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Período de apuração</Label>
                      <Input type="month" value={formComp.periodo_apuracao} onChange={(e) => setFormComp((f) => ({ ...f, periodo_apuracao: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Código da receita</Label>
                      <Input value={formComp.codigo_receita} onChange={(e) => setFormComp((f) => ({ ...f, codigo_receita: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor</Label>
                      <CurrencyInput value={formComp.valor} onChange={(v) => setFormComp((f) => ({ ...f, valor: v }))} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMostrarComp(false)}>Cancelar</Button>
                    <Button size="sm" onClick={gravarComposicao} disabled={salvando} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                      {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Incluir
                    </Button>
                  </div>
                </div>
              )}

              {dados.itens.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Composição ainda não lançada. Inclua as notas, DARFs ou GPS que formam o crédito — o sistema confere a soma.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-600">Tipo</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Documento</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Tomador / fonte</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Data / PA</th>
                      <th className="text-right p-2 font-semibold text-slate-600">Valor</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {dados.itens.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="p-2 text-slate-700">{c.tipo_item}</td>
                        <td className="p-2 font-mono text-xs">{c.documento || '—'}</td>
                        <td className="p-2">
                          <p className="text-slate-800">{c.nome_relacionado || '—'}</p>
                          {c.cnpj_relacionado && <p className="text-xs text-slate-500 font-mono">{formatCNPJ(c.cnpj_relacionado)}</p>}
                        </td>
                        <td className="p-2 text-slate-700">
                          {c.data_documento ? formatData(c.data_documento) : '—'}
                          {c.periodo_apuracao && <span className="text-xs text-slate-500"> · PA {formatMesAno(c.periodo_apuracao)}</span>}
                        </td>
                        <td className="p-2 text-right tabular-nums font-medium">{formatMoeda(c.valor)}</td>
                        <td className="p-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setAExcluir({ tipo: 'comp', id: c.id, texto: `${c.tipo_item} ${c.documento || ''}` })}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>

            {/* ------------------------------------------------ PEDIDO */}
            <TabsContent value="pedido" className="pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Linha rotulo="PER original">
                  <span className="font-mono text-xs">{credito.numero_per_original ? formatNumeroPerdcomp(credito.numero_per_original) : 'não informado'}</span>
                </Linha>
                <Linha rotulo="Transmissão">{dataHora(credito.data_transmissao)}</Linha>
                <Linha rotulo="Fase do pedido">
                  {dados.faseper
                    ? <Badge variant="outline" className={corFase[dados.faseper.tag]}>{dados.faseper.rotulo}{dados.faseper.desde ? ` desde ${formatData(dados.faseper.desde)}` : ''}</Badge>
                    : '—'}
                </Linha>
                <Linha rotulo="Restituição paga">
                  {credito.numero_per_original ? formatMoeda(R.valorPago(credito.numero_per_original, ctx.eventos)) : '—'}
                </Linha>
                <Linha rotulo="Forma de recebimento">{recebimento(credito.forma_recebimento)}</Linha>
              </div>

              {dados.versoes.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-600">Número</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Versão</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Transmissão</th>
                      <th className="text-right p-2 font-semibold text-slate-600">Valor pedido</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Recibo</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Recebimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.versoes.map((v) => (
                      <tr key={v.id} className={`border-b border-slate-100 ${v.vigente ? '' : 'opacity-60'}`}>
                        <td className="p-2 font-mono text-xs">{formatNumeroPerdcomp(v.numero)}</td>
                        <td className="p-2">
                          {v.numero_anterior
                            ? <span className="text-slate-700">Retifica <span className="font-mono text-xs">{formatNumeroPerdcomp(v.numero_anterior)}</span></span>
                            : <span className="text-slate-700">Original</span>}
                          {v.vigente && <Badge variant="outline" className="ml-2 border-green-300 text-green-800 bg-green-50">vigente</Badge>}
                        </td>
                        <td className="p-2 text-slate-700">{dataHora(v.data_transmissao)}</td>
                        <td className="p-2 text-right tabular-nums">{formatMoeda(v.valor_pedido)}</td>
                        <td className="p-2 font-mono text-xs">{v.numero_recibo || '—'}</td>
                        <td className="p-2 text-slate-700">{recebimento(v.forma_recebimento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>

            {/* ------------------------------------------------ SELIC */}
            <TabsContent value="selic" className="pt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Linha rotulo="Mês de referência">{formatMesAno(`${mesRef}-01`)}</Linha>
                <Linha rotulo="Mês inicial da soma">{dados.corrigido.inicio ? formatMesAno(`${dados.corrigido.inicio}-01`) : '—'}</Linha>
                <Linha rotulo="Índice acumulado">
                  {dados.corrigido.percentual != null ? `${dados.corrigido.percentual.toLocaleString('pt-BR')}% (${dados.corrigido.meses} meses + 1%)` : 'não calculável'}
                </Linha>
                <Linha rotulo="Saldo corrigido">
                  {dados.corrigido.valor != null ? `${formatMoeda(dados.corrigido.valor)} (juros ${formatMoeda(dados.corrigido.juros)})` : '—'}
                </Linha>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                <p><strong>Regra aplicada:</strong> {dados.corrigido.regra}</p>
                <p>Fórmula comum aos roteiros do PER/DCOMP Web: Σ Selic mensal do mês inicial até o mês anterior ao da entrega, + 1% no mês corrente.</p>
                {dados.corrigido.semMarco && dados.corrigido.exige && (
                  <p className="text-amber-700">Para calcular, informe: {dados.corrigido.exige}.</p>
                )}
                {dados.corrigido.faltando?.length > 0 && (
                  <p className="text-amber-700">Faltam na tabela Selic os meses: {dados.corrigido.faltando.map((m) => formatMesAno(`${m}-01`)).join(', ')}. Sem eles o sistema não estima.</p>
                )}
              </div>
            </TabsContent>

            {/* ------------------------------------------------ EVENTOS */}
            <TabsContent value="eventos" className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  A fase de cada documento na Receita é o último evento registrado — nunca é digitada.
                </p>
                <Select
                  value={formEv?.documento || undefined}
                  onValueChange={(v) => {
                    const doc = dados.documentos.find((d) => d.numero === v);
                    setFormEv(eventoInicial(doc.numero, doc.entidade));
                  }}
                >
                  <SelectTrigger className="w-80"><SelectValue placeholder="Registrar evento em..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {dados.documentos.map((d) => (
                      <SelectItem key={d.numero} value={d.numero}>
                        {d.entidade} {formatNumeroPerdcomp(d.numero)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formEv && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    {formEv.entidade} <span className="font-mono text-xs">{formatNumeroPerdcomp(formEv.documento)}</span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>Evento</Label>
                      <Select value={formEv.tipo || undefined} onValueChange={(v) => setFormEv((f) => ({ ...f, tipo: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(mapaEventos).map(([k, v]) => <SelectItem key={k} value={k}>{v.rotulo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Data (ciência)</Label>
                      <Input type="date" value={formEv.data} onChange={(e) => setFormEv((f) => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Nº processo / despacho</Label>
                      <Input value={formEv.processo} onChange={(e) => setFormEv((f) => ({ ...f, processo: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor (deferido, pago, glosado)</Label>
                      <CurrencyInput value={formEv.valor} onChange={(v) => setFormEv((f) => ({ ...f, valor: v }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Observação</Label>
                    <Input value={formEv.observacao} onChange={(e) => setFormEv((f) => ({ ...f, observacao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setFormEv(null)}>Cancelar</Button>
                    <Button size="sm" onClick={gravarEvento} disabled={salvando} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                      {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Registrar
                    </Button>
                  </div>
                </div>
              )}

              {dados.eventosDoCredito.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Nenhum evento registrado.</p>
              ) : (
                <div className="space-y-2">
                  {dados.eventosDoCredito.map((e) => {
                    const mapa = e.entidade === 'PER' ? R.EVENTOS_PER : R.EVENTOS_DCOMP;
                    const def = mapa[e.tipo];
                    return (
                      <div key={e.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <Badge variant="outline" className={corFase[def?.tag] || corFase.sem}>{def?.rotulo || e.tipo}</Badge>
                        <div className="flex-1 min-w-0 text-sm">
                          <p className="text-slate-800">
                            <span className="text-slate-500">{formatData(e.data)} · {e.entidade}</span>{' '}
                            <span className="font-mono text-xs">{formatNumeroPerdcomp(e.documento)}</span>
                          </p>
                          {(e.processo || e.valor) && (
                            <p className="text-xs text-slate-600">
                              {e.processo && `Processo ${e.processo}`}{e.processo && e.valor ? ' · ' : ''}{e.valor ? formatMoeda(e.valor) : ''}
                            </p>
                          )}
                          {e.observacao && <p className="text-xs text-slate-500">{e.observacao}</p>}
                          <p className="text-xs text-slate-400">{e.origem === 'MANUAL' ? `Lançado por ${e.created_by_name || '—'}` : `Origem: ${e.origem}`}</p>
                        </div>
                        {e.origem === 'MANUAL' && (
                          <Button variant="ghost" size="sm" onClick={() => setAExcluir({ tipo: 'ev', id: e.id, texto: def?.rotulo || e.tipo })}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir"
        description={`Excluir "${aExcluir?.texto}"? Esta ação não pode ser desfeita.`}
      />
    </>
  );
};

export default PerdcompCreditoDetalhe;
