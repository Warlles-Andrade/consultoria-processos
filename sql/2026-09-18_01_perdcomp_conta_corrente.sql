-- =====================================================================
-- PER/DCOMP — controle por crédito, com conta-corrente e composição
--
-- Segue a lógica do protótipo "Controle PER/DCOMP" (v2) validado contra
-- dados reais do e-CAC:
--
--   crédito na RFB (ID de 24 dígitos)
--     ├── composição ........ documentos que formam o valor do crédito
--     ├── versões do PER .... original + retificadoras (uma vigente)
--     └── DCOMPs ............ consomem o crédito ao longo do tempo
--           └── débitos ..... tributos quitados em cada DCOMP
--   eventos ................ a FASE na Receita é o último evento — nunca digitada
--   selic_mensal ........... alimenta a atualização do crédito
--
-- Substitui o modelo anterior (perdcomps / perdcomp_debitos), em que cada
-- documento era solto e não havia saldo corrente do crédito. A remoção das
-- tabelas antigas fica em migration separada, depois da troca da interface.
--
-- Regras de negócio NÃO moram aqui: estão em src/lib/perdcompRegras.js,
-- transpostas do protótipo. O banco guarda fatos; o saldo básico tem view
-- para permitir consulta e relatório direto em SQL.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogos (espelhados em src/data/fiscalDomain.js — mudou um, mude o outro)
-- ---------------------------------------------------------------------
-- Tipos de crédito: os roteiros oficiais do PER/DCOMP Web.
-- Situação do documento (DCOMP): ativa | retificadora | retificada | cancelada
--   — só 'ativa' e 'retificadora' consomem crédito.
-- Eventos: PER e DCOMP têm vocabulários próprios (ver CHECK em perdcomp_eventos).

-- ---------------------------------------------------------------------
-- 1) perdcomp_creditos — o crédito como a Receita o identifica
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_creditos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id             uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  contribuinte_id        uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,
  credito_id             uuid REFERENCES public.creditos(id) ON DELETE SET NULL,

  id_credito_rfb         text NOT NULL,
  competencia            date NOT NULL,          -- sempre dia 1 do mês
  tipo_credito           text NOT NULL CHECK (tipo_credito IN (
                           'Pagamento Indevido ou a Maior',
                           'Contribuição Previdenciária Indevida ou a Maior',
                           'Retenção - Lei nº 9.711/98',
                           'Salário-Família e Salário-Maternidade',
                           'Saldo Negativo de IRPJ',
                           'Saldo Negativo de CSLL',
                           'Ressarcimento de IPI',
                           'Ressarcimento de PIS/Pasep Não Cumulativo',
                           'Ressarcimento de Cofins Não Cumulativa',
                           'Crédito Oriundo de Ação Judicial',
                           'Outro')),
  tipo_credito_codigo    integer,                -- código da RFB, quando conhecido (ex.: 15)
  valor_credito          numeric(18,2) NOT NULL CHECK (valor_credito >= 0),
  data_transmissao       timestamptz,
  numero_per_original    text,
  forma_recebimento      jsonb,                  -- {tipo: PIX|CONTA_CORRENTE, banco, codigoBanco, agencia, conta, chave}
  termo_inicial_correcao date,

  origem                 text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'ECAC', 'JSON', 'IA')),
  observacoes            text,

  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name        text,
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomp_creditos_id_rfb_unico UNIQUE (id_credito_rfb),
  CONSTRAINT perdcomp_creditos_competencia_dia1 CHECK (extract(day FROM competencia) = 1)
);

COMMENT ON TABLE  public.perdcomp_creditos IS
  'Crédito registrado na RFB via PER/DCOMP. Um levantamento (creditos) pode originar vários — ex.: um por competência.';
COMMENT ON COLUMN public.perdcomp_creditos.id_credito_rfb IS
  'Identificador do crédito no PER/DCOMP Web (24 dígitos). Chave natural para importação.';
COMMENT ON COLUMN public.perdcomp_creditos.credito_id IS
  'Levantamento de origem, quando houver. Opcional: créditos importados do e-CAC podem chegar antes do levantamento.';
