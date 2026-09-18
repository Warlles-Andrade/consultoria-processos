import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/kpi-card';
import PrimeirosPassos from '@/components/PrimeirosPassos';
import { useToast } from '@/components/ui/use-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  PieChart as ChartIcon, Loader2, RefreshCw, Banknote, CheckCircle2, Wallet,
  ArrowLeftRight, Gavel, AlertOctagon, AlertTriangle, Clock, CalendarCheck,
} from 'lucide-react';
import { getPublicErrorMessage } from '@/lib/errorMessages';
import {
  listarCreditosComSaldo, listarSaldosPerdcomp, listarPrazosCriticos,
  listarProcessosAdministrativos, listarProcessosJudiciais,
} from '@/lib/fiscalApi';
import {
  situacaoCreditoOptions, getPrazoSeveridade,
  formatMoeda, formatMoedaCompacta,
} from '@/data/fiscalDomain';

/* ------------------------------------------------------------------ *
 * Tokens de cor dos gráficos.
 *
 * Categóricas: slots 1–3 da paleta de referência, validadas para as
 * superfícies reais deste app (#fdfdfd claro / #232326 escuro) em
 * --pairs all nos dois modos. O aqua fica abaixo de 3:1 no claro, então
 * a barra empilhada de esfera SEMPRE traz legenda com valor visível.
 *
 * Séries únicas usam um só tom: cor que não carrega informação é ruído.
 * ------------------------------------------------------------------ */
const TOKENS = {
  light: {
    surface: '#fdfdfd',
    grid: '#e1e0d9',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    serie: '#2a78d6',
    esfera: { Federal: '#2a78d6', Estadual: '#eb6834', Municipal: '#1baf7a' },
  },
  dark: {
    surface: '#232326',
    grid: '#2c2c2a',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    muted: '#71717a',
    serie: '#3987e5',
    esfera: { Federal: '#3987e5', Estadual: '#d95926', Municipal: '#199e70' },
  },
};

/** Paleta de status — fixa, nunca tematizada. Sempre com ícone + rótulo. */
const SEVERIDADE = {
  vencido: { cor: '#d03b3b', label: 'Vencidos', icone: AlertOctagon, detalhe: 'Prazo já expirado' },
  critico: { cor: '#ec835a', label: 'Críticos', icone: AlertTriangle, detalhe: 'Vencem em até 30 dias' },
  atencao: { cor: '#fab219', label: 'Atenção', icone: Clock, detalhe: 'Entre 31 e 90 dias' },
  ok: { cor: '#0ca30c', label: 'No prazo', icone: CalendarCheck, detalhe: 'Mais de 90 dias' },
};

function useDarkMode() {
  const check = () => document.documentElement.classList.contains('dark');
  const [isDark, setIsDark] = useState(check);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(check()));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

/** Encurta rótulo de eixo para não ser cortado pelo Recharts. */
const encurtar = (texto, max) =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

/** Agrupa e soma, devolvendo os N maiores. */
const topPor = (itens, chave, valor, { n = 8, maxRotulo = 60 } = {}) => {
  const mapa = new Map();
  itens.forEach((i) => {
    const k = chave(i);
    if (!k) return;
    mapa.set(k, (mapa.get(k) || 0) + Number(valor(i) || 0));
  });
  return [...mapa.entries()]
    .filter(([, v]) => v > 0)
    .map(([nome, valorTotal]) => ({ name: encurtar(nome, maxRotulo), nomeCompleto: nome, valorTotal }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, n);
};

const TooltipMoeda = ({ active, payload, label, isDark, sufixo }) => {
  if (!active || !payload?.length) return null;
  const t = isDark ? TOKENS.dark : TOKENS.light;
  const linha = payload[0].payload;
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg text-sm max-w-xs"
      style={{ background: t.surface, borderColor: t.grid, color: t.textPrimary }}
    >
      <p className="font-medium">{linha.nomeCompleto || label}</p>
      <p style={{ color: t.textSecondary }}>{formatMoeda(linha.valorTotal)}</p>
      {sufixo && linha.quantidade != null && (
        <p style={{ color: t.muted }} className="text-xs">
          {linha.quantidade} {linha.quantidade === 1 ? sufixo.singular : sufixo.plural}
        </p>
      )}
    </div>
  );
};

/**
 * Rótulo no fim da barra, desenhado à mão.
 * O <LabelList> padrão quebra o texto em várias linhas quando a barra é
 * curta ("R$ 940 mil" vira "R$ 940" / "mil"), porque calcula a largura
 * disponível a partir do próprio retângulo. Um <text> simples não quebra.
 */
const RotuloValor = ({ x, y, width, height, value, corTexto }) => {
  if (value == null || x == null) return null;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dy="0.35em"
      textAnchor="start"
      fill={corTexto}
      fontSize={11}
    >
      {formatMoedaCompacta(value)}
    </text>
  );
};

