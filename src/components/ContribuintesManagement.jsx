import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, PlusCircle, Search, Edit2, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { listarContribuintes, salvarContribuinte, excluirContribuinte } from '@/lib/fiscalApi';
import { regimeTributarioOptions, ufOptions, formatCNPJ, isValidCNPJ, onlyDigits } from '@/data/fiscalDomain';

const formInicial = () => ({
  cliente_id: '',
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  uf: '',
  municipio: '',
  regime_tributario: 'Não informado',
  cnae_principal: '',
  posto_fiscal: '',
  ativo: true,
  observacoes: '',
});

const ContribuintesManagement = ({ usuario, userProfile, onRefresh }) => {
  const { toast } = useToast();
  const [contribuintes, setContribuintes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState('todos');

  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(formInicial());
  const [erroCnpj, setErroCnpj] = useState('');

  const [confirmAberto, setConfirmAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, { data: clientesData, error }] = await Promise.all([
        listarContribuintes(),
        // 'adm' é o grupo de administradores, não um cliente de verdade: não pode
        // ter projetos pela interface, então um contribuinte nele vira beco sem saída.
        supabase.from('clientes').select('id, nome, cor').neq('nome', 'adm').order('nome'),
      ]);
      if (error) throw error;
      setContribuintes(lista || []);
      setClientes(clientesData || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar contribuintes', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setForm(formInicial());
    setErroCnpj('');
    setDialogAberto(true);
  };

  const abrirEdicao = (contribuinte) => {
    setForm({
      ...formInicial(),
      ...contribuinte,
      cnpj: formatCNPJ(contribuinte.cnpj),
      regime_tributario: contribuinte.regime_tributario || 'Não informado',
    });
    setErroCnpj('');
    setDialogAberto(true);
  };

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const alterarCnpj = (valor) => {
    const digitos = onlyDigits(valor).slice(0, 14);
    alterar('cnpj', digitos.length === 14 ? formatCNPJ(digitos) : digitos);
    setErroCnpj('');
  };

  const salvar = async () => {
    if (!form.razao_social?.trim()) {
      toast({ title: 'Razão social é obrigatória', variant: 'destructive' });
      return;
    }
    if (!form.cliente_id) {
      toast({ title: 'Selecione o cliente', variant: 'destructive' });
      return;
    }
    if (!isValidCNPJ(form.cnpj)) {
      setErroCnpj('CNPJ inválido — verifique os dígitos.');
      return;
    }

    setSalvando(true);
    try {
      await salvarContribuinte(
        {
          ...form,
          razao_social: form.razao_social.trim(),
          nome_fantasia: form.nome_fantasia?.trim() || null,
          uf: form.uf || null,
          inscricao_estadual: form.inscricao_estadual?.trim() || null,
          inscricao_municipal: form.inscricao_municipal?.trim() || null,
          municipio: form.municipio?.trim() || null,
          cnae_principal: form.cnae_principal?.trim() || null,
          posto_fiscal: form.posto_fiscal?.trim() || null,
          observacoes: form.observacoes?.trim() || null,
        },
        usuario,
        userProfile
      );
      toast({ title: form.id ? 'Contribuinte atualizado' : 'Contribuinte cadastrado', className: 'bg-green-500 text-white' });
      setDialogAberto(false);
      await carregar();
      onRefresh?.();
    } catch (error) {
      const msg = error?.code === '23505'
        ? 'Já existe um contribuinte cadastrado com este CNPJ.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluirContribuinte(aExcluir.id);
      toast({ title: 'Contribuinte excluído', className: 'bg-green-500 text-white' });
      await carregar();
    } catch (error) {
      const msg = error?.code === '23503'
        ? 'Não é possível excluir: existem créditos ou processos vinculados a este contribuinte.'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao excluir', description: msg, variant: 'destructive' });
    } finally {
      setConfirmAberto(false);
      setAExcluir(null);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = contribuintes.filter((c) => {
    const porCliente = clienteFiltro === 'todos' || c.cliente_id === clienteFiltro;
    if (!porCliente) return false;
    if (!termo) return true;
    return (
      c.razao_social?.toLowerCase().includes(termo) ||
      c.nome_fantasia?.toLowerCase().includes(termo) ||
      onlyDigits(c.cnpj).includes(onlyDigits(termo)) ||
      c.municipio?.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-md">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Contribuintes</h1>
            <p className="text-sm text-slate-500">Pessoas jurídicas (CNPJ) atendidas pela consultoria</p>
          </div>
        </div>
        <Button onClick={abrirNovo} className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
          <PlusCircle className="h-4 w-4 mr-2" /> Novo Contribuinte
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700 flex-1">
                Lista de Contribuintes ({filtrados.length})
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
                  <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os clientes</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por razão social, CNPJ ou município"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Building2 className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhum contribuinte encontrado</p>
                <p className="text-sm">Cadastre o primeiro CNPJ para começar a lançar créditos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[220px]">Razão Social</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[160px]">CNPJ</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">Cliente</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[60px]">UF</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[140px]">Regime</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-600 text-sm min-w-[130px]">IE</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[80px]">Status</th>
                      <th className="text-center py-3 px-3 font-semibold text-slate-600 text-sm min-w-[100px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtrados.map((c) => (
                        <motion.tr
                          key={c.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-b border-slate-100 hover:bg-slate-50/60"
                        >
                          <td className="py-3 px-3">
                            <p className="font-medium text-slate-800">{c.razao_social}</p>
                            {c.nome_fantasia && <p className="text-xs text-slate-500">{c.nome_fantasia}</p>}
                          </td>
                          <td className="py-3 px-3 text-sm text-slate-700 font-mono">{formatCNPJ(c.cnpj)}</td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className="border-slate-300 text-slate-700">
                              {c.cliente?.nome || '—'}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-sm text-slate-700">{c.uf || '—'}</td>
                          <td className="py-3 px-3 text-sm text-slate-700">{c.regime_tributario || '—'}</td>
                          <td className="py-3 px-3 text-sm text-slate-700">{c.inscricao_estadual || '—'}</td>
                          <td className="py-3 px-3 text-center">
                            {c.ativo ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                                <XCircle className="h-3.5 w-3.5" /> Inativo
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => abrirEdicao(c)} title="Editar">
                                <Edit2 className="h-4 w-4 text-slate-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setAExcluir(c); setConfirmAberto(true); }}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
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

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Contribuinte' : 'Novo Contribuinte'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="razao_social">Razão Social *</Label>
              <Input id="razao_social" value={form.razao_social} onChange={(e) => alterar('razao_social', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
              <Input id="nome_fantasia" value={form.nome_fantasia || ''} onChange={(e) => alterar('nome_fantasia', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                value={form.cnpj}
                onChange={(e) => alterarCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className={erroCnpj ? 'border-red-400' : ''}
              />
              {erroCnpj && <p className="text-xs text-red-600">{erroCnpj}</p>}
            </div>

            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select value={form.cliente_id || undefined} onValueChange={(v) => alterar('cliente_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {clientes.length === 0 && (
                <p className="text-xs text-amber-600">
                  Nenhum cliente cadastrado. Cadastre primeiro em Configurações → Clientes.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Regime Tributário</Label>
              <Select value={form.regime_tributario} onValueChange={(v) => alterar('regime_tributario', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {regimeTributarioOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>UF</Label>
              <Select value={form.uf || undefined} onValueChange={(v) => alterar('uf', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {ufOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="municipio">Município</Label>
              <Input id="municipio" value={form.municipio || ''} onChange={(e) => alterar('municipio', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ie">Inscrição Estadual</Label>
              <Input id="ie" value={form.inscricao_estadual || ''} onChange={(e) => alterar('inscricao_estadual', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="im">Inscrição Municipal</Label>
              <Input id="im" value={form.inscricao_municipal || ''} onChange={(e) => alterar('inscricao_municipal', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cnae">CNAE Principal</Label>
              <Input id="cnae" value={form.cnae_principal || ''} onChange={(e) => alterar('cnae_principal', e.target.value)} placeholder="0000-0/00" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="posto">Posto Fiscal</Label>
              <Input
                id="posto"
                value={form.posto_fiscal || ''}
                onChange={(e) => alterar('posto_fiscal', e.target.value)}
                placeholder="Vinculação na SEFAZ (e-CredAc)"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" rows={2} value={form.observacoes || ''} onChange={(e) => alterar('observacoes', e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                <input type="checkbox" checked={!!form.ativo} onChange={(e) => alterar('ativo', e.target.checked)} className="h-4 w-4" />
                Contribuinte ativo
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.id ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmAberto}
        onClose={() => { setConfirmAberto(false); setAExcluir(null); }}
        onConfirm={confirmarExclusao}
        title="Excluir contribuinte"
        description={`Excluir "${aExcluir?.razao_social}"? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default ContribuintesManagement;
