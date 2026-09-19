-- =====================================================================
-- e-CredAc (ICMS-SP, crédito acumulado) — conta-corrente, honorários,
-- faturamento e arquivos mensais
-- =====================================================================
-- Aditiva: não altera nem apaga dado existente.
--
-- Modelo:
--   ecredac_contas         uma por estabelecimento (IE) no e-CredAc
--     ├── ecredac_movimentos   extrato da conta-corrente (C soma, D subtrai,
--     │                        * é informativo: deferimento não mexe no saldo)
--     ├── ecredac_faturamentos boletos de honorários emitidos
--     └── ecredac_arquivos     controle mensal dos arquivos a transmitir
--   habilitacoes (já existe) ganha os campos do pedido do e-CredAc
--
-- Regras (em src/lib/ecredacRegras.js, nunca gravadas em coluna):
--   saldo      = saldo_inicial + Σ C − Σ D
--   honorários devidos = % × (apropriações − reincorporações)
--   faturável          = % × reservas deferidas (consumo do crédito)
--   a faturar          = faturável − faturado
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ecredac_contas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id             uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  contribuinte_id        uuid NOT NULL REFERENCES public.contribuintes(id) ON DELETE CASCADE,
  inscricao_estadual     text,
  sistematica            text NOT NULL DEFAULT 'Portaria CAT 83/2009 - Sistemática de Custeio'
                           CHECK (sistematica IN (
                             'Portaria CAT 83/2009 - Sistemática de Custeio',
                             'Portaria CAT 83/2009 - Sistemática Simplificada',
                             'Portaria CAT 207/2009 - ICMS-ST',
                             'Outra')),
  saldo_inicial          numeric(18,2) NOT NULL DEFAULT 0,
  data_saldo_inicial     date,
  percentual_honorarios  numeric(5,2) NOT NULL DEFAULT 8 CHECK (percentual_honorarios >= 0 AND percentual_honorarios <= 100),
  inicio_honorarios      date,
  observacoes            text,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecredac_contas_contribuinte_unico UNIQUE (contribuinte_id)
);
COMMENT ON TABLE public.ecredac_contas IS
  'Conta-corrente do e-CredAc por estabelecimento. Saldo nunca é coluna: saldo_inicial + ΣC − ΣD dos movimentos.';

CREATE TABLE IF NOT EXISTS public.ecredac_movimentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id           uuid NOT NULL REFERENCES public.ecredac_contas(id) ON DELETE CASCADE,
  projeto_id         uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data               date NOT NULL,
  codigo             text,
  documento          text,                 -- nº do pedido/ano ou processo
  historico          text NOT NULL,
  valor              numeric(18,2) NOT NULL CHECK (valor >= 0),
  natureza           text NOT NULL CHECK (natureza IN ('C', 'D', '*')),
  saldo_extrato      numeric(18,2),        -- saldo impresso no extrato, para conferência
  operacao           text NOT NULL CHECK (operacao IN (
                       'RESERVA_TRANSFERENCIA', 'RESERVA_REINCORPORACAO', 'RESERVA_COMPENSACAO', 'RESERVA_FACCA',
                       'DEFERIMENTO_RESERVA', 'DEFERIMENTO_REINCORPORACAO',
                       'INDEFERIMENTO_RESERVA', 'NAO_ACEITE',
                       'DEFERIMENTO_PARCIAL_FACCA', 'INDEFERIMENTO_FACCA', 'RESGATE_FACCA', 'ESTORNO_RESGATE_FACCA',
                       'APROPRIACAO', 'DEVOLUCAO_CREDITO', 'OUTRO')),
  finalidade         text,                 -- ex.: fornecedor de matéria-prima (art. 73, III, "a")
  destinatario_cnpj  text CHECK (destinatario_cnpj IS NULL OR destinatario_cnpj ~ '^[0-9]{14}$'),
  referencia         date CHECK (referencia IS NULL OR extract(day FROM referencia) = 1),
  numero_processo    text,
  chave              text NOT NULL,        -- deduplicação na reimportação
  sequencia          integer,              -- posição no extrato importado (ordem no mesmo dia)
  origem             text NOT NULL DEFAULT 'IMPORTACAO' CHECK (origem IN ('IMPORTACAO', 'MANUAL', 'ECREDAC')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecredac_movimentos_chave_unica UNIQUE (conta_id, chave)
);
CREATE INDEX IF NOT EXISTS ecredac_movimentos_conta_data ON public.ecredac_movimentos (conta_id, data);
CREATE INDEX IF NOT EXISTS ecredac_movimentos_documento ON public.ecredac_movimentos (conta_id, documento);

