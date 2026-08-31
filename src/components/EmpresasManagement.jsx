import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Trash2, Building2, Search, Edit2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';

const EmpresasManagement = ({ empresas, onRefresh, userProfile }) => {
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState(null);
  const [editingEmpresaId, setEditingEmpresaId] = useState(null);
  const [editingEmpresaName, setEditingEmpresaName] = useState('');

  const filteredEmpresas = empresas.filter(empresa =>
    empresa.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddEmpresa = async () => {
    const trimmedName = newName.trim();

    if (trimmedName === '') {
      toast({
        title: 'Erro',
        description: 'O nome da empresa é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    if (empresas.some(empresa => empresa.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast({
        title: 'Erro',
        description: 'Empresa já existe.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('empresas')
        .insert([{
          nome: trimmedName,
          grupo: userProfile?.grupo || ''
        }])
        .select()
        .single();

      if (error) throw error;

      setNewName('');
      
      toast({
        title: 'Sucesso',
        description: 'Empresa adicionada com sucesso.',
        className: 'bg-green-500 text-white'
      });

      // Atualizar lista
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Erro ao adicionar empresa:', error);
      toast({
        title: 'Erro ao adicionar',
        description: getPublicErrorMessage(error),
        variant: 'destructive'
      });
    }
  };

  const handleEditClick = (empresa) => {
    setEditingEmpresaId(empresa.id);
    setEditingEmpresaName(empresa.name);
  };

  const handleSaveEdit = async (empresaId) => {
    const trimmedName = editingEmpresaName.trim();

    if (trimmedName === '') {
      toast({
        title: 'Erro',
        description: 'O nome da empresa é obrigatório.',
        variant: 'destructive'
      });
      return;
    }

    // Verificar se já existe outra empresa com este nome
    if (empresas.some(e => e.id !== empresaId && e.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast({
        title: 'Erro',
        description: 'Já existe uma empresa com este nome.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('empresas')
        .update({
          nome: trimmedName
        })
        .eq('id', empresaId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Empresa atualizada com sucesso.',
        className: 'bg-green-500 text-white'
      });

      setEditingEmpresaId(null);
      setEditingEmpresaName('');
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Erro ao atualizar empresa:', error);
      toast({
        title: 'Erro ao atualizar',
        description: getPublicErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingEmpresaId(null);
    setEditingEmpresaName('');
  };

  const handleDeleteClick = (empresa) => {
    setEmpresaToDelete(empresa);
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!empresaToDelete) return;

    try {
      const { error } = await supabase
        .from('empresas')
        .delete()
        .eq('id', empresaToDelete.id);

      if (error) throw error;
      
      toast({
        title: 'Sucesso',
        description: 'Empresa excluída com sucesso.',
        className: 'bg-green-500 text-white'
      });

      // Atualizar lista
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Erro ao excluir empresa:', error);
      toast({
        title: 'Erro ao excluir',
        description: getPublicErrorMessage(error),
        variant: 'destructive'
      });
    } finally {
      setEmpresaToDelete(null);
      setIsConfirmDialogOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setEmpresaToDelete(null);
    setIsConfirmDialogOpen(false);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
          <Building2 className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Gerenciar Empresas
          </h1>
          <p className="text-gray-600 mt-1">Cadastre e gerencie as empresas relacionadas aos processos</p>
        </div>
      </motion.div>

      {/* Formulário de Cadastro */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="shadow-lg border-0 glass-effect">
          <CardHeader>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-purple-600" />
              Adicionar Nova Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-sm font-medium">
                  Nome da Empresa
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="nome"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Digite o nome da empresa"
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEmpresa();
                      }
                    }}
                  />
                </div>
              </div>
              <Button
                onClick={handleAddEmpresa}
                className="w-full md:w-auto bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Adicionar Empresa
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Lista de Empresas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="shadow-lg border-0 glass-effect">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-xl font-semibold">
                Lista de Empresas ({filteredEmpresas.length})
              </CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEmpresas.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {searchTerm
                    ? 'Nenhuma empresa encontrada com esse termo.'
                    : 'Nenhuma empresa cadastrada ainda.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 bg-gray-50">Empresa</th>
                      <th className="text-center py-4 px-4 font-semibold text-gray-700 bg-gray-50 w-32">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filteredEmpresas.map((empresa, index) => (
                        <motion.tr
                          key={empresa.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b border-gray-100 hover:bg-purple-50 transition-colors group"
                        >
                          <td className="py-4 px-4">
                            {editingEmpresaId === empresa.id ? (
                              <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100">
                                  <Building2 className="h-4 w-4 text-purple-600" />
                                </div>
                                <Input
                                  value={editingEmpresaName}
                                  onChange={(e) => setEditingEmpresaName(e.target.value)}
                                  className="flex-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveEdit(empresa.id);
                                    } else if (e.key === 'Escape') {
                                      handleCancelEdit();
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100">
                                  <Building2 className="h-4 w-4 text-purple-600" />
                                </div>
                                <span className="font-medium text-gray-900">{empresa.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {editingEmpresaId === empresa.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSaveEdit(empresa.id)}
                                  className="hover:bg-green-50 hover:text-green-600"
                                  title="Salvar"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  className="hover:bg-gray-50 hover:text-gray-600"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(empresa)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-50 hover:text-indigo-600"
                                  title="Editar"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(empresa)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Confirmar Exclusão"
        message={`Tem certeza que deseja excluir a empresa "${empresaToDelete?.name}"? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default EmpresasManagement;
