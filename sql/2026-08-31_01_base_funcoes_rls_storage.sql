-- =====================================================================
-- CEP Consultoria — Camada Operacional — Funções, RLS e Storage
--
-- Pré-requisito: 2026-08-31_00_base_camada_tarefas.sql
-- APLICAR ANTES das migrations fiscais 2026-08-28_0{1,2,3}.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funções de apoio à autorização
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN clientes c ON c.nome = up.grupo
    WHERE up.user_id = auth.uid() AND c.is_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM user_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- true se o perfil "pertence" ao cliente (grupo primário OU acessa algum projeto dele)
CREATE OR REPLACE FUNCTION public.profile_can_access_cliente(p_profile uuid, p_cliente uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN clientes c ON c.nome = up.grupo
    WHERE up.id = p_profile AND c.id = p_cliente
    UNION
    SELECT 1 FROM user_projetos upj
    JOIN projetos pr ON pr.id = upj.projeto_id
    WHERE upj.user_profile_id = p_profile AND pr.cliente_id = p_cliente
  );
$$;

-- Atalho usado nas políticas: usuário está ativo?
CREATE OR REPLACE FUNCTION public.current_user_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT ativo FROM user_profiles WHERE user_id = auth.uid()), false);
$$;

-- Grupo do usuário atual ('adm' para administradores)
CREATE OR REPLACE FUNCTION public.current_user_grupo()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT grupo FROM user_profiles WHERE user_id = auth.uid()), '');
$$;

-- ---------------------------------------------------------------------
-- 2) Criação de perfil no signup
--    Protege contra auto-promoção: quem se cadastra nunca vira 'adm'.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome  text;
  v_grupo text;
