-- =====================================================================
-- CEP Consultoria — Módulo Fiscal/Jurídico — Parte 1: Base
-- Contribuintes, Créditos, Razão de Movimentos e Andamentos.
--
-- Convenções herdadas do projeto:
--   * RLS espelha a lógica de `processos`: usuário ativo E
--     (admin OU projeto_id ∈ user_projetos do usuário).
--   * Todo objeto é idempotente (IF NOT EXISTS / OR REPLACE).
--   * Valores monetários em numeric(18,2); nunca float.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Helpers de acesso (reutilizados por todas as tabelas fiscais)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fiscal_can_access_projeto(p_projeto uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE((SELECT ativo FROM public.user_profiles WHERE user_id = auth.uid()), false)
    AND (
      COALESCE((SELECT grupo FROM public.user_profiles WHERE user_id = auth.uid()), '') = 'adm'
      OR EXISTS (
        SELECT 1
          FROM public.user_projetos up
          JOIN public.user_profiles pr ON pr.id = up.user_profile_id
         WHERE pr.user_id = auth.uid()
           AND up.projeto_id = p_projeto
      )
    );
$$;

COMMENT ON FUNCTION public.fiscal_can_access_projeto(uuid) IS
  'True se o usuário autenticado está ativo e é admin ou tem acesso ao projeto informado.';

CREATE OR REPLACE FUNCTION public.fiscal_can_access_cliente(p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE((SELECT ativo FROM public.user_profiles WHERE user_id = auth.uid()), false)
    AND (
      COALESCE((SELECT grupo FROM public.user_profiles WHERE user_id = auth.uid()), '') = 'adm'
      OR EXISTS (
        SELECT 1
          FROM public.user_profiles up
          JOIN public.clientes c ON c.nome = up.grupo
         WHERE up.user_id = auth.uid() AND c.id = p_cliente
      )
      OR EXISTS (
        SELECT 1
          FROM public.user_projetos upj
          JOIN public.projetos pr ON pr.id = upj.projeto_id
          JOIN public.user_profiles prof ON prof.id = upj.user_profile_id
         WHERE prof.user_id = auth.uid() AND pr.cliente_id = p_cliente
      )
    );
$$;

COMMENT ON FUNCTION public.fiscal_can_access_cliente(uuid) IS
  'True se o usuário autenticado está ativo e é admin, pertence ao cliente ou acessa algum projeto dele.';

CREATE OR REPLACE FUNCTION public.fiscal_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT grupo FROM public.user_profiles WHERE user_id = auth.uid()), '') = 'adm';
$$;

CREATE OR REPLACE FUNCTION public.fiscal_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 1) contribuintes — identidade fiscal (CNPJ) sob um cliente
--    Um cliente (grupo econômico) pode ter N contribuintes.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contribuintes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  razao_social        text NOT NULL,
  nome_fantasia       text,
  cnpj                text NOT NULL,
  inscricao_estadual  text,
  inscricao_municipal text,
  uf                  char(2),
  municipio           text,
  regime_tributario   text CHECK (regime_tributario IN (
                        'Simples Nacional', 'Lucro Presumido', 'Lucro Real',
                        'Lucro Arbitrado', 'Imune/Isento', 'Não informado')),
  cnae_principal      text,
  posto_fiscal        text,          -- relevante para e-CredAc (SEFAZ-SP)
  ativo               boolean NOT NULL DEFAULT true,
  observacoes         text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contribuintes_cnpj_formato CHECK (cnpj ~ '^[0-9]{14}$'),
  CONSTRAINT contribuintes_cnpj_unico UNIQUE (cnpj)
);

COMMENT ON TABLE  public.contribuintes IS 'Pessoas jurídicas (CNPJ) atendidas. Um cliente pode ter vários contribuintes.';
COMMENT ON COLUMN public.contribuintes.cnpj IS 'Somente dígitos, 14 posições. Formatação é responsabilidade do frontend.';
COMMENT ON COLUMN public.contribuintes.posto_fiscal IS 'Posto fiscal de vinculação na SEFAZ — usado nos pedidos e-CredAc.';

CREATE INDEX IF NOT EXISTS idx_contribuintes_cliente_id ON public.contribuintes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contribuintes_uf         ON public.contribuintes(uf);

DROP TRIGGER IF EXISTS trg_contribuintes_touch ON public.contribuintes;
CREATE TRIGGER trg_contribuintes_touch
BEFORE UPDATE ON public.contribuintes
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.contribuintes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contribuintes_select ON public.contribuintes;
CREATE POLICY contribuintes_select ON public.contribuintes
  FOR SELECT USING (public.fiscal_can_access_cliente(cliente_id));

DROP POLICY IF EXISTS contribuintes_insert ON public.contribuintes;
CREATE POLICY contribuintes_insert ON public.contribuintes
  FOR INSERT WITH CHECK (public.fiscal_can_access_cliente(cliente_id));

