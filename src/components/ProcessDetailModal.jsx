
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStatusColor, getPriorityColor, calcDiasProcesso } from '@/data/mockData';
import { Calendar, User, FolderKanban, Info, UserCheck, UserPlus, AlertCircle, Paperclip, FileText, Download, DownloadCloud, Loader2, Edit, ChevronDown, ChevronUp, History, Plus, Trash2, ArrowRight, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ProcessDetailModal = ({ isOpen, onClose, process, isAdmin = false, projetos = [], onEdit, canEdit = true }) => {
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [credito, setCredito] = useState(null);

  // Crédito vinculado — busca sob demanda para não pesar o carregamento da
  // lista. Falha em silêncio se as migrations fiscais não foram aplicadas.
  useEffect(() => {
    if (!isOpen || !process?.credito_id) {
      setCredito(null);
      return;
    }
    supabase
      .from('creditos')
      .select('id, codigo, titulo, tributo')
      .eq('id', process.credito_id)
      .maybeSingle()
      .then(({ data, error }) => setCredito(error ? null : data));
  }, [isOpen, process?.credito_id]);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && process?.id) {
      setLoadingAttachments(true);
      supabase
        .from('process_documents')
        .select('*')
        .eq('process_id', process.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setAttachments(data || []))
        .finally(() => setLoadingAttachments(false));

      setLoadingHistory(true);
      supabase
        .from('process_history')
        .select('*')
        .eq('process_id', process.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setAuditHistory(data || []))
        .finally(() => setLoadingHistory(false));
    } else {
      setAttachments([]);
      setAuditHistory([]);
      setAuditOpen(false);
    }
  }, [process?.id, isOpen]);

  const handleDownload = async (att) => {
    const { data, error } = await supabase.storage
      .from('process-documents')
      .createSignedUrl(att.storage_path, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  // Dispara o download de um Blob já baixado, sem abrir nova aba
  const saveBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Evita sobrescrever arquivos com o mesmo nome dentro do mesmo lote
  const uniqueFilename = (filename, usedNames) => {
    const base = filename || 'arquivo';
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    const dot = base.lastIndexOf('.');
    const name = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let i = 2;
    let candidate = `${name} (${i})${ext}`;
    while (usedNames.has(candidate)) {
      i += 1;
      candidate = `${name} (${i})${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  const handleDownloadAll = async () => {
    if (!attachments.length || downloadingAll) return;
    setDownloadingAll(true);

    const usedNames = new Set();
    const failed = [];
    let ok = 0;

    for (const att of attachments) {
      try {
        const { data, error } = await supabase.storage
          .from('process-documents')
          .download(att.storage_path);
        if (error || !data) throw error || new Error('Arquivo não encontrado');
        saveBlob(data, uniqueFilename(att.filename, usedNames));
        ok += 1;
        // pequena pausa para o navegador não bloquear downloads em sequência
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (err) {
        failed.push(att.filename || att.storage_path);
      }
    }

    setDownloadingAll(false);

    if (failed.length === 0) {
      toast({
        title: 'Download concluído',
        description: `${ok} arquivo${ok !== 1 ? 's' : ''} baixado${ok !== 1 ? 's' : ''} com sucesso.`,
        className: 'bg-green-500 text-white',
      });
    } else if (ok === 0) {
      toast({
        title: 'Falha no download',
        description: 'Nenhum arquivo pôde ser baixado. Tente novamente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Download parcial',
        description: `${ok} baixado(s). Falhou: ${failed.join(', ')}`,
        variant: 'destructive',
      });
    }
  };

  if (!process) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  };
  
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR', { 
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl glass-effect max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Detalhes do Processo: {process.tarefa}
            </DialogTitle>
            {onEdit && canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(process)}
                className="flex items-center gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400 shrink-0"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
          <DialogDescription>
            Informações completas sobre o processo e histórico de replanejamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4 overflow-y-auto pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard icon={<Info />} label="Tarefa" value={process.tarefa} />
            <InfoCard icon={<Info />} label="Status" badgeValue={process.status} badgeClassName={getStatusColor(process.status)} />
          </div>

          <InfoCard icon={<AlertCircle />} label="Prioridade" badgeValue={process.prioridade || '—'} badgeClassName={process.prioridade ? getPriorityColor(process.prioridade) : 'bg-gray-100 text-gray-500 border-gray-200'} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard icon={<FolderKanban />} label="Projeto" value={projetos.find(p => p.id === process.projeto_id)?.nome || '—'} />
            <InfoCard icon={<User />} label="Responsável" value={process.responsavel} />
          </div>

          {credito && (
            <InfoCard
              icon={<Landmark />}
              label="Crédito vinculado"
              value={`${credito.codigo ? `${credito.codigo} — ` : ''}${credito.titulo}${credito.tributo ? ` (${credito.tributo})` : ''}`}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard
              icon={<Calendar />}
              label="Data de Início"
              value={process.data_inicio ? formatDate(process.data_inicio) : '—'}
            />
            <InfoCard
              icon={<Calendar />}
              label="Prazo"
              value={formatDate(process.prazo)}
              valueClass={process.prazo && new Date(process.prazo + 'T00:00:00') < new Date() && process.status !== 'Concluído' ? 'text-red-600 font-semibold' : 'text-gray-800'}
            />
          </div>

          {(() => {
            const info = calcDiasProcesso(process);
            if (!info) return null;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${info.isOverdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-sm font-medium text-slate-600">Dias do Processo:</span>
                  <span className={`text-lg font-bold ${info.isOverdue ? 'text-red-600' : 'text-slate-800'}`}>
                    {info.dias} dia{info.dias !== 1 ? 's' : ''}
                  </span>
                  {process.status === 'Concluído' && (
                    <span className="text-xs text-green-600 ml-1">(concluído)</span>
                  )}
                </div>
              </div>
            );
          })()}
          
          <div>
            <Label className="text-sm font-medium text-gray-700">Observações</Label>
            <p className="mt-1 text-sm text-gray-600 bg-gray-50 p-3 rounded-md border whitespace-pre-wrap">
              {process.observacoes || 'Nenhuma observação.'}
            </p>
          </div>

          {/* Anexos */}
          <Card className="border-l-4 border-l-blue-400">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Paperclip className="h-5 w-5 text-blue-500" />
                  Anexos
                  {attachments.length > 0 && (
                    <span className="text-xs font-normal text-slate-400">
                      ({attachments.length})
                    </span>
                  )}
                </CardTitle>
                {attachments.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadAll}
                    disabled={downloadingAll}
                    className="flex items-center gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400 shrink-0"
                    title="Baixar todos os anexos"
                  >
                    {downloadingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <DownloadCloud className="h-4 w-4" />
                    )}
                    {downloadingAll ? 'Baixando...' : `Baixar todos (${attachments.length})`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingAttachments ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando anexos...
                </div>
              ) : attachments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum anexo neste processo.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{att.filename}</p>
                          <p className="text-xs text-slate-400">
                            {att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ''}
                            {att.uploaded_by_name ? ` · ${att.uploaded_by_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(att)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium ml-3 flex-shrink-0 bg-white border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
                        title="Baixar arquivo"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico de Replanejamento */}
          {(() => {
            let prazoHistorico = [];
            if (process.prazo_historico) {
              prazoHistorico = Array.isArray(process.prazo_historico)
                ? process.prazo_historico
                : (() => { try { return JSON.parse(process.prazo_historico); } catch { return []; } })();
            }
            if (prazoHistorico.length === 0) return null;
            return (
              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    Histórico de Replanejamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                    {prazoHistorico.map((entry, index) => (
                      <div key={index} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(entry.data_anterior)}</span>
                          <span>→</span>
                          <span>{formatDate(entry.data_nova)}</span>
                        </div>
                        {entry.justificativa && (
                          <p className="text-sm text-gray-700 mt-1">
                            <span className="font-medium">Justificativa: </span>
                            {entry.justificativa}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          por <span className="font-medium">{entry.alterado_por}</span> em {formatDateTime(entry.alterado_em)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Auditoria — apenas Admin */}
          {isAdmin && <Card className="border-l-4 border-l-slate-400">
            <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setAuditOpen(o => !o)}>
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <History className="h-5 w-5 text-slate-500" />
                  Auditoria
                  {auditHistory.length > 0 && (
                    <span className="text-xs font-normal bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {auditHistory.length} registro{auditHistory.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                {auditOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </CardTitle>
            </CardHeader>

            {auditOpen && (
              <CardContent>
                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando histórico...
                  </div>
                ) : auditHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Nenhum registro de auditoria.</p>
                ) : (
                  <div className="relative space-y-0 max-h-[400px] overflow-y-auto pr-1">
                    {auditHistory.map((entry, i) => {
                      const isCreated = entry.action === 'created';
                      const isAttachment = entry.changes_summary?.startsWith('Anexo');
                      const isStatus = entry.action === 'status_changed';

                      const iconBg = isCreated
                        ? 'bg-green-100 text-green-600'
                        : isAttachment
                        ? 'bg-blue-100 text-blue-600'
                        : isStatus
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-slate-100 text-slate-500';

                      const Icon = isCreated ? UserPlus
                        : isAttachment && entry.new_values ? Plus
                        : isAttachment ? Trash2
                        : isStatus ? ArrowRight
                        : Edit;

                      const parseVal = (v) => {
                        if (!v) return null;
                        if (typeof v === 'object') return v;
                        try { return JSON.parse(v); } catch { return null; }
                      };
                      const oldVals = parseVal(entry.old_values);
                      const newVals = parseVal(entry.new_values);
                      const diffKeys = newVals ? Object.keys(newVals) : (oldVals ? Object.keys(oldVals) : []);

                      return (
                        <div key={entry.id} className="flex gap-3 pb-4 last:pb-0">
                          {/* linha vertical */}
                          <div className="flex flex-col items-center">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            {i < auditHistory.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                          </div>

                          <div className="flex-1 pt-0.5 pb-2">
                            <p className="text-sm font-medium text-slate-800">{entry.changes_summary}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {entry.changed_by_name && (
                                <span className="font-medium text-slate-500">{entry.changed_by_name} · </span>
                              )}
                              {formatDateTime(entry.created_at)}
                            </p>

                            {/* diff campo a campo */}
                            {!isCreated && !isAttachment && diffKeys.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {diffKeys.map(k => (
                                  <div key={k} className="flex items-center gap-1.5 text-xs flex-wrap">
                                    <span className="text-slate-500 font-medium">{k}:</span>
                                    {oldVals?.[k] != null && (
                                      <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{String(oldVals[k])}</span>
                                    )}
                                    {newVals?.[k] != null && (
                                      <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{String(newVals[k])}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* anexo adicionado */}
                            {isAttachment && newVals?.anexo && (
                              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded w-fit">
                                <FileText className="h-3 w-3" />
                                {newVals.anexo}
                                {newVals.tamanho && <span className="text-slate-400">({newVals.tamanho})</span>}
                              </div>
                            )}

                            {/* anexo removido */}
                            {isAttachment && oldVals?.anexo && !newVals && (
                              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2 py-1 rounded w-fit line-through">
                                <FileText className="h-3 w-3" />
                                {oldVals.anexo}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>}

        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const InfoCard = ({ icon, label, value, badgeValue, badgeClassName, valueClass = 'text-gray-800' }) => (
  <div className="bg-white/50 p-4 rounded-lg shadow-sm border">
    <Label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
      {React.cloneElement(icon, { className: "h-4 w-4 text-blue-500" })}
      {label}
    </Label>
    {badgeValue ? (
      <Badge className={`mt-1 text-sm ${badgeClassName}`}>{badgeValue}</Badge>
    ) : (
      <p className={`mt-1 text-sm font-medium ${valueClass}`}>{value}</p>
    )}
  </div>
);

const Label = ({ className, ...props }) => (
  <label className={cn("block text-sm font-medium text-gray-700", className)} {...props} />
);

export default ProcessDetailModal;
