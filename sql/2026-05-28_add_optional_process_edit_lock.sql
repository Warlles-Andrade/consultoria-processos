-- Cadeado opcional de edição para processos
-- Aplicar no banco Supabase/Postgres antes de usar a feature em produção.

ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS is_edit_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_locked_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_locked_at timestamptz NULL;

COMMENT ON COLUMN public.processos.is_edit_locked IS 'Quando true, apenas o criador do processo ou um administrador pode alterar seus dados.';
COMMENT ON COLUMN public.processos.edit_locked_by IS 'Usuário que ativou o cadeado pela primeira vez.';
COMMENT ON COLUMN public.processos.edit_locked_at IS 'Data/hora em que o cadeado foi ativado.';

CREATE OR REPLACE FUNCTION public.enforce_process_edit_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_id uuid;
  current_user_group text;
  is_admin boolean;
  is_owner boolean;
  lock_state_changed boolean;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    IF COALESCE(OLD.is_edit_locked, false) THEN
      RAISE EXCEPTION 'Processo bloqueado para edição.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT grupo
    INTO current_user_group
    FROM public.user_profiles
   WHERE user_id = current_user_id
   LIMIT 1;

  is_admin := current_user_group = 'adm';
  is_owner := OLD.created_by IS NULL OR OLD.created_by = current_user_id;
  lock_state_changed := COALESCE(NEW.is_edit_locked, false) IS DISTINCT FROM COALESCE(OLD.is_edit_locked, false);

  IF lock_state_changed AND NOT (is_admin OR is_owner) THEN
    RAISE EXCEPTION 'Apenas o criador do processo ou um administrador pode alterar o cadeado.';
  END IF;

  IF COALESCE(OLD.is_edit_locked, false) AND NOT (is_admin OR is_owner) THEN
    RAISE EXCEPTION 'Processo bloqueado para edição.';
  END IF;

  IF COALESCE(NEW.is_edit_locked, false) AND NEW.edit_locked_at IS NULL THEN
    NEW.edit_locked_at := NOW();
  END IF;

  IF NOT COALESCE(NEW.is_edit_locked, false) THEN
    NEW.edit_locked_at := NULL;
    NEW.edit_locked_by := NULL;
  ELSIF NEW.edit_locked_by IS NULL THEN
    NEW.edit_locked_by := COALESCE(OLD.edit_locked_by, current_user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_process_edit_lock ON public.processos;

CREATE TRIGGER trg_enforce_process_edit_lock
BEFORE UPDATE ON public.processos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_process_edit_lock();