DROP POLICY IF EXISTS contribuintes_update ON public.contribuintes;
CREATE POLICY contribuintes_update ON public.contribuintes
  FOR UPDATE USING (public.fiscal_can_access_cliente(cliente_id))
          WITH CHECK (public.fiscal_can_access_cliente(cliente_id));

DROP POLICY IF EXISTS contribuintes_delete ON public.contribuintes;
CREATE POLICY contribuintes_delete ON public.contribuintes
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 2) creditos — o levantamento de crédito
--    projeto_id existe para herdar exatamente a RLS de `processos`.
-- ---------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.credito_codigo_seq;

CREATE TABLE IF NOT EXISTS public.creditos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text UNIQUE,
  contribuinte_id       uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  titulo                text NOT NULL,

  esfera                text NOT NULL CHECK (esfera IN ('Federal', 'Estadual', 'Municipal')),
  tributo               text NOT NULL CHECK (tributo IN (
                          'PIS', 'COFINS', 'PIS/COFINS', 'IPI', 'IRPJ', 'CSLL',
                          'IRPJ/CSLL', 'INSS/CPRB', 'IRRF', 'ICMS', 'ICMS-ST',
                          'ISS', 'FGTS', 'Outros')),
  origem                text NOT NULL CHECK (origem IN (
                          'Administrativo', 'Judicial', 'Escritural', 'Ressarcimento')),
  tipo_levantamento     text CHECK (tipo_levantamento IN (
                          'LEV. TRIBUTÁRIO', 'LEV. INSS', 'E-CREDAC',
                          'RESSARCIMENTO ICMS-ST', 'LEV. AÇÃO JUDICIAL', 'OUTROS')),

  competencia_inicio    date,
  competencia_fim       date,

  valor_levantado       numeric(18,2) NOT NULL DEFAULT 0,
  valor_homologado      numeric(18,2),
  valor_honorarios_pct  numeric(6,3),          -- % de êxito contratado
  moeda_atualizada_ate  date,                  -- data-base da atualização (Selic)

  data_base_prescricao  date,                  -- termo inicial do quinquênio
  data_limite_prescricao date GENERATED ALWAYS AS (
                          CASE WHEN data_base_prescricao IS NULL THEN NULL
                               ELSE (data_base_prescricao + INTERVAL '5 years')::date END
                        ) STORED,

  situacao              text NOT NULL DEFAULT 'Em levantamento' CHECK (situacao IN (
                          'Em levantamento', 'Levantado', 'Em habilitação', 'Habilitado',
                          'Em utilização', 'Utilizado', 'Indeferido', 'Prescrito', 'Encerrado')),

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome      text,
  base_legal            text,
  tese                  text,
  observacoes           text,

  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name       text,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT creditos_competencia_check CHECK (
    competencia_inicio IS NULL OR competencia_fim IS NULL OR competencia_fim >= competencia_inicio),
  CONSTRAINT creditos_valores_check CHECK (
    valor_levantado >= 0 AND (valor_homologado IS NULL OR valor_homologado >= 0))
);

COMMENT ON TABLE  public.creditos IS 'Levantamento de crédito tributário. Âncora de habilitações, PER/DCOMPs e contencioso.';
COMMENT ON COLUMN public.creditos.projeto_id IS 'Projeto de vinculação — é por ele que a RLS concede acesso, igual a `processos`.';
COMMENT ON COLUMN public.creditos.valor_levantado IS 'Valor apurado no levantamento (crédito bruto identificado).';
COMMENT ON COLUMN public.creditos.valor_homologado IS 'Valor efetivamente reconhecido pelo fisco. NULL enquanto não houver decisão.';
COMMENT ON COLUMN public.creditos.data_limite_prescricao IS 'Coluna gerada: data_base_prescricao + 5 anos.';

CREATE INDEX IF NOT EXISTS idx_creditos_contribuinte_id ON public.creditos(contribuinte_id);
CREATE INDEX IF NOT EXISTS idx_creditos_projeto_id      ON public.creditos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_creditos_situacao        ON public.creditos(situacao);
CREATE INDEX IF NOT EXISTS idx_creditos_tributo         ON public.creditos(tributo);
CREATE INDEX IF NOT EXISTS idx_creditos_prescricao      ON public.creditos(data_limite_prescricao);

