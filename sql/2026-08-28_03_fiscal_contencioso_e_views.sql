-- =====================================================================
-- CEP Consultoria — Módulo Fiscal/Jurídico — Parte 3
-- Contencioso administrativo (RFB/DRJ/CARF/CSRF, TIT-SP, TAT/MS, ...),
-- contencioso judicial, vínculo com tarefas e views de apoio.
--
-- Pré-requisitos: 2026-08-28_01_fiscal_base.sql
--                 2026-08-28_02_fiscal_habilitacao_perdcomp.sql
--
-- Decisão de modelagem: `orgao_atual` é texto livre, não CHECK.
-- Cada estado tem seu próprio tribunal administrativo e a lista muda com
-- o tempo; travar em CHECK exigiria migration a cada UF nova. O catálogo
-- que alimenta o dropdown vive em src/data/fiscalDomain.js.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) processos_administrativos — contencioso administrativo fiscal
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.processos_administrativos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribuinte_id       uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  credito_id            uuid REFERENCES public.creditos(id) ON DELETE SET NULL,

  esfera                text NOT NULL CHECK (esfera IN ('Federal', 'Estadual', 'Municipal')),
  uf                    char(2),
  orgao_atual           text NOT NULL,   -- ex.: 'DRJ', 'CARF', 'CSRF', 'TIT-SP', 'TAT/MS'
  orgao_julgador        text,            -- turma/câmara específica
  relator               text,

  numero_processo       text NOT NULL,   -- nº do processo administrativo fiscal
  numero_auto_infracao  text,            -- AIIM (SP) / auto de infração / NFLD
  numero_acordao        text,

  natureza              text NOT NULL CHECK (natureza IN (
                          'Defesa',            -- contribuinte se defende de autuação
                          'Pleito de crédito', -- contribuinte pede restituição/ressarcimento
                          'Consulta')),
  tipo                  text NOT NULL CHECK (tipo IN (
                          'Impugnação', 'Defesa administrativa',
                          'Recurso Voluntário', 'Recurso de Ofício',
                          'Recurso Especial', 'Recurso Hierárquico',
                          'Manifestação de Inconformidade',
                          'Pedido de Restituição', 'Consulta Formal', 'Outro')),
  instancia             text NOT NULL DEFAULT '1ª instância' CHECK (instancia IN (
                          '1ª instância', '2ª instância', 'Instância especial', 'Encerrado')),

  situacao              text NOT NULL DEFAULT 'Em elaboração' CHECK (situacao IN (
                          'Em elaboração', 'Protocolado', 'Aguardando julgamento',
                          'Em diligência', 'Em exigência', 'Pauta de julgamento',
                          'Procedente', 'Parcialmente procedente', 'Improcedente',
                          'Encerrado', 'Prescrito', 'Arquivado')),

  valor_autuado         numeric(18,2),
  valor_em_discussao    numeric(18,2),
  valor_cancelado       numeric(18,2),   -- reduzido/afastado no julgamento
  valor_mantido         numeric(18,2),

  data_ciencia          date,            -- ciência do auto/despacho
  prazo_impugnacao      date,            -- prazo fatal para defesa/recurso
  data_protocolo        date,
  data_julgamento       date,
  proximo_prazo         date,
  proximo_prazo_descricao text,

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome      text,
  advogado_responsavel  text,
  tese                  text,
  observacoes           text,

  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name       text,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT proc_adm_valores_check CHECK (
    (valor_autuado      IS NULL OR valor_autuado      >= 0) AND
    (valor_em_discussao IS NULL OR valor_em_discussao >= 0) AND
    (valor_cancelado    IS NULL OR valor_cancelado    >= 0) AND
    (valor_mantido      IS NULL OR valor_mantido      >= 0)),
  -- Do protocolo em diante exige data de protocolo registrada.
  CONSTRAINT proc_adm_protocolo_check CHECK (
    situacao IN ('Em elaboração', 'Arquivado') OR data_protocolo IS NOT NULL)
);

COMMENT ON TABLE  public.processos_administrativos IS
  'Contencioso administrativo fiscal: federal (RFB/DRJ/CARF/CSRF) e estadual (TIT-SP, TAT/MS e congêneres).';
