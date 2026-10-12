/**
 * Keep-alive Supabase — evita pausa por inactividad (free tier)
 * Cron: cada día
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kwgwsixsmppxibayxzor.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z3dzaXhzbXBweGliYXl4em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1OTE0NTYsImV4cCI6MjEwNTE2NzQ1Nn0.GMCXMDpvqBfycI9FXBeri-ixUae4U8h9MqqPXkcqKZg';

async function ping(tabla) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  return { tabla, ok: res.ok, status: res.status };
}

module.exports = async function handler(req, res) {
  try {
    // Tablas de las 2 páginas (mismo proyecto Supabase)
    const resultados = await Promise.all([
      ping('ordenes'),          // Taller Elisfer
      ping('ordenes_elfagas')   // Soluciones Gasfitería
    ]);
    return res.status(200).json({
      ok: true,
      mensaje: 'Keep-alive ejecutado',
      resultados,
      fecha: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};
