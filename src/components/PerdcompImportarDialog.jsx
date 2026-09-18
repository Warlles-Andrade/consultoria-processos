import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FileUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { listarContribuintes } from '@/lib/fiscalApi';
import { lerArquivoControle, mapearParaErp, resumoImportacao, gravarImportacao } from '@/lib/perdcompImportar';
import { formatCNPJ, formatMoeda, onlyDigits } from '@/data/fiscalDomain';

/**
 * Importa o "Controle PER/DCOMP" (HTML do protótipo ou JSON) de um
 * contribuinte. Prévia primeiro, gravação só depois de escolher o projeto.
 * Reimportar é seguro: casa por ID do crédito / nº do PER / nº da DCOMP e
 * preserva o que foi lançado à mão.
 */
const PerdcompImportarDialog = ({ isOpen, onClose, projetos = [], usuario, userProfile, onImportado }) => {
  const { toast } = useToast();
  const [arquivo, setArquivo] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [contribuinte, setContribuinte] = useState(null);
  const [procurado, setProcurado] = useState(false);
  const [projetoId, setProjetoId] = useState('');
  const [etapa, setEtapa] = useState(null);
  const [erro, setErro] = useState(null);

  const resumo = useMemo(() => (mapa ? resumoImportacao(mapa) : null), [mapa]);
  const projetosDoCliente = useMemo(
    () => (contribuinte ? projetos.filter((p) => p.cliente_id === contribuinte.cliente_id) : []),
    [projetos, contribuinte],
  );

  const limpar = () => {
    setArquivo(null);
    setMapa(null);
    setContribuinte(null);
    setProcurado(false);
    setProjetoId('');
    setEtapa(null);
    setErro(null);
  };

  const fechar = () => {
    if (etapa) return; // não interrompe uma gravação em curso
    limpar();
    onClose();
  };

  const escolherArquivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    limpar();
    setArquivo(f.name);
    try {
      const m = mapearParaErp(lerArquivoControle(await f.text()));
      setMapa(m);
      const lista = await listarContribuintes();
      const achado = (lista || []).find((c) => onlyDigits(c.cnpj) === m.contribuinte.cnpj) || null;
      setContribuinte(achado);
      setProcurado(true);
      if (achado) {
        const doCliente = projetos.filter((p) => p.cliente_id === achado.cliente_id);
        if (doCliente.length === 1) setProjetoId(doCliente[0].id);
      }
    } catch (err) {
      setErro(err.message || getPublicErrorMessage(err));
    }
  };

  const gravar = async () => {
    setEtapa('Iniciando');
    try {
      const r = await gravarImportacao(
        supabase,
        mapa,
        { projeto_id: projetoId, contribuinte_id: contribuinte.id },
        { id: usuario?.id, nome: userProfile?.nome || usuario?.email },
        setEtapa,
      );
      toast({
        title: 'Controle importado',
        description: `${r.creditos} créditos, ${r.perVersoes} versões de PER, ${r.dcomps} DCOMPs, ${r.debitos} débitos e ${r.eventos} eventos.`,
        className: 'bg-green-500 text-white',
      });
      if (r.avisoSelic) toast({ title: 'Selic não atualizada', description: r.avisoSelic });
      const id = contribuinte.id;
      setEtapa(null);
      limpar();
      onImportado?.(id);
    } catch (err) {
      setEtapa(null);
      toast({ title: 'Erro na importação', description: getPublicErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-indigo-600" /> Importar controle PER/DCOMP</DialogTitle>
          <DialogDescription>
            Aceita o HTML do "Controle PER/DCOMP" ou o JSON exportado por ele. Reimportar atualiza o que veio do e-CAC e
            preserva o que a equipe lançou à mão.
          </DialogDescription>
        </DialogHeader>

        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40">
          <FileUp className="h-8 w-8 text-slate-400" />
          <span className="text-sm text-slate-600">{arquivo || 'Clique para escolher o arquivo (.html ou .json)'}</span>
          <input type="file" accept=".html,.htm,.json" className="hidden" onChange={escolherArquivo} disabled={!!etapa} />
        </label>

        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {erro}
          </div>
        )}

        {resumo && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm grid grid-cols-2 gap-x-6 gap-y-1">
              <span className="text-slate-500">CNPJ</span><span className="font-mono">{formatCNPJ(resumo.contribuinte.cnpj)}</span>
              {resumo.contribuinte.razao_social && (<><span className="text-slate-500">Razão social</span><span>{resumo.contribuinte.razao_social}</span></>)}
              {resumo.extraidoEm && (<><span className="text-slate-500">Extraído do e-CAC em</span><span>{new Date(resumo.extraidoEm).toLocaleString('pt-BR')}</span></>)}
              <span className="text-slate-500">Créditos</span><span>{resumo.creditos} · {formatMoeda(resumo.valorTotal)}</span>
              <span className="text-slate-500">Versões de PER</span><span>{resumo.perVersoes}</span>
              <span className="text-slate-500">DCOMPs / débitos</span><span>{resumo.dcomps} / {resumo.debitos}</span>
              <span className="text-slate-500">Eventos</span><span>{resumo.eventos}</span>
              <span className="text-slate-500">Meses de Selic</span><span>{resumo.selic}</span>
            </div>

            {resumo.tiposNaoReconhecidos.length > 0 && (
              <p className="text-sm text-amber-700">
                Tipos de crédito não reconhecidos (código {resumo.tiposNaoReconhecidos.join(', ')}) serão gravados como "Outro" —
                sem regra de Selic definida, o saldo corrigido não será calculado para eles.
              </p>
            )}

            {procurado && !contribuinte && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                O CNPJ {formatCNPJ(resumo.contribuinte.cnpj)} não está cadastrado. Cadastre-o em Configurações → Contribuintes
                (vinculado ao cliente certo) e importe de novo.
              </div>
            )}

            {contribuinte && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Contribuinte encontrado: <strong>{contribuinte.razao_social}</strong>
                  {contribuinte.cliente?.nome && <span className="text-slate-500">(cliente {contribuinte.cliente.nome})</span>}
                </p>
                <Label>Projeto — define quem enxerga estes dados</Label>
                <Select value={projetoId || undefined} onValueChange={setProjetoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
                  <SelectContent>
                    {projetosDoCliente.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {projetosDoCliente.length === 0 && (
                  <p className="text-sm text-amber-700">Nenhum projeto no cliente deste contribuinte. Crie um projeto antes.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={fechar} disabled={!!etapa}>Cancelar</Button>
          <Button
            onClick={gravar}
            disabled={!mapa || !contribuinte || !projetoId || !!etapa}
            className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
          >
            {etapa ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gravando: {etapa}</> : 'Importar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PerdcompImportarDialog;
