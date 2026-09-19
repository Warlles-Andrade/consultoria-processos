# Migrations — ordem e estado

## Estado atual

**As migrations 1 a 9 e 11 já foram aplicadas** no projeto Supabase
`processos_bd` (`xiafwlpnsoyklutxsvdy`, região sa-east-1, PostgreSQL 17.6):
1–7 em 31/08/2026, 8–9 em 18/09/2026, 11 em 19/09/2026. A **10 é opcional e ainda não foi
aplicada** (ver abaixo).

Resultado verificado no banco em 18/09/2026: **28 tabelas**, 3 views,
90 políticas de RLS (ativa em todas as tabelas) e 1 bucket de Storage.
Depois da migration 10: 26 tabelas e 84 políticas.

Os arquivos ficam aqui para reprodutibilidade — recriar o sistema em outro
projeto Supabase é rodar esta lista na ordem.

## Ordem obrigatória

| # | Arquivo | O que cria |
| --- | --- | --- |
| 1 | `2026-08-31_00_base_camada_tarefas.sql` | Camada operacional: `clientes`, `projetos`, `user_profiles`, `user_projetos`, `responsaveis`, `responsavel_projetos`, `recurring_task_templates`, `processos`, `process_messages`, `process_documents`, `process_history`, `app_settings` |
| 2 | `2026-08-31_01_base_funcoes_rls_storage.sql` | Funções de autorização, trigger de signup, RPCs, todas as políticas de RLS da camada operacional e o bucket `process-documents` |
| 3 | `2026-08-28_01_fiscal_base.sql` | `contribuintes`, `creditos`, `credito_movimentos`, `andamentos` |
| 4 | `2026-08-28_02_fiscal_habilitacao_perdcomp.sql` | `habilitacoes` (CAT 207/83), `perdcomps`, `perdcomp_debitos` |
| 5 | `2026-08-28_03_fiscal_contencioso_e_views.sql` | `processos_administrativos`, `processos_judiciais`, vínculo `processos.credito_id`, views `v_credito_saldos` e `v_prazos_criticos` |
| 6 | `2026-08-31_02_endurecimento_funcoes.sql` | `search_path` fixo nas funções `SECURITY DEFINER` e revogação de execução para `anon` (apontado pelo linter do Supabase) |
| 7 | `2026-08-31_03_bootstrap_primeiro_admin.sql` | O primeiro usuário vira `adm` enquanto não existir nenhum administrador; depois a regra se desliga |
| 8 | `2026-09-18_01_perdcomp_conta_corrente.sql` | Controle PER/DCOMP por crédito: `perdcomp_creditos`, `perdcomp_composicao`, `perdcomp_per_versoes`, `perdcomp_dcomps`, `perdcomp_dcomp_debitos`, `perdcomp_eventos`, `selic_mensal` e a view `v_perdcomp_saldos` |
| 9 | `2026-09-18_02_perdcomp_prazos_modelo_novo.sql` | Recria `v_prazos_criticos` com os prazos do controle novo (homologação tácita e manifestação de inconformidade, derivados das DCOMPs e dos eventos) |
| 11 | `2026-09-19_01_ecredac_conta_corrente.sql` | e-CredAc: `ecredac_contas`, `ecredac_movimentos` (extrato), `ecredac_faturamentos` (boletos de honorários), `ecredac_arquivos` (arquivos do mês), view `v_ecredac_saldos` e campos do pedido em `habilitacoes` |
| 10 | `2026-09-18_03_perdcomp_remove_modelo_antigo.sql` | **Opcional.** Apaga `perdcomps` e `perdcomp_debitos` (modelo antigo, sem uso). Só executa se ambas estiverem vazias |

> **Migration 10:** as tabelas antigas estavam vazias em 18/09/2026 e a
> aplicação não as usa mais. A remoção ficou para decisão da equipe por ser
> irreversível; mantê-las não quebra nada. Num projeto novo, pode pular a
> 10 — ou aplicá-la logo depois da 9.

> A numeração dos arquivos fiscais (28/08) é anterior à da base (31/08) porque
> eles foram escritos antes — mas **a base tem que vir primeiro**, já que as
> tabelas fiscais referenciam `clientes`, `projetos` e `user_profiles`.

## Como aplicar num projeto novo

Painel do Supabase → **SQL Editor** → **New query** → cola o arquivo → **Run**.
Repetir na ordem da tabela acima.

Tudo é idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS` antes de recriar). Rodar de novo não duplica nem apaga.

## Requisito de versão

As views usam `security_invoker`, disponível a partir do **PostgreSQL 15** —
sem isso a view enxergaria tudo, furando as regras de acesso por projeto.
Para conferir: `show server_version;`

## Configuração obrigatória pós-instalação

O sistema precisa de um cliente chamado `adm` marcado como administrador —
é dele que a função `is_user_admin()` depende:

```sql
insert into clientes (nome, descricao, cor, is_admin)
values ('adm', 'Administradores do sistema', '#dc2626', true)
on conflict (nome) do update set is_admin = true;
```

*(Já executado no projeto atual.)*

## Primeiro acesso

O banco começa sem nenhum usuário. Para criar o primeiro:

1. Supabase → **Authentication** → **Users** → **Add user**
   (marque *Auto Confirm User*, senão o login fica bloqueado por e-mail não confirmado)
2. O trigger `handle_new_user()` cria o perfil automaticamente, mas com
   `grupo = 'sem_grupo'` — é uma proteção contra auto-promoção a admin.
3. Promova esse perfil a administrador:

```sql
update user_profiles
   set grupo = 'adm', ativo = true
 where user_id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
```

## Como conferir se está tudo de pé

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE')  as tabelas,      -- 28 (26 após a 10)
  (select count(*) from information_schema.views
    where table_schema='public')                              as views,        -- 3
  (select count(*) from pg_policies where schemaname='public') as policies,    -- 90 (84 após a 10)
  (select count(*) from storage.buckets)                       as buckets;     -- 1
```

## Ordem de cadastro no sistema

1. **Clientes** → **Projetos** → **Usuários** (camada operacional)
2. **Contribuintes** (CNPJ)
3. **Créditos**
4. **e-CredAc** e **Contencioso** — partem de um crédito ou contribuinte já cadastrado
5. **PER/DCOMP** — parte do contribuinte: importe o controle (HTML/JSON), leia
   o PDF com IA ou registre o PER à mão. O crédito PER/DCOMP nasce do PER.

O contribuinte precisa estar num cliente que tenha ao menos um projeto: é o
projeto que define quem enxerga o quê, tanto nas tarefas quanto no fiscal.
