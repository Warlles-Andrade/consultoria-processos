import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Database } from 'lucide-react';

export default function DiagnosticoStatus() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (tipo, mensagem, dados = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { 
      timestamp, 
      tipo, 
      mensagem, 
      dados: dados ? JSON.stringify(dados, null, 2) : null 
    }]);
  };

  const verificarUsuarios = async () => {
    setLoading(true);
    setLogs([]);
    addLog('info', '🔍 Iniciando verificação...');

    try {
      // Tentar com RPC primeiro
      addLog('info', '📡 Tentando buscar com RPC get_user_profiles_with_email()');
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_user_profiles_with_email');

      if (rpcData && !rpcError) {
        addLog('success', '✅ RPC funcionou! Dados recebidos:', rpcData);
        const formattedData = rpcData.map(profile => ({
          user_id: profile.user_id,
          nome: profile.nome,
          email: profile.email,
          grupo: profile.grupo,
          ativo: profile.ativo !== false,
          ativo_raw: profile.ativo,
          created_at: profile.created_at
        }));
        setUsuarios(formattedData);
        addLog('info', '📊 Dados formatados:', formattedData);
      } else {
        addLog('warning', '⚠️ RPC falhou, tentando query direta', rpcError);
        
        // Fallback: query direta
        const { data: authData } = await supabase.auth.getSession();
        addLog('info', '🔑 Sessão atual:', authData);

        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('*');

        if (profilesError) {
          addLog('error', '❌ Erro ao buscar perfis:', profilesError);
          throw profilesError;
        }

        addLog('success', '✅ Perfis buscados diretamente:', profiles);

        const formattedData = profiles.map(profile => ({
          user_id: profile.user_id,
          nome: profile.nome,
          email: 'N/A (sem RPC)',
          grupo: profile.grupo,
          ativo: profile.ativo !== false,
          ativo_raw: profile.ativo,
          created_at: profile.created_at
        }));
        setUsuarios(formattedData);
        addLog('info', '📊 Dados formatados (fallback):', formattedData);
      }

    } catch (error) {
      addLog('error', '❌ Erro geral:', error);
      console.error('Erro na verificação:', error);
    } finally {
      setLoading(false);
      addLog('info', '✅ Verificação concluída');
    }
  };

  const testarUpdate = async (userId, novoStatus) => {
    addLog('info', `🔄 Testando update do usuário ${userId} para status: ${novoStatus}`);
    
    try {
      const updateData = {
        ativo: novoStatus,
        updated_at: new Date().toISOString()
      };
      
      addLog('info', '📦 Dados do update:', updateData);

      const { data, error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select();

      if (error) {
        addLog('error', '❌ Erro no update:', error);
        throw error;
      }

      addLog('success', '✅ Update executado com sucesso:', data);
      
      // Verificar se realmente atualizou
      const { data: verificacao, error: errVerificacao } = await supabase
        .from('user_profiles')
        .select('nome, ativo')
        .eq('user_id', userId)
        .single();

      if (errVerificacao) {
        addLog('error', '❌ Erro na verificação:', errVerificacao);
      } else {
        addLog('info', '🔍 Verificação pós-update:', verificacao);
      }

      // Recarregar lista
      await verificarUsuarios();
      
    } catch (error) {
      addLog('error', '❌ Erro ao testar update:', error);
      console.error('Erro no teste de update:', error);
    }
  };

  useEffect(() => {
    verificarUsuarios();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            Diagnóstico de Status dos Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Esta página ajuda a diagnosticar problemas com o campo <code className="bg-gray-200 px-1 rounded">ativo</code> na tabela <code className="bg-gray-200 px-1 rounded">user_profiles</code>.
            </p>
            <Button onClick={verificarUsuarios} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Recarregar Verificação
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Usuários */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários Cadastrados ({usuarios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {usuarios.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum usuário encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Grupo</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status (Raw)</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status (Display)</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Ações de Teste</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usuarios.map((user) => (
                    <tr key={user.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{user.nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge>{user.grupo}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {String(user.ativo_raw)}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {user.ativo ? (
                          <Badge className="bg-green-500">✅ Ativo</Badge>
                        ) : (
                          <Badge className="bg-gray-500">🚫 Inativo</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testarUpdate(user.user_id, false)}
                          className="text-xs"
                        >
                          Desativar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testarUpdate(user.user_id, true)}
                          className="text-xs"
                        >
                          Ativar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Console de Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Console de Debug
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setLogs([])}
              className="ml-auto"
            >
              Limpar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <p className="text-gray-400">Aguardando operações...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  {log.tipo === 'success' && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                  {log.tipo === 'error' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  {log.tipo === 'warning' && <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                  {log.tipo === 'info' && <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                  <div className="flex-1">
                    <span className="text-gray-400">[{log.timestamp}]</span> {log.mensagem}
                    {log.dados && (
                      <pre className="mt-1 text-gray-400 text-xs overflow-x-auto">{log.dados}</pre>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