COMMENT ON COLUMN public.processos_administrativos.orgao_atual IS
  'Órgão onde o processo está hoje. Texto livre — catálogo de sugestões em src/data/fiscalDomain.js.';
COMMENT ON COLUMN public.processos_administrativos.credito_id IS
  'Preenchido quando o processo discute um crédito levantado. NULL em defesas de autuação.';
COMMENT ON COLUMN public.processos_administrativos.prazo_impugnacao IS
  'Prazo fatal para apresentar defesa/recurso. Alimenta v_prazos_criticos.';

CREATE INDEX IF NOT EXISTS idx_proc_adm_contribuinte ON public.processos_administrativos(contribuinte_id);
CREATE INDEX IF NOT EXISTS idx_proc_adm_projeto      ON public.processos_administrativos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_proc_adm_credito      ON public.processos_administrativos(credito_id);
CREATE INDEX IF NOT EXISTS idx_proc_adm_situacao     ON public.processos_administrativos(situacao);
CREATE INDEX IF NOT EXISTS idx_proc_adm_esfera       ON public.processos_administrativos(esfera);
CREATE INDEX IF NOT EXISTS idx_proc_adm_proximo_prazo ON public.processos_administrativos(proximo_prazo);

DROP TRIGGER IF EXISTS trg_proc_adm_touch ON public.processos_administrativos;
CREATE TRIGGER trg_proc_adm_touch
BEFORE UPDATE ON public.processos_administrativos
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.processos_administrativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_adm_select ON public.processos_administrativos;
CREATE POLICY proc_adm_select ON public.processos_administrativos
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_adm_insert ON public.processos_administrativos;
CREATE POLICY proc_adm_insert ON public.processos_administrativos
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_adm_update ON public.processos_administrativos;
CREATE POLICY proc_adm_update ON public.processos_administrativos
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_adm_delete ON public.processos_administrativos;
CREATE POLICY proc_adm_delete ON public.processos_administrativos
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 2) processos_judiciais — ações judiciais e trânsito em julgado
--    prazo_compensacao é gerado: trânsito em julgado + 5 anos
--    (prazo para habilitar/compensar o indébito).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.processos_judiciais (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribuinte_id         uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE RESTRICT,
  projeto_id              uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  credito_id              uuid REFERENCES public.creditos(id) ON DELETE SET NULL,

  numero_cnj              text NOT NULL,
  tipo_acao               text NOT NULL CHECK (tipo_acao IN (
                            'Mandado de Segurança', 'Ação Ordinária',
                            'Ação Declaratória', 'Ação Anulatória',
                            'Repetição de Indébito', 'Embargos à Execução Fiscal',
                            'Execução Fiscal', 'Exceção de Pré-executividade',
                            'Ação Rescisória', 'Outra')),
  polo                    text NOT NULL DEFAULT 'Ativo' CHECK (polo IN ('Ativo', 'Passivo')),

  tribunal                text,
  vara                    text,
  comarca                 text,
  uf                      char(2),
  instancia               text NOT NULL DEFAULT '1º grau' CHECK (instancia IN (
                            '1º grau', '2º grau', 'STJ', 'STF', 'Encerrado')),

  situacao                text NOT NULL DEFAULT 'Ajuizada' CHECK (situacao IN (
                            'Em elaboração', 'Ajuizada', 'Em andamento',
                            'Liminar deferida', 'Liminar indeferida',
                            'Sentença favorável', 'Sentença desfavorável',
                            'Acórdão favorável', 'Acórdão desfavorável',
                            'Aguardando trânsito em julgado', 'Transitada em julgado',
                            'Em cumprimento de sentença', 'Arquivada', 'Extinta')),

  data_ajuizamento        date,
  data_sentenca           date,
  data_acordao            date,
  data_transito_julgado   date,
  prazo_compensacao       date GENERATED ALWAYS AS (
                            CASE WHEN data_transito_julgado IS NULL THEN NULL
                                 ELSE (data_transito_julgado + INTERVAL '5 years')::date END
                          ) STORED,
  proximo_prazo           date,
  proximo_prazo_descricao text,

  valor_causa             numeric(18,2),
  valor_estimado_credito  numeric(18,2),
  deposito_judicial       numeric(18,2),

  -- Habilitação prévia do crédito judicial na RFB (IN RFB 2.055/2021, art. 100+)
  habilitacao_previa_rfb  boolean NOT NULL DEFAULT false,
  data_habilitacao_previa date,
  numero_processo_habilitacao text,
  situacao_habilitacao_previa text CHECK (situacao_habilitacao_previa IN (
                            'Não solicitada', 'Solicitada', 'Deferida', 'Indeferida')),

  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome        text,
  advogado_responsavel    text,
  tese                    text,
  observacoes             text,

  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name         text,
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT proc_jud_valores_check CHECK (
    (valor_causa            IS NULL OR valor_causa            >= 0) AND
    (valor_estimado_credito IS NULL OR valor_estimado_credito >= 0) AND
    (deposito_judicial      IS NULL OR deposito_judicial      >= 0))
);

