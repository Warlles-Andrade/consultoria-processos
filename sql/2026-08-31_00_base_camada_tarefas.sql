-- =====================================================================
-- CEP Consultoria — Camada Operacional (tarefas) — FUNDAÇÃO
--
-- Reconstrói do zero o schema herdado do Workive, que nunca existiu como
-- arquivo de migration (foi criado à mão no Supabase original).
--
-- Representa o ESTADO ATUAL da camada de tarefas, já incluindo o que as
-- migrations de 2026-05 a 2026-07 acrescentaram — não replica o histórico:
--   * cadeado de edição: colunas mantidas, trigger removido (2026-06-09)
--   * tarefas recorrentes (2026-07-14)
--   * posse de projetos por membro (2026-07-20)
--
-- APLICAR ANTES das migrations fiscais 2026-08-28_0{1,2,3}.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) clientes  (a UI ainda chama de "grupos" em alguns componentes)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clientes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       varchar(255) NOT NULL UNIQUE,
  descricao  text DEFAULT '',
  cor        varchar(20) DEFAULT '#6366f1',
  is_admin   boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE  public.clientes IS 'Clientes da consultoria — o tenant. is_admin marca o grupo administrativo.';
COMMENT ON COLUMN public.clientes.is_admin IS 'True apenas no grupo "adm"; is_user_admin() depende disso.';

