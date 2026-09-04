# CEP Consultoria — Processos

Sistema de gestão para consultoria fiscal/jurídica: **levantamento de créditos
tributários**, **habilitação e-CredAc** (CAT 207/2009 e CAT 83/2009),
**PER/DCOMP** e **contencioso** administrativo e judicial — sobre uma camada
operacional de tarefas com kanban, prazos, chat e anexos.

> **Leia antes de mexer:** [`CLAUDE.md`](CLAUDE.md) tem as invariantes do
> projeto — as regras que, se quebradas, geram dado errado ou vazamento entre
> clientes. [`DOCUMENTACAO_COMPLETA_SISTEMA.md`](DOCUMENTACAO_COMPLETA_SISTEMA.md)
> é a documentação funcional completa (seções 13–18 = módulo fiscal).

---

## Estado da entrega

| Item | Situação |
| --- | --- |
| Código das duas camadas | Completo, build passando |
| Banco de dados | Provisionado e verificado no Supabase `processos_bd` |
| Migrations | 8 arquivos em [`sql/`](sql/), todos aplicados |
| Segurança | RLS em todas as 21 tabelas; funções endurecidas após linter |
| Rodando | Local (`npm run dev`) |
| **Publicação (deploy)** | **Pendente** — ver [Deploy](#deploy) |
| **Testes automatizados** | **Não existem** — ver [Riscos conhecidos](#riscos-conhecidos) |

---

## Stack

React 19 · Vite 7 · TailwindCSS 3 · Radix UI · Framer Motion · Recharts ·
Supabase (Postgres 17 com RLS, Auth, Storage) · XLSX · Nodemailer em funções
serverless da Vercel.

---

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Abre em `http://localhost:5173`.

As duas variáveis estão em **Supabase → Project Settings → API**. A chave
`anon` é pública por natureza (vai no bundle do navegador) — quem protege os
dados é o RLS, não o sigilo dela.

### Primeiro acesso

O banco nasce sem usuários. Crie o primeiro em
**Supabase → Authentication → Users → Add user**, marcando **Auto Confirm User**.

O primeiro usuário do sistema vira administrador automaticamente
(migration `2026-08-31_03`). Essa regra **se desliga sozinha**: a partir do
segundo, todo perfil nasce sem permissão e só um admin libera.

---

## Banco de dados

Passo a passo e ordem obrigatória em [`sql/LEIA-ME.md`](sql/LEIA-ME.md).

**21 tabelas** em duas camadas:

```
clientes → projetos → processos (tarefas)
                          │
                          └── credito_id ─┐
                                          │
contribuintes (CNPJ) ── creditos ─────────┤
                            ├── credito_movimentos   (razão: saldo = ΣC − ΣD)
                            ├── habilitacoes         (e-CredAc CAT 207/83)
                            ├── perdcomps            (federal) ── perdcomp_debitos
                            ├── processos_administrativos (DRJ/CARF/CSRF, TIT, TAT/MS)
                            └── processos_judiciais  (CNJ, trânsito em julgado)

andamentos → linha do tempo + prazos fatais de qualquer entidade acima
```

### Decisões de modelagem que não são acidentais

- **`projeto_id` é o eixo de permissão.** Toda tabela fiscal carrega
  `projeto_id`, e a RLS é `fiscal_can_access_projeto(projeto_id)` — a mesma
  regra das tarefas. Tabela nova sem essa coluna fica invisível ou vaza dados.
- **Saldo de crédito nunca é coluna.** É derivado de `credito_movimentos`
  pela view `v_credito_saldos` (`C` soma, `D` subtrai). Gravar saldo em coluna
  é como o sistema passa a mentir.
- **Prazos legais são colunas geradas pelo banco**, não calculadas no frontend:
  `creditos.data_limite_prescricao` (base + 5 anos),
  `perdcomps.data_limite_homologacao` (transmissão + 5 anos),
  `processos_judiciais.prazo_compensacao` (trânsito + 5 anos).
  **Nunca enviar essas colunas no payload de escrita** — `fiscalApi.js` já as remove.
- **As views usam `security_invoker`** (exige PostgreSQL 15+). Sem isso a view
  enxergaria tudo, furando o isolamento por projeto.
- **`src/data/fiscalDomain.js` espelha os CHECK constraints do banco.** Mudou a
  lista lá, mude o CHECK na migration — e vice-versa. Divergência vira erro
  `23514` no insert em vez de validação amigável.

---

## Mapa do código

| Caminho | Conteúdo |
| --- | --- |
| `src/App.jsx` | Raiz: autenticação, carga de dados, roteamento por abas |
| `src/components/*View.jsx` | Telas fiscais (Créditos, Habilitações, PER/DCOMP, Contencioso, Prazos) |
| `src/components/*Form.jsx` | Formulários correspondentes |
| `src/components/FiscalDashboard.jsx` | Painel com KPIs e gráficos |
| `src/components/AndamentosPanel.jsx` | Linha do tempo reutilizável por todas as entidades |
| `src/lib/fiscalApi.js` | Acesso a dados: carimbo de auditoria, limpeza de colunas geradas e joins |
| `src/lib/fiscalExport.js` | Planilhas Excel (moeda como número com formato de célula) |
| `src/data/fiscalDomain.js` | Catálogo de opções, cores, severidade de prazo, formatadores |
| `api/` | Funções serverless: criar usuário, resetar senha, notificar por e-mail |
| `sql/` | Migrations, na ordem de aplicação |

---

## Deploy

Ainda não publicado. Na Vercel:

1. Importe o repositório
2. Configure em **Settings → Environment Variables**:

| Variável | Observação |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | Chave `anon` |
| `SUPABASE_URL` | Mesma URL, sem prefixo `VITE_` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreta.** Nunca com prefixo `VITE_` — isso a exporia no navegador |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Envio de e-mail (limite de 100/dia no Gmail gratuito) |

3. Em **Supabase → Authentication → URL Configuration**, adicione o domínio da
   Vercel em *Site URL* e *Redirect URLs* — senão o fluxo de recuperação de
   senha volta para `localhost`.

---

## Riscos conhecidos

Levantados honestamente para quem for assumir o código:

1. **Não há testes automatizados.** Nenhum. A verificação feita foi manual:
   build, render dos gráficos, geração das planilhas e um cenário completo
   gravado no banco e conferido (código sequencial, colunas geradas, saldo da
   razão e consolidação de prazos). É o primeiro débito a pagar.

2. **Uso real ainda não aconteceu.** O sistema nunca foi operado por um usuário
   final. A primeira semana de uso vai revelar ajustes.

3. **Bundle único de ~1,8 MB** (≈520 KB comprimido). O Vite avisa. Resolver com
   `manualChunks` no `vite.config.mjs`, separando Recharts e XLSX — ambos são
   pesados e usados em poucas telas.

4. **`orgao_atual` do contencioso é texto livre**, de propósito: cada estado tem
   seu tribunal e a lista muda. As sugestões vivem em `fiscalDomain.js`. Se
   virar necessidade de padronizar, aí sim vale uma tabela de domínio.

5. **`processos` tem colunas legadas** (`is_edit_locked`, `edit_locked_by`,
   `edit_locked_at`) de um cadeado de edição removido em 06/2026. O frontend
   ainda as envia no payload. Remover exige mexer nos dois lados juntos.

6. **Sem importação Excel no módulo fiscal.** A camada de tarefas tem; a fiscal
   só exporta. Se o volume de cadastro for grande, é a próxima peça.

7. **E-mails dependem de conta Gmail** com senha de app, limitada a 100/dia.
   Para volume real, migrar para um serviço transacional.

---

## Convenções

- Interface e nomes de domínio em **português**; termos técnicos em inglês onde
  já são padrão (`props`, `commit`).
- Valores monetários: `numeric(18,2)` no banco, `Number` no JS. Nunca float no
  banco, nunca string formatada no payload — `CurrencyInput` já devolve `Number`.
- Ao mexer em gráfico, a paleta em `FiscalDashboard.jsx` já foi validada para
  contraste e daltonismo nas superfícies reais do app, nos modos claro e escuro.
  Séries únicas usam **um só tom** — cor que não carrega informação é ruído.
