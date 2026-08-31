import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, Calendar, Paperclip, Upload, X, FileText, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';


const ProcessForm = ({ 
  isOpen, 
  onClose, 
  process, 
  onSave, 
  statusOptions, 
  responsaveisOptions,
  projetosOptions = [],
  gruposOptions = [],
  isAdmin = false,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);

  const getInitialFormData = () => {
    const initialStatus = statusOptions[0];
    return {
        tarefa: '',
        status: initialStatus,
        responsavel: '',
        email: '',
        data_inicio: '',
        prazo: '',
        projeto_id: '',
        prioridade: 'Média',
        observacoes: '',
        justificativaReplanejamento: '',
        usar_tarefa_recorrente: false,
        recurring_template_id: '',
    };
  };

  const [formData, setFormData] = useState(getInitialFormData);

  // Whether prazo has been changed from the original (replanejamento)
  const isPrazoReplanejamento = !!(process && process.prazo && formData.prazo && formData.prazo !== process.prazo);

  // Fetch existing attachments when editing
  useEffect(() => {
    if (isOpen && process?.id) {
      setLoadingAttachments(true);
      supabase
        .from('process_documents')
        .select('*')
        .eq('process_id', process.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setExistingAttachments(data || []);
        })
        .finally(() => setLoadingAttachments(false));
    } else if (isOpen && !process) {
      setExistingAttachments([]);
    }
  }, [process?.id, isOpen]);

  // Buscar tarefas recorrentes cadastradas (só relevante ao criar uma tarefa nova)
  useEffect(() => {
    if (isOpen && !process) {
      supabase
        .from('recurring_task_templates')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error) setRecurringTemplates(data || []);
        });
    }
  }, [isOpen, process]);

  // Derivar cliente_filter a partir do projeto selecionado (para preencher ao editar)
  const deriveClienteFilter = (data) => {
    if (data.cliente_filter) return data;
    if (data.projeto_id) {
      const proj = projetosOptions.find(p => p.id === data.projeto_id);
      if (proj?.cliente_id) {
        return { ...data, cliente_filter: proj.cliente_id };
      }
    }
    return data;
  };

  useEffect(() => {
    if (isOpen) {
      setPendingFiles([]);
      setAttachmentsToDelete([]);
      if (process) {
        setFormData(deriveClienteFilter({ ...getInitialFormData(), ...process }));
      } else {
        const kanbanData = sessionStorage.getItem('kanbanBaseData');
        if (kanbanData) {
          try {
            const baseData = JSON.parse(kanbanData);
            setFormData(deriveClienteFilter({ ...getInitialFormData(), ...baseData }));
            sessionStorage.removeItem('kanbanBaseData');
          } catch (e) {
            setFormData(getInitialFormData());
          }
        } else {
          setFormData(getInitialFormData());
        }
      }
    }
  }, [process?.id, isOpen]);

  // Auto-selecionar cliente quando o usuário tem apenas 1 cliente disponível
  useEffect(() => {
    if (isOpen && gruposOptions.length === 1 && !formData.cliente_filter) {
      setFormData(prev => ({ ...prev, cliente_filter: gruposOptions[0].id }));
    }
  }, [isOpen, gruposOptions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    if (name === 'cliente_filter') {
      // Admin trocou o cliente: limpar projeto e responsável (comuns)
      setFormData(prev => ({
        ...prev,
        cliente_filter: value,
        projeto_id: '',
        responsavel: '',
        email: '',
      }));
    } else if (name === 'projeto_id') {
      // Ao trocar projeto, verificar se o responsável atual continua válido.
      const currentResp = responsaveisOptions.find(r => r.name === formData.responsavel);
      const currentStillValid = currentResp && (
        currentResp.grupo === 'adm' ||
        (Array.isArray(currentResp?.projeto_ids) && currentResp.projeto_ids.includes(value))
      );
      if (currentStillValid) {
        setFormData(prev => ({ ...prev, projeto_id: value, recurring_template_id: '' }));
      } else {
        setFormData(prev => ({
          ...prev,
          projeto_id: value,
          responsavel: '',
          email: '',
          recurring_template_id: '',
        }));
      }
    } else if (name === 'responsavel') {
      const found = responsaveisOptions.find(r => r.name === value);
      setFormData(prev => ({
        ...prev,
        responsavel: value,
        email: found?.email || '',
      }));
    } else if (name === 'recurring_template_id') {
      const template = recurringTemplates.find(t => t.id === value);
      setFormData(prev => ({
        ...prev,
        recurring_template_id: value,
        ...(template ? {
          tarefa: template.tarefa,
          prioridade: template.prioridade || prev.prioridade,
          observacoes: template.observacoes || '',
          responsavel: template.responsavel_nome || prev.responsavel,
          email: template.responsavel_email || prev.email,
        } : {}),
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB (limite do bucket Supabase Free tier)
    const valid = files.filter(f => {
      if (f.size > MAX_SIZE) {
        toast({ title: `Arquivo muito grande: ${f.name}`, description: 'Tamanho máximo é 50MB.', variant: 'destructive' });
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (attachmentId) => {
    setAttachmentsToDelete(prev => [...prev, attachmentId]);
    setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.tarefa) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, preencha o nome da tarefa.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.projeto_id) {
      toast({
        title: "Erro de Validação",
        description: "Selecione o projeto ao qual esta tarefa pertence.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.responsavel) {
      toast({
        title: "Erro de Validação",
        description: "Selecione o responsável pela tarefa.",
        variant: "destructive",
      });
      return;
    }

    if (formData.usar_tarefa_recorrente && !formData.recurring_template_id) {
      toast({
        title: "Erro de Validação",
        description: "Selecione a tarefa recorrente ou desmarque a opção.",
        variant: "destructive",
      });
      return;
    }

    // Prazo não pode ser anterior à data de início
    if (formData.data_inicio && formData.prazo && formData.prazo < formData.data_inicio) {
      toast({
        title: "Data inválida",
        description: "O prazo não pode ser anterior à data de início.",
        variant: "destructive",
      });
      return;
    }

    // Replanejamento requires justification
    if (isPrazoReplanejamento && !formData.justificativaReplanejamento?.trim()) {
      toast({
        title: "Justificativa obrigatória",
        description: "Informe a justificativa para o replanejamento do prazo.",
        variant: "destructive",
      });
      return;
    }

    // Validar se o responsável selecionado pertence ao projeto escolhido
    if (formData.projeto_id && formData.responsavel) {
      const respSelecionado = responsaveisOptions.find(r => r.name === formData.responsavel);
      if (
        respSelecionado &&
        Array.isArray(respSelecionado.projeto_ids) &&
        !respSelecionado.projeto_ids.includes(formData.projeto_id)
      ) {
        toast({
          title: "Responsável inválido para este projeto",
          description: `O usuário "${formData.responsavel}" não pertence a este cliente/projeto. Altere o cliente e projeto onde o usuário está ativo, ou selecione outro responsável.`,
          variant: "destructive",
          duration: 7000,
        });
        return;
      }
    }

    const { cliente_filter, usar_tarefa_recorrente, recurring_template_id, ...saveData } = formData;

    // Se preencheu prazo sem data de início, usa hoje como início e avisa
    let dataInicio = formData.data_inicio?.trim() || null;
    if (formData.prazo?.trim() && !dataInicio) {
      dataInicio = new Date().toISOString().split('T')[0];
      toast({
        title: "Data de Início preenchida automaticamente",
        description: "Como o Prazo foi informado sem Data de Início, o sistema usou a data de hoje.",
        className: "bg-yellow-500 text-white",
        duration: 5000,
      });
    }

    onSave({
      ...saveData,
      data_inicio: dataInicio,
      prazo: formData.prazo?.trim() || null,
      parent_recurring_id: (usar_tarefa_recorrente && recurring_template_id) ? recurring_template_id : (process?.parent_recurring_id || null),
      _pendingFiles: pendingFiles,
      _attachmentsToDelete: attachmentsToDelete,
    });
  };

  const handleClose = () => {
    setFormData(getInitialFormData());
    setPendingFiles([]);
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    onClose();
  };

  if (!isOpen) return null;

  // Detectar filtros múltiplos ativos (para aviso ao criar nova tarefa)
  const activeGrupoFilter = (() => { try { return JSON.parse(localStorage.getItem('processTableGrupoFilterMulti') || '[]'); } catch { return []; } })();
  const activeProjetoFilter = (() => { try { return JSON.parse(localStorage.getItem('processTableProjetoFilterMulti') || '[]'); } catch { return []; } })();
  const hasMultipleClienteFilter = !process && activeGrupoFilter.length > 1;
  const hasMultipleProjetoFilter = !process && activeProjetoFilter.length > 1;
  const showFilterWarning = hasMultipleClienteFilter || hasMultipleProjetoFilter;

  // Filtragem em cascata: Cliente → Projeto → Responsável
  // Para todos os usuários (admin e comuns com múltiplos clientes)
  const filteredProjetos = formData.cliente_filter
    ? projetosOptions.filter(p => p.cliente_id === formData.cliente_filter)
    : projetosOptions;

  const filteredResponsaveis = (formData.projeto_id)
    ? responsaveisOptions.filter(r =>
        Array.isArray(r.projeto_ids) && r.projeto_ids.includes(formData.projeto_id)
      )
    : responsaveisOptions;

  const filteredRecurringTemplates = formData.projeto_id
    ? recurringTemplates.filter(t => t.projeto_id === formData.projeto_id)
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[720px] glass-effect p-8">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            {process ? 'Editar Tarefa' : 'Nova Tarefa'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4 max-h-[70vh] overflow-y-auto px-1">

          {/* 1. Tarefa */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tarefa">Tarefa *</Label>
            <Input id="tarefa" name="tarefa" value={formData.tarefa} onChange={handleChange} placeholder="Nome da tarefa / processo" required />
          </div>

          {/* Aviso: filtros múltiplos ativos */}
          {showFilterWarning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
              <span>
                {hasMultipleClienteFilter && hasMultipleProjetoFilter
                  ? 'Há múltiplos clientes e projetos selecionados nos filtros. Selecione manualmente o cliente e o projeto abaixo.'
                  : hasMultipleClienteFilter
                  ? 'Há múltiplos clientes selecionados nos filtros. Selecione manualmente o cliente abaixo.'
                  : 'Há múltiplos projetos selecionados nos filtros. Selecione manualmente o projeto abaixo.'}
              </span>
            </div>
          )}

          {/* 2. Cliente → filtra Projetos */}
          {gruposOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cliente_filter">Cliente *</Label>
              <Select name="cliente_filter" value={formData.cliente_filter || ''} onValueChange={(value) => handleSelectChange('cliente_filter', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {gruposOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 3. Projeto */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projeto_id">Projeto *</Label>
            <Select name="projeto_id" value={formData.projeto_id || ''} onValueChange={(value) => handleSelectChange('projeto_id', value)} required>
              <SelectTrigger>
                <SelectValue placeholder={
                  gruposOptions.length > 0 && !formData.cliente_filter ? 'Selecione o cliente primeiro' :
                  filteredProjetos.length === 0 ? 'Nenhum projeto disponível' : 'Selecione o projeto'
                } />
              </SelectTrigger>
              <SelectContent>
                {filteredProjetos.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.cliente_filter && filteredProjetos.length === 0 && (
              <p className="text-xs text-amber-600">Nenhum projeto disponível para este cliente.</p>
            )}
            {!isAdmin && projetosOptions.length === 0 && (
              <p className="text-xs text-amber-600">Nenhum projeto foi atribuído ao seu perfil. Contate o administrador.</p>
            )}
          </div>

          {/* Reaproveitar tarefa recorrente cadastrada (só ao criar tarefa nova) */}
          {!process && (
            <div className="flex flex-col gap-2 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-indigo-900">
                <input
                  type="checkbox"
                  checked={formData.usar_tarefa_recorrente || false}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    usar_tarefa_recorrente: e.target.checked,
                    ...(e.target.checked ? {} : { recurring_template_id: '' }),
                  }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Usar tarefa recorrente cadastrada
              </label>
              {formData.usar_tarefa_recorrente && (
                <Select
                  name="recurring_template_id"
                  value={formData.recurring_template_id || ''}
                  onValueChange={(value) => handleSelectChange('recurring_template_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !formData.projeto_id ? 'Selecione o projeto primeiro' :
                      filteredRecurringTemplates.length === 0 ? 'Nenhuma tarefa recorrente cadastrada para este projeto' :
                      'Selecione a tarefa recorrente'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRecurringTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.tarefa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formData.usar_tarefa_recorrente && formData.recurring_template_id && (
                <p className="text-xs text-indigo-700">Campos preenchidos a partir do molde — ainda podem ser ajustados abaixo.</p>
              )}
            </div>
          )}

          {/* Badge informativo quando a tarefa já veio de uma recorrência */}
          {process?.parent_recurring_id && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-sm text-indigo-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Esta tarefa foi gerada a partir de uma tarefa recorrente.
            </div>
          )}

          {/* 4. Responsável + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsavel">Responsável *</Label>
              <Select name="responsavel" value={formData.responsavel || ''} onValueChange={(value) => handleSelectChange('responsavel', value)} required>
                <SelectTrigger>
                  <SelectValue placeholder={
                    !formData.projeto_id ? 'Selecione o projeto primeiro' :
                    filteredResponsaveis.length === 0 ? 'Nenhum responsável' : 'Selecione o responsável'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {filteredResponsaveis.map(option => (
                    <SelectItem key={option.name} value={option.name}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.projeto_id && filteredResponsaveis.length === 0 && (
                <p className="text-xs text-amber-600">Nenhum responsável neste projeto.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail do Responsável</Label>
              <Input id="email" name="email" value={formData.email || ''} readOnly placeholder="Preenchido automaticamente" className="bg-slate-50 text-slate-500" />
            </div>
          </div>

          {/* 5. Status + Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" value={formData.status} onValueChange={(value) => handleSelectChange('status', value)}>
                <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select name="prioridade" value={formData.prioridade || 'Média'} onValueChange={(value) => handleSelectChange('prioridade', value)}>
                <SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 6. Data de Início + Prazo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data_inicio" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-green-500" />
                Data de Início
              </Label>
              <Input id="data_inicio" name="data_inicio" type="date" value={formData.data_inicio || ''} max={formData.prazo || undefined} onChange={handleChange} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prazo" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                Prazo
              </Label>
              <Input id="prazo" name="prazo" type="date" value={formData.prazo || ''} min={formData.data_inicio || undefined} onChange={handleChange} />
            </div>
          </div>

          {/* Justificativa de Replanejamento — aparece ao alterar prazo existente */}
          {isPrazoReplanejamento && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <Label htmlFor="justificativaReplanejamento" className="flex items-center gap-1.5 text-amber-800 font-medium">
                <AlertCircle className="h-4 w-4" />
                Justificativa de Replanejamento *
              </Label>
              <p className="text-xs text-amber-700">
                O prazo foi alterado de <strong>{process.prazo ? new Date(process.prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</strong> para <strong>{formData.prazo ? new Date(formData.prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</strong>. Informe o motivo.
              </p>
              <Textarea
                id="justificativaReplanejamento"
                name="justificativaReplanejamento"
                value={formData.justificativaReplanejamento || ''}
                onChange={handleChange}
                placeholder="Descreva o motivo do replanejamento..."
                rows={3}
                required
              />
            </div>
          )}

          {/* Anexos */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Paperclip className="h-4 w-4 text-blue-500" />
              Anexos
            </Label>

            {/* Existing attachments */}
            {loadingAttachments ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando anexos...
              </div>
            ) : existingAttachments.length > 0 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-xs text-slate-500 font-medium">Documentos salvos:</p>
                {existingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{att.filename}</span>
                      {att.file_size && (
                        <span className="text-xs text-slate-400">({(att.file_size / 1024).toFixed(1)} KB)</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(att.id)}
                      className="text-red-400 hover:text-red-600 flex-shrink-0 ml-2"
                      title="Remover anexo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending new files */}
            {pendingFiles.length > 0 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-xs text-slate-500 font-medium">Novos arquivos a enviar:</p>
                {pendingFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{file.name}</span>
                      <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="text-red-400 hover:text-red-600 flex-shrink-0 ml-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload area */}
            <div
              className="mt-1 border-2 border-dashed border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer text-center"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1" />
              <p className="text-sm text-slate-500">Clique para adicionar arquivos</p>
              <p className="text-xs text-slate-400">PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, CSV (máx. 50MB cada)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" value={formData.observacoes} onChange={handleChange} placeholder="Detalhes adicionais sobre o processo" rows={3}/>
          </div>
          
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button type="submit" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg">
              {process ? 'Salvar Alterações' : 'Criar Processo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessForm;
