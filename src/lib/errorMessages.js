// Mapeamento de códigos de erro do PostgreSQL/PostgREST para mensagens seguras.
// Evita expor nomes internos de tabelas, colunas e constraints na UI.

const PG_ERROR_MAP = {
  '23503': 'Referência inválida: um dado relacionado não foi encontrado.',
  '23505': 'Este registro já existe (valor duplicado).',
  '23502': 'Campo obrigatório não preenchido.',
  '42501': 'Sem permissão para realizar esta operação.',
  '42P01': 'Recurso não encontrado no banco de dados.',
  'PGRST116': 'Nenhum registro encontrado.',
  'PGRST301': 'Sessão expirada. Faça login novamente.',
  'invalid_credentials': 'Credenciais inválidas.',
  'email_not_confirmed': 'E-mail ainda não confirmado.',
  'over_request_rate_limit': 'Muitas tentativas. Aguarde um momento e tente novamente.',
  'user_already_exists': 'Este e-mail já está cadastrado.',
};

/**
 * Retorna uma mensagem segura para exibição ao usuário.
 * Loga o erro original no console para rastreamento interno.
 *
 * @param {object} error - Objeto de erro do Supabase/PostgREST
 * @returns {string} Mensagem amigável sem detalhes internos do banco
 */
export function getPublicErrorMessage(error) {
  if (!error) return 'Ocorreu um erro inesperado. Tente novamente.';

  // Logar somente em ambiente de desenvolvimento para não expor nos logs de prod
  if (import.meta.env.DEV) {
    console.error('[DB Error]', error);
  }

  const code = error.code ?? error.details?.code ?? error.error_description;

  if (code && PG_ERROR_MAP[code]) {
    return PG_ERROR_MAP[code];
  }

  // PostgREST às vezes retorna código dentro de error_description
  for (const [key, msg] of Object.entries(PG_ERROR_MAP)) {
    if (String(code).includes(key)) return msg;
  }

  return 'Ocorreu um erro inesperado. Tente novamente.';
}
