-- =====================================================================
-- CEP Consultoria — Módulo Fiscal/Jurídico — Parte 2
-- Habilitação de crédito acumulado (e-CredAc: Portarias CAT 207/2009 e
-- CAT 83/2009) e PER/DCOMP federal.
--
-- Pré-requisito: 2026-08-28_01_fiscal_base.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) habilitacoes — pedidos junto à SEFAZ (e-CredAc)
--
--    CAT 207/2009 — apropriação de crédito acumulado de ICMS
--    CAT 83/2009  — ressarcimento do ICMS retido por substituição
--                   tributária (ICMS-ST)
--
--    A tabela é genérica o bastante para outros regimes estaduais:
--    `regime` é texto com CHECK ampliável.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.habilitacoes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id             uuid NOT NULL REFERENCES public.creditos(id) ON DELETE CASCADE,
  projeto_id             uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  contribuinte_id        uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,

  regime                 text NOT NULL CHECK (regime IN (
                           'CAT 207/2009',   -- crédito acumulado ICMS (e-CredAc)
                           'CAT 83/2009',    -- ressarcimento ICMS-ST
                           'CAT 26/2010',
                           'Outro regime estadual')),
  modalidade             text CHECK (modalidade IN (
                           'Custeio', 'Simplificado', 'Automático',           -- CAT 207
                           'Ressarcimento', 'Compensação escritural',          -- CAT 83
                           'Não se aplica')),
  uf                     char(2) NOT NULL DEFAULT 'SP',

  numero_protocolo       text,          -- nº do pedido no e-CredAc
  numero_processo_sefaz  text,          -- nº do processo administrativo na SEFAZ
  posto_fiscal           text,

  periodo_referencia_inicio date,
  periodo_referencia_fim    date,

  valor_pleiteado        numeric(18,2) NOT NULL DEFAULT 0,
  valor_autorizado       numeric(18,2),
  valor_glosado          numeric(18,2),

  situacao               text NOT NULL DEFAULT 'Em preparação' CHECK (situacao IN (
                           'Em preparação', 'Protocolado', 'Em análise', 'Em exigência',
                           'Deferido', 'Deferido parcialmente', 'Indeferido',
                           'Liquidado', 'Arquivado', 'Cancelado')),

  data_protocolo         date,
  data_ultima_exigencia  date,
  prazo_resposta         date,          -- prazo fatal da exigência/diligência em aberto
  data_despacho          date,
  data_liquidacao        date,

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome       text,
  observacoes            text,

  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name        text,
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT habilitacoes_periodo_check CHECK (
    periodo_referencia_inicio IS NULL OR periodo_referencia_fim IS NULL
    OR periodo_referencia_fim >= periodo_referencia_inicio),
  CONSTRAINT habilitacoes_valores_check CHECK (
    valor_pleiteado >= 0
    AND (valor_autorizado IS NULL OR valor_autorizado >= 0)
    AND (valor_glosado   IS NULL OR valor_glosado   >= 0)),
  -- Protocolado em diante exige número e data de protocolo.
  CONSTRAINT habilitacoes_protocolo_check CHECK (
    situacao IN ('Em preparação', 'Cancelado')
    OR (numero_protocolo IS NOT NULL AND data_protocolo IS NOT NULL))
);

COMMENT ON TABLE  public.habilitacoes IS 'Pedidos de habilitação/apropriação de crédito acumulado de ICMS e ressarcimento de ICMS-ST.';
COMMENT ON COLUMN public.habilitacoes.regime IS 'Portaria CAT que rege o pedido: 207/2009 (crédito acumulado) ou 83/2009 (ressarcimento ICMS-ST).';
COMMENT ON COLUMN public.habilitacoes.prazo_resposta IS 'Prazo fatal para atender exigência/diligência em aberto. Alimenta os alertas.';
COMMENT ON COLUMN public.habilitacoes.valor_glosado IS 'Parcela do pleito recusada no despacho decisório.';

