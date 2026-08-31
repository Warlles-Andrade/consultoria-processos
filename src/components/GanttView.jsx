import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Search, Filter, ChevronLeft, ChevronRight, CalendarDays, AlertCircle, GanttChartSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { getPriorityColor, getStatusColor } from '@/data/mockData';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const STATUS_COLORS = {
  'Não Iniciado': 'bg-slate-400',
  'Em Andamento': 'bg-blue-500',
  'Paralisado': 'bg-orange-400',
  'Concluído': 'bg-green-500',
};

const DAY_PX = 28; // pixels por dia

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function diffDays(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export default function GanttView({
  processes = [],
  projetos = [],
  grupos = [],
  responsaveisOptions = [],
  statusOptions = [],
  isAdminUser = false,
  onViewProcess,
  ganttEnabledForAll = false,
  onToggleGanttForAll,
}) {
  // Filtros sincronizados com tabela/kanban
  const [searchTerm, setSearchTerm] = useLocalStorage('processTableSearchTerm', '');
  const [statusFilter, setStatusFilter] = useLocalStorage('processTableStatusFilterMulti', []);
  const [responsavelFilter, setResponsavelFilter] = useLocalStorage('processTableResponsavelFilterMulti', []);
  const [grupoFilter, setGrupoFilter] = useLocalStorage('processTableGrupoFilterMulti', []);
  const [projetoFilter, setProjetoFilter] = useLocalStorage('processTableProjetoFilterMulti', []);

  // Navegação de período
  const today = startOfDay(new Date());
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date(today);
    d.setDate(1);
    return d;
  });
  const [viewMonths, setViewMonths] = useState(3);

  const viewEnd = useMemo(() => addDays(viewStart, viewMonths * 30), [viewStart, viewMonths]);
  const totalDays = useMemo(() => diffDays(viewStart, viewEnd), [viewStart, viewEnd]);

  // Cascata de filtros
  const clienteIdsForFilter = grupoFilter.length > 0
    ? grupos.filter(g => grupoFilter.includes(g.nome)).map(g => g.id)
    : [];
  const projetosParaFiltro = clienteIdsForFilter.length > 0
    ? projetos.filter(p => clienteIdsForFilter.includes(p.cliente_id))
    : projetos;
  const responsaveisParaFiltro = grupoFilter.length > 0
    ? Array.from(new Set(
        processes.filter(p => grupoFilter.includes(p.grupo)).map(p => p.responsavel).filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    : responsaveisOptions;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter([]);
    setResponsavelFilter([]);
    setGrupoFilter([]);
    setProjetoFilter([]);
  };

  // Todos os processos que passam pelos filtros (com ou sem datas)
  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      const matchSearch =
        (p.tarefa?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.responsavel?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter.length === 0 || statusFilter.includes(p.status);
      const matchResp = responsavelFilter.length === 0 || responsavelFilter.includes(p.responsavel);
      const matchGrupo = grupoFilter.length === 0 || grupoFilter.includes(p.grupo);
      const matchProjeto = projetoFilter.length === 0 || projetoFilter.includes(p.projeto_id);
      return matchSearch && matchStatus && matchResp && matchGrupo && matchProjeto;
    });
  }, [processes, searchTerm, statusFilter, responsavelFilter, grupoFilter, projetoFilter]);

  const hasActiveFilters = searchTerm || statusFilter.length > 0 || responsavelFilter.length > 0 || grupoFilter.length > 0 || projetoFilter.length > 0;

  // Cabeçalho: meses e dias
  const headerMonths = useMemo(() => {
    const months = [];
    let cur = new Date(viewStart);
    while (cur < viewEnd) {
      const monthStart = new Date(cur);
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const monthEnd = nextMonth < viewEnd ? nextMonth : viewEnd;
      const days = diffDays(monthStart > viewStart ? monthStart : viewStart, monthEnd);
      months.push({
        label: `${MONTHS_FULL[cur.getMonth()]} ${cur.getFullYear()}`,
        days,
      });
      cur = nextMonth;
    }
    return months;
  }, [viewStart, viewEnd]);

  const headerDays = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = addDays(viewStart, i);
      return { day: d.getDate(), weekday: d.getDay(), date: d };
    });
  }, [viewStart, totalDays]);

  const todayOffset = useMemo(() => diffDays(viewStart, today), [viewStart, today]);

  function getBarProps(process) {
    const start = process.data_inicio ? startOfDay(new Date(process.data_inicio + 'T00:00:00')) : null;
    const end = process.prazo ? startOfDay(new Date(process.prazo + 'T00:00:00')) : null;

    // Se só tem uma das datas, usa a mesma para início e fim (barra de 1 dia)
    const barStart = start || end;
    const barEnd = end || start;

    const leftDay = diffDays(viewStart, barStart);
    const widthDays = Math.max(1, diffDays(barStart, barEnd) + 1);

    const left = leftDay * DAY_PX;
    const width = widthDays * DAY_PX;

    // Visível na janela?
    const visible = leftDay < totalDays && leftDay + widthDays > 0;
    return { left, width, visible, barStart, barEnd };
  }

  const navigate = (direction) => {
    setViewStart(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + direction * Math.max(1, Math.floor(viewMonths / 2)));
      d.setDate(1);
      return d;
    });
  };

  const goToToday = () => {
    const d = new Date(today);
    d.setDate(1);
    setViewStart(d);
  };

  const ROW_H = 40;
  const LABEL_W = 280;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 shadow-md">
            <GanttChartSquare className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Cronograma</h1>
        </div>
        {isAdminUser && (
          <button
            onClick={() => onToggleGanttForAll?.(!ganttEnabledForAll)}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              ganttEnabledForAll
                ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100'
                : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors duration-200 ${
              ganttEnabledForAll ? 'bg-teal-500 border-teal-500' : 'bg-slate-200 border-slate-200'
            }`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                ganttEnabledForAll ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </span>
            Ativar para todos os usuários
          </button>
        )}
      </div>
      {/* Filtros */}
      <Card className="glass-card border-white/60 rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 shadow-sm">
              <Filter className="h-4 w-4 text-white" />
            </div>
            Filtros e Busca
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="relative lg:col-span-2 xl:col-span-2">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Buscar por tarefa, responsável..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-11 bg-white/80 focus:bg-white border-2 border-slate-200 focus:border-purple-400 rounded-xl text-base"
              />
            </div>
            {isAdminUser && (
              <MultiSelect
                value={grupoFilter}
                onValueChange={(v) => { setGrupoFilter(v); setProjetoFilter([]); setResponsavelFilter([]); }}
                placeholder="Filtrar por Cliente"
                options={grupos.map(g => ({ value: g.nome, label: g.nome }))}
                className="h-11 bg-white/80 border-2 border-slate-200 focus:border-purple-400 rounded-xl text-base"
              />
            )}
            <MultiSelect
              value={projetoFilter}
              onValueChange={setProjetoFilter}
              placeholder="Filtrar por Projeto"
              options={projetosParaFiltro.map(p => ({ value: p.id, label: p.nome }))}
              className="h-11 bg-white/80 border-2 border-slate-200 focus:border-purple-400 rounded-xl text-base"
            />
            <MultiSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Filtrar por Status"
              options={statusOptions.map(s => ({ value: s, label: s }))}
              className="h-11 bg-slate-50 border-slate-300 text-base"
            />
            <MultiSelect
              value={responsavelFilter}
              onValueChange={setResponsavelFilter}
              placeholder="Responsável"
              options={responsaveisParaFiltro.map(r => ({ value: r, label: r }))}
              className="h-11 bg-slate-50 border-slate-300 text-base"
            />
          </div>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            {/* Controles de navegação */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="h-9 px-3">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday} className="h-9 px-3 text-sm font-medium">
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(1)} className="h-9 px-3">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-slate-700 ml-1">
                {MONTHS_FULL[viewStart.getMonth()]} {viewStart.getFullYear()}
              </span>
              <Select value={String(viewMonths)} onValueChange={(v) => setViewMonths(Number(v))}>
                <SelectTrigger className="h-9 w-36 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 mês</SelectItem>
                  <SelectItem value="2">2 meses</SelectItem>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="h-9 bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 text-sm">
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gantt */}
      <Card className="glass-card border-white/60 rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          {filteredProcesses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <AlertCircle className="h-10 w-10" />
              <p className="text-base font-medium">Nenhum processo encontrado.</p>
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              <div style={{ minWidth: LABEL_W + totalDays * DAY_PX }}>
                {/* Cabeçalho fixo */}
                <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
                  {/* Linha de meses */}
                  <div className="flex" style={{ marginLeft: LABEL_W }}>
                    {headerMonths.map((m, i) => (
                      <div
                        key={i}
                        className="border-l border-slate-200 text-xs font-bold text-slate-600 px-2 py-1.5 bg-slate-50 truncate"
                        style={{ width: m.days * DAY_PX }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                  {/* Linha de dias */}
                  <div className="flex" style={{ marginLeft: LABEL_W }}>
                    {headerDays.map((d, i) => {
                      const isToday = i === todayOffset;
                      const isSun = d.weekday === 0;
                      const isSat = d.weekday === 6;
                      return (
                        <div
                          key={i}
                          className={`flex-shrink-0 border-l text-center text-xs py-1 select-none
                            ${isToday ? 'bg-purple-600 text-white font-bold' : isSun || isSat ? 'bg-slate-100 text-slate-400' : 'text-slate-500 border-slate-200'}
                          `}
                          style={{ width: DAY_PX }}
                        >
                          {d.day}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Linhas de processos */}
                {filteredProcesses.map((process, rowIdx) => {
                  const hasDates = process.data_inicio || process.prazo;
                  const { left, width, visible } = hasDates ? getBarProps(process) : { left: 0, width: 0, visible: false };
                  const statusColor = STATUS_COLORS[process.status] || 'bg-slate-400';
                  const isOverdue = process.prazo && new Date(process.prazo + 'T00:00:00') < today && process.status !== 'Concluído';
                  const projeto = projetos.find(p => p.id === process.projeto_id) ||
                    (process.projeto_id ? { nome: process.projeto_nome || '' } : null);

                  return (
                    <motion.div
                      key={process.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: rowIdx * 0.02, duration: 0.2 }}
                      className={`flex items-center border-b border-slate-100 hover:bg-purple-50/40 transition-colors group ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                      style={{ height: ROW_H }}
                    >
                      {/* Label fixo */}
                      <div
                        className="flex-shrink-0 sticky left-0 z-10 flex items-center gap-2 px-3 bg-inherit border-r border-slate-200 h-full cursor-pointer"
                        style={{ width: LABEL_W }}
                        onClick={() => onViewProcess?.(process)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-purple-700 transition-colors">
                            {process.tarefa}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {projeto && (
                              <span className="text-[10px] text-violet-600 truncate max-w-[100px]">{projeto.nome}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0 rounded-full text-white leading-4 ${statusColor}`}>
                              {process.status}
                            </span>
                            {isOverdue && <span className="text-[10px] text-red-500 font-bold">Atrasado</span>}
                          </div>
                        </div>
                      </div>

                      {/* Área da barra */}
                      <div className="relative flex-1 h-full" style={{ width: totalDays * DAY_PX }}>
                        {/* Linhas de dia de fundo */}
                        {headerDays.map((d, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-l ${d.weekday === 0 || d.weekday === 6 ? 'border-slate-200 bg-slate-100/40' : 'border-slate-100'}`}
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        ))}

                        {/* Linha "Hoje" */}
                        {todayOffset >= 0 && todayOffset < totalDays && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-10 opacity-70"
                            style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }}
                          />
                        )}

                        {/* Barra */}
                        {visible && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 rounded-md cursor-pointer shadow-sm hover:shadow-md transition-shadow flex items-center px-2 overflow-hidden
                              ${isOverdue ? 'ring-2 ring-red-400' : ''}
                              ${statusColor} opacity-90 hover:opacity-100`}
                            style={{
                              left: Math.max(0, left),
                              width: Math.min(width, totalDays * DAY_PX - Math.max(0, left)),
                              height: 24,
                            }}
                            onClick={() => onViewProcess?.(process)}
                            title={`${process.tarefa} — ${process.responsavel}`}
                          >
                            <span className="text-white text-[10px] font-semibold truncate select-none">
                              {process.tarefa}
                            </span>
                          </div>
                        )}
                        {/* Sem datas: indicador pontilhado */}
                        {!hasDates && (
                          <div className="absolute inset-0 flex items-center px-2">
                            <div className="h-px w-full border-t-2 border-dashed border-slate-300" />
                            <span className="absolute left-2 text-[10px] text-slate-400 italic">Sem datas</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className="glass-card border-white/60 rounded-2xl">
        <CardContent className="py-3 px-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Legenda:</span>
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={`h-3 w-6 rounded-sm ${color}`} />
                <span className="text-xs text-slate-600">{status}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-0.5 bg-purple-500" />
              <span className="text-xs text-slate-600">Hoje</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-6 rounded-sm bg-blue-500 ring-2 ring-red-400" />
              <span className="text-xs text-slate-600">Atrasado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-px w-6 border-t-2 border-dashed border-slate-300" />
              <span className="text-xs text-slate-600">Sem datas</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
