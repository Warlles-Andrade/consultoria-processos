# Como aplicar as migrations no Supabase

As telas novas (Contribuintes, Créditos, e-CredAc, PER/DCOMP) só funcionam
depois que as tabelas existirem no banco. É copiar e colar, **uma vez só**.

## Passo a passo

1. Abra o painel do Supabase do projeto e vá em **SQL Editor** (menu lateral).
2. Clique em **New query**.
3. Abra o primeiro arquivo da lista abaixo, copie **todo** o conteúdo e cole no editor.
4. Clique em **Run**. Deve aparecer `Success. No rows returned`.
5. Repita para o segundo e o terceiro arquivo, **nessa ordem**.

## Ordem obrigatória

| # | Arquivo | O que cria |
| --- | --- | --- |
| 1 | `2026-08-28_01_fiscal_base.sql` | `contribuintes`, `creditos`, `credito_movimentos`, `andamentos` e as funções de permissão |
| 2 | `2026-08-28_02_fiscal_habilitacao_perdcomp.sql` | `habilitacoes` (CAT 207/83), `perdcomps`, `perdcomp_debitos` |
| 3 | `2026-08-28_03_fiscal_contencioso_e_views.sql` | `processos_administrativos`, `processos_judiciais`, o vínculo com as tarefas e as views `v_credito_saldos` e `v_prazos_criticos` |

> A ordem importa: o arquivo 2 usa funções criadas no 1, e o 3 usa tabelas
> criadas no 1 e no 2.

## É seguro rodar de novo?

Sim. Todos os comandos são idempotentes (`CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de recriar). Rodar duas
vezes não duplica nada nem apaga dados.

## Como conferir se deu certo

No **Table Editor** devem aparecer estas 9 tabelas novas:

```
andamentos            creditos              perdcomp_debitos
contribuintes         credito_movimentos    perdcomps
habilitacoes          processos_administrativos   processos_judiciais
```

Ou rode no SQL Editor:

```sql
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in (
     'contribuintes','creditos','credito_movimentos','andamentos',
     'habilitacoes','perdcomps','perdcomp_debitos',
     'processos_administrativos','processos_judiciais')
 order by table_name;
```

Devem voltar 9 linhas.

## Requisito de versão

As views usam `security_invoker`, disponível a partir do **PostgreSQL 15**.
Projetos Supabase criados de 2023 em diante já atendem. Para conferir:

```sql
show server_version;
```

Se retornar 14 ou menos, avise — as views precisam de outra abordagem para
não furar as regras de acesso por projeto.

## Primeiros passos no sistema

Depois de aplicar o SQL, a ordem de cadastro é:

1. **Contribuintes** — cadastre os CNPJs (é o que amarra tudo).
2. **Créditos** — cada levantamento, com valor e data-base da prescrição.
3. **e-CredAc** / **PER/DCOMP** — partem sempre de um crédito já cadastrado.

O contribuinte precisa estar num **cliente** que tenha ao menos um **projeto**,
porque é o projeto que define quem enxerga o quê (mesma regra das tarefas).
