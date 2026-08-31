-- Tarefas Recorrentes: molde de recorrencia + vinculo nas tarefas geradas.
-- Geracao é em lote no momento do cadastro (sem cron/servico agendado):
-- ao criar o molde, o frontend calcula as datas e insere uma linha em `processos`
-- para cada ocorrencia, todas apontando para o molde via `parent_recurring_id`.

CREATE TABLE IF NOT EXISTS public.recurring_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa text NOT NULL,
  prioridade text,
  observacoes text,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  responsavel_user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  responsavel_nome text NOT NULL,
  responsavel_email text,
  frequencia text NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'mensal', 'personalizada')),
  intervalo_valor int,
  intervalo_unidade text CHECK (intervalo_unidade IN ('dias', 'semanas', 'meses')),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  total_ocorrencias int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_task_templates_data_fim_check CHECK (data_fim > data_inicio),
  CONSTRAINT recurring_task_templates_personalizada_check CHECK (
    frequencia <> 'personalizada' OR (intervalo_valor IS NOT NULL AND intervalo_unidade IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_recurring_task_templates_projeto_id ON public.recurring_task_templates(projeto_id);
CREATE INDEX IF NOT EXISTS idx_recurring_task_templates_created_by ON public.recurring_task_templates(created_by);

ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS parent_recurring_id uuid REFERENCES public.recurring_task_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_processos_parent_recurring_id ON public.processos(parent_recurring_id);

COMMENT ON COLUMN public.processos.parent_recurring_id IS
  'Se preenchido, indica que esta tarefa foi gerada em lote a partir de um molde em recurring_task_templates.';

ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: mesma logica de processos (usuario ativo + admin OU acesso ao projeto)
CREATE POLICY recurring_task_templates_select ON public.recurring_task_templates
FOR SELECT USING (
  (SELECT ativo FROM public.user_profiles WHERE user_id = auth.uid()) = true
  AND (
    (SELECT grupo FROM public.user_profiles WHERE user_id = auth.uid()) = 'adm'
    OR projeto_id IN (
      SELECT up.projeto_id FROM public.user_projetos up
      INNER JOIN public.user_profiles prof ON prof.id = up.user_profile_id
      WHERE prof.user_id = auth.uid()
    )
  )
);

-- INSERT: qualquer usuario ativo (mesma filosofia liberada para processos em 2026-06-09)
CREATE POLICY recurring_task_templates_insert ON public.recurring_task_templates
FOR INSERT WITH CHECK (
  (SELECT ativo FROM public.user_profiles WHERE user_id = auth.uid()) = true
);

-- DELETE: admin OU criador OU registros sem criador
CREATE POLICY recurring_task_templates_delete ON public.recurring_task_templates
FOR DELETE USING (
  (SELECT grupo FROM public.user_profiles WHERE user_id = auth.uid()) = 'adm'
  OR created_by = auth.uid()
  OR created_by IS NULL
);
