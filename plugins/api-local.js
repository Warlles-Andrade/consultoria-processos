/**
 * Serve as funções de `api/` também no `npm run dev`.
 *
 * Em produção elas rodam como funções serverless da Vercel. No servidor do
 * Vite elas simplesmente não existiam — criar usuário, resetar senha,
 * "esqueci minha senha" e as notificações por e-mail respondiam 404 local.
 *
 * Este plugin imita o contrato da Vercel o suficiente para as funções deste
 * projeto: `req.body` já parseado como JSON e `res.status().json()`.
 * Só atua em desenvolvimento (`apply: 'serve'`); o build não é afetado.
 */
import { loadEnv } from 'vite';

// Só nomes simples: bloqueia path traversal e esconde a pasta `_lib`.
const NOME_VALIDO = /^[a-z0-9-]+$/;

const responderJson = (res, status, corpo) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(corpo));
};

export default function apiLocal() {
  return {
    name: 'api-local',
    apply: 'serve',

    configureServer(server) {
      // As funções leem SUPABASE_SERVICE_ROLE_KEY, GMAIL_* etc. de process.env,
      // e o Vite só expõe as variáveis com prefixo VITE_. Carrega todas do .env
      // para process.env — apenas no processo do servidor, nunca no navegador.
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const [chave, valor] of Object.entries(env)) {
        if (process.env[chave] === undefined) process.env[chave] = valor;
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const nome = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '');
        if (!NOME_VALIDO.test(nome)) {
          return responderJson(res, 404, { error: 'Função não encontrada' });
        }

        let modulo;
        try {
          modulo = await server.ssrLoadModule(`/api/${nome}.js`);
        } catch {
          return responderJson(res, 404, { error: `Função /api/${nome} não encontrada` });
        }

        const partes = [];
        for await (const parte of req) partes.push(parte);
        const bruto = Buffer.concat(partes).toString('utf8');
        try {
          req.body = bruto ? JSON.parse(bruto) : {};
        } catch {
          req.body = bruto;
        }

        // Contrato mínimo das funções da Vercel usado neste projeto.
        res.status = (codigo) => {
          res.statusCode = codigo;
          return res;
        };
        res.json = (corpo) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(corpo));
          return res;
        };
        res.send = (corpo) => {
          res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
          return res;
        };

        try {
          await modulo.default(req, res);
        } catch (erro) {
          server.config.logger.error(`[api-local] /api/${nome}: ${erro?.stack || erro}`);
          if (!res.writableEnded) {
            responderJson(res, 500, { error: 'Erro interno na função local. Veja o terminal do servidor.' });
          }
        }
      });
    },
  };
}
