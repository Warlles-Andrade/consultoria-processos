import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlarmClock, Search, Loader2, AlertOctagon, AlertTriangle,
  Clock, CalendarCheck, RefreshCw, X,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import { listarPrazosCriticos } from '@/lib/fiscalApi';
import {
  entidadeTipoLabel, getPrazoSeveridade, prazoSeveridadeConfig,
  getSituacaoColor, formatData,
} from '@/data/fiscalDomain';

const TODOS = '__todos__';

/** Horizontes de corte oferecidos no filtro. */
const HORIZONTES = [
  { valor: '30', label: 'Próximos 30 dias' },
  { valor: '90', label: 'Próximos 90 dias' },
  { valor: '180', label: 'Próximos 180 dias' },
  { valor: '365', label: 'Próximos 12 meses' },
  { valor: TODOS, label: 'Todos os prazos' },
];

const SEVERIDADES = ['vencido', 'critico', 'atencao', 'ok'];

const rotuloDias = (dias) => {
  if (dias == null) return '';
  if (dias < 0) return `vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `em ${dias} dias`;
};

const PrazosView = ({ onRefresh }) => {
  const { toast } = useToast();

  const [prazos, setPrazos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [fEntidade, setFEntidade] = useState(TODOS);
  const [fSeveridade, setFSeveridade] = useState(TODOS);
  const [horizonte, setHorizonte] = useState('90');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // Busca sempre a lista completa; o horizonte é aplicado localmente
      // para permitir trocar o corte sem nova ida ao banco.
      const lista = await listarPrazosCriticos();
      setPrazos(lista || []);
    } catch (error) {
      const msg = error?.code === '42P01'
        ? 'A view v_prazos_criticos ainda não existe no banco. Aplique as migrations em sql/ (ver sql/LEIA-ME.md).'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao carregar prazos', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const termo = busca.trim().toLowerCase();

  const filtrados = useMemo(() => {
    const limite = horizonte === TODOS ? null : Number(horizonte);
    return prazos
      .filter((p) => {
        // Vencidos entram sempre, independentemente do horizonte escolhido.
        if (limite != null && p.dias_restantes > limite) return false;
        if (fEntidade !== TODOS && p.entidade_tipo !== fEntidade) return false;
        if (fSeveridade !== TODOS && getPrazoSeveridade(p.dias_restantes) !== fSeveridade) return false;
        if (!termo) return true;
        return (
          p.referencia?.toLowerCase().includes(termo) ||
          p.descricao?.toLowerCase().includes(termo) ||
          p.tipo_prazo?.toLowerCase().includes(termo) ||
          p.responsavel_nome?.toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0));
  }, [prazos, horizonte, fEntidade, fSeveridade, termo]);

  const kpis = useMemo(() => {
    const contar = (sev) => prazos.filter((p) => getPrazoSeveridade(p.dias_restantes) === sev).length;
    return {
      vencidos: contar('vencido'),
      criticos: contar('critico'),
      atencao: contar('atencao'),
      total: prazos.length,
    };
  }, [prazos]);

  const temFiltro = fEntidade !== TODOS || fSeveridade !== TODOS || !!termo || horizonte !== '90';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-md">
            <AlarmClock className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Prazos</h1>
            <p className="text-sm text-slate-500">
              Prescrição, exigências, homologação tácita, defesas e recursos — tudo em uma lista
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Vencidos" valor={String(kpis.vencidos)}
          detalhe="Prazo já expirado" icone={AlertOctagon}
          cor={kpis.vencidos > 0 ? 'border-red-200 bg-red-50 text-red-800' : undefined} />
        <KpiCard titulo="Críticos" valor={String(kpis.criticos)}
          detalhe="Vencem em até 30 dias" icone={AlertTriangle}
          cor={kpis.criticos > 0 ? 'border-orange-200 bg-orange-50 text-orange-800' : undefined}
          delay={0.05} />
        <KpiCard titulo="Atenção" valor={String(kpis.atencao)}
          detalhe="Entre 31 e 90 dias" icone={Clock}
          cor="border-amber-200 bg-amber-50 text-amber-800" delay={0.1} />
        <KpiCard titulo="Total em aberto" valor={String(kpis.total)}
          detalhe="Todos os prazos monitorados" icone={CalendarCheck} delay={0.15} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card border-white/60 rounded-2xl">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base font-semibold text-slate-700">
              Prazos ({filtrados.length})
            </CardTitle>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por referência ou responsável" className="pl-9" />
              </div>

              <Select value={horizonte} onValueChange={setHorizonte}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HORIZONTES.map((h) => <SelectItem key={h.valor} value={h.valor}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={fEntidade} onValueChange={setFEntidade}>
                <SelectTrigger><SelectValue placeholder="Módulo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os módulos</SelectItem>
                  {Object.entries(entidadeTipoLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fSeveridade} onValueChange={setFSeveridade}>
                <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as severidades</SelectItem>
                  {SEVERIDADES.map((s) => (
                    <SelectItem key={s} value={s}>{prazoSeveridadeConfig[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {temFiltro && (
              <Button variant="ghost" size="sm" className="text-slate-500 w-fit"
                onClick={() => { setBusca(''); setFEntidade(TODOS); setFSeveridade(TODOS); setHorizonte('90'); }}>
                <X className="h-4 w-4 mr-1" /> Restaurar filtros padrão
              </Button>
            )}

            <p className="text-xs text-slate-400">
              Prazos já vencidos aparecem sempre, mesmo fora do horizonte escolhido.
            </p>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <CalendarCheck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">
                  {prazos.length === 0 ? 'Nenhum prazo monitorado' : 'Nada dentro dos filtros'}
                </p>
                <p className="text-sm">
                  {prazos.length === 0
                    ? 'Prazos aparecem aqui conforme você cadastra créditos, habilitações, PER/DCOMPs e processos.'
                    : 'Amplie o horizonte ou limpe os filtros.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {filtrados.map((p) => {
                    const sev = getPrazoSeveridade(p.dias_restantes);
                    const cfg = prazoSeveridadeConfig[sev];
                    return (
                      <motion.div
                        key={`${p.entidade_tipo}-${p.entidade_id}-${p.tipo_prazo}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                      >
                        <div className={`h-10 w-1 rounded-full flex-shrink-0 ${cfg.dot}`} />

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-800 text-sm">{p.tipo_prazo}</span>
                            <Badge variant="outline" className="border-slate-300 text-slate-600 text-xs">
                              {entidadeTipoLabel[p.entidade_tipo] || p.entidade_tipo}
                            </Badge>
                            {p.situacao && (
                              <Badge variant="outline" className={`text-xs ${getSituacaoColor(p.situacao)}`}>
                                {p.situacao}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mt-0.5 truncate">
                            {p.referencia && <span className="font-mono text-slate-500">{p.referencia}</span>}
                            {p.referencia && p.descricao && ' · '}
                            {p.descricao}
                          </p>
                          {p.responsavel_nome && (
                            <p className="text-xs text-slate-400 mt-0.5">Responsável: {p.responsavel_nome}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-0.5 flex-shrink-0">
                          <p className="text-sm font-semibold text-slate-800 tabular-nums">
                            {formatData(p.data_prazo)}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>
                            {rotuloDias(p.dias_restantes)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default PrazosView;
