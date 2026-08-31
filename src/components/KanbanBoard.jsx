import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { User, FolderKanban, PlusCircle, MoreHorizontal, Eye, Edit, Trash2, Calendar, MessageSquare, Search, Filter, Kanban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatusColor, getPriorityColor, calcDiasProcesso, getPrazoStatus } from '@/data/mockData';
import { useToast } from '@/components/ui/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const KanbanBoard = ({
  processes,
  onUpdateProcessStatus,
  onViewProcess,
  onEditProcess,
  onDeleteProcess,
  onChatProcess,
  unreadChats = new Set(),
  onAddProcessToColumn,
  statusOptions,
  sortOrder,
  onSortChange,
  projetos = [],
  grupos = [],
  responsaveisOptions = [],
  currentUserId,
  isAdminUser = false,
  userProjetoIds = [],
  canEditProcess = () => true,
}) => {
  const { toast } = useToast();
  const [draggedProcess, setDraggedProcess] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Filtros — mesmas keys da tabela para sincronizar estado entre abas
  const [searchTerm, setSearchTerm] = useLocalStorage('processTableSearchTerm', '');
  const [statusFilter, setStatusFilter] = useLocalStorage('processTableStatusFilterMulti', []);
  const [responsavelFilter, setResponsavelFilter] = useLocalStorage('processTableResponsavelFilterMulti', []);
  const [grupoFilter, setGrupoFilter] = useLocalStorage('processTableGrupoFilterMulti', []);
  const [projetoFilter, setProjetoFilter] = useLocalStorage('processTableProjetoFilterMulti', []);

  // Projetos condicionados ao cliente selecionado
  const clienteIdsForFilter = grupoFilter.length > 0
    ? grupos.filter(g => grupoFilter.includes(g.nome)).map(g => g.id)
    : [];
  const projetosParaFiltro = clienteIdsForFilter.length > 0
    ? projetos.filter(p => clienteIdsForFilter.includes(p.cliente_id))
    : projetos;

  // Responsáveis condicionados ao cliente selecionado
  const responsaveisParaFiltro = grupoFilter.length > 0
    ? Array.from(new Set(
        processes
          .filter(p => grupoFilter.includes(p.grupo))
          .map(p => p.responsavel)
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    : responsaveisOptions;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter([]);
    setResponsavelFilter([]);
    setGrupoFilter([]);
    setProjetoFilter([]);
  };

  const filteredProcesses = processes.filter(process => {
    const matchesSearch =
      (process.tarefa?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (process.responsavel?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(process.status);
    const matchesResponsavel = responsavelFilter.length === 0 || responsavelFilter.includes(process.responsavel);
    const matchesGrupo = grupoFilter.length === 0 || grupoFilter.includes(process.grupo);
    const matchesProjeto = projetoFilter.length === 0 || projetoFilter.includes(process.projeto_id);
    return matchesSearch && matchesStatus && matchesResponsavel && matchesGrupo && matchesProjeto;
  });

  // Drag & drop
  const handleDragStart = (e, process) => {
    setDraggedProcess(process);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({processId: process.id}));
  };

  const handleDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDropOnColumn = (e, targetStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedProcess) return;
    if (draggedProcess.status !== targetStatus) {
      onUpdateProcessStatus(draggedProcess.id, targetStatus);
    }
    setDraggedProcess(null);
  };

  const handleDragEnd = () => {
    setDraggedProcess(null);
    setDragOverColumn(null);
  };

  const getProcessesForColumn = (status) => {
    const col = filteredProcesses.filter(p => p.status === status);
    if (sortOrder === 'cadastro') return col;
    if (sortOrder === 'prazo') {
      return [...col].sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0;
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return new Date(a.prazo) - new Date(b.prazo);
      });
    }
    return [...col].sort((a, b) => {
      const ta = a.tarefa || '';
      const tb = b.tarefa || '';
      if (sortOrder === 'az') return ta.localeCompare(tb, 'pt-BR', { sensitivity: 'base' });
      if (sortOrder === 'za') return tb.localeCompare(ta, 'pt-BR', { sensitivity: 'base' });
      return 0;
    });
  };

  const hasActiveFilters = searchTerm || statusFilter.length > 0 || responsavelFilter.length > 0 || grupoFilter.length > 0 || projetoFilter.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 shadow-md">
          <Kanban className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">Kanban</h1>
      </div>
      {/* Filtros */}
      <Card className="glass-card border-white/60 rounded-2xl">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
            <div className="relative lg:col-span-2 xl:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por tarefa, responsável..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9 bg-white/80 focus:bg-white border-2 border-slate-200 focus:border-purple-400 rounded-xl text-sm"
              />
            </div>

            {isAdminUser && (
              <MultiSelect
                value={grupoFilter}
                onValueChange={(v) => { setGrupoFilter(v); setProjetoFilter([]); setResponsavelFilter([]); }}
                placeholder="Filtrar por Cliente"
                options={grupos.map(g => ({ value: g.nome, label: g.nome, className: 'capitalize' }))}
                className="h-9 bg-white/80 border-2 border-slate-200 rounded-xl text-sm"
              />
            )}

            <MultiSelect
              value={projetoFilter}
              onValueChange={setProjetoFilter}
              placeholder="Filtrar por Projeto"
              options={projetosParaFiltro.map(p => ({ value: p.id, label: p.nome }))}
              className="h-9 bg-white/80 border-2 border-slate-200 rounded-xl text-sm"
            />

            <MultiSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Filtrar por Status"
              options={statusOptions.map(s => ({ value: s, label: s }))}
              className="h-9 bg-slate-50 border-slate-300 text-sm"
            />

            <MultiSelect
              value={responsavelFilter}
              onValueChange={setResponsavelFilter}
              placeholder="Responsável"
              options={responsaveisParaFiltro.map(r => ({ value: r, label: r }))}
              className="h-9 bg-slate-50 border-slate-300 text-sm"
            />
          </div>

          <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-semibold">Ordenar por:</span>
              <Select value={sortOrder} onValueChange={onSortChange}>
                <SelectTrigger className="h-10 w-48 bg-slate-50 focus:bg-white border-slate-300 focus:border-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cadastro">Data de Cadastro</SelectItem>
                  <SelectItem value="az">Alfabética (A-Z)</SelectItem>
                  <SelectItem value="za">Alfabética (Z-A)</SelectItem>
                  <SelectItem value="prazo">Data de Vencimento (Prazo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="hidden sm:inline">Arraste para os lados para ver todas as colunas</span>
                <span className="sm:hidden">Arraste para os lados</span>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="h-10 bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 text-sm">
                  Limpar Filtros
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Container kanban com scroll horizontal */}
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="absolute right-0 top-0 bottom-6 w-20 bg-gradient-to-l from-blue-50/80 to-transparent pointer-events-none z-10 hidden lg:block" />

        <div className="kanban-scroll-container overflow-x-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="flex gap-6 min-w-max">
            {statusOptions.filter(status =>
              statusFilter.length === 0 || statusFilter.includes(status)
            ).map((status, columnIndex) => {
              const columnProcesses = getProcessesForColumn(status);
              const isDragOver = dragOverColumn === status;
              return (
                <motion.div
                  key={status}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: columnIndex * 0.05, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className="flex-shrink-0 w-[340px]"
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnColumn(e, status)}
                >
                  <Card className={`h-full glass-card border-t-4 transition-all duration-200 ${getStatusColor(status, true)} ${isDragOver ? 'ring-2 ring-purple-400 ring-offset-2 scale-[1.01]' : ''}`}>
                    <CardHeader className="pb-3 pt-4 px-4 sticky top-0 bg-white/70 z-10 backdrop-blur-md rounded-t-2xl">
                      <CardTitle className="flex items-center justify-between text-lg font-bold text-slate-800">
                        <span>{status}</span>
                        <Badge variant="secondary" className="ml-2 bg-gradient-to-r from-blue-100 to-teal-100 text-blue-700 text-sm px-2.5 py-1 font-semibold">
                          {columnProcesses.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 kanban-column min-h-[200px] overflow-y-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                      <AnimatePresence initial={false} mode="popLayout">
                        {columnProcesses.map((process) => (
                          <motion.div
                            key={process.id}
                            layoutId={`process-card-${process.id}`}
                            draggable={canEditProcess(process)}
                            onDragStart={(e) => handleDragStart(e, process)}
                            onDragEnd={handleDragEnd}
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: -10 }}
                            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                            layout
                            whileHover={{ scale: 1.02, boxShadow: "0px 10px 30px rgba(0,0,0,0.15)", transition: { duration: 0.15 } }}
                            whileDrag={{ scale: 1.04, boxShadow: "0px 16px 32px rgba(0,0,0,0.2)", opacity: 0.85 }}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <Card className="process-card border-l-4 border-l-purple-500 hover:border-l-pink-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 rounded-xl">
                              <CardContent className="p-3.5">
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <h4 className="font-semibold text-base text-gray-800 leading-tight flex items-center">
                                        <FolderKanban className="h-4 w-4 mr-2 text-violet-500 shrink-0" />
                                        {process.tarefa}
                                      </h4>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="relative h-7 w-7 p-0 text-gray-500 hover:text-gray-800 hover:bg-slate-100">
                                          <MoreHorizontal className="h-4.5 w-4.5" />
                                          {unreadChats.has(process.id) && (
                                            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                                          )}
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onViewProcess(process)} className="flex items-center gap-2 cursor-pointer">
                                          <Eye className="h-4 w-4" /> Visualizar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => canEditProcess(process) && onEditProcess(process)}
                                          disabled={!canEditProcess(process)}
                                          className="flex items-center gap-2 cursor-pointer"
                                        >
                                          <Edit className="h-4 w-4" /> Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onChatProcess?.(process)} className="flex items-center gap-2 cursor-pointer text-indigo-600 focus:text-indigo-600 focus:bg-indigo-50">
                                          <span className="relative">
                                            <MessageSquare className="h-4 w-4" />
                                            {unreadChats.has(process.id) && (
                                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                                            )}
                                          </span>
                                          Chat
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {(isAdminUser || !process.created_by || process.created_by === currentUserId) && (
                                          <DropdownMenuItem onClick={() => onDeleteProcess(process.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer flex items-center gap-2">
                                            <Trash2 className="h-4 w-4" /> Excluir
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  <div className="space-y-2 text-sm text-gray-600">
                                    {process.projeto_id && (
                                      <div className="mb-2">
                                        <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full w-fit">
                                          <FolderKanban className="h-3 w-3" />
                                          {projetos.find(p => p.id === process.projeto_id)?.nome || ''}
                                        </span>
                                      </div>
                                    )}
                                    {process.grupo && (
                                      <div className="mb-2">
                                        <Badge
                                          className={`text-xs font-medium capitalize ${
                                            process.grupo === 'adm' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                                            'bg-gray-100 text-gray-800 border-gray-300'
                                          }`}
                                        >
                                          {process.grupo}
                                        </Badge>
                                      </div>
                                    )}
                                    {process.prioridade && (
                                      <div className="mb-2">
                                        <Badge className={`text-xs font-medium ${getPriorityColor(process.prioridade)}`}>
                                          {process.prioridade}
                                        </Badge>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <User className="h-4 w-4 text-purple-600 shrink-0" />
                                      <span>{process.responsavel}</span>
                                    </div>
                                    {process.data_inicio && (
                                      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                        <Calendar className="h-3.5 w-3.5 shrink-0 text-green-500" />
                                        <span>Início: {new Date(process.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                      </div>
                                    )}
                                    {process.prazo && (() => {
                                      const prazoStatus = getPrazoStatus(process);
                                      return (
                                        <div className={`flex items-center gap-1.5 ${
                                          prazoStatus === 'overdue' ? 'text-red-600 font-semibold' :
                                          prazoStatus === 'today'   ? 'text-yellow-600 font-semibold' :
                                          'text-slate-600'
                                        }`}>
                                          <Calendar className="h-4 w-4 shrink-0" />
                                          <span>{new Date(process.prazo + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                      );
                                    })()}
                                    {(() => {
                                      const info = calcDiasProcesso(process);
                                      if (!info) return null;
                                      return (
                                        <div className={`text-xs font-medium mt-0.5 ${info.isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                          ⏱ {info.dias} dia{info.dias !== 1 ? 's' : ''}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {columnProcesses.length === 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`text-center py-10 rounded-xl border-2 border-dashed transition-colors duration-200 ${isDragOver ? 'border-purple-400 bg-purple-50 text-purple-500' : 'border-gray-200 text-gray-400'}`}
                        >
                          <p className="text-sm">{isDragOver ? 'Soltar aqui' : 'Nenhum processo aqui.'}</p>
                        </motion.div>
                      )}
                      <Button variant="outline" size="sm" className="w-full mt-4 border-dashed hover:bg-blue-50 hover:border-blue-300 text-blue-600" onClick={() => {
                        const baseData = { status: status, empresa: '' };
                        onAddProcessToColumn(baseData);
                      }}>
                        <PlusCircle className="h-4 w-4 mr-2"/> Adicionar Processo
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KanbanBoard;
