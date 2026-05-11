const TRANSIENT = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN']);

function isDbConnectionError(err) {
  return !!(err && TRANSIENT.has(err.code));
}

/**
 * Resposta JSON para erros de ligação à BD (ex.: Supabase host errado, rede).
 */
function sendJsonForDbError(res, err, { defaultMsg = 'Erro interno', log = true } = {}) {
  if (isDbConnectionError(err)) {
    return res.status(503).json({
      error:
        'Não foi possível ligar à base de dados. Confirme DATABASE_URL no .env: no Supabase use ' +
        'Project Settings → Database → Connection string (modo URI, host db.<ref>.supabase.co ou pooler). ' +
        'O ref do projeto tem de coincidir com o do painel.',
      code: 'DB_UNAVAILABLE',
      dbCode: err.code,
    });
  }
  if (log) console.error(err);
  return res.status(500).json({ error: defaultMsg });
}

module.exports = { isDbConnectionError, sendJsonForDbError };
