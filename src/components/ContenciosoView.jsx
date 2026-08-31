import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProcessoAdmForm from '@/components/ProcessoAdmForm';
import ProcessoJudicialForm from '@/components/ProcessoJudicialForm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gavel, Scale, PlusCircle, Search, Edit2, Trash2, Loader2,
  Banknote, ShieldCheck, Clock, X, Download,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { exportarProcessosAdministrativos, exportarProcessosJudiciais } from '@/lib/fiscalExport';
import {
  listarProcessosAdministrativos, salvarProcessoAdministrativo, excluirProcessoAdministrativo,
  listarProcessosJudiciais, salvarProcessoJudicial, excluirProcessoJudicial,
  listarContribuintes, listarCreditos,
} from '@/lib/fiscalApi';
import {
  esferaOptions, situacaoProcessoAdmOptions, situacaoProcessoJudicialOptions,
  getSituacaoColor, getPrazoSeveridade, prazoSeveridadeConfig,
  formatMoeda, formatMoedaCompacta, formatData, formatCNPJ, formatCNJ, onlyDigits,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';

const ENCERRADOS_ADM = ['Encerrado', 'Arquivado', 'Prescrito'];
const ENCERRADOS_JUD = ['Arquivada', 'Extinta'];

const diasAte = (iso) => {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
};

/** Célula de prazo com bolinha de severidade. */
const CelulaPrazo = ({ data, dias, rotulo }) => {
  if (!data) return <span className="text-xs text-slate-400">—</span>;
  const sev = getPrazoSeveridade(dias);
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${prazoSeveridadeConfig[sev].dot}`} />
      <div>
        <p className="text-xs text-slate-700">{formatData(data)}</p>
        {rotulo && <p className="text-xs text-slate-500">{rotulo}</p>}
        {!rotulo && dias != null && (
          <p className="text-xs text-slate-500">
            {dias < 0 ? `vencido há ${Math.abs(dias)}d` : `em ${dias}d`}
          </p>
        )}
      </div>
    </div>
  );
};

const ContenciosoView = ({ usuario, userProfile, projetos = [], responsaveis = [], onRefresh }) => {
  const { toast } = useToast();

  const [administrativos, setAdministrativos] = useState([]);
  const [judiciais, setJudiciais] = useState([]);
  const [contribuintes, setContribuintes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [buscaAdm, setBuscaAdm] = useState('');
  const [fEsfera, setFEsfera] = useState(TODOS);
  const [fSitAdm, setFSitAdm] = useState(TODOS);

  const [buscaJud, setBuscaJud] = useState('');
  const [fSitJud, setFSitJud] = useState(TODOS);

  const [formAdmAberto, setFormAdmAberto] = useState(false);
  const [admEdicao, setAdmEdicao] = useState(null);
  const [formJudAberto, setFormJudAberto] = useState(false);
  const [judEdicao, setJudEdicao] = useState(null);
  const [aExcluir, setAExcluir] = useState(null); // { tipo: 'adm'|'jud', registro }

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [adm, jud, contribs, creds] = await Promise.all([
        listarProcessosAdministrativos(),
        listarProcessosJudiciais(),
        listarContribuintes(),
        listarCreditos(),
      ]);
      setAdministrativos(adm || []);
      setJudiciais(jud || []);
      setContribuintes(contribs || []);
      setCreditos(creds || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar o contencioso', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarAdm = async (dados) => {
    setSalvando(true);
    try {
      await salvarProcessoAdministrativo(dados, usuario, userProfile);
      toast({ title: dados.id ? 'Processo atualizado' : 'Processo cadastrado', className: 'bg-green-500 text-white' });
      setFormAdmAberto(false);
      setAdmEdicao(null);
      await carregar(true);
      onRefresh?.();
    } catch (error) {
      const msg = error?.code === '23514'
        ? 'Dados inconsistentes: a partir de "Protocolado" é obrigatório informar a data de protocolo.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const salvarJud = async (dados) => {
    setSalvando(true);
    try {
      await salvarProcessoJudicial(dados, usuario, userProfile);
      toast({ title: dados.id ? 'Ação atualizada' : 'Ação cadastrada', className: 'bg-green-500 text-white' });
      setFormJudAberto(false);
      setJudEdicao(null);
      await carregar(true);
      onRefresh?.();
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      if (aExcluir.tipo === 'adm') await excluirProcessoAdministrativo(aExcluir.registro.id);
      else await excluirProcessoJudicial(aExcluir.registro.id);
      toast({ title: 'Registro excluído', className: 'bg-green-500 text-white' });
      await carregar(true);
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  // -------------------- Administrativo --------------------
  const termoAdm = buscaAdm.trim().toLowerCase();
  const admFiltrados = useMemo(() => administrativos.filter((p) => {
    if (fEsfera !== TODOS && p.esfera !== fEsfera) return false;
    if (fSitAdm !== TODOS && p.situacao !== fSitAdm) return false;
    if (!termoAdm) return true;
    return (
      p.numero_processo?.toLowerCase().includes(termoAdm) ||
      p.numero_auto_infracao?.toLowerCase().includes(termoAdm) ||
      p.orgao_atual?.toLowerCase().includes(termoAdm) ||
      p.contribuinte?.razao_social?.toLowerCase().includes(termoAdm) ||
      onlyDigits(p.contribuinte?.cnpj).includes(onlyDigits(termoAdm))
    );
  }), [administrativos, fEsfera, fSitAdm, termoAdm]);

  const kpisAdm = useMemo(() => {
    const ativos = admFiltrados.filter((p) => !ENCERRADOS_ADM.includes(p.situacao));
    const autuado = ativos.reduce((s, p) => s + Number(p.valor_autuado || 0), 0);
    const cancelado = admFiltrados.reduce((s, p) => s + Number(p.valor_cancelado || 0), 0);
    const criticos = ativos.filter((p) => {
      const d = Math.min(
        ...[p.prazo_impugnacao, p.proximo_prazo].map((x) => diasAte(x)).filter((x) => x != null)
      );
      return Number.isFinite(d) && d <= 30;
    });
    return { ativos, autuado, cancelado, criticos };
  }, [admFiltrados]);

  // -------------------- Judicial --------------------
  const termoJud = buscaJud.trim().toLowerCase();
  const judFiltrados = useMemo(() => judiciais.filter((p) => {
    if (fSitJud !== TODOS && p.situacao !== fSitJud) return false;
    if (!termoJud) return true;
    return (
      onlyDigits(p.numero_cnj).includes(onlyDigits(termoJud)) ||
      p.numero_cnj?.toLowerCase().includes(termoJud) ||
      p.tipo_acao?.toLowerCase().includes(termoJud) ||
      p.tribunal?.toLowerCase().includes(termoJud) ||
      p.contribuinte?.razao_social?.toLowerCase().includes(termoJud) ||
      onlyDigits(p.contribuinte?.cnpj).includes(onlyDigits(termoJud))
    );
  }), [judiciais, fSitJud, termoJud]);

  const kpisJud = useMemo(() => {
    const ativas = judFiltrados.filter((p) => !ENCERRADOS_JUD.includes(p.situacao));
    const estimado = judFiltrados.reduce((s, p) => s + Number(p.valor_estimado_credito || 0), 0);
    const transitadas = judFiltrados.filter((p) => !!p.data_transito_julgado);
    const compensacaoCritica = transitadas.filter((p) => {
      const d = diasAte(p.prazo_compensacao);
      return d != null && d <= 180;
    });
    return { ativas, estimado, transitadas, compensacaoCritica };
  }, [judFiltrados]);

  /** Exporta o que está na aba visível, com os filtros dela aplicados. */
  const exportar = (qual) => {
    try {
      const arquivo = qual === 'adm'
        ? exportarProcessosAdministrativos(admFiltrados)
        : exportarProcessosJudiciais(judFiltrados);
      toast({ title: 'Exportação concluída', description: `${arquivo} foi baixado.`, className: 'bg-green-500 text-white' });
    } catch (error) {
      toast({ title: 'Erro na exportação', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const semContribuintes = contribuintes.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
          <Gavel className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Contencioso</h1>
          <p className="text-sm text-slate-500">
            Administrativo (DRJ, CARF, CSRF, TIT-SP, TAT/MS) e judicial
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : semContribuintes ? (
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardContent className="text-center py-16 text-slate-500">
            <Gavel className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Nenhum contribuinte cadastrado</p>
            <p className="text-sm">Cadastre um CNPJ em <strong>Contribuintes</strong> antes de lançar processos.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="administrativo">
          <TabsList>
            <TabsTrigger value="administrativo">
              <Gavel className="h-4 w-4 mr-1.5" /> Administrativo ({administrativos.length})
            </TabsTrigger>
            <TabsTrigger value="judicial">
              <Scale className="h-4 w-4 mr-1.5" /> Judicial ({judiciais.length})
            </TabsTrigger>
          </TabsList>

          {/* ============ ADMINISTRATIVO ============ */}
          <TabsContent value="administrativo" className="space-y-6 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard titulo="Processos ativos" valor={String(kpisAdm.ativos.length)}
                detalhe={`${admFiltrados.length} no total`} icone={Gavel} />
              <KpiCard titulo="Valor em discussão" valor={formatMoedaCompacta(kpisAdm.autuado)}
                detalhe="Autuado nos processos ativos" icone={Banknote}
                cor="border-amber-200 bg-amber-50 text-amber-800" delay={0.05} />
              <KpiCard titulo="Cancelado / reduzido" valor={formatMoedaCompacta(kpisAdm.cancelado)}
                detalhe="Afastado em julgamento" icone={ShieldCheck}
                cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.1} />
              <KpiCard titulo="Prazo crítico" valor={String(kpisAdm.criticos.length)}
                detalhe="Vence em até 30 dias" icone={Clock}
                cor={kpisAdm.criticos.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : undefined}
                delay={0.15} />
            </div>

            <Card className="glass-card border-white/60 rounded-2xl">
              <CardHeader className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Processos administrativos ({admFiltrados.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => exportar('adm')}
                      disabled={admFiltrados.length === 0}>
                      <Download className="h-4 w-4 mr-2" /> Exportar
                    </Button>
                    <Button size="sm" onClick={() => { setAdmEdicao(null); setFormAdmAberto(true); }}
                      className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                      <PlusCircle className="h-4 w-4 mr-2" /> Novo processo
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={buscaAdm} onChange={(e) => setBuscaAdm(e.target.value)}
                      placeholder="Buscar por processo, auto de infração, órgão ou CNPJ" className="pl-9" />
                  </div>
                  <Select value={fEsfera} onValueChange={setFEsfera}>
                    <SelectTrigger><SelectValue placeholder="Esfera" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas as esferas</SelectItem>
                      {esferaOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={fSitAdm} onValueChange={setFSitAdm}>
                    <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={TODOS}>Todas as situações</SelectItem>
                      {situacaoProcessoAdmOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(fEsfera !== TODOS || fSitAdm !== TODOS || termoAdm) && (
                  <Button variant="ghost" size="sm" className="text-slate-500 w-fit"
                    onClick={() => { setBuscaAdm(''); setFEsfera(TODOS); setFSitAdm(TODOS); }}>
                    <X className="h-4 w-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </CardHeader>

              <CardContent>
                {admFiltrados.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <Gavel className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">
                      {administrativos.length === 0 ? 'Nenhum processo administrativo' : 'Nada encontrado para os filtros'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Processo</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[170px]">Órgão / Instância</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Contribuinte</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[150px]">Peça</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Autuado</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[160px]">Situação</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[140px]">Próximo prazo</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[90px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {admFiltrados.map((p) => {
                            const encerrado = ENCERRADOS_ADM.includes(p.situacao);
                            const prazo = p.prazo_impugnacao && (!p.data_protocolo || p.situacao === 'Em elaboração')
                              ? p.prazo_impugnacao : p.proximo_prazo;
                            const dias = encerrado ? null : diasAte(prazo);
                            return (
                              <motion.tr key={p.id}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="border-b border-slate-100 hover:bg-slate-50/60">
                                <td className="py-3 px-3">
                                  <p className="font-medium text-slate-800 text-sm">{p.numero_processo}</p>
                                  {p.numero_auto_infracao && (
                                    <p className="text-xs text-slate-500">Auto {p.numero_auto_infracao}</p>
                                  )}
                                  {p.credito && (
                                    <p className="text-xs text-indigo-600">{p.credito.codigo || p.credito.titulo}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <p className="text-sm text-slate-800">{p.orgao_atual}</p>
                                  <p className="text-xs text-slate-500">{p.esfera} · {p.instancia}</p>
                                  {p.relator && <p className="text-xs text-slate-400">Rel. {p.relator}</p>}
                                </td>
                                <td className="py-3 px-3">
                                  <p className="text-sm text-slate-800">{p.contribuinte?.razao_social || '—'}</p>
                                  {p.contribuinte?.cnpj && (
                                    <p className="text-xs text-slate-500 font-mono">{formatCNPJ(p.contribuinte.cnpj)}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <p className="text-sm text-slate-800">{p.tipo}</p>
                                  <p className="text-xs text-slate-500">{p.natureza}</p>
                                </td>
                                <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-800 font-medium">
                                  {p.valor_autuado != null ? formatMoeda(p.valor_autuado) : '—'}
                                  {p.valor_cancelado > 0 && (
                                    <p className="text-xs font-normal text-emerald-700">
                                      −{formatMoeda(p.valor_cancelado)}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <Badge variant="outline" className={getSituacaoColor(p.situacao)}>{p.situacao}</Badge>
                                </td>
                                <td className="py-3 px-3">
                                  <CelulaPrazo data={encerrado ? null : prazo} dias={dias}
                                    rotulo={p.proximo_prazo_descricao && prazo === p.proximo_prazo ? p.proximo_prazo_descricao : null} />
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button variant="ghost" size="sm"
                                      onClick={() => { setAdmEdicao(p); setFormAdmAberto(true); }} title="Editar">
                                      <Edit2 className="h-4 w-4 text-slate-500" />
                                    </Button>
                                    <Button variant="ghost" size="sm"
                                      onClick={() => setAExcluir({ tipo: 'adm', registro: p })} title="Excluir">
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
          </TabsContent>

          {/* ============ JUDICIAL ============ */}
          <TabsContent value="judicial" className="space-y-6 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard titulo="Ações ativas" valor={String(kpisJud.ativas.length)}
                detalhe={`${judFiltrados.length} no total`} icone={Scale} />
              <KpiCard titulo="Crédito estimado" valor={formatMoedaCompacta(kpisJud.estimado)}
                detalhe="Potencial das ações" icone={Banknote}
                cor="border-purple-200 bg-purple-50 text-purple-800" delay={0.05} />
              <KpiCard titulo="Transitadas em julgado" valor={String(kpisJud.transitadas.length)}
                detalhe="Aptas a habilitação" icone={ShieldCheck}
                cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.1} />
              <KpiCard titulo="Compensação a vencer" valor={String(kpisJud.compensacaoCritica.length)}
                detalhe="5 anos do trânsito em até 180 dias" icone={Clock}
                cor={kpisJud.compensacaoCritica.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : undefined}
                delay={0.15} />
            </div>

            <Card className="glass-card border-white/60 rounded-2xl">
              <CardHeader className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Ações judiciais ({judFiltrados.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => exportar('jud')}
                      disabled={judFiltrados.length === 0}>
                      <Download className="h-4 w-4 mr-2" /> Exportar
                    </Button>
                    <Button size="sm" onClick={() => { setJudEdicao(null); setFormJudAberto(true); }}
                      className="bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white">
                      <PlusCircle className="h-4 w-4 mr-2" /> Nova ação
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={buscaJud} onChange={(e) => setBuscaJud(e.target.value)}
                      placeholder="Buscar por CNJ, tipo de ação, tribunal ou CNPJ" className="pl-9" />
                  </div>
                  <Select value={fSitJud} onValueChange={setFSitJud}>
                    <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={TODOS}>Todas as situações</SelectItem>
                      {situacaoProcessoJudicialOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(fSitJud !== TODOS || termoJud) && (
                  <Button variant="ghost" size="sm" className="text-slate-500 w-fit"
                    onClick={() => { setBuscaJud(''); setFSitJud(TODOS); }}>
                    <X className="h-4 w-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </CardHeader>

              <CardContent>
                {judFiltrados.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <Scale className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">
                      {judiciais.length === 0 ? 'Nenhuma ação judicial' : 'Nada encontrado para os filtros'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[200px]">Processo</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[170px]">Juízo</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Contribuinte</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Crédito estimado</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Situação</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[150px]">Compensação</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Habilitação RFB</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[90px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {judFiltrados.map((p) => {
                            const dias = diasAte(p.prazo_compensacao);
                            const cnj = onlyDigits(p.numero_cnj).length === 20
                              ? formatCNJ(p.numero_cnj) : p.numero_cnj;
                            return (
                              <motion.tr key={p.id}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="border-b border-slate-100 hover:bg-slate-50/60">
                                <td className="py-3 px-3">
                                  <p className="font-medium text-slate-800 text-sm font-mono">{cnj}</p>
                                  <p className="text-xs text-slate-500">{p.tipo_acao} · polo {p.polo.toLowerCase()}</p>
                                  {p.credito && (
                                    <p className="text-xs text-indigo-600">{p.credito.codigo || p.credito.titulo}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <p className="text-sm text-slate-800">{p.tribunal || p.vara || '—'}</p>
                                  <p className="text-xs text-slate-500">
                                    {[p.comarca, p.uf].filter(Boolean).join(' · ')} · {p.instancia}
                                  </p>
                                </td>
                                <td className="py-3 px-3">
                                  <p className="text-sm text-slate-800">{p.contribuinte?.razao_social || '—'}</p>
                                  {p.contribuinte?.cnpj && (
                                    <p className="text-xs text-slate-500 font-mono">{formatCNPJ(p.contribuinte.cnpj)}</p>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right text-sm tabular-nums font-semibold text-purple-700">
                                  {p.valor_estimado_credito != null ? formatMoeda(p.valor_estimado_credito) : '—'}
                                </td>
                                <td className="py-3 px-3">
                                  <Badge variant="outline" className={getSituacaoColor(p.situacao)}>{p.situacao}</Badge>
                                  {p.data_transito_julgado && (
                                    <p className="text-xs text-slate-500 mt-1">
                                      trânsito {formatData(p.data_transito_julgado)}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <CelulaPrazo data={p.prazo_compensacao} dias={dias} />
                                </td>
                                <td className="py-3 px-3">
                                  {p.habilitacao_previa_rfb ? (
                                    <Badge variant="outline"
                                      className={getSituacaoColor(
                                        p.situacao_habilitacao_previa === 'Deferida' ? 'Deferido'
                                        : p.situacao_habilitacao_previa === 'Indeferida' ? 'Indeferido'
                                        : p.situacao_habilitacao_previa === 'Solicitada' ? 'Em análise'
                                        : 'Em preparação'
                                      )}>
                                      {p.situacao_habilitacao_previa || 'Não solicitada'}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-slate-400">não exige</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button variant="ghost" size="sm"
                                      onClick={() => { setJudEdicao(p); setFormJudAberto(true); }} title="Editar">
                                      <Edit2 className="h-4 w-4 text-slate-500" />
                                    </Button>
                                    <Button variant="ghost" size="sm"
                                      onClick={() => setAExcluir({ tipo: 'jud', registro: p })} title="Excluir">
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
          </TabsContent>
        </Tabs>
      )}

      <ProcessoAdmForm
        isOpen={formAdmAberto}
        onClose={() => { setFormAdmAberto(false); setAdmEdicao(null); }}
        onSave={salvarAdm}
        processo={admEdicao}
        contribuintes={contribuintes}
        projetos={projetos}
        creditos={creditos}
        responsaveis={responsaveis}
        salvando={salvando}
      />

      <ProcessoJudicialForm
        isOpen={formJudAberto}
        onClose={() => { setFormJudAberto(false); setJudEdicao(null); }}
        onSave={salvarJud}
        processo={judEdicao}
        contribuintes={contribuintes}
        projetos={projetos}
        creditos={creditos}
        responsaveis={responsaveis}
        salvando={salvando}
      />

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir registro"
        description={`Excluir ${aExcluir?.registro?.numero_processo || aExcluir?.registro?.numero_cnj}? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default ContenciosoView;
