-- 2026-07-20 — Posse e compartilhamento de projetos por membros
-- Admin cria clientes (inalterado). Membro cria projetos nos clientes que acessa.
-- Projeto criado por membro é visível só ao criador + convidados (user_projetos) + admin.

-- 1) Corrigir is_user_admin(): tabela 'grupos' foi renomeada para 'clientes'
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN clientes c ON c.nome = up.grupo
    WHERE up.user_id = auth.uid() AND c.is_admin = true
  );
$$;

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM user_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- true se o perfil "pertence" ao cliente (grupo primário OU acessa algum projeto do cliente)
CREATE OR REPLACE FUNCTION public.profile_can_access_cliente(p_profile uuid, p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- 3) Coluna de posse em projetos + backfill (existentes = admin)
ALTER TABLE projetos ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE projetos ALTER COLUMN created_by SET DEFAULT auth.uid();
UPDATE projetos SET created_by = '019f59de-49c9-40e4-9d10-cb8f697d2010'
  WHERE created_by IS NULL;

-- 4) RLS projetos: trocar policies abertas por posse/compartilhamento
DROP POLICY IF EXISTS "Todos autenticados podem ver projetos" ON projetos;
DROP POLICY IF EXISTS "Autenticados podem inserir projetos" ON projetos;
DROP POLICY IF EXISTS "Autenticados podem atualizar projetos" ON projetos;
DROP POLICY IF EXISTS "Autenticados podem deletar projetos" ON projetos;

CREATE POLICY "projetos_select" ON projetos FOR SELECT
  USING (
    is_user_admin()
    OR created_by = auth.uid()
    OR id IN (SELECT projeto_id FROM user_projetos WHERE user_profile_id = current_profile_id())
  );

CREATE POLICY "projetos_insert" ON projetos FOR INSERT
  WITH CHECK (
    is_user_admin()
    OR (created_by = auth.uid() AND profile_can_access_cliente(current_profile_id(), cliente_id))
  );

CREATE POLICY "projetos_update" ON projetos FOR UPDATE
  USING (is_user_admin() OR created_by = auth.uid())
  WITH CHECK (is_user_admin() OR created_by = auth.uid());

CREATE POLICY "projetos_delete" ON projetos FOR DELETE
  USING (is_user_admin() OR created_by = auth.uid());

-- 5) RLS user_projetos: manter SELECT aberto (mapa de responsáveis depende disso),
--    apertar INSERT/DELETE para dono do projeto (ou admin), alvo do mesmo cliente
DROP POLICY IF EXISTS "Autenticados podem inserir user_projetos" ON user_projetos;
DROP POLICY IF EXISTS "Autenticados podem deletar user_projetos" ON user_projetos;

CREATE POLICY "user_projetos_insert" ON user_projetos FOR INSERT
  WITH CHECK (
    is_user_admin()
    OR (
      projeto_id IN (SELECT id FROM projetos WHERE created_by = auth.uid())
      AND profile_can_access_cliente(
        user_profile_id,
        (SELECT cliente_id FROM projetos WHERE id = projeto_id)
      )
    )
  );

CREATE POLICY "user_projetos_delete" ON user_projetos FOR DELETE
  USING (
    is_user_admin()
    OR projeto_id IN (SELECT id FROM projetos WHERE created_by = auth.uid())
    OR user_profile_id = current_profile_id()  -- membro pode sair de um projeto
  );
