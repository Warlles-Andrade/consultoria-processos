-- =====================================================================
-- PER/DCOMP — prazos do controle novo em v_prazos_criticos
-- =====================================================================
-- O controle passou a ser por crédito (migration 2026-09-18_01): PER com
-- versões, DCOMPs com conta-corrente e fase derivada de eventos.
--
-- Recria v_prazos_criticos trocando os ramos da tabela antiga `perdcomps`
-- por prazos calculados das DCOMPs e dos eventos (mesma regra de
-- src/lib/perdcompRegras.js → prazos()). Não apaga dados.
-- A remoção das tabelas antigas está em 2026-09-18_03 (opcional).
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_prazos_criticos;

-- 24 dígitos → 12345.67890.010126.1.3.15-1234 (mesmo formato da tela)
CREATE OR REPLACE FUNCTION public.fiscal_formata_perdcomp(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN n ~ '^[0-9]{24}$'
    THEN substr(n, 1, 5) || '.' || substr(n, 6, 5) || '.' || substr(n, 11, 6) || '.' ||
         substr(n, 17, 1) || '.' || substr(n, 18, 1) || '.' || substr(n, 19, 2) || '-' || substr(n, 21, 4)
    ELSE n END;
$$;

CREATE VIEW public.v_prazos_criticos
WITH (security_invoker = on) AS
SELECT 'credito'::text AS entidade_tipo,
    c.id AS entidade_id,
    c.projeto_id,
    c.contribuinte_id,
    c.codigo AS referencia,
    c.titulo AS descricao,
    'Prescrição do crédito'::text AS tipo_prazo,
    c.data_limite_prescricao AS data_prazo,
    c.data_limite_prescricao - CURRENT_DATE AS dias_restantes,
    c.situacao,
    c.responsavel_nome
  FROM public.creditos c
  WHERE c.data_limite_prescricao IS NOT NULL
    AND c.situacao <> ALL (ARRAY['Utilizado', 'Encerrado', 'Indeferido', 'Prescrito'])
UNION ALL
SELECT 'habilitacao',
    h.id,
    h.projeto_id,
    h.contribuinte_id,
    COALESCE(h.numero_protocolo, h.regime),
    (h.regime || ' — ') || COALESCE(h.numero_processo_sefaz, 'sem processo'),
    'Resposta a exigência (e-CredAc)',
    h.prazo_resposta,
    h.prazo_resposta - CURRENT_DATE,
    h.situacao,
    h.responsavel_nome
  FROM public.habilitacoes h
  WHERE h.prazo_resposta IS NOT NULL
    AND h.situacao = ANY (ARRAY['Protocolado', 'Em análise', 'Em exigência'])
UNION ALL
-- Homologação tácita: DCOMP que consome crédito e ainda sem decisão
-- (Lei 9.430/96, art. 74, §5º) — transmissão + 5 anos, no dia de Brasília.
SELECT 'perdcomp',
    d.id,
    d.projeto_id,
    pc.contribuinte_id,
    public.fiscal_formata_perdcomp(d.numero),
    'DCOMP ' || d.situacao_documento || ' — crédito ' || to_char(pc.competencia, 'MM/YYYY'),
    'Homologação tácita (5 anos)',
    ((d.data_transmissao AT TIME ZONE 'America/Sao_Paulo')::date + interval '5 years')::date,
    ((d.data_transmissao AT TIME ZONE 'America/Sao_Paulo')::date + interval '5 years')::date - CURRENT_DATE,
    'Aguardando homologação',
    NULL::text
  FROM public.perdcomp_dcomps d
  JOIN public.perdcomp_creditos pc ON pc.id = d.perdcomp_credito_id
  WHERE d.situacao_documento IN ('ativa', 'retificadora')
    -- Passados 5 anos sem decisão a DCOMP está homologada tacitamente:
    -- não é prazo perdido, sai do painel (a tela de PER/DCOMP sinaliza).
    AND ((d.data_transmissao AT TIME ZONE 'America/Sao_Paulo')::date + interval '5 years')::date >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.perdcomp_eventos e
      WHERE e.documento = d.numero
        AND e.tipo IN ('HOMOLOGACAO', 'HOMOLOGACAO_PARCIAL', 'NAO_HOMOLOGACAO', 'HOMOLOGACAO_TACITA', 'CANCELAMENTO'))