CREATE INDEX IF NOT EXISTS idx_habilitacoes_credito_id   ON public.habilitacoes(credito_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_projeto_id   ON public.habilitacoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_situacao     ON public.habilitacoes(situacao);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_regime       ON public.habilitacoes(regime);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_prazo        ON public.habilitacoes(prazo_resposta)
  WHERE situacao IN ('Protocolado', 'Em análise', 'Em exigência');

DROP TRIGGER IF EXISTS trg_habilitacoes_touch ON public.habilitacoes;
CREATE TRIGGER trg_habilitacoes_touch
BEFORE UPDATE ON public.habilitacoes
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.habilitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS habilitacoes_select ON public.habilitacoes;
CREATE POLICY habilitacoes_select ON public.habilitacoes
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS habilitacoes_insert ON public.habilitacoes;
CREATE POLICY habilitacoes_insert ON public.habilitacoes
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS habilitacoes_update ON public.habilitacoes;
CREATE POLICY habilitacoes_update ON public.habilitacoes
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS habilitacoes_delete ON public.habilitacoes;
CREATE POLICY habilitacoes_delete ON public.habilitacoes
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 2) perdcomps — PER/DCOMP federal
--    data_limite_homologacao é gerada: transmissão + 5 anos
--    (homologação tácita, art. 74 §5º da Lei 9.430/96).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomps (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id                uuid NOT NULL REFERENCES public.creditos(id) ON DELETE CASCADE,
  projeto_id                uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  contribuinte_id           uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,

  numero                    text NOT NULL,     -- nº do PER/DCOMP
  tipo                      text NOT NULL CHECK (tipo IN (
                              'Restituição', 'Ressarcimento', 'Reembolso', 'Compensação')),
  tipo_documento            text NOT NULL DEFAULT 'PER/DCOMP' CHECK (tipo_documento IN (
                              'PER', 'DCOMP', 'PER/DCOMP')),

  data_transmissao          date NOT NULL,
  data_limite_homologacao   date GENERATED ALWAYS AS (
                              (data_transmissao + INTERVAL '5 years')::date) STORED,

  periodo_apuracao_inicio   date,
  periodo_apuracao_fim      date,

  valor_credito_original    numeric(18,2) NOT NULL DEFAULT 0,
  valor_credito_atualizado  numeric(18,2),
  valor_compensado          numeric(18,2) NOT NULL DEFAULT 0,
  valor_deferido            numeric(18,2),
  valor_glosado             numeric(18,2),

  situacao                  text NOT NULL DEFAULT 'Transmitido' CHECK (situacao IN (
                              'Em preparação', 'Transmitido', 'Em análise',
                              'Deferido', 'Deferido parcialmente', 'Indeferido',
                              'Homologado', 'Homologado tacitamente', 'Não homologado',
                              'Retificado', 'Cancelado')),

  retificador_de_id         uuid REFERENCES public.perdcomps(id) ON DELETE SET NULL,
  numero_processo_administrativo text,   -- PAF gerado em caso de não homologação
  data_ciencia_despacho     date,
  prazo_manifestacao        date,        -- 30 dias da ciência para manifestação de inconformidade

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome          text,
  observacoes               text,

  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name           text,
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name           text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomps_numero_unico UNIQUE (numero),
  CONSTRAINT perdcomps_valores_check CHECK (
    valor_credito_original >= 0 AND valor_compensado >= 0),
  CONSTRAINT perdcomps_periodo_check CHECK (
    periodo_apuracao_inicio IS NULL OR periodo_apuracao_fim IS NULL
    OR periodo_apuracao_fim >= periodo_apuracao_inicio)
);

COMMENT ON TABLE  public.perdcomps IS 'Pedidos de restituição/ressarcimento/reembolso e declarações de compensação federais.';
COMMENT ON COLUMN public.perdcomps.data_limite_homologacao IS
  'Coluna gerada: transmissão + 5 anos. Marco da homologação tácita (Lei 9.430/96, art. 74, §5º).';
