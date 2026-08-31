import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Gavel } from 'lucide-react';
import {
  esferaOptions, ufOptions, orgaosPorEsfera,
  naturezaProcessoAdmOptions, tipoProcessoAdmOptions,
  instanciaAdmOptions, situacaoProcessoAdmOptions, formatCNPJ,
} from '@/data/fiscalDomain';

const SEM_CREDITO = '__sem_credito__';

/** Situações em que o banco exige data de protocolo. */
const EXIGE_PROTOCOLO = (situacao) => !['Em elaboração', 'Arquivado'].includes(situacao);

const formInicial = () => ({
  contribuinte_id: '',
  projeto_id: '',
  credito_id: '',
  esfera: 'Federal',
  uf: '',
  orgao_atual: '',
  orgao_julgador: '',
  relator: '',
  numero_processo: '',
  numero_auto_infracao: '',
  numero_acordao: '',
  natureza: 'Defesa',
  tipo: 'Impugnação',
  instancia: '1ª instância',
  situacao: 'Em elaboração',
  valor_autuado: null,
  valor_em_discussao: null,
  valor_cancelado: null,
  valor_mantido: null,
  data_ciencia: '',
  prazo_impugnacao: '',
  data_protocolo: '',
  data_julgamento: '',
  proximo_prazo: '',
  proximo_prazo_descricao: '',
  responsavel_user_profile_id: '',
  advogado_responsavel: '',
  tese: '',
  observacoes: '',
});