COMMENT ON TABLE  public.processos_judiciais IS
  'Ações judiciais tributárias. Fonte de créditos de origem judicial após o trânsito em julgado.';
COMMENT ON COLUMN public.processos_judiciais.prazo_compensacao IS
  'Coluna gerada: trânsito em julgado + 5 anos — prazo para compensar o indébito.';
COMMENT ON COLUMN public.processos_judiciais.habilitacao_previa_rfb IS
  'Crédito judicial exige habilitação prévia na RFB antes de compensar via PER/DCOMP.';

CREATE INDEX IF NOT EXISTS idx_proc_jud_contribuinte ON public.processos_judiciais(contribuinte_id);
CREATE INDEX IF NOT EXISTS idx_proc_jud_projeto      ON public.processos_judiciais(projeto_id);
CREATE INDEX IF NOT EXISTS idx_proc_jud_credito      ON public.processos_judiciais(credito_id);
CREATE INDEX IF NOT EXISTS idx_proc_jud_situacao     ON public.processos_judiciais(situacao);
CREATE INDEX IF NOT EXISTS idx_proc_jud_compensacao  ON public.processos_judiciais(prazo_compensacao);
CREATE INDEX IF NOT EXISTS idx_proc_jud_numero_cnj   ON public.processos_judiciais(numero_cnj);

DROP TRIGGER IF EXISTS trg_proc_jud_touch ON public.processos_judiciais;
CREATE TRIGGER trg_proc_jud_touch
BEFORE UPDATE ON public.processos_judiciais
FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.processos_judiciais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_jud_select ON public.processos_judiciais;
CREATE POLICY proc_jud_select ON public.processos_judiciais
  FOR SELECT USING (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_jud_insert ON public.processos_judiciais;
CREATE POLICY proc_jud_insert ON public.processos_judiciais
  FOR INSERT WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_jud_update ON public.processos_judiciais;
CREATE POLICY proc_jud_update ON public.processos_judiciais
  FOR UPDATE USING (public.fiscal_can_access_projeto(projeto_id))
          WITH CHECK (public.fiscal_can_access_projeto(projeto_id));

DROP POLICY IF EXISTS proc_jud_delete ON public.processos_judiciais;
CREATE POLICY proc_jud_delete ON public.processos_judiciais
  FOR DELETE USING (public.fiscal_is_admin() OR created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 3) Vínculo entre a camada operacional (tarefas) e a camada fiscal
--    Uma tarefa em `processos` pode apontar para um crédito e,
--    opcionalmente, para o documento específico daquele crédito.
-- ---------------------------------------------------------------------

ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS credito_id   uuid REFERENCES public.creditos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vinculo_tipo text,
  ADD COLUMN IF NOT EXISTS vinculo_id   uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processos_vinculo_tipo_check'
  ) THEN
    ALTER TABLE public.processos
      ADD CONSTRAINT processos_vinculo_tipo_check CHECK (
        vinculo_tipo IS NULL OR vinculo_tipo IN (
          'credito', 'habilitacao', 'perdcomp',
          'processo_administrativo', 'processo_judicial'));
  END IF;
END $$;

