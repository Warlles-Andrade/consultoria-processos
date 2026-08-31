import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import Dashboard from '@/components/Dashboard';
import KanbanBoard from '@/components/KanbanBoard';
import GanttView from '@/components/GanttView';
import ProcessTable from '@/components/ProcessTable';
import ProcessForm from '@/components/ProcessForm';
import ProcessDetailModal from '@/components/ProcessDetailModal';
import ProcessChat from '@/components/ProcessChat';
import ConfirmDialog from '@/components/ConfirmDialog';
import ResponsaveisManagement from '@/components/ResponsaveisManagement';
import GruposManagement from '@/components/GruposManagement';
import ProjetosManagement from '@/components/ProjetosManagement';
import UserManagement from '@/components/UserManagement';
import RecurringTasksView from '@/components/RecurringTasksView';
import ContribuintesManagement from '@/components/ContribuintesManagement';
import CreditosView from '@/components/CreditosView';
import HabilitacoesView from '@/components/HabilitacoesView';
import PerdcompsView from '@/components/PerdcompsView';
import ContenciosoView from '@/components/ContenciosoView';
import PrazosView from '@/components/PrazosView';
import FiscalDashboard from '@/components/FiscalDashboard';
import Sidebar from '@/components/Sidebar';
import { statusOptions } from '@/data/mockData';
import { Loader2, Clock, UserCheck, AlertCircle, Lock, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import Login from '@/components/Login';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getPublicErrorMessage } from '@/lib/errorMessages';