BEGIN
  v_nome  := COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1));
  v_grupo := NEW.raw_user_meta_data ->> 'grupo';

  IF v_grupo IS NULL OR btrim(v_grupo) = '' OR v_grupo = 'adm' THEN
    v_grupo := 'sem_grupo';
  END IF;

  INSERT INTO public.user_profiles (user_id, nome, grupo, ativo)
  VALUES (NEW.id, v_nome, v_grupo, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Upsert de perfil com retry, chamado pelo fluxo de criação de usuário.
CREATE OR REPLACE FUNCTION public.create_user_profile_safe(
  p_user_id uuid,
  p_nome    text,
  p_grupo   text
)
RETURNS public.user_profiles LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo   text := p_grupo;
  v_perfil  public.user_profiles;
  v_tentativa int := 0;
BEGIN
  -- Quem não é admin não consegue criar um admin.
  IF v_grupo = 'adm' AND NOT public.is_user_admin() THEN
    v_grupo := public.current_user_grupo();
  END IF;

  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      INSERT INTO public.user_profiles (user_id, nome, grupo, ativo)
      VALUES (p_user_id, p_nome, v_grupo, true)
      ON CONFLICT (user_id) DO UPDATE
        SET nome = EXCLUDED.nome, grupo = EXCLUDED.grupo, updated_at = now()
      RETURNING * INTO v_perfil;
      RETURN v_perfil;
    EXCEPTION WHEN foreign_key_violation THEN
      -- auth.users pode ainda não ter replicado; espera e tenta de novo
      IF v_tentativa >= 5 THEN RAISE; END IF;
      PERFORM pg_sleep(0.3 * v_tentativa);
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_profile_safe(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_profile_safe(uuid, text, text) TO authenticated;

-- Perfis com o e-mail vindo de auth.users (a tabela de perfis não guarda e-mail).
CREATE OR REPLACE FUNCTION public.get_user_profiles_with_email()
RETURNS TABLE (
  id         uuid,
  user_id    uuid,
  nome       varchar,
  grupo      varchar,
  ativo      boolean,
  email      text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.id, up.user_id, up.nome, up.grupo, up.ativo,
         u.email::text, up.created_at
  FROM public.user_profiles up
  LEFT JOIN auth.users u ON u.id = up.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_profiles_with_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_with_email() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------

ALTER TABLE public.clientes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_projetos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsavel_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

-- user_profiles: aberto a autenticados (o app precisa montar o mapa de responsáveis)
DROP POLICY IF EXISTS user_profiles_all ON public.user_profiles;
CREATE POLICY user_profiles_all ON public.user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- clientes
DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS clientes_write ON public.clientes;
CREATE POLICY clientes_write ON public.clientes
  FOR ALL TO authenticated
  USING (public.is_user_admin()) WITH CHECK (public.is_user_admin());

-- projetos: posse e compartilhamento
DROP POLICY IF EXISTS projetos_select ON public.projetos;
CREATE POLICY projetos_select ON public.projetos FOR SELECT TO authenticated
  USING (
    public.is_user_admin()
    OR created_by = auth.uid()
    OR id IN (SELECT projeto_id FROM public.user_projetos WHERE user_profile_id = public.current_profile_id())
  );

DROP POLICY IF EXISTS projetos_insert ON public.projetos;
CREATE POLICY projetos_insert ON public.projetos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_user_admin()
    OR (created_by = auth.uid() AND public.profile_can_access_cliente(public.current_profile_id(), cliente_id))
  );

DROP POLICY IF EXISTS projetos_update ON public.projetos;
CREATE POLICY projetos_update ON public.projetos FOR UPDATE TO authenticated
  USING (public.is_user_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_user_admin() OR created_by = auth.uid());

DROP POLICY IF EXISTS projetos_delete ON public.projetos;
CREATE POLICY projetos_delete ON public.projetos FOR DELETE TO authenticated
  USING (public.is_user_admin() OR created_by = auth.uid());

-- user_projetos: SELECT aberto (o mapa de responsáveis depende disso)
DROP POLICY IF EXISTS user_projetos_select ON public.user_projetos;
CREATE POLICY user_projetos_select ON public.user_projetos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_projetos_insert ON public.user_projetos;
CREATE POLICY user_projetos_insert ON public.user_projetos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_user_admin()
    OR (
      projeto_id IN (SELECT id FROM public.projetos WHERE created_by = auth.uid())
      AND public.profile_can_access_cliente(
        user_profile_id,
        (SELECT cliente_id FROM public.projetos WHERE id = projeto_id)
      )
    )
  );

DROP POLICY IF EXISTS user_projetos_delete ON public.user_projetos;
CREATE POLICY user_projetos_delete ON public.user_projetos FOR DELETE TO authenticated
  USING (
    public.is_user_admin()
    OR projeto_id IN (SELECT id FROM public.projetos WHERE created_by = auth.uid())
    OR user_profile_id = public.current_profile_id()
  );

-- responsaveis / responsavel_projetos: autenticados
DROP POLICY IF EXISTS responsaveis_all ON public.responsaveis;
CREATE POLICY responsaveis_all ON public.responsaveis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS responsavel_projetos_all ON public.responsavel_projetos;
CREATE POLICY responsavel_projetos_all ON public.responsavel_projetos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- processos
DROP POLICY IF EXISTS processos_select ON public.processos;
CREATE POLICY processos_select ON public.processos FOR SELECT TO authenticated
  USING (
    public.current_user_ativo()
    AND (
      public.current_user_grupo() = 'adm'
      OR projeto_id IN (
        SELECT up.projeto_id FROM public.user_projetos up
        JOIN public.user_profiles prof ON prof.id = up.user_profile_id
        WHERE prof.user_id = auth.uid()
      )
      OR (projeto_id IS NULL AND grupo = public.current_user_grupo())
    )
  );

DROP POLICY IF EXISTS processos_insert ON public.processos;
CREATE POLICY processos_insert ON public.processos FOR INSERT TO authenticated
  WITH CHECK (public.current_user_ativo());

DROP POLICY IF EXISTS processos_update ON public.processos;
CREATE POLICY processos_update ON public.processos FOR UPDATE TO authenticated
  USING (public.current_user_ativo()) WITH CHECK (public.current_user_ativo());

DROP POLICY IF EXISTS processos_delete ON public.processos;
CREATE POLICY processos_delete ON public.processos FOR DELETE TO authenticated
  USING (
    public.current_user_grupo() = 'adm'
    OR created_by = auth.uid()
    OR created_by IS NULL
  );

-- process_history: quem enxerga o processo enxerga o histórico
DROP POLICY IF EXISTS process_history_select ON public.process_history;
CREATE POLICY process_history_select ON public.process_history FOR SELECT TO authenticated
  USING (
    public.current_user_grupo() = 'adm'
    OR EXISTS (SELECT 1 FROM public.processos p WHERE p.id = process_id)
  );

DROP POLICY IF EXISTS process_history_insert ON public.process_history;
CREATE POLICY process_history_insert ON public.process_history FOR INSERT TO authenticated
  WITH CHECK (public.current_user_ativo());

-- process_messages
DROP POLICY IF EXISTS process_messages_select ON public.process_messages;
CREATE POLICY process_messages_select ON public.process_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.processos p WHERE p.id = process_id));

