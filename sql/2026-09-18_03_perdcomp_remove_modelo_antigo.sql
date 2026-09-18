-- =====================================================================
-- PER/DCOMP — remove as tabelas do modelo antigo (OPCIONAL)
-- =====================================================================
-- perdcomps e perdcomp_debitos deixaram de ser usadas pela aplicação
-- (substituídas pelo controle por crédito, migrations 2026-09-18_01/_02).
-- Aplique DEPOIS da _02, que tira a dependência de v_prazos_criticos.
--
-- Trava: só apaga se as duas estiverem vazias; se houver linhas, aborta
-- sem mudar nada. Em 18/09/2026 ambas estavam vazias no processos_bd.
--
-- Os CHECKs que aceitam o texto 'perdcomp' (andamentos.entidade_tipo,
-- processos.vinculo_tipo, credito_movimentos.origem_tipo) ficam: são
-- valores aceitos, não referências às tabelas.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.perdcomps') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.perdcomps) THEN
    RAISE EXCEPTION 'perdcomps tem dados: migre-os para o controle novo antes de apagar a tabela.';
  END IF;
  IF to_regclass('public.perdcomp_debitos') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.perdcomp_debitos) THEN
    RAISE EXCEPTION 'perdcomp_debitos tem dados: migre-os antes de apagar a tabela.';
  END IF;
END $$;

DROP TABLE IF EXISTS public.perdcomp_debitos;
DROP TABLE IF EXISTS public.perdcomps;

COMMIT;