COMMENT ON COLUMN public.perdcomps.prazo_manifestacao IS
  'Prazo para manifestação de inconformidade contra despacho de não homologação (30 dias da ciência).';
COMMENT ON COLUMN public.perdcomps.retificador_de_id IS
  'Preenchido quando este PER/DCOMP retifica outro. O retificado deve ir para a situação "Retificado".';

CREATE INDEX IF NOT EXISTS idx_perdcomps_credito_id  ON public.perdcomps(credito_id);
CREATE INDEX IF NOT EXISTS idx_perdcomps_projeto_id  ON public.perdcomps(projeto_id);
CREATE INDEX IF NOT EXISTS idx_perdcomps_situacao    ON public.perdcomps(situacao);
CREATE INDEX IF NOT EXISTS idx_perdcomps_homologacao ON public.perdcomps(data_limite_homologacao);
CREATE INDEX IF NOT EXISTS idx_perdcomps_transmissao ON public.perdcomps(data_transmissao);

DROP TRIGGER IF EXISTS trg_perdcomps_touch ON public.perdcomps;
CREATE TRIGGER trg_perdcomps_touch
BEFORE UPDATE ON public.perdcomps
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.perdcomps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perdcomps_select ON public.perdcomps;
CREATE POLICY perdcomps_select ON public.perdcomps
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS perdcomps_insert ON public.perdcomps;
CREATE POLICY perdcomps_insert ON public.perdcomps
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS perdcomps_update ON public.perdcomps;
CREATE POLICY perdcomps_update ON public.perdcomps
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS perdcomps_delete ON public.perdcomps;
CREATE POLICY perdcomps_delete ON public.perdcomps
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 3) perdcomp_debitos — débitos compensados em cada DCOMP
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.perdcomp_debitos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perdcomp_id       uuid NOT NULL REFERENCES public.perdcomps(id) ON DELETE CASCADE,

  codigo_receita    text,            -- código DARF
  denominacao       text,
  periodo_apuracao  date,
  vencimento        date,

  valor_principal   numeric(18,2) NOT NULL DEFAULT 0,
  valor_multa       numeric(18,2) NOT NULL DEFAULT 0,
  valor_juros       numeric(18,2) NOT NULL DEFAULT 0,
  valor_total       numeric(18,2) GENERATED ALWAYS AS (
                      valor_principal + valor_multa + valor_juros) STORED,

  situacao          text NOT NULL DEFAULT 'Compensado' CHECK (situacao IN (
                      'Compensado', 'Não homologado', 'Parcialmente homologado', 'Cancelado')),
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT perdcomp_debitos_valores_check CHECK (
    valor_principal >= 0 AND valor_multa >= 0 AND valor_juros >= 0)
);

COMMENT ON TABLE public.perdcomp_debitos IS 'Débitos declarados para compensação em uma DCOMP. O somatório deve bater com perdcomps.valor_compensado.';

CREATE INDEX IF NOT EXISTS idx_perdcomp_debitos_perdcomp_id ON public.perdcomp_debitos(perdcomp_id);

ALTER TABLE public.perdcomp_debitos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perdcomp_debitos_select ON public.perdcomp_debitos;
CREATE POLICY perdcomp_debitos_select ON public.perdcomp_debitos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.perdcomps p
     WHERE p.id = perdcomp_id AND public.fiscal_can_access_projeto(p.projeto_id)));

DROP POLICY IF EXISTS perdcomp_debitos_write ON public.perdcomp_debitos;
CREATE POLICY perdcomp_debitos_write ON public.perdcomp_debitos
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.perdcomps p
     WHERE p.id = perdcomp_id AND public.fiscal_can_access_projeto(p.projeto_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.perdcomps p
     WHERE p.id = perdcomp_id AND public.fiscal_can_access_projeto(p.projeto_id)));
