import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import PerdcompForm from '@/components/PerdcompForm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt, PlusCircle, Search, Edit2, Trash2, Loader2,
  Banknote, ArrowLeftRight, Hourglass, X,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  listarPerdcomps, salvarPerdcomp, excluirPerdcomp, listarCreditos,
  listarDebitosPerdcomp, salvarDebitoPerdcomp, excluirDebitoPerdcomp,
} from '@/lib/fiscalApi';
import {
  tipoPerdcompOptions, situacaoPerdcompOptions,
  getSituacaoColor, getPrazoSeveridade, prazoSeveridadeConfig,
  formatMoeda, formatMoedaCompacta, formatData, formatCNPJ, onlyDigits,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';

/** Situações em que a homologação tácita ainda corre. */
const EM_CURSO = ['Transmitido', 'Em análise', 'Deferido parcialmente'];

const diasAte = (iso) => {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
};

const PerdcompsView = ({ usuario, userProfile, responsaveis = [], onRefresh }) => {
  const { toast } = useToast();

  const [perdcomps, setPerdcomps] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState(TODOS);
  const [fSituacao, setFSituacao] = useState(TODOS);

  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState(null);
  const [debitosEdicao, setDebitosEdicao] = useState([]);
  const [aExcluir, setAExcluir] = useState(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [lista, creds] = await Promise.all([listarPerdcomps(), listarCreditos()]);
      setPerdcomps(lista || []);
      setCreditos(creds || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar PER/DCOMPs', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setEmEdicao(null);
    setDebitosEdicao([]);
    setFormAberto(true);
  };

  const abrirEdicao = async (p) => {
    try {
      const debitos = await listarDebitosPerdcomp(p.id);
      setDebitosEdicao(debitos || []);
      setEmEdicao(p);
      setFormAberto(true);
    } catch (error) {
      toast({ title: 'Erro ao carregar débitos', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  /**
   * Salva o PER/DCOMP e reconcilia os débitos: remove os excluídos e
   * grava os demais já com o perdcomp_id resultante.
   */
  const salvar = async ({ dados, debitos, debitosRemovidos }) => {
    setSalvando(true);
    try {
      const salvo = await salvarPerdcomp(dados, usuario, userProfile);

      await Promise.all((debitosRemovidos || []).map((id) => excluirDebitoPerdcomp(id)));
      for (const d of debitos || []) {
        await salvarDebitoPerdcomp({ ...d, perdcomp_id: salvo.id });
      }

      toast({ title: dados.id ? 'PER/DCOMP atualizado' : 'PER/DCOMP cadastrado', className: 'bg-green-500 text-white' });
      setFormAberto(false);
      setEmEdicao(null);
      setDebitosEdicao([]);
      await carregar(true);
      onRefresh?.();
    } catch (error) {
      const msg = error?.code === '23505'
        ? 'Já existe um PER/DCOMP com este número.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluirPerdcomp(aExcluir.id);
      toast({ title: 'PER/DCOMP excluído', className: 'bg-green-500 text-white' });
      await carregar(true);
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(() => perdcomps.filter((p) => {
    if (fTipo !== TODOS && p.tipo !== fTipo) return false;
    if (fSituacao !== TODOS && p.situacao !== fSituacao) return false;
    if (!termo) return true;
    return (
      p.numero?.toLowerCase().includes(termo) ||
      p.numero_processo_administrativo?.toLowerCase().includes(termo) ||
      p.credito?.titulo?.toLowerCase().includes(termo) ||
      p.credito?.codigo?.toLowerCase().includes(termo) ||
      p.contribuinte?.razao_social?.toLowerCase().includes(termo) ||
      onlyDigits(p.contribuinte?.cnpj).includes(onlyDigits(termo))
    );
  }), [perdcomps, fTipo, fSituacao, termo]);

  const kpis = useMemo(() => {
    const original = filtrados.reduce((s, p) => s + Number(p.valor_credito_original || 0), 0);
    const compensado = filtrados.reduce((s, p) => s + Number(p.valor_compensado || 0), 0);
    const emAnalise = filtrados.filter((p) => EM_CURSO.includes(p.situacao));
    const homologacaoProxima = filtrados.filter((p) => {
      if (!EM_CURSO.includes(p.situacao)) return false;
      const d = diasAte(p.data_limite_homologacao);
      return d != null && d <= 180;
    });
    return { original, compensado, emAnalise, homologacaoProxima };
  }, [filtrados]);

  const temFiltro = fTipo !== TODOS || fSituacao !== TODOS || !!termo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-md">
            <Receipt className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">PER/DCOMP</h1>
            <p className="text-sm text-slate-500">Restituição, ressarcimento, reembolso e compensação federal</p>
          </div>
        </div>
        <Button onClick={abrirNovo} disabled={creditos.length === 0}
          className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white">
          <PlusCircle className="h-4 w-4 mr-2" /> Novo PER/DCOMP
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Crédito informado" valor={formatMoedaCompacta(kpis.original)}
          detalhe={`${filtrados.length} documento(s)`} icone={Banknote} />
        <KpiCard titulo="Compensado" valor={formatMoedaCompacta(kpis.compensado)}
          detalhe="Débitos quitados" icone={ArrowLeftRight}
          cor="border-blue-200 bg-blue-50 text-blue-800" delay={0.05} />
        <KpiCard titulo="Aguardando análise" valor={String(kpis.emAnalise.length)}
          detalhe="Sem despacho definitivo" icone={Hourglass}
          cor="border-amber-200 bg-amber-50 text-amber-800" delay={0.1} />
        <KpiCard titulo="Homologação tácita" valor={String(kpis.homologacaoProxima.length)}
          detalhe="Completa 5 anos em até 180 dias" icone={Hourglass}
          cor={kpis.homologacaoProxima.length > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}
          delay={0.15} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base font-semibold text-slate-700">
              Documentos ({filtrados.length})
            </CardTitle>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por número, processo, crédito ou CNPJ" className="pl-9" />
              </div>
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                  {tipoPerdcompOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fSituacao} onValueChange={setFSituacao}>
                <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={TODOS}>Todas as situações</SelectItem>
                  {situacaoPerdcompOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {temFiltro && (
              <Button variant="ghost" size="sm" className="text-slate-500 w-fit"
                onClick={() => { setBusca(''); setFTipo(TODOS); setFSituacao(TODOS); }}>
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
                <Receipt className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhum crédito cadastrado</p>
                <p className="text-sm">Todo PER/DCOMP parte de um crédito. Cadastre um em <strong>Créditos</strong> primeiro.</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Receipt className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">
                  {perdcomps.length === 0 ? 'Nenhum PER/DCOMP cadastrado' : 'Nada encontrado para os filtros'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[160px]">Número</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[120px]">Tipo</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[200px]">Crédito / Contribuinte</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[110px]">Transmissão</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Crédito</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Compensado</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[160px]">Situação</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[150px]">Homologação tácita</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[90px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtrados.map((p) => {
                        const emCurso = EM_CURSO.includes(p.situacao);
                        const dias = emCurso ? diasAte(p.data_limite_homologacao) : null;
                        const sev = getPrazoSeveridade(dias);
                        return (
                          <motion.tr key={p.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="py-3 px-3">
                              <p className="font-medium text-slate-800 font-mono text-sm">{p.numero}</p>
                              {p.numero_processo_administrativo && (
                                <p className="text-xs text-slate-500">PAF {p.numero_processo_administrativo}</p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="border-blue-300 text-blue-800 bg-blue-50">{p.tipo}</Badge>
                              <p className="text-xs text-slate-500 mt-1">{p.tipo_documento}</p>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm text-slate-800">{p.credito?.titulo || '—'}</p>
                              <p className="text-xs text-slate-500">
                                {p.contribuinte?.razao_social}
                                {p.contribuinte?.cnpj && ` · ${formatCNPJ(p.contribuinte.cnpj)}`}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-sm text-slate-700">{formatData(p.data_transmissao)}</td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-800 font-medium">
                              {formatMoeda(p.valor_credito_original)}
                            </td>
                            <td className="py-3 px-3 text-right text-sm tabular-nums font-semibold text-blue-700">
                              {formatMoeda(p.valor_compensado)}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className={getSituacaoColor(p.situacao)}>{p.situacao}</Badge>
                            </td>
                            <td className="py-3 px-3">
                              {p.data_limite_homologacao ? (
                                <div className="flex items-center gap-1.5">
                                  {emCurso && <span className={`h-2 w-2 rounded-full ${prazoSeveridadeConfig[sev].dot}`} />}
                                  <div>
                                    <p className="text-xs text-slate-700">{formatData(p.data_limite_homologacao)}</p>
                                    {dias != null && (
                                      <p className="text-xs text-slate-500">
                                        {dias < 0 ? 'prazo cumprido' : `em ${dias}d`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)} title="Editar">
                                  <Edit2 className="h-4 w-4 text-slate-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setAExcluir(p)} title="Excluir">
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

      <PerdcompForm
        isOpen={formAberto}
        onClose={() => { setFormAberto(false); setEmEdicao(null); setDebitosEdicao([]); }}
        onSave={salvar}
        perdcomp={emEdicao}
        debitosIniciais={debitosEdicao}
        creditos={creditos}
        responsaveis={responsaveis}
        salvando={salvando}
      />

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir PER/DCOMP"
        description={`Excluir o documento ${aExcluir?.numero}? Os débitos vinculados também serão removidos.`}
      />
    </div>
  );
};

export default PerdcompsView;
