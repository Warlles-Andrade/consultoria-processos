import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import HabilitacaoForm from '@/components/HabilitacaoForm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck2, PlusCircle, Search, Edit2, Trash2, Loader2,
  Banknote, CheckCircle2, AlertTriangle, X, Clock, Download,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { exportarHabilitacoes } from '@/lib/fiscalExport';
import {
  listarHabilitacoes, salvarHabilitacao, excluirHabilitacao, listarCreditos,
} from '@/lib/fiscalApi';
import {
  regimeHabilitacaoOptions, situacaoHabilitacaoOptions,
  getSituacaoColor, getPrazoSeveridade, prazoSeveridadeConfig,
  formatMoeda, formatMoedaCompacta, formatData, formatCompetencia, formatCNPJ, onlyDigits,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';

const diasAte = (iso) => {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
};

const HabilitacoesView = ({ usuario, userProfile, responsaveis = [], onRefresh }) => {
  const { toast } = useToast();

  const [habilitacoes, setHabilitacoes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState('');
  const [fRegime, setFRegime] = useState(TODOS);
  const [fSituacao, setFSituacao] = useState(TODOS);

  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState(null);
  const [aExcluir, setAExcluir] = useState(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [lista, creds] = await Promise.all([listarHabilitacoes(), listarCreditos()]);
      setHabilitacoes(lista || []);
      setCreditos(creds || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar habilitações', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (dados) => {
    setSalvando(true);
    try {
      await salvarHabilitacao(dados, usuario, userProfile);
      toast({ title: dados.id ? 'Habilitação atualizada' : 'Habilitação cadastrada', className: 'bg-green-500 text-white' });
      setFormAberto(false);
      setEmEdicao(null);
      await carregar(true);
      onRefresh?.();
    } catch (error) {
      const msg = error?.code === '23514'
        ? 'Dados inconsistentes: a partir de "Protocolado" é obrigatório informar número e data do protocolo.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluirHabilitacao(aExcluir.id);
      toast({ title: 'Habilitação excluída', className: 'bg-green-500 text-white' });
      await carregar(true);
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(() => habilitacoes.filter((h) => {
    if (fRegime !== TODOS && h.regime !== fRegime) return false;
    if (fSituacao !== TODOS && h.situacao !== fSituacao) return false;
    if (!termo) return true;
    return (
      h.numero_protocolo?.toLowerCase().includes(termo) ||
      h.numero_processo_sefaz?.toLowerCase().includes(termo) ||
      h.credito?.titulo?.toLowerCase().includes(termo) ||
      h.credito?.codigo?.toLowerCase().includes(termo) ||
      h.contribuinte?.razao_social?.toLowerCase().includes(termo) ||
      onlyDigits(h.contribuinte?.cnpj).includes(onlyDigits(termo))
    );
  }), [habilitacoes, fRegime, fSituacao, termo]);

  const kpis = useMemo(() => {
    const pleiteado = filtradas.reduce((s, h) => s + Number(h.valor_pleiteado || 0), 0);
    const autorizado = filtradas.reduce((s, h) => s + Number(h.valor_autorizado || 0), 0);
    const emExigencia = filtradas.filter((h) => h.situacao === 'Em exigência');
    const prazoCritico = filtradas.filter((h) => {
      const d = diasAte(h.prazo_resposta);
      return d != null && d <= 30 && ['Protocolado', 'Em análise', 'Em exigência'].includes(h.situacao);
    });
    return { pleiteado, autorizado, emExigencia, prazoCritico };
  }, [filtradas]);

  /** Exporta o que está na tela — filtros aplicados, não a base inteira. */
  const exportar = () => {
    try {
      const arquivo = exportarHabilitacoes(filtradas);
      toast({ title: 'Exportação concluída', description: `${arquivo} foi baixado.`, className: 'bg-green-500 text-white' });
    } catch (error) {
      toast({ title: 'Erro na exportação', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const temFiltro = fRegime !== TODOS || fSituacao !== TODOS || !!termo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
            <FileCheck2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Habilitação de Créditos</h1>
            <p className="text-sm text-slate-500">e-CredAc — CAT 207/2009 (crédito acumulado) e CAT 83/2009 (ICMS-ST)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportar} disabled={filtradas.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
          <Button
            onClick={() => { setEmEdicao(null); setFormAberto(true); }}
            disabled={creditos.length === 0}
            className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white"
          >
            <PlusCircle className="h-4 w-4 mr-2" /> Nova Habilitação
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Total pleiteado" valor={formatMoedaCompacta(kpis.pleiteado)}
          detalhe={`${filtradas.length} pedido(s)`} icone={Banknote} />
        <KpiCard titulo="Autorizado" valor={formatMoedaCompacta(kpis.autorizado)}
          detalhe="Deferido pela SEFAZ" icone={CheckCircle2}
          cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.05} />
        <KpiCard titulo="Em exigência" valor={String(kpis.emExigencia.length)}
          detalhe="Aguardando resposta ao fisco" icone={AlertTriangle}
          cor={kpis.emExigencia.length > 0 ? 'border-orange-200 bg-orange-50 text-orange-800' : undefined}
          delay={0.1} />
        <KpiCard titulo="Prazo crítico" valor={String(kpis.prazoCritico.length)}
          detalhe="Resposta em até 30 dias" icone={Clock}
          cor={kpis.prazoCritico.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : undefined}
          delay={0.15} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base font-semibold text-slate-700">
              Pedidos ({filtradas.length})
            </CardTitle>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por protocolo, processo SEFAZ, crédito ou CNPJ" className="pl-9" />
              </div>
              <Select value={fRegime} onValueChange={setFRegime}>
                <SelectTrigger><SelectValue placeholder="Regime" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os regimes</SelectItem>
                  {regimeHabilitacaoOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fSituacao} onValueChange={setFSituacao}>
                <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todas as situações</SelectItem>
                  {situacaoHabilitacaoOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {temFiltro && (
              <Button variant="ghost" size="sm" className="text-slate-500 w-fit"
                onClick={() => { setBusca(''); setFRegime(TODOS); setFSituacao(TODOS); }}>
                <X className="h-4 w-4 mr-1" /> Limpar filtros
              </Button>
            )}
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : creditos.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <FileCheck2 className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhum crédito cadastrado</p>
                <p className="text-sm">Toda habilitação parte de um crédito. Cadastre um em <strong>Créditos</strong> primeiro.</p>
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <FileCheck2 className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">
                  {habilitacoes.length === 0 ? 'Nenhuma habilitação cadastrada' : 'Nada encontrado para os filtros'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[150px]">Protocolo</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Regime</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[200px]">Crédito / Contribuinte</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Referência</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Pleiteado</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Autorizado</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[150px]">Situação</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Prazo resposta</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[90px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtradas.map((h) => {
                        const dias = ['Protocolado', 'Em análise', 'Em exigência'].includes(h.situacao)
                          ? diasAte(h.prazo_resposta) : null;
                        const sev = getPrazoSeveridade(dias);
                        return (
                          <motion.tr key={h.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="py-3 px-3">
                              <p className="font-medium text-slate-800">{h.numero_protocolo || '—'}</p>
                              {h.numero_processo_sefaz && (
                                <p className="text-xs text-slate-500">SEFAZ {h.numero_processo_sefaz}</p>
                              )}
                              {h.data_protocolo && (
                                <p className="text-xs text-slate-400">{formatData(h.data_protocolo)}</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="border-teal-300 text-teal-800 bg-teal-50">{h.regime}</Badge>
                              {h.modalidade && h.modalidade !== 'Não se aplica' && (
                                <p className="text-xs text-slate-500 mt-1">{h.modalidade}</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm text-slate-800">{h.credito?.titulo || '—'}</p>
                              <p className="text-xs text-slate-500">
                                {h.contribuinte?.razao_social}
                                {h.contribuinte?.cnpj && ` · ${formatCNPJ(h.contribuinte.cnpj)}`}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-sm text-slate-700">
                              {formatCompetencia(h.periodo_referencia_inicio, h.periodo_referencia_fim)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-800 font-medium">
                              {formatMoeda(h.valor_pleiteado)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums font-semibold text-emerald-700">
                              {h.valor_autorizado != null ? formatMoeda(h.valor_autorizado) : '—'}
                              {h.valor_glosado > 0 && (
                                <p className="text-xs font-normal text-red-600">glosa {formatMoeda(h.valor_glosado)}</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className={getSituacaoColor(h.situacao)}>{h.situacao}</Badge>
                            </td>
                            <td className="py-3 px-3">
                              {h.prazo_resposta ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full ${prazoSeveridadeConfig[sev].dot}`} />
                                  <div>
                                    <p className="text-xs text-slate-700">{formatData(h.prazo_resposta)}</p>
                                    {dias != null && (
                                      <p className="text-xs text-slate-500">
                                        {dias < 0 ? `vencido há ${Math.abs(dias)}d` : `em ${dias}d`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm"
                                  onClick={() => { setEmEdicao(h); setFormAberto(true); }} title="Editar">
                                  <Edit2 className="h-4 w-4 text-slate-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setAExcluir(h)} title="Excluir">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <HabilitacaoForm
        isOpen={formAberto}
        onClose={() => { setFormAberto(false); setEmEdicao(null); }}
        onSave={salvar}
        habilitacao={emEdicao}
        creditos={creditos}
        responsaveis={responsaveis}
        salvando={salvando}
      />

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir habilitação"
        description={`Excluir o pedido ${aExcluir?.numero_protocolo || aExcluir?.regime}? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default HabilitacoesView;
