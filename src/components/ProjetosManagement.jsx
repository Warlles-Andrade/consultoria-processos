import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Trash2, Search, FolderKanban, Edit2, Check, Loader2, Share2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';

const ProjetosManagement = ({ currentUserProfile, onRefresh }) => {
  const { toast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteFilter, setClienteFilter] = useState('all');

  const [newProjeto, setNewProjeto] = useState({ nome: '', cliente_id: '', descricao: '' });
  const [isAddProjetoDialogOpen, setIsAddProjetoDialogOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({ nome: '', cliente_id: '', descricao: '' });
  const [isEditProjetoDialogOpen, setIsEditProjetoDialogOpen] = useState(false);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [projetoToDelete, setProjetoToDelete] = useState(null);

  // Compartilhamento
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareProjeto, setShareProjeto] = useState(null);
  const [shareCandidates, setShareCandidates] = useState([]); // membros do mesmo cliente
  const [shareSelected, setShareSelected] = useState(new Set()); // profile ids marcados
  const [shareOriginal, setShareOriginal] = useState(new Set());
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);

  const isAdmin = currentUserProfile?.grupo === 'adm';
  const myUserId = currentUserProfile?.user_id;   // = created_by (auth.uid)
  const myProfileId = currentUserProfile?.id;      // = user_projetos.user_profile_id

  useEffect(() => {
    if (currentUserProfile) {
      fetchClientes();
      fetchProjetos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserProfile]);

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      setClientes((data || []).filter(g => !g.is_admin));
    } catch (error) {
      toast({ title: 'Erro ao carregar clientes', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const fetchProjetos = async () => {
    setLoading(true);
    try {
      // RLS já limita: admin vê todos; membro vê os próprios + compartilhados
      const { data, error } = await supabase
        .from('projetos')
        .select('*, clientes(nome, cor)')
        .order('nome', { ascending: true });
      if (error) throw error;
      setProjetos(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar projetos', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Só posso gerenciar (editar/excluir/compartilhar) projetos que criei (ou sou admin)
  const canManage = (projeto) => isAdmin || projeto.created_by === myUserId;

  // Clientes onde posso criar projeto: admin em qualquer um; membro no seu grupo
  // ou em clientes de projetos que ele já acessa (espelha a RLS).
  const accessibleClientes = isAdmin
    ? clientes
    : clientes.filter(c =>
        c.nome === currentUserProfile?.grupo ||
        projetos.some(p => p.cliente_id === c.id)
      );

  const handleAddProjeto = async () => {
    const nome = newProjeto.nome.trim();
    if (!nome) {
      toast({ title: 'Erro', description: 'O nome do projeto é obrigatório.', variant: 'destructive' });
      return;
    }
    if (!newProjeto.cliente_id) {
      toast({ title: 'Erro', description: 'Selecione um cliente para o projeto.', variant: 'destructive' });
      return;
    }
    if (projetos.some(p => p.nome.toLowerCase() === nome.toLowerCase() && p.cliente_id === newProjeto.cliente_id)) {
      toast({ title: 'Erro', description: 'Já existe um projeto com este nome neste cliente.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('projetos')
        .insert([{ nome, cliente_id: newProjeto.cliente_id, descricao: newProjeto.descricao.trim() || null, created_by: myUserId }])
        .select('*, clientes(nome, cor)')
        .single();
      if (error) throw error;

      // Auto-vincular o criador (membro) para enxergar as tarefas do projeto
      if (!isAdmin && myProfileId) {
        const { error: linkError } = await supabase
          .from('user_projetos')
          .insert([{ user_profile_id: myProfileId, projeto_id: data.id }]);
        if (linkError) console.error('Erro ao vincular criador ao projeto:', linkError);
      }

      setProjetos(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setNewProjeto({ nome: '', cliente_id: '', descricao: '' });
      setIsAddProjetoDialogOpen(false);
      toast({ title: 'Projeto criado!', description: `"${data.nome}" foi adicionado.`, className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao criar projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleEditClick = (projeto) => {
    setEditingId(projeto.id);
    setEditingData({ nome: projeto.nome, cliente_id: projeto.cliente_id, descricao: projeto.descricao || '' });
    setIsEditProjetoDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    const nome = editingData.nome.trim();
    if (!nome) {
      toast({ title: 'Erro', description: 'O nome do projeto é obrigatório.', variant: 'destructive' });
      return;
    }
    if (!editingData.cliente_id) {
      toast({ title: 'Erro', description: 'Selecione um cliente.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('projetos')
        .update({
          nome,
          cliente_id: editingData.cliente_id,
          descricao: editingData.descricao.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);
      if (error) throw error;
      toast({ title: 'Projeto atualizado!', className: 'bg-green-500 text-white' });
      fetchProjetos();
      setEditingId(null);
      setIsEditProjetoDialogOpen(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao atualizar projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleDeleteClick = (projeto) => {
    setProjetoToDelete(projeto);
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
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
        setIsConfirmDialogOpen(false);
        setProjetoToDelete(null);
        return;
      }

      // Remover vínculos de usuários (compartilhamentos) antes de excluir
      await supabase.from('user_projetos').delete().eq('projeto_id', projetoToDelete.id);

      const { error } = await supabase.from('projetos').delete().eq('id', projetoToDelete.id);
      if (error) throw error;
      setProjetos(prev => prev.filter(p => p.id !== projetoToDelete.id));
      toast({ title: 'Projeto excluído!', className: 'bg-green-500 text-white' });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao excluir projeto', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsConfirmDialogOpen(false);
      setProjetoToDelete(null);
    }
  };

  // ---- Compartilhamento ----
  const handleShareClick = async (projeto) => {
    setShareProjeto(projeto);
    setIsShareDialogOpen(true);
    setShareLoading(true);
    try {
      const clienteNome = projeto.clientes?.nome || clientes.find(c => c.id === projeto.cliente_id)?.nome;

      // Candidatos: membros ativos do mesmo cliente (pelo grupo), exceto admin e o próprio criador
      const { data: profs, error: profErr } = await supabase
        .from('user_profiles')
        .select('id, nome, grupo, user_id, ativo')
        .eq('grupo', clienteNome)
        .eq('ativo', true);
      if (profErr) throw profErr;
      const candidates = (profs || []).filter(p => p.user_id !== projeto.created_by);

      // Vínculos atuais deste projeto
      const { data: links, error: linkErr } = await supabase
        .from('user_projetos')
        .select('user_profile_id')
        .eq('projeto_id', projeto.id);
      if (linkErr) throw linkErr;
      const linkedIds = new Set((links || []).map(l => l.user_profile_id));

      const selected = new Set(candidates.filter(c => linkedIds.has(c.id)).map(c => c.id));
      setShareCandidates(candidates);
      setShareSelected(selected);
      setShareOriginal(new Set(selected));
    } catch (error) {
      toast({ title: 'Erro ao carregar membros', description: getPublicErrorMessage(error), variant: 'destructive' });
      setShareCandidates([]);
      setShareSelected(new Set());
      setShareOriginal(new Set());
    } finally {
      setShareLoading(false);
    }
  };

  const toggleShareMember = (profileId) => {
    setShareSelected(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const handleSaveShare = async () => {
    if (!shareProjeto) return;
    setShareSaving(true);
    try {
      const toAdd = [...shareSelected].filter(id => !shareOriginal.has(id));
      const toRemove = [...shareOriginal].filter(id => !shareSelected.has(id));

      if (toAdd.length > 0) {
        const rows = toAdd.map(pid => ({ user_profile_id: pid, projeto_id: shareProjeto.id }));
        const { error } = await supabase.from('user_projetos').insert(rows);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('user_projetos')
          .delete()
          .eq('projeto_id', shareProjeto.id)
          .in('user_profile_id', toRemove);
        if (error) throw error;
      }

      toast({ title: 'Compartilhamento atualizado!', className: 'bg-green-500 text-white' });
      setIsShareDialogOpen(false);
      setShareProjeto(null);
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: 'Erro ao compartilhar', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setShareSaving(false);
    }
  };

  const filteredProjetos = projetos.filter(p => {
    const matchesSearch =
      p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientes?.nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCliente = clienteFilter === 'all' || p.cliente_id === clienteFilter;
    return matchesSearch && matchesCliente;
  });

  const getClienteBadgeStyle = (clienteId) => {
    const c = clientes.find(cl => cl.id === clienteId);
    if (c?.cor) return { background: `linear-gradient(to right, ${c.cor}, ${c.cor}bb)` };
    return { background: 'linear-gradient(to right, #6366f1, #8b5cf6)' };
  };

  const getClienteNome = (clienteId) => {
    const c = clientes.find(cl => cl.id === clienteId) || { nome: projetos.find(p => p.cliente_id === clienteId)?.clientes?.nome || '' };
    return c.nome ? c.nome : '—';
  };

  if (!currentUserProfile) {
    return (
      <div className="flex items-center justify-center py-24 gap-3">
        <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
        <p className="text-gray-500 text-lg">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 shadow-lg">
          <FolderKanban className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            {isAdmin ? 'Gerenciar Projetos' : 'Meus Projetos'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isAdmin
              ? 'Crie e gerencie projetos vinculados aos clientes'
              : 'Crie projetos nos seus clientes e compartilhe com sua equipe'}
          </p>
        </div>
      </motion.div>

      {/* List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-lg border-0 glass-card border-white/60">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-xl font-semibold">
                Projetos {isAdmin ? 'Cadastrados' : 'Disponíveis'} ({filteredProjetos.length})
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={clienteFilter} onValueChange={setClienteFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Clientes</SelectItem>
                    {(isAdmin ? clientes : accessibleClientes).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar projeto..."
                    className="pl-10 w-full sm:w-64"
                  />
                </div>
                <Button
                  onClick={() => { setNewProjeto({ nome: '', cliente_id: '', descricao: '' }); setIsAddProjetoDialogOpen(true); }}
                  disabled={accessibleClientes.length === 0}
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white rounded-xl whitespace-nowrap"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />Novo Projeto
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <FolderKanban className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-500">Carregando projetos...</p>
              </div>
            ) : filteredProjetos.length === 0 ? (
              <div className="text-center py-12">
                <FolderKanban className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {searchTerm || clienteFilter !== 'all'
                    ? 'Nenhum projeto encontrado com esses filtros.'
                    : 'Nenhum projeto ainda. Adicione o primeiro acima.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Projeto</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Cliente</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Descrição</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 bg-gray-50 w-32">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filteredProjetos.map((projeto, index) => (
                        <motion.tr
                          key={projeto.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.02 }}
                          className="border-b border-gray-100 hover:bg-violet-50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                              <span className="font-medium text-gray-900">{projeto.nome}</span>
                              {!isAdmin && projeto.created_by !== myUserId && (
                                <Badge variant="secondary" className="text-xs">Compartilhado</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className="text-white px-3 py-1 text-sm" style={getClienteBadgeStyle(projeto.cliente_id)}>
                              {getClienteNome(projeto.cliente_id)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-500">{projeto.descricao || '—'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1">
                              {canManage(projeto) ? (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => handleShareClick(projeto)} className="hover:bg-blue-50 hover:text-blue-600" title="Compartilhar">
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleEditClick(projeto)} className="hover:bg-violet-50 hover:text-violet-600" title="Editar">
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteClick(projeto)} className="hover:bg-red-50 hover:text-red-600" title="Excluir">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
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

      {/* Modal: Adicionar Projeto */}
      <Dialog open={isAddProjetoDialogOpen} onOpenChange={setIsAddProjetoDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <PlusCircle className="h-5 w-5 text-violet-600" />Novo Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Projeto *</Label>
              <Input
                value={newProjeto.nome}
                onChange={(e) => setNewProjeto({ ...newProjeto, nome: e.target.value })}
                placeholder="Ex: Projeto Alfa..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProjeto(); } }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={newProjeto.cliente_id} onValueChange={(v) => setNewProjeto({ ...newProjeto, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {accessibleClientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={newProjeto.descricao}
                onChange={(e) => setNewProjeto({ ...newProjeto, descricao: e.target.value })}
                placeholder="Breve descrição (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProjetoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddProjeto} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              <PlusCircle className="h-4 w-4 mr-2" />Adicionar Projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Projeto */}
      <Dialog open={isEditProjetoDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditProjetoDialogOpen(false); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Edit2 className="h-5 w-5 text-violet-600" />Editar Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Projeto *</Label>
              <Input
                value={editingData.nome}
                onChange={(e) => setEditingData({ ...editingData, nome: e.target.value })}
                placeholder="Nome do projeto"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={editingData.cliente_id} onValueChange={(v) => setEditingData({ ...editingData, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {accessibleClientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={editingData.descricao}
                onChange={(e) => setEditingData({ ...editingData, descricao: e.target.value })}
                placeholder="Descrição opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditProjetoDialogOpen(false); setEditingId(null); }}>Cancelar</Button>
            <Button onClick={handleSaveEdit} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              <Check className="h-4 w-4 mr-2" />Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Compartilhar Projeto */}
      <Dialog open={isShareDialogOpen} onOpenChange={(open) => { if (!open) { setIsShareDialogOpen(false); setShareProjeto(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Share2 className="h-5 w-5 text-blue-600" />Compartilhar Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Projeto <span className="font-semibold text-gray-800">{shareProjeto?.nome}</span> — membros de{' '}
              <span className="font-semibold text-gray-800">{shareProjeto?.clientes?.nome || getClienteNome(shareProjeto?.cliente_id)}</span> que
              poderão visualizar:
            </p>
            {shareLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando membros...
              </div>
            ) : shareCandidates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Nenhum outro membro neste cliente para compartilhar.</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
                {shareCandidates.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-violet-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareSelected.has(m.id)}
                      onChange={() => toggleShareMember(m.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">{m.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsShareDialogOpen(false); setShareProjeto(null); }}>Cancelar</Button>
            <Button onClick={handleSaveShare} disabled={shareLoading || shareSaving} className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600">
              {shareSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => { setIsConfirmDialogOpen(false); setProjetoToDelete(null); }}
        onConfirm={handleConfirmDelete}
        title="Excluir Projeto"
        description={`Tem certeza que deseja excluir o projeto "${projetoToDelete?.nome}"? As tarefas vinculadas terão o projeto removido, mas não serão excluídas.`}
      />
    </div>
  );
};

export default ProjetosManagement;
