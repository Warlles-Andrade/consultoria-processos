import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Users, User, Mail, FolderKanban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ResponsaveisManagement = ({ responsaveis, userProfile, projetos = [] }) => {
  const isAdmin = userProfile?.grupo === 'adm';
  const [searchTerm, setSearchTerm] = useState('');

  const filteredResponsaveis = responsaveis.filter(resp =>
    resp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (resp.email && resp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Título da página */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
          <Users className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">Responsáveis</h1>
      </div>

      {/* Card com busca e lista */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 shadow-sm">
                  <Search className="h-4 w-4 text-white" />
                </div>
                Lista de Responsáveis ({filteredResponsaveis.length})
              </CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar responsável..."
                  className="pl-10 h-11 bg-white/80 focus:bg-white border-2 border-slate-200 focus:border-purple-400 rounded-xl"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredResponsaveis.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  {searchTerm
                    ? 'Nenhum responsável encontrado com esse termo.'
                    : 'Nenhum responsável cadastrado ainda.'}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Para cadastrar responsáveis, acesse a aba Usuários.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-4 px-4 font-semibold text-slate-600 text-sm">Nome</th>
                      <th className="text-left py-4 px-4 font-semibold text-slate-600 text-sm">Email</th>
                      {isAdmin && (
                        <th className="text-left py-4 px-4 font-semibold text-slate-600 text-sm">Cliente</th>
                      )}
                      <th className="text-left py-4 px-4 font-semibold text-slate-600 text-sm">Projetos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filteredResponsaveis.map((responsavel, index) => (
                        <motion.tr
                          key={responsavel.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b border-slate-100 hover:bg-purple-50/40 transition-colors"
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-violet-100">
                                <User className="h-4 w-4 text-violet-600" />
                              </div>
                              <span className="font-medium text-slate-800">{responsavel.name}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="h-4 w-4 text-slate-400" />
                              <span>{responsavel.email || '-'}</span>
                            </div>
                          </td>
                          {isAdmin && (
                            <td className="py-4 px-4">
                              <span className="text-sm font-medium text-gray-700">{responsavel.grupo || '-'}</span>
                            </td>
                          )}
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(responsavel.projeto_ids || []).length === 0 ? (
                                <span className="text-sm text-gray-400">-</span>
                              ) : (
                                (responsavel.projeto_ids || []).map(pId => {
                                  const proj = projetos.find(p => p.id === pId);
                                  return proj ? (
                                    <span key={pId} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 font-medium">
                                      {proj.nome}
                                    </span>
                                  ) : null;
                                })
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
    </div>
  );
};

export default ResponsaveisManagement;
