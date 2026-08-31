import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Receipt, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  tipoPerdcompOptions, tipoDocumentoPerdcompOptions, situacaoPerdcompOptions,
  situacaoDebitoOptions, formatCNPJ, formatMoeda, formatData,
} from '@/data/fiscalDomain';

const formInicial = () => ({
  credito_id: '',
  numero: '',
  tipo: 'Compensação',
  tipo_documento: 'PER/DCOMP',
  data_transmissao: new Date().toISOString().slice(0, 10),
  periodo_apuracao_inicio: '',
  periodo_apuracao_fim: '',
  valor_credito_original: null,
  valor_credito_atualizado: null,
  valor_compensado: null,
  valor_deferido: null,
  valor_glosado: null,
  situacao: 'Transmitido',
  numero_processo_administrativo: '',
  data_ciencia_despacho: '',
  prazo_manifestacao: '',
  responsavel_user_profile_id: '',
  observacoes: '',
});

const debitoNovo = () => ({
  _tempId: `tmp-${Math.random().toString(36).slice(2)}`,
  codigo_receita: '',
  denominacao: '',
  periodo_apuracao: '',
  vencimento: '',
  valor_principal: null,
  valor_multa: null,
  valor_juros: null,
  situacao: 'Compensado',
});

/** Soma de um débito, espelhando a coluna gerada valor_total do banco. */
const totalDebito = (d) =>
  Number(d.valor_principal || 0) + Number(d.valor_multa || 0) + Number(d.valor_juros || 0);

