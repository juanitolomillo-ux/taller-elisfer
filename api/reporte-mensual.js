/**
 * API de reporte mensual — Vercel Serverless + Cron
 *
 * Envía el reporte SOLO al correo ADMIN_EMAIL (hardcodeado abajo).
 *
 * Variables de entorno en Vercel (Settings → Environment Variables):
 *   RESEND_API_KEY   = re_xxxx  (obligatoria para envío real)
 *   SUPABASE_URL     = https://xxx.supabase.co  (opcional; si no, usa la del código)
 *   SUPABASE_ANON_KEY = eyJ... (opcional; si no, usa la del código)
 *
 * Cron: día 1 de cada mes → reporte del MES ANTERIOR
 */

// ============================================================
//  >>>  MODIFICA AQUÍ TU CORREO (solo tú lo ves, no está en la web)
// ============================================================
const ADMIN_EMAIL = 'tu-correo@gmail.com';
// Ejemplo: const ADMIN_EMAIL = 'juan.taller@gmail.com';


const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kwgwsixsmppxibayxzor.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z3dzaXhzbXBweGliYXl4em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1OTE0NTYsImV4cCI6MjEwNTE2NzQ1Nn0.GMCXMDpvqBfycI9FXBeri-ixUae4U8h9MqqPXkcqKZg';

const MESES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL').format(Math.round(n || 0));
}

function periodoAnterior() {
  const now = new Date();
  let mes = now.getUTCMonth(); // 0-11; mes anterior
  let anio = now.getUTCFullYear();
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  return { mes, anio };
}

async function fetchOrdenes() {
  const url = `${SUPABASE_URL}/rest/v1/ordenes?select=*&order=fecha_guardado.desc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Supabase error: ' + res.status + ' ' + t);
  }
  const rows = await res.json();
  return (rows || []).map((row) => {
    const d = row.datos || {};
    return {
      ...d,
      id: row.id,
      ordenNumero: row.orden_numero || d.ordenNumero,
      clienteNombre: row.cliente_nombre || d.clienteNombre,
      matricula: row.matricula || d.matricula,
      fechaGuardado: row.fecha_guardado || d.fechaGuardado,
      fechaIngreso: d.fechaIngreso,
      total: d.total,
      costoDiagnostico: d.costoDiagnostico,
      costoManoObra: d.costoManoObra,
      costoRepuestos: d.costoRepuestos,
      iva: d.iva,
      estado: d.estado
    };
  });
}

function filtrarMes(ordenes, mes, anio) {
  return ordenes.filter((o) => {
    const raw = o.fechaIngreso || o.fechaGuardado || '';
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    return d.getMonth() + 1 === mes && d.getFullYear() === anio;
  });
}

function armarReporte(ordenes, mes, anio) {
  const ventas = ordenes.filter((o) => (o.estado || '') !== 'CANCELADO');
  const canceladas = ordenes.filter((o) => (o.estado || '') === 'CANCELADO');
  const sum = (k) => ventas.reduce((s, o) => s + (Number(o[k]) || 0), 0);

  return {
    mes,
    anio,
    mesNombre: MESES[mes],
    cantidad: ventas.length,
    canceladas: canceladas.length,
    totalIngresos: sum('total'),
    totalDiag: sum('costoDiagnostico'),
    totalMano: sum('costoManoObra'),
    totalRep: sum('costoRepuestos'),
    totalIva: sum('iva'),
    ventas
  };
}

function htmlEmail(r) {
  const filas = r.ventas
    .map((o) => {
      const raw = o.fechaIngreso || o.fechaGuardado || '';
      const f = raw ? new Date(raw).toLocaleDateString('es-CL') : '—';
      return `<tr>
        <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${o.ordenNumero || ''}</td>
        <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${f}</td>
        <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${o.clienteNombre || ''}</td>
        <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${o.matricula || ''}</td>
        <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">$${formatCLP(o.total)}</td>
      </tr>`;
    })
    .join('');

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
    <div style="background:#0f172a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">Taller Elisfer — Reporte de ventas</h2>
      <p style="margin:6px 0 0;opacity:0.85;">${r.mesNombre} ${r.anio}</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
      <table style="width:100%;margin-bottom:16px;">
        <tr>
          <td style="padding:10px;background:#f0f9ff;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#64748b;">Órdenes</div>
            <div style="font-size:22px;font-weight:700;">${r.cantidad}</div>
          </td>
          <td style="width:12px;"></td>
          <td style="padding:10px;background:#ecfdf5;border-radius:8px;text-align:center;">
            <div style="font-size:12px;color:#64748b;">Ingresos (c/IVA)</div>
            <div style="font-size:22px;font-weight:700;color:#15803d;">$${formatCLP(r.totalIngresos)}</div>
          </td>
        </tr>
      </table>
      <p style="font-size:14px;line-height:1.6;">
        Diagnóstico: <strong>$${formatCLP(r.totalDiag)}</strong><br/>
        Mano de obra: <strong>$${formatCLP(r.totalMano)}</strong><br/>
        Repuestos: <strong>$${formatCLP(r.totalRep)}</strong><br/>
        IVA: <strong>$${formatCLP(r.totalIva)}</strong><br/>
        Canceladas: <strong>${r.canceladas}</strong>
      </p>
      <h3 style="font-size:15px;margin:20px 0 8px;">Detalle</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:8px;text-align:left;">Nº</th>
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:left;">Cliente</th>
            <th style="padding:8px;text-align:left;">Patente</th>
            <th style="padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="5" style="padding:10px;">Sin órdenes</td></tr>'}</tbody>
      </table>
      <p style="font-size:11px;color:#94a3b8;margin-top:20px;">Uso interno del taller · Generado automáticamente</p>
    </div>
  </div>`;
}