COMMENT ON COLUMN public.perdcomp_creditos.competencia IS
  'Competência do crédito, sempre no dia 1. Base do índice Selic (começa no 2º mês seguinte).';

CREATE INDEX IF NOT EXISTS idx_pdc_creditos_projeto      ON public.perdcomp_creditos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_pdc_creditos_contribuinte ON public.perdcomp_creditos(contribuinte_id);
CREATE INDEX IF NOT EXISTS idx_pdc_creditos_credito      ON public.perdcomp_creditos(credito_id);
CREATE INDEX IF NOT EXISTS idx_pdc_creditos_competencia  ON public.perdcomp_creditos(competencia);

-- ---------------------------------------------------------------------
-- 2) perdcomp_composicao — o que forma o valor do crédito
--    Genérica de propósito: serve a retenção (notas fiscais), pagamento
--    indevido (DARF/GPS), saldo negativo (estimativas, retenções) etc.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_composicao (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perdcomp_credito_id  uuid NOT NULL REFERENCES public.perdcomp_creditos(id) ON DELETE CASCADE,
  projeto_id           uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  tipo_item            text NOT NULL CHECK (tipo_item IN (
                         'Nota fiscal com retenção', 'DARF', 'GPS', 'DCTFWeb',
                         'Estimativa mensal', 'Retenção na fonte', 'Nota fiscal de entrada',
                         'Decisão judicial', 'Outro')),
  documento            text,                    -- nº da NF, nº do DARF/GPS etc.
  cnpj_relacionado     text CHECK (cnpj_relacionado IS NULL OR cnpj_relacionado ~ '^[0-9]{14}$'),
  nome_relacionado     text,                    -- tomador, fonte pagadora, fornecedor...
  data_documento       date,
  periodo_apuracao     date,
  codigo_receita       text,
  valor                numeric(18,2) NOT NULL CHECK (valor >= 0),
  observacoes          text,

  origem               text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'ECAC', 'JSON', 'IA')),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name      text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.perdcomp_composicao IS
  'Itens que compõem o valor do crédito. A soma deve bater com perdcomp_creditos.valor_credito (a interface alerta a diferença).';

CREATE INDEX IF NOT EXISTS idx_pdc_composicao_credito ON public.perdcomp_composicao(perdcomp_credito_id);
CREATE INDEX IF NOT EXISTS idx_pdc_composicao_projeto ON public.perdcomp_composicao(projeto_id);

-- ---------------------------------------------------------------------
-- 3) perdcomp_per_versoes — o pedido e suas retificadoras
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_per_versoes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perdcomp_credito_id  uuid NOT NULL REFERENCES public.perdcomp_creditos(id) ON DELETE CASCADE,
  projeto_id           uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  numero               text NOT NULL,           -- nº do PER/DCOMP desta versão
  numero_anterior      text,                    -- versão que esta retifica
  data_transmissao     timestamptz,
  vigente              boolean NOT NULL DEFAULT false,
  valor_pedido         numeric(18,2),
  numero_recibo        text,
  forma_recebimento    jsonb,

  origem               text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'ECAC', 'JSON', 'IA')),
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomp_per_versoes_numero_unico UNIQUE (numero)
);

CREATE INDEX IF NOT EXISTS idx_pdc_per_credito ON public.perdcomp_per_versoes(perdcomp_credito_id);
CREATE INDEX IF NOT EXISTS idx_pdc_per_projeto ON public.perdcomp_per_versoes(projeto_id);

-- ---------------------------------------------------------------------
-- 4) perdcomp_dcomps — cada declaração que usa o crédito
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_dcomps (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perdcomp_credito_id       uuid NOT NULL REFERENCES public.perdcomp_creditos(id) ON DELETE CASCADE,
  projeto_id                uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  numero                    text NOT NULL,
  data_transmissao          timestamptz NOT NULL,
  situacao_documento        text NOT NULL DEFAULT 'ativa' CHECK (situacao_documento IN (
                              'ativa', 'retificadora', 'retificada', 'cancelada')),
  numero_referencia         text,               -- documento que esta retifica/substitui

  credito_informado_entrega numeric(18,2),      -- saldo que a DCOMP declarou ter na entrega
  credito_utilizado         numeric(18,2) NOT NULL CHECK (credito_utilizado >= 0),
  saldo_informado           numeric(18,2),
  selic_acumulada           numeric(9,4),       -- em pontos percentuais
  credito_atualizado        numeric(18,2),
  total_debitos             numeric(18,2),

  origem                    text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'ECAC', 'JSON', 'IA')),
  observacoes               text,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name           text,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomp_dcomps_numero_unico UNIQUE (numero)
);