const PerdcompForm = ({
  isOpen, onClose, onSave, perdcomp, debitosIniciais = [],
  creditos = [], responsaveis = [], salvando = false,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(formInicial());
  const [debitos, setDebitos] = useState([]);
  const [removidos, setRemovidos] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setRemovidos([]);
    if (perdcomp) {
      setForm({
        ...formInicial(),
        ...perdcomp,
        periodo_apuracao_inicio: perdcomp.periodo_apuracao_inicio || '',
        periodo_apuracao_fim: perdcomp.periodo_apuracao_fim || '',
        data_ciencia_despacho: perdcomp.data_ciencia_despacho || '',
        prazo_manifestacao: perdcomp.prazo_manifestacao || '',
        numero_processo_administrativo: perdcomp.numero_processo_administrativo || '',
        responsavel_user_profile_id: perdcomp.responsavel_user_profile_id || '',
      });
      setDebitos(debitosIniciais.map((d) => ({ ...d })));
    } else {
      setForm(formInicial());
      setDebitos([]);
    }
  }, [isOpen, perdcomp, debitosIniciais]);

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const creditoSelecionado = useMemo(
    () => creditos.find((c) => c.id === form.credito_id),
    [creditos, form.credito_id]
  );

  const somaDebitos = useMemo(
    () => debitos.reduce((s, d) => s + totalDebito(d), 0),
    [debitos]
  );

  /** Enquanto houver débitos lançados, o valor compensado é a soma deles. */
  const valorCompensadoEfetivo = debitos.length > 0 ? somaDebitos : (form.valor_compensado ?? 0);

  /** Homologação tácita: transmissão + 5 anos (Lei 9.430/96, art. 74, §5º). */
  const limiteHomologacao = useMemo(() => {
    if (!form.data_transmissao) return null;
    const d = new Date(`${form.data_transmissao}T00:00:00`);
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().slice(0, 10);
  }, [form.data_transmissao]);

  const alterarDebito = (idx, campo, valor) =>
    setDebitos((lista) => lista.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));

  const removerDebito = (idx) => {
    const alvo = debitos[idx];
    if (alvo?.id) setRemovidos((r) => [...r, alvo.id]);
    setDebitos((lista) => lista.filter((_, i) => i !== idx));
  };

  const submeter = () => {
    if (!form.credito_id) {
      toast({ title: 'Selecione o crédito de origem', variant: 'destructive' });
      return;
    }
    if (!creditoSelecionado) {
      toast({ title: 'Crédito inválido', variant: 'destructive' });
      return;
    }
    if (!form.numero?.trim()) {
      toast({ title: 'Informe o número do PER/DCOMP', variant: 'destructive' });
      return;
    }
    if (!form.data_transmissao) {
      toast({ title: 'Informe a data de transmissão', description: 'É dela que sai o prazo de homologação tácita.', variant: 'destructive' });
      return;
    }
    if (form.periodo_apuracao_inicio && form.periodo_apuracao_fim &&
        form.periodo_apuracao_fim < form.periodo_apuracao_inicio) {
      toast({ title: 'Período inválido', description: 'O fim do período não pode ser anterior ao início.', variant: 'destructive' });
      return;
    }

    const responsavel = responsaveis.find((r) => r.id === form.responsavel_user_profile_id);

    onSave({
      dados: {
        ...form,
        contribuinte_id: creditoSelecionado.contribuinte_id,
        projeto_id: creditoSelecionado.projeto_id,
        numero: form.numero.trim(),
        valor_credito_original: form.valor_credito_original ?? 0,
        valor_credito_atualizado: form.valor_credito_atualizado ?? null,
        valor_compensado: valorCompensadoEfetivo,
        valor_deferido: form.valor_deferido ?? null,
        valor_glosado: form.valor_glosado ?? null,
        periodo_apuracao_inicio: form.periodo_apuracao_inicio || null,
        periodo_apuracao_fim: form.periodo_apuracao_fim || null,
        data_ciencia_despacho: form.data_ciencia_despacho || null,
        prazo_manifestacao: form.prazo_manifestacao || null,
        numero_processo_administrativo: form.numero_processo_administrativo?.trim() || null,
        responsavel_user_profile_id: form.responsavel_user_profile_id || null,
        responsavel_nome: responsavel?.name || form.responsavel_nome || null,
        observacoes: form.observacoes?.trim() || null,
      },
      debitos: debitos.map((d) => ({
        id: d.id,
        codigo_receita: d.codigo_receita?.trim() || null,
        denominacao: d.denominacao?.trim() || null,
        periodo_apuracao: d.periodo_apuracao || null,
        vencimento: d.vencimento || null,
        valor_principal: d.valor_principal ?? 0,
        valor_multa: d.valor_multa ?? 0,
        valor_juros: d.valor_juros ?? 0,
        situacao: d.situacao || 'Compensado',
      })),
      debitosRemovidos: removidos,
    });
  };

  const creditoInsuficiente =
    form.valor_credito_original != null &&
    valorCompensadoEfetivo > Number(form.valor_credito_original);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            {perdcomp ? `Editar ${perdcomp.numero}` : 'Novo PER/DCOMP'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Crédito de origem */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Crédito de origem</h3>
            <div className="space-y-1">
              <Label>Crédito *</Label>
              <Select value={form.credito_id || undefined} onValueChange={(v) => alterar('credito_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o crédito levantado" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {creditos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo ? `${c.codigo} — ` : ''}{c.titulo} ({c.tributo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {creditoSelecionado && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="text-slate-700 font-medium">{creditoSelecionado.contribuinte?.razao_social}</p>
                <p className="text-slate-500 text-xs">
                  {creditoSelecionado.contribuinte?.cnpj && `${formatCNPJ(creditoSelecionado.contribuinte.cnpj)} · `}
                  Projeto: {creditoSelecionado.projeto?.nome || '—'}
                </p>
              </div>
            )}
          </section>

          {/* Documento */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Documento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="numero">Nº do PER/DCOMP *</Label>
                <Input id="numero" value={form.numero} onChange={(e) => alterar('numero', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => alterar('tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipoPerdcompOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Documento</Label>
                <Select value={form.tipo_documento} onValueChange={(v) => alterar('tipo_documento', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipoDocumentoPerdcompOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="transm">Data de transmissão *</Label>
                <Input id="transm" type="date" value={form.data_transmissao}
                  onChange={(e) => alterar('data_transmissao', e.target.value)} />
              </div>
            </div>

            {limiteHomologacao && (
              <p className="text-xs text-slate-500">
                Homologação tácita em <strong>{formatData(limiteHomologacao)}</strong> (transmissão + 5 anos).
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="pa_ini">Período de apuração (início)</Label>
                <Input id="pa_ini" type="date" value={form.periodo_apuracao_inicio}
                  onChange={(e) => alterar('periodo_apuracao_inicio', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pa_fim">Período de apuração (fim)</Label>
                <Input id="pa_fim" type="date" value={form.periodo_apuracao_fim}
                  onChange={(e) => alterar('periodo_apuracao_fim', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Situação *</Label>
                <Select value={form.situacao} onValueChange={(v) => alterar('situacao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {situacaoPerdcompOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <Label>Crédito original</Label>
                <CurrencyInput value={form.valor_credito_original} onChange={(v) => alterar('valor_credito_original', v)} />
              </div>
              <div className="space-y-1">
                <Label>Crédito atualizado</Label>
                <CurrencyInput value={form.valor_credito_atualizado} onChange={(v) => alterar('valor_credito_atualizado', v)} />
              </div>
              <div className="space-y-1">
                <Label>Compensado</Label>
                <CurrencyInput
                  value={debitos.length > 0 ? somaDebitos : form.valor_compensado}
                  onChange={(v) => alterar('valor_compensado', v)}
                  disabled={debitos.length > 0}
                />
                {debitos.length > 0 && (
                  <p className="text-xs text-slate-400">Somado dos {debitos.length} débito(s) abaixo.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Deferido</Label>
                <CurrencyInput value={form.valor_deferido} onChange={(v) => alterar('valor_deferido', v)} />
              </div>
            </div>

            {creditoInsuficiente && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                O valor compensado ({formatMoeda(valorCompensadoEfetivo)}) excede o crédito original
                ({formatMoeda(form.valor_credito_original)}). Confira antes de salvar.
              </div>
            )}
          </section>

          {/* Débitos compensados */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Débitos compensados ({debitos.length})
              </h3>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setDebitos((l) => [...l, debitoNovo()])}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar débito
              </Button>
            </div>

            {debitos.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">
                Nenhum débito lançado. Em uma DCOMP, liste aqui os débitos quitados com o crédito.
              </p>
            ) : (
              <div className="space-y-3">
                {debitos.map((d, idx) => (
                  <div key={d.id || d._tempId} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Código da receita</Label>
                        <Input value={d.codigo_receita || ''} placeholder="Ex.: 0561"
                          onChange={(e) => alterarDebito(idx, 'codigo_receita', e.target.value)} />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Denominação</Label>
                        <Input value={d.denominacao || ''} placeholder="Ex.: IRRF sobre rendimentos do trabalho"
                          onChange={(e) => alterarDebito(idx, 'denominacao', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Situação</Label>
                        <Select value={d.situacao || 'Compensado'}
                          onValueChange={(v) => alterarDebito(idx, 'situacao', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {situacaoDebitoOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Período</Label>
                        <Input type="date" value={d.periodo_apuracao || ''}
                          onChange={(e) => alterarDebito(idx, 'periodo_apuracao', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Vencimento</Label>
                        <Input type="date" value={d.vencimento || ''}
                          onChange={(e) => alterarDebito(idx, 'vencimento', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Principal</Label>
                        <CurrencyInput value={d.valor_principal}
                          onChange={(v) => alterarDebito(idx, 'valor_principal', v)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Multa</Label>
                        <CurrencyInput value={d.valor_multa}
                          onChange={(v) => alterarDebito(idx, 'valor_multa', v)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Juros</Label>
                        <CurrencyInput value={d.valor_juros}
                          onChange={(v) => alterarDebito(idx, 'valor_juros', v)} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">Total</p>
                          <p className="text-sm font-semibold tabular-nums text-slate-800">
                            {formatMoeda(totalDebito(d))}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removerDebito(idx)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end text-sm font-semibold text-slate-700 pr-2">
                  Total dos débitos: <span className="ml-2 tabular-nums">{formatMoeda(somaDebitos)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Despacho e contencioso */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Despacho decisório</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label htmlFor="ciencia">Ciência do despacho</Label>
                <Input id="ciencia" type="date" value={form.data_ciencia_despacho}
                  onChange={(e) => alterar('data_ciencia_despacho', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manif">Prazo de manifestação</Label>
                <Input id="manif" type="date" value={form.prazo_manifestacao}
                  onChange={(e) => alterar('prazo_manifestacao', e.target.value)} />
                <p className="text-xs text-slate-400">30 dias da ciência.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="paf">Nº do processo administrativo</Label>
                <Input id="paf" value={form.numero_processo_administrativo || ''}
                  onChange={(e) => alterar('numero_processo_administrativo', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Select value={form.responsavel_user_profile_id || undefined}
                  onValueChange={(v) => alterar('responsavel_user_profile_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {responsaveis.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" rows={2} value={form.observacoes || ''}
                onChange={(e) => alterar('observacoes', e.target.value)} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={submeter} disabled={salvando} className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {perdcomp ? 'Salvar alterações' : 'Cadastrar PER/DCOMP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PerdcompForm;
