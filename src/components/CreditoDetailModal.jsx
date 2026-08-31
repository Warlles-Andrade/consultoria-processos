import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { motion } from 'framer-motion';
import {
  Landmark, Plus, Trash2, Loader2, TrendingUp, TrendingDown,
  Wallet, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  listarMovimentos, criarMovimento, excluirMovimento,
  listarAndamentos, criarAndamento, marcarAndamentoCumprido, excluirAndamento,
} from '@/lib/fiscalApi';
import {
  tipoMovimentoOptions, naturezaPorTipoMovimento, tipoAndamentoOptions,
  getSituacaoColor, getPrazoSeveridade, prazoSeveridadeConfig,
  formatMoeda, formatData, formatCompetencia, formatCNPJ,
} from '@/data/fiscalDomain';

const hoje = () => new Date().toISOString().slice(0, 10);

const movimentoInicial = () => ({
  tipo: 'Apropriação',
  natureza: 'C',
  valor: null,
  data_movimento: hoje(),
  documento: '',
  observacoes: '',
});

const andamentoInicial = () => ({
  tipo: 'Protocolo',
  descricao: '',
  data_andamento: hoje(),
  prazo_fatal: '',
});

const Campo = ({ label, children }) => (
  <div>
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
    <div className="text-sm text-slate-800 mt-0.5">{children ?? '—'}</div>
  </div>
);

