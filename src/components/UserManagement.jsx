import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Users, Shield, Trash2, UserPlus, Search, Mail, User, Edit2, Power, CheckCircle, XCircle, Check, X, FolderKanban, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';

function PasswordInputWithToggle({ ariaLabel, className = '', ...props }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? 'text' : 'password'}
        className={`pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label={isVisible ? `Ocultar ${ariaLabel}` : `Mostrar ${ariaLabel}`}
        title={isVisible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

const UserManagement = ({ currentUserProfile, onRefreshResponsaveis }) => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [userProjetoMap, setUserProjetoMap] = useState({}); // { user_profile_id: [projeto_id, ...] }
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingUserData, setEditingUserData] = useState({ nome: '', email: '', grupo: '', ativo: true });
  const [editingUserProjetos, setEditingUserProjetos] = useState([]);
  const [editingTipo, setEditingTipo] = useState('comum'); // 'admin' | 'comum'
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isConfirmNoClientOpen, setIsConfirmNoClientOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({ password: '', confirmPassword: '' });
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nome: '',
    tipo: 'comum',       // 'admin' | 'comum'
    selectedClientes: [],   // nomes dos clientes selecionados
    selectedProjetos: [],
  });

  // Verificar se o usuário atual é ADM
  const isAdmin = currentUserProfile?.grupo === 'adm';

  const isGrupoAdmin = (grupoNome) => {
    if (!grupoNome) return false;
    const g = grupos.find(g2 => g2.nome === grupoNome);
    return g ? !!g.is_admin : grupoNome === 'adm';
  };
  const getAdminGrupoNome = () => grupos.find(g => g.is_admin)?.nome || 'adm';
  const getClienteGrupos = () => grupos.filter(g => !g.is_admin);

  useEffect(() => {
    if (currentUserProfile?.grupo === 'adm') {
      fetchGrupos();
      fetchProjetos();
      fetchUsers();
    }
  }, [currentUserProfile]);

  const fetchGrupos = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nome', { ascending: true });

      if (error) throw error;
      setGrupos(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      setGrupos([{ nome: 'adm', cor: '#ef4444', is_admin: true }]);
    }
  };

  const fetchProjetos = async () => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      setProjetos(data || []);
    } catch (error) {
      console.warn('Tabela projetos não encontrada:', error.message);
    }
  };

  const getProjetosForGrupo = (grupoNome) => {
    const grupo = grupos.find(g => g.nome === grupoNome);
    if (!grupo) return [];
    return projetos.filter(p => p.cliente_id === grupo.id);
  };

  const getProjetosForClientes = (clienteNames) => {
    if (!clienteNames || clienteNames.length === 0) return [];
    const clienteIds = grupos.filter(g => clienteNames.includes(g.nome)).map(g => g.id);
    return projetos.filter(p => clienteIds.includes(p.cliente_id));
  };

  const getClientesFromProjetos = (projetoIds) => {
    if (!projetoIds || projetoIds.length === 0) return [];
    const clienteIds = [...new Set(projetos.filter(p => projetoIds.includes(p.id)).map(p => p.cliente_id))];
    return grupos.filter(g => clienteIds.includes(g.id)).map(g => g.nome);
  };

  const getProjetosForUser = (userProfileId) => {
    return userProjetoMap[userProfileId] || [];
  };

  const syncUserProjetos = async (userProfileId, projetoIds) => {
    const { error: deleteError } = await supabase
      .from('user_projetos')
      .delete()
      .eq('user_profile_id', userProfileId);

    if (deleteError) throw deleteError;

    if (!projetoIds || projetoIds.length === 0) return;

    const rows = projetoIds.map((projetoId) => ({ user_profile_id: userProfileId, projeto_id: projetoId }));
    const { error: insertError } = await supabase.from('user_projetos').insert(rows);
    if (insertError) throw insertError;
  };

  const resolveResponsavelGrupo = ({ tipo, selectedClientes, selectedProjetos, fallbackGrupo }) => {
    if (tipo === 'comum' && selectedClientes?.length > 0) {
      return selectedClientes[0];
    }

    if (selectedProjetos?.length > 0) {
      const projeto = projetos.find((item) => item.id === selectedProjetos[0]);
      const cliente = grupos.find((item) => item.id === projeto?.cliente_id);
      if (cliente?.nome) return cliente.nome;
    }

    return fallbackGrupo;
  };

  const syncResponsavelRecord = async ({ nome, email, grupo, projetoIds }) => {
    if (!email || email === 'Email protegido') return false;

    const { data: existingResponsavel, error: selectError } = await supabase
      .from('responsaveis')
      .select('id')
      .eq('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    let responsavelId = existingResponsavel?.id;

    if (responsavelId) {
      const { error: updateError } = await supabase
        .from('responsaveis')
        .update({ nome, email, grupo })
        .eq('id', responsavelId);
      if (updateError) throw updateError;
    } else {
      const { data: insertedResponsavel, error: insertError } = await supabase
        .from('responsaveis')
        .insert([{ nome, email, grupo, created_by: currentUserProfile?.user_id || null }])
        .select('id')
        .single();

      if (insertError) throw insertError;
      responsavelId = insertedResponsavel.id;
    }

    const { error: deleteLinksError } = await supabase
      .from('responsavel_projetos')
      .delete()
      .eq('responsavel_id', responsavelId);

    if (deleteLinksError) throw deleteLinksError;

    if (projetoIds?.length > 0) {
      const rows = projetoIds.map((projetoId) => ({ responsavel_id: responsavelId, projeto_id: projetoId }));
      const { error: insertLinksError } = await supabase.from('responsavel_projetos').insert(rows);
      if (insertLinksError) throw insertLinksError;
    }

    return true;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Buscar perfis diretamente da tabela (confiável para o campo ativo)
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Tentar enriquecer com email via RPC
      let emailMap = {};
      const { data: rpcData } = await supabase.rpc('get_user_profiles_with_email');
      if (rpcData) {
        rpcData.forEach(u => { emailMap[u.user_id] = u.email; });
      }

      const formattedUsers = profilesData.map(profile => ({
        ...profile,
        email: emailMap[profile.user_id] || 'Email protegido',
      }));

      setUsers(formattedUsers);

      // Buscar todos os user_projetos de uma vez
      const { data: allUserProjetos } = await supabase
        .from('user_projetos')
        .select('user_profile_id, projeto_id');
      const map = {};
      (allUserProjetos || []).forEach(up => {
        if (!map[up.user_profile_id]) map[up.user_profile_id] = [];
        map[up.user_profile_id].push(up.projeto_id);
      });
      setUserProjetoMap(map);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast({
        title: 'Erro ao carregar usuários',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserGroup = async (userId, newGrupo) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ grupo: newGrupo, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: 'Grupo atualizado!',
        description: 'O grupo do usuário foi atualizado com sucesso.',
        className: 'bg-green-500 text-white',
      });

      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
      setEditingUser(null);
    } catch (error) {
      console.error('Erro ao atualizar grupo:', error);
      toast({
        title: 'Erro ao atualizar',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleEditUser = (user) => {
    const userTipo = isGrupoAdmin(user.grupo) ? 'admin' : 'comum';
    setEditingUser(user.user_id);
    setEditingTipo(userTipo);
    const userProjIds = getProjetosForUser(user.id);
    const derivedClientes = getClientesFromProjetos(userProjIds);
    const gruposNaoCliente = ['pendente', 'sem_grupo'];
    setEditingUserData({
      nome: user.nome || '',
      email: user.email || '',
      grupo: user.grupo,
      selectedClientes: derivedClientes.length > 0 ? derivedClientes : (user.grupo && !isGrupoAdmin(user.grupo) && !gruposNaoCliente.includes(user.grupo) && grupos.some(g => g.nome === user.grupo) ? [user.grupo] : []),
      ativo: user.ativo === true || user.ativo === false ? user.ativo : true,
    });
    setEditingUserProjetos(userProjIds);
    setIsEditModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    const trimmedNome = editingUserData.nome.trim();
    const trimmedEmail = editingUserData.email.trim();

    if (trimmedNome === '') {
      toast({
        title: 'Erro',
        description: 'O nome é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    if (trimmedEmail === '') {
      toast({
        title: 'Erro',
        description: 'O email é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      toast({
        title: 'Erro',
        description: 'Por favor, insira um email válido.',
        variant: 'destructive'
      });
      return;
    }

    const grupoToSave = editingTipo === 'admin' ? getAdminGrupoNome() : (editingUserData.selectedClientes?.[0] || editingUserData.grupo);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ 
          nome: trimmedNome, 
          grupo: grupoToSave,
          ativo: editingUserData.ativo,
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', editingUser);

      if (error) throw error;

      // Sincronizar user_projetos
      const user = users.find(u => u.user_id === editingUser);
      if (user) {
        await supabase.from('user_projetos').delete().eq('user_profile_id', user.id);
        if (editingUserProjetos.length > 0) {
          await supabase.from('user_projetos').insert(
            editingUserProjetos.map(pId => ({ user_profile_id: user.id, projeto_id: pId }))
          );
        }
      }

      toast({
        title: 'Usuário atualizado!',
        description: 'As informações foram atualizadas com sucesso.',
        className: 'bg-green-500 text-white',
      });

      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
      setIsEditModalOpen(false);
      setEditingUser(null);
      setEditingUserData({ nome: '', email: '', grupo: '', selectedClientes: [], ativo: true });
      setEditingUserProjetos([]);
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      toast({
        title: 'Erro ao atualizar',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleSaveUserSafe = async () => {
    if (!editingUser) return;

    const trimmedNome = editingUserData.nome.trim();
    if (!trimmedNome) {
      toast({
        title: 'Erro',
        description: 'O nome é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    const grupoToSave = editingTipo === 'admin' ? getAdminGrupoNome() : (editingUserData.selectedClientes?.[0] || editingUserData.grupo);

    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          nome: trimmedNome,
          grupo: grupoToSave,
          ativo: editingUserData.ativo,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', editingUser);

      if (profileError) throw profileError;

      const user = users.find((item) => item.user_id === editingUser);
      if (user) {
        await syncUserProjetos(user.id, editingUserProjetos);

        const grupoResponsavel = resolveResponsavelGrupo({
          tipo: editingTipo,
          selectedClientes: editingUserData.selectedClientes,
          selectedProjetos: editingUserProjetos,
          fallbackGrupo: grupoToSave,
        });

        await syncResponsavelRecord({
          nome: trimmedNome,
          email: user.email,
          grupo: grupoResponsavel,
          projetoIds: editingUserProjetos,
        });
      }

      toast({
        title: 'Usuário atualizado!',
        description: 'As informações foram atualizadas com sucesso.',
        className: 'bg-green-500 text-white',
      });

      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
      setIsEditModalOpen(false);
      setEditingUser(null);
      setEditingUserData({ nome: '', email: '', grupo: '', selectedClientes: [], ativo: true });
      setEditingUserProjetos([]);
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      toast({
        title: 'Erro ao atualizar',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleCancelEdit = () => {
    setIsEditModalOpen(false);
    setEditingUser(null);
    setEditingUserData({ nome: '', email: '', grupo: '', selectedClientes: [], ativo: true });
    setEditingTipo('comum');
    setEditingUserProjetos([]);
    setResetPasswordData({ password: '', confirmPassword: '' });
  };

  const handleAdminResetPassword = async () => {
    const user = users.find(u => u.user_id === editingUser);
    if (!user?.email || user.email === 'Email protegido') {
      toast({ title: 'Email não disponível', description: 'Não é possível redefinir sem o email do usuário.', variant: 'destructive' });
      return;
    }

    if (!resetPasswordData.password || !resetPasswordData.confirmPassword) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha a nova senha e a confirmação.', variant: 'destructive' });
      return;
    }

    if (resetPasswordData.password !== resetPasswordData.confirmPassword) {
      toast({ title: 'Senhas não coincidem', description: 'A senha e a confirmação devem ser iguais.', variant: 'destructive' });
      return;
    }

    if (resetPasswordData.password.length < 8) {
      toast({ title: 'Senha muito curta', description: 'A senha deve ter no mínimo 8 caracteres.', variant: 'destructive' });
      return;
    }

    if (!/[A-Z]/.test(resetPasswordData.password) || !/[0-9]/.test(resetPasswordData.password)) {
      toast({ title: 'Senha fraca', description: 'A senha deve conter ao menos uma letra maiúscula e um número.', variant: 'destructive' });
      return;
    }

    setIsResettingPassword(true);
    toast({
      title: '⏳ Redefinindo senha...',
      description: 'Atualizando senha e enviando por email. Aguarde...',
      className: 'bg-blue-500 text-white',
    });
    try {
      // Forçar refresh do token para garantir que não está expirado
      const { data: { session }, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !session) {
        toast({ title: 'Sessão expirada', description: 'Faça login novamente.', variant: 'destructive' });
        setIsResettingPassword(false);
        return;
      }

      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: user.user_id,
          email: user.email,
          password: resetPasswordData.password,
          nome: user.nome,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'O endpoint de redefinição de senha não está disponível localmente. ' +
          'Use "vercel dev" ou faça o deploy no Vercel.'
        );
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao redefinir senha');
      }

      if (result.emailSent) {
        toast({ title: 'Senha redefinida!', description: `A nova senha foi enviada para ${user.email}.`, className: 'bg-green-500 text-white' });
      } else {
        toast({
          title: 'Senha redefinida, mas o e-mail não foi enviado',
          description: result.emailError || 'O e-mail de notificação não pôde ser enviado. Informe a nova senha manualmente ao usuário.',
          variant: 'destructive',
        });
      }
      setResetPasswordData({ password: '', confirmPassword: '' });
    } catch (error) {
      toast({ title: 'Erro ao redefinir senha', description: error.message || getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    setUserToToggle({ userId, currentStatus });
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!userToToggle) return;

    const newStatus = !userToToggle.currentStatus;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ ativo: newStatus, updated_at: new Date().toISOString() })
        .eq('user_id', userToToggle.userId);

      if (error) throw error;

      toast({
        title: newStatus ? 'Usuário ativado!' : 'Usuário desativado!',
        description: newStatus 
          ? 'O usuário pode acessar o sistema novamente.'
          : 'O usuário não terá mais acesso ao sistema.',
        className: newStatus ? 'bg-green-500 text-white' : 'bg-orange-500 text-white',
      });

      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro ao atualizar',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsConfirmDialogOpen(false);
      setUserToToggle(null);
    }
  };

  const handleCancelToggle = () => {
    setUserToToggle(null);
    setIsConfirmDialogOpen(false);
  };

  const handleCreateUser = async (e) => {
    if (e) e.preventDefault();

    if (!newUserData.email || !newUserData.password || !newUserData.nome) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos.',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserData.email.trim())) {
      toast({ title: 'Email inválido', description: 'Informe um endereço de email válido.', variant: 'destructive' });
      return;
    }

    if (newUserData.password !== newUserData.confirmPassword) {
      toast({ title: 'Senhas não coincidem', description: 'A senha e a confirmação devem ser iguais.', variant: 'destructive' });
      return;
    }

    if (newUserData.password.length < 8) {
      toast({ title: 'Senha muito curta', description: 'A senha deve ter no mínimo 8 caracteres.', variant: 'destructive' });
      return;
    }

    if (!/[A-Z]/.test(newUserData.password) || !/[0-9]/.test(newUserData.password)) {
      toast({ title: 'Senha fraca', description: 'A senha deve conter ao menos uma letra maiúscula e um número.', variant: 'destructive' });
      return;
    }

    // Se for usuário comum sem cliente/projeto selecionado, pedir confirmação
    if (newUserData.tipo === 'comum' && (!newUserData.selectedClientes || newUserData.selectedClientes.length === 0)) {
      setIsConfirmNoClientOpen(true);
      return;
    }

    await executeCreateUserSafe();
  };

  const executeCreateUser = async () => {
    setIsConfirmNoClientOpen(false);

    toast({
      title: '⏳ Criando usuário...',
      description: 'Criando conta e enviando credenciais por email. Aguarde...',
      className: 'bg-blue-500 text-white',
    });

    try {
      const grupoParaCriar = newUserData.tipo === 'admin' ? getAdminGrupoNome() : (newUserData.selectedClientes?.[0] || 'pendente');

      // Obter token da sessão atual para autorizar a chamada ao endpoint
      const { data: { session } } = await supabase.auth.refreshSession();

      // Criar usuário via Vercel API (Admin API server-side — sem rate limit de email do Supabase)
      // Envia automaticamente o email de boas-vindas com as credenciais via Gmail SMTP
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: newUserData.email,
          password: newUserData.password,
          nome: newUserData.nome,
          grupo: grupoParaCriar,
        }),
      });

      // Vercel API routes retornam HTML quando não estão disponíveis (ex: rodando com 'npm run dev' em vez de 'vercel dev')
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'O endpoint de criação de usuários não está disponível localmente. ' +
          'Use "vercel dev" em vez de "npm run dev" para testar cette funcionalidade, ' +
          'ou faça o deploy no Vercel.'
        );
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar usuário');
      }

      const userId = result.userId;

      // Criar perfil via RPC SECURITY DEFINER — evita timing de FK do REST API
      let rpcError = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
        const { error } = await supabase.rpc('create_user_profile_safe', {
          p_user_id: userId,
          p_nome: newUserData.nome,
          p_grupo: grupoParaCriar,
        });
        rpcError = error;
        if (!error) break;
        if (error.code !== '23503') break;
        console.warn(`Tentativa ${attempt + 1} falhou (FK timing), retentando...`, error);
      }

      if (rpcError) {
        console.error('Erro ao criar perfil via RPC:', rpcError);
        throw rpcError;
      }

      // Associar projetos selecionados
      if (newUserData.selectedProjetos.length > 0) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('user_id', userId)
          .single();
        if (profileData) {
          await supabase.from('user_projetos').insert(
            newUserData.selectedProjetos.map(pId => ({ user_profile_id: profileData.id, projeto_id: pId }))
          );
        }
      }

      // Auto-criar responsável para o novo usuário
      try {
        // Para usuários comuns, usar o clienteGrupo (nome do cliente) diretamente
        // Para admins, derivar do projeto selecionado
        let grupoResponsavel = grupoParaCriar;
        if (newUserData.tipo === 'comum' && newUserData.selectedClientes?.length > 0) {
          grupoResponsavel = newUserData.selectedClientes[0];
        } else if (newUserData.selectedProjetos.length > 0) {
          const proj = projetos.find(p => p.id === newUserData.selectedProjetos[0]);
          const cliente = grupos.find(g => g.id === proj?.cliente_id);
          if (cliente) grupoResponsavel = cliente.nome;
        }

        const { data: respData, error: respInsertError } = await supabase
          .from('responsaveis')
          .insert([{ nome: newUserData.nome, email: newUserData.email, grupo: grupoResponsavel, created_by: currentUserProfile?.user_id || null }])
          .select()
          .single();

        if (respInsertError) {
          console.error('Erro ao auto-criar responsável:', respInsertError);
        } else if (respData && newUserData.selectedProjetos.length > 0) {
          const { error: respProjError } = await supabase.from('responsavel_projetos').insert(
            newUserData.selectedProjetos.map(pId => ({ responsavel_id: respData.id, projeto_id: pId }))
          );
          if (respProjError) console.error('Erro ao vincular projetos do responsável:', respProjError);
        }
      } catch (respError) {
        console.error('Erro ao auto-criar responsável:', respError);
      }

      toast({
        title: 'Usuário criado!',
        description: `O usuário ${newUserData.nome} foi criado. Um email com as credenciais foi enviado para ${newUserData.email}.`,
        className: 'bg-green-500 text-white',
      });

      setIsAddUserOpen(false);
      setNewUserData({
        email: '',
        password: '',
        confirmPassword: '',
        nome: '',
        tipo: 'comum',
        selectedClientes: [],
        selectedProjetos: [],
      });
      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      let errorMsg = 'Não foi possível criar o usuário. Tente novamente.';
      if (error.message?.includes('já está cadastrado') || error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        errorMsg = 'Este email já está cadastrado no sistema.';
      } else if (error.message?.includes('Password should be')) {
        errorMsg = 'A senha não atende aos requisitos mínimos de segurança.';
      } else if (error.message?.includes('Invalid email')) {
        errorMsg = 'O endereço de email informado é inválido.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      toast({
        title: 'Erro ao criar usuário',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const executeCreateUserSafe = async () => {
    setIsConfirmNoClientOpen(false);

    toast({
      title: 'Criando usuário...',
      description: 'Criando conta e enviando credenciais por email. Aguarde...',
      className: 'bg-blue-500 text-white',
    });

    try {
      const grupoParaCriar = newUserData.tipo === 'admin' ? getAdminGrupoNome() : (newUserData.selectedClientes?.[0] || 'pendente');
      const { data: { session }, error: refreshErr } = await supabase.auth.refreshSession();

      if (refreshErr || !session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newUserData.email,
          password: newUserData.password,
          nome: newUserData.nome,
          grupo: grupoParaCriar,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'O endpoint de criação de usuários não está disponível localmente. ' +
          'Use "vercel dev" em vez de "npm run dev", ou faça o deploy no Vercel.'
        );
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar usuário');
      }

      const userId = result.userId;

      let rpcError = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        const { error } = await supabase.rpc('create_user_profile_safe', {
          p_user_id: userId,
          p_nome: newUserData.nome,
          p_grupo: grupoParaCriar,
        });
        rpcError = error;
        if (!error) break;
        if (error.code !== '23503') break;
      }

      if (rpcError) throw rpcError;

      const { data: profileData, error: profileLookupError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (profileLookupError) throw profileLookupError;
      if (!profileData?.id) throw new Error('Perfil do usuário não foi encontrado após a criação.');

      await syncUserProjetos(profileData.id, newUserData.selectedProjetos || []);

      const grupoResponsavel = resolveResponsavelGrupo({
        tipo: newUserData.tipo,
        selectedClientes: newUserData.selectedClientes,
        selectedProjetos: newUserData.selectedProjetos,
        fallbackGrupo: grupoParaCriar,
      });

      await syncResponsavelRecord({
        nome: newUserData.nome,
        email: newUserData.email,
        grupo: grupoResponsavel,
        projetoIds: newUserData.selectedProjetos || [],
      });

      toast({
        title: 'Usuário criado!',
        description: `O usuário ${newUserData.nome} foi criado. Um email com as credenciais foi enviado para ${newUserData.email}.`,
        className: 'bg-green-500 text-white',
      });

      setIsAddUserOpen(false);
      setNewUserData({
        email: '',
        password: '',
        confirmPassword: '',
        nome: '',
        tipo: 'comum',
        selectedClientes: [],
        selectedProjetos: [],
      });
      fetchUsers();
      if (onRefreshResponsaveis) onRefreshResponsaveis();
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      let errorMsg = 'Não foi possível criar o usuário. Tente novamente.';
      if (error.message?.includes('já está cadastrado') || error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        errorMsg = 'Este email já está cadastrado no sistema.';
      } else if (error.message?.includes('Password should be')) {
        errorMsg = 'A senha não atende aos requisitos mínimos de segurança.';
      } else if (error.message?.includes('Invalid email')) {
        errorMsg = 'O endereço de email informado é inválido.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      toast({
        title: 'Erro ao criar usuário',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const getGrupoIcon = (grupoNome) => {
    const grupo = grupos.find(g => g.nome === grupoNome);
    if (grupo?.is_admin) {
      return <Shield className="h-4 w-4" />;
    }
    // Ícones padrão baseados no nome
    return <Users className="h-4 w-4" />;
  };

  const getGrupoBadgeColor = (grupoNome) => {
    const grupo = grupos.find(g => g.nome === grupoNome);
    if (grupo?.cor) {
      return `text-white`;
    }
    // Cores padrão se não encontrar
    if (grupoNome === 'adm') return 'bg-gradient-to-r from-red-500 to-rose-600 text-white';

    return 'bg-gray-500 text-white';
  };

  const getGrupoBadgeStyle = (grupoNome) => {
    const grupo = grupos.find(g => g.nome === grupoNome);
    if (grupo?.cor) {
      return {
        background: `linear-gradient(to right, ${grupo.cor}, ${grupo.cor}dd)`,
      };
    }
    return {};
  };

  const filteredUsers = users.filter(user =>
    user.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.grupo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getProjetosForUser(user.id).some(pId => projetos.find(p => p.id === pId)?.nome?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getUserByIdToToggle = () => {
    return users.find(u => u.user_id === userToToggle?.userId);
  };

  if (!currentUserProfile) {
    return (
      <div className="flex items-center justify-center py-24 gap-3">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        <p className="text-gray-500 text-lg">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6 p-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
              Acesso Negado
            </h1>
            <p className="text-gray-600 mt-1">Apenas administradores podem acessar esta seção</p>
          </div>
        </motion.div>
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardContent className="p-8 text-center">
            <Shield className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              Você não tem permissão para acessar o gerenciamento de usuários.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 shadow-lg">
          <Users className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Gerenciar Usuários
          </h1>
          <p className="text-gray-600 mt-1">Cadastre e gerencie os usuários do sistema</p>
        </div>
      </motion.div>

      {/* Barra de Ações */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, email ou grupo..."
                  className="pl-10"
                />
              </div>
              <Button
                onClick={() => setIsAddUserOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white rounded-xl"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Usuário
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Lista de Usuários */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Usuários Cadastrados ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-500">Carregando usuários...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {searchTerm
                    ? 'Nenhum usuário encontrado com esse termo.'
                    : 'Nenhum usuário cadastrado ainda.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Usuário</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Email</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Tipo</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Cliente</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Projetos</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Status</th>
                      <th className="text-center py-4 px-4 font-semibold text-gray-700 bg-gray-50 w-40">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filteredUsers.map((user, index) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b border-gray-100 hover:bg-indigo-50 transition-colors group"
                        >
                          {/* Nome */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${isGrupoAdmin(user.grupo) ? 'bg-gradient-to-br from-red-100 to-rose-100' : 'bg-gradient-to-br from-blue-100 to-teal-100'}`}>
                                {getGrupoIcon(user.grupo)}
                              </div>
                              <span className="font-medium text-gray-900">{user.nome || 'Sem nome'}</span>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail className="h-4 w-4 text-gray-400" />
                              <span className="text-sm">{user.email}</span>
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="py-4 px-4">
                            {isGrupoAdmin(user.grupo) ? (
                              <Badge className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-3 py-1 flex items-center gap-1 w-fit">
                                <Shield className="h-3 w-3" />Admin
                              </Badge>
                            ) : (
                              <Badge className="bg-gradient-to-r from-blue-600 to-teal-500 text-white px-3 py-1 w-fit rounded-xl">
                                Comum
                              </Badge>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="py-4 px-4">
                            {isGrupoAdmin(user.grupo) ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (() => {
                              const userProjIds = userProjetoMap[user.id] || [];
                              const userClientes = getClientesFromProjetos(userProjIds);
                              const isRealCliente = user.grupo && !isGrupoAdmin(user.grupo) && grupos.some(g => g.nome === user.grupo);
                              const clientesToShow = userClientes.length > 0 ? userClientes : (isRealCliente ? [user.grupo] : []);
                              return clientesToShow.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {clientesToShow.map(cName => (
                                    <Badge key={cName} className={`${getGrupoBadgeColor(cName)} px-2 py-0.5 text-xs`} style={getGrupoBadgeStyle(cName)}>
                                      {cName}
                                    </Badge>
                                  ))}
                                </div>
                              ) : <span className="text-xs text-gray-400">—</span>;
                            })()}
                          </td>

                          {/* Projetos */}
                          <td className="py-4 px-4">
                            {isGrupoAdmin(user.grupo) ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (() => {
                              const userProjIds = userProjetoMap[user.id] || [];
                              const userProjNames = projetos.filter(p => userProjIds.includes(p.id));
                              return userProjNames.length > 0 ? (
                                <div className="relative group">
                                  <span className="text-xs text-violet-700 bg-violet-100 px-2 py-0.5 rounded cursor-pointer select-none group-hover:bg-violet-200 transition-colors" style={{whiteSpace:'nowrap'}}>
                                    Projetos <span className="opacity-60">({userProjNames.length})</span>
                                  </span>
                                  <div className="pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 opacity-0 transition-opacity absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 min-w-[200px] max-w-xs bg-white border border-slate-200 shadow-lg rounded-xl p-3 flex flex-wrap gap-1">
                                    {userProjNames.map(p => (
                                      <span key={p.id} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                                        <FolderKanban className="h-3 w-3" />{p.nome}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : <span className="text-xs text-gray-400">—</span>;
                            })()}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4">
                            {user.ativo === false ? (
                              <Badge className="bg-gray-500 text-white">Inativo</Badge>
                            ) : (
                              <Badge className="bg-green-500 text-white">Ativo</Badge>
                            )}
                          </td>

                          {/* Ações */}
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditUser(user)}
                                className="hover:bg-indigo-50 hover:text-indigo-600"
                                title="Editar usuário"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleUserStatus(user.user_id, user.ativo !== false)}
                                className={user.ativo === false ? 'hover:bg-green-50 hover:text-green-600' : 'hover:bg-orange-50 hover:text-orange-600'}
                                title={user.ativo === false ? 'Ativar usuário' : 'Desativar usuário'}
                              >
                                {user.ativo === false ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-orange-600" />}
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialog de Editar Usuário */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => { if (!open) handleCancelEdit(); }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-indigo-600" />
              Editar Usuário
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome Completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="edit-nome"
                  value={editingUserData.nome}
                  onChange={(e) => setEditingUserData({ ...editingUserData, nome: e.target.value })}
                  placeholder="Nome completo"
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
            {/* Email (somente leitura) */}
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={editingUserData.email} readOnly className="pl-10 bg-gray-50 text-gray-500 cursor-not-allowed" />
              </div>
            </div>
            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Acesso</Label>
              <Select value={editingTipo} onValueChange={(v) => {
                setEditingTipo(v);
                if (v === 'admin') {
                  setEditingUserData(prev => ({ ...prev, grupo: getAdminGrupoNome(), selectedClientes: [] }));
                  setEditingUserProjetos([]);
                } else {
                  setEditingUserData(prev => ({ ...prev, grupo: '', selectedClientes: [] }));
                  setEditingUserProjetos([]);
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" />Administrador</div>
                  </SelectItem>
                  <SelectItem value="comum">
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-blue-500" />Comum</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Cliente */}
            {editingTipo === 'comum' && (
              <div className="space-y-2">
                <Label>Clientes</Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                  {getClienteGrupos().map(grupo => (
                    <label key={grupo.nome} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input
                        type="checkbox"
                        checked={(editingUserData.selectedClientes || []).includes(grupo.nome)}
                        onChange={(e) => {
                          const prev = editingUserData.selectedClientes || [];
                          const newClientes = e.target.checked
                            ? [...prev, grupo.nome]
                            : prev.filter(n => n !== grupo.nome);
                          setEditingUserData({ ...editingUserData, selectedClientes: newClientes, grupo: newClientes[0] || '' });
                          // Remover projetos que não pertencem mais aos clientes selecionados
                          const validProjIds = getProjetosForClientes(newClientes).map(p => p.id);
                          setEditingUserProjetos(prev => prev.filter(pId => validProjIds.includes(pId)));
                        }}
                      />
                      <Badge className={`${getGrupoBadgeColor(grupo.nome)} px-2 py-0.5 text-xs`} style={getGrupoBadgeStyle(grupo.nome)}>
                        {grupo.nome}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {/* Projetos */}
            {editingTipo === 'comum' && (() => {
              const clienteProjetos = getProjetosForClientes(editingUserData.selectedClientes || []);
              return clienteProjetos.length > 0 ? (
                <div className="space-y-2">
                  <Label>Projetos</Label>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {clienteProjetos.map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                        <input
                          type="checkbox"
                          checked={editingUserProjetos.includes(p.id)}
                          onChange={(e) => {
                            setEditingUserProjetos(prev =>
                              e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                            );
                          }}
                        />
                        <span className="text-sm">{p.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editingUserData.ativo ? 'true' : 'false'} onValueChange={(v) => setEditingUserData({ ...editingUserData, ativo: v === 'true' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div>Ativo</div>
                  </SelectItem>
                  <SelectItem value="false">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-500"></div>Inativo</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Gerenciar Senha */}
            <div className="pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold text-gray-800">Redefinir Senha</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Defina uma nova senha para o usuário. A nova senha será enviada por email.
              </p>
              <div className="space-y-2 mb-3">
                <PasswordInputWithToggle
                  ariaLabel="nova senha do usuario"
                  placeholder="Nova senha (mín. 8 caracteres)"
                  value={resetPasswordData.password}
                  onChange={(e) => setResetPasswordData({ ...resetPasswordData, password: e.target.value })}
                />
                <PasswordInputWithToggle
                  ariaLabel="confirmacao da nova senha do usuario"
                  placeholder="Confirmar nova senha"
                  value={resetPasswordData.confirmPassword}
                  onChange={(e) => setResetPasswordData({ ...resetPasswordData, confirmPassword: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAdminResetPassword}
                disabled={isResettingPassword || !resetPasswordData.password || !resetPasswordData.confirmPassword}
                className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                {isResettingPassword ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                Redefinir Senha e Enviar por Email
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
            <Button onClick={handleSaveUserSafe} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Adicionar Usuário */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              Adicionar Novo Usuário
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="nome"
                  value={newUserData.nome}
                  onChange={(e) => setNewUserData({ ...newUserData, nome: e.target.value })}
                  placeholder="Nome completo"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <PasswordInputWithToggle
                id="password"
                ariaLabel="senha do novo usuario"
                value={newUserData.password}
                onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <PasswordInputWithToggle
                id="confirmPassword"
                ariaLabel="confirmacao da senha do novo usuario"
                value={newUserData.confirmPassword}
                onChange={(e) => setNewUserData({ ...newUserData, confirmPassword: e.target.value })}
                placeholder="Repita a senha"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Acesso</Label>
              <Select
                value={newUserData.tipo}
                onValueChange={(v) => setNewUserData({ ...newUserData, tipo: v, selectedClientes: [], selectedProjetos: [] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="comum">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Comum
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {newUserData.tipo === 'admin' && (
                <p className="text-xs text-gray-500">Administradores têm acesso total ao sistema.</p>
              )}
            </div>
            {newUserData.tipo === 'comum' && (
              <div className="space-y-2">
                <Label>Clientes <span className="text-xs text-gray-400 font-normal">(opcional — pode atribuir depois)</span></Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                  {getClienteGrupos().map(grupo => (
                    <label key={grupo.nome} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input
                        type="checkbox"
                        checked={newUserData.selectedClientes?.includes(grupo.nome) || false}
                        onChange={(e) => {
                          const current = newUserData.selectedClientes || [];
                          const newClientes = e.target.checked
                            ? [...current, grupo.nome]
                            : current.filter(n => n !== grupo.nome);
                          // Remover projetos que não pertencem mais aos clientes selecionados
                          const validProjIds = getProjetosForClientes(newClientes).map(p => p.id);
                          setNewUserData({
                            ...newUserData,
                            selectedClientes: newClientes,
                            selectedProjetos: (newUserData.selectedProjetos || []).filter(pId => validProjIds.includes(pId)),
                          });
                        }}
                      />
                      <Badge className={`${getGrupoBadgeColor(grupo.nome)} px-2 py-0.5 text-xs`} style={getGrupoBadgeStyle(grupo.nome)}>
                        {grupo.nome}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {newUserData.tipo === 'comum' && (() => {
              const clienteProjetos = getProjetosForClientes(newUserData.selectedClientes || []);
              return clienteProjetos.length > 0 ? (
                <div className="space-y-2">
                  <Label>Projetos <span className="text-xs text-gray-400 font-normal">(opcional)</span></Label>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {clienteProjetos.map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                        <input
                          type="checkbox"
                          checked={newUserData.selectedProjetos?.includes(p.id) || false}
                          onChange={(e) => {
                            const current = newUserData.selectedProjetos || [];
                            setNewUserData({
                              ...newUserData,
                              selectedProjetos: e.target.checked
                                ? [...current, p.id]
                                : current.filter(id => id !== p.id),
                            });
                          }}
                        />
                        <span className="text-sm">{p.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
                Criar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={handleCancelToggle}
        onConfirm={handleConfirmToggle}
        title={userToToggle?.currentStatus ? 'Desativar Usuário' : 'Ativar Usuário'}
        description={
          userToToggle?.currentStatus
            ? `Tem certeza que deseja desativar o usuário "${getUserByIdToToggle()?.nome}"? Ele não poderá mais acessar o sistema até ser reativado.`
            : `Tem certeza que deseja ativar o usuário "${getUserByIdToToggle()?.nome}"? Ele terá acesso ao sistema novamente.`
        }
      />

      {/* Confirm criar sem cliente */}
      <ConfirmDialog
        isOpen={isConfirmNoClientOpen}
        onClose={() => setIsConfirmNoClientOpen(false)}
        onConfirm={executeCreateUserSafe}
        title="Criar sem Cliente/Projeto"
        description="Nenhum cliente ou projeto foi selecionado. O usuário receberá as credenciais por email, mas não conseguirá acessar o sistema até que um administrador o inclua em um cliente e projeto. Deseja continuar?"
        confirmText="Criar Mesmo Assim"
        cancelText="Voltar e Selecionar"
      />
    </div>
  );
};

export default UserManagement;