COMMENT ON COLUMN public.processos.credito_id IS
  'Crédito ao qual esta tarefa pertence. NULL em tarefas administrativas comuns.';
COMMENT ON COLUMN public.processos.vinculo_tipo IS
  'Documento fiscal específico que a tarefa atende (habilitação, PER/DCOMP, PA, judicial). Par com vinculo_id.';

CREATE INDEX IF NOT EXISTS idx_processos_credito_id ON public.processos(credito_id);
CREATE INDEX IF NOT EXISTS idx_processos_vinculo    ON public.processos(vinculo_tipo, vinculo_id);

-- ---------------------------------------------------------------------
-- 4) v_credito_saldos — saldo derivado da razão, nunca gravado
--    security_invoker faz a RLS das tabelas-base valer para quem consulta.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_credito_saldos;
CREATE VIEW public.v_credito_saldos
WITH (security_invoker = on) AS
SELECT
  c.id                                            AS credito_id,
  c.codigo,
  c.titulo,
  c.projeto_id,
  c.contribuinte_id,
  c.tributo,
  c.esfera,
  c.situacao,
  c.valor_levantado,
  c.valor_homologado,
  COALESCE(mov.total_credito, 0)                  AS total_creditado,
  COALESCE(mov.total_debito, 0)                   AS total_utilizado,
  COALESCE(mov.total_credito, 0)
    - COALESCE(mov.total_debito, 0)               AS saldo_disponivel,
  c.data_limite_prescricao,
  CASE WHEN c.data_limite_prescricao IS NULL THEN NULL
       ELSE c.data_limite_prescricao - CURRENT_DATE END AS dias_para_prescricao
FROM public.creditos c
LEFT JOIN (
  SELECT
    credito_id,
    SUM(valor) FILTER (WHERE natureza = 'C') AS total_credito,
    SUM(valor) FILTER (WHERE natureza = 'D') AS total_debito
  FROM public.credito_movimentos
  GROUP BY credito_id
) mov ON mov.credito_id = c.id;

COMMENT ON VIEW public.v_credito_saldos IS
  'Saldo disponível por crédito, derivado de credito_movimentos (C - D). Nunca gravar saldo em coluna.';

-- ---------------------------------------------------------------------
-- 5) v_prazos_criticos — todos os prazos legais em uma única lista
--    Alimenta o painel de alertas. dias_restantes negativo = vencido.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_prazos_criticos;
CREATE VIEW public.v_prazos_criticos
WITH (security_invoker = on) AS

-- Prescrição do crédito levantado
SELECT
  'credito'::text                AS entidade_tipo,
  c.id                           AS entidade_id,
  c.projeto_id,
  c.contribuinte_id,
  c.codigo                       AS referencia,
  c.titulo                       AS descricao,
  'Prescrição do crédito'::text  AS tipo_prazo,
  c.data_limite_prescricao       AS data_prazo,
  c.data_limite_prescricao - CURRENT_DATE AS dias_restantes,
  c.situacao,
  c.responsavel_nome
FROM public.creditos c
WHERE c.data_limite_prescricao IS NOT NULL
  AND c.situacao NOT IN ('Utilizado', 'Encerrado', 'Indeferido', 'Prescrito')

UNION ALL

-- Exigência/diligência em pedido e-CredAc
SELECT
  'habilitacao', h.id, h.projeto_id, h.contribuinte_id,
  COALESCE(h.numero_protocolo, h.regime),
  h.regime || ' — ' || COALESCE(h.numero_processo_sefaz, 'sem processo'),
  'Resposta a exigência (e-CredAc)',
  h.prazo_resposta,
  h.prazo_resposta - CURRENT_DATE,
  h.situacao,
  h.responsavel_nome
FROM public.habilitacoes h
WHERE h.prazo_resposta IS NOT NULL
  AND h.situacao IN ('Protocolado', 'Em análise', 'Em exigência')

UNION ALL

-- Homologação tácita do PER/DCOMP
SELECT
  'perdcomp', p.id, p.projeto_id, p.contribuinte_id,
  p.numero,
  p.tipo || ' — ' || p.tipo_documento,
  'Homologação tácita (5 anos)',
  p.data_limite_homologacao,
  p.data_limite_homologacao - CURRENT_DATE,
  p.situacao,
  p.responsavel_nome
