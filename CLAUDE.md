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
                            ├── processos_administrativos (DRJ/CARF/CSRF, TIT, TAT/MS)
                            └── processos_judiciais (CNJ, trânsito em julgado)

andamentos  → linha do tempo + prazos fatais de qualquer entidade acima

contribuintes ── perdcomp_creditos  (id_credito_rfb = nº do PER original)
                    ├── perdcomp_composicao
                    ├── perdcomp_per_versoes  (original + retificadores; 1 vigente)
                    └── perdcomp_dcomps ── perdcomp_dcomp_debitos
perdcomp_eventos (fase na RFB) · selic_mensal (global)

contribuintes ── ecredac_contas (1 por IE)
                    ├── ecredac_movimentos   (extrato: C soma, D subtrai, * informativo)
                    ├── ecredac_faturamentos (boletos de honorários)
                    └── ecredac_arquivos     (arquivo digital do mês)
habilitacoes = pedidos do e-CredAc (casados com as apropriações pelo nº do pedido)
```

As tabelas `perdcomps`/`perdcomp_debitos` são do modelo antigo, sem uso;
a migration opcional `2026-09-18_03` as remove (só se vazias).

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
  `processos_judiciais.prazo_compensacao` (trânsito + 5 anos).
  Nunca enviar essas colunas no payload de escrita.
- **`src/data/fiscalDomain.js` espelha os CHECK constraints do banco.** Mudou a
  lista lá, mude o CHECK na migration — e vice-versa. Divergência vira erro
  23514 no insert em vez de validação amigável.
- **PER/DCOMP: toda conta vem de `src/lib/perdcompRegras.js`** (puro, sem
  banco). Saldo = valor do crédito − Σ `credito_utilizado` das DCOMPs
  `ativa`/`retificadora`; retificadas e canceladas não consomem. Fase na
  Receita = último evento de `perdcomp_eventos`, nunca digitada. Mudou uma
  regra, rode `node scripts/verificar-perdcomp-regras.mjs <controle-perdcomp.html>`
  — tem que continuar com 0 divergências contra o protótipo da equipe.
- **Selic por tipo de crédito segue os manuais do PER/DCOMP Web.** Onde o manual
  não define o marco (IPI, salário-família, ação judicial, "Outro"), o sistema
  **não estima**: exige `termo_inicial_correcao`. Não "melhore" isso com chute.
- **Horários do e-CAC são de Brasília sem fuso**: grave com `-03:00` e extraia
  o mês em `America/Sao_Paulo` (`perdcompRegras.mes`). Sem isso a Selic muda.
- **Retificação**: DCOMP retificadora marca a anterior como `retificada`;
  PER retificador vira a versão vigente e atualiza `valor_credito`
  (`perdcompApi.js`). Reimportar o controle casa por chave natural da RFB e
  preserva o que tem `origem = MANUAL`.
- **Leitura de PDF com IA não grava nada**: `api/ler-perdcomp.js` devolve JSON
  e a tela abre `PerdcompDocumentoForm` para revisão humana. Mantenha assim.
- **Dados de cliente fora do git** — o controle real (HTML) e PDFs do e-CAC
  não entram no repositório. Exemplos em código usam números fictícios.
- **e-CredAc: toda conta vem de `src/lib/ecredacRegras.js`.** Saldo = saldo_inicial + ΣC − ΣD ("*" não mexe no saldo). Honorários: devidos = % × (apropriações − reincorporações deferidas); faturável = % × reservas deferidas (consumo do mês); a faturar = faturável − boletos. A operação de cada lançamento é classificada pelo histórico (`classificar`) — histórico novo cai em `OUTRO` e **não entra nos honorários**: inclua a regra em vez de forçar.
- **Valores monetários**: `numeric(18,2)` no banco, `Number` no JS. Nunca float
  no banco, nunca string formatada no payload — `CurrencyInput` já devolve
  `Number`.

## Mapa de arquivos

| Caminho | Conteúdo |
| --- | --- |
| `sql/LEIA-ME.md` | Como aplicar as migrations no Supabase (ordem obrigatória) |
| `sql/2026-08-28_0*.sql`, `sql/2026-09-18_0*.sql` | Migrations do módulo fiscal e do controle PER/DCOMP |
| `src/data/fiscalDomain.js` | Catálogo de opções, cores, severidade de prazo e formatadores (CNPJ, moeda, competência, CNJ) |
| `src/lib/fiscalApi.js` | Acesso a dados do módulo fiscal (carimbo de auditoria, limpeza de colunas geradas e joins) |
| `src/components/Contribuintes*`, `Credito*`, `Habilitac*`, `Perdcomp*` | Telas fiscais |
| `src/lib/fiscalExport.js` | Planilhas Excel (moeda como número com formato de célula, nunca texto) |
| `src/components/ui/currency-input.jsx`, `kpi-card.jsx` | Primitivas criadas para o módulo fiscal |
| `src/components/PerdcompControleView.jsx` | PER/DCOMP: abas por tipo de crédito; Créditos / PER / DCOMP / Alertas |
| `src/components/PerdcompCreditoDetalhe.jsx` | Conta-corrente, composição, versões do PER, Selic, eventos |
| `src/components/PerdcompDocumentoForm.jsx`, `PerdcompImportarDialog.jsx` | Lançar/revisar PER e DCOMP; importar controle HTML/JSON |
| `src/lib/perdcompRegras.js` · `perdcompApi.js` · `perdcompImportar.js` · `perdcompIA.js` | Regras puras · dados · importação · IA→formulário |
| `api/ler-perdcomp.js` | Leitura de PDF com Claude (`claude-opus-5`, JSON por esquema); exige `ANTHROPIC_API_KEY` |
| `scripts/verificar-perdcomp-regras.mjs` | Prova de equivalência das regras contra o protótipo |
| `src/components/EcredacContaView.jsx` | e-CredAc: consumo e faturamento, conta corrente, pedidos × apropriações, arquivos do mês |
| `src/lib/ecredacRegras.js` · `ecredacImportar.js` · `ecredacApi.js` | Regras puras · leitura das planilhas (colunas pelo cabeçalho) · dados |
| `DOCUMENTACAO_COMPLETA_SISTEMA.md` | Documentação das duas camadas (seções 13–18 = fiscal) |

## Estado atual

Pronto: contribuintes, créditos (razão e prescrição), e-CredAc, PER/DCOMP
(controle por crédito com conta-corrente, importação e leitura de PDF por IA),
contencioso administrativo e judicial, painel consolidado de prazos, painel
fiscal com gráficos, exportação Excel de todos os módulos e vínculo das tarefas
a um crédito.

Banco provisionado no Supabase `processos_bd` com as migrations 1–9 de
`sql/LEIA-ME.md` (a 10 é opcional). PER/DCOMP tem dados reais de um cliente
importados. A leitura de PDF com IA **nunca rodou com documento real** — falta
a `ANTHROPIC_API_KEY`.

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
