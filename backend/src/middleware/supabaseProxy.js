const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Encaminha /api/supabase/* → SUPABASE_URL/* (servidor resolve *.supabase.co).
 * O browser só contacta o teu API host — evita falhas de DNS/ISP para supabase.co.
 */
function supabaseProxyRouter(supabaseUrl) {
  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    return (req, res) => {
      res.status(503).json({
        error:
          'Proxy Supabase desativado: defina SUPABASE_URL no servidor (URL real https://<ref>.supabase.co).',
      });
    };
  }

  const target = supabaseUrl.replace(/\/$/, '');

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: true,
    proxyTimeout: 120_000,
    timeout: 120_000,
    logLevel: 'silent',
  });
}

module.exports = { supabaseProxyRouter };