FROM public.perdcomps p
WHERE p.situacao IN ('Transmitido', 'Em análise', 'Deferido parcialmente')

UNION ALL

-- Manifestação de inconformidade contra não homologação
SELECT
  'perdcomp', p.id, p.projeto_id, p.contribuinte_id,
  p.numero,
  'Não homologação — ' || COALESCE(p.numero_processo_administrativo, 'sem PAF'),
  'Manifestação de inconformidade',
  p.prazo_manifestacao,
  p.prazo_manifestacao - CURRENT_DATE,
  p.situacao,
  p.responsavel_nome
FROM public.perdcomps p
WHERE p.prazo_manifestacao IS NOT NULL
  AND p.situacao IN ('Indeferido', 'Não homologado', 'Deferido parcialmente')

UNION ALL

-- Prazo de defesa/recurso no contencioso administrativo
SELECT
  'processo_administrativo', pa.id, pa.projeto_id, pa.contribuinte_id,
  pa.numero_processo,
  pa.orgao_atual || ' — ' || pa.tipo,
  'Prazo de defesa/recurso',
  pa.prazo_impugnacao,
  pa.prazo_impugnacao - CURRENT_DATE,
  pa.situacao,
  pa.responsavel_nome
FROM public.processos_administrativos pa
WHERE pa.prazo_impugnacao IS NOT NULL
  AND pa.situacao NOT IN ('Encerrado', 'Arquivado', 'Prescrito')

UNION ALL

-- Próximo prazo genérico do contencioso administrativo
SELECT
  'processo_administrativo', pa.id, pa.projeto_id, pa.contribuinte_id,
  pa.numero_processo,
  COALESCE(pa.proximo_prazo_descricao, pa.orgao_atual),
  'Próximo prazo (administrativo)',
  pa.proximo_prazo,
  pa.proximo_prazo - CURRENT_DATE,
  pa.situacao,
  pa.responsavel_nome
FROM public.processos_administrativos pa
WHERE pa.proximo_prazo IS NOT NULL
  AND pa.situacao NOT IN ('Encerrado', 'Arquivado', 'Prescrito')

UNION ALL

-- Prazo para compensar indébito após trânsito em julgado
SELECT
  'processo_judicial', pj.id, pj.projeto_id, pj.contribuinte_id,
  pj.numero_cnj,
  pj.tipo_acao,
  'Compensação do indébito (5 anos do trânsito)',
  pj.prazo_compensacao,
  pj.prazo_compensacao - CURRENT_DATE,
  pj.situacao,
  pj.responsavel_nome
FROM public.processos_judiciais pj
WHERE pj.prazo_compensacao IS NOT NULL
  AND pj.situacao NOT IN ('Arquivada', 'Extinta')

UNION ALL

-- Próximo prazo genérico do judicial
SELECT
  'processo_judicial', pj.id, pj.projeto_id, pj.contribuinte_id,
  pj.numero_cnj,
  COALESCE(pj.proximo_prazo_descricao, pj.tipo_acao),
  'Próximo prazo (judicial)',
  pj.proximo_prazo,
  pj.proximo_prazo - CURRENT_DATE,
  pj.situacao,
  pj.responsavel_nome
FROM public.processos_judiciais pj
WHERE pj.proximo_prazo IS NOT NULL
  AND pj.situacao NOT IN ('Arquivada', 'Extinta')

UNION ALL

-- Prazos fatais lançados manualmente na linha do tempo
SELECT
  a.entidade_tipo, a.entidade_id, a.projeto_id, NULL::uuid,
  a.tipo,
  a.descricao,
  'Prazo de andamento',
  a.prazo_fatal,
  a.prazo_fatal - CURRENT_DATE,
  NULL::text,
  a.responsavel_nome
FROM public.andamentos a
WHERE a.prazo_fatal IS NOT NULL
  AND a.cumprido = false;

COMMENT ON VIEW public.v_prazos_criticos IS
  'Consolidação de todos os prazos legais em aberto. dias_restantes < 0 = vencido.';
