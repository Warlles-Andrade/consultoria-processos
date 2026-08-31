import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Trash2, Shield, Search, Layers, Check, Edit2, ChevronDown, ChevronUp, FolderKanban, FolderPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { Badge } from '@/components/ui/badge';

const GruposManagement = ({ currentUserProfile, onRefresh }) => {
  const { toast } = useToast();

  // Capitalizar a primeira letra de cada palavra (unicode-aware: preserva acentos)
  const capitalizeWords = (str) => str.replace(/(^|\s)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

  // Clientes (from grupos table)
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClienteId, setExpandedClienteId] = useState(null);
  const [newProjetoInputs, setNewProjetoInputs] = useState({}); // { [clienteId]: string }

  // Confirm delete cliente
  const [isConfirmClienteDialogOpen, setIsConfirmClienteDialogOpen] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState(null);

  // Edit cliente
  const [isEditClienteDialogOpen, setIsEditClienteDialogOpen] = useState(false);
  const [clienteToEdit, setClienteToEdit] = useState(null);
  const [editClienteData, setEditClienteData] = useState({ nome: '', descricao: '', cor: '#6366f1' });

  // Confirm delete projeto
  const [isConfirmProjetoDialogOpen, setIsConfirmProjetoDialogOpen] = useState(false);
  const [projetoToDelete, setProjetoToDelete] = useState(null);

  // New cliente form
  const [newCliente, setNewCliente] = useState({ nome: '', descricao: '', cor: '#6366f1' });
  const [isAddClienteDialogOpen, setIsAddClienteDialogOpen] = useState(false);

  // New projeto modal
  const [isAddProjetoDialogOpen, setIsAddProjetoDialogOpen] = useState(false);
  const [addProjetoClienteId, setAddProjetoClienteId] = useState(null);
  const [addProjetoNome, setAddProjetoNome] = useState('');

  const isAdmin = currentUserProfile?.grupo === 'adm';

  useEffect(() => {
    if (isAdmin) {
      fetchClientes();
      fetchProjetos();
    }
  }, [isAdmin]);

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast({ title: 'Erro ao carregar clientes', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
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
      // tabela pode ainda não existir
      console.warn('Tabela projetos não encontrada:', error.message);
    }
  };

  const handleAddCliente = async () => {
    const trimmedNome = capitalizeWords(newCliente.nome.trim());
    const trimmedDescricao = newCliente.descricao.trim();

    if (!trimmedNome) {
      toast({ title: 'Erro', description: 'O nome do cliente é obrigatório.', variant: 'destructive' });
      return;
    }
    if (clientes.some(c => c.nome.toLowerCase() === trimmedNome.toLowerCase())) {
      toast({ title: 'Erro', description: 'Já existe um cliente com este nome.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{ nome: trimmedNome, descricao: trimmedDescricao, cor: newCliente.cor, is_admin: false }])
        .select().single();
      if (error) throw error;
      setClientes([...clientes, data]);
      setNewCliente({ nome: '', descricao: '', cor: '#6366f1' });
      setIsAddClienteDialogOpen(false);
      toast({ title: 'Sucesso', description: 'Cliente adicionado com sucesso.', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao adicionar cliente', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleEditClienteClick = (cliente) => {
    setClienteToEdit(cliente);
    setEditClienteData({ nome: cliente.nome, descricao: cliente.descricao || '', cor: cliente.cor || '#6366f1' });
    setIsEditClienteDialogOpen(true);
  };

  const handleConfirmEditCliente = async () => {
    if (!clienteToEdit) return;
    const trimmedNome = capitalizeWords(editClienteData.nome.trim());
    const trimmedDescricao = editClienteData.descricao.trim();

    if (!trimmedNome) {
      toast({ title: 'Erro', description: 'O nome do cliente é obrigatório.', variant: 'destructive' });
      return;
    }
    if (clientes.some(c => c.id !== clienteToEdit.id && c.nome.toLowerCase() === trimmedNome.toLowerCase())) {
      toast({ title: 'Erro', description: 'Já existe um cliente com este nome.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('clientes')
        .update({ nome: trimmedNome, descricao: trimmedDescricao, cor: editClienteData.cor, updated_at: new Date().toISOString() })
        .eq('id', clienteToEdit.id);
      if (error) throw error;
      // Propaga o novo nome para as tabelas que referenciam o cliente por nome (denormalizado, sem FK)
      if (clienteToEdit.nome && clienteToEdit.nome !== trimmedNome) {
        await supabase.from('user_profiles').update({ grupo: trimmedNome, updated_at: new Date().toISOString() }).eq('grupo', clienteToEdit.nome);
        await supabase.from('responsaveis').update({ grupo: trimmedNome }).eq('grupo', clienteToEdit.nome);
      }
      toast({ title: 'Sucesso', description: 'Cliente atualizado com sucesso.', className: 'bg-green-500 text-white' });
      fetchClientes();
      setIsEditClienteDialogOpen(false);
      setClienteToEdit(null);
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao atualizar', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleDeleteClienteClick = (cliente) => {
    if (cliente.is_admin) {
      toast({ title: 'Erro', description: 'Não é possível excluir clientes de administrador.', variant: 'destructive' });
      return;
    }
    setClienteToDelete(cliente);
    setIsConfirmClienteDialogOpen(true);
  };

  const handleConfirmDeleteCliente = async () => {
    if (!clienteToDelete) return;
    try {
      // Verificar se existem processos vinculados a este cliente
      const projetosDoCliente = projetos.filter(p => p.cliente_id === clienteToDelete.id).map(p => p.id);

      // Verificar processos pelo grupo (nome do cliente) OU pelo projeto_id
      const { count: countByGrupo } = await supabase
        .from('processos')
        .select('id', { count: 'exact', head: true })
        .eq('grupo', clienteToDelete.nome);

      let countByProjeto = 0;
      if (projetosDoCliente.length > 0) {
        const { count } = await supabase
          .from('processos')
          .select('id', { count: 'exact', head: true })
          .in('projeto_id', projetosDoCliente);
        countByProjeto = count || 0;
      }

      const totalProcessos = Math.max(countByGrupo || 0, countByProjeto);
      if (totalProcessos > 0) {
        toast({
          title: 'Não é possível excluir',
          description: `Este cliente possui ${totalProcessos} processo(s) vinculado(s). Remova ou mova os processos antes de excluir o cliente.`,
          variant: 'destructive',
          duration: 7000,
        });
        setIsConfirmClienteDialogOpen(false);
        setClienteToDelete(null);
        return;
      }

      // NOVO: Verificar se existem usuários vinculados diretamente ao grupo (cliente)
      const { data: directUsers } = await supabase
        .from('user_profiles')
        .select('nome')
        .eq('grupo', clienteToDelete.nome);
      if (directUsers && directUsers.length > 0) {
        const nomes = directUsers.map(u => u.nome).filter(Boolean).join(', ') || 'usuários desconhecidos';
        toast({
          title: 'Não é possível excluir',
          description: `Este cliente possui usuários vinculados: ${nomes}. Remova ou remaneje os usuários antes de excluir o cliente.`,
          variant: 'destructive',
          duration: 7000,
        });
        setIsConfirmClienteDialogOpen(false);
        setClienteToDelete(null);
        return;
      }

      // Verificar se existem usuários vinculados aos projetos deste cliente
      if (projetosDoCliente.length > 0) {
        const { data: userLinks } = await supabase
          .from('user_projetos')
          .select('user_profile_id')
          .in('projeto_id', projetosDoCliente);

        if (userLinks && userLinks.length > 0) {
          const profileIds = [...new Set(userLinks.map(u => u.user_profile_id))];
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('nome')
            .in('id', profileIds);

          const nomes = profiles?.map(p => p.nome).filter(Boolean).join(', ') || 'usuários desconhecidos';
          toast({
            title: 'Não é possível excluir',
            description: `Este cliente possui usuários vinculados: ${nomes}. Remova os usuários do cliente antes de excluí-lo.`,
            variant: 'destructive',
            duration: 7000,
          });
          setIsConfirmClienteDialogOpen(false);
          setClienteToDelete(null);
          return;
        }
      }

      // Sem processos e sem usuários — pode excluir
      await supabase.from('responsaveis').update({ grupo: null }).eq('grupo', clienteToDelete.nome);
      await supabase.from('user_profiles').update({ grupo: 'sem_grupo', updated_at: new Date().toISOString() }).eq('grupo', clienteToDelete.nome);
      const { error } = await supabase.from('clientes').delete().eq('id', clienteToDelete.id);
      if (error) throw error;
      setClientes(clientes.filter(c => c.id !== clienteToDelete.id));
      setProjetos(projetos.filter(p => p.cliente_id !== clienteToDelete.id));
      toast({ title: 'Sucesso', description: 'Cliente excluído com sucesso.', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsConfirmClienteDialogOpen(false);
      setClienteToDelete(null);
    }
  };

  // Projeto handlers
  const getProjetosForCliente = (clienteId) => projetos.filter(p => p.cliente_id === clienteId);

  const handleOpenAddProjeto = (clienteId) => {
    setAddProjetoClienteId(clienteId);
    setAddProjetoNome('');
    setIsAddProjetoDialogOpen(true);
  };

  const handleAddProjetoFromModal = async () => {
    const nome = addProjetoNome.trim();
    if (!nome) {
      toast({ title: 'Erro', description: 'O nome do projeto é obrigatório.', variant: 'destructive' });
      return;
    }
    if (getProjetosForCliente(addProjetoClienteId).some(p => p.nome.toLowerCase() === nome.toLowerCase())) {
      toast({ title: 'Erro', description: 'Já existe um projeto com este nome neste cliente.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.from('projetos')
        .insert([{ cliente_id: addProjetoClienteId, nome }]).select().single();
      if (error) throw error;
      setProjetos([...projetos, data]);
      setIsAddProjetoDialogOpen(false);
      setAddProjetoNome('');
      toast({ title: 'Sucesso', description: 'Projeto adicionado.', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao adicionar projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleAddProjeto = async (clienteId) => {
    const nome = (newProjetoInputs[clienteId] || '').trim();
    if (!nome) {
      toast({ title: 'Erro', description: 'O nome do projeto é obrigatório.', variant: 'destructive' });
      return;
    }
    if (getProjetosForCliente(clienteId).some(p => p.nome.toLowerCase() === nome.toLowerCase())) {
      toast({ title: 'Erro', description: 'Já existe um projeto com este nome neste cliente.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.from('projetos')
        .insert([{ cliente_id: clienteId, nome }]).select().single();
      if (error) throw error;
      setProjetos([...projetos, data]);
      setNewProjetoInputs(prev => ({ ...prev, [clienteId]: '' }));
      toast({ title: 'Sucesso', description: 'Projeto adicionado.', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao adicionar projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleDeleteProjetoClick = (projeto) => {
    setProjetoToDelete(projeto);
    setIsConfirmProjetoDialogOpen(true);
  };

  const handleConfirmDeleteProjeto = async () => {
    if (!projetoToDelete) return;
    try {
      // Verificar se existem processos vinculados a este projeto
      const { count } = await supabase
        .from('processos')
        .select('id', { count: 'exact', head: true })
        .eq('projeto_id', projetoToDelete.id);

      if ((count || 0) > 0) {
        toast({
          title: 'Não é possível excluir',
          description: `Este projeto possui ${count} processo(s) vinculado(s). Remova ou mova os processos antes de excluir o projeto.`,
          variant: 'destructive',
          duration: 7000,
        });
        setIsConfirmProjetoDialogOpen(false);
        setProjetoToDelete(null);
        return;
      }

      // Verificar se existem usuários vinculados a este projeto
      const { data: userLinks } = await supabase
        .from('user_projetos')
        .select('user_profile_id')
        .eq('projeto_id', projetoToDelete.id);

      if (userLinks && userLinks.length > 0) {
        const profileIds = [...new Set(userLinks.map(u => u.user_profile_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('nome')
          .in('id', profileIds);

        const nomes = profiles?.map(p => p.nome).filter(Boolean).join(', ') || 'usuários desconhecidos';
        toast({
          title: 'Não é possível excluir',
          description: `Este projeto possui usuários vinculados: ${nomes}. Remova os usuários do projeto antes de excluí-lo.`,
          variant: 'destructive',
          duration: 7000,
        });
        setIsConfirmProjetoDialogOpen(false);
        setProjetoToDelete(null);
        return;
      }

      // Sem processos e sem usuários — pode excluir
      const { error } = await supabase.from('projetos').delete().eq('id', projetoToDelete.id);
      if (error) throw error;
      setProjetos(projetos.filter(p => p.id !== projetoToDelete.id));
      toast({ title: 'Sucesso', description: 'Projeto excluído.', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao excluir projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsConfirmProjetoDialogOpen(false);
      setProjetoToDelete(null);
    }
  };

  const toggleExpandCliente = (clienteId) => {
    setExpandedClienteId(prev => (prev === clienteId ? null : clienteId));
  };

  const filteredClientes = clientes.filter(c =>
    c.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6 p-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">Acesso Negado</h1>
            <p className="text-gray-600 mt-1">Apenas administradores podem acessar esta seção</p>
          </div>
        </motion.div>
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardContent className="p-8 text-center">
            <Shield className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Você não tem permissão para gerenciar clientes.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 shadow-lg">
          <Layers className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Gerenciar Clientes
          </h1>
          <p className="text-gray-600 mt-1">Crie e gerencie clientes e seus projetos</p>
        </div>
      </motion.div>

      {/* Clientes List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-xl font-semibold">Clientes Cadastrados ({filteredClientes.length})</CardTitle>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar cliente..." className="pl-10" />
                </div>
                <Button onClick={() => setIsAddClienteDialogOpen(true)} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white rounded-xl whitespace-nowrap">
                  <PlusCircle className="h-4 w-4 mr-2" />Novo Cliente
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <Layers className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-500">Carregando clientes...</p>
              </div>
            ) : filteredClientes.length === 0 ? (
              <div className="text-center py-12">
                <Layers className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">{searchTerm ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {filteredClientes.map((cliente, index) => {
                    const clienteProjetos = getProjetosForCliente(cliente.id);
                    const isExpanded = expandedClienteId === cliente.id;
                    return (
                      <motion.div
                        key={cliente.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.05 }}
                        className="group"
                      >
                        <Card
                          className="h-full border-2 hover:border-violet-300 transition-all duration-300 hover:shadow-lg"
                          style={{ borderLeftWidth: '4px', borderLeftColor: cliente.cor }}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              {/* Cliente header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${cliente.cor}20` }}>
                                    <Layers className="h-5 w-5" style={{ color: cliente.cor }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <h3 className="font-semibold text-gray-900 text-lg capitalize break-words min-w-0">{cliente.nome}</h3>
                                      {cliente.is_admin && (
                                        <Badge className="bg-gradient-to-r from-red-500 to-rose-600 text-white">
                                          <Shield className="h-3 w-3 mr-1" />Admin
                                        </Badge>
                                      )}
                                    </div>
                                    {cliente.descricao && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{cliente.descricao}</p>}
                                  </div>
                                </div>
                                {!cliente.is_admin && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditClienteClick(cliente)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-indigo-50 hover:text-indigo-600" title="Editar cliente">
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClienteClick(cliente)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600" title="Excluir cliente">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Projetos section - only for non-admin */}
                              {!cliente.is_admin && (
                                <div className="pt-2 border-t border-gray-100">
                                  <button
                                    onClick={() => toggleExpandCliente(cliente.id)}
                                    className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-violet-600 transition-colors"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <FolderKanban className="h-4 w-4" />
                                      Projetos ({clienteProjetos.length})
                                    </span>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </button>

                                  <AnimatePresence>
                                    {isExpanded && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="mt-3 space-y-2">
                                          {clienteProjetos.length === 0 && (
                                            <p className="text-xs text-gray-400 italic">Nenhum projeto cadastrado.</p>
                                          )}
                                          {clienteProjetos.map(projeto => (
                                            <div key={projeto.id} className="flex items-center justify-between p-2 bg-violet-50 rounded-lg group/projeto">
                                              <div className="flex items-center gap-2">
                                                <FolderKanban className="h-3.5 w-3.5 text-violet-500" />
                                                <span className="text-sm font-medium text-gray-800">{projeto.nome}</span>
                                              </div>
                                              <Button
                                                variant="ghost" size="sm"
                                                onClick={() => handleDeleteProjetoClick(projeto)}
                                                className="h-6 w-6 p-0 opacity-100 sm:opacity-0 sm:group-hover/projeto:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"
                                                title="Excluir projeto"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          ))}
                                          {/* Add new projeto */}
                                          <Button
                                            size="sm"
                                            onClick={() => handleOpenAddProjeto(cliente.id)}
                                            className="mt-2 w-full h-8 bg-violet-500 hover:bg-violet-600 text-white text-xs"
                                          >
                                            <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Novo Projeto
                                          </Button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}

                              {/* Footer */}
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>Criado em {new Date(cliente.created_at).toLocaleDateString('pt-BR')}</span>
                                <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: cliente.cor }} title={cliente.cor} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal: Adicionar Cliente */}
      <Dialog open={isAddClienteDialogOpen} onOpenChange={setIsAddClienteDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <PlusCircle className="h-5 w-5 text-violet-600" />Novo Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Cliente *</Label>
              <Input
                value={newCliente.nome}
                onChange={(e) => setNewCliente({ ...newCliente, nome: e.target.value })}
                placeholder="Ex: Empresa Acme..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCliente(); } }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={newCliente.descricao}
                onChange={(e) => setNewCliente({ ...newCliente, descricao: e.target.value })}
                placeholder="Breve descrição (opcional)"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input type="color" value={newCliente.cor} onChange={(e) => setNewCliente({ ...newCliente, cor: e.target.value })} className="w-16 h-10 cursor-pointer" />
                <Input value={newCliente.cor} onChange={(e) => setNewCliente({ ...newCliente, cor: e.target.value })} placeholder="#6366f1" className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddClienteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddCliente} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              <PlusCircle className="h-4 w-4 mr-2" />Adicionar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Cliente */}
      <Dialog open={isEditClienteDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditClienteDialogOpen(false); setClienteToEdit(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Edit2 className="h-5 w-5 text-violet-600" />Editar Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Cliente *</Label>
              <Input value={editClienteData.nome} onChange={(e) => setEditClienteData({ ...editClienteData, nome: e.target.value })} placeholder="Nome do cliente" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={editClienteData.descricao} onChange={(e) => setEditClienteData({ ...editClienteData, descricao: e.target.value })} placeholder="Descrição" />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input type="color" value={editClienteData.cor} onChange={(e) => setEditClienteData({ ...editClienteData, cor: e.target.value })} className="w-16 h-10 cursor-pointer" />
                <Input value={editClienteData.cor} onChange={(e) => setEditClienteData({ ...editClienteData, cor: e.target.value })} className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditClienteDialogOpen(false); setClienteToEdit(null); }}>Cancelar</Button>
            <Button onClick={handleConfirmEditCliente} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              <Check className="h-4 w-4 mr-2" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Adicionar Projeto */}
      <Dialog open={isAddProjetoDialogOpen} onOpenChange={setIsAddProjetoDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FolderPlus className="h-5 w-5 text-violet-600" />Novo Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Projeto *</Label>
              <Input
                value={addProjetoNome}
                onChange={(e) => setAddProjetoNome(e.target.value)}
                placeholder="Ex: Projeto Alpha..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProjetoFromModal(); } }}
                autoFocus
              />
            </div>
            {addProjetoClienteId && (
              <p className="text-sm text-slate-500">
                Cliente: <span className="font-medium text-slate-700">{clientes.find(c => c.id === addProjetoClienteId)?.nome}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProjetoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddProjetoFromModal} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              <PlusCircle className="h-4 w-4 mr-2" />Adicionar Projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete cliente */}
      <ConfirmDialog
        isOpen={isConfirmClienteDialogOpen}
        onClose={() => { setIsConfirmClienteDialogOpen(false); setClienteToDelete(null); }}
        onConfirm={handleConfirmDeleteCliente}
        title="Excluir Cliente"
        description={`Tem certeza que deseja excluir o cliente "${clienteToDelete?.nome}"? Todos os projetos vinculados serão excluídos e as tarefas terão o cliente/projeto removido.`}
      />

      {/* Confirm delete projeto */}
      <ConfirmDialog
        isOpen={isConfirmProjetoDialogOpen}
        onClose={() => { setIsConfirmProjetoDialogOpen(false); setProjetoToDelete(null); }}
        onConfirm={handleConfirmDeleteProjeto}
        title="Excluir Projeto"
        description={`Tem certeza que deseja excluir o projeto "${projetoToDelete?.nome}"? As tarefas vinculadas terão o projeto removido.`}
      />
    </div>
  );
};

export default GruposManagement;