COMMENT ON COLUMN public.perdcomp_dcomps.situacao_documento IS
  'Estado do documento em si. Só ativa e retificadora consomem crédito. A FASE na Receita (homologada etc.) vem de perdcomp_eventos.';

CREATE INDEX IF NOT EXISTS idx_pdc_dcomps_credito ON public.perdcomp_dcomps(perdcomp_credito_id);
CREATE INDEX IF NOT EXISTS idx_pdc_dcomps_projeto ON public.perdcomp_dcomps(projeto_id);
CREATE INDEX IF NOT EXISTS idx_pdc_dcomps_data    ON public.perdcomp_dcomps(data_transmissao);

-- ---------------------------------------------------------------------
-- 5) perdcomp_dcomp_debitos — tributos quitados em cada DCOMP
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_dcomp_debitos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcomp_id           uuid NOT NULL REFERENCES public.perdcomp_dcomps(id) ON DELETE CASCADE,
  projeto_id         uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  codigo_receita     text,
  periodo_apuracao   date,
  vencimento         date,
  principal          numeric(18,2) NOT NULL DEFAULT 0,
  multa              numeric(18,2),
  juros              numeric(18,2),
  total              numeric(18,2) NOT NULL,   -- como declarado; não recalculado

  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.perdcomp_dcomp_debitos.total IS
  'Total como consta na DCOMP. Não é coluna gerada: o dado oficial prevalece sobre a soma.';

CREATE INDEX IF NOT EXISTS idx_pdc_debitos_dcomp   ON public.perdcomp_dcomp_debitos(dcomp_id);
CREATE INDEX IF NOT EXISTS idx_pdc_debitos_projeto ON public.perdcomp_dcomp_debitos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_pdc_debitos_chave   ON public.perdcomp_dcomp_debitos(codigo_receita, periodo_apuracao);

-- ---------------------------------------------------------------------
-- 6) perdcomp_eventos — a história de cada documento
--    A fase na Receita é o ÚLTIMO evento. Guardar o histórico é o que
--    permite provar "desde quando está em análise".
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id   uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  entidade     text NOT NULL CHECK (entidade IN ('PER', 'DCOMP')),
  documento    text NOT NULL,                  -- número do PER ou da DCOMP
  data         date NOT NULL,
  tipo         text NOT NULL,
  processo     text,                           -- nº do processo / despacho
  valor        numeric(18,2),                  -- deferido, pago ou glosado
  conta        text,                           -- conta de crédito da restituição
  observacao   text,

  origem       text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'ECAC', 'JSON', 'IA')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomp_eventos_tipo_check CHECK (
    (entidade = 'PER' AND tipo IN (
      'TRANSMISSAO', 'CIENCIA_ANALISE', 'DESPACHO_DEFERIMENTO', 'DESPACHO_PARCIAL',
      'DESPACHO_INDEFERIMENTO', 'MANIFESTACAO', 'PAGAMENTO', 'CANCELAMENTO'))
    OR
    (entidade = 'DCOMP' AND tipo IN (
      'TRANSMISSAO', 'CIENCIA_ANALISE', 'HOMOLOGACAO', 'HOMOLOGACAO_PARCIAL',
      'NAO_HOMOLOGACAO', 'MANIFESTACAO', 'HOMOLOGACAO_TACITA', 'CANCELAMENTO'))
  ),
  CONSTRAINT perdcomp_eventos_pagamento_valor CHECK (tipo <> 'PAGAMENTO' OR valor > 0)
);

CREATE INDEX IF NOT EXISTS idx_pdc_eventos_documento ON public.perdcomp_eventos(documento, data);
CREATE INDEX IF NOT EXISTS idx_pdc_eventos_projeto   ON public.perdcomp_eventos(projeto_id);

