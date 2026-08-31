# CEP Consultoria — Processos

## Projeto de referência (consulta)

Ao desenvolver código neste projeto, **consultar como referência** o sistema já existente em:

```
C:\Users\Warlles\OneDrive\Documentos\Claude\Projects\sistema_processos
```

Esse repositório (`web_consultoriaV2` / **Workive**) é um sistema de gestão de
processos multi-tenant já em produção e serve como base de padrões: arquitetura,
convenções de código, modelagem de dados e regras de negócio.

### Stack do projeto de referência

React 19 + Vite 7 + TailwindCSS 3 + Radix UI + Framer Motion + Recharts +
Supabase (Postgres com RLS, Auth, Storage) + XLSX + Nodemailer em funções
serverless da Vercel.

### Pontos de consulta principais

| Caminho | Conteúdo |
| --- | --- |
| `DOCUMENTACAO_COMPLETA_SISTEMA.md` | Documentação completa: abas, regras de negócio, schema SQL, RLS, RPCs, endpoints, variáveis de ambiente |
| `src/components/` | Componentes de UI (tabela, kanban, gantt, modais, chat) |
| `src/hooks/`, `src/lib/`, `src/data/` | Hooks, integração com Supabase e camada de dados |
| `api/` | Funções serverless (criação de usuário, reset de senha, envio de e-mails) |
| `sql/` | Migrações de banco (histórico de alterações do schema) |
| `.env.example` | Variáveis de ambiente esperadas |
| `package.json`, `vite.config.mjs`, `tailwind.config.js` | Configuração de build e dependências |

### Como usar a referência

- Reaproveitar padrões (nomenclatura, estrutura de pastas, estilo de componentes,
  políticas de RLS) em vez de inventar convenções novas.
- É material de **consulta apenas** — não alterar arquivos em `sistema_processos`
  a partir deste projeto, salvo pedido explícito.
