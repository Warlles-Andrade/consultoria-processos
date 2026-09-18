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
| Migrations | 10 na ordem de [`sql/LEIA-ME.md`](sql/LEIA-ME.md): 9 aplicadas, a 10 (remoção do modelo antigo de PER/DCOMP) é opcional |
| Segurança | RLS em todas as 28 tabelas; funções endurecidas após linter |
| PER/DCOMP | Controle por crédito com dados reais importados (1 contribuinte); regras provadas contra o protótipo da equipe |
| Leitura de PDF com IA | Código pronto; **não testada com PDF real** — falta `ANTHROPIC_API_KEY` |
| Rodando | Local (`npm run dev`) |
| **Publicação (deploy)** | **Pendente** — ver [Deploy](#deploy) |
| **Testes automatizados** | **Não existem** — ver [Riscos conhecidos](#riscos-conhecidos) |

---

## Stack

React 19 · Vite 7 · TailwindCSS 3 · Radix UI · Framer Motion · Recharts ·
Supabase (Postgres 17 com RLS, Auth, Storage) · XLSX · Nodemailer em funções
serverless da Vercel · SDK da Anthropic (leitura de PDF de PER/DCOMP).

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

**28 tabelas** em duas camadas (26 após a migration opcional 10):

```
clientes → projetos → processos (tarefas)
                          │
                          └── credito_id ─┐
                                          │
contribuintes (CNPJ) ── creditos ─────────┤
                            ├── credito_movimentos   (razão: saldo = ΣC − ΣD)
                            ├── habilitacoes         (e-CredAc CAT 207/83)
                            ├── processos_administrativos (DRJ/CARF/CSRF, TIT, TAT/MS)
                            └── processos_judiciais  (CNJ, trânsito em julgado)

andamentos → linha do tempo + prazos fatais de qualquer entidade acima

contribuintes ── perdcomp_creditos  (ID do crédito na RFB = nº do PER original)
                    ├── perdcomp_composicao   (notas, DARF, GPS que formam o crédito)
                    ├── perdcomp_per_versoes  (original + retificadores; 1 vigente)
                    └── perdcomp_dcomps       (conta-corrente) ── perdcomp_dcomp_debitos
perdcomp_eventos → fase de cada PER/DCOMP na Receita (último evento; nunca digitada)
selic_mensal     → tabela global para o saldo corrigido
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
  `processos_judiciais.prazo_compensacao` (trânsito + 5 anos).
  **Nunca enviar essas colunas no payload de escrita** — `fiscalApi.js` já as remove.
- **As views usam `security_invoker`** (exige PostgreSQL 15+). Sem isso a view
  enxergaria tudo, furando o isolamento por projeto.
- **`src/data/fiscalDomain.js` espelha os CHECK constraints do banco.** Mudou a
  lista lá, mude o CHECK na migration — e vice-versa. Divergência vira erro
  `23514` no insert em vez de validação amigável.
- **PER/DCOMP: saldo e fase também são derivados.** Saldo = valor do crédito −
  Σ crédito utilizado das DCOMPs **ativas e retificadoras** (retificadas e
  canceladas não consomem). A fase na Receita é o último evento registrado.
  Toda conta vive em `src/lib/perdcompRegras.js` (funções puras), e
  `scripts/verificar-perdcomp-regras.mjs` prova que elas reproduzem o
  protótipo HTML da equipe (290 verificações, 0 divergências; Selic 23/23).
- **Selic por tipo de crédito** segue os manuais do PER/DCOMP Web (retenção:
  2º mês após a competência; pagamento indevido: mês seguinte ao pagamento;
  saldo negativo: mês seguinte ao fim do período; ressarcimento PIS/Cofins:
  mês seguinte ao 361º dia do pedido). Onde o manual não define (IPI,
  salário-família, ação judicial), o sistema **não estima**: pede o termo inicial.
- **Horários do e-CAC são de Brasília sem fuso.** O importador marca `-03:00`;
  sem isso uma transmissão às 22h do último dia cairia no mês seguinte e mudaria a Selic.

---

## Mapa do código

| Caminho | Conteúdo |
| --- | --- |
| `src/App.jsx` | Raiz: autenticação, carga de dados, roteamento por abas |
| `src/components/*View.jsx` | Telas fiscais (Créditos, Habilitações, PER/DCOMP, Contencioso, Prazos) |
| `src/components/Perdcomp*.jsx` | PER/DCOMP: tela do controle, detalhe do crédito (conta-corrente, composição, versões, Selic, eventos), importação e formulário de PER/DCOMP |
| `src/lib/perdcompRegras.js` | Regras do PER/DCOMP (saldo, extrato, Selic, fase, alertas, prazos) — puras, sem banco |
| `src/lib/perdcompApi.js` / `perdcompImportar.js` / `perdcompIA.js` | Leitura e gravação do controle, importação do HTML/JSON e conversão da leitura por IA para o formulário |
| `src/components/*Form.jsx` | Formulários correspondentes |
| `src/components/FiscalDashboard.jsx` | Painel com KPIs e gráficos |
| `src/components/AndamentosPanel.jsx` | Linha do tempo reutilizável por todas as entidades |
| `src/lib/fiscalApi.js` | Acesso a dados: carimbo de auditoria, limpeza de colunas geradas e joins |
| `src/lib/fiscalExport.js` | Planilhas Excel (moeda como número com formato de célula) |
| `src/data/fiscalDomain.js` | Catálogo de opções, cores, severidade de prazo, formatadores |
| `api/` | Funções serverless: criar usuário, resetar senha, notificar por e-mail, **ler PDF de PER/DCOMP com IA** (`ler-perdcomp.js`) |
| `scripts/verificar-perdcomp-regras.mjs` | Prova de equivalência das regras contra o protótipo: `node scripts/verificar-perdcomp-regras.mjs <controle-perdcomp.html>` |
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
| `ANTHROPIC_API_KEY` | **Secreta.** Leitura de PDF de PER/DCOMP com IA. Sem ela o resto funciona e o botão avisa que não está configurado |

3. Em **Supabase → Authentication → URL Configuration**, adicione o domínio da
   Vercel em *Site URL* e *Redirect URLs* — senão o fluxo de recuperação de
   senha volta para `localhost`.

---

## Riscos conhecidos

Levantados honestamente para quem for assumir o código:

1. **Quase não há testes automatizados.** O único é a prova de equivalência do
   PER/DCOMP (`scripts/verificar-perdcomp-regras.mjs`). O resto foi verificado
   manualmente: build, render dos gráficos, geração das planilhas e um cenário
   completo gravado no banco e conferido. É o primeiro débito a pagar.

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

6. **Importação no módulo fiscal só existe para PER/DCOMP** (HTML/JSON do
   controle da equipe, e PDF via IA). Créditos, e-CredAc e contencioso só
   exportam. Se o volume de cadastro for grande, é a próxima peça.

7. **E-mails dependem de conta Gmail** com senha de app, limitada a 100/dia.
   Para volume real, migrar para um serviço transacional.

8. **O banco pausa sozinho no plano gratuito do Supabase** após 7 dias sem
   uso. Aconteceu em 09/2026: o projeto ficou `INACTIVE`, o sistema parou de
   responder (timeout de conexão) e foi preciso restaurar pelo painel — cerca
   de 6 minutos até voltar, **com todos os dados intactos**. Em uso diário não
   acontece; em produção, o plano Pro elimina a pausa.

9. **Leitura de PDF com IA nunca rodou contra um documento real.** O código
   segue a API da Anthropic (modelo `claude-opus-5`, saída em JSON validada
   por esquema), exige usuário logado e **não grava nada**: abre o formulário
   preenchido para revisão humana. Cada leitura tem custo de API. Limite de
   ~3 MB por PDF (corpo de requisição da Vercel). Testar com PDFs reais de PER
   e DCOMP antes de liberar para a equipe.

10. **Dados de cliente não vão para o git.** O controle real do primeiro cliente
    foi importado direto no banco; o HTML de origem fica fora do repositório.
    Mantenha assim — o repositório é privado, mas não é lugar de dado fiscal.

---

## Convenções

- Interface e nomes de domínio em **português**; termos técnicos em inglês onde
  já são padrão (`props`, `commit`).
- Valores monetários: `numeric(18,2)` no banco, `Number` no JS. Nunca float no
  banco, nunca string formatada no payload — `CurrencyInput` já devolve `Number`.
- Ao mexer em gráfico, a paleta em `FiscalDashboard.jsx` já foi validada para
  contraste e daltonismo nas superfícies reais do app, nos modos claro e escuro.
  Séries únicas usam **um só tom** — cor que não carrega informação é ruído.
