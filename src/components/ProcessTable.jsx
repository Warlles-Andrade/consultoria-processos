import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Filter, Eye, Edit, Trash2, Plus, Download, Upload, Calendar, MessageSquare, FileSpreadsheet, AlertTriangle, CheckCircle2, Table } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatusColor, getPriorityColor, calcDiasProcesso, getPrazoStatus } from '@/data/mockData';

import * as XLSX from 'xlsx';
import { useToast } from '@/components/ui/use-toast';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const ProcessTable = ({ 
  processes, 
  onAddProcess, 
  onEditProcess, 
  onDeleteProcess, 
  onViewProcess,

  onChatProcess,
  unreadChats = new Set(),
  statusOptions,
  responsaveisOptions,
  sortOrder,
  onSortChange,
  projetos = [],
  grupos = [],
  currentUserId,
  isAdminUser = false,
  onImportProcesses,
  userProjetoIds = [],
  canEditProcess = () => true,
}) => {
  const [searchTerm, setSearchTerm] = useLocalStorage('processTableSearchTerm', '');
  const [statusFilter, setStatusFilter] = useLocalStorage('processTableStatusFilterMulti', []);
  const [responsavelFilter, setResponsavelFilter] = useLocalStorage('processTableResponsavelFilterMulti', []);
  const [grupoFilter, setGrupoFilter] = useLocalStorage('processTableGrupoFilterMulti', []);
  const [projetoFilter, setProjetoFilter] = useLocalStorage('processTableProjetoFilterMulti', []);
  const { toast } = useToast();

  // Import/Export modal state
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importStep, setImportStep] = useState('idle'); // 'idle' | 'validating' | 'issues' | 'ready'
  const [importRows, setImportRows] = useState([]);
  const [importIssues, setImportIssues] = useState([]);
  const [importReady, setImportReady] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const uniqueGrupos = Array.from(new Set(processes.map(p => p.grupo).filter(Boolean)));

  // Projetos para o filtro: se clientes selecionados, filtra por eles
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

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter([]);
    setResponsavelFilter([]);
    setGrupoFilter([]);
    setProjetoFilter([]);
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredProcesses.map(process => ({
        'Cliente': process.grupo || '',
        'Projeto': projetos.find(p => p.id === process.projeto_id)?.nome || '',
        'Tarefa': process.tarefa || '',
        'Status': process.status || '',
        'Prioridade': process.prioridade || '',
        'Data Início': process.data_inicio ? new Date(process.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        'Dias do Processo': process.dias_processo != null ? process.dias_processo : '',
        'Responsável': process.responsavel || '',
        'Prazo': process.prazo ? new Date(process.prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        'Observações': process.observacoes || '',
        'Data de Criação': process.created_at ? new Date(process.created_at).toLocaleString('pt-BR') : '',
        'Última Alteração': process.updated_at ? new Date(process.updated_at).toLocaleString('pt-BR') : '',
        'Modificado Por': process.updated_by_name || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Processos');

      const colWidths = [
        { wch: 20 }, // Cliente
        { wch: 20 }, // Projeto
        { wch: 30 }, // Tarefa
        { wch: 15 }, // Status
        { wch: 20 }, // Responsável
        { wch: 12 }, // Prazo
        { wch: 40 }, // Observações
        { wch: 20 }, // Data de Criação
        { wch: 20 }, // Última Alteração
        { wch: 25 }, // Modificado Por
      ];
      worksheet['!cols'] = colWidths;

      const fileName = `processos_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({
        title: "Exportação Concluída!",
        description: `Arquivo ${fileName} foi baixado com sucesso.`,
        className: "bg-green-500 text-white",
      });
    } catch (error) {
      toast({
        title: "Erro na Exportação",
        description: "Não foi possível exportar os dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Cliente': 'Nome do cliente (deve estar cadastrado)',
        'Projeto': 'Nome do projeto (deve estar cadastrado)',
        'Tarefa': 'Descrição da tarefa',
        'Status': 'Em andamento',
        'Prioridade': 'Alta',
        'Data Início': '01/01/2026',
        'Responsável': 'Nome do responsável (deve estar cadastrado)',
        'Prazo': '31/12/2026',
        'Observações': 'Observações opcionais',
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 30 }, { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 12 },
      { wch: 25 }, { wch: 12 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo_importacao_processos.xlsx');
    toast({ title: 'Modelo baixado!', description: 'Preencha e importe o arquivo modelo.', className: 'bg-blue-500 text-white' });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) {
          toast({ title: 'Planilha vazia', description: 'O arquivo não contém dados para importar.', variant: 'destructive' });
          return;
        }

        // Validar cada linha
        const issues = [];
        const ready = [];

        // Mapas para lookup rápido (todas em minúsculas para comparação case-insensitive)
        const clienteMap = {};
        grupos.forEach(g => { clienteMap[g.nome.toLowerCase()] = g; });

        const projetosAcessiveis = isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id));
        const projetoMap = {};
        projetosAcessiveis.forEach(p => { projetoMap[p.nome.toLowerCase()] = p; });

        const responsavelMap = {};
        // responsaveisOptions pode ser array de strings (nomes) ou array de objetos com .name
        responsaveisOptions.forEach(r => {
          const nome = typeof r === 'string' ? r : r.name;
          if (nome) responsavelMap[nome.toLowerCase()] = nome;
        });

        rows.forEach((row, idx) => {
          const linha = idx + 2; // linha 1 = cabeçalho
          const rowIssues = [];

          const clienteNome = String(row['Cliente'] || '').trim();
          const projetoNome = String(row['Projeto'] || '').trim();
          const tarefa = String(row['Tarefa'] || '').trim();
          const responsavelNome = String(row['Responsável'] || '').trim();

          if (!tarefa) rowIssues.push('Tarefa não informada');

          const clienteObj = clienteNome ? clienteMap[clienteNome.toLowerCase()] : null;
          if (clienteNome && !clienteObj) rowIssues.push(`Cliente "${clienteNome}" não encontrado`);

          const projetoObj = projetoNome ? projetoMap[projetoNome.toLowerCase()] : null;
          if (projetoNome && !projetoObj) rowIssues.push(`Projeto "${projetoNome}" não encontrado`);

          // Validar que o projeto pertence ao cliente (quando ambos informados)
          if (clienteObj && projetoObj && projetoObj.cliente_id !== clienteObj.id) {
            rowIssues.push(`Projeto "${projetoNome}" não pertence ao cliente "${clienteNome}"`);
          }

          const responsavelMatch = responsavelNome ? responsavelMap[responsavelNome.toLowerCase()] : null;
          if (responsavelNome && !responsavelMatch) rowIssues.push(`Responsável "${responsavelNome}" não encontrado`);

          // Validar status
          const statusRaw = String(row['Status'] || '').trim();
          const statusValido = statusRaw ? statusOptions.find(s => s.toLowerCase() === statusRaw.toLowerCase()) : null;
          if (statusRaw && !statusValido) rowIssues.push(`Status "${statusRaw}" inválido (use: ${statusOptions.join(', ')})`);

          // Parsear prazo
          let prazoISO = null;
          let prazoDisplay = String(row['Prazo'] || '').trim();
          if (prazoDisplay) {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(prazoDisplay)) {
              const [d, m, y] = prazoDisplay.split('/');
              prazoISO = `${y}-${m}-${d}`;
            } else if (/^\d{4}-\d{2}-\d{2}/.test(prazoDisplay)) {
              prazoISO = prazoDisplay.substring(0, 10);
              const [y, m, d] = prazoISO.split('-');
              prazoDisplay = `${d}/${m}/${y}`;
            } else {
              const num = Number(prazoDisplay);
              if (!isNaN(num) && num > 0) {
                const date = XLSX.SSF.parse_date_code(num);
                if (date) {
                  prazoISO = `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
                  prazoDisplay = `${String(date.d).padStart(2,'0')}/${String(date.m).padStart(2,'0')}/${date.y}`;
                } else {
                  rowIssues.push(`Prazo "${prazoDisplay}" em formato inválido (use dd/mm/aaaa)`);
                }
              } else {
                rowIssues.push(`Prazo "${prazoDisplay}" em formato inválido (use dd/mm/aaaa)`);
              }
            }
          }

          const prioridadeRaw = String(row['Prioridade'] || '').trim();
          const prioridadeValida = ['Alta', 'Média', 'Baixa'].find(p => p.toLowerCase() === prioridadeRaw.toLowerCase()) || 'Média';

          // Parsear data_inicio
          let dataInicioISO = null;
          const dataInicioRaw = String(row['Data Início'] || '').trim();
          if (dataInicioRaw) {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataInicioRaw)) {
              const [d, m, y] = dataInicioRaw.split('/');
              dataInicioISO = `${y}-${m}-${d}`;
            } else if (/^\d{4}-\d{2}-\d{2}/.test(dataInicioRaw)) {
              dataInicioISO = dataInicioRaw.substring(0, 10);
            }
          }

          const processado = {
            tarefa,
            grupo: clienteObj?.nome || clienteNome || '',
            projeto_id: projetoObj?.id || null,
            status: statusValido || 'Em andamento',
            prioridade: prioridadeValida,
            data_inicio: dataInicioISO,
            responsavel_nome: responsavelMatch || responsavelNome || '',
            prazo: prazoISO,
            observacoes: String(row['Observações'] || '').trim(),
          };

          if (rowIssues.length > 0) {
            issues.push({ linha, rowIssues, fields: {
              cliente: clienteNome,
              projeto: projetoNome,
              tarefa,
              responsavel: responsavelNome,
              status: statusValido || statusRaw || 'Em andamento',
              prioridade: prioridadeValida,
              prazo: prazoDisplay,
              observacoes: String(row['Observações'] || '').trim(),
            }});
          } else {
            ready.push(processado);
          }
        });

        setImportRows(rows);
        setImportIssues(issues);
        setImportReady(ready);
        setImportStep(issues.length > 0 ? 'issues' : 'ready');
      } catch (err) {
        toast({ title: 'Erro ao ler arquivo', description: err.message, variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (!onImportProcesses || importReady.length === 0) return;
    setIsImporting(true);
    try {
      await onImportProcesses(importReady);
      toast({ title: `${importReady.length} processo(s) importado(s)!`, className: 'bg-green-500 text-white' });
      setIsImportExportOpen(false);
      setImportStep('idle');
      setImportRows([]);
      setImportIssues([]);
      setImportReady([]);
    } catch (err) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const updateIssueField = (index, field, value) => {
    setImportIssues(prev => prev.map((item, i) =>
      i === index ? { ...item, fields: { ...item.fields, [field]: value } } : item
    ));
  };

  const revalidateIssues = () => {
    const clienteMap = {};
    grupos.forEach(g => { clienteMap[g.nome.toLowerCase()] = g; });
    const projetosAcessiveis = isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id));
    const projetoMap = {};
    projetosAcessiveis.forEach(p => { projetoMap[p.nome.toLowerCase()] = p; });
    const responsavelMap = {};
    responsaveisOptions.forEach(r => {
      const nome = typeof r === 'string' ? r : r.name;
      if (nome) responsavelMap[nome.toLowerCase()] = nome;
    });

    const stillIssues = [];
    const nowReady = [...importReady];

    importIssues.forEach(issue => {
      const f = issue.fields;
      const rowIssues = [];

      if (!f.tarefa.trim()) rowIssues.push('Tarefa não informada');

      const clienteObj = f.cliente ? clienteMap[f.cliente.toLowerCase()] : null;
      if (f.cliente && !clienteObj) rowIssues.push(`Cliente "${f.cliente}" não encontrado`);

      const projetoObj = f.projeto ? projetoMap[f.projeto.toLowerCase()] : null;
      if (f.projeto && !projetoObj) rowIssues.push(`Projeto "${f.projeto}" não encontrado`);

      if (clienteObj && projetoObj && projetoObj.cliente_id !== clienteObj.id) {
        rowIssues.push(`Projeto "${f.projeto}" não pertence ao cliente "${f.cliente}"`);
      }

      const responsavelMatch = f.responsavel ? responsavelMap[f.responsavel.toLowerCase()] : null;
      if (f.responsavel && !responsavelMatch) rowIssues.push(`Responsável "${f.responsavel}" não encontrado`);

      const statusValido = f.status ? statusOptions.find(s => s.toLowerCase() === f.status.toLowerCase()) : null;
      if (f.status && !statusValido) rowIssues.push(`Status "${f.status}" inválido (use: ${statusOptions.join(', ')})`);

      let prazoISO = null;
      const prazoRaw = (f.prazo || '').trim();
      if (prazoRaw) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(prazoRaw)) {
          const [d, m, y] = prazoRaw.split('/');
          prazoISO = `${y}-${m}-${d}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(prazoRaw)) {
          prazoISO = prazoRaw.substring(0, 10);
        } else {
          const num = Number(prazoRaw);
          if (!isNaN(num) && num > 0) {
            const date = XLSX.SSF.parse_date_code(num);
            if (date) prazoISO = `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
            else rowIssues.push(`Prazo "${prazoRaw}" em formato inválido (use dd/mm/aaaa)`);
          } else {
            rowIssues.push(`Prazo "${prazoRaw}" em formato inválido (use dd/mm/aaaa)`);
          }
        }
      }

      if (rowIssues.length > 0) {
        stillIssues.push({ ...issue, rowIssues });
      } else {
        const prioridadeCorrigida = ['Alta', 'Média', 'Baixa'].find(p => p.toLowerCase() === (f.prioridade || '').toLowerCase()) || 'Média';
        let dataInicioCorrigida = null;
        const diRaw = (f.data_inicio || '').trim();
        if (diRaw) {
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(diRaw)) {
            const [d, m, y] = diRaw.split('/');
            dataInicioCorrigida = `${y}-${m}-${d}`;
          } else if (/^\d{4}-\d{2}-\d{2}/.test(diRaw)) {
            dataInicioCorrigida = diRaw.substring(0, 10);
          }
        }
        nowReady.push({
          tarefa: f.tarefa.trim(),
          grupo: clienteObj?.nome || f.cliente || '',
          projeto_id: projetoObj?.id || null,
          status: statusValido || 'Em andamento',
          prioridade: prioridadeCorrigida,
          data_inicio: dataInicioCorrigida,
          responsavel_nome: responsavelMatch || f.responsavel || '',
          prazo: prazoISO,
          observacoes: f.observacoes || '',
        });
      }
    });

    setImportIssues(stillIssues);
    setImportReady(nowReady);
    if (stillIssues.length === 0) {
      setImportStep('ready');
      toast({ title: 'Todos os problemas foram corrigidos!', className: 'bg-green-500 text-white' });
    } else {
      const fixed = importIssues.length - stillIssues.length;
      if (fixed > 0) {
        toast({ title: `${fixed} linha(s) corrigida(s)`, description: `${stillIssues.length} ainda com problemas.`, className: 'bg-amber-500 text-white' });
      }
    }
  };

  // Agrupar processos filtrados por grupo (cliente)
  const processesByGrupo = (() => {
    const gruposUnicos = Array.from(new Set(filteredProcesses.map(p => p.grupo).filter(Boolean)));
    
    let gruposOrdenados = [...gruposUnicos];
    switch (sortOrder) {
      case 'az':

        gruposOrdenados.sort((a, b) => (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' }));
        break;
      case 'za':
        gruposOrdenados.sort((a, b) => (b || '').localeCompare(a || '', 'pt-BR', { sensitivity: 'base' }));
        break;
      default:
        break;
    }
    
    return gruposOrdenados.map(grupo => {
      let processos = filteredProcesses.filter(p => p.grupo === grupo);
      if (sortOrder === 'prazo') {
        processos = [...processos].sort((a, b) => {
          if (!a.prazo && !b.prazo) return 0;
          if (!a.prazo) return 1;
          if (!b.prazo) return -1;
          return new Date(a.prazo) - new Date(b.prazo);
        });
      }
      return { grupo, processos };
    }).filter(group => group.processos.length > 0);
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md">
          <Table className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">Tabela</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => { setImportStep('idle'); setImportIssues([]); setImportReady([]); setIsImportExportOpen(true); }}
            variant="outline"
            className="h-8 flex items-center gap-1.5 bg-white/80 hover:bg-green-50 hover:border-green-400 border-2 text-green-700 text-sm font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Importar / Exportar
          </Button>
          <Button
            onClick={onAddProcess}
            className="h-8 text-sm bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white shadow-md hover:shadow-lg transition-all duration-300 rounded-xl font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nova Tarefa
          </Button>
        </div>
      </div>
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

          <div className="mt-2 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-medium">Ordenar por:</span>
              <Select value={sortOrder} onValueChange={onSortChange}>
                <SelectTrigger className="h-8 w-44 bg-slate-50 border-slate-300 text-sm">
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
            <Button variant="outline" onClick={clearFilters} className="h-8 bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 text-xs">
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Renderizar um quadro para cada cliente (grupo) */}
      {processesByGrupo.map(({ grupo, processos }) => (
        <Card key={grupo} className="shadow-xl bg-white/90 backdrop-blur-md border-slate-200 mb-4">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm font-semibold text-slate-700 capitalize">
              {grupo} ({processos.length} {processos.length === 1 ? 'processo' : 'processos'})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-max">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[180px]">Tarefa</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[110px]">Projeto</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[120px]">Status</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[90px]">Prioridade</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Responsável</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[100px]">Data Início</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[100px]">Prazo</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[60px]">Dias</th>
                    <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[120px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processos.map((process, index) => {
                    const prazoStatus = getPrazoStatus(process);
                    const isOverdue = prazoStatus === 'overdue';
                    return (
                      <motion.tr
                        key={process.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02, duration: 0.25 }}
                        className="hover:bg-sky-50/50 transition-colors duration-150 cursor-pointer"
                        onClick={() => onViewProcess(process)}
                      >
                        <td className="py-3 px-3">
                          <p className="font-medium text-slate-800 text-sm break-words">{process.tarefa}</p>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-sm text-slate-600">{projetos.find(p => p.id === process.projeto_id)?.nome || <span className="text-slate-400">—</span>}</span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap"><Badge className={`${getStatusColor(process.status)} text-xs font-medium`}>{process.status}</Badge></td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {process.prioridade ? (
                            <Badge className={`${getPriorityColor(process.prioridade)} text-xs font-medium`}>{process.prioridade}</Badge>
                          ) : <span className="text-slate-400 text-sm">—</span>}
                        </td>
                        <td className="py-3 px-3 text-sm text-slate-600 whitespace-nowrap">{process.responsavel}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {process.data_inicio ? (
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                              <span>{new Date(process.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {process.prazo ? (
                            <div className={`flex items-center gap-1 text-sm font-medium ${
                              prazoStatus === 'overdue' ? 'text-red-600 font-semibold' :
                              prazoStatus === 'today'   ? 'text-yellow-600 font-semibold' :
                              'text-slate-600'
                            }`}>
                              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{new Date(process.prazo + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {(() => {
                            const info = calcDiasProcesso(process);
                            if (!info) return <span className="text-slate-400 text-sm">—</span>;
                            return (
                              <span className={`text-sm font-medium ${info.isOverdue ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                                {info.dias}d
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => onViewProcess(process)} className="h-8 w-8 p-0 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-md" title="Visualizar">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEditProcess(process)}
                              disabled={!canEditProcess(process)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                              title={!canEditProcess(process) ? 'Processo travado por cadeado opcional' : 'Editar'}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onChatProcess?.(process)} className="relative h-8 w-8 p-0 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-md" title="Chat">
                              <MessageSquare className="h-4 w-4" />
                              {unreadChats.has(process.id) && (
                                <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                              )}
                            </Button>
                            {(isAdminUser || !process.created_by || process.created_by === currentUserId) && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md" title="Excluir" onClick={(e) => { e.stopPropagation(); onDeleteProcess(process.id); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {processos.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">Nenhum processo para este cliente.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Modal Import/Export */}
      <Dialog open={isImportExportOpen} onOpenChange={setIsImportExportOpen}>
        <DialogContent className={importStep === 'issues' ? 'sm:max-w-4xl' : 'sm:max-w-2xl'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              Importar / Exportar Processos
            </DialogTitle>
          </DialogHeader>

          {importStep === 'idle' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <button
                onClick={() => { downloadTemplate(); }}
                className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-blue-300 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all"
              >
                <Download className="h-10 w-10 text-blue-500" />
                <span className="font-semibold text-blue-700">Baixar Modelo</span>
                <span className="text-xs text-slate-500 text-center">Baixe a planilha modelo para preencher e importar</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-green-300 rounded-xl hover:bg-green-50 hover:border-green-400 transition-all"
              >
                <Upload className="h-10 w-10 text-green-500" />
                <span className="font-semibold text-green-700">Importar Planilha</span>
                <span className="text-xs text-slate-500 text-center">Selecione uma planilha preenchida para importar</span>
              </button>

              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />

              <div className="sm:col-span-2">
                <button
                  onClick={() => { exportToExcel(); setIsImportExportOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-sm text-slate-600"
                >
                  <Download className="h-4 w-4" />
                  Exportar dados atuais para Excel
                </button>
              </div>
            </div>
          )}

          {importStep === 'issues' && (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  <strong>{importIssues.length} linha(s)</strong> com problemas. Corrija os campos abaixo e clique em <strong>Revalidar</strong>.
                </p>
              </div>

              <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
                {importIssues.map((issue, i) => (
                  <div key={i} className="p-3 bg-white border border-red-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-xs font-bold text-slate-500">Linha {issue.linha}</span>
                      <div className="flex flex-wrap gap-1">
                        {issue.rowIssues.map((msg, j) => (
                          <span key={j} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{msg}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-slate-500">Tarefa *</label>
                        <input
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${!issue.fields.tarefa.trim() ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={issue.fields.tarefa}
                          onChange={(e) => updateIssueField(i, 'tarefa', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Cliente</label>
                        <select
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${issue.rowIssues.some(m => m.includes('Cliente')) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={issue.fields.cliente}
                          onChange={(e) => {
                            updateIssueField(i, 'cliente', e.target.value);
                            updateIssueField(i, 'projeto', '');
                          }}
                        >
                          <option value="">— Selecione —</option>
                          {grupos.map(g => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Projeto</label>
                        <select
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${issue.rowIssues.some(m => m.includes('Projeto')) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={issue.fields.projeto}
                          onChange={(e) => updateIssueField(i, 'projeto', e.target.value)}
                        >
                          <option value="">— Selecione —</option>
                          {(isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id)))
                            .filter(p => {
                              if (!issue.fields.cliente) return true;
                              const cObj = grupos.find(g => g.nome === issue.fields.cliente);
                              return cObj && p.cliente_id === cObj.id;
                            })
                            .map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Responsável</label>
                        <select
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${issue.rowIssues.some(m => m.includes('Responsável')) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={issue.fields.responsavel}
                          onChange={(e) => updateIssueField(i, 'responsavel', e.target.value)}
                        >
                          <option value="">— Selecione —</option>
                          {responsaveisOptions.map((r, idx) => {
                            const nome = typeof r === 'string' ? r : r.name;
                            return <option key={idx} value={nome}>{nome}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Status</label>
                        <select
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${issue.rowIssues.some(m => m.includes('Status')) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={statusOptions.includes(issue.fields.status) ? issue.fields.status : ''}
                          onChange={(e) => updateIssueField(i, 'status', e.target.value)}
                        >
                          {!statusOptions.includes(issue.fields.status) && (
                            <option value="" disabled>— Selecione —</option>
                          )}
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Prioridade</label>
                        <select
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={issue.fields.prioridade || 'Média'}
                          onChange={(e) => updateIssueField(i, 'prioridade', e.target.value)}
                        >
                          <option value="Alta">Alta</option>
                          <option value="Média">Média</option>
                          <option value="Baixa">Baixa</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Prazo</label>
                        <input
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${issue.rowIssues.some(m => m.includes('Prazo')) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          value={issue.fields.prazo}
                          onChange={(e) => updateIssueField(i, 'prazo', e.target.value)}
                          placeholder="dd/mm/aaaa"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {importReady.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm text-green-800">
                    <strong>{importReady.length} linha(s)</strong> já estão prontas para importação.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setImportStep('idle'); setImportIssues([]); setImportReady([]); }}>
                  Voltar
                </Button>
                <Button onClick={revalidateIssues} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Revalidar correções
                </Button>
                {importReady.length > 0 && (
                  <Button onClick={handleConfirmImport} disabled={isImporting} className="bg-green-600 hover:bg-green-700 text-white">
                    {isImporting ? 'Importando...' : `Importar ${importReady.length} válido(s)`}
                  </Button>
                )}
              </div>
            </div>
          )}

          {importStep === 'ready' && (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  Tudo certo! <strong>{importReady.length} processo(s)</strong> prontos para importar.
                </p>
              </div>

              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left p-2 border-b">Tarefa</th>
                      <th className="text-left p-2 border-b">Cliente</th>
                      <th className="text-left p-2 border-b">Responsável</th>
                      <th className="text-left p-2 border-b">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importReady.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="p-2">{row.tarefa}</td>
                        <td className="p-2">{row.grupo}</td>
                        <td className="p-2">{row.responsavel_nome}</td>
                        <td className="p-2">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setImportStep('idle'); setImportReady([]); }}>
                  Voltar
                </Button>
                <Button onClick={handleConfirmImport} disabled={isImporting} className="bg-green-600 hover:bg-green-700 text-white">
                  {isImporting ? 'Importando...' : `Confirmar importação`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProcessTable;