function PasswordField({ label, value, onChange, placeholder }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full h-10 pl-3 pr-10 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={isVisible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          title={isVisible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function App() {
  const clearRecoveryTokenFromUrl = useCallback((keepRecoveryMode = false) => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('token_hash');
    url.searchParams.delete('code');
    url.searchParams.delete('access_token');
    url.searchParams.delete('refresh_token');

    if (keepRecoveryMode) {
      url.searchParams.set('type', 'recovery');
    } else {
      url.searchParams.delete('type');
    }

    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  }, []);

  const isRecoveryFlow = useCallback(() => {
    if (typeof window === 'undefined') return false;

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
  }, []);

  const [processes, setProcesses] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [projetos, setProjetos] = useState([]); // todos os projetos (para o formulário)
  const [grupos, setGrupos] = useState([]); // clientes (tabela grupos)
  const [userProjetoIds, setUserProjetoIds] = useState([]); // projetos acessíveis ao usuário atual
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useLocalStorage('activeTab', 'dashboard');
  const [sortOrder, setSortOrder] = useLocalStorage('processSortOrder', 'az'); // Padrão: ordem alfabética
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  
  // Estado para controlar o colapso da sidebar
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const [selectedProcess, setSelectedProcess] = useState(null);
  const [processToDelete, setProcessToDelete] = useState(null);
  const [chatProcess, setChatProcess] = useState(null);
  const [unreadChats, setUnreadChats] = useState(new Set());
  const { toast } = useToast();

  const [usuario, setUsuario] = useState(null);
  const [authView, setAuthView] = useState(() => (isRecoveryFlow() ? 'recovery' : 'login'));
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [userProfile, setUserProfile] = useState(null); // Perfil com grupo do usuário

  const canEditProcess = useCallback((process) => {
    return !!process;
  }, []);

  const fetchData = useCallback(async (showToast = false, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      // Buscar perfil do usuário para obter o grupo
      let userGrupo = null;
      let userProfileId = null;
      if (usuario?.id) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, grupo, nome, user_id')
          .eq('user_id', usuario.id)
          .single();
        
        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Erro ao buscar perfil:', profileError);
        } else if (profileData) {
          userGrupo = profileData.grupo;
          userProfileId = profileData.id;
          setUserProfile(profileData);
        }
      }

      // Buscar perfis diretamente da tabela (confiável para o campo ativo) e enriquecer com email via RPC
      const { data: profilesRaw, error: profilesRawError } = await supabase
        .from('user_profiles')
        .select('id, user_id, nome, grupo, ativo');
      if (profilesRawError) throw profilesRawError;

      const { data: usersRaw, error: usersError } = await supabase
        .rpc('get_user_profiles_with_email');
      if (usersError) throw usersError;
      const emailMap = {};
      (usersRaw || []).forEach(u => { emailMap[u.user_id] = u.email; });

      const activeUsers = (profilesRaw || [])
        .filter(u => u.ativo !== false)
        .map(u => ({ ...u, email: emailMap[u.user_id] || null }));

      // Buscar relação user_profile ↔ projetos (many-to-many)
      const { data: allUserProjetosRaw } = await supabase
        .from('user_projetos')
        .select('user_profile_id, projeto_id');
      const userProjetoMap = {};
      (allUserProjetosRaw || []).forEach(up => {
        if (!userProjetoMap[up.user_profile_id]) userProjetoMap[up.user_profile_id] = [];
        userProjetoMap[up.user_profile_id].push(up.projeto_id);
      });

      // Buscar todos os projetos (para o formulário)
      const { data: projetosRaw } = await supabase
        .from('projetos')
        .select('id, nome, cliente_id')
        .order('nome', { ascending: true });
      const projetosData = projetosRaw || [];
      setProjetos(projetosData);

      // Buscar clientes para o filtro global, excluindo o grupo de administradores
      const { data: gruposRaw } = await supabase
        .from('clientes')
        .select('id, nome')
        .neq('nome', 'adm')
        .order('nome', { ascending: true });
      setGrupos(gruposRaw || []);

      // Derivar projetos acessíveis ao usuário atual a partir de allUserProjetosRaw
      let acessoProjetoIds = [];
      if (userGrupo && userGrupo !== 'adm' && userProfileId) {
        acessoProjetoIds = userProjetoMap[userProfileId] || [];
        setUserProjetoIds(acessoProjetoIds);
      } else if (userGrupo === 'adm') {
        setUserProjetoIds([]); // ADM não precisa de filtro
      }

      // Buscar processos
      const { data: processesRaw, error: processesError } = await supabase
        .from('processos')
        .select(`*, responsavel:responsaveis(nome)`)
        .order('created_at', { ascending: false });
      if (processesError) throw processesError;

      const responsaveisData = activeUsers.map(u => ({
        id: u.id,
        name: u.nome,
        email: u.email || null,
        grupo: u.grupo,
        projeto_ids: userProjetoMap[u.id] || [],
        user_id: u.user_id || null,
      }));
      setResponsaveis(responsaveisData);

      // Mapear processos
      let processesData = processesRaw.map(p => ({
        ...p,
        responsavel: p.responsavel?.nome || p.responsavel_nome || 'Sem responsável',
        grupo: p.grupo || ''
      }));

      // Filtrar processos por acesso
      if (userGrupo && userGrupo !== 'adm') {
        // Derivar os clientes do usuário a partir dos projetos acessíveis
        const userClienteIds = [...new Set(
          projetosData.filter(p => acessoProjetoIds.includes(p.id)).map(p => p.cliente_id)
        )];
        const userClienteNomes = (gruposRaw || []).filter(g => userClienteIds.includes(g.id)).map(g => g.nome);
        // Incluir também o grupo principal do perfil
        if (userGrupo && !userClienteNomes.includes(userGrupo)) {
          userClienteNomes.push(userGrupo);
        }
        processesData = processesData.filter(p => {
          if (p.projeto_id) return acessoProjetoIds.includes(p.projeto_id);
          return userClienteNomes.includes(p.grupo); // fallback para processos sem projeto
        });
      }
      setProcesses(processesData);

      // Buscar configuração global do Gantt
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'gantt_enabled_for_all')
        .single();
      if (settingsData) {
        setGanttEnabledForAll(settingsData.value === 'true');
      }

      if (showToast) {
        toast({
          title: "Dados Sincronizados",
          description: "Os dados foram atualizados com sucesso.",
          className: "bg-green-500 text-white",
        });
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Erro ao Carregar Dados", description: getPublicErrorMessage(error), variant: "destructive" });
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [toast, usuario]); // Mantendo dependência do usuario para filtrar corretamente
  
  
  // Fetch inicial apenas quando o usuário está carregado
  useEffect(() => {
    if (usuario !== null) { // null significa ainda carregando, então aguarda
      fetchData(false, true); // Primeiro carregamento com loading
    }
  }, [usuario, fetchData]);

  useEffect(() => {
    if (!processes.length || !usuario) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const candidatos = processes.filter((process) =>
      process.data_inicio &&
      process.status === 'NÃ£o Iniciado' &&
      new Date(process.data_inicio + 'T00:00:00') <= hoje
    );

    if (candidatos.length === 0) return;

    const now = new Date().toISOString();
    const atualizacoes = candidatos.map((process) =>
      supabase
        .from('processos')
        .update({
          status: 'Em Andamento',
          updated_by: usuario?.id || null,
          updated_by_name: userProfile?.nome || usuario?.email || 'Sistema',
          updated_at: now,
        })
        .eq('id', process.id)
    );

    Promise.all(atualizacoes).then(() => {
      fetchData(false, false);
    });
  }, [processes, usuario, userProfile?.nome, fetchData]);

  useEffect(() => {
    const initializeAuth = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get('token_hash');
      const recoveryType = searchParams.get('type');

      if (tokenHash && recoveryType === 'recovery') {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });

        if (error || !data?.user) {
          clearRecoveryTokenFromUrl(false);
          setAuthView('login');
          setRecoveryEmail('');
          setUsuario(null);
          toast({
            title: 'Link invalido ou expirado',
            description: 'Solicite um novo link para redefinir sua senha.',
            variant: 'destructive',
          });
          return;
        }

        clearRecoveryTokenFromUrl(true);
        setRecoveryEmail(data.user.email || '');
        setAuthView('recovery');
        setUsuario(null);
        return;
      }

      // Verificar sessão ativa ao carregar a página (ex: refresh)
      // Também verifica se o usuário continua ativo
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user ?? null;
      if (user) {
        if (isRecoveryFlow()) {
          setRecoveryEmail(user.email || '');
          setAuthView('recovery');
          setUsuario(null);
          return;
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('ativo')
          .eq('user_id', user.id)
          .single();
        if (profile?.ativo === false) {
          await supabase.auth.signOut();
          setUsuario(null);
        } else {
          setUsuario(user);
        }
      } else {
        setUsuario(null);
      }
    };

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryEmail(session?.user?.email || '');
        setAuthView('recovery');
        setUsuario(null);
        return;
      }

      if (!session) {
        setAuthView('login');
        setRecoveryEmail('');
        setUsuario(null);
      }
    });
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [clearRecoveryTokenFromUrl, isRecoveryFlow, toast]);

  // Verificar mensagens não lidas ao carregar processos
  useEffect(() => {
    if (!usuario || processes.length === 0) return;

    const checkUnread = async () => {
      try {
        const processIds = processes.map(p => p.id);
        const { data } = await supabase
          .from('process_messages')
          .select('process_id, created_at, user_id')
          .in('process_id', processIds)
          .order('created_at', { ascending: false });

        if (!data) return;

        // Pega a mensagem mais recente por processo
        const latestByProcess = {};
        for (const msg of data) {
          if (!latestByProcess[msg.process_id]) {
            latestByProcess[msg.process_id] = msg;
          }
        }

        const newUnread = new Set();
        for (const [processId, msg] of Object.entries(latestByProcess)) {
          if (msg.user_id === usuario.id) continue; // mensagem minha, não conta
          const key = `chatLastRead_${usuario.id}_${processId}`;
          const lastRead = localStorage.getItem(key);
          if (!lastRead || new Date(msg.created_at) > new Date(lastRead)) {
            newUnread.add(processId);
          }
        }
        setUnreadChats(newUnread);
      } catch (err) {
        console.error('Erro ao verificar mensagens não lidas:', err);
      }
    };

    checkUnread();

    // Subscription para novas mensagens em tempo real
    const channel = supabase
      .channel('app_process_messages_unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'process_messages' },
        (payload) => {
          const { process_id, user_id } = payload.new;
          if (user_id === usuario.id) return; // própria mensagem
          setChatProcess(prev => {
            if (prev?.id === process_id) {
              // Chat aberto, marcar como lido imediatamente
              const key = `chatLastRead_${usuario.id}_${process_id}`;
              localStorage.setItem(key, new Date().toISOString());
              return prev;
            }
            // Marcar como não lido
            setUnreadChats(prevUnread => new Set([...prevUnread, process_id]));
            return prev;
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [usuario, processes]);

  const handleViewProcessesByStatus = (status) => {
    localStorage.setItem('processTableStatusFilterMulti', JSON.stringify(status ? [status] : []));
    setActiveTab('table');
  };

  const handleAddProcess = () => {
    setSelectedProcess(null);
    // Ler filtros ativos do localStorage para pré-preencher cliente/projeto
    const grupoFilterRaw = localStorage.getItem('processTableGrupoFilterMulti');
    const projetoFilterRaw = localStorage.getItem('processTableProjetoFilterMulti');
    const grupoFilterActive = grupoFilterRaw ? JSON.parse(grupoFilterRaw) : [];
    const projetoFilterActive = projetoFilterRaw ? JSON.parse(projetoFilterRaw) : [];

    let baseData = {};
    if (grupoFilterActive.length === 1) {
      const cliente = grupos.find(g => g.nome === grupoFilterActive[0]);
      if (cliente) baseData.cliente_filter = cliente.id;
    }
    if (projetoFilterActive.length === 1) {
      baseData.projeto_id = projetoFilterActive[0];
      // Garantir que cliente_filter bate com o projeto
      if (!baseData.cliente_filter) {
        const proj = projetos.find(p => p.id === projetoFilterActive[0]);
        if (proj) baseData.cliente_filter = proj.cliente_id;
      }
    }

    if (Object.keys(baseData).length > 0) {
      sessionStorage.setItem('kanbanBaseData', JSON.stringify(baseData));
    }
    setIsFormOpen(true);
  };

  const handleAddProcessFromKanban = (baseData) => {
    // Não setar selectedProcess para que seja tratado como novo processo
    setSelectedProcess(null);
    setIsFormOpen(true);
    // Salvar dados base no localStorage para pre-preenchimento
    sessionStorage.setItem('kanbanBaseData', JSON.stringify(baseData));
  };

  const handleEditProcess = (process) => {
    setSelectedProcess(process);
    setIsFormOpen(true);
  };

  const handleViewProcess = (process) => {
    setSelectedProcess(process);
    setIsDetailModalOpen(true);
  };

  const handleOpenChat = (process) => {
    setChatProcess(process);
    if (usuario) {
      const key = `chatLastRead_${usuario.id}_${process.id}`;
      localStorage.setItem(key, new Date().toISOString());
      setUnreadChats(prev => {
        const next = new Set(prev);
        next.delete(process.id);
        return next;
      });
    }
  };

  const handleCloseChat = () => {
    setChatProcess(null);
  };

  const handleDeleteProcessRequest = (processId) => {
    const process = processes.find(p => p.id === processId);
    const isAdmin = userProfile?.grupo === 'adm';
    if (!isAdmin && process?.created_by && process.created_by !== usuario?.id) {
      toast({
        title: 'Sem permissão',
        description: 'Somente o criador do processo pode excluí-lo.',
        variant: 'destructive',
      });
      return;
    }
    setProcessToDelete(processId);
    setIsConfirmDialogOpen(true);
  };

  const confirmDeleteProcess = async () => {
    const process = processes.find(p => p.id === processToDelete);
    
    // Registrar exclusão no histórico antes de deletar
    try {
      await supabase.from('process_history').insert({
        process_id: processToDelete,
        action: 'deleted',
        changed_by: usuario?.id || null,
        changed_by_name: userProfile?.nome || usuario?.email || 'Usuário',
        old_values: process,
        new_values: null,
        changes_summary: `Processo excluído: ${process?.tarefa || 'Desconhecido'}`,
      });
    } catch (historyError) {
      console.error('Erro ao registrar histórico de exclusão:', historyError);
    }
    
    const { error } = await supabase.from('processos').delete().eq('id', processToDelete);
    if (error) {
      toast({ title: 'Erro ao excluir processo', description: getPublicErrorMessage(error), variant: 'destructive' });
    } else {
      toast({ title: 'Processo excluído!', className: 'bg-green-500 text-white' });
      await fetchData(false, false); // false = no toast, false = no loading
    }
    setIsConfirmDialogOpen(false);
    setProcessToDelete(null);
  };

  const handleImportProcesses = async (rows) => {
    const grupoDoUsuario = userProfile?.grupo || '';
    const now = new Date().toISOString();

    const payloads = rows.map(row => {
      const resp = responsaveis.find(r => r.name.toLowerCase() === (row.responsavel_nome || '').toLowerCase());
      const isAdminSelf = userProfile?.grupo === 'adm' &&
        (row.responsavel_nome || '').toLowerCase() === (userProfile?.nome || '').toLowerCase();
      return {
        tarefa: row.tarefa,
        grupo: row.grupo || grupoDoUsuario,
        projeto_id: row.projeto_id || null,
        status: row.status || 'Em andamento',
        prioridade: row.prioridade || 'Média',
        data_inicio: row.data_inicio || null,
        responsavel_nome: resp?.name || row.responsavel_nome || '',
        email: resp?.email || (isAdminSelf ? usuario?.email || '' : '') || '',
        prazo: row.prazo || null,
        observacoes: row.observacoes || '',
        user_id: usuario?.id || null,
        created_by: usuario?.id || null,
        created_by_name: userProfile?.nome || usuario?.email || 'Usuário',
        updated_by: usuario?.id || null,
        updated_by_name: userProfile?.nome || usuario?.email || 'Usuário',
        updated_at: now,
        prazo_historico: [],
      };
    });

    const { error } = await supabase.from('processos').insert(payloads);
    if (error) throw error;
    await fetchData(false, false);
  };

  const saveProcess = async (processData) => {
    const { 
      responsavel: responsavelName, 
      empresa: _emp, empresa_id: _empId, empresa_nome: _empNome,
      tipoCredito: _tc, periodo: _per,
      justificativaReplanejamento,
      prazo_historico: _oldPrazoHistorico,
      is_edit_locked: _requestedEditLock,
      _pendingFiles,
      _attachmentsToDelete,
      id,
      ...restOfProcess 
    } = processData;

    // Derivar o nome do cliente a partir do projeto selecionado
    let clienteNome = '';
    if (restOfProcess.projeto_id) {
      const proj = projetos.find(p => p.id === restOfProcess.projeto_id);
      if (proj?.cliente_id) {
        const clienteObj = grupos.find(g => g.id === proj.cliente_id);
        clienteNome = clienteObj?.nome || '';
      }
    }
    
    const responsavel = responsaveis.find(r => r.name === responsavelName);
    
    const isNewProcess = !id;
    const now = new Date().toISOString();

    // Definir grupo automaticamente baseado no projeto selecionado
    const grupoDoUsuario = clienteNome || userProfile?.grupo;

    // Construir prazo_historico
    let prazoHistorico = [];
    if (!isNewProcess && selectedProcess?.prazo && restOfProcess.prazo && restOfProcess.prazo !== selectedProcess.prazo) {
      const existing = Array.isArray(selectedProcess.prazo_historico)
        ? selectedProcess.prazo_historico
        : JSON.parse(selectedProcess.prazo_historico || '[]');
      prazoHistorico = [...existing, {
        data_anterior: selectedProcess.prazo,
        data_nova: restOfProcess.prazo,
        justificativa: justificativaReplanejamento || '',
        alterado_em: now,
        alterado_por: userProfile?.nome || usuario?.email || 'Usuário'
      }];
    } else if (!isNewProcess) {
      const existing = Array.isArray(selectedProcess?.prazo_historico)
        ? selectedProcess.prazo_historico
        : JSON.parse(selectedProcess?.prazo_historico || '[]');
      prazoHistorico = existing;
    }
    
    // Calcular dias_processo ao salvar como Concluído
    let diasProcessoFinal = restOfProcess.dias_processo || null;
    if (restOfProcess.status === 'Concluído' && restOfProcess.data_inicio && !diasProcessoFinal) {
      const inicio = new Date(restOfProcess.data_inicio + 'T00:00:00');
      const fim = new Date();
      fim.setHours(0, 0, 0, 0);
      diasProcessoFinal = Math.max(0, Math.round((fim - inicio) / (1000 * 60 * 60 * 24)));
    }

    const processPayload = {
      ...restOfProcess,
      cliente: clienteNome,
      responsavel_nome: responsavelName,
      email: responsavel?.email || processData.email || '',
      user_id: usuario?.id || null,
      grupo: grupoDoUsuario,
      is_edit_locked: false,
      edit_locked_by: null,
      edit_locked_at: null,
      prazo_historico: prazoHistorico,
      dias_processo: diasProcessoFinal,
      updated_by: usuario?.id || null,
      updated_by_name: userProfile?.nome || usuario?.email || 'Usuário',
      updated_at: now,
      // Remove empresa fields completely
      empresa_id: undefined,
      empresa_nome: undefined,
    };
    // Clean up undefined fields
    delete processPayload.empresa_id;
    delete processPayload.empresa_nome;
    
    // Se for novo processo, adicionar campos de criação
    if (isNewProcess) {
      processPayload.created_by = usuario?.id || null;
      processPayload.created_by_name = userProfile?.nome || usuario?.email || 'Usuário';
    } else {
      processPayload.id = id;
    }

    const { data: savedProcess, error } = await supabase.from('processos').upsert(processPayload).select().single();

    if (error) {
      toast({ title: 'Erro ao salvar processo', description: getPublicErrorMessage(error), variant: 'destructive' });
      return;
    }
    
    // Registrar no histórico com diff detalhado
    try {
      const changedBy = userProfile?.nome || usuario?.email || 'Usuário';
      const auditEntries = [];

      if (isNewProcess) {
        auditEntries.push({
          process_id: savedProcess.id,
          action: 'created',
          changed_by: usuario?.id || null,
          changed_by_name: changedBy,
          old_values: null,
          new_values: { tarefa: savedProcess.tarefa, status: savedProcess.status, responsavel: savedProcess.responsavel_nome, prazo: savedProcess.prazo, cadeado: savedProcess.is_edit_locked ? 'Ativado' : 'Desativado' },
          changes_summary: `Processo criado por ${changedBy}`,
        });
      } else {
        const prev = selectedProcess || {};
        const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

        // Mapeamento: [campo_em_prev, campo_em_savedProcess, label_exibição, formatador]
        const fields = [
          ['tarefa',          'tarefa',          'Tarefa',         (v) => v || '—'],
          ['status',          'status',          'Status',         (v) => v || '—'],
          ['responsavel_nome','responsavel_nome','Responsável',    (v) => v || '—'],
          ['prazo',           'prazo',           'Prazo',          fmtDate],
          ['data_inicio',     'data_inicio',     'Data de Início', fmtDate],
          ['prioridade',      'prioridade',      'Prioridade',     (v) => v || '—'],
          ['observacoes',     'observacoes',     'Observações',    (v) => v || '—'],
          ['grupo',           'grupo',           'Cliente',        (v) => v || '—'],
          ['projeto_id',      'projeto_id',      'Projeto',        (v) => projetos.find(p => p.id === v)?.nome || v || '—'],
          ['is_edit_locked',  'is_edit_locked',  'Cadeado',        (v) => v ? 'Ativado' : 'Desativado'],
        ];

        const changed = [];
        const oldVals = {};
        const newVals = {};

        for (const [prevField, savedField, label, fmt] of fields) {
          const oldRaw = (prev[prevField] ?? '').toString().trim();
          const newRaw = (savedProcess[savedField] ?? '').toString().trim();
          if (oldRaw !== newRaw) {
            changed.push(label);
            oldVals[label] = fmt(prev[prevField] ?? '');
            newVals[label] = fmt(savedProcess[savedField] ?? '');
          }
        }

        if (changed.length > 0) {
          auditEntries.push({
            process_id: savedProcess.id,
            action: 'updated',
            changed_by: usuario?.id || null,
            changed_by_name: changedBy,
            old_values: oldVals,
            new_values: newVals,
            changes_summary: `Alterado por ${changedBy}: ${changed.join(', ')}`,
          });
        }
      }

      if (auditEntries.length > 0) {
        const { error: histErr } = await supabase.from('process_history').insert(auditEntries);
        if (histErr) {
          console.error('Erro ao gravar auditoria:', histErr);
          toast({ title: `Auditoria: ${histErr.message}`, variant: 'destructive' });
        }
      }
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      toast({ title: `Auditoria catch: ${historyError.message}`, variant: 'destructive' });
    }
    
    toast({ title: 'Processo salvo com sucesso!', className: 'bg-green-500 text-white' });

    // Enviar email automático ao responsável quando atribuído ou alterado (fire-and-forget)
    const responsavelChanged = isNewProcess || (selectedProcess?.responsavel_nome !== responsavelName);
    const responsavelEmail = responsavel?.email || processPayload.email;
    if (responsavelChanged && responsavelEmail && responsavelName) {
      toast({ title: '📧 Enviando notificação...', description: `Notificando ${responsavelName} por email...`, className: 'bg-blue-500 text-white' });
      const projetoNome = projetos.find(p => p.id === restOfProcess.projeto_id)?.nome || '';
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/notify-responsavel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          type: 'assignment',
          data: {
            email: responsavelEmail,
            responsavel: responsavelName,
            tarefa: savedProcess.tarefa,
            cliente: clienteNome,
            projeto: projetoNome,
            status: savedProcess.status,
            prazo: savedProcess.prazo,
            observacoes: savedProcess.observacoes,
          },
        }),
      }).then(res => {
        if (res.ok) toast({ title: 'Email enviado!', description: `${responsavelName} foi notificado.`, className: 'bg-green-500 text-white' });
        else toast({ title: 'Falha ao enviar email', description: 'A notificação não pôde ser enviada.', variant: 'destructive' });
      }).catch(err => {
        console.error('Erro ao notificar responsável por email:', err);
      });
    }

    // Upload pending file attachments
    if (_pendingFiles && _pendingFiles.length > 0 && savedProcess?.id) {
      let uploadErrors = 0;
      for (const file of _pendingFiles) {
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${savedProcess.id}/${Date.now()}_${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from('process-documents')
            .upload(filePath, file, { contentType: file.type });
          if (uploadError) {
            uploadErrors++;
            console.error('Erro ao enviar arquivo:', uploadError);
          } else {
            await supabase.from('process_documents').insert({
              process_id: savedProcess.id,
              filename: file.name,
              storage_path: filePath,
              file_size: file.size,
              content_type: file.type,
              uploaded_by: usuario?.id || null,
              uploaded_by_name: userProfile?.nome || usuario?.email || 'Usuário',
            });
            await supabase.from('process_history').insert({
              process_id: savedProcess.id,
              action: 'updated',
              changed_by: usuario?.id || null,
              changed_by_name: userProfile?.nome || usuario?.email || 'Usuário',
              old_values: null,
              new_values: { anexo: file.name, tamanho: `${(file.size / 1024).toFixed(1)} KB` },
              changes_summary: `Anexo adicionado: ${file.name}`,
            });
          }
        } catch (err) {
          uploadErrors++;
          console.error('Erro ao processar arquivo:', err);
        }
      }
      if (uploadErrors > 0) {
        toast({ title: `${uploadErrors} anexo(s) não puderam ser enviados`, variant: 'destructive' });
      }
    }

    // Delete removed attachments
    if (_attachmentsToDelete && _attachmentsToDelete.length > 0) {
      for (const attId of _attachmentsToDelete) {
        try {
          const { data: attData } = await supabase
            .from('process_documents')
            .select('storage_path')
            .eq('id', attId)
            .single();
          if (attData?.storage_path) {
            await supabase.storage.from('process-documents').remove([attData.storage_path]);
          }
          await supabase.from('process_documents').delete().eq('id', attId);
          await supabase.from('process_history').insert({
            process_id: savedProcess.id,
            action: 'updated',
            changed_by: usuario?.id || null,
            changed_by_name: userProfile?.nome || usuario?.email || 'Usuário',
            old_values: { anexo: attData?.storage_path?.split('/').pop() || attId },
            new_values: null,
            changes_summary: `Anexo removido: ${attData?.storage_path?.split('/').pop() || attId}`,
          });
        } catch (err) {
          console.error('Erro ao remover anexo:', err);
        }
      }
    }

    await fetchData(false, false); // Atualização silenciosa
    setIsFormOpen(false);
  };

  const handleUpdateProcessStatus = async (processId, newStatus) => {
    const now = new Date().toISOString();
    const process = processes.find(p => p.id === processId);
    const oldStatus = process?.status;

    // Calcular e gravar dias_processo ao concluir
    let diasProcesso = process?.dias_processo || null;
    if (newStatus === 'Concluído' && process?.data_inicio) {
      const inicio = new Date(process.data_inicio + 'T00:00:00');
      const fim = new Date();
      fim.setHours(0, 0, 0, 0);
      diasProcesso = Math.max(0, Math.round((fim - inicio) / (1000 * 60 * 60 * 24)));
    }

    const updatePayload = {
      status: newStatus,
      updated_by: usuario?.id || null,
      updated_by_name: userProfile?.nome || usuario?.email || 'Usuário',
      updated_at: now,
    };
    if (newStatus === 'Concluído' && diasProcesso !== null) {
      updatePayload.dias_processo = diasProcesso;
    }

    const { error } = await supabase.from('processos').update(updatePayload).eq('id', processId);
    
    if(error){
      toast({ title: 'Erro ao atualizar status', description: getPublicErrorMessage(error), variant: 'destructive' });
    } else {
      // Registrar mudança de status no histórico
      try {
        await supabase.from('process_history').insert({
          process_id: processId,
          action: 'status_changed',
          changed_by: usuario?.id || null,
          changed_by_name: userProfile?.nome || usuario?.email || 'Usuário',
          old_values: { status: oldStatus },
          new_values: { status: newStatus },
          changes_summary: `Status alterado de "${oldStatus}" para "${newStatus}"`,
        });
      } catch (historyError) {
        console.error('Erro ao registrar histórico:', historyError);
      }
      toast({ title: 'Status atualizado!', description: `Processo movido para ${newStatus}.`, className: 'bg-blue-500 text-white' });
      await fetchData(false, false); // Atualização silenciosa
    }
  };
  
  const generateUUID = () => crypto.randomUUID();
  
  const checkIfItemIsLinkedToProcess = (itemType, itemId) => {
    if (itemType === 'responsaveis') {
      return processes.filter(process => process.responsavel_id === itemId).length;
    } else if (itemType === 'empresas') {
      return processes.filter(process => process.empresa_id === itemId).length;
    }
    return 0;
  };
  
  const handleSetItems = (itemType) => async (newItems) => {
    const table = itemType;
    const oldItems = { responsaveis, empresas }[itemType];

    try {
      const newIds = newItems.map(i => i.id).filter(Boolean);
      const toDelete = oldItems.filter(i => !newIds.includes(i.id));
      
      // Verificar se algum item a ser excluído está atrelado a um processo
      for (const item of toDelete) {
        const linkedCount = checkIfItemIsLinkedToProcess(itemType, item.id);
        if (linkedCount > 0) {
          const itemTypeName = itemType === 'responsaveis' ? 'responsável' : 'empresa';
          const itemName = item.name || item.nome;
          toast({ 
            title: 'Erro ao excluir', 
            description: `Não é possível excluir "${itemName}" pois está vinculado a ${linkedCount} processo(s). Reatribua os processos primeiro.`, 
            variant: 'destructive' 
          });
          return; // Para a execução se encontrar algum item vinculado
        }
      }
      
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase.from(table).delete().in('id', toDelete.map(i => i.id));
        if (deleteError) throw deleteError;
      }
      
      const toUpsert = newItems.map((item) => {
        let payload = { ...item };
        if (itemType === 'responsaveis') {
          payload.nome = item.name;
          delete payload.name;
          const old = responsaveis.find(r => r.id === item.id);
          payload.email = item.email || old?.email || null;
          payload.user_id = usuario?.id || null;
          // PRESERVAR grupo existente ou atribuir do usuário se for novo
          payload.grupo = item.grupo || old?.grupo || userProfile?.grupo || '';
        } else if (itemType === 'empresas') {
          payload.nome = item.name;
          delete payload.name;
          if ('email' in payload) delete payload.email;
          payload.user_id = usuario?.id || null;
          // PRESERVAR grupo existente ou atribuir do usuário se for novo
          const old = empresas.find(e => e.id === item.id);
          payload.grupo = item.grupo || old?.grupo || userProfile?.grupo || '';
        }
        if (!payload.id) {
          payload.id = generateUUID();
        }
        return payload;
      });

      if (toUpsert.length > 0) {
        const { error: upsertError } = await supabase.from(table).upsert(toUpsert, { onConflict: 'id' });
        if (upsertError) throw upsertError;
      }
      
      toast({ title: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} atualizados!`, className: 'bg-green-500 text-white' });
    } catch (error) {
      toast({ title: `Erro ao atualizar ${itemType}`, description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      await fetchData(false, false); // Atualização silenciosa
    }
  };

  const tabOrder = ['dashboard', 'table', 'kanban'];

  const isAdminUser = userProfile?.grupo === 'adm';

  const [ganttEnabledForAll, setGanttEnabledForAll] = useState(false);
  const canSeeGantt = isAdminUser || ganttEnabledForAll;
  const canSeeRecorrentes = isAdminUser;

  const handleToggleGanttForAll = async (value) => {
    setGanttEnabledForAll(value);
    await supabase.from('app_settings').upsert({ key: 'gantt_enabled_for_all', value: String(value), updated_at: new Date().toISOString() });
  };

  // Opções de responsáveis baseadas em user_profiles:
  // - Admin vê todos; admins recebem projeto_ids = todos os projetos
  // - Usuário comum só vê admins + usuários que compartilham pelo menos 1 projeto
  const responsaveisComAdmin = (() => {
    const allProjetoIds = projetos.map(p => p.id);

    if (isAdminUser && userProfile) {
      // Admin: ver todos, admins com todos os projetos
      let result = responsaveis.map(r =>
        r.grupo === 'adm' ? { ...r, projeto_ids: allProjetoIds } : r
      );
      const selfExists = result.some(r => r.name === userProfile.nome);
      if (!selfExists) {
        result = [{
          id: `admin_self_${userProfile.id}`,
          name: userProfile.nome,
          email: usuario?.email || '',
          grupo: 'adm',
          projeto_ids: allProjetoIds,
          user_id: usuario?.id,
        }, ...result];
      }
      return result;
    }

    // Usuário comum: apenas responsáveis (não-admin) com projetos em comum
    const myProjetoIds = userProjetoIds || [];
    return responsaveis.filter(r => {
      if (r.grupo === 'adm') return false; // Usuário comum não vê admins
      return (r.projeto_ids || []).some(pid => myProjetoIds.includes(pid));
    });
  })();

  // Estado para modal de alteração de senha do usuário logado
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: 'As senhas não coincidem', description: 'A nova senha e a confirmação devem ser iguais.', variant: 'destructive' });
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast({ title: 'Senha muito curta', description: 'A nova senha deve ter no mínimo 8 caracteres.', variant: 'destructive' });
      return;
    }
    setPasswordLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: passwordData.oldPassword,
      });
      if (signInError) {
        toast({ title: 'Senha atual incorreta', description: 'Verifique a senha atual e tente novamente.', variant: 'destructive' });
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordData.newPassword });
      if (updateError) throw updateError;
      toast({ title: 'Senha alterada com sucesso!', className: 'bg-green-500 text-white' });
      setIsPasswordModalOpen(false);
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast({ title: 'Erro ao alterar senha', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Função para logout seguro
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUsuario(null);
      setProcesses([]);
      setResponsaveis([]);
      // Preserva temas salvos antes de limpar
      const themeEntries = Object.entries(localStorage).filter(([k]) => k.startsWith('theme_'));
      localStorage.clear();
      sessionStorage.clear();
      themeEntries.forEach(([k, v]) => localStorage.setItem(k, v));
      // Força recarregar a página para garantir limpeza de cache
      window.location.reload();
    } catch (error) {
      toast({ title: 'Erro ao sair', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  if (!usuario || authView === 'recovery') {
    return (
      <Login
        authMode={authView}
        recoveryEmail={recoveryEmail}
        onCancelRecovery={async () => {
          await supabase.auth.signOut();
          clearRecoveryTokenFromUrl(false);
          setRecoveryEmail('');
          setAuthView('login');
        }}
        onLogin={(user) => {
          setAuthView('login');
          setActiveTab('dashboard');
          setUsuario(user);
        }}
        onRecoveryComplete={(user) => {
          setAuthView('login');
          setRecoveryEmail('');
          setActiveTab('dashboard');
          setUsuario(user);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-teal-50 to-amber-50 gradient-mesh">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-6 glass-card p-12 rounded-3xl"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-16 w-16 text-blue-600" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent"
          >
            Carregando dados do sistema...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // Usuário comum sem projetos atribuídos — tela de bloqueio
  const isCommonUser = userProfile && userProfile.grupo !== 'adm';
  const isPendingUser = userProfile && userProfile.grupo === 'pendente';
  const hasNoProjects = isCommonUser && userProjetoIds.length === 0;

  if (hasNoProjects || isPendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-teal-50 to-amber-50 gradient-mesh">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-6 glass-card p-12 rounded-3xl max-w-lg text-center"
        >
          <div className="p-4 rounded-full bg-red-100">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Acesso Pendente</h2>
          <p className="text-slate-600 leading-relaxed">
            Não foi possível carregar nenhum cliente. Verifique com o administrador para ser incluído em um cliente/projeto.
          </p>
          <p className="text-slate-500 text-sm">
            Suas credenciais estão corretas, porém você ainda não foi atribuído a nenhum cliente ou projeto no sistema. Somente após essa configuração será possível acessar.
          </p>
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Aguardando configuração pelo administrador</span>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="mt-4 text-slate-600 hover:text-red-600 hover:border-red-300"
          >
            Sair da Conta
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-amber-50 gradient-mesh">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userProfile={userProfile}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        onChangePasswordRequest={() => setIsPasswordModalOpen(true)}
        userId={usuario?.id}
        canSeeGantt={canSeeGantt}
        canSeeRecorrentes={canSeeRecorrentes}
      />

      {/* Main Content */}
      <div 
        className={`transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:pl-[80px]' : 'lg:pl-[280px]'
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 pt-20 lg:pt-6">
          
          {/* Page Title - Mobile Only */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:hidden mb-6 glass-card rounded-2xl p-4 border-white/60"
          >
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'table' && 'Tabela de Processos'}
              {activeTab === 'kanban' && 'Quadro Kanban'}
              {activeTab === 'responsaveis' && 'Responsáveis'}
              {activeTab === 'grupos' && 'Clientes'}
              {activeTab === 'projetos' && 'Projetos'}
              {activeTab === 'usuarios' && 'Usuários'}
              {activeTab === 'recorrentes' && 'Tarefas Recorrentes'}
              {activeTab === 'painel-fiscal' && 'Painel Fiscal'}
              {activeTab === 'creditos' && 'Créditos'}
              {activeTab === 'habilitacoes' && 'Habilitação de Créditos'}
              {activeTab === 'perdcomps' && 'PER/DCOMP'}
              {activeTab === 'contencioso' && 'Contencioso'}
              {activeTab === 'prazos' && 'Prazos'}
              {activeTab === 'contribuintes' && 'Contribuintes'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Gestão Inteligente de Processos
            </p>
          </motion.div>

          {/* Content Areas */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Dashboard
                    processes={processes}
                    responsaveis={responsaveis}
                    projetos={projetos}
                    onNavigateToStatus={handleViewProcessesByStatus}
                  />
                </motion.div>
              )}
              {activeTab === 'table' && (
                <motion.div
                  key="table"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProcessTable
                    processes={processes}
                    onAddProcess={handleAddProcess}
                    onEditProcess={handleEditProcess}
                    onDeleteProcess={handleDeleteProcessRequest}
                    onViewProcess={handleViewProcess}
                    onChatProcess={handleOpenChat}
                    unreadChats={unreadChats}
                    statusOptions={statusOptions}
                    responsaveisOptions={responsaveisComAdmin.map(r => r.name)}
                    projetos={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    grupos={grupos}
                    sortOrder={sortOrder}
                    onSortChange={setSortOrder}
                    currentUserId={usuario?.id}
                    isAdminUser={isAdminUser}
                    onImportProcesses={handleImportProcesses}
                    userProjetoIds={userProjetoIds}
                    canEditProcess={canEditProcess}
                  />
                </motion.div>
              )}
              {activeTab === 'kanban' && (
                <motion.div
                  key="kanban"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <KanbanBoard
                    processes={processes}
                    onUpdateProcessStatus={handleUpdateProcessStatus}
                    onViewProcess={handleViewProcess}
                    onEditProcess={handleEditProcess}
                    onDeleteProcess={handleDeleteProcessRequest}
                    onChatProcess={handleOpenChat}
                    unreadChats={unreadChats}
                    onAddProcessToColumn={handleAddProcessFromKanban}
                    statusOptions={statusOptions}
                    projetos={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    grupos={grupos}
                    responsaveisOptions={responsaveisComAdmin.map(r => r.name)}
                    sortOrder={sortOrder}
                    onSortChange={setSortOrder}
                    currentUserId={usuario?.id}
                    isAdminUser={isAdminUser}
                    userProjetoIds={userProjetoIds}
                    canEditProcess={canEditProcess}
                  />
                </motion.div>
              )}
              {activeTab === 'gantt' && canSeeGantt && (
                <motion.div
                  key="gantt"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <GanttView
                    processes={processes}
                    projetos={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    grupos={grupos}
                    responsaveisOptions={responsaveisComAdmin.map(r => r.name)}
                    statusOptions={statusOptions}
                    isAdminUser={isAdminUser}
                    onViewProcess={handleViewProcess}
                    ganttEnabledForAll={ganttEnabledForAll}
                    onToggleGanttForAll={handleToggleGanttForAll}
                  />
                </motion.div>
              )}
              {activeTab === 'responsaveis' && (
                <motion.div
                  key="responsaveis"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ResponsaveisManagement 
                    responsaveis={responsaveisComAdmin}
                    userProfile={userProfile}
                    projetos={projetos}
                  />
                </motion.div>
              )}

              {activeTab === 'grupos' && (
                <motion.div
                  key="grupos"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <GruposManagement 
                    currentUserProfile={userProfile}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}
              {activeTab === 'projetos' && (
                <motion.div
                  key="projetos"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProjetosManagement
                    currentUserProfile={userProfile}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}
              {activeTab === 'usuarios' && (
                <motion.div
                  key="usuarios"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <UserManagement
                    currentUserProfile={userProfile}
                    onRefreshResponsaveis={() => fetchData(false, false)}
                  />
                </motion.div>
              )}
              {activeTab === 'recorrentes' && canSeeRecorrentes && (
                <motion.div
                  key="recorrentes"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <RecurringTasksView
                    usuario={usuario}
                    userProfile={userProfile}
                    isAdmin={isAdminUser}
                    projetosOptions={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    gruposOptions={isAdminUser ? grupos : grupos.filter(g => {
                      const userClienteIds = [...new Set(projetos.filter(p => userProjetoIds.includes(p.id)).map(p => p.cliente_id))];
                      return userClienteIds.includes(g.id);
                    })}
                    responsaveisOptions={responsaveisComAdmin}
                    statusOptions={statusOptions}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}

              {activeTab === 'painel-fiscal' && (
                <motion.div
                  key="painel-fiscal"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <FiscalDashboard onNavigate={setActiveTab} />
                </motion.div>
              )}

              {activeTab === 'creditos' && (
                <motion.div
                  key="creditos"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <CreditosView
                    usuario={usuario}
                    userProfile={userProfile}
                    projetos={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    responsaveis={responsaveisComAdmin}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}

              {activeTab === 'habilitacoes' && (
                <motion.div
                  key="habilitacoes"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <HabilitacoesView
                    usuario={usuario}
                    userProfile={userProfile}
                    responsaveis={responsaveisComAdmin}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}

              {activeTab === 'perdcomps' && (
                <motion.div
                  key="perdcomps"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <PerdcompsView
                    usuario={usuario}
                    userProfile={userProfile}
                    responsaveis={responsaveisComAdmin}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}

              {activeTab === 'contencioso' && (
                <motion.div
                  key="contencioso"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ContenciosoView
                    usuario={usuario}
                    userProfile={userProfile}
                    projetos={isAdminUser ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
                    responsaveis={responsaveisComAdmin}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}

              {activeTab === 'prazos' && (
                <motion.div
                  key="prazos"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <PrazosView onRefresh={() => fetchData(false, false)} />
                </motion.div>
              )}

              {activeTab === 'contribuintes' && (
                <motion.div
                  key="contribuintes"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ContribuintesManagement
                    usuario={usuario}
                    userProfile={userProfile}
                    onRefresh={() => fetchData(false, false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ProcessForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        process={selectedProcess} 
        onSave={saveProcess} 
        statusOptions={statusOptions} 
        responsaveisOptions={responsaveisComAdmin}
        projetosOptions={userProfile?.grupo === 'adm' ? projetos : projetos.filter(p => userProjetoIds.includes(p.id))}
        gruposOptions={userProfile?.grupo === 'adm' ? grupos : grupos.filter(g => {
          const userClienteIds = [...new Set(projetos.filter(p => userProjetoIds.includes(p.id)).map(p => p.cliente_id))];
          return userClienteIds.includes(g.id);
        })}
        isAdmin={userProfile?.grupo === 'adm'}
      />
      <ProcessDetailModal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        process={selectedProcess}
        isAdmin={userProfile?.grupo === 'adm'}
        projetos={projetos}
        onEdit={canEditProcess(selectedProcess) ? (p) => { setIsDetailModalOpen(false); handleEditProcess(p); } : null}
        canEdit={canEditProcess(selectedProcess)}
      />
      <ConfirmDialog 
        isOpen={isConfirmDialogOpen} 
        onClose={() => setIsConfirmDialogOpen(false)} 
        onConfirm={confirmDeleteProcess} 
        title="Confirmar Exclusão" 
        description="Tem certeza que deseja excluir este processo? Esta ação não poderá ser desfeita." 
      />

      {/* Modal de Alteração de Senha */}
      <Dialog open={isPasswordModalOpen} onOpenChange={(open) => { if (!open) { setIsPasswordModalOpen(false); setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              🔑 Alterar Senha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <PasswordField
              label="Senha Atual"
              value={passwordData.oldPassword}
              onChange={(e) => setPasswordData(p => ({ ...p, oldPassword: e.target.value }))}
              placeholder="Digite sua senha atual"
            />
            <PasswordField
              label="Nova Senha"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
            />
            <PasswordField
              label="Confirmar Nova Senha"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="Repita a nova senha"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setIsPasswordModalOpen(false); setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' }); }}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              className="px-4 py-2 text-sm rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50"
            >
              {passwordLoading ? 'Salvando...' : 'Alterar Senha'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Chat do Processo */}
      <Dialog open={!!chatProcess} onOpenChange={(open) => { if (!open) handleCloseChat(); }}>
        <DialogContent className="sm:max-w-xl glass-effect">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <span className="text-lg">💬</span>
              Chat — {chatProcess?.tarefa}
            </DialogTitle>
          </DialogHeader>
          {chatProcess && (
            <ProcessChat processId={chatProcess.id} currentUser={usuario} processData={chatProcess} />
          )}
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}

export default App;