UNION ALL
-- Manifestação de inconformidade: 30 dias da ciência da decisão
-- desfavorável, enquanto não houver MANIFESTACAO registrada depois dela.
SELECT 'perdcomp',
    COALESCE(d.id, pc.id),
    u.projeto_id,
    COALESCE(pcd.contribuinte_id, pc.contribuinte_id),
    public.fiscal_formata_perdcomp(u.documento),
    u.entidade || ' — ' || replace(initcap(replace(u.tipo, '_', ' ')), 'Nao', 'Não'),
    'Manifestação de inconformidade (30 dias)',
    u.data + 30,
    u.data + 30 - CURRENT_DATE,
    'Decisão desfavorável',
    NULL::text
  FROM (
    SELECT DISTINCT ON (e.documento) e.documento, e.entidade, e.tipo, e.data, e.projeto_id
    FROM public.perdcomp_eventos e
    WHERE e.tipo IN ('NAO_HOMOLOGACAO', 'HOMOLOGACAO_PARCIAL', 'DESPACHO_INDEFERIMENTO', 'DESPACHO_PARCIAL')
    ORDER BY e.documento, e.data DESC, e.created_at DESC
  ) u
  LEFT JOIN public.perdcomp_dcomps d ON d.numero = u.documento
  LEFT JOIN public.perdcomp_creditos pcd ON pcd.id = d.perdcomp_credito_id
  LEFT JOIN public.perdcomp_creditos pc ON pc.numero_per_original = u.documento
  WHERE NOT EXISTS (
    SELECT 1 FROM public.perdcomp_eventos m
    WHERE m.documento = u.documento AND m.tipo = 'MANIFESTACAO' AND m.data >= u.data)
    AND COALESCE(d.id, pc.id) IS NOT NULL
UNION ALL
SELECT 'processo_administrativo',
    pa.id,
    pa.projeto_id,
    pa.contribuinte_id,
    pa.numero_processo,
    (pa.orgao_atual || ' — ') || pa.tipo,
    'Prazo de defesa/recurso',
    pa.prazo_impugnacao,
    pa.prazo_impugnacao - CURRENT_DATE,
    pa.situacao,
    pa.responsavel_nome
  FROM public.processos_administrativos pa
  WHERE pa.prazo_impugnacao IS NOT NULL
    AND pa.situacao <> ALL (ARRAY['Encerrado', 'Arquivado', 'Prescrito'])
UNION ALL
SELECT 'processo_administrativo',
    pa.id,
    pa.projeto_id,
    pa.contribuinte_id,
    pa.numero_processo,
    COALESCE(pa.proximo_prazo_descricao, pa.orgao_atual),
    'Próximo prazo (administrativo)',
    pa.proximo_prazo,
    pa.proximo_prazo - CURRENT_DATE,
    pa.situacao,
    pa.responsavel_nome
  FROM public.processos_administrativos pa
  WHERE pa.proximo_prazo IS NOT NULL
    AND pa.situacao <> ALL (ARRAY['Encerrado', 'Arquivado', 'Prescrito'])
UNION ALL
SELECT 'processo_judicial',
    pj.id,
    pj.projeto_id,
    pj.contribuinte_id,
    pj.numero_cnj,
    pj.tipo_acao,
    'Compensação do indébito (5 anos do trânsito)',
    pj.prazo_compensacao,
    pj.prazo_compensacao - CURRENT_DATE,
    pj.situacao,
    pj.responsavel_nome
  FROM public.processos_judiciais pj
  WHERE pj.prazo_compensacao IS NOT NULL
    AND pj.situacao <> ALL (ARRAY['Arquivada', 'Extinta'])
UNION ALL
SELECT 'processo_judicial',
    pj.id,
    pj.projeto_id,
    pj.contribuinte_id,
    pj.numero_cnj,
    COALESCE(pj.proximo_prazo_descricao, pj.tipo_acao),
    'Próximo prazo (judicial)',
    pj.proximo_prazo,
    pj.proximo_prazo - CURRENT_DATE,
    pj.situacao,
    pj.responsavel_nome
  FROM public.processos_judiciais pj
  WHERE pj.proximo_prazo IS NOT NULL
    AND pj.situacao <> ALL (ARRAY['Arquivada', 'Extinta'])
UNION ALL
SELECT a.entidade_tipo,
    a.entidade_id,
    a.projeto_id,
    NULL::uuid,
    a.tipo,
    a.descricao,
    'Prazo de andamento',
    a.prazo_fatal,
    a.prazo_fatal - CURRENT_DATE,
    NULL::text,
    a.responsavel_nome
  FROM public.andamentos a
  WHERE a.prazo_fatal IS NOT NULL AND a.cumprido = false;

COMMENT ON VIEW public.v_prazos_criticos IS
  'Prazos de todas as entidades fiscais. PER/DCOMP: homologação tácita e manifestação de inconformidade, derivados de perdcomp_dcomps e perdcomp_eventos.';

REVOKE ALL ON public.v_prazos_criticos FROM anon;
GRANT SELECT ON public.v_prazos_criticos TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fiscal_formata_perdcomp(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fiscal_formata_perdcomp(text) TO authenticated;

COMMIT;