-- Código legível sequencial: CRD-<ano>-<0000>
CREATE OR REPLACE FUNCTION public.creditos_set_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    NEW.codigo := 'CRD-' || to_char(now(), 'YYYY') || '-' ||
                  lpad(nextval('public.credito_codigo_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creditos_codigo ON public.creditos;
CREATE TRIGGER trg_creditos_codigo
BEFORE INSERT ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.creditos_set_codigo();

DROP TRIGGER IF EXISTS trg_creditos_touch ON public.creditos;
CREATE TRIGGER trg_creditos_touch
BEFORE UPDATE ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.creditos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creditos_select ON public.creditos;
CREATE POLICY creditos_select ON public.creditos
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS creditos_insert ON public.creditos;
CREATE POLICY creditos_insert ON public.creditos
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS creditos_update ON public.creditos;
CREATE POLICY creditos_update ON public.creditos
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS creditos_delete ON public.creditos;
CREATE POLICY creditos_delete ON public.creditos
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 3) credito_movimentos — razão do crédito
--    natureza 'C' aumenta o saldo disponível, 'D' reduz.
--    O saldo NUNCA é gravado: é derivado (ver view em 03).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credito_movimentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id      uuid NOT NULL REFERENCES public.creditos(id) ON DELETE CASCADE,
  data_movimento  date NOT NULL DEFAULT CURRENT_DATE,
  natureza        char(1) NOT NULL CHECK (natureza IN ('C', 'D')),
  tipo            text NOT NULL CHECK (tipo IN (
                    'Apropriação', 'Homologação', 'Atualização monetária', 'Ajuste a maior',
                    'Compensação', 'Ressarcimento em espécie', 'Transferência a terceiros',
                    'Liquidação de débito', 'Glosa', 'Estorno', 'Ajuste a menor')),
  valor           numeric(18,2) NOT NULL CHECK (valor > 0),

  origem_tipo     text CHECK (origem_tipo IN (
                    'habilitacao', 'perdcomp', 'processo_administrativo',
                    'processo_judicial', 'manual')),
  origem_id       uuid,
  documento       text,
  observacoes     text,

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.credito_movimentos IS 'Razão do crédito: cada entrada/saída que compõe o saldo disponível.';
COMMENT ON COLUMN public.credito_movimentos.natureza IS 'C = aumenta o saldo (apropriação, homologação, atualização); D = consome (compensação, ressarcimento, glosa).';
COMMENT ON COLUMN public.credito_movimentos.origem_id IS 'Referência polimórfica ao documento que gerou o movimento — sem FK por ser multi-tabela.';

CREATE INDEX IF NOT EXISTS idx_credito_movimentos_credito_id ON public.credito_movimentos(credito_id);
CREATE INDEX IF NOT EXISTS idx_credito_movimentos_origem     ON public.credito_movimentos(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_credito_movimentos_data       ON public.credito_movimentos(data_movimento);

ALTER TABLE public.credito_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credito_movimentos_select ON public.credito_movimentos;
CREATE POLICY credito_movimentos_select ON public.credito_movimentos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.creditos c
     WHERE c.id = credito_id AND public.fiscal_can_access_projeto(c.projeto_id)));

DROP POLICY IF EXISTS credito_movimentos_insert ON public.credito_movimentos;
CREATE POLICY credito_movimentos_insert ON public.credito_movimentos
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.creditos c
     WHERE c.id = credito_id AND public.fiscal_can_access_projeto(c.projeto_id)));

DROP POLICY IF EXISTS credito_movimentos_update ON public.credito_movimentos;
CREATE POLICY credito_movimentos_update ON public.credito_movimentos
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.creditos c
     WHERE c.id = credito_id AND public.fiscal_can_access_projeto(c.projeto_id)));

DROP POLICY IF EXISTS credito_movimentos_delete ON public.credito_movimentos;
CREATE POLICY credito_movimentos_delete ON public.credito_movimentos
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 4) andamentos — linha do tempo única para habilitação, PA e judicial
--    Substitui a necessidade de uma tabela de eventos por entidade.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.andamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo   text NOT NULL CHECK (entidade_tipo IN (
                    'credito', 'habilitacao', 'perdcomp',
                    'processo_administrativo', 'processo_judicial')),
  entidade_id     uuid NOT NULL,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  data_andamento  date NOT NULL DEFAULT CURRENT_DATE,
  tipo            text NOT NULL CHECK (tipo IN (
                    'Protocolo', 'Intimação', 'Ciência', 'Exigência', 'Diligência',
                    'Despacho', 'Decisão', 'Recurso', 'Juntada', 'Pagamento',
                    'Trânsito em julgado', 'Prazo', 'Outro')),
  descricao       text NOT NULL,

  prazo_fatal     date,
  cumprido        boolean NOT NULL DEFAULT false,
  data_cumprimento date,

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome text,

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.andamentos IS 'Movimentações e prazos de qualquer entidade fiscal. prazo_fatal alimenta os alertas.';
COMMENT ON COLUMN public.andamentos.projeto_id IS 'Denormalizado a partir da entidade-pai para permitir RLS direta e barata.';

CREATE INDEX IF NOT EXISTS idx_andamentos_entidade   ON public.andamentos(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_andamentos_projeto_id ON public.andamentos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_andamentos_prazo      ON public.andamentos(prazo_fatal) WHERE cumprido = false;

ALTER TABLE public.andamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS andamentos_select ON public.andamentos;
CREATE POLICY andamentos_select ON public.andamentos
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS andamentos_insert ON public.andamentos;
CREATE POLICY andamentos_insert ON public.andamentos
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS andamentos_update ON public.andamentos;
CREATE POLICY andamentos_update ON public.andamentos
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS andamentos_delete ON public.andamentos;
CREATE POLICY andamentos_delete ON public.andamentos
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());
