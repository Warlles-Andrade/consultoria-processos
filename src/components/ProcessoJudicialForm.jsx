import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Scale, Info } from 'lucide-react';
import {
  ufOptions, tipoAcaoJudicialOptions, poloOptions, instanciaJudicialOptions,
  situacaoProcessoJudicialOptions, situacaoHabilitacaoPreviaOptions,
  formatCNPJ, formatCNJ, formatData, onlyDigits,
} from '@/data/fiscalDomain';

const SEM_CREDITO = '__sem_credito__';

const formInicial = () => ({
  contribuinte_id: '',
  projeto_id: '',
  credito_id: '',
  numero_cnj: '',
  tipo_acao: 'Mandado de Segurança',
  polo: 'Ativo',
  tribunal: '',
  vara: '',
  comarca: '',
  uf: '',
  instancia: '1º grau',
  situacao: 'Ajuizada',
  data_ajuizamento: '',
  data_sentenca: '',
  data_acordao: '',
  data_transito_julgado: '',
  proximo_prazo: '',
  proximo_prazo_descricao: '',
  valor_causa: null,
  valor_estimado_credito: null,
  deposito_judicial: null,
  habilitacao_previa_rfb: false,
  data_habilitacao_previa: '',
  numero_processo_habilitacao: '',
  situacao_habilitacao_previa: 'Não solicitada',
  responsavel_user_profile_id: '',
  advogado_responsavel: '',
  tese: '',
  observacoes: '',
});