-- ---------------------------------------------------------------------
-- 2) projetos
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.projetos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome       varchar(255) NOT NULL,
  descricao  text DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT projetos_cliente_nome_unico UNIQUE (cliente_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_projetos_cliente_id ON public.projetos(cliente_id);

-- ---------------------------------------------------------------------
-- 3) user_profiles
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo      varchar(255) NOT NULL,
  nome       varchar(255),
  ativo      boolean DEFAULT true,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.user_profiles.grupo IS
  '''adm'' para administradores, nome do cliente para comuns, ''pendente'' enquanto não atribuído.';
COMMENT ON COLUMN public.user_profiles.projeto_id IS 'Legado — o vínculo real é N:N em user_projetos.';

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id    ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_grupo      ON public.user_profiles(grupo);
CREATE INDEX IF NOT EXISTS idx_user_profiles_projeto_id ON public.user_profiles(projeto_id);

-- ---------------------------------------------------------------------
-- 4) user_projetos  (N:N usuário ↔ projeto — é o que a RLS consulta)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_projetos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT user_projetos_unico UNIQUE (user_profile_id, projeto_id)
);

CREATE INDEX IF NOT EXISTS idx_user_projetos_user_profile_id ON public.user_projetos(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_projetos_projeto_id      ON public.user_projetos(projeto_id);

-- ---------------------------------------------------------------------
-- 5) responsaveis + responsavel_projetos
--    Espelho de user_profiles mantido por retrocompatibilidade: o embed
--    `responsavel:responsaveis(nome)` em processos depende desta tabela.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.responsaveis (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text,
  email      text,
  grupo      text,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_responsaveis_projeto_id ON public.responsaveis(projeto_id);
CREATE INDEX IF NOT EXISTS idx_responsaveis_created_by ON public.responsaveis(created_by);

CREATE TABLE IF NOT EXISTS public.responsavel_projetos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsavel_id uuid NOT NULL REFERENCES public.responsaveis(id) ON DELETE CASCADE,
  projeto_id     uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT responsavel_projetos_unico UNIQUE (responsavel_id, projeto_id)
);

CREATE INDEX IF NOT EXISTS idx_responsavel_projetos_responsavel_id ON public.responsavel_projetos(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_responsavel_projetos_projeto_id     ON public.responsavel_projetos(projeto_id);

-- ---------------------------------------------------------------------
-- 6) recurring_task_templates  (moldes de tarefa recorrente)
--    Precisa vir antes de `processos`, que referencia o molde.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recurring_task_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa                      text NOT NULL,
  prioridade                  text,
  observacoes                 text,
  projeto_id                  uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  cliente_id                  uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome            text NOT NULL,
  responsavel_email           text,
  frequencia                  text NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'mensal', 'personalizada')),
  intervalo_valor             int,
  intervalo_unidade           text CHECK (intervalo_unidade IN ('dias', 'semanas', 'meses')),
  data_inicio                 date NOT NULL,
  data_fim                    date NOT NULL,
  total_ocorrencias           int NOT NULL DEFAULT 0,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name             text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_task_templates_data_fim_check CHECK (data_fim > data_inicio),
  CONSTRAINT recurring_task_templates_personalizada_check CHECK (
    frequencia <> 'personalizada' OR (intervalo_valor IS NOT NULL AND intervalo_unidade IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_recurring_task_templates_projeto_id ON public.recurring_task_templates(projeto_id);
CREATE INDEX IF NOT EXISTS idx_recurring_task_templates_created_by ON public.recurring_task_templates(created_by);

-- ---------------------------------------------------------------------
-- 7) processos — a tarefa
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.processos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa              text NOT NULL,
  status              varchar(50) DEFAULT 'Não Iniciado',
  prioridade          varchar(20) DEFAULT 'Média',

  responsavel_id      uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL,
  responsavel_nome    text,
  email               text,

  cliente             text,
  grupo               varchar(255),
  projeto_id          uuid REFERENCES public.projetos(id) ON DELETE SET NULL,

  data_inicio         date,
  prazo               date,
  dias_processo       integer,
  prazo_historico     jsonb DEFAULT '[]'::jsonb,
  observacoes         text,

  -- Campos legados do cadeado de edição: o trigger foi removido em
  -- 2026-06-09, mas o frontend ainda envia estas colunas no payload.
  is_edit_locked      boolean NOT NULL DEFAULT false,
  edit_locked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edit_locked_at      timestamptz,

  parent_recurring_id uuid REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL,

  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name     varchar(255),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name     varchar(255),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.processos.responsavel_id IS
  'Só existe para o embed responsavel:responsaveis(nome) resolver; o nome real fica em responsavel_nome.';
COMMENT ON COLUMN public.processos.is_edit_locked IS
  'Campo legado. A edição é permitida a qualquer usuário ativo com acesso ao processo.';
COMMENT ON COLUMN public.processos.prazo_historico IS
  'Replanejamentos: [{data_anterior, data_nova, justificativa, alterado_em, alterado_por}]';

CREATE INDEX IF NOT EXISTS idx_processos_grupo               ON public.processos(grupo);
CREATE INDEX IF NOT EXISTS idx_processos_created_by          ON public.processos(created_by);
CREATE INDEX IF NOT EXISTS idx_processos_updated_by          ON public.processos(updated_by);
CREATE INDEX IF NOT EXISTS idx_processos_prazo               ON public.processos(prazo);
CREATE INDEX IF NOT EXISTS idx_processos_projeto_id          ON public.processos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_processos_data_inicio         ON public.processos(data_inicio);
CREATE INDEX IF NOT EXISTS idx_processos_parent_recurring_id ON public.processos(parent_recurring_id);

-- ---------------------------------------------------------------------
-- 8) process_messages / process_documents / process_history
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.process_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id   uuid REFERENCES public.processos(id) ON DELETE CASCADE,
  user_id      uuid,
  user_name    text,
  user_group   varchar(255) DEFAULT '',
  user_cliente text,
  message      text,
  edited       boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_process_messages_process_id ON public.process_messages(process_id);

CREATE TABLE IF NOT EXISTS public.process_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id       uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  filename         text NOT NULL,
  storage_path     text NOT NULL,
  file_size        bigint,
  content_type     text,
  uploaded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_documents_process_id ON public.process_documents(process_id);

CREATE TABLE IF NOT EXISTS public.process_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id      uuid NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  action          varchar(50) CHECK (action IN ('created', 'updated', 'status_changed', 'deleted')),
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name varchar(255),
  old_values      jsonb,
  new_values      jsonb,
  changes_summary text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_history_process_id ON public.process_history(process_id);
CREATE INDEX IF NOT EXISTS idx_process_history_changed_by ON public.process_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_process_history_created_at ON public.process_history(created_at DESC);

-- ---------------------------------------------------------------------
-- 9) app_settings — configurações globais chave/valor
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES ('gantt_enabled_for_all', 'false')
ON CONFLICT (key) DO NOTHING;