const ProcessoAdmForm = ({
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
        data_ciencia: processo.data_ciencia || '',
        prazo_impugnacao: processo.prazo_impugnacao || '',
        data_protocolo: processo.data_protocolo || '',
        data_julgamento: processo.data_julgamento || '',
        proximo_prazo: processo.proximo_prazo || '',
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

  /** Sugestões de órgão conforme a esfera — o campo continua livre. */
  const sugestoesOrgao = useMemo(() => {
    const lista = orgaosPorEsfera[form.esfera] || [];
    if (!form.uf) return lista;
    return lista.filter((o) => !o.uf || o.uf === form.uf);
  }, [form.esfera, form.uf]);

  const protocoloObrigatorio = EXIGE_PROTOCOLO(form.situacao);

  const submeter = () => {
    if (!form.contribuinte_id) {
      toast({ title: 'Selecione o contribuinte', variant: 'destructive' });
      return;
    }
    if (!form.projeto_id) {
      toast({ title: 'Selecione o projeto', description: 'É o projeto que define quem enxerga este processo.', variant: 'destructive' });
      return;
    }
    if (!form.numero_processo?.trim()) {
      toast({ title: 'Informe o número do processo', variant: 'destructive' });
      return;
    }
    if (!form.orgao_atual?.trim()) {
      toast({ title: 'Informe o órgão', description: 'Onde o processo está tramitando hoje.', variant: 'destructive' });
      return;
    }
    if (protocoloObrigatorio && !form.data_protocolo) {
      toast({
        title: 'Data de protocolo obrigatória',
        description: `Na situação "${form.situacao}" é preciso informar a data do protocolo. Use "Em elaboração" enquanto a peça não foi protocolada.`,
        variant: 'destructive',
      });
      return;
    }

    const responsavel = responsaveis.find((r) => r.id === form.responsavel_user_profile_id);

    onSave({
      ...form,
      credito_id: form.credito_id && form.credito_id !== SEM_CREDITO ? form.credito_id : null,
      uf: form.uf || null,
      numero_processo: form.numero_processo.trim(),
      orgao_atual: form.orgao_atual.trim(),
      orgao_julgador: form.orgao_julgador?.trim() || null,
      relator: form.relator?.trim() || null,
      numero_auto_infracao: form.numero_auto_infracao?.trim() || null,
      numero_acordao: form.numero_acordao?.trim() || null,
      valor_autuado: form.valor_autuado ?? null,
      valor_em_discussao: form.valor_em_discussao ?? null,
      valor_cancelado: form.valor_cancelado ?? null,
      valor_mantido: form.valor_mantido ?? null,
      data_ciencia: form.data_ciencia || null,
      prazo_impugnacao: form.prazo_impugnacao || null,
      data_protocolo: form.data_protocolo || null,
      data_julgamento: form.data_julgamento || null,
      proximo_prazo: form.proximo_prazo || null,
      proximo_prazo_descricao: form.proximo_prazo_descricao?.trim() || null,
      responsavel_user_profile_id: form.responsavel_user_profile_id || null,
      responsavel_nome: responsavel?.name || form.responsavel_nome || null,
      advogado_responsavel: form.advogado_responsavel?.trim() || null,
      tese: form.tese?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-600" />
            {processo ? `Editar processo ${processo.numero_processo}` : 'Novo Processo Administrativo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Partes */}
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
                    <SelectItem value={SEM_CREDITO}>Nenhum (defesa de autuação)</SelectItem>
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
                <Label htmlFor="num_proc">Nº do processo *</Label>
                <Input id="num_proc" value={form.numero_processo}
                  onChange={(e) => alterar('numero_processo', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="auto">Nº do auto de infração / AIIM</Label>
                <Input id="auto" value={form.numero_auto_infracao || ''}
                  onChange={(e) => alterar('numero_auto_infracao', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acordao">Nº do acórdão</Label>
                <Input id="acordao" value={form.numero_acordao || ''}
                  onChange={(e) => alterar('numero_acordao', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Órgão */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Órgão e fase</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Esfera *</Label>
                <Select value={form.esfera} onValueChange={(v) => alterar('esfera', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {esferaOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
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
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="orgao">Órgão atual *</Label>
                <Input
                  id="orgao"
                  list="sugestoes-orgao"
                  value={form.orgao_atual}
                  onChange={(e) => alterar('orgao_atual', e.target.value)}
                  placeholder="Ex.: CARF, TIT-SP, TAT/MS — ou digite outro"
                />
                <datalist id="sugestoes-orgao">
                  {sugestoesOrgao.map((o) => <option key={o.nome} value={o.nome} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="julgador">Turma / câmara</Label>
                <Input id="julgador" value={form.orgao_julgador || ''}
                  onChange={(e) => alterar('orgao_julgador', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="relator">Relator</Label>
                <Input id="relator" value={form.relator || ''}
                  onChange={(e) => alterar('relator', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Instância *</Label>
                <Select value={form.instancia} onValueChange={(v) => alterar('instancia', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {instanciaAdmOptions.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Situação *</Label>
                <Select value={form.situacao} onValueChange={(v) => alterar('situacao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {situacaoProcessoAdmOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Natureza *</Label>
                <Select value={form.natureza} onValueChange={(v) => alterar('natureza', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {naturezaProcessoAdmOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de peça *</Label>
                <Select value={form.tipo} onValueChange={(v) => alterar('tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tipoProcessoAdmOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Valores */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Valores</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Autuado</Label>
                <CurrencyInput value={form.valor_autuado} onChange={(v) => alterar('valor_autuado', v)} />
              </div>
              <div className="space-y-1">
                <Label>Em discussão</Label>
                <CurrencyInput value={form.valor_em_discussao} onChange={(v) => alterar('valor_em_discussao', v)} />
              </div>
              <div className="space-y-1">
                <Label>Cancelado / reduzido</Label>
                <CurrencyInput value={form.valor_cancelado} onChange={(v) => alterar('valor_cancelado', v)} />
              </div>
              <div className="space-y-1">
                <Label>Mantido</Label>
                <CurrencyInput value={form.valor_mantido} onChange={(v) => alterar('valor_mantido', v)} />
              </div>
            </div>
          </section>

          {/* Prazos */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Prazos {protocoloObrigatorio && <span className="text-red-500 normal-case font-normal">(protocolo obrigatório nesta situação)</span>}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="ciencia">Ciência</Label>
                <Input id="ciencia" type="date" value={form.data_ciencia}
                  onChange={(e) => alterar('data_ciencia', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prazo_imp">Prazo de defesa/recurso</Label>
                <Input id="prazo_imp" type="date" value={form.prazo_impugnacao}
                  onChange={(e) => alterar('prazo_impugnacao', e.target.value)} />
                <p className="text-xs text-slate-400">Vira alerta.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="protocolo">Protocolo</Label>
                <Input id="protocolo" type="date" value={form.data_protocolo}
                  onChange={(e) => alterar('data_protocolo', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="julgamento">Julgamento</Label>
                <Input id="julgamento" type="date" value={form.data_julgamento}
                  onChange={(e) => alterar('data_julgamento', e.target.value)} />
              </div>
            </div>

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
                  placeholder="Ex.: Apresentar recurso voluntário" />
              </div>
            </div>
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
          <Button onClick={submeter} disabled={salvando} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {processo ? 'Salvar alterações' : 'Cadastrar processo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessoAdmForm;
