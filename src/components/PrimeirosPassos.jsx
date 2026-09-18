import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Checklist para o sistema vazio.
 *
 * O módulo fiscal tem uma cadeia de dependências que não é óbvia para quem
 * chega: crédito exige contribuinte E projeto, e os dois exigem um cliente.
 * Sem isso os botões aparecem desativados e as listas vazias — e o sistema
 * parece quebrado. Aqui a ordem fica explícita, com o status real de cada passo.
 */
const PASSOS = [
  {
    chave: 'clientes',
    titulo: 'Cadastre um cliente',
    detalhe: 'O grupo econômico atendido. É o topo de tudo.',
    aba: 'grupos',
    consulta: () => supabase.from('clientes').select('id', { count: 'exact', head: true }).neq('nome', 'adm'),
  },
  {
    chave: 'projetos',
    titulo: 'Crie um projeto nesse cliente',
    detalhe: 'É o projeto que define quem enxerga cada crédito e tarefa.',
    aba: 'projetos',
    consulta: () => supabase.from('projetos').select('id', { count: 'exact', head: true }),
  },
  {
    chave: 'contribuintes',
    titulo: 'Cadastre o contribuinte (CNPJ)',
    detalhe: 'A pessoa jurídica dona do crédito, vinculada ao cliente.',
    aba: 'contribuintes',
    consulta: () => supabase.from('contribuintes').select('id', { count: 'exact', head: true }),
  },
  {
    chave: 'creditos',
    titulo: 'Lance o primeiro crédito',
    detalhe: 'A partir dele abrem-se e-CredAc, PER/DCOMP e contencioso.',
    aba: 'creditos',
    consulta: () => supabase.from('creditos').select('id', { count: 'exact', head: true }),
  },
];

const PrimeirosPassos = ({ onNavigate }) => {
  const [contagens, setContagens] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all(PASSOS.map((p) => p.consulta())).then((respostas) => {
      if (!ativo) return;
      const mapa = {};
      respostas.forEach((r, i) => { mapa[PASSOS[i].chave] = r.error ? 0 : (r.count || 0); });
      setContagens(mapa);
    });
    return () => { ativo = false; };
  }, []);

  if (!contagens) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verificando cadastros...
      </div>
    );
  }

  // O próximo passo é o primeiro ainda não cumprido — só ele ganha destaque.
  const proximo = PASSOS.findIndex((p) => !contagens[p.chave]);

  return (
    <Card className="glass-card border-white/60 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-800">Primeiros passos</CardTitle>
        <p className="text-sm text-slate-500">
          O painel se preenche quando existir o primeiro crédito. Para chegar lá, siga esta ordem —
          cada passo depende do anterior.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {PASSOS.map((passo, i) => {
            const feito = contagens[passo.chave] > 0;
            const atual = i === proximo;
            return (
              <li
                key={passo.chave}
                className={`flex items-center gap-4 rounded-xl border p-4 ${
                  atual ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white/60'
                }`}
              >
                {feito
                  ? <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                  : <Circle className={`h-6 w-6 flex-shrink-0 ${atual ? 'text-indigo-500' : 'text-slate-300'}`} />}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${feito ? 'text-slate-500' : 'text-slate-800'}`}>
                    {i + 1}. {passo.titulo}
                    {feito && (
                      <span className="ml-2 text-xs font-normal text-green-700">
                        {contagens[passo.chave]} cadastrado(s)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">{passo.detalhe}</p>
                </div>
                {atual && onNavigate && (
                  <Button
                    onClick={() => onNavigate(passo.aba)}
                    className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex-shrink-0"
                  >
                    Fazer agora <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
};

export default PrimeirosPassos;
