import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreditoForm from '@/components/CreditoForm';
import CreditoDetailModal from '@/components/CreditoDetailModal';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark, PlusCircle, Search, Eye, Edit2, Trash2, Loader2,
  Wallet, TrendingUp, AlertTriangle, FileStack, X,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  listarCreditosComSaldo, salvarCredito, excluirCredito, listarContribuintes,
} from '@/lib/fiscalApi';
import {
  situacaoCreditoOptions, tributoOptions, esferaOptions,
  getSituacaoColor, getPrazoSeveridade, prazoSeveridadeConfig,
  formatMoeda, formatMoedaCompacta, formatData, formatCompetencia, formatCNPJ, onlyDigits,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';

const CreditosView = ({ usuario, userProfile, projetos = [], responsaveis = [], onRefresh }) => {
  const { toast } = useToast();

  const [creditos, setCreditos] = useState([]);
  const [contribuintes, setContribuintes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState('');
  const [fContribuinte, setFContribuinte] = useState(TODOS);
  const [fSituacao, setFSituacao] = useState(TODOS);
  const [fTributo, setFTributo] = useState(TODOS);
  const [fEsfera, setFEsfera] = useState(TODOS);

  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [aExcluir, setAExcluir] = useState(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [lista, contribs] = await Promise.all([
        listarCreditosComSaldo(),
        listarContribuintes(),
      ]);
      setCreditos(lista || []);
      setContribuintes(contribs || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar créditos', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (dados) => {
    setSalvando(true);
    try {
      await salvarCredito(dados, usuario, userProfile);
      toast({ title: dados.id ? 'Crédito atualizado' : 'Crédito cadastrado', className: 'bg-green-500 text-white' });
      setFormAberto(false);
      setEmEdicao(null);
      await carregar(true);
      onRefresh?.();
    } catch (error) {
      toast({ title: 'Erro ao salvar crédito', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluirCredito(aExcluir.id);
      toast({ title: 'Crédito excluído', className: 'bg-green-500 text-white' });
      await carregar(true);
    } catch (error) {
      const msg = error?.code === '23503'
        ? 'Não é possível excluir: há habilitações, PER/DCOMPs ou processos vinculados.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(() => creditos.filter((c) => {
    if (fContribuinte !== TODOS && c.contribuinte_id !== fContribuinte) return false;
    if (fSituacao !== TODOS && c.situacao !== fSituacao) return false;
    if (fTributo !== TODOS && c.tributo !== fTributo) return false;
    if (fEsfera !== TODOS && c.esfera !== fEsfera) return false;
    if (!termo) return true;
    return (
      c.titulo?.toLowerCase().includes(termo) ||
      c.codigo?.toLowerCase().includes(termo) ||
      c.contribuinte?.razao_social?.toLowerCase().includes(termo) ||
      onlyDigits(c.contribuinte?.cnpj).includes(onlyDigits(termo)) ||
      c.responsavel_nome?.toLowerCase().includes(termo)
    );
  }), [creditos, fContribuinte, fSituacao, fTributo, fEsfera, termo]);

  const kpis = useMemo(() => {
    const levantado = filtrados.reduce((s, c) => s + Number(c.valor_levantado || 0), 0);
    const homologado = filtrados.reduce((s, c) => s + Number(c.valor_homologado || 0), 0);
    const saldo = filtrados.reduce((s, c) => s + Number(c.saldo?.saldo_disponivel || 0), 0);
    const emRisco = filtrados.filter((c) => {
      const d = c.saldo?.dias_para_prescricao;
      return d != null && d <= 90;
    });
    return { levantado, homologado, saldo, emRisco };
  }, [filtrados]);

  const temFiltro = fContribuinte !== TODOS || fSituacao !== TODOS || fTributo !== TODOS || fEsfera !== TODOS || !!termo;

  const limparFiltros = () => {
    setBusca(''); setFContribuinte(TODOS); setFSituacao(TODOS); setFTributo(TODOS); setFEsfera(TODOS);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md">
            <Landmark className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Créditos</h1>
            <p className="text-sm text-slate-500">Levantamento, saldo e prazo prescricional</p>
          </div>
        </div>
        <Button
          onClick={() => { setEmEdicao(null); setFormAberto(true); }}
          className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
        >
          <PlusCircle className="h-4 w-4 mr-2" /> Novo Crédito
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          titulo="Total levantado" valor={formatMoedaCompacta(kpis.levantado)}
          detalhe={`${filtrados.length} crédito(s)`} icone={FileStack}
          cor="border-slate-200 bg-white text-slate-800"
        />
        <KpiCard
          titulo="Homologado" valor={formatMoedaCompacta(kpis.homologado)}
          detalhe="Reconhecido pelo fisco" icone={TrendingUp}
          cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.05}
        />
        <KpiCard
          titulo="Saldo disponível" valor={formatMoedaCompacta(kpis.saldo)}
          detalhe="Apurado pela razão" icone={Wallet}
          cor="border-indigo-200 bg-indigo-50 text-indigo-800" delay={0.1}
        />
        <KpiCard
          titulo="Prescrição em risco" valor={String(kpis.emRisco.length)}
          detalhe="Vence em até 90 dias" icone={AlertTriangle}
          cor={kpis.emRisco.length > 0
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-slate-200 bg-white text-slate-800'}
          delay={0.15}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base font-semibold text-slate-700">
              Créditos ({filtrados.length})
            </CardTitle>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por título, código, contribuinte ou CNPJ"
                  className="pl-9"
                />
              </div>

              <Select value={fContribuinte} onValueChange={setFContribuinte}>
                <SelectTrigger><SelectValue placeholder="Contribuinte" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todos os contribuintes</SelectItem>
                  {contribuintes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fSituacao} onValueChange={setFSituacao}>
                <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todas as situações</SelectItem>
                  {situacaoCreditoOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={fTributo} onValueChange={setFTributo}>
                <SelectTrigger><SelectValue placeholder="Tributo" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todos os tributos</SelectItem>
                  {tributoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={fEsfera} onValueChange={setFEsfera}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Esfera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as esferas</SelectItem>
                  {esferaOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              {temFiltro && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-slate-500">
                  <X className="h-4 w-4 mr-1" /> Limpar filtros
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Landmark className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">
                  {creditos.length === 0 ? 'Nenhum crédito cadastrado' : 'Nenhum crédito para os filtros aplicados'}
                </p>
                <p className="text-sm">
                  {creditos.length === 0
                    ? 'Cadastre um contribuinte e lance o primeiro levantamento.'
                    : 'Ajuste os filtros para ver mais resultados.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[240px]">Crédito</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Contribuinte</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[100px]">Tributo</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Competência</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Levantado</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Saldo</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[140px]">Situação</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Prescrição</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[120px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtrados.map((c) => {
                        const dias = c.saldo?.dias_para_prescricao;
                        const sev = getPrazoSeveridade(dias);
                        return (
                          <motion.tr
                            key={c.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="border-b border-slate-100 hover:bg-slate-50/60"
                          >
                            <td className="py-3 px-3">
                              <p className="font-medium text-slate-800">{c.titulo}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {c.codigo && <span className="text-xs font-mono text-slate-400">{c.codigo}</span>}
                                <span className="text-xs text-slate-500">{c.esfera}</span>
                                {c.responsavel_nome && (
                                  <span className="text-xs text-slate-500">· {c.responsavel_nome}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm text-slate-800">{c.contribuinte?.razao_social || '—'}</p>
                              {c.contribuinte?.cnpj && (
                                <p className="text-xs text-slate-500 font-mono">{formatCNPJ(c.contribuinte.cnpj)}</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="border-slate-300 text-slate-700">{c.tributo}</Badge>
                            </td>
                            <td className="py-3 px-3 text-sm text-slate-700">
                              {formatCompetencia(c.competencia_inicio, c.competencia_fim)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-800 font-medium">
                              {formatMoeda(c.valor_levantado)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums font-semibold text-indigo-700">
                              {formatMoeda(c.saldo?.saldo_disponivel ?? 0)}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className={getSituacaoColor(c.situacao)}>{c.situacao}</Badge>
                            </td>
                            <td className="py-3 px-3">
                              {c.data_limite_prescricao ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full ${prazoSeveridadeConfig[sev].dot}`} />
                                  <div>
                                    <p className="text-xs text-slate-700">{formatData(c.data_limite_prescricao)}</p>
                                    {dias != null && (
                                      <p className="text-xs text-slate-500">
                                        {dias < 0 ? `vencido há ${Math.abs(dias)}d` : `em ${dias}d`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setDetalhe(c)} title="Detalhes e razão">
                                  <Eye className="h-4 w-4 text-slate-500" />
                                </Button>
                                <Button variant="ghost" size="sm"
                                  onClick={() => { setEmEdicao(c); setFormAberto(true); }} title="Editar">
                                  <Edit2 className="h-4 w-4 text-slate-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setAExcluir(c)} title="Excluir">
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

      <CreditoForm
        isOpen={formAberto}
        onClose={() => { setFormAberto(false); setEmEdicao(null); }}
        onSave={salvar}
        credito={emEdicao}
        contribuintes={contribuintes}
        projetos={projetos}
        responsaveis={responsaveis}
        salvando={salvando}
      />

      <CreditoDetailModal
        isOpen={!!detalhe}
        onClose={() => setDetalhe(null)}
        credito={detalhe}
        usuario={usuario}
        userProfile={userProfile}
        onChanged={() => carregar(true)}
      />

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir crédito"
        description={`Excluir "${aExcluir?.titulo}"? Todos os movimentos da razão serão removidos junto. Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default CreditosView;