CREATE TABLE IF NOT EXISTS public.ecredac_faturamentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id           uuid NOT NULL REFERENCES public.ecredac_contas(id) ON DELETE CASCADE,
  projeto_id         uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data_emissao       date NOT NULL,
  competencia        date CHECK (competencia IS NULL OR extract(day FROM competencia) = 1),
  valor              numeric(18,2) NOT NULL CHECK (valor > 0),
  numero_boleto      text,
  numero_nf          text,
  vencimento         date,
  situacao           text NOT NULL DEFAULT 'Emitido' CHECK (situacao IN ('Emitido', 'Pago', 'Cancelado')),
  observacoes        text,
  origem             text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('IMPORTACAO', 'MANUAL')),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name    text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ecredac_arquivos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id           uuid NOT NULL REFERENCES public.ecredac_contas(id) ON DELETE CASCADE,
  projeto_id         uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  referencia         date NOT NULL CHECK (extract(day FROM referencia) = 1),
  tipo               text NOT NULL DEFAULT 'Arquivo digital de custeio' CHECK (tipo IN (
                       'Arquivo digital de custeio', 'Arquivo digital simplificado', 'Outro')),
  situacao           text NOT NULL DEFAULT 'Pendente' CHECK (situacao IN (
                       'Pendente', 'Em elaboração', 'Transmitido', 'Com erro', 'Pedido registrado', 'Dispensado')),
  data_transmissao   date,
  protocolo          text,
  numero_pedido      text,
  observacoes        text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecredac_arquivos_unico UNIQUE (conta_id, referencia, tipo)
);

-- Pedido do e-CredAc: campos que a SEFAZ mostra e a tabela ainda não tinha
ALTER TABLE public.habilitacoes
  ADD COLUMN IF NOT EXISTS natureza_credito text,
  ADD COLUMN IF NOT EXISTS situacao_sefaz   text,
  ADD COLUMN IF NOT EXISTS nota_registro    text,
  ADD COLUMN IF NOT EXISTS nota_recente     text,
  ADD COLUMN IF NOT EXISTS nota_12_meses    text;

COMMENT ON COLUMN public.habilitacoes.situacao_sefaz IS 'Situação exatamente como o e-CredAc mostra (Pendente, Em Análise…).';
COMMENT ON COLUMN public.habilitacoes.nota_registro IS 'Classificação Nos Conformes na data de registro do pedido.';

-- updated_at
DROP TRIGGER IF EXISTS ecredac_contas_touch ON public.ecredac_contas;
CREATE TRIGGER ecredac_contas_touch BEFORE UPDATE ON public.ecredac_contas
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();
DROP TRIGGER IF EXISTS ecredac_arquivos_touch ON public.ecredac_arquivos;
CREATE TRIGGER ecredac_arquivos_touch BEFORE UPDATE ON public.ecredac_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

-- RLS: projeto_id é o eixo, igual ao resto do módulo fiscal
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ecredac_contas', 'ecredac_movimentos', 'ecredac_faturamentos', 'ecredac_arquivos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
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
                    USING (public.fiscal_can_access_projeto(projeto_id))', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Saldo por conta (derivado)
CREATE OR REPLACE VIEW public.v_ecredac_saldos
WITH (security_invoker = on) AS
SELECT c.id AS conta_id,
       c.projeto_id,
       c.contribuinte_id,
       c.saldo_inicial
         + COALESCE(sum(m.valor) FILTER (WHERE m.natureza = 'C'), 0)
         - COALESCE(sum(m.valor) FILTER (WHERE m.natureza = 'D'), 0) AS saldo,
       max(m.data) AS ultimo_movimento,
       count(m.id) AS movimentos
  FROM public.ecredac_contas c
  LEFT JOIN public.ecredac_movimentos m ON m.conta_id = c.id
 GROUP BY c.id;
REVOKE ALL ON public.v_ecredac_saldos FROM anon;
GRANT SELECT ON public.v_ecredac_saldos TO authenticated;

COMMIT;