function textoEmail(r) {
  return `Reporte de ventas — ${r.mesNombre} ${r.anio}

Órdenes: ${r.cantidad}
Ingresos (con IVA): $${formatCLP(r.totalIngresos)}
Diagnóstico: $${formatCLP(r.totalDiag)}
Mano de obra: $${formatCLP(r.totalMano)}
Repuestos: $${formatCLP(r.totalRep)}
IVA: $${formatCLP(r.totalIva)}
Canceladas: ${r.canceladas}

Detalle:
${r.ventas
  .map((o) => {
    const raw = o.fechaIngreso || o.fechaGuardado || '';
    const f = raw ? new Date(raw).toLocaleDateString('es-CL') : '';
    return `Nº ${o.ordenNumero} | ${f} | ${o.clienteNombre || ''} | ${o.matricula || ''} | $${formatCLP(o.total)}`;
  })
  .join('\n')}
`;
}

async function enviarConResend(asunto, html, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('Falta RESEND_API_KEY en variables de entorno de Vercel');
  }
  if (!ADMIN_EMAIL || ADMIN_EMAIL === 'tu-correo@gmail.com') {
    throw new Error('Configura ADMIN_EMAIL en api/reporte-mensual.js');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Taller Elisfer <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject: asunto,
      html,
      text
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || JSON.stringify(data) || 'Error Resend');
  }
  return data;
}

module.exports = async function handler(req, res) {
  // CORS básico
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let mes, anio;

    if (req.method === 'POST' && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.mes && body.anio) {
        mes = Number(body.mes);
        anio = Number(body.anio);
      }
    }

    // Cron (GET) o sin mes → mes anterior
    if (!mes || !anio) {
      const p = periodoAnterior();
      mes = p.mes;
      anio = p.anio;
    }

    const todas = await fetchOrdenes();
    const delMes = filtrarMes(todas, mes, anio);
    const reporte = armarReporte(delMes, mes, anio);

    const asunto = `Reporte ventas ${reporte.mesNombre} ${reporte.anio} — Taller Elisfer`;
    const html = htmlEmail(reporte);
    const text = textoEmail(reporte);

    const envio = await enviarConResend(asunto, html, text);

    return res.status(200).json({
      ok: true,
      enviadoA: ADMIN_EMAIL,
      periodo: `${reporte.mesNombre} ${reporte.anio}`,
      ordenes: reporte.cantidad,
      ingresos: reporte.totalIngresos,
      id: envio.id || null
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};
