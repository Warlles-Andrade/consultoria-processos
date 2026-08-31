-- Remove o cadeado adicional de edicao de processos.
-- A RLS existente continua limitando leitura e atualizacao aos usuarios ativos
-- com acesso ao projeto/cliente da tarefa.

DROP TRIGGER IF EXISTS trg_enforce_process_edit_lock ON public.processos;
DROP FUNCTION IF EXISTS public.enforce_process_edit_lock();

UPDATE public.processos
SET
  is_edit_locked = false,
  edit_locked_by = NULL,
  edit_locked_at = NULL
WHERE
  is_edit_locked = true
  OR edit_locked_by IS NOT NULL
  OR edit_locked_at IS NOT NULL;

COMMENT ON COLUMN public.processos.is_edit_locked IS
  'Campo legado. A edicao e permitida a qualquer usuario ativo com acesso ao processo.';