-- ---------------------------------------------------------------------
-- 7) selic_mensal — tabela global de taxas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.selic_mensal (
  competencia  date PRIMARY KEY CHECK (extract(day FROM competencia) = 1),
  taxa         numeric(8,4) NOT NULL,          -- em pontos percentuais no mês
  fonte        text NOT NULL DEFAULT 'RFB',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.selic_mensal IS
  'Selic mensal para atualização de créditos. Faltando um mês no intervalo, o cálculo não é feito (nunca estimado).';

-- ---------------------------------------------------------------------
-- 8) RLS — mesmo eixo de todo o módulo fiscal: projeto_id
-- ---------------------------------------------------------------------

ALTER TABLE public.perdcomp_creditos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdcomp_composicao    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdcomp_per_versoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdcomp_dcomps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdcomp_dcomp_debitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdcomp_eventos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selic_mensal           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'perdcomp_creditos', 'perdcomp_composicao', 'perdcomp_per_versoes',
    'perdcomp_dcomps', 'perdcomp_dcomp_debitos', 'perdcomp_eventos'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                    USING (public.fiscal_can_access_projeto(projeto_id))', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.fiscal_can_access_projeto(projeto_id))', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                    USING (public.fiscal_can_access_projeto(projeto_id))
                    WITH CHECK (public.fiscal_can_access_projeto(projeto_id))', t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                    USING (public.fiscal_is_admin() OR public.fiscal_can_access_projeto(projeto_id))', t || '_delete', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS selic_mensal_select ON public.selic_mensal;
CREATE POLICY selic_mensal_select ON public.selic_mensal
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS selic_mensal_write ON public.selic_mensal;
CREATE POLICY selic_mensal_write ON public.selic_mensal
  FOR ALL TO authenticated
  USING (public.fiscal_is_admin()) WITH CHECK (public.fiscal_is_admin());

-- ---------------------------------------------------------------------
-- 9) Triggers de updated_at
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_pdc_creditos_touch ON public.perdcomp_creditos;
CREATE TRIGGER trg_pdc_creditos_touch
BEFORE UPDATE ON public.perdcomp_creditos
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

DROP TRIGGER IF EXISTS trg_selic_touch ON public.selic_mensal;
CREATE TRIGGER trg_selic_touch
BEFORE UPDATE ON public.selic_mensal
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

-- ---------------------------------------------------------------------
-- 10) v_perdcomp_saldos — saldo básico por crédito (sem Selic)
--     A correção pela Selic e o extrato ficam em perdcompRegras.js,
--     que é a fonte da regra; a view existe para consulta e relatório.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_perdcomp_saldos;
CREATE VIEW public.v_perdcomp_saldos
WITH (security_invoker = on) AS
SELECT
  c.id                    AS perdcomp_credito_id,
  c.projeto_id,
  c.contribuinte_id,
  c.id_credito_rfb,
  c.competencia,
  c.tipo_credito,
  c.valor_credito,
  COALESCE(u.utilizado, 0)                      AS utilizado,
  c.valor_credito - COALESCE(u.utilizado, 0)    AS saldo,
  COALESCE(u.dcomps_que_consomem, 0)            AS dcomps_que_consomem,
  COALESCE(comp.total_composicao, 0)            AS total_composicao
FROM public.perdcomp_creditos c
LEFT JOIN (
  SELECT perdcomp_credito_id,
         SUM(credito_utilizado) AS utilizado,
         COUNT(*)               AS dcomps_que_consomem
    FROM public.perdcomp_dcomps
   WHERE situacao_documento IN ('ativa', 'retificadora')
   GROUP BY perdcomp_credito_id
) u ON u.perdcomp_credito_id = c.id
LEFT JOIN (
  SELECT perdcomp_credito_id, SUM(valor) AS total_composicao
    FROM public.perdcomp_composicao
   GROUP BY perdcomp_credito_id
) comp ON comp.perdcomp_credito_id = c.id;

COMMENT ON VIEW public.v_perdcomp_saldos IS
  'Saldo de cada crédito RFB: valor − Σ crédito utilizado das DCOMPs ativas/retificadoras. Sem Selic.';
