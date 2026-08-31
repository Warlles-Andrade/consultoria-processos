# 📋 Documentação Completa — Workive (Sistema de Gestão de Processos)

> **Versão:** 2.0
> **Data:** 15/05/2026
> **Stack:** React + Vite + Supabase + TailwindCSS + Framer Motion + Recharts + XLSX + Nodemailer (Vercel Serverless)

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Abas e Funcionalidades](#2-abas-e-funcionalidades)
   - 2.1 [Login](#21-login)
   - 2.2 [Dashboard](#22-dashboard)
   - 2.3 [Tabela de Processos](#23-tabela-de-processos)
   - 2.4 [Kanban](#24-kanban)
   - 2.5 [Cronograma (Gantt)](#25-cronograma-gantt)
   - 2.6 [Clientes (Admin)](#26-clientes-admin)
   - 2.7 [Projetos (Admin)](#27-projetos-admin)
   - 2.8 [Usuários (Admin)](#28-usuários-admin)
   - 2.9 [Tela de Acesso Pendente](#29-tela-de-acesso-pendente)
3. [Sidebar, Tema e Configurações](#3-sidebar-tema-e-configurações)
4. [Modais e Componentes Auxiliares](#4-modais-e-componentes-auxiliares)
   - 4.1 [Formulário de Processo](#41-formulário-de-processo)
   - 4.2 [Detalhes do Processo](#42-detalhes-do-processo)
   - 4.3 [Chat do Processo](#43-chat-do-processo)
   - 4.4 [Diálogo de Confirmação](#44-diálogo-de-confirmação)
   - 4.5 [Modal de Alteração de Senha](#45-modal-de-alteração-de-senha)
5. [Regras de Negócio Automáticas](#5-regras-de-negócio-automáticas)
6. [Estrutura do Banco de Dados (SQL)](#6-estrutura-do-banco-de-dados-sql)
   - 6.1 [Tabelas](#61-tabelas)
   - 6.2 [Diagrama de Relacionamentos](#62-diagrama-de-relacionamentos)
   - 6.3 [Índices](#63-índices)
7. [Políticas de Segurança (RLS)](#7-políticas-de-segurança-rls)
8. [Funções RPC e Triggers](#8-funções-rpc-e-triggers)
9. [API Endpoints (Serverless)](#9-api-endpoints-serverless)
10. [Controle de Acesso por Perfil](#10-controle-de-acesso-por-perfil)
11. [Sincronização de Filtros (localStorage)](#11-sincronização-de-filtros-localstorage)
12. [Variáveis de Ambiente](#12-variáveis-de-ambiente)

---

## 1. Visão Geral

**Workive** é uma plataforma web de **gestão de processos/tarefas** com suporte a múltiplos clientes (multi-tenant). Permite criar, acompanhar e gerenciar tarefas organizadas por **cliente → projeto → processo**, com controle de acesso baseado em perfis (Admin vs. Comum).

**Principais recursos:**
- Dashboard com métricas e gráficos (Recharts)
- Visualizações em **Tabela**, **Kanban** (drag-and-drop) e **Cronograma (Gantt)**
- Chat em tempo real por processo, com notificação por e-mail ao responsável
- Anexos de arquivos (até 50 MB) no Supabase Storage
- Histórico de replanejamento de prazos e auditoria detalhada de alterações
- Importação/Exportação Excel com validação inline e correção de erros
- Notificação automática por e-mail ao atribuir responsável (Gmail SMTP via Nodemailer)
- Controle de acesso granular com Row Level Security (RLS) no Postgres
- **Tema claro / escuro** com preferência salva por usuário
- Sidebar colapsável, filtros sincronizados entre abas, cálculo automático de "dias do processo"
- Tela de bloqueio para usuários ainda não atribuídos a clientes/projetos

---

## 2. Abas e Funcionalidades

### 2.1 Login

**Componente:** `Login.jsx`
**Acesso:** Público (não autenticado)

| Elemento | Descrição |
|----------|-----------|
| **Campo Email** | E-mail do usuário cadastrado |
| **Campo Senha** | Senha do usuário |
| **Botão "Entrar no Sistema"** | Autentica via Supabase Auth |

**Fluxo:**
1. Usuário insere email + senha
2. Sistema autentica via `supabase.auth.signInWithPassword()`
3. Busca perfil em `user_profiles` para verificar `ativo`
4. Se ativo → entra no app (Dashboard)
5. Se inativo → faz `signOut()` e exibe "🚫 Conta Desativada"
6. Tema do usuário é aplicado antes do render para evitar flash (`useTheme.js`)

---

### 2.2 Dashboard

**Componente:** `Dashboard.jsx`
**Acesso:** Todos os usuários autenticados
**Ícone barra lateral:** 📊

| Elemento | Descrição |
|----------|-----------|
| **Card Total de Processos** | Contagem total de processos visíveis (azul) |
| **Card Não Iniciado** | Processos com status "Não Iniciado" (cinza) |
| **Card Em Andamento** | Processos com status "Em Andamento" (azul) |
| **Card Paralisado** | Processos com status "Paralisado" (laranja) |
| **Card Concluído** | Processos com status "Concluído" (verde) |
| **Gráfico Distribuição por Status** | Donut chart com percentuais por status |
| **Gráfico Tarefas por Responsável** | Bar chart com tarefas atribuídas por pessoa |

**Comportamentos:**
- Clicar em um card abre modal listando todos os processos daquele status (com cliente, projeto, responsável, prazo, observações)
- Hover anima os cards com escala e shadow
- Gráficos com tooltips do Recharts; cores e contraste adaptados automaticamente ao **tema escuro**

---

### 2.3 Tabela de Processos

**Componente:** `ProcessTable.jsx`
**Acesso:** Todos os usuários autenticados
**Ícone barra lateral:** 📋

#### Filtros disponíveis (multi-select; sincronizados com Kanban e Gantt)

| Filtro | Tipo | Descrição |
|--------|------|-----------|
| **Busca textual** | Input | Filtra por nome da tarefa ou responsável |
| **Cliente** | Multi-select | Somente Admin. Reseta Projeto e Responsável ao mudar |
| **Projeto** | Multi-select | Filtrado pelo(s) cliente(s) selecionado(s) |
| **Status** | Multi-select | Não Iniciado / Em Andamento / Paralisado / Concluído |
| **Responsável** | Multi-select | Filtrado pelos clientes ativos |
| **Ordenação** | Dropdown | Data de Cadastro, A-Z (padrão), Z-A, Prazo |
| **Limpar Filtros** | Botão | Remove todos os filtros |

#### Colunas da tabela

| Coluna | Descrição |
|--------|-----------|
| **Tarefa** | Nome da tarefa/processo |
| **Projeto** | Projeto vinculado |
| **Status** | Badge colorido |
| **Prioridade** | Badge: Alta (vermelho), Média (amarelo), Baixa (verde) |
| **Responsável** | Nome do responsável atribuído |
| **Data Início** | Data planejada para iniciar (gatilho de auto-status) |
| **Prazo** | Data limite (vermelho se vencido; amarelo se é hoje) |
| **Dias** | Dias decorridos desde `data_inicio` (ou `dias_processo` se concluído) |
| **Ações** | Visualizar / Editar / Chat / Excluir |

> **Agrupamento:** Processos são agrupados por **cliente**; cada cliente exibe um card próprio com cabeçalho e contagem de processos.

#### Importação/Exportação Excel

| Ação | Descrição |
|------|-----------|
| **Baixar Modelo** | Gera `.xlsx` com colunas: Cliente, Projeto, Tarefa, Status, Prioridade, Data Início, Responsável, Prazo, Observações |
| **Importar Planilha** | Lê o arquivo, valida linha a linha (cliente/projeto/responsável cadastrados, status válido, prazo em formato dd/mm/aaaa) |
| **Corrigir Erros** | Linhas com erro vão para tela de **correção inline** com selects/inputs por campo. Botão "Revalidar correções" recheca em tempo real |
| **Importar válidos** | Insere todas as linhas sem erro de uma vez |
| **Exportar** | Baixa os processos exibidos (respeitando filtros) com colunas estendidas incluindo Prioridade, Data Início, Dias do Processo, Modificado Por |

> A ação **"Notificar"** foi removida da tabela: o e-mail ao responsável agora é enviado **automaticamente** quando ele é atribuído ou alterado em um processo (ver [§5](#5-regras-de-negócio-automáticas)).

---

### 2.4 Kanban

**Componente:** `KanbanBoard.jsx`
**Acesso:** Todos os usuários autenticados
**Ícone barra lateral:** 📌

#### Filtros e ordenação
Mesma estrutura de filtros multi-select da Tabela (sincronizados via `localStorage`). Status filtrado oculta colunas inteiras do board.

#### Colunas

| Coluna | Cor | Status |
|--------|-----|--------|
| **Não Iniciado** | Cinza | Tarefas ainda não começadas |
| **Em Andamento** | Azul | Tarefas em execução |
| **Paralisado** | Laranja | Tarefas pausadas/travadas |
| **Concluído** | Verde | Tarefas finalizadas |

#### Card de processo

| Elemento | Descrição |
|----------|-----------|
| Nome da tarefa | Com ícone de pasta |
| Projeto | Badge violeta |
| Cliente | Badge cinza (roxo se "adm") |
| Prioridade | Badge colorido (Alta/Média/Baixa) |
| Responsável | Nome com ícone |
| Data Início | Em verde se preenchida |
| Prazo | Vermelho se vencido, amarelo se é hoje |
| Indicador de dias | ⏱ N dias (em vermelho se passou do prazo) |
| Indicador de chat | Ponto vermelho no menu se há mensagens não lidas |

#### Ações

| Ação | Descrição |
|------|-----------|
| **Drag & Drop** | Arrasta card entre colunas → atualiza status no banco e grava histórico |
| **Menu ⋮** | Visualizar / Editar / Chat / Excluir (Excluir só para criador ou Admin) |
| **Adicionar Processo (+)** | Botão no rodapé de cada coluna → abre formulário com status e filtros ativos pré-preenchidos |
| **Ordenação** | Mesma ordenação global aplicada dentro de cada coluna |

---

### 2.5 Cronograma (Gantt)

**Componente:** `GanttView.jsx`
**Acesso:** Admin sempre; usuários comuns somente se `app_settings.gantt_enabled_for_all = 'true'`
**Ícone barra lateral:** 📅

| Elemento | Descrição |
|----------|-----------|
| **Filtros** | Mesmo conjunto multi-select da Tabela/Kanban (sincronizados) |
| **Navegação de período** | Avançar/voltar meses; alternar janela de 1/3/6/12 meses |
| **Linha do tempo** | Eixo X com dias/meses; barras horizontais coloridas conforme status |
| **Toggle "Liberar para todos"** | Somente Admin: grava `app_settings.gantt_enabled_for_all` para habilitar a aba aos usuários comuns |

**Comportamentos:**
- Barras posicionadas usando `data_inicio` → `prazo`
- Processos sem datas listados separadamente como "Sem datas"
- Clicar em uma barra abre o **Detalhes do Processo**

---

### 2.6 Clientes (Admin)

**Componente:** `GruposManagement.jsx`
**Acesso:** Somente Admin (`grupo = 'adm'`)
**Ícone barra lateral:** 🏢

> No banco a tabela se chama `clientes`. O termo "grupos" persiste em alguns componentes por compatibilidade histórica.

#### Gestão de Clientes

| Ação | Descrição |
|------|-----------|
| **Adicionar cliente** | Modal com nome (capitalizado automaticamente), descrição e seletor de cor (default `#6366f1`) |
| **Editar cliente** | Modal com mesmos campos do criar |
| **Excluir cliente** | Bloqueado se houver projetos ou usuários vinculados |
| **Buscar** | Filtra por nome ou descrição |
| **Expandir card** | Mostra projetos do cliente; permite adicionar/excluir projeto inline |

---

### 2.7 Projetos (Admin)

**Componente:** `ProjetosManagement.jsx`
**Acesso:** Somente Admin
**Ícone barra lateral:** 📁

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome do projeto |
| **Cliente** | Badge com nome do cliente |
| **Descrição** | Texto descritivo |
| **Ações** | Editar / Excluir |

| Ação | Descrição |
|------|-----------|
| **Adicionar projeto** | Modal: cliente + nome + descrição |
| **Editar** | Modal de edição (nome, cliente, descrição) |
| **Excluir** | Bloqueado se houver processos vinculados |
| **Filtrar por cliente** | Dropdown |
| **Buscar** | Por nome, descrição ou cliente |

---

### 2.8 Usuários (Admin)

**Componente:** `UserManagement.jsx`
**Acesso:** Somente Admin
**Ícone barra lateral:** 👤

#### Lista

| Coluna | Descrição |
|--------|-----------|
| **Nome** | Nome do usuário |
| **E-mail** | Endereço (via RPC `get_user_profiles_with_email`) |
| **Cliente** | Cliente ao qual pertence (ou "Administrador") |
| **Status** | Badge Ativo ✅ ou Inativo ❌ |
| **Tipo** | Badge Admin 🛡️ ou Comum |
| **Projetos** | Lista de projetos acessíveis |

#### Ações

| Ação | Descrição |
|------|-----------|
| **Criar Usuário** | Modal com: e-mail, senha, confirmar senha, nome, tipo (Admin/Comum), cliente(s) e projeto(s) (cascata) |
| **Editar Usuário** | Alterar nome, tipo, clientes e projetos vinculados |
| **Ativar/Desativar** | Toggle com confirmação. Usuário desativado é deslogado e não consegue entrar |
| **Resetar Senha** | Modal para definir nova senha; envia e-mail com credenciais atualizadas |
| **Buscar** | Por nome, e-mail ou status |

#### Validações na criação

| Regra | Descrição |
|-------|-----------|
| Senha mínima | 8 caracteres |
| Senha com maiúscula | Ao menos 1 letra maiúscula |
| Senha com número | Ao menos 1 dígito |
| Confirmação | Senha e confirmação devem coincidir |
| E-mail único | Validado no `auth.users` |

#### Lógica em cascata

- **Tipo Admin** → recebe `grupo = 'adm'`; acessa todos clientes/projetos automaticamente
- **Tipo Comum** → seleciona cliente(s) → projetos do(s) cliente(s) selecionado(s)
- Ao criar: insere em `user_profiles` (via trigger ou RPC `create_user_profile_safe`), em `user_projetos` (N:N) e também em `responsaveis` + `responsavel_projetos` (espelhamento)
- E-mail de boas-vindas enviado com credenciais

---

### 2.9 Tela de Acesso Pendente

Quando um usuário comum **não tem nenhum projeto** atribuído, ou tem `grupo = 'pendente'`, o sistema bloqueia a entrada e exibe a tela **"Acesso Pendente"** (`App.jsx:1004-1042`) com:
- Mensagem solicitando contato com o administrador
- Indicador "Aguardando configuração pelo administrador"
- Botão "Sair da Conta"

---

## 3. Sidebar, Tema e Configurações

### Sidebar (`Sidebar.jsx`)

- Largura **280px** quando expandida, **80px** quando colapsada — estado persistido em `localStorage` (`sidebarCollapsed`)
- Em mobile, vira gaveta sobre overlay
- Logo Workive + nome + descrição "Sistema de Gestão"
- Bloco de identidade do usuário (nome + tipo)
- **Seção "Navegação":** Dashboard, Tabela, Kanban, Cronograma (condicional)
- **Seção "Configurações":** Clientes, Projetos, Usuários (somente Admin)
- Botão **Configurações** abre `SettingsMenu` em portal flutuante
- Botão **Sair** com gradiente vermelho

### Menu de Configurações (`SettingsMenu.jsx`)

| Item | Ação |
|------|------|
| **Alterar Senha** | Abre modal de troca de senha (atual + nova + confirmar) |
| **Tema Claro** | Aplica `light` ao `<html>` |
| **Tema Escuro** | Aplica `dark` ao `<html>` (classe `dark` para Tailwind) |

### Hook `useTheme` (`src/hooks/useTheme.js`)

- Preferência salva em `localStorage` na chave `theme_<userId>`
- Aplicação eager (antes do React montar) para evitar flash branco no login
- Em `handleLogout()`, as entradas `theme_*` são **preservadas** ao limpar o `localStorage`

---

## 4. Modais e Componentes Auxiliares

### 4.1 Formulário de Processo

**Componente:** `ProcessForm.jsx`
**Abertura:** Botão "Nova Tarefa" (Tabela) ou "+" em coluna do Kanban ou ação "Editar"

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| **Tarefa** | Texto | ✅ | Nome da tarefa/processo |
| **Cliente** | Dropdown | ✅ | Filtra projeto. Pré-selecionado conforme filtros ativos ou perfil |
| **Projeto** | Dropdown | ✅ | Projetos do cliente selecionado |
| **Responsável** | Dropdown | ✅ | Filtrado por usuários com acesso ao projeto |
| **E-mail** | Texto (readonly) | — | Preenchido automaticamente pelo responsável |
| **Status** | Dropdown | ✅ | Não Iniciado / Em Andamento / Paralisado / Concluído |
| **Prioridade** | Dropdown | — | Alta / Média (padrão) / Baixa |
| **Data Início** | Date picker | — | Dispara auto-status para "Em Andamento" |
| **Prazo** | Date picker | — | Data limite |
| **Justificativa de Replanejamento** | Textarea | ✅* | *Obrigatório se prazo for alterado na edição |
| **Observações** | Textarea | — | Notas adicionais |
| **Anexos** | Upload | — | Até 50MB por arquivo |

**Comportamentos especiais:**
- **Cascata:** Cliente → Projeto → Responsável
- **Pré-preenchimento:** Lê filtros ativos do `localStorage` (Cliente/Projeto) ao abrir
- **Replanejamento:** Mudar `prazo` exige justificativa. Histórico salvo em `prazo_historico` (JSONB) com `{data_anterior, data_nova, justificativa, alterado_em, alterado_por}`
- **Anexos:** Verde = existentes, Azul = pendentes; armazenados em Supabase Storage bucket `process-documents` em `<process_id>/<timestamp>_<filename>`
- **Persistência local:** Dados do formulário salvos em `sessionStorage` enquanto modal aberto

---

### 4.2 Detalhes do Processo

**Componente:** `ProcessDetailModal.jsx`
**Abertura:** Ação "Visualizar" em qualquer aba

| Seção | Informações |
|-------|-------------|
| **Cabeçalho** | Nome da tarefa + botão Editar |
| **Status, Prioridade** | Badges coloridos |
| **Cliente, Projeto, Responsável** | Identificação |
| **Data Início, Prazo, Dias do Processo** | Indicadores temporais |
| **Observações** | Texto em caixa |
| **Histórico de Replanejamento** | Lista colapsável das mudanças de prazo |
| **Anexos** | Download via URL assinada (60s) |
| **Auditoria** | Lista completa de `process_history` (criação, alterações campo-a-campo, mudanças de status, anexos adicionados/removidos, exclusão) |

---

### 4.3 Chat do Processo

**Componente:** `ProcessChat.jsx`
**Abertura:** Ação "Chat" em qualquer processo

| Elemento | Descrição |
|----------|-----------|
| **Mensagens** | Lista cronológica em bolhas |
| **Bolha própria** | Gradiente azul-teal, alinhada à direita |
| **Bolha de outros** | Branco com borda, alinhada à esquerda |
| **Nome do autor** | Acima da bolha ("Você" para mensagens próprias) |
| **Tempo relativo** | "30s atrás", "2min atrás", "3h atrás", data se > 24h |
| **Indicador "editado"** | Texto pequeno na bolha |
| **Contador de edição** | "Xs para editar" enquanto há janela aberta |
| **Input** | Textarea com botão enviar |

**Ações:**

| Ação | Descrição | Regra |
|------|-----------|-------|
| **Enviar** | Enter ou botão | Deve estar autenticado e ativo |
| **Editar** | Ícone ✏️ | Somente próprias mensagens, janela de **20 segundos** |
| **Excluir** | Ícone 🗑️ | Próprias em 20s **ou** Admin a qualquer momento |
| **Quebra de linha** | Shift+Enter | |

**Realtime:**
- Subscription Supabase em `process_messages` (INSERT/UPDATE/DELETE)
- Auto-scroll para a mensagem mais recente

**Notificação por e-mail:**
- Toda nova mensagem dispara `/api/notify-responsavel` (`type: chat_message`) **fire-and-forget** para o responsável, **exceto** quando o autor é o próprio responsável

**Indicador de não lidas:**
- `localStorage` chave `chatLastRead_<userId>_<processId>`
- Ponto vermelho exibido nos cards do Kanban e nos botões da Tabela
- Realtime atualiza o indicador globalmente em `App.jsx`

---

### 4.4 Diálogo de Confirmação

**Componente:** `ConfirmDialog.jsx`
Modal reutilizável para ações destrutivas (excluir processo, desativar usuário, excluir cliente, etc.).

---

### 4.5 Modal de Alteração de Senha

Definido em `App.jsx`. Campos:
- Senha atual
- Nova senha (mín. 8 caracteres)
- Confirmar nova senha

Fluxo: revalida senha atual com `signInWithPassword` → atualiza com `auth.updateUser`.

---

## 5. Regras de Negócio Automáticas

### 5.1 Auto-status "Em Andamento"
Em `App.jsx:201-227`, ao montar (ou quando `processes` mudam):
- Para cada processo com `status = 'Não Iniciado'` e `data_inicio ≤ hoje` → atualiza status para **"Em Andamento"** automaticamente, gravando `updated_by` e `updated_by_name`.

### 5.2 Cálculo de `dias_processo`
Quando um processo é salvo como **"Concluído"** com `data_inicio` preenchida:
- `dias_processo = round((hoje - data_inicio) / dia)` é calculado e gravado.

### 5.3 Notificação automática ao responsável
Em `saveProcess()` (`App.jsx:638-666`), sempre que o responsável é definido ou alterado:
- Dispara `POST /api/notify-responsavel` com `type: 'assignment'`.

### 5.4 Auditoria detalhada
Toda criação, atualização, mudança de status, upload/remoção de anexo e exclusão grava em `process_history` com:
- `old_values` e `new_values` em JSONB com **labels formatados** (`'Tarefa'`, `'Status'`, `'Responsável'`, `'Prazo'`, `'Data de Início'`, `'Prioridade'`, `'Observações'`, `'Cliente'`, `'Projeto'`)
- `changes_summary` textual

### 5.5 Filtros sincronizados
Tabela, Kanban e Gantt compartilham as mesmas chaves de `localStorage`, então alterar um filtro em uma aba propaga para as outras.

### 5.6 Pré-preenchimento ao criar processo
- Se houver **um único** Cliente e/ou Projeto filtrados, o formulário é aberto com esses valores pré-selecionados (`App.jsx:329-355`).
- Botão "+" em coluna do Kanban também pré-seleciona o status correspondente.

---

## 6. Estrutura do Banco de Dados (SQL)

### 6.1 Tabelas

#### `user_profiles` — Perfis de Usuário

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador do perfil |
| `user_id` | UUID | NOT NULL, UNIQUE, FK → `auth.users(id)` ON DELETE CASCADE | ID do usuário Auth |
| `grupo` | VARCHAR(255) | NOT NULL | `'adm'` para administradores, nome do cliente para comuns, `'pendente'` enquanto não atribuído |
| `nome` | VARCHAR(255) | — | Nome de exibição |
| `ativo` | BOOLEAN | DEFAULT `true` | Se a conta está ativa |
| `projeto_id` | UUID | FK → `projetos(id)` ON DELETE SET NULL | Projeto legado (substituído por `user_projetos`) |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `updated_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

---

#### `processos` — Processos/Tarefas

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | Identificador do processo |
| `tarefa` | TEXT | NOT NULL | Nome da tarefa |
| `status` | VARCHAR | — | `'Não Iniciado'`, `'Em Andamento'`, `'Paralisado'`, `'Concluído'` |
| `prioridade` | VARCHAR | — | `'Alta'`, `'Média'` (default), `'Baixa'` |
| `responsavel_nome` | TEXT | — | Nome do responsável |
| `email` | TEXT | — | E-mail do responsável (denormalizado) |
| `cliente` | TEXT | — | Nome do cliente (denormalizado, derivado do projeto) |
| `grupo` | VARCHAR(255) | — | Cliente/grupo de pertencimento (espelha `cliente`) |
| `projeto_id` | UUID | FK → `projetos(id)` ON DELETE SET NULL | Projeto vinculado |
| `data_inicio` | DATE | — | Data planejada de início (gatilho de auto-status) |
| `prazo` | DATE | — | Data limite |
| `dias_processo` | INTEGER | — | Dias decorridos entre `data_inicio` e a conclusão (gravado ao concluir) |
| `prazo_historico` | JSONB | DEFAULT `'[]'` | Array de replanejamentos: `[{data_anterior, data_nova, justificativa, alterado_em, alterado_por}]` |
| `observacoes` | TEXT | — | Notas adicionais |
| `created_by` | UUID | FK → `auth.users(id)` | Quem criou |
| `created_by_name` | VARCHAR(255) | — | Nome de quem criou |
| `updated_by` | UUID | FK → `auth.users(id)` | Quem atualizou por último |
| `updated_by_name` | VARCHAR(255) | — | Nome de quem atualizou |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `updated_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

---

#### `clientes` — Clientes (também chamados de "Empresas")

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador |
| `nome` | VARCHAR(255) | NOT NULL, UNIQUE | Nome do cliente |
| `descricao` | TEXT | DEFAULT `''` | Descrição |
| `cor` | VARCHAR(20) | DEFAULT `'#6366f1'` | Cor hexadecimal |
| `is_admin` | BOOLEAN | DEFAULT `false` | Flag para o grupo administrativo |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `updated_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `created_by` | UUID | FK → `auth.users(id)` | Quem criou |

---

#### `projetos` — Projetos

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK, `gen_random_uuid()` | Identificador |
| `cliente_id` | UUID | NOT NULL, FK → `clientes(id)` ON DELETE CASCADE | Cliente proprietário |
| `nome` | VARCHAR(255) | NOT NULL | Nome do projeto |
| `descricao` | TEXT | DEFAULT `''` | Descrição |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `updated_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

> **UNIQUE:** `(cliente_id, nome)`

---

#### `user_projetos` — Relação Usuário ↔ Projetos (N:N)

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `user_profile_id` | UUID | NOT NULL, FK → `user_profiles(id)` ON DELETE CASCADE | |
| `projeto_id` | UUID | NOT NULL, FK → `projetos(id)` ON DELETE CASCADE | |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

> **UNIQUE:** `(user_profile_id, projeto_id)`

---

#### `responsaveis` — Espelho de `user_profiles` para legado de processos

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `nome` | TEXT | — | |
| `email` | TEXT | — | |
| `grupo` | TEXT | — | |
| `projeto_id` | UUID | FK → `projetos(id)` ON DELETE SET NULL | Legado |
| `created_by` | UUID | FK → `auth.users(id)` ON DELETE SET NULL | |
| `created_at` | TIMESTAMPTZ | — | |

> **Nota:** Tabela mantida para retrocompatibilidade da relação `processos.responsavel:responsaveis(nome)`. Não há UI dedicada — gestão é feita via aba **Usuários**, que mantém os registros em sincronia.

---

#### `responsavel_projetos` — Relação Responsável ↔ Projetos (N:N)

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `responsavel_id` | UUID | NOT NULL, FK → `responsaveis(id)` ON DELETE CASCADE | |
| `projeto_id` | UUID | NOT NULL, FK → `projetos(id)` ON DELETE CASCADE | |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

> **UNIQUE:** `(responsavel_id, projeto_id)`

---

#### `process_messages` — Mensagens de Chat

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `process_id` | UUID | FK → `processos(id)` ON DELETE CASCADE | |
| `user_id` | UUID | — | Autor (auth.users) |
| `user_name` | TEXT | — | Nome do autor |
| `user_group` | VARCHAR(255) | DEFAULT `''` | Grupo do autor |
| `user_cliente` | TEXT | — | Cliente do autor |
| `message` | TEXT | — | Conteúdo |
| `edited` | BOOLEAN | DEFAULT `false` | |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |
| `updated_at` | TIMESTAMPTZ | — | Data de edição |

---

#### `process_documents` — Anexos

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `process_id` | UUID | NOT NULL, FK → `processos(id)` ON DELETE CASCADE | |
| `filename` | TEXT | NOT NULL | Nome original |
| `storage_path` | TEXT | NOT NULL | Caminho em Storage |
| `file_size` | BIGINT | — | Tamanho em bytes |
| `content_type` | TEXT | — | MIME type |
| `uploaded_by` | UUID | FK → `auth.users(id)` | |
| `uploaded_by_name` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

---

#### `process_history` — Histórico de Auditoria

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `id` | UUID | PK | |
| `process_id` | UUID | NOT NULL, FK → `processos(id)` ON DELETE CASCADE | |
| `action` | VARCHAR(50) | CHECK: `'created'`, `'updated'`, `'status_changed'`, `'deleted'` | |
| `changed_by` | UUID | NOT NULL, FK → `auth.users(id)` | |
| `changed_by_name` | VARCHAR(255) | — | |
| `old_values` | JSONB | — | |
| `new_values` | JSONB | — | |
| `changes_summary` | TEXT | — | Resumo textual |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | |

---

#### `app_settings` — Configurações Globais (chave/valor)

| Coluna | Tipo | Restrições | Descrição |
|--------|------|------------|-----------|
| `key` | TEXT | PK | Nome da configuração |
| `value` | TEXT | — | Valor (string) |
| `updated_at` | TIMESTAMPTZ | — | Última atualização |

**Chaves usadas:**

| Chave | Valores | Uso |
|-------|---------|-----|
| `gantt_enabled_for_all` | `'true'` / `'false'` | Libera o Cronograma (Gantt) para usuários comuns |

---

### 6.2 Diagrama de Relacionamentos

```
┌─────────────────┐
│   auth.users    │
│  (Supabase)     │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐       ┌──────────────────┐
│  user_profiles  │──N:N──│   user_projetos  │
│                 │       │ (junction table) │
│  - grupo        │       └────────┬─────────┘
│  - nome         │                │
│  - ativo        │                │ N:1
└────────┬────────┘                ▼
         │               ┌──────────────────┐       ┌─────────────────┐
         │               │    projetos      │──N:1──│    clientes     │
         │               │                  │       │                 │
         │               │  - nome          │       │  - nome         │
         │               │  - descricao     │       │  - cor          │
         │               │  - cliente_id    │       │  - is_admin     │
         │               └────────┬─────────┘       └─────────────────┘
         │                        │ 1:N
         │                        ▼
         │               ┌─────────────────────────────┐
         │               │         processos           │
         │               │                             │
         │               │  - tarefa, status           │
         │               │  - prioridade               │
         │               │  - data_inicio, prazo       │
         │               │  - dias_processo            │
         │               │  - prazo_historico (JSONB)  │
         │               │  - cliente, grupo           │
         │               │  - projeto_id               │
         │               └───┬────┬────┬────────────┬──┘
         │                   │    │    │            │
         │              1:N  │    │    │ 1:N        │ 1:N
         │                   ▼    │    ▼            ▼
         │  ┌────────────────┐   │   ┌─────────────────────┐
         │  │process_messages│   │   │  process_documents  │
         │  └────────────────┘   │   └─────────────────────┘
         │                       │ 1:N
         │                       ▼
         │              ┌──────────────────┐
         │              │ process_history  │
         │              │  - action        │
         │              │  - old_values    │
         │              │  - new_values    │
         │              └──────────────────┘
         │
         │          ┌──────────────────┐       ┌──────────────────────┐
         └─────────►│  responsaveis    │──N:N──│ responsavel_projetos │
                    └──────────────────┘       └──────────────────────┘

┌──────────────────┐
│   app_settings   │  (chave/valor; ex: gantt_enabled_for_all)
└──────────────────┘
```

---

### 6.3 Índices

| Tabela | Índice | Colunas |
|--------|--------|---------|
| `user_profiles` | `idx_user_profiles_user_id` | `user_id` |
| `user_profiles` | `idx_user_profiles_grupo` | `grupo` |
| `user_profiles` | `idx_user_profiles_projeto_id` | `projeto_id` |
| `processos` | `idx_processos_grupo` | `grupo` |
| `processos` | `idx_processos_created_by` | `created_by` |
| `processos` | `idx_processos_updated_by` | `updated_by` |
| `processos` | `idx_processos_prazo` | `prazo` |
| `processos` | `idx_processos_projeto_id` | `projeto_id` |
| `processos` | `idx_processos_data_inicio` | `data_inicio` |
| `process_history` | `idx_process_history_process_id` | `process_id` |
| `process_history` | `idx_process_history_changed_by` | `changed_by` |
| `process_history` | `idx_process_history_created_at` | `created_at DESC` |
| `process_documents` | `idx_process_documents_process_id` | `process_id` |
| `projetos` | `idx_projetos_cliente_id` | `cliente_id` |
| `user_projetos` | `idx_user_projetos_user_profile_id` | `user_profile_id` |
| `user_projetos` | `idx_user_projetos_projeto_id` | `projeto_id` |
| `responsaveis` | `idx_responsaveis_projeto_id` | `projeto_id` |
| `responsaveis` | `idx_responsaveis_created_by` | `created_by` |
| `responsavel_projetos` | `idx_responsavel_projetos_responsavel_id` | `responsavel_id` |
| `responsavel_projetos` | `idx_responsavel_projetos_projeto_id` | `projeto_id` |

---

## 7. Políticas de Segurança (RLS)

Todas as tabelas têm **RLS habilitado**.

### 7.1 `user_profiles`
- **SELECT/INSERT/UPDATE/DELETE:** todo autenticado

### 7.2 `processos`
- **SELECT:** usuário deve estar `ativo` E **(** Admin **OU** `projeto_id IN user_projetos do usuário` **OU** fallback `projeto_id IS NULL AND grupo = grupo_do_usuário` **)**
- **DELETE:** Admin OU `created_by = auth.uid()` OU processos sem `created_by`
- **INSERT/UPDATE:** autenticados ativos

```sql
USING (
  (SELECT ativo FROM user_profiles WHERE user_id = auth.uid()) = true
  AND (
    (SELECT grupo FROM user_profiles WHERE user_id = auth.uid()) = 'adm'
    OR projeto_id IN (
      SELECT up.projeto_id FROM user_projetos up
      INNER JOIN user_profiles prof ON prof.id = up.user_profile_id
      WHERE prof.user_id = auth.uid()
    )
    OR (projeto_id IS NULL AND grupo = (SELECT grupo FROM user_profiles WHERE user_id = auth.uid()))
  )
)
```

### 7.3 `process_history`
- **SELECT:** Admin OU mesmo grupo do processo

### 7.4 `process_messages`
- **SELECT:** mesma lógica do `processos` SELECT
- **INSERT:** autenticado E ativo
- **UPDATE:** `user_id = auth.uid()` E `created_at > NOW() - INTERVAL '20 seconds'` (janela de edição também aplicada no banco)
- **DELETE:** autor OU Admin

### 7.5 `process_documents`
- **SELECT/INSERT:** autenticado
- **DELETE:** quem fez upload OU Admin

### 7.6 `clientes`, `projetos`, `user_projetos`, `responsaveis`, `responsavel_projetos`
- **SELECT/INSERT/UPDATE/DELETE:** autenticados (controle granular no frontend)
- Em `responsaveis` SELECT considera projetos compartilhados; UPDATE/DELETE: Admin OU criador OU registros sem criador

### 7.7 `app_settings`
- **SELECT:** autenticado
- **INSERT/UPDATE:** Admin (controle no frontend; recomenda-se restringir também via RLS quando aplicável)

### 7.8 Storage (`process-documents`)
- **INSERT/SELECT/DELETE:** autenticados
- Bucket privado, limite **50 MB**, MIME permitidos: PDF, DOC(X), XLS(X), PNG, JPEG

---

## 8. Funções RPC e Triggers

### `create_user_profile_safe(p_user_id, p_nome, p_grupo)`
- Executa como `SECURITY DEFINER`
- Insert/upsert em `user_profiles` com retry (até 5 tentativas, espera incremental 0.3s × n)
- **Proteção:** se chamador não é admin e tenta gravar `grupo = 'adm'`, valor é substituído pelo grupo do chamador
- `GRANT EXECUTE` apenas para `authenticated`

### `get_user_profiles_with_email()`
- Retorna `user_profiles` joinado com `email` de `auth.users`
- Usado em `UserManagement.jsx` e no carregamento inicial (`App.jsx`)

### Trigger `handle_new_user()`
- **Trigger:** `AFTER INSERT ON auth.users`
- Cria automaticamente `user_profile` extraindo `nome`/`grupo` de `raw_user_meta_data`
- **Proteção:** se `grupo` vier como `'adm'`, `null` ou vazio, é substituído por `'sem_grupo'` para impedir auto-promoção via signup

| Trigger | Tabela | Evento | Função |
|---------|--------|--------|--------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` |

---

## 9. API Endpoints (Serverless)

### 9.1 POST `/api/create-user`

**Autenticação:** Bearer token (deve ser admin)

```json
{
  "email": "usuario@exemplo.com",
  "password": "SenhaSegura123",
  "nome": "Nome do Usuário",
  "grupo": "nome_do_cliente"
}
```

**Fluxo:** valida token → cria via `supabase.auth.admin.createUser` com `email_confirm: true` → envia e-mail de boas-vindas via Gmail SMTP.

### 9.2 POST `/api/reset-password`

**Autenticação:** Bearer token (deve ser admin)

```json
{
  "userId": "uuid",
  "email": "usuario@exemplo.com",
  "password": "NovaSenha456",
  "nome": "Nome"
}
```

**Fluxo:** valida → `supabase.auth.admin.updateUserById` → envia e-mail.

### 9.3 POST `/api/notify-responsavel` ⭐ novo

**Autenticação:** Não requer (chamado pelo cliente; valida `data.email`)

**Tipos suportados:**

#### `type: 'assignment'`
Disparado em `App.jsx` quando responsável é atribuído ou alterado num processo.

```json
{
  "type": "assignment",
  "data": {
    "email": "responsavel@exemplo.com",
    "responsavel": "Nome do Responsável",
    "tarefa": "Nome da Tarefa",
    "cliente": "Nome do Cliente",
    "projeto": "Nome do Projeto",
    "status": "Em Andamento",
    "prazo": "2026-06-30",
    "observacoes": "..."
  }
}
```

Assunto do e-mail: `📌 Você foi atribuído a um processo — <Tarefa>`

#### `type: 'chat_message'`
Disparado em `ProcessChat.jsx` quando alguém envia mensagem e o responsável é outra pessoa.

```json
{
  "type": "chat_message",
  "data": {
    "email": "responsavel@exemplo.com",
    "responsavel": "Nome do Responsável",
    "tarefa": "Nome da Tarefa",
    "cliente": "Nome do Cliente",
    "projeto": "Nome do Projeto",
    "senderName": "Quem enviou",
    "message": "Texto da mensagem"
  }
}
```

Assunto do e-mail: `💬 Nova mensagem no processo — <Tarefa>`

### 9.4 POST `/api/send-process-email` (legado)
Endpoint mantido por compatibilidade, mas **não chamado** pelo frontend atual. Substituído por `/api/notify-responsavel`.

---

## 10. Controle de Acesso por Perfil

| Recurso | Admin (`grupo = 'adm'`) | Comum |
|---------|:-----------------------:|:-----:|
| Dashboard | ✅ Todos os processos | ✅ Processos dos seus projetos |
| Tabela | ✅ Todos + filtro por cliente | ✅ Apenas dos seus projetos |
| Kanban | ✅ Todos | ✅ Apenas dos seus projetos |
| Cronograma (Gantt) | ✅ Sempre | ⚠️ Somente se `gantt_enabled_for_all = 'true'` |
| Toggle "Liberar Gantt para todos" | ✅ | ❌ |
| Criar processo | ✅ Qualquer cliente/projeto | ✅ Apenas nos seus projetos |
| Editar processo | ✅ Qualquer | ✅ Apenas nos seus projetos |
| Excluir processo | ✅ Qualquer | ✅ Apenas os que criou |
| Chat do processo | ✅ Todos | ✅ Apenas dos seus projetos |
| Aba Clientes | ✅ | ❌ Oculta |
| Aba Projetos | ✅ | ❌ Oculta |
| Aba Usuários | ✅ | ❌ Oculta |
| Criar usuários | ✅ | ❌ |
| Resetar senha de outros | ✅ | ❌ |
| Ativar/Desativar usuário | ✅ | ❌ |
| Alterar a própria senha | ✅ | ✅ |
| Alterar o próprio tema | ✅ | ✅ |
| Excluir mensagem de qualquer um | ✅ | ❌ (só as próprias em 20s) |
| Excluir anexo de qualquer um | ✅ | ❌ (só os próprios) |

---

## 11. Sincronização de Filtros (localStorage)

Tabela, Kanban e Gantt compartilham as mesmas chaves para que alterar o filtro em uma aba reflita em todas:

| Chave | Valor |
|-------|-------|
| `processTableSearchTerm` | string |
| `processTableStatusFilterMulti` | string[] |
| `processTableResponsavelFilterMulti` | string[] |
| `processTableGrupoFilterMulti` | string[] (nomes de cliente) |
| `processTableProjetoFilterMulti` | string[] (ids de projeto) |
| `processSortOrder` | `'cadastro'` \| `'az'` \| `'za'` \| `'prazo'` |
| `activeTab` | última aba aberta |
| `sidebarCollapsed` | boolean |
| `theme_<userId>` | `'light'` \| `'dark'` (preservado no logout) |
| `chatLastRead_<userId>_<processId>` | ISO datetime |

---

## 12. Variáveis de Ambiente

### Frontend (Vite)

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave pública (anon) do Supabase |

### Backend (Vercel Serverless)

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (admin) do Supabase |
| `GMAIL_APP_PASSWORD` | Senha de aplicativo Gmail para envio |
| `GMAIL_USER` | E-mail remetente (padrão: `claudinojames1702@gmail.com`) |

---

> **Fim da documentação.**
> Próximas alterações no sistema devem manter este arquivo sincronizado; ao terminar uma feature, ajustar as seções relevantes antes do commit.
