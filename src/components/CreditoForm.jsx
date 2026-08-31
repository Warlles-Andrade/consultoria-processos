import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Landmark } from 'lucide-react';
import {
  esferaOptions,
  tributoOptions,
  tributoEsfera,
  origemCreditoOptions,
  tipoLevantamentoOptions,
  situacaoCreditoOptions,
  formatCNPJ,
} from '@/data/fiscalDomain';

const formInicial = () => ({
  titulo: '',
  contribuinte_id: '',
  projeto_id: '',
  esfera: 'Federal',
  tributo: '',
  origem: 'Administrativo',
  tipo_levantamento: '',
  competencia_inicio: '',
  competencia_fim: '',
  valor_levantado: null,
  valor_homologado: null,
  valor_honorarios_pct: '',
  data_base_prescricao: '',
  situacao: 'Em levantamento',
  responsavel_user_profile_id: '',
  responsavel_nome: '',
  base_legal: '',
  tese: '',
  observacoes: '',
});

const CreditoForm = ({
  isOpen,
  onClose,
  onSave,
  credito,
  contribuintes = [],
  projetos = [],
  responsaveis = [],
  salvando = false,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(formInicial());

  useEffect(() => {
    if (!isOpen) return;
    if (credito) {
      setForm({
        ...formInicial(),
        ...credito,
        competencia_inicio: credito.competencia_inicio || '',
        competencia_fim: credito.competencia_fim || '',
        data_base_prescricao: credito.data_base_prescricao || '',
        valor_honorarios_pct: credito.valor_honorarios_pct ?? '',
        responsavel_user_profile_id: credito.responsavel_user_profile_id || '',
        tipo_levantamento: credito.tipo_levantamento || '',
      });
    } else {
      setForm(formInicial());
    }
  }, [isOpen, credito]);

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  /** Escolher o tributo já posiciona a esfera correspondente. */
  const alterarTributo = (tributo) => {
    setForm((f) => ({
      ...f,
      tributo,
      esfera: tributoEsfera[tributo] || f.esfera,
    }));
  };

  const contribuinteSelecionado = useMemo(
    () => contribuintes.find((c) => c.id === form.contribuinte_id),
    [contribuintes, form.contribuinte_id]
  );

  /** Só projetos do cliente ao qual o contribuinte pertence. */
  const projetosDisponiveis = useMemo(() => {
    if (!contribuinteSelecionado) return projetos;
    return projetos.filter((p) => p.cliente_id === contribuinteSelecionado.cliente_id);
  }, [projetos, contribuinteSelecionado]);

  // Trocar de contribuinte invalida um projeto de outro cliente.
  useEffect(() => {
    if (!form.projeto_id) return;
    if (!projetosDisponiveis.some((p) => p.id === form.projeto_id)) {
      setForm((f) => ({ ...f, projeto_id: '' }));
    }
  }, [projetosDisponiveis, form.projeto_id]);

  const submeter = () => {
    if (!form.titulo?.trim()) {
      toast({ title: 'Informe o título do crédito', variant: 'destructive' });
      return;
    }
    if (!form.contribuinte_id) {
      toast({ title: 'Selecione o contribuinte', variant: 'destructive' });
      return;
    }
    if (!form.projeto_id) {
      toast({ title: 'Selecione o projeto', description: 'É o projeto que define quem enxerga este crédito.', variant: 'destructive' });
      return;
    }
    if (!form.tributo) {
      toast({ title: 'Selecione o tributo', variant: 'destructive' });
      return;
    }
    if (form.competencia_inicio && form.competencia_fim && form.competencia_fim < form.competencia_inicio) {
      toast({ title: 'Competência inválida', description: 'A competência final não pode ser anterior à inicial.', variant: 'destructive' });
      return;
    }

    const responsavel = responsaveis.find((r) => r.id === form.responsavel_user_profile_id);

    onSave({
      ...form,
      titulo: form.titulo.trim(),
      valor_levantado: form.valor_levantado ?? 0,
      valor_homologado: form.valor_homologado ?? null,
      valor_honorarios_pct: form.valor_honorarios_pct === '' ? null : Number(form.valor_honorarios_pct),
      competencia_inicio: form.competencia_inicio || null,
      competencia_fim: form.competencia_fim || null,
      data_base_prescricao: form.data_base_prescricao || null,
      tipo_levantamento: form.tipo_levantamento || null,
      responsavel_user_profile_id: form.responsavel_user_profile_id || null,
      responsavel_nome: responsavel?.name || form.responsavel_nome || null,
      base_legal: form.base_legal?.trim() || null,
      tese: form.tese?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-indigo-600" />
            {credito ? `Editar Crédito ${credito.codigo || ''}` : 'Novo Crédito'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identificação */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Identificação</h3>

            <div className="space-y-1">
              <Label htmlFor="titulo">Título do crédito *</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => alterar('titulo', e.target.value)}
                placeholder="Ex.: Exclusão do ICMS da base do PIS/COFINS — 2019 a 2023"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <SelectValue placeholder={contribuinteSelecionado ? 'Selecione o projeto' : 'Selecione o contribuinte primeiro'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {projetosDisponiveis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contribuinteSelecionado && projetosDisponiveis.length === 0 && (
                  <p className="text-xs text-amber-600">
                    Nenhum projeto no cliente deste contribuinte. Crie um projeto antes.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Classificação fiscal */}
          <section className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Classificação fiscal</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Tributo *</Label>
                <Select value={form.tributo || undefined} onValueChange={alterarTributo}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tributoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

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
                <Label>Origem *</Label>
                <Select value={form.origem} onValueChange={(v) => alterar('origem', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {origemCreditoOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Tipo de levantamento</Label>
                <Select value={form.tipo_levantamento || undefined} onValueChange={(v) => alterar('tipo_levantamento', v)}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {tipoLevantamentoOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="comp_ini">Competência inicial</Label>
                <Input id="comp_ini" type="date" value={form.competencia_inicio} onChange={(e) => alterar('competencia_inicio', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="comp_fim">Competência final</Label>
                <Input id="comp_fim" type="date" value={form.competencia_fim} onChange={(e) => alterar('competencia_fim', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Situação</Label>
                <Select value={form.situacao} onValueChange={(v) => alterar('situacao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {situacaoCreditoOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Valores e prazos */}
          <section className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Valores e prazos</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="v_lev">Valor levantado</Label>
                <CurrencyInput id="v_lev" value={form.valor_levantado} onChange={(v) => alterar('valor_levantado', v)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v_hom">Valor homologado</Label>
                <CurrencyInput id="v_hom" value={form.valor_homologado} onChange={(v) => alterar('valor_homologado', v)} />
                <p className="text-xs text-slate-400">Preencher só após decisão do fisco.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="hon">Honorários de êxito (%)</Label>
                <Input
                  id="hon"
                  type="number"
                  step="0.001"
                  min="0"
                  max="100"
                  value={form.valor_honorarios_pct}
                  onChange={(e) => alterar('valor_honorarios_pct', e.target.value)}
                  placeholder="Ex.: 20"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="presc">Data-base da prescrição</Label>
                <Input id="presc" type="date" value={form.data_base_prescricao} onChange={(e) => alterar('data_base_prescricao', e.target.value)} />
                <p className="text-xs text-slate-400">O sistema calcula o limite de 5 anos.</p>
              </div>
            </div>

            <div className="space-y-1 md:w-1/2">
              <Label>Responsável técnico</Label>
              <Select
                value={form.responsavel_user_profile_id || undefined}
                onValueChange={(v) => alterar('responsavel_user_profile_id', v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {responsaveis.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Fundamentação */}
          <section className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Fundamentação</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="base_legal">Base legal</Label>
                <Textarea
                  id="base_legal"
                  rows={2}
                  value={form.base_legal || ''}
                  onChange={(e) => alterar('base_legal', e.target.value)}
                  placeholder="Ex.: RE 574.706/PR; Lei 9.430/96, art. 74"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tese">Tese</Label>
                <Textarea id="tese" rows={2} value={form.tese || ''} onChange={(e) => alterar('tese', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" rows={2} value={form.observacoes || ''} onChange={(e) => alterar('observacoes', e.target.value)} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={submeter} disabled={salvando} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {credito ? 'Salvar alterações' : 'Cadastrar crédito'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreditoForm;