/** Gráfico de barras horizontais de série única. */
export const BarrasValor = ({ dados, isDark, larguraRotulo = 130, sufixo, vazio }) => {
  const t = isDark ? TOKENS.dark : TOKENS.light;

  if (dados.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">{vazio}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, dados.length * 42 + 30)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={t.grid} strokeWidth={1} />
        <XAxis
          type="number"
          tickFormatter={formatMoedaCompacta}
          tick={{ fill: t.muted, fontSize: 11 }}
          axisLine={{ stroke: t.grid }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={larguraRotulo}
          tick={{ fill: t.textSecondary, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.35 }}
          content={<TooltipMoeda isDark={isDark} sufixo={sufixo} />}
        />
        <Bar dataKey="valorTotal" fill={t.serie} radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList dataKey="valorTotal" content={<RotuloValor corTexto={t.textSecondary} />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const FiscalDashboard = ({ onNavigate }) => {
  const { toast } = useToast();
  const isDark = useDarkMode();
  const t = isDark ? TOKENS.dark : TOKENS.light;

  const [creditos, setCreditos] = useState([]);
  const [perdcomps, setPerdcomps] = useState([]);
  const [prazos, setPrazos] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [judiciais, setJudiciais] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, pr, a, j] = await Promise.all([
        listarCreditosComSaldo(),
        listarSaldosPerdcomp(),
        listarPrazosCriticos(),
        listarProcessosAdministrativos(),
        listarProcessosJudiciais(),
      ]);
      setCreditos(c || []);
      setPerdcomps(p || []);
      setPrazos(pr || []);
      setAdmins(a || []);
      setJudiciais(j || []);
    } catch (error) {
      const msg = error?.code === '42P01'
        ? 'As tabelas fiscais ainda não existem no banco. Aplique as migrations em sql/ (ver sql/LEIA-ME.md).'
        : getPublicErrorMessage(error);
      toast({ title: 'Erro ao carregar o painel', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const totais = useMemo(() => {
    const levantado = creditos.reduce((s, c) => s + Number(c.valor_levantado || 0), 0);
    const homologado = creditos.reduce((s, c) => s + Number(c.valor_homologado || 0), 0);
    const saldo = creditos.reduce((s, c) => s + Number(c.saldo?.saldo_disponivel || 0), 0);
    const compensado = perdcomps.reduce((s, p) => s + Number(p.utilizado || 0), 0);
    const emDiscussao = admins
      .filter((p) => !['Encerrado', 'Arquivado', 'Prescrito'].includes(p.situacao))
      .reduce((s, p) => s + Number(p.valor_autuado || 0), 0);
    return { levantado, homologado, saldo, compensado, emDiscussao };
  }, [creditos, perdcomps, admins]);

  const severidades = useMemo(() => {
    const contagem = { vencido: 0, critico: 0, atencao: 0, ok: 0 };
    prazos.forEach((p) => {
      const s = getPrazoSeveridade(p.dias_restantes);
      if (contagem[s] != null) contagem[s] += 1;
    });
    return contagem;
  }, [prazos]);

  const porTributo = useMemo(
    () => topPor(creditos, (c) => c.tributo, (c) => c.valor_levantado, { maxRotulo: 14 }),
    [creditos]
  );

  const porSituacao = useMemo(() => {
    const mapa = new Map();
    creditos.forEach((c) => {
      const atual = mapa.get(c.situacao) || { valorTotal: 0, quantidade: 0 };
      atual.valorTotal += Number(c.valor_levantado || 0);
      atual.quantidade += 1;
      mapa.set(c.situacao, atual);
    });
    // Mantém a ordem do pipeline, não a ordem de grandeza.
    return situacaoCreditoOptions
      .filter((s) => mapa.has(s))
      .map((s) => ({ name: s, ...mapa.get(s) }));
  }, [creditos]);

  const porContribuinte = useMemo(
    () => topPor(
      creditos,
      (c) => c.contribuinte?.nome_fantasia || c.contribuinte?.razao_social,
      (c) => c.saldo?.saldo_disponivel,
      { maxRotulo: 22 }
    ),
    [creditos]
  );

  const porEsfera = useMemo(() => {
    const mapa = new Map();
    creditos.forEach((c) => {
      mapa.set(c.esfera, (mapa.get(c.esfera) || 0) + Number(c.valor_levantado || 0));
    });
    const linhas = ['Federal', 'Estadual', 'Municipal']
      .map((e) => ({ esfera: e, valor: mapa.get(e) || 0 }))
      .filter((l) => l.valor > 0);
    const total = linhas.reduce((s, l) => s + l.valor, 0);
    return { linhas, total };
  }, [creditos]);

  const judiciaisTransitados = judiciais.filter((p) => !!p.data_transito_julgado).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando painel...
      </div>
    );
  }

  const semDados = creditos.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 shadow-md">
            <ChartIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Painel Fiscal</h1>
            <p className="text-sm text-slate-500">Estoque de crédito, utilização e exposição</p>
          </div>
        </div>
        <Button variant="outline" onClick={carregar}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      {semDados ? (
        <PrimeirosPassos onNavigate={onNavigate} />
      ) : (
        <>
          {/* Números-chave */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard titulo="Levantado" valor={formatMoedaCompacta(totais.levantado)}
              detalhe={`${creditos.length} crédito(s)`} icone={Banknote} />
            <KpiCard titulo="Homologado" valor={formatMoedaCompacta(totais.homologado)}
              detalhe="Reconhecido pelo fisco" icone={CheckCircle2}
              cor="border-emerald-200 bg-emerald-50 text-emerald-800" delay={0.05} />
            <KpiCard titulo="Saldo disponível" valor={formatMoedaCompacta(totais.saldo)}
              detalhe="Apurado pela razão" icone={Wallet}
              cor="border-indigo-200 bg-indigo-50 text-indigo-800" delay={0.1} />
            <KpiCard titulo="Compensado" valor={formatMoedaCompacta(totais.compensado)}
              detalhe={`${perdcomps.reduce((s, p) => s + Number(p.dcomps_que_consomem || 0), 0)} DCOMP(s) · ${perdcomps.length} crédito(s)`} icone={ArrowLeftRight}
              cor="border-blue-200 bg-blue-50 text-blue-800" delay={0.15} />
            <KpiCard titulo="Em discussão" valor={formatMoedaCompacta(totais.emDiscussao)}
              detalhe={`${admins.length} processo(s) · ${judiciaisTransitados} transitado(s)`}
              icone={Gavel}
              cor="border-amber-200 bg-amber-50 text-amber-800" delay={0.2} />
          </div>

          {/* Prazos por severidade — ícone + rótulo, nunca só cor */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card border-white/60 rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold text-slate-700">
                  Prazos monitorados ({prazos.length})
                </CardTitle>
                {onNavigate && (
                  <Button variant="ghost" size="sm" className="text-slate-500"
                    onClick={() => onNavigate('prazos')}>
                    Ver todos
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(SEVERIDADE).map(([chave, cfg]) => {
                    const Icone = cfg.icone;
                    return (
                      <div key={chave}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/60 p-3">
                        <Icone className="h-5 w-5 flex-shrink-0" style={{ color: cfg.cor }} />
                        <div className="min-w-0">
                          <p className="text-2xl font-bold text-slate-800 leading-none">
                            {severidades[chave]}
                          </p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5">{cfg.label}</p>
                          <p className="text-xs text-slate-500">{cfg.detalhe}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <Card className="glass-card border-white/60 rounded-2xl h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Valor levantado por tributo
                  </CardTitle>
                  <p className="text-xs text-slate-500">Os 8 maiores</p>
                </CardHeader>
                <CardContent>
                  <BarrasValor dados={porTributo} isDark={isDark} larguraRotulo={92}
                    vazio="Sem valores lançados." />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="glass-card border-white/60 rounded-2xl h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Créditos por situação
                  </CardTitle>
                  <p className="text-xs text-slate-500">Na ordem do fluxo de trabalho</p>
                </CardHeader>
                <CardContent>
                  <BarrasValor dados={porSituacao} isDark={isDark} larguraRotulo={124}
                    sufixo={{ singular: 'crédito', plural: 'créditos' }}
                    vazio="Sem valores lançados." />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="glass-card border-white/60 rounded-2xl h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Saldo disponível por contribuinte
                  </CardTitle>
                  <p className="text-xs text-slate-500">Os 8 maiores</p>
                </CardHeader>
                <CardContent>
                  <BarrasValor dados={porContribuinte} isDark={isDark} larguraRotulo={150}
                    vazio="Nenhum saldo lançado na razão dos créditos." />
                </CardContent>
              </Card>
            </motion.div>

            {/* Barra empilhada em HTML: gaps de 2px exatos e valores sempre visíveis */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="glass-card border-white/60 rounded-2xl h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-700">
                    Composição por esfera
                  </CardTitle>
                  <p className="text-xs text-slate-500">Valor levantado</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {porEsfera.total === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-12">Sem valores lançados.</p>
                  ) : (
                    <>
                      <div className="flex gap-[2px] h-10 w-full">
                        {porEsfera.linhas.map((l, i) => (
                          <div
                            key={l.esfera}
                            title={`${l.esfera}: ${formatMoeda(l.valor)}`}
                            style={{
                              width: `${(l.valor / porEsfera.total) * 100}%`,
                              backgroundColor: t.esfera[l.esfera],
                              borderRadius: i === 0
                                ? '4px 0 0 4px'
                                : i === porEsfera.linhas.length - 1 ? '0 4px 4px 0' : 0,
                            }}
                          />
                        ))}
                      </div>

                      {/* Legenda com valor — identidade nunca fica só na cor */}
                      <div className="space-y-2">
                        {porEsfera.linhas.map((l) => (
                          <div key={l.esfera} className="flex items-center gap-2 text-sm">
                            <span className="h-3 w-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: t.esfera[l.esfera] }} />
                            <span className="text-slate-700 flex-1">{l.esfera}</span>
                            <span className="text-slate-800 font-medium tabular-nums">
                              {formatMoeda(l.valor)}
                            </span>
                            <span className="text-slate-500 tabular-nums w-12 text-right">
                              {((l.valor / porEsfera.total) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};

export default FiscalDashboard;
