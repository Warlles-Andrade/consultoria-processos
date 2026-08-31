# CEP Consultoria — Processos

Sistema de gestão para o setor de **consultoria fiscal/jurídica**: levantamento
de créditos tributários, habilitação (e-CredAc), PER/DCOMP e contencioso
administrativo e judicial.

Nasceu de uma cópia do **Workive** (gestor de processos/tarefas multi-tenant) e
está sendo estendido com uma camada fiscal. A camada de tarefas continua
funcionando e é a parte operacional; a camada fiscal é a parte de valores,
protocolos e prazos legais.

## Stack

React 19 + Vite 7 + TailwindCSS 3 + Radix UI + Framer Motion + Recharts +
Supabase (Postgres com RLS, Auth, Storage) + XLSX + Nodemailer em funções
serverless da Vercel.

## Arquitetura em duas camadas

```
clientes → projetos → processos (tarefas: status, prazo, kanban, chat, anexos)
                          │
                          └── credito_id ─┐
                                          │
contribuintes (CNPJ) ── creditos ─────────┤
                            ├── credito_movimentos  (razão: saldo = ΣC − ΣD)
                            ├── habilitacoes        (e-CredAc CAT 207/83)
                            ├── perdcomps           (federal) ── perdcomp_debitos
                            ├── processos_administrativos (DRJ/CARF/CSRF, TIT, TAT/MS)
                            └── processos_judiciais (CNJ, trânsito em julgado)

andamentos  → linha do tempo + prazos fatais de qualquer entidade acima
```

### Regras que não devem ser quebradas

- **`projeto_id` é o eixo de permissão.** Toda tabela fiscal carrega
  `projeto_id` e sua RLS é `fiscal_can_access_projeto(projeto_id)` — a mesma
  lógica de `processos`. Tabela fiscal nova sem `projeto_id` fica invisível ou
  vaza dados.
- **Saldo de crédito nunca é gravado em coluna.** É derivado de
  `credito_movimentos` pela view `v_credito_saldos`. Movimento de natureza `C`
  soma, `D` subtrai.
- **Contribuinte e projeto de habilitações/PER/DCOMP/contencioso vêm do
  crédito**, nunca são digitados em separado — evita divergência.
- **Prazos legais são colunas geradas**, não calculadas no frontend:
  `creditos.data_limite_prescricao` (base + 5 anos),
  `perdcomps.data_limite_homologacao` (transmissão + 5 anos),
  `processos_judiciais.prazo_compensacao` (trânsito + 5 anos).
  Nunca enviar essas colunas no payload de escrita.
- **`src/data/fiscalDomain.js` espelha os CHECK constraints do banco.** Mudou a
  lista lá, mude o CHECK na migration — e vice-versa. Divergência vira erro
  23514 no insert em vez de validação amigável.
- **Valores monetários**: `numeric(18,2)` no banco, `Number` no JS. Nunca float
  no banco, nunca string formatada no payload — `CurrencyInput` já devolve
  `Number`.

## Mapa de arquivos

| Caminho | Conteúdo |
| --- | --- |
| `sql/LEIA-ME.md` | Como aplicar as migrations no Supabase (ordem obrigatória) |
| `sql/2026-08-28_0*.sql` | Migrations do módulo fiscal |
| `src/data/fiscalDomain.js` | Catálogo de opções, cores, severidade de prazo e formatadores (CNPJ, moeda, competência, CNJ) |
| `src/lib/fiscalApi.js` | Acesso a dados do módulo fiscal (carimbo de auditoria, limpeza de colunas geradas e joins) |
| `src/components/Contribuintes*`, `Credito*`, `Habilitac*`, `Perdcomp*` | Telas fiscais |
| `src/lib/fiscalExport.js` | Planilhas Excel (moeda como número com formato de célula, nunca texto) |
| `src/components/ui/currency-input.jsx`, `kpi-card.jsx` | Primitivas criadas para o módulo fiscal |
| `DOCUMENTACAO_COMPLETA_SISTEMA.md` | Documentação das duas camadas (seções 13–18 = fiscal) |

## Estado atual

Pronto: contribuintes, créditos (razão e prescrição), e-CredAc, PER/DCOMP,
contencioso administrativo e judicial, painel consolidado de prazos, painel
fiscal com gráficos, exportação Excel de todos os módulos e vínculo das tarefas
a um crédito.

**Nada foi testado contra um banco real** — as migrations em `sql/` ainda
precisam ser aplicadas no Supabase pelo usuário (ver `sql/LEIA-ME.md`).

### Gráficos

Ao mexer em gráfico, carregue a skill `dataviz` antes. A paleta em
`FiscalDashboard.jsx` já foi validada para as superfícies reais do app
(`#fdfdfd` claro / `#232326` escuro) em `--pairs all` nos dois modos.
Séries únicas usam **um só tom** — cor que não carrega informação é ruído.

Cuidado conhecido: o `<LabelList>` do Recharts quebra o texto em várias linhas
quando a barra é curta (deriva a largura do próprio retângulo). Por isso o
rótulo de valor é um `<text>` desenhado à mão em `RotuloValor`.

### Compatibilidade com bancos sem as migrations

`ProcessForm` só envia `credito_id` quando a consulta a `creditos` responde sem
erro. Mantenha essa blindagem: sem ela, quem não aplicou a migration 03 tem o
salvamento de qualquer tarefa quebrado por coluna desconhecida.

## Projeto de referência (consulta)

O sistema de origem continua em:

```
C:\Users\Warlles\OneDrive\Documentos\Claude\Projects\sistema_processos
```

É material de **consulta apenas** — não alterar arquivos lá a partir deste
projeto, salvo pedido explícito. Útil para comparar comportamento da camada de
tarefas antes de mudanças.