const CreditoDetailModal = ({ isOpen, onClose, credito, usuario, userProfile, onChanged }) => {
  const { toast } = useToast();

  const [movimentos, setMovimentos] = useState([]);
  const [andamentos, setAndamentos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [formMov, setFormMov] = useState(movimentoInicial());
  const [formAnd, setFormAnd] = useState(andamentoInicial());
  const [mostrarFormMov, setMostrarFormMov] = useState(false);
  const [mostrarFormAnd, setMostrarFormAnd] = useState(false);

  const [confirm, setConfirm] = useState(null); // { tipo: 'mov'|'and', id, texto }

  const carregar = useCallback(async () => {
    if (!credito?.id) return;
    setCarregando(true);
    try {
      const [movs, ands] = await Promise.all([
        listarMovimentos(credito.id),
        listarAndamentos('credito', credito.id),
      ]);
      setMovimentos(movs || []);
      setAndamentos(ands || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar o crédito', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [credito?.id, toast]);

  useEffect(() => {
    if (isOpen) {
      carregar();
      setMostrarFormMov(false);
      setMostrarFormAnd(false);
      setFormMov(movimentoInicial());
      setFormAnd(andamentoInicial());
    }
  }, [isOpen, carregar]);

  /** Saldo recalculado localmente para refletir lançamentos sem novo fetch. */
  const totais = useMemo(() => {
    const creditado = movimentos.filter((m) => m.natureza === 'C').reduce((s, m) => s + Number(m.valor), 0);
    const utilizado = movimentos.filter((m) => m.natureza === 'D').reduce((s, m) => s + Number(m.valor), 0);
    return { creditado, utilizado, saldo: creditado - utilizado };
  }, [movimentos]);

  const diasPrescricao = credito?.saldo?.dias_para_prescricao ?? null;
  const sevPrescricao = getPrazoSeveridade(diasPrescricao);

  const alterarTipoMovimento = (tipo) =>
    setFormMov((f) => ({ ...f, tipo, natureza: naturezaPorTipoMovimento[tipo] || f.natureza }));

  const lancarMovimento = async () => {
    if (!formMov.valor || formMov.valor <= 0) {
      toast({ title: 'Informe um valor maior que zero', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await criarMovimento(
        {
          credito_id: credito.id,
          tipo: formMov.tipo,
          natureza: formMov.natureza,
          valor: formMov.valor,
          data_movimento: formMov.data_movimento || hoje(),
          origem_tipo: 'manual',
          documento: formMov.documento?.trim() || null,
          observacoes: formMov.observacoes?.trim() || null,
        },
        usuario,
        userProfile
      );
      toast({ title: 'Movimento lançado', className: 'bg-green-500 text-white' });
      setFormMov(movimentoInicial());
      setMostrarFormMov(false);
      await carregar();
      onChanged?.();
    } catch (error) {
      toast({ title: 'Erro ao lançar movimento', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const lancarAndamento = async () => {
    if (!formAnd.descricao?.trim()) {
      toast({ title: 'Descreva o andamento', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await criarAndamento(
        {
          entidade_tipo: 'credito',
          entidade_id: credito.id,
          projeto_id: credito.projeto_id,
          tipo: formAnd.tipo,
          descricao: formAnd.descricao.trim(),
          data_andamento: formAnd.data_andamento || hoje(),
          prazo_fatal: formAnd.prazo_fatal || null,
          responsavel_nome: userProfile?.nome || null,
        },
        usuario,
        userProfile
      );
      toast({ title: 'Andamento registrado', className: 'bg-green-500 text-white' });
      setFormAnd(andamentoInicial());
      setMostrarFormAnd(false);
      await carregar();
    } catch (error) {
      toast({ title: 'Erro ao registrar andamento', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const executarExclusao = async () => {
    if (!confirm) return;
    try {
      if (confirm.tipo === 'mov') await excluirMovimento(confirm.id);
      else await excluirAndamento(confirm.id);
      toast({ title: 'Registro excluído', className: 'bg-green-500 text-white' });
      await carregar();
      onChanged?.();
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setConfirm(null);
    }
  };

  const alternarCumprido = async (andamento) => {
    try {
      await marcarAndamentoCumprido(andamento.id, !andamento.cumprido);
      await carregar();
    } catch (error) {
      toast({ title: 'Erro ao atualizar', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  if (!credito) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-3">
              <Landmark className="h-5 w-5 text-indigo-600" />
              <span>{credito.titulo}</span>
              {credito.codigo && (
                <Badge variant="outline" className="font-mono border-slate-300 text-slate-600">{credito.codigo}</Badge>
              )}
              <Badge variant="outline" className={getSituacaoColor(credito.situacao)}>{credito.situacao}</Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-2">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Levantado</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{formatMoeda(credito.valor_levantado)}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Creditado
              </p>
              <p className="text-lg font-bold text-emerald-800 tabular-nums">{formatMoeda(totais.creditado)}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-semibold text-orange-700 uppercase flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Utilizado
              </p>
              <p className="text-lg font-bold text-orange-800 tabular-nums">{formatMoeda(totais.utilizado)}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-semibold text-indigo-700 uppercase flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Saldo disponível
              </p>
              <p className="text-lg font-bold text-indigo-800 tabular-nums">{formatMoeda(totais.saldo)}</p>
            </motion.div>
          </div>

          {diasPrescricao != null && sevPrescricao !== 'ok' && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${prazoSeveridadeConfig[sevPrescricao].color}`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                {diasPrescricao < 0
                  ? `Prazo prescricional vencido há ${Math.abs(diasPrescricao)} dia(s) — em ${formatData(credito.data_limite_prescricao)}.`
                  : `Prescrição em ${diasPrescricao} dia(s) — ${formatData(credito.data_limite_prescricao)}.`}
              </span>
            </div>
          )}

          <Tabs defaultValue="dados" className="mt-2">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="razao">Razão ({movimentos.length})</TabsTrigger>
              <TabsTrigger value="andamentos">Andamentos ({andamentos.length})</TabsTrigger>
            </TabsList>

            {/* ---------------- Dados ---------------- */}
            <TabsContent value="dados" className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Campo label="Contribuinte">
                  {credito.contribuinte ? (
                    <>
                      <p className="font-medium">{credito.contribuinte.razao_social}</p>
                      <p className="text-xs text-slate-500 font-mono">{formatCNPJ(credito.contribuinte.cnpj)}</p>
                    </>
                  ) : null}
                </Campo>
                <Campo label="Projeto">{credito.projeto?.nome}</Campo>
                <Campo label="Responsável técnico">{credito.responsavel_nome}</Campo>

                <Campo label="Tributo">{credito.tributo}</Campo>
                <Campo label="Esfera">{credito.esfera}</Campo>
                <Campo label="Origem">{credito.origem}</Campo>

                <Campo label="Tipo de levantamento">{credito.tipo_levantamento}</Campo>
                <Campo label="Competência">
                  {formatCompetencia(credito.competencia_inicio, credito.competencia_fim)}
                </Campo>
                <Campo label="Honorários de êxito">
                  {credito.valor_honorarios_pct != null ? `${credito.valor_honorarios_pct}%` : null}
                </Campo>

                <Campo label="Valor homologado">{credito.valor_homologado != null ? formatMoeda(credito.valor_homologado) : null}</Campo>
                <Campo label="Data-base da prescrição">{credito.data_base_prescricao ? formatData(credito.data_base_prescricao) : null}</Campo>
                <Campo label="Limite prescricional">{credito.data_limite_prescricao ? formatData(credito.data_limite_prescricao) : null}</Campo>

                <div className="md:col-span-3"><Campo label="Base legal">{credito.base_legal}</Campo></div>
                <div className="md:col-span-3"><Campo label="Tese">{credito.tese}</Campo></div>
                <div className="md:col-span-3"><Campo label="Observações">{credito.observacoes}</Campo></div>
              </div>
            </TabsContent>

            {/* ---------------- Razão ---------------- */}
            <TabsContent value="razao" className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  O saldo é sempre a soma dos créditos menos os débitos — nunca é digitado à mão.
                </p>
                <Button size="sm" onClick={() => setMostrarFormMov((v) => !v)}
                  className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                  <Plus className="h-4 w-4 mr-1" /> Lançar movimento
                </Button>
              </div>

              {mostrarFormMov && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3 overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={formMov.tipo} onValueChange={alterarTipoMovimento}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {tipoMovimentoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Natureza</Label>
                      <Select value={formMov.natureza} onValueChange={(v) => setFormMov((f) => ({ ...f, natureza: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="C">Crédito (+)</SelectItem>
                          <SelectItem value="D">Débito (−)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Valor</Label>
                      <CurrencyInput value={formMov.valor} onChange={(v) => setFormMov((f) => ({ ...f, valor: v }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Data</Label>
                      <Input type="date" value={formMov.data_movimento}
                        onChange={(e) => setFormMov((f) => ({ ...f, data_movimento: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Documento</Label>
                      <Input value={formMov.documento}
                        onChange={(e) => setFormMov((f) => ({ ...f, documento: e.target.value }))}
                        placeholder="Nº do PER/DCOMP, protocolo..." />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label>Observações</Label>
                      <Input value={formMov.observacoes}
                        onChange={(e) => setFormMov((f) => ({ ...f, observacoes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMostrarFormMov(false)}>Cancelar</Button>
                    <Button size="sm" onClick={lancarMovimento} disabled={salvando}
                      className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                      {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Lançar
                    </Button>
                  </div>
                </motion.div>
              )}

              {carregando ? (
                <div className="flex justify-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : movimentos.length === 0 ? (
                <p className="text-center py-8 text-slate-500 text-sm">Nenhum movimento lançado ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Data</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Tipo</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-600">Documento</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Crédito</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-600">Débito</th>
                        <th className="text-center py-2 px-3 font-semibold text-slate-600">—</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimentos.map((m) => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className="py-2 px-3 text-slate-700">{formatData(m.data_movimento)}</td>
                          <td className="py-2 px-3">
                            <p className="text-slate-800">{m.tipo}</p>
                            {m.observacoes && <p className="text-xs text-slate-500">{m.observacoes}</p>}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{m.documento || '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-700 font-medium">
                            {m.natureza === 'C' ? formatMoeda(m.valor) : ''}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-orange-700 font-medium">
                            {m.natureza === 'D' ? formatMoeda(m.valor) : ''}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button variant="ghost" size="sm"
                              onClick={() => setConfirm({ tipo: 'mov', id: m.id, texto: `${m.tipo} de ${formatMoeda(m.valor)}` })}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td className="py-2 px-3" colSpan={3}>Saldo disponível</td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{formatMoeda(totais.creditado)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-orange-700">{formatMoeda(totais.utilizado)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-indigo-700">{formatMoeda(totais.saldo)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ---------------- Andamentos ---------------- */}
            <TabsContent value="andamentos" className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Movimentações e prazos deste crédito.</p>
                <Button size="sm" onClick={() => setMostrarFormAnd((v) => !v)}
                  className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                  <Plus className="h-4 w-4 mr-1" /> Novo andamento
                </Button>
              </div>

              {mostrarFormAnd && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3 overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={formAnd.tipo} onValueChange={(v) => setFormAnd((f) => ({ ...f, tipo: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {tipoAndamentoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Data</Label>
                      <Input type="date" value={formAnd.data_andamento}
                        onChange={(e) => setFormAnd((f) => ({ ...f, data_andamento: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Prazo fatal (opcional)</Label>
                      <Input type="date" value={formAnd.prazo_fatal}
                        onChange={(e) => setFormAnd((f) => ({ ...f, prazo_fatal: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Textarea rows={2} value={formAnd.descricao}
                      onChange={(e) => setFormAnd((f) => ({ ...f, descricao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMostrarFormAnd(false)}>Cancelar</Button>
                    <Button size="sm" onClick={lancarAndamento} disabled={salvando}
                      className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                      {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Registrar
                    </Button>
                  </div>
                </motion.div>
              )}

              {carregando ? (
                <div className="flex justify-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : andamentos.length === 0 ? (
                <p className="text-center py-8 text-slate-500 text-sm">Nenhum andamento registrado.</p>
              ) : (
                <div className="space-y-2">
                  {andamentos.map((a) => {
                    const dias = a.prazo_fatal
                      ? Math.round((new Date(`${a.prazo_fatal}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / 86400000)
                      : null;
                    const sev = getPrazoSeveridade(a.cumprido ? null : dias);
                    return (
                      <div key={a.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${prazoSeveridadeConfig[sev].dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-slate-300 text-slate-700">{a.tipo}</Badge>
                            <span className="text-xs text-slate-500">{formatData(a.data_andamento)}</span>
                            {a.prazo_fatal && (
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${prazoSeveridadeConfig[sev].color}`}>
                                <Clock className="h-3 w-3 inline mr-1" />
                                Prazo {formatData(a.prazo_fatal)}
                              </span>
                            )}
                            {a.cumprido && (
                              <span className="text-xs text-green-700 inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Cumprido
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-800 mt-1">{a.descricao}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {a.prazo_fatal && (
                            <Button variant="ghost" size="sm" onClick={() => alternarCumprido(a)}
                              title={a.cumprido ? 'Reabrir' : 'Marcar como cumprido'}>
                              <CheckCircle2 className={`h-4 w-4 ${a.cumprido ? 'text-green-600' : 'text-slate-400'}`} />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm"
                            onClick={() => setConfirm({ tipo: 'and', id: a.id, texto: a.descricao })}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
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
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={executarExclusao}
        title="Excluir registro"
        description={`Excluir "${confirm?.texto}"? Esta ação não pode ser desfeita.`}
      />
    </>
  );
};

export default CreditoDetailModal;
