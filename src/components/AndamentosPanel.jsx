import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { motion } from 'framer-motion';
import { Plus, Trash2, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  listarAndamentos, criarAndamento, marcarAndamentoCumprido, excluirAndamento,
} from '@/lib/fiscalApi';
import {
  tipoAndamentoOptions, getPrazoSeveridade, prazoSeveridadeConfig, formatData,
} from '@/data/fiscalDomain';

const hoje = () => new Date().toISOString().slice(0, 10);

const formInicial = (tipoPadrao) => ({
  tipo: tipoPadrao,
  descricao: '',
  data_andamento: hoje(),
  prazo_fatal: '',
});

const diasAte = (iso) => {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`);
  const agora = new Date();
  agora.setHours(0, 0, 0, 0);
  return Math.round((alvo - agora) / 86400000);
};

/**
 * Linha do tempo de uma entidade fiscal: movimentações e prazos fatais.
 *
 * É o mesmo painel para crédito, habilitação, PER/DCOMP e contencioso — a
 * tabela `andamentos` é genérica e o par (entidade_tipo, entidade_id) diz a
 * quem o registro pertence. `projeto_id` vai denormalizado para a RLS.
 *
 * Prazos lançados aqui com `prazo_fatal` entram automaticamente na tela de
 * Prazos, via a view v_prazos_criticos.
 */
const AndamentosPanel = ({
  entidadeTipo,
  entidadeId,
  projetoId,
  usuario,
  userProfile,
  tipoPadrao = 'Protocolo',
  onChanged,
  onCount,
}) => {
  const { toast } = useToast();
  const [andamentos, setAndamentos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formInicial(tipoPadrao));
  const [aExcluir, setAExcluir] = useState(null);

  // Guardado em ref para que um onCount recriado a cada render do pai não
  // vire dependência de `carregar` e dispare um loop de recarga.
  const onCountRef = useRef(onCount);
  useEffect(() => { onCountRef.current = onCount; }, [onCount]);

  const carregar = useCallback(async () => {
    if (!entidadeId) return;
    setCarregando(true);
    try {
      const lista = await listarAndamentos(entidadeTipo, entidadeId);
      setAndamentos(lista || []);
      onCountRef.current?.(lista?.length || 0);
    } catch (error) {
      toast({ title: 'Erro ao carregar andamentos', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [entidadeTipo, entidadeId, toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const registrar = async () => {
    if (!form.descricao?.trim()) {
      toast({ title: 'Descreva o andamento', variant: 'destructive' });
      return;
    }
    if (!projetoId) {
      toast({
        title: 'Projeto não identificado',
        description: 'Sem o projeto não é possível aplicar as regras de acesso a este andamento.',
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    try {
      await criarAndamento(
        {
          entidade_tipo: entidadeTipo,
          entidade_id: entidadeId,
          projeto_id: projetoId,
          tipo: form.tipo,
          descricao: form.descricao.trim(),
          data_andamento: form.data_andamento || hoje(),
          prazo_fatal: form.prazo_fatal || null,
          responsavel_nome: userProfile?.nome || null,
        },
        usuario,
        userProfile
      );
      toast({ title: 'Andamento registrado', className: 'bg-green-500 text-white' });
      setForm(formInicial(tipoPadrao));
      setMostrarForm(false);
      await carregar();
      onChanged?.();
    } catch (error) {
      toast({ title: 'Erro ao registrar', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const alternarCumprido = async (andamento) => {
    try {
      await marcarAndamentoCumprido(andamento.id, !andamento.cumprido);
      await carregar();
      onChanged?.();
    } catch (error) {
      toast({ title: 'Erro ao atualizar', description: getPublicErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    try {
      await excluirAndamento(aExcluir.id);
      toast({ title: 'Andamento excluído', className: 'bg-green-500 text-white' });
      await carregar();
      onChanged?.();
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: getPublicErrorMessage(error), variant: 'destructive' });
    } finally {
      setAExcluir(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-slate-500">
          Movimentações e prazos. O que tiver prazo fatal aparece na tela de <strong>Prazos</strong>.
        </p>
        <Button size="sm" onClick={() => setMostrarForm((v) => !v)}
          className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
          <Plus className="h-4 w-4 mr-1" /> Novo andamento
        </Button>
      </div>

      {mostrarForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {tipoAndamentoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={form.data_andamento}
                onChange={(e) => setForm((f) => ({ ...f, data_andamento: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Prazo fatal (opcional)</Label>
              <Input type="date" value={form.prazo_fatal}
                onChange={(e) => setForm((f) => ({ ...f, prazo_fatal: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea rows={2} value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex.: Intimação para apresentar planilhas de apuração" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setMostrarForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={registrar} disabled={salvando}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
              {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Registrar
            </Button>
          </div>
        </motion.div>
      )}

      {carregando ? (
        <div className="flex justify-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : andamentos.length === 0 ? (
        <p className="text-center py-8 text-slate-500 text-sm">Nenhum andamento registrado.</p>
      ) : (
        <div className="space-y-2">
          {andamentos.map((a) => {
            const dias = a.cumprido ? null : diasAte(a.prazo_fatal);
            const sev = getPrazoSeveridade(dias);
            return (
              <div key={a.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${prazoSeveridadeConfig[sev].dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-slate-300 text-slate-700">{a.tipo}</Badge>
                    <span className="text-xs text-slate-500">{formatData(a.data_andamento)}</span>
                    {a.prazo_fatal && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${prazoSeveridadeConfig[sev].color}`}>
                        <Clock className="h-3 w-3 inline mr-1" />
                        Prazo {formatData(a.prazo_fatal)}
                        {dias != null && (dias < 0 ? ` · vencido há ${Math.abs(dias)}d` : ` · em ${dias}d`)}
                      </span>
                    )}
                    {a.cumprido && (
                      <span className="text-xs text-green-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Cumprido
                        {a.data_cumprimento ? ` em ${formatData(a.data_cumprimento)}` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{a.descricao}</p>
                  {a.responsavel_nome && (
                    <p className="text-xs text-slate-400 mt-0.5">{a.responsavel_nome}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {a.prazo_fatal && (
                    <Button variant="ghost" size="sm" onClick={() => alternarCumprido(a)}
                      title={a.cumprido ? 'Reabrir prazo' : 'Marcar como cumprido'}>
                      <CheckCircle2 className={`h-4 w-4 ${a.cumprido ? 'text-green-600' : 'text-slate-400'}`} />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setAExcluir(a)} title="Excluir">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!aExcluir}
        onClose={() => setAExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir andamento"
        description={`Excluir "${aExcluir?.descricao}"? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
};

export default AndamentosPanel;
