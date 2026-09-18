import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import { AlertOctagon, AlertTriangle, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import * as R from '@/lib/perdcompRegras';
import { criarPerOriginal, criarPerRetificador, criarDcomp } from '@/lib/perdcompApi';
import {
  onlyDigits, formatNumeroPerdcomp, formatMesAno, formatMoeda, tiposCreditoPerdcomp,
  tipoCreditoCurto, tiposItemComposicao,
} from '@/data/fiscalDomain';

/** 'AAAA-MM-DDTHH:MM' do input → ISO com o fuso de Brasília (o e-CAC não informa fuso). */
const paraIsoBrasilia = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/[+-]\d{2}:\d{2}$|Z$/.test(s)) return s;
  return `${s.length === 16 ? `${s}:00` : s}-03:00`;
};

/** ISO do banco → valor do input datetime-local, em Brasília. */
const paraInput = (ts) => {
  if (!ts) return '';
  const s = String(ts);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

const debitoVazio = () => ({ codigo_receita: '', periodo_apuracao: '', vencimento: '', principal: null, multa: null, juros: null, total: null });
const itemVazio = () => ({ tipo_item: 'Nota fiscal com retenção', documento: '', cnpj_relacionado: '', nome_relacionado: '', data_documento: '', periodo_apuracao: '', codigo_receita: '', valor: null });

const perInicial = () => ({
  versao: 'original', credito_existente: '', numero_anterior: '',
  numero: '', data_transmissao: '', tipo_credito: 'Retenção - Lei nº 9.711/98', competencia: '',
  valor: null, termo_inicial_correcao: '', projeto_id: '', numero_recibo: '',
  banco: '', agencia: '', conta: '', dv: '', composicao: [],
});

const dcompInicial = () => ({
  perdcomp_credito_id: '', numero: '', data_transmissao: '', situacao_documento: 'ativa', numero_referencia: '',
  credito_informado_entrega: null, credito_utilizado: null, selic_acumulada: '', credito_atualizado: null,
  saldo_informado: null, debitos: [],
});

const Campo = ({ rotulo, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label>{rotulo}</Label>
    {children}
  </div>
);

/**
 * Lançamento de PER (original ou retificador) e de DCOMP.
 * `inicial` vem preenchido quando o documento foi lido por IA — nada é
 * gravado sem a revisão de alguém da equipe.
 */
const PerdcompDocumentoForm = ({
  isOpen, onClose, modo, inicial, ctx, contribuinte, projetos = [], usuario, userProfile, onSalvo,
}) => {
  const { toast } = useToast();
  const [f, setF] = useState(modo === 'PER' ? perInicial() : dcompInicial());
  const [salvando, setSalvando] = useState(false);
  const creditos = ctx?.creditos || [];
  const dcomps = ctx?.dcomps || [];
  const perVersoes = ctx?.perVersoes || [];

  const projetosDoCliente = useMemo(
    () => projetos.filter((p) => !contribuinte || p.cliente_id === contribuinte.cliente_id),
    [projetos, contribuinte],
  );

  useEffect(() => {
    if (!isOpen) return;
    const base = modo === 'PER' ? perInicial() : dcompInicial();
    const dados = { ...base, ...(inicial?.campos || {}) };
    if (dados.data_transmissao) dados.data_transmissao = paraInput(dados.data_transmissao);
    if (modo === 'PER' && !dados.projeto_id) {
      dados.projeto_id = creditos[0]?.projeto_id || (projetosDoCliente.length === 1 ? projetosDoCliente[0].id : '');
    }
    setF(dados);
  }, [isOpen, modo, inicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const alterar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const alterarLinha = (lista, i, campo, valor) =>
    setF((x) => ({ ...x, [lista]: x[lista].map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) }));
  const incluirLinha = (lista, vazio) => setF((x) => ({ ...x, [lista]: [...x[lista], vazio()] }));
  const removerLinha = (lista, i) => setF((x) => ({ ...x, [lista]: x[lista].filter((_, j) => j !== i) }));

  // ------------------------------------------------------------- PER
  const creditoRetificado = creditos.find((c) => c.id === f.credito_existente) || null;
  const versoesDoCredito = perVersoes.filter((v) => v.perdcomp_credito_id === f.credito_existente);

  useEffect(() => {
    if (modo !== 'PER' || f.versao !== 'retificador' || !creditoRetificado || f.numero_anterior) return;
    const vigente = versoesDoCredito.find((v) => v.vigente);
    alterar('numero_anterior', vigente?.numero || creditoRetificado.numero_per_original || '');
  }, [f.credito_existente, f.versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const regraSelic = R.REGRAS_SELIC[f.tipo_credito];
  const pedeTermo = modo === 'PER' && f.versao === 'original'
    && ['Pagamento Indevido ou a Maior', 'Contribuição Previdenciária Indevida ou a Maior', 'Outro', 'Ressarcimento de IPI', 'Salário-Família e Salário-Maternidade', 'Crédito Oriundo de Ação Judicial'].includes(f.tipo_credito);
  const somaComposicao = R.round2((f.composicao || []).reduce((s, x) => s + Number(x.valor || 0), 0));

  const checarPer = () => {
    const bloqueiam = [];
    const avisos = [];
    const numero = onlyDigits(f.numero);
    if (numero.length !== 24) bloqueiam.push('O número do PER tem 24 dígitos.');
    if (perVersoes.some((v) => v.numero === numero) || creditos.some((c) => c.numero_per_original === numero)) {
      bloqueiam.push('Este PER já está cadastrado.');
    }
    if (!(f.valor > 0)) bloqueiam.push('Informe o valor pedido.');
    if (f.versao === 'original') {
      if (!f.competencia) bloqueiam.push('Informe a competência do crédito.');
      if (!f.projeto_id) bloqueiam.push('Selecione o projeto.');
      if (creditos.some((c) => c.id_credito_rfb === numero)) bloqueiam.push('Já existe crédito com este ID.');
      if (pedeTermo && !f.termo_inicial_correcao) avisos.push(`Sem ${regraSelic?.exige || 'o termo inicial de correção'}, o saldo corrigido pela Selic não será calculado.`);
      if (f.composicao?.length && Math.abs(somaComposicao - Number(f.valor || 0)) > 0.01) {
        avisos.push(`A composição soma ${formatMoeda(somaComposicao)} e o pedido é de ${formatMoeda(f.valor)}.`);
      }
    } else {
      if (!creditoRetificado) bloqueiam.push('Selecione o crédito cujo PER está sendo retificado.');
      if (onlyDigits(f.numero_anterior).length !== 24) bloqueiam.push('Informe o número do PER retificado (24 dígitos).');
      if (creditoRetificado && Number(f.valor) !== Number(creditoRetificado.valor_credito)) {
        avisos.push(`O valor do crédito passará de ${formatMoeda(creditoRetificado.valor_credito)} para ${formatMoeda(f.valor)}.`);
      }
    }
    if (!f.data_transmissao) avisos.push('Sem data de transmissão, prazos e Selic do ressarcimento ficam sem referência.');
    return { bloqueiam, avisos };
  };

  // ------------------------------------------------------------- DCOMP
  const creditoDcomp = creditos.find((c) => c.id === f.perdcomp_credito_id) || null;
  const dcompsDoCredito = dcomps.filter((d) => d.perdcomp_credito_id === f.perdcomp_credito_id);
  const totalDebitos = R.round2((f.debitos || []).reduce((s, x) => s + Number(x.total || 0), 0));

  const dcompParaValidar = () => ({
    numero: onlyDigits(f.numero),
    data_transmissao: paraIsoBrasilia(f.data_transmissao),
    situacao_documento: f.situacao_documento,
    credito_utilizado: f.credito_utilizado,
    credito_informado_entrega: f.credito_informado_entrega,
  });

  const checarDcomp = () => {
    // Para a validação, a DCOMP retificada já não consome: é a retificadora que vale.
    const cenario = f.situacao_documento === 'retificadora' && f.numero_referencia
      ? dcomps.map((x) => (x.numero === f.numero_referencia ? { ...x, situacao_documento: 'retificada' } : x))
      : dcomps;
    const { bloqueiam, avisos } = R.validarDcomp(dcompParaValidar(), creditoDcomp, cenario);
    if (f.numero && onlyDigits(f.numero).length !== 24) bloqueiam.push('O número da DCOMP tem 24 dígitos.');
    if (f.situacao_documento === 'retificadora' && !f.numero_referencia) bloqueiam.push('Informe qual DCOMP está sendo retificada.');
    if (f.debitos?.length && f.credito_atualizado != null && totalDebitos > Number(f.credito_atualizado) + 0.01) {
      avisos.push(`Os débitos (${formatMoeda(totalDebitos)}) superam o crédito atualizado (${formatMoeda(f.credito_atualizado)}).`);
    }
    f.debitos?.forEach((x, i) => {
      const soma = R.round2(Number(x.principal || 0) + Number(x.multa || 0) + Number(x.juros || 0));
      if (x.total != null && Math.abs(soma - Number(x.total)) > 0.01) {
        avisos.push(`Débito ${i + 1}: principal + multa + juros = ${formatMoeda(soma)}, mas o total é ${formatMoeda(x.total)}.`);
      }
    });
    return { bloqueiam, avisos };
  };

  const checagem = modo === 'PER' ? checarPer() : checarDcomp();
  const avisosIA = inicial?.avisos || [];

  // ------------------------------------------------------------- gravar
  const origem = inicial?.origem || 'MANUAL';
  const forma = () => (f.banco || f.agencia || f.conta
    ? { tipo: 'CONTA_CORRENTE', banco: f.banco || null, agencia: f.agencia || null, conta: f.conta || null, dv: f.dv || null }
    : null);

  const gravar = async () => {
    if (checagem.bloqueiam.length) return;
    setSalvando(true);
    try {
      if (modo === 'PER') {
        const numero = onlyDigits(f.numero);
        const versao = {
          numero,
          data_transmissao: paraIsoBrasilia(f.data_transmissao),
          valor_pedido: f.valor,
          numero_recibo: f.numero_recibo?.trim() || null,
          forma_recebimento: forma(),
        };
        if (f.versao === 'original') {
          await criarPerOriginal({
            origem,
            credito: {
              projeto_id: f.projeto_id,
              contribuinte_id: contribuinte.id,
              id_credito_rfb: numero,
              competencia: `${f.competencia}-01`,
              tipo_credito: f.tipo_credito,
              valor_credito: f.valor,
              data_transmissao: versao.data_transmissao,
              numero_per_original: numero,
              forma_recebimento: versao.forma_recebimento,
              termo_inicial_correcao: f.termo_inicial_correcao || null,
            },
            versao,
            composicao: (f.composicao || []).filter((x) => Number(x.valor) > 0).map((x) => ({
              tipo_item: x.tipo_item,
              documento: x.documento?.trim() || null,
              cnpj_relacionado: onlyDigits(x.cnpj_relacionado).length === 14 ? onlyDigits(x.cnpj_relacionado) : null,
              nome_relacionado: x.nome_relacionado?.trim() || null,
              data_documento: x.data_documento || null,
              periodo_apuracao: x.periodo_apuracao ? `${x.periodo_apuracao.slice(0, 7)}-01` : null,
              codigo_receita: x.codigo_receita?.trim() || null,
              valor: x.valor,
            })),
          }, usuario, userProfile);
        } else {
          await criarPerRetificador({
            origem,
            credito: creditoRetificado,
            versao: { ...versao, numero_anterior: onlyDigits(f.numero_anterior) },
          }, usuario, userProfile);
        }
        toast({ title: 'PER registrado', className: 'bg-green-500 text-white' });
      } else {
        const d = dcompParaValidar();
        await criarDcomp({
          ...d,
          perdcomp_credito_id: creditoDcomp.id,
          projeto_id: creditoDcomp.projeto_id,
          numero_referencia: f.numero_referencia ? onlyDigits(f.numero_referencia) : null,
          selic_acumulada: f.selic_acumulada === '' || f.selic_acumulada == null ? null : Number(String(f.selic_acumulada).replace(',', '.')),
          credito_atualizado: f.credito_atualizado,
          saldo_informado: f.saldo_informado,
          total_debitos: f.debitos?.length ? totalDebitos : null,
          origem,
        }, (f.debitos || []).map((x) => ({
          codigo_receita: x.codigo_receita?.trim() || null,
          periodo_apuracao: x.periodo_apuracao ? `${x.periodo_apuracao.slice(0, 7)}-01` : null,
          vencimento: x.vencimento || null,
          principal: x.principal ?? 0,
          multa: x.multa ?? null,
          juros: x.juros ?? null,
          total: x.total ?? R.round2(Number(x.principal || 0) + Number(x.multa || 0) + Number(x.juros || 0)),
        })), usuario, userProfile);
        toast({ title: 'DCOMP registrada', description: 'O saldo do crédito foi recalculado.', className: 'bg-green-500 text-white' });
      }
      onSalvo?.();
    } catch (e) {
      const msg = e?.code === '23505' ? 'Este número já está cadastrado.' : getPublicErrorMessage(e);
      toast({ title: 'Erro ao gravar', description: msg, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const rotuloCredito = (c) => `${formatMesAno(c.competencia)} · ${tipoCreditoCurto[c.tipo_credito] || c.tipo_credito} · ${formatMoeda(c.valor_credito)}`;

  return (
    <Dialog open={isOpen} onOpenChange={() => !salvando && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {origem === 'IA' && <Sparkles className="h-5 w-5 text-violet-600" />}
            {modo === 'PER' ? 'Registrar PER (pedido)' : 'Registrar DCOMP (compensação)'}
          </DialogTitle>
          <DialogDescription>
            {origem === 'IA'
              ? 'Campos preenchidos pela leitura do PDF. Confira cada valor com o documento antes de gravar.'
              : 'Lançamento manual. As contas de saldo e Selic são feitas pelo sistema.'}
          </DialogDescription>
        </DialogHeader>

        {avisosIA.length > 0 && (
          <div className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 space-y-1">
            <p className="font-semibold">A leitura apontou:</p>
            <ul className="list-disc pl-5">{avisosIA.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {modo === 'PER' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo rotulo="Versão">
                <Select value={f.versao} onValueChange={(v) => alterar('versao', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original (novo crédito)</SelectItem>
                    <SelectItem value="retificador" disabled={!creditos.length}>Retificador</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              <Campo rotulo="Nº do PER (24 dígitos)" className="md:col-span-2">
                <Input value={f.numero} onChange={(e) => alterar('numero', e.target.value)} placeholder="00000.00000.000000.0.0.00-0000" />
                {onlyDigits(f.numero).length === 24 && <p className="text-xs text-slate-500 font-mono">{formatNumeroPerdcomp(onlyDigits(f.numero))}</p>}
              </Campo>
            </div>

            {f.versao === 'retificador' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Campo rotulo="Crédito">
                  <Select value={f.credito_existente || undefined} onValueChange={(v) => setF((x) => ({ ...x, credito_existente: v, numero_anterior: '' }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o crédito" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {creditos.map((c) => <SelectItem key={c.id} value={c.id}>{rotuloCredito(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo rotulo="PER retificado">
                  <Input value={f.numero_anterior} onChange={(e) => alterar('numero_anterior', e.target.value)} />
                </Campo>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Campo rotulo="Tipo de crédito" className="md:col-span-2">
                  <Select value={f.tipo_credito} onValueChange={(v) => alterar('tipo_credito', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{tiposCreditoPerdcomp.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </Campo>
                <Campo rotulo="Competência / período">
                  <Input type="month" value={f.competencia} onChange={(e) => alterar('competencia', e.target.value)} />
                </Campo>
                <Campo rotulo="Projeto" className="md:col-span-2">
                  <Select value={f.projeto_id || undefined} onValueChange={(v) => alterar('projeto_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
                    <SelectContent>{projetosDoCliente.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </Campo>
                {pedeTermo && (
                  <Campo rotulo="Termo inicial de correção">
                    <Input type="date" value={f.termo_inicial_correcao} onChange={(e) => alterar('termo_inicial_correcao', e.target.value)} />
                  </Campo>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo rotulo="Transmissão (horário de Brasília)">
                <Input type="datetime-local" value={f.data_transmissao} onChange={(e) => alterar('data_transmissao', e.target.value)} />
              </Campo>
              <Campo rotulo="Valor pedido">
                <CurrencyInput value={f.valor} onChange={(v) => alterar('valor', v)} />
              </Campo>
              <Campo rotulo="Nº do recibo">
                <Input value={f.numero_recibo} onChange={(e) => alterar('numero_recibo', e.target.value)} />
              </Campo>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo rotulo="Banco"><Input value={f.banco} onChange={(e) => alterar('banco', e.target.value)} /></Campo>
              <Campo rotulo="Agência"><Input value={f.agencia} onChange={(e) => alterar('agencia', e.target.value)} /></Campo>
              <Campo rotulo="Conta"><Input value={f.conta} onChange={(e) => alterar('conta', e.target.value)} /></Campo>
              <Campo rotulo="DV"><Input value={f.dv} onChange={(e) => alterar('dv', e.target.value)} /></Campo>
            </div>

            {f.versao === 'original' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Composição do crédito {f.composicao?.length > 0 && <span className="font-normal text-slate-500">— soma {formatMoeda(somaComposicao)}</span>}
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => incluirLinha('composicao', itemVazio)}>
                    <Plus className="h-4 w-4 mr-1" /> Documento
                  </Button>
                </div>
                {(f.composicao || []).map((x, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 p-2">
                    <div className="md:col-span-3">
                      <Select value={x.tipo_item} onValueChange={(v) => alterarLinha('composicao', i, 'tipo_item', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{tiposItemComposicao.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="md:col-span-2" placeholder="Documento" value={x.documento} onChange={(e) => alterarLinha('composicao', i, 'documento', e.target.value)} />
                    <Input className="md:col-span-2" placeholder="CNPJ" value={x.cnpj_relacionado} onChange={(e) => alterarLinha('composicao', i, 'cnpj_relacionado', e.target.value)} />
                    <Input className="md:col-span-2" type="date" value={x.data_documento} onChange={(e) => alterarLinha('composicao', i, 'data_documento', e.target.value)} />
                    <div className="md:col-span-2"><CurrencyInput value={x.valor} onChange={(v) => alterarLinha('composicao', i, 'valor', v)} /></div>
                    <Button type="button" variant="ghost" size="sm" className="md:col-span-1" onClick={() => removerLinha('composicao', i)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo rotulo="Crédito utilizado nesta DCOMP" className="md:col-span-2">
                <Select value={f.perdcomp_credito_id || undefined} onValueChange={(v) => setF((x) => ({ ...x, perdcomp_credito_id: v, numero_referencia: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o crédito" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {creditos.map((c) => <SelectItem key={c.id} value={c.id}>{rotuloCredito(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {creditoDcomp && (
                  <p className="text-xs text-slate-500">Saldo antes desta DCOMP: {formatMoeda(R.saldo(creditoDcomp, dcomps).saldo)}</p>
                )}
              </Campo>
              <Campo rotulo="Documento">
                <Select value={f.situacao_documento} onValueChange={(v) => alterar('situacao_documento', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Original</SelectItem>
                    <SelectItem value="retificadora">Retificadora</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo rotulo="Nº da DCOMP (24 dígitos)" className="md:col-span-2">
                <Input value={f.numero} onChange={(e) => alterar('numero', e.target.value)} placeholder="00000.00000.000000.0.0.00-0000" />
                {onlyDigits(f.numero).length === 24 && <p className="text-xs text-slate-500 font-mono">{formatNumeroPerdcomp(onlyDigits(f.numero))}</p>}
              </Campo>
              <Campo rotulo="Transmissão (horário de Brasília)">
                <Input type="datetime-local" value={f.data_transmissao} onChange={(e) => alterar('data_transmissao', e.target.value)} />
              </Campo>
            </div>

            {f.situacao_documento === 'retificadora' && (
              <Campo rotulo="DCOMP retificada">
                <Select value={f.numero_referencia || undefined} onValueChange={(v) => alterar('numero_referencia', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a DCOMP que esta substitui" /></SelectTrigger>
                  <SelectContent>
                    {dcompsDoCredito.filter(R.consome).map((d) => (
                      <SelectItem key={d.id} value={d.numero}>{formatNumeroPerdcomp(d.numero)} · {formatMoeda(d.credito_utilizado)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Campo rotulo="Crédito informado na entrega"><CurrencyInput value={f.credito_informado_entrega} onChange={(v) => alterar('credito_informado_entrega', v)} /></Campo>
              <Campo rotulo="Selic acumulada (%)"><Input value={f.selic_acumulada ?? ''} onChange={(e) => alterar('selic_acumulada', e.target.value)} placeholder="ex.: 12,34" /></Campo>
              <Campo rotulo="Crédito atualizado"><CurrencyInput value={f.credito_atualizado} onChange={(v) => alterar('credito_atualizado', v)} /></Campo>
              <Campo rotulo="Crédito utilizado (original)"><CurrencyInput value={f.credito_utilizado} onChange={(v) => alterar('credito_utilizado', v)} /></Campo>
              <Campo rotulo="Saldo informado"><CurrencyInput value={f.saldo_informado} onChange={(v) => alterar('saldo_informado', v)} /></Campo>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Débitos compensados {f.debitos?.length > 0 && <span className="font-normal text-slate-500">— total {formatMoeda(totalDebitos)}</span>}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => incluirLinha('debitos', debitoVazio)}>
                  <Plus className="h-4 w-4 mr-1" /> Débito
                </Button>
              </div>
              {(f.debitos || []).length > 0 && (
                <div className="hidden md:grid md:grid-cols-12 gap-2 text-xs font-semibold text-slate-500 px-2">
                  <span className="col-span-2">Receita</span><span className="col-span-2">PA</span><span className="col-span-2">Vencimento</span>
                  <span className="col-span-2">Principal</span><span>Multa</span><span>Juros</span><span className="col-span-2">Total</span>
                </div>
              )}
              {(f.debitos || []).map((x, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center rounded-lg border border-slate-200 p-2">
                  <Input className="md:col-span-2" placeholder="Código" value={x.codigo_receita} onChange={(e) => alterarLinha('debitos', i, 'codigo_receita', e.target.value)} />
                  <Input className="md:col-span-2" type="month" value={x.periodo_apuracao?.slice(0, 7) || ''} onChange={(e) => alterarLinha('debitos', i, 'periodo_apuracao', e.target.value)} />
                  <Input className="md:col-span-2" type="date" value={x.vencimento || ''} onChange={(e) => alterarLinha('debitos', i, 'vencimento', e.target.value)} />
                  <div className="md:col-span-2"><CurrencyInput value={x.principal} onChange={(v) => alterarLinha('debitos', i, 'principal', v)} /></div>
                  <CurrencyInput value={x.multa} onChange={(v) => alterarLinha('debitos', i, 'multa', v)} />
                  <CurrencyInput value={x.juros} onChange={(v) => alterarLinha('debitos', i, 'juros', v)} />
                  <div className="md:col-span-1"><CurrencyInput value={x.total} onChange={(v) => alterarLinha('debitos', i, 'total', v)} /></div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removerLinha('debitos', i)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(checagem.bloqueiam.length > 0 || checagem.avisos.length > 0) && (
          <div className="space-y-2">
            {checagem.bloqueiam.map((t, i) => (
              <div key={`b${i}`} className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertOctagon className="h-4 w-4 mt-0.5 flex-shrink-0" /> {t}
              </div>
            ))}
            {checagem.avisos.map((t, i) => (
              <div key={`a${i}`} className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {t}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={gravar} disabled={salvando || checagem.bloqueiam.length > 0}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {checagem.avisos.length > 0 ? 'Gravar mesmo assim' : 'Gravar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PerdcompDocumentoForm;