DROP POLICY IF EXISTS process_messages_insert ON public.process_messages;
CREATE POLICY process_messages_insert ON public.process_messages FOR INSERT TO authenticated
  WITH CHECK (public.current_user_ativo() AND user_id = auth.uid());

-- Janela de edição de 20 s também no banco, não só na tela
DROP POLICY IF EXISTS process_messages_update ON public.process_messages;
CREATE POLICY process_messages_update ON public.process_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND created_at > now() - INTERVAL '20 seconds');

DROP POLICY IF EXISTS process_messages_delete ON public.process_messages;
CREATE POLICY process_messages_delete ON public.process_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.current_user_grupo() = 'adm');

-- process_documents
DROP POLICY IF EXISTS process_documents_select ON public.process_documents;
CREATE POLICY process_documents_select ON public.process_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS process_documents_insert ON public.process_documents;
CREATE POLICY process_documents_insert ON public.process_documents
  FOR INSERT TO authenticated WITH CHECK (public.current_user_ativo());

DROP POLICY IF EXISTS process_documents_delete ON public.process_documents;
CREATE POLICY process_documents_delete ON public.process_documents FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.current_user_grupo() = 'adm');

-- app_settings
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS app_settings_write ON public.app_settings;
CREATE POLICY app_settings_write ON public.app_settings FOR ALL TO authenticated
  USING (public.current_user_grupo() = 'adm')
  WITH CHECK (public.current_user_grupo() = 'adm');

-- recurring_task_templates
DROP POLICY IF EXISTS recurring_task_templates_select ON public.recurring_task_templates;
CREATE POLICY recurring_task_templates_select ON public.recurring_task_templates FOR SELECT TO authenticated
  USING (
    public.current_user_ativo()
    AND (
      public.current_user_grupo() = 'adm'
      OR projeto_id IN (
        SELECT up.projeto_id FROM public.user_projetos up
        JOIN public.user_profiles prof ON prof.id = up.user_profile_id
        WHERE prof.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS recurring_task_templates_insert ON public.recurring_task_templates;
CREATE POLICY recurring_task_templates_insert ON public.recurring_task_templates
  FOR INSERT TO authenticated WITH CHECK (public.current_user_ativo());

DROP POLICY IF EXISTS recurring_task_templates_delete ON public.recurring_task_templates;
CREATE POLICY recurring_task_templates_delete ON public.recurring_task_templates FOR DELETE TO authenticated
  USING (
    public.current_user_grupo() = 'adm'
    OR created_by = auth.uid()
    OR created_by IS NULL
  );

-- ---------------------------------------------------------------------
-- 4) Storage — bucket privado de anexos (50 MB)
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'process-documents', 'process-documents', false, 52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = false;

DROP POLICY IF EXISTS process_documents_storage_select ON storage.objects;
CREATE POLICY process_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'process-documents');

DROP POLICY IF EXISTS process_documents_storage_insert ON storage.objects;
CREATE POLICY process_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'process-documents');

DROP POLICY IF EXISTS process_documents_storage_delete ON storage.objects;
CREATE POLICY process_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'process-documents');
