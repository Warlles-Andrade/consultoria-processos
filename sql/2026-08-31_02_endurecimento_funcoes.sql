-- =====================================================================
-- Endurecimento das funções — apontado pelo linter de segurança do Supabase
--
-- Aplicar DEPOIS de todas as outras migrations.
--
-- Dois problemas corrigidos:
--
-- 1) search_path mutável em funções SECURITY DEFINER.
--    A função roda com os privilégios de quem a criou. Se o search_path
--    vier do chamador, um schema malicioso na frente de `public` sequestra
--    as referências de tabela e executa com privilégio elevado.
--
-- 2) Funções expostas em /rest/v1/rpc para quem nem fez login.
--    get_user_profiles_with_email devolve o e-mail de TODOS os usuários —
--    era a mais grave. As funções de trigger não devem ser chamáveis por
--    ninguém via API.
-- =====================================================================

ALTER FUNCTION public.fiscal_can_access_projeto(uuid) SET search_path = public;
ALTER FUNCTION public.fiscal_can_access_cliente(uuid) SET search_path = public;
ALTER FUNCTION public.fiscal_is_admin()               SET search_path = public;
ALTER FUNCTION public.fiscal_touch_updated_at()       SET search_path = public;
ALTER FUNCTION public.creditos_set_codigo()           SET search_path = public;

-- Funções de trigger: ninguém chama pela API.
REVOKE ALL ON FUNCTION public.handle_new_user()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiscal_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creditos_set_codigo()     FROM PUBLIC, anon, authenticated;

-- Auxiliares de autorização: só autenticado.
REVOKE ALL ON FUNCTION public.is_user_admin()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_profile_id()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_ativo()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_grupo()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_can_access_cliente(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiscal_can_access_projeto(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiscal_can_access_cliente(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiscal_is_admin()                      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_user_admin()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_ativo()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_grupo()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_can_access_cliente(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_can_access_projeto(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_can_access_cliente(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_is_admin()                      TO authenticated;

REVOKE ALL   ON FUNCTION public.get_user_profiles_with_email()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profiles_with_email()   TO authenticated;

REVOKE ALL   ON FUNCTION public.create_user_profile_safe(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile_safe(uuid, text, text) TO authenticated;

-- Conferência: anon_pode deve vir false em todas as 13 linhas.
--
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_pode,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado_pode,
--        array_to_string(p.proconfig, ',')                         as config
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' order by p.proname;