const ProcessoJudicialForm = ({
  isOpen, onClose, onSave, processo,
  contribuintes = [], projetos = [], creditos = [], responsaveis = [], salvando = false,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(formInicial());

  useEffect(() => {
    if (!isOpen) return;
    if (processo) {
      setForm({
        ...formInicial(),
        ...processo,
        credito_id: processo.credito_id || '',
        uf: processo.uf || '',
        data_ajuizamento: processo.data_ajuizamento || '',
        data_sentenca: processo.data_sentenca || '',
        data_acordao: processo.data_acordao || '',
        data_transito_julgado: processo.data_transito_julgado || '',
        proximo_prazo: processo.proximo_prazo || '',
        data_habilitacao_previa: processo.data_habilitacao_previa || '',
        situacao_habilitacao_previa: processo.situacao_habilitacao_previa || 'Não solicitada',
        responsavel_user_profile_id: processo.responsavel_user_profile_id || '',
      });
    } else {
      setForm(formInicial());
    }
  }, [isOpen, processo]);

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const contribuinteSelecionado = useMemo(
    () => contribuintes.find((c) => c.id === form.contribuinte_id),
    [contribuintes, form.contribuinte_id]
  );

  const projetosDisponiveis = useMemo(() => {
    if (!contribuinteSelecionado) return projetos;
    return projetos.filter((p) => p.cliente_id === contribuinteSelecionado.cliente_id);
  }, [projetos, contribuinteSelecionado]);

  const creditosDisponiveis = useMemo(
    () => creditos.filter((c) => !form.contribuinte_id || c.contribuinte_id === form.contribuinte_id),
    [creditos, form.contribuinte_id]
  );

  useEffect(() => {
    if (form.projeto_id && !projetosDisponiveis.some((p) => p.id === form.projeto_id)) {
      setForm((f) => ({ ...f, projeto_id: '' }));
    }
  }, [projetosDisponiveis, form.projeto_id]);

  /** Prazo para compensar o indébito: trânsito em julgado + 5 anos. */
  const prazoCompensacao = useMemo(() => {
    if (!form.data_transito_julgado) return null;
    const d = new Date(`${form.data_transito_julgado}T00:00:00`);
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().slice(0, 10);
  }, [form.data_transito_julgado]);

  const submeter = () => {
    if (!form.contribuinte_id) {
      toast({ title: 'Selecione o contribuinte', variant: 'destructive' });
      return;
    }
    if (!form.projeto_id) {
      toast({ title: 'Selecione o projeto', description: 'É o projeto que define quem enxerga este processo.', variant: 'destructive' });
      return;
    }
    if (!form.numero_cnj?.trim()) {
      toast({ title: 'Informe o número do processo', variant: 'destructive' });
      return;
    }

    const responsavel = responsaveis.find((r) => r.id === form.responsavel_user_profile_id);

    onSave({
      ...form,
      credito_id: form.credito_id && form.credito_id !== SEM_CREDITO ? form.credito_id : null,
      numero_cnj: form.numero_cnj.trim(),
      uf: form.uf || null,
      tribunal: form.tribunal?.trim() || null,
      vara: form.vara?.trim() || null,
      comarca: form.comarca?.trim() || null,
      data_ajuizamento: form.data_ajuizamento || null,
      data_sentenca: form.data_sentenca || null,
      data_acordao: form.data_acordao || null,
      data_transito_julgado: form.data_transito_julgado || null,
      proximo_prazo: form.proximo_prazo || null,
      proximo_prazo_descricao: form.proximo_prazo_descricao?.trim() || null,
      valor_causa: form.valor_causa ?? null,
      valor_estimado_credito: form.valor_estimado_credito ?? null,
      deposito_judicial: form.deposito_judicial ?? null,
      data_habilitacao_previa: form.data_habilitacao_previa || null,
      numero_processo_habilitacao: form.numero_processo_habilitacao?.trim() || null,
      responsavel_user_profile_id: form.responsavel_user_profile_id || null,
      responsavel_nome: responsavel?.name || form.responsavel_nome || null,
      advogado_responsavel: form.advogado_responsavel?.trim() || null,
      tese: form.tese?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  const cnjDigitos = onlyDigits(form.numero_cnj);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-purple-600" />
            {processo ? `Editar ação ${processo.numero_cnj}` : 'Nova Ação Judicial'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identificação */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Contribuinte *</Label>
                <Select value={form.contribuinte_id || undefined} onValueChange={(v) => alterar('contribuinte_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o CNPJ" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {contribuintes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.razao_social} — {formatCNPJ(c.cnpj)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Projeto *</Label>
                <Select value={form.projeto_id || undefined} onValueChange={(v) => alterar('projeto_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={contribuinteSelecionado ? 'Selecione' : 'Selecione o contribuinte'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {projetosDisponiveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Crédito vinculado</Label>
                <Select value={form.credito_id || SEM_CREDITO} onValueChange={(v) => alterar('credito_id', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={SEM_CREDITO}>Nenhum</SelectItem>
                    {creditosDisponiveis.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo ? `${c.codigo} — ` : ''}{c.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="cnj">Nº do processo (CNJ) *</Label>
                <Input id="cnj" value={form.numero_cnj}
                  onChange={(e) => alterar('numero_cnj', e.target.value)}
                  placeholder="0000000-00.0000.0.00.0000" />
                {cnjDigitos.length === 20 && (
                  <p className="text-xs text-slate-500 font-mono">{formatCNJ(cnjDigitos)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Tipo de ação *</Label>
                <Select value={form.tipo_acao} onValueChange={(v) => alterar('tipo_acao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tipoAcaoJudicialOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Polo do contribuinte *</Label>
                <Select value={form.polo} onValueChange={(v) => alterar('polo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {poloOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Juízo */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Juízo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label htmlFor="tribunal">Tribunal</Label>
                <Input id="tribunal" value={form.tribunal || ''}
                  onChange={(e) => alterar('tribunal', e.target.value)} placeholder="Ex.: TRF-3" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vara">Vara</Label>
                <Input id="vara" value={form.vara || ''} onChange={(e) => alterar('vara', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="comarca">Comarca / Seção</Label>
                <Input id="comarca" value={form.comarca || ''} onChange={(e) => alterar('comarca', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Select value={form.uf || undefined} onValueChange={(v) => alterar('uf', v)}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {ufOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Instância *</Label>
                <Select value={form.instancia} onValueChange={(v) => alterar('instancia', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {instanciaJudicialOptions.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1 md:w-1/2">
              <Label>Situação *</Label>
              <Select value={form.situacao} onValueChange={(v) => alterar('situacao', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {situacaoProcessoJudicialOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Marcos processuais */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Marcos processuais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="ajuiz">Ajuizamento</Label>
                <Input id="ajuiz" type="date" value={form.data_ajuizamento}
                  onChange={(e) => alterar('data_ajuizamento', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sent">Sentença</Label>
                <Input id="sent" type="date" value={form.data_sentenca}
                  onChange={(e) => alterar('data_sentenca', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acord">Acórdão</Label>
                <Input id="acord" type="date" value={form.data_acordao}
                  onChange={(e) => alterar('data_acordao', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transito">Trânsito em julgado</Label>
                <Input id="transito" type="date" value={form.data_transito_julgado}
                  onChange={(e) => alterar('data_transito_julgado', e.target.value)} />
              </div>
            </div>

            {prazoCompensacao && (
              <p className="text-xs text-slate-500">
                Prazo para compensar o indébito: <strong>{formatData(prazoCompensacao)}</strong> (trânsito + 5 anos).
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="prox">Próximo prazo</Label>
                <Input id="prox" type="date" value={form.proximo_prazo}
                  onChange={(e) => alterar('proximo_prazo', e.target.value)} />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="prox_desc">O que vence nesse próximo prazo</Label>
                <Input id="prox_desc" value={form.proximo_prazo_descricao || ''}
                  onChange={(e) => alterar('proximo_prazo_descricao', e.target.value)}
                  placeholder="Ex.: Contrarrazões de apelação" />
              </div>
            </div>
          </section>

          {/* Valores */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Valores</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Valor da causa</Label>
                <CurrencyInput value={form.valor_causa} onChange={(v) => alterar('valor_causa', v)} />
              </div>
              <div className="space-y-1">
                <Label>Crédito estimado</Label>
                <CurrencyInput value={form.valor_estimado_credito} onChange={(v) => alterar('valor_estimado_credito', v)} />
              </div>
              <div className="space-y-1">
                <Label>Depósito judicial</Label>
                <CurrencyInput value={form.deposito_judicial} onChange={(v) => alterar('deposito_judicial', v)} />
              </div>
            </div>
          </section>

          {/* Habilitação prévia */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Habilitação prévia do crédito (RFB)</h3>
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Crédito reconhecido judicialmente precisa ser habilitado na Receita Federal
                antes de ser usado em PER/DCOMP.
              </span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
              <input type="checkbox" className="h-4 w-4"
                checked={!!form.habilitacao_previa_rfb}
                onChange={(e) => alterar('habilitacao_previa_rfb', e.target.checked)} />
              Exige habilitação prévia
            </label>

            {form.habilitacao_previa_rfb && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Situação da habilitação</Label>
                  <Select value={form.situacao_habilitacao_previa}
                    onValueChange={(v) => alterar('situacao_habilitacao_previa', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {situacaoHabilitacaoPreviaOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="d_hab">Data do pedido</Label>
                  <Input id="d_hab" type="date" value={form.data_habilitacao_previa}
                    onChange={(e) => alterar('data_habilitacao_previa', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="n_hab">Nº do processo de habilitação</Label>
                  <Input id="n_hab" value={form.numero_processo_habilitacao || ''}
                    onChange={(e) => alterar('numero_processo_habilitacao', e.target.value)} />
                </div>
              </div>
            )}
          </section>

          {/* Responsáveis */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Responsáveis e fundamentação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Responsável interno</Label>
                <Select value={form.responsavel_user_profile_id || undefined}
                  onValueChange={(v) => alterar('responsavel_user_profile_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {responsaveis.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="adv">Advogado responsável</Label>
                <Input id="adv" value={form.advogado_responsavel || ''}
                  onChange={(e) => alterar('advogado_responsavel', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="tese">Tese</Label>
                <Textarea id="tese" rows={2} value={form.tese || ''} onChange={(e) => alterar('tese', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs">Observações</Label>
                <Textarea id="obs" rows={2} value={form.observacoes || ''} onChange={(e) => alterar('observacoes', e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={submeter} disabled={salvando} className="bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {processo ? 'Salvar alterações' : 'Cadastrar ação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessoJudicialForm;
