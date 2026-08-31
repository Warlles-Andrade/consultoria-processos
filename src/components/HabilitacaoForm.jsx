import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, FileCheck2, Info } from 'lucide-react';
import {
  regimeHabilitacaoOptions, regimeHabilitacaoDescricao, modalidadesPorRegime,
  situacaoHabilitacaoOptions, ufOptions, formatCNPJ, formatMoeda,
} from '@/data/fiscalDomain';

/** Situações em que o banco exige número e data de protocolo. */
const EXIGE_PROTOCOLO = (situacao) => !['Em preparação', 'Cancelado'].includes(situacao);

const formInicial = () => ({
  credito_id: '',
  regime: 'CAT 207/2009',
  modalidade: 'Custeio',
  uf: 'SP',
  numero_protocolo: '',
  numero_processo_sefaz: '',
  posto_fiscal: '',
  periodo_referencia_inicio: '',
  periodo_referencia_fim: '',
  valor_pleiteado: null,
  valor_autorizado: null,
  valor_glosado: null,
  situacao: 'Em preparação',
  data_protocolo: '',
  data_ultima_exigencia: '',
  prazo_resposta: '',
  data_despacho: '',
  data_liquidacao: '',
  responsavel_user_profile_id: '',
  observacoes: '',
});

const HabilitacaoForm = ({
  isOpen, onClose, onSave, habilitacao,
  creditos = [], responsaveis = [], salvando = false,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(formInicial());

  useEffect(() => {
    if (!isOpen) return;
    if (habilitacao) {
      setForm({
        ...formInicial(),
        ...habilitacao,
        periodo_referencia_inicio: habilitacao.periodo_referencia_inicio || '',
        periodo_referencia_fim: habilitacao.periodo_referencia_fim || '',
        data_protocolo: habilitacao.data_protocolo || '',
        data_ultima_exigencia: habilitacao.data_ultima_exigencia || '',
        prazo_resposta: habilitacao.prazo_resposta || '',
        data_despacho: habilitacao.data_despacho || '',
        data_liquidacao: habilitacao.data_liquidacao || '',
        responsavel_user_profile_id: habilitacao.responsavel_user_profile_id || '',
      });
    } else {
      setForm(formInicial());
    }
  }, [isOpen, habilitacao]);

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  /** Trocar o regime reposiciona a modalidade para uma válida. */
  const alterarRegime = (regime) => {
    const permitidas = modalidadesPorRegime[regime] || ['Não se aplica'];
    setForm((f) => ({
      ...f,
      regime,
      modalidade: permitidas.includes(f.modalidade) ? f.modalidade : permitidas[0],
    }));
  };

  const creditoSelecionado = useMemo(
    () => creditos.find((c) => c.id === form.credito_id),
    [creditos, form.credito_id]
  );

  const modalidadesDisponiveis = modalidadesPorRegime[form.regime] || ['Não se aplica'];
  const protocoloObrigatorio = EXIGE_PROTOCOLO(form.situacao);

  const submeter = () => {
    if (!form.credito_id) {
      toast({ title: 'Selecione o crédito de origem', variant: 'destructive' });
      return;
    }
    if (!creditoSelecionado) {
      toast({ title: 'Crédito inválido', variant: 'destructive' });
      return;
    }
    if (protocoloObrigatorio && (!form.numero_protocolo?.trim() || !form.data_protocolo)) {
      toast({
        title: 'Protocolo obrigatório',
        description: `Na situação "${form.situacao}" é preciso informar o número e a data do protocolo. Use "Em preparação" enquanto o pedido não foi protocolado.`,
        variant: 'destructive',
      });
      return;
    }
    if (form.periodo_referencia_inicio && form.periodo_referencia_fim &&
        form.periodo_referencia_fim < form.periodo_referencia_inicio) {
      toast({ title: 'Período inválido', description: 'O fim do período não pode ser anterior ao início.', variant: 'destructive' });
      return;
    }

    const responsavel = responsaveis.find((r) => r.id === form.responsavel_user_profile_id);

    onSave({
      ...form,
      // Contribuinte e projeto vêm sempre do crédito — nunca digitados à parte.
      contribuinte_id: creditoSelecionado.contribuinte_id,
      projeto_id: creditoSelecionado.projeto_id,
      valor_pleiteado: form.valor_pleiteado ?? 0,
      valor_autorizado: form.valor_autorizado ?? null,
      valor_glosado: form.valor_glosado ?? null,
      numero_protocolo: form.numero_protocolo?.trim() || null,
      numero_processo_sefaz: form.numero_processo_sefaz?.trim() || null,
      posto_fiscal: form.posto_fiscal?.trim() || null,
      periodo_referencia_inicio: form.periodo_referencia_inicio || null,
      periodo_referencia_fim: form.periodo_referencia_fim || null,
      data_protocolo: form.data_protocolo || null,
      data_ultima_exigencia: form.data_ultima_exigencia || null,
      prazo_resposta: form.prazo_resposta || null,
      data_despacho: form.data_despacho || null,
      data_liquidacao: form.data_liquidacao || null,
      responsavel_user_profile_id: form.responsavel_user_profile_id || null,
      responsavel_nome: responsavel?.name || form.responsavel_nome || null,
      observacoes: form.observacoes?.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-teal-600" />
            {habilitacao ? 'Editar Habilitação' : 'Nova Habilitação (e-CredAc)'}
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                <p className="text-slate-700">
                  <span className="font-medium">{creditoSelecionado.contribuinte?.razao_social}</span>
                  {creditoSelecionado.contribuinte?.cnpj && (
                    <span className="text-slate-500 font-mono ml-2">{formatCNPJ(creditoSelecionado.contribuinte.cnpj)}</span>
                  )}
                </p>
                <p className="text-slate-500 text-xs">
                  Projeto: {creditoSelecionado.projeto?.nome || '—'} · Valor levantado: {formatMoeda(creditoSelecionado.valor_levantado)}
                </p>
                {!['ICMS', 'ICMS-ST'].includes(creditoSelecionado.tributo) && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Este crédito é de {creditoSelecionado.tributo} — o e-CredAc trata de ICMS. Confira se é o crédito certo.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Regime */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Regime do pedido</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Regime *</Label>
                <Select value={form.regime} onValueChange={alterarRegime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {regimeHabilitacaoOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">{regimeHabilitacaoDescricao[form.regime]}</p>
              </div>

              <div className="space-y-1">
                <Label>Modalidade</Label>
                <Select value={form.modalidade} onValueChange={(v) => alterar('modalidade', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modalidadesDisponiveis.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>UF</Label>
                <Select value={form.uf} onValueChange={(v) => alterar('uf', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {ufOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Protocolo */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Protocolo {protocoloObrigatorio && <span className="text-red-500 normal-case font-normal">(obrigatório nesta situação)</span>}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="protocolo">Nº do pedido (e-CredAc)</Label>
                <Input id="protocolo" value={form.numero_protocolo || ''}
                  onChange={(e) => alterar('numero_protocolo', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="proc_sefaz">Nº do processo SEFAZ</Label>
                <Input id="proc_sefaz" value={form.numero_processo_sefaz || ''}
                  onChange={(e) => alterar('numero_processo_sefaz', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="posto">Posto fiscal</Label>
                <Input id="posto" value={form.posto_fiscal || ''}
                  onChange={(e) => alterar('posto_fiscal', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="per_ini">Período de referência (início)</Label>
                <Input id="per_ini" type="date" value={form.periodo_referencia_inicio}
                  onChange={(e) => alterar('periodo_referencia_inicio', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="per_fim">Período de referência (fim)</Label>
                <Input id="per_fim" type="date" value={form.periodo_referencia_fim}
                  onChange={(e) => alterar('periodo_referencia_fim', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Situação *</Label>
                <Select value={form.situacao} onValueChange={(v) => alterar('situacao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {situacaoHabilitacaoOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Valores */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Valores</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Valor pleiteado</Label>
                <CurrencyInput value={form.valor_pleiteado} onChange={(v) => alterar('valor_pleiteado', v)} />
              </div>
              <div className="space-y-1">
                <Label>Valor autorizado</Label>
                <CurrencyInput value={form.valor_autorizado} onChange={(v) => alterar('valor_autorizado', v)} />
              </div>
              <div className="space-y-1">
                <Label>Valor glosado</Label>
                <CurrencyInput value={form.valor_glosado} onChange={(v) => alterar('valor_glosado', v)} />
              </div>
            </div>
          </section>

          {/* Datas do trâmite */}
          <section className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Trâmite</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label htmlFor="d_prot">Data do protocolo</Label>
                <Input id="d_prot" type="date" value={form.data_protocolo}
                  onChange={(e) => alterar('data_protocolo', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_exig">Última exigência</Label>
                <Input id="d_exig" type="date" value={form.data_ultima_exigencia}
                  onChange={(e) => alterar('data_ultima_exigencia', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_prazo">Prazo de resposta</Label>
                <Input id="d_prazo" type="date" value={form.prazo_resposta}
                  onChange={(e) => alterar('prazo_resposta', e.target.value)} />
                <p className="text-xs text-slate-400">Vira alerta.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_desp">Despacho</Label>
                <Input id="d_desp" type="date" value={form.data_despacho}
                  onChange={(e) => alterar('data_despacho', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_liq">Liquidação</Label>
                <Input id="d_liq" type="date" value={form.data_liquidacao}
                  onChange={(e) => alterar('data_liquidacao', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="space-y-1">
                <Label htmlFor="obs">Observações</Label>
                <Textarea id="obs" rows={2} value={form.observacoes || ''}
                  onChange={(e) => alterar('observacoes', e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={submeter} disabled={salvando} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {habilitacao ? 'Salvar alterações' : 'Cadastrar habilitação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HabilitacaoForm;
