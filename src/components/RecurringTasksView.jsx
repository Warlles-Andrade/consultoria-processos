import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { calcularOcorrencias } from '@/lib/recurrence';
import { motion } from 'framer-motion';
import { Repeat, PlusCircle, Trash2, ListChecks, Loader2, AlertCircle, Calendar } from 'lucide-react';

const FREQUENCIA_LABELS = {
  diaria: 'Diária',
  semanal: 'Semanal',
  mensal: 'Mensal',
  personalizada: 'Personalizada',
};

const getInitialFormData = () => ({
  tarefa: '',
  prioridade: 'Média',
  observacoes: '',
  cliente_filter: '',
  projeto_id: '',
  responsavel: '',
  frequencia: 'mensal',
  intervalo_valor: '',
  intervalo_unidade: 'dias',
  data_inicio: new Date().toISOString().split('T')[0],
  data_fim: '',
});

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '—');

const RecurringTasksView = ({
  usuario,
  userProfile,
  isAdmin = false,
  projetosOptions = [],
  gruposOptions = [],
  responsaveisOptions = [],
  statusOptions = [],
  onRefresh,
}) => {
  const { toast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(getInitialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingOcorrencias, setPendingOcorrencias] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [isConfirmCreateOpen, setIsConfirmCreateOpen] = useState(false);

  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [generatedTasks, setGeneratedTasks] = useState([]);
  const [loadingGenerated, setLoadingGenerated] = useState(false);

  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const fetchTemplates = async () => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('recurring_task_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar tarefas recorrentes', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjetos = formData.cliente_filter
    ? projetosOptions.filter(p => p.cliente_id === formData.cliente_filter)
    : projetosOptions;

  const filteredResponsaveis = formData.projeto_id
    ? responsaveisOptions.filter(r => Array.isArray(r.projeto_ids) && r.projeto_ids.includes(formData.projeto_id))
    : responsaveisOptions;

  const handleOpenCreate = () => {
    setFormData(getInitialFormData());
    setIsFormOpen(true);
  };

  const handleCloseCreate = () => {
    setIsFormOpen(false);
    setFormData(getInitialFormData());
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    if (name === 'cliente_filter') {
      setFormData(prev => ({ ...prev, cliente_filter: value, projeto_id: '', responsavel: '' }));
    } else if (name === 'projeto_id') {
      setFormData(prev => ({ ...prev, projeto_id: value, responsavel: '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.tarefa.trim()) {
      toast({ title: 'Erro de validação', description: 'Informe o nome da tarefa.', variant: 'destructive' });
      return;
    }
    if (!formData.projeto_id) {
      toast({ title: 'Erro de validação', description: 'Selecione o projeto onde esta tarefa recorrente ficará disponível.', variant: 'destructive' });
      return;
    }
    if (!formData.responsavel) {
      toast({ title: 'Erro de validação', description: 'Selecione o responsável.', variant: 'destructive' });
      return;
    }
    if (!formData.data_inicio || !formData.data_fim) {
      toast({ title: 'Erro de validação', description: 'Informe a data de início e a data fim (prazo final).', variant: 'destructive' });
      return;
    }
    if (formData.data_fim <= formData.data_inicio) {
      toast({ title: 'Data inválida', description: 'A data fim deve ser posterior à data de início.', variant: 'destructive' });
      return;
    }

    let ocorrencias;
    try {
      ocorrencias = calcularOcorrencias({
        frequencia: formData.frequencia,
        intervaloValor: formData.intervalo_valor ? Number(formData.intervalo_valor) : null,
        intervaloUnidade: formData.intervalo_unidade,
        dataInicio: formData.data_inicio,
        dataFim: formData.data_fim,
      });
    } catch (err) {
      toast({ title: 'Não foi possível calcular a recorrência', description: err.message, variant: 'destructive' });
      return;
    }

    const responsavelObj = responsaveisOptions.find(r => r.name === formData.responsavel);
    const projetoObj = projetosOptions.find(p => p.id === formData.projeto_id);
    const clienteObj = gruposOptions.find(g => g.id === (projetoObj?.cliente_id || formData.cliente_filter));

    setPendingOcorrencias(ocorrencias);
    setPendingPayload({
      responsavelObj,
      projetoObj,
      clienteObj,
    });
    setIsConfirmCreateOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (!pendingOcorrencias || !pendingPayload) return;
    setIsSubmitting(true);
    const { responsavelObj, projetoObj, clienteObj } = pendingPayload;
    const changedBy = userProfile?.nome || usuario?.email || 'Usuário';

    let novoTemplate = null;
    try {
      const { data: templateData, error: templateError } = await supabase
        .from('recurring_task_templates')
        .insert({
          tarefa: formData.tarefa.trim(),
          prioridade: formData.prioridade,
          observacoes: formData.observacoes?.trim() || null,
          projeto_id: formData.projeto_id,
          cliente_id: projetoObj?.cliente_id || null,
          responsavel_user_profile_id: responsavelObj?.id || null,
          responsavel_nome: formData.responsavel,
          responsavel_email: responsavelObj?.email || null,
          frequencia: formData.frequencia,
          intervalo_valor: formData.frequencia === 'personalizada' ? Number(formData.intervalo_valor) : null,
          intervalo_unidade: formData.frequencia === 'personalizada' ? formData.intervalo_unidade : null,
          data_inicio: formData.data_inicio,
          data_fim: formData.data_fim,
          total_ocorrencias: pendingOcorrencias.length,
          created_by: usuario?.id || null,
          created_by_name: changedBy,
        })
        .select()
        .single();
      if (templateError) throw templateError;
      novoTemplate = templateData;

      const statusInicial = statusOptions[0] || 'Não Iniciado';
      const now = new Date().toISOString();
      const processosRows = pendingOcorrencias.map(({ data, rotulo }) => ({
        tarefa: `${formData.tarefa.trim()} - ${rotulo}`,
        status: statusInicial,
        responsavel_nome: formData.responsavel,
        email: responsavelObj?.email || '',
        projeto_id: formData.projeto_id,
        cliente: clienteObj?.nome || '',
        grupo: clienteObj?.nome || '',
        prioridade: formData.prioridade,
        observacoes: formData.observacoes?.trim() || null,
        data_inicio: data,
        prazo: data,
        prazo_historico: [],
        is_edit_locked: false,
        parent_recurring_id: novoTemplate.id,
        user_id: usuario?.id || null,
        created_by: usuario?.id || null,
        created_by_name: changedBy,
        updated_by: usuario?.id || null,
        updated_by_name: changedBy,
        created_at: now,
        updated_at: now,
      }));

      const { data: savedProcessos, error: insertError } = await supabase
        .from('processos')
        .insert(processosRows)
        .select();
      if (insertError) throw insertError;

      try {
        const historyRows = savedProcessos.map(p => ({
          process_id: p.id,
          action: 'created',
          changed_by: usuario?.id || null,
          changed_by_name: changedBy,
          old_values: null,
          new_values: { tarefa: p.tarefa, status: p.status, responsavel: p.responsavel_nome, prazo: p.prazo },
          changes_summary: `Tarefa gerada em lote a partir da tarefa recorrente "${formData.tarefa.trim()}"`,
        }));
        await supabase.from('process_history').insert(historyRows);
      } catch (historyError) {
        console.error('Erro ao registrar histórico das tarefas recorrentes:', historyError);
      }

      toast({
        title: 'Tarefa recorrente criada',
        description: `${savedProcessos.length} tarefa(s) gerada(s) com sucesso.`,
        className: 'bg-green-500 text-white',
      });

      // Notificar o responsável por email (fire-and-forget), mesmo mecanismo do "Nova Tarefa"
      if (responsavelObj?.email) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch('/api/notify-responsavel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              type: 'recurring_batch',
              data: {
                email: responsavelObj.email,
                responsavel: formData.responsavel,
                tarefa: formData.tarefa.trim(),
                cliente: clienteObj?.nome || '',
                projeto: projetoObj?.nome || '',
                frequenciaLabel: describeFrequencia({
                  frequencia: formData.frequencia,
                  intervalo_valor: formData.intervalo_valor,
                  intervalo_unidade: formData.intervalo_unidade,
                }),
                totalOcorrencias: savedProcessos.length,
                dataInicio: formData.data_inicio,
                dataFim: formData.data_fim,
                observacoes: formData.observacoes?.trim() || '',
              },
            }),
          }).catch(err => console.error('Erro ao notificar responsável por email:', err));
        });
      }

      setIsConfirmCreateOpen(false);
      handleCloseCreate();
      setPendingOcorrencias(null);
      setPendingPayload(null);
      fetchTemplates();
      if (onRefresh) onRefresh();
    } catch (error) {
      if (novoTemplate) {
        await supabase.from('recurring_task_templates').delete().eq('id', novoTemplate.id);
      }
      toast({ title: 'Erro ao criar tarefa recorrente', description: getPublicErrorMessage(error), variant: 'destructive' });
      setIsConfirmCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewGenerated = async (template) => {
    setViewingTemplate(template);
    setLoadingGenerated(true);
    try {
      const { data, error } = await supabase
        .from('processos')
        .select('id, tarefa, status, data_inicio, prazo')
        .eq('parent_recurring_id', template.id)
        .order('data_inicio', { ascending: true });
      if (error) throw error;
      setGeneratedTasks(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar tarefas geradas', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoadingGenerated(false);
    }
  };

  const handleDeleteClick = (template) => {
    setTemplateToDelete(template);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      const { error } = await supabase.from('recurring_task_templates').delete().eq('id', templateToDelete.id);
      if (error) throw error;
      toast({ title: 'Tarefa recorrente excluída', description: 'As tarefas já criadas continuam existindo normalmente.', className: 'bg-green-500 text-white' });
      fetchTemplates();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsConfirmDeleteOpen(false);
      setTemplateToDelete(null);
    }
  };

  const canDelete = (template) => isAdmin || !template.created_by || template.created_by === usuario?.id;

  const describeFrequencia = (t) => {
    if (t.frequencia === 'personalizada') {
      const unidadeLabel = { dias: 'dia(s)', semanas: 'semana(s)', meses: 'mês(es)' }[t.intervalo_unidade] || t.intervalo_unidade;
      return `A cada ${t.intervalo_valor} ${unidadeLabel}`;
    }
    return FREQUENCIA_LABELS[t.frequencia] || t.frequencia;
  };

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 shadow-lg">
          <Repeat className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Tarefas Recorrentes</h1>
          <p className="text-gray-600 mt-1">Cadastre um molde e o sistema já cria todas as ocorrências até a data final</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-xl font-semibold">Moldes Cadastrados ({templates.length})</CardTitle>
              <Button onClick={handleOpenCreate} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl whitespace-nowrap">
                <PlusCircle className="h-4 w-4 mr-2" />Nova Tarefa Recorrente
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingList ? (
              <div className="text-center py-12">
                <Repeat className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-500">Carregando...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <Repeat className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma tarefa recorrente cadastrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <div key={t.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white/60">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{t.tarefa}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
                        <Badge variant="secondary">{describeFrequencia(t)}</Badge>
                        <span>Responsável: {t.responsavel_nome}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(t.data_inicio)} → {fmtDate(t.data_fim)}</span>
                        <span>{t.total_ocorrencias} tarefa(s) gerada(s)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleViewGenerated(t)}>
                        <ListChecks className="h-4 w-4 mr-1.5" />Ver tarefas geradas
                      </Button>
                      {canDelete(t) && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteClick(t)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal: Nova Tarefa Recorrente */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseCreate()}>
        <DialogContent className="sm:max-w-[640px] glass-effect p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
              Nova Tarefa Recorrente
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-2 max-h-[70vh] overflow-y-auto px-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tarefa">Tarefa *</Label>
              <Input id="tarefa" name="tarefa" value={formData.tarefa} onChange={handleChange} placeholder="Nome base da tarefa" required />
            </div>

            {gruposOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cliente_filter">Cliente *</Label>
                <Select name="cliente_filter" value={formData.cliente_filter || ''} onValueChange={(value) => handleSelectChange('cliente_filter', value)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {gruposOptions.map(g => (<SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projeto_id">Projeto *</Label>
              <Select name="projeto_id" value={formData.projeto_id || ''} onValueChange={(value) => handleSelectChange('projeto_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    gruposOptions.length > 0 && !formData.cliente_filter ? 'Selecione o cliente primeiro' :
                    filteredProjetos.length === 0 ? 'Nenhum projeto disponível' : 'Selecione o projeto'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjetos.map(p => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsavel">Responsável *</Label>
              <Select name="responsavel" value={formData.responsavel || ''} onValueChange={(value) => handleSelectChange('responsavel', value)}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    !formData.projeto_id ? 'Selecione o projeto primeiro' :
                    filteredResponsaveis.length === 0 ? 'Nenhum responsável' : 'Selecione o responsável'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {filteredResponsaveis.map(r => (<SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select name="prioridade" value={formData.prioridade} onValueChange={(value) => handleSelectChange('prioridade', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="frequencia">Frequência *</Label>
                <Select name="frequencia" value={formData.frequencia} onValueChange={(value) => handleSelectChange('frequencia', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="personalizada">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.frequencia === 'personalizada' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="intervalo_valor">A cada *</Label>
                  <Input id="intervalo_valor" name="intervalo_valor" type="number" min="1" value={formData.intervalo_valor} onChange={handleChange} placeholder="Ex: 15" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="intervalo_unidade">Unidade *</Label>
                  <Select name="intervalo_unidade" value={formData.intervalo_unidade} onValueChange={(value) => handleSelectChange('intervalo_unidade', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dias">Dias</SelectItem>
                      <SelectItem value="semanas">Semanas</SelectItem>
                      <SelectItem value="meses">Meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data_inicio" className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-green-500" />Data Início *
                </Label>
                <Input id="data_inicio" name="data_inicio" type="date" value={formData.data_inicio} max={formData.data_fim || undefined} onChange={handleChange} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data_fim" className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-blue-500" />Data Fim (prazo final) *
                </Label>
                <Input id="data_fim" name="data_fim" type="date" value={formData.data_fim} min={formData.data_inicio || undefined} onChange={handleChange} required />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" name="observacoes" value={formData.observacoes} onChange={handleChange} rows={3} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleCloseCreate}>Cancelar</Button>
              <Button type="submit" className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white">
                Calcular e Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de quantidade antes de gerar em lote */}
      <ConfirmDialog
        isOpen={isConfirmCreateOpen}
        onClose={() => !isSubmitting && setIsConfirmCreateOpen(false)}
        onConfirm={handleConfirmCreate}
        title="Confirmar geração em lote"
        description={
          pendingOcorrencias
            ? `Isso vai criar ${pendingOcorrencias.length} tarefa(s), de ${fmtDate(formData.data_inicio)} até ${fmtDate(formData.data_fim)}. Deseja continuar?`
            : ''
        }
        confirmText={isSubmitting ? 'Criando...' : 'Confirmar'}
      />

      {/* Ver tarefas geradas */}
      <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Tarefas geradas — {viewingTemplate?.tarefa}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {loadingGenerated ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...
              </div>
            ) : generatedTasks.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">Nenhuma tarefa encontrada (podem ter sido excluídas manualmente).</p>
            ) : (
              generatedTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-sm">
                  <span className="truncate">{task.tarefa}</span>
                  <div className="flex items-center gap-2 flex-shrink-0 text-slate-500">
                    <Badge variant="outline">{task.status}</Badge>
                    <span>{fmtDate(task.prazo)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir tarefa recorrente?"
        description={
          <span className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
            As {templateToDelete?.total_ocorrencias || 0} tarefa(s) já criada(s) continuam existindo normalmente em Tabela, Kanban e Cronograma — só o molde é removido.
          </span>
        }
        confirmText="Excluir molde"
      />
    </div>
  );
};

export default RecurringTasksView;
