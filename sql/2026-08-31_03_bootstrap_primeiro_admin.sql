-- =====================================================================
-- Bootstrap do primeiro acesso
--
-- O sistema nasce sem nenhum usuário, e a proteção contra auto-promoção
-- faz todo perfil novo virar 'sem_grupo' — o que deixaria o primeiro
-- usuário preso na tela de "Acesso Pendente", sem ninguém para liberá-lo.
--
-- A regra abaixo resolve isso e SE DESLIGA SOZINHA: só concede 'adm'
-- enquanto não existir nenhum administrador. Criado o primeiro, a
-- proteção original volta a valer para todos os seguintes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome         text;
  v_grupo        text;
  v_existe_admin boolean;
BEGIN
  v_nome  := COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1));
  v_grupo := NEW.raw_user_meta_data ->> 'grupo';

  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE grupo = 'adm')
    INTO v_existe_admin;

  IF NOT v_existe_admin THEN
    -- Primeiro usuário do sistema: nasce administrador.
    v_grupo := 'adm';
  ELSIF v_grupo IS NULL OR btrim(v_grupo) = '' OR v_grupo = 'adm' THEN
    -- Daqui em diante ninguém se auto-promove.
    v_grupo := 'sem_grupo';
  END IF;

  INSERT INTO public.user_profiles (user_id, nome, grupo, ativo)
  VALUES (NEW.id, v_nome, v_grupo, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
