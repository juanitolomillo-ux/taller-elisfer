// =====================================================
// TALLER ELISFER — Sistema de Órdenes de Servicio
// Con soporte Supabase + localStorage (fallback)
// =====================================================

const STORAGE_KEY = 'taller_elisfer_ordenes';
const CONFIG_KEY = 'taller_elisfer_config';

// =====================================================
// CONEXIÓN SUPABASE PERMANENTE (oculta al público)
// =====================================================
const SUPABASE_URL = 'https://kwgwsixsmppxibayxzor.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xgnq_OViYDFk-LPvaWrKWw_7f9pXH1I';

let logoBase64 = null;
let ordenActualId = null;
let supabaseClient = null;
let useSupabase = false;

function initSupabase() {
  if (!window.supabase) return false;
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    useSupabase = true;
    console.log('✅ Supabase conectado de forma permanente');
    return true;
  } catch (e) {
    console.warn('Error al conectar Supabase:', e);
    useSupabase = false;
    return false;
  }
}


// ---------- UTILIDADES ----------
function formatCLP(n) {
  return new Intl.NumberFormat('es-CL').format(Math.round(n || 0));
}

function parseNumber(val) {
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function generateOrderNumber(ordenes) {
  let max = 0;
  (ordenes || []).forEach(o => {
    const num = parseInt(String(o.ordenNumero || o.orden_numero || '').replace(/\D/g, '') || '0', 10);
    if (num > max) max = num;
  });
  return String(max + 1).padStart(6, '0');
}

function nowLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

// ---------- STORAGE (Supabase + localStorage fallback) ----------
async function getOrdenes() {
  if (useSupabase && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('ordenes')
        .select('*')
        .order('fecha_guardado', { ascending: false });

      if (error) throw error;

      // Normalizar: los datos completos están en la columna "datos" (jsonb)
      return (data || []).map(row => {
        const d = row.datos || {};
        return {
          ...d,
          id: row.id,
          ordenNumero: row.orden_numero || d.ordenNumero,
          clienteRut: row.cliente_rut || d.clienteRut,
          clienteNombre: row.cliente_nombre || d.clienteNombre,
          matricula: row.matricula || d.matricula,
          fechaGuardado: row.fecha_guardado || d.fechaGuardado
        };
      });
    } catch (e) {
      console.error('Error leyendo Supabase:', e);
      alert('Error al leer de Supabase. Se usará almacenamiento local temporalmente.\n' + (e.message || e));
      useSupabase = false;
    }
  }

  // Fallback localStorage
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

async function saveOrdenToDB(datos) {
  if (useSupabase && supabaseClient) {
    try {
      const row = {
        id: datos.id,
        orden_numero: datos.ordenNumero,
        cliente_rut: datos.clienteRut,
        cliente_nombre: datos.clienteNombre,
        matricula: datos.matricula,
        fecha_guardado: new Date().toISOString(),
        datos: datos   // todo el objeto completo en jsonb
      };

      const { error } = await supabaseClient
        .from('ordenes')
        .upsert(row, { onConflict: 'id' });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Error guardando en Supabase:', e);
      alert('Error al guardar en Supabase:\n' + (e.message || e) + '\n\nSe guardará localmente como respaldo.');
      // cae al localStorage
    }
  }

  // Fallback localStorage
  const ordenes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const idx = ordenes.findIndex(o => o.id === datos.id);
  if (idx >= 0) ordenes[idx] = datos;
  else ordenes.push(datos);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordenes));
  return true;
}

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveConfig() {
  const config = {
    empresaNombre: document.getElementById('empresaNombre').value,
    empresaRut: document.getElementById('empresaRut').value,
    empresaDireccion: document.getElementById('empresaDireccion').value,
    empresaTel: document.getElementById('empresaTel').value,
    empresaEmail: document.getElementById('empresaEmail').value
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function loadConfig() {
  const c = getConfig();
  if (c.empresaNombre) document.getElementById('empresaNombre').value = c.empresaNombre;
  if (c.empresaRut) document.getElementById('empresaRut').value = c.empresaRut;
  if (c.empresaDireccion) document.getElementById('empresaDireccion').value = c.empresaDireccion;
  if (c.empresaTel) document.getElementById('empresaTel').value = c.empresaTel;
  if (c.empresaEmail) document.getElementById('empresaEmail').value = c.empresaEmail;
}

// Carga automática del logo (archivo fijo: logo.png en la misma carpeta)
function loadLogo() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    // Convertir a base64 para usarlo también en el PDF
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    try {
      logoBase64 = canvas.toDataURL('image/png');
    } catch (e) {
      logoBase64 = 'logo.png'; // fallback por si hay CORS
    }
    const preview = document.getElementById('logoPreview');
    if (preview) preview.innerHTML = `<img src="logo.png" alt="Logo">`;
  };
  img.onerror = function () {
    console.log('No se encontró logo.png — se mostrará sin logo hasta que lo subas.');
  };
  img.src = 'logo.png';
}


// ---------- TRABAJOS DINÁMICOS ----------
function addTrabajo(texto = '') {
  const list = document.getElementById('trabajosList');
  const div = document.createElement('div');
  div.className = 'trabajo-item';
  div.innerHTML = `
    <input type="text" class="trabajo-texto" placeholder="Ej: Diagnóstico computarizado — Escaneo completo del sistema..." value="${texto.replace(/"/g, '&quot;')}">
    <button type="button" class="btn-remove" title="Eliminar">×</button>
  `;
  div.querySelector('.btn-remove').addEventListener('click', () => div.remove());
  list.appendChild(div);
}

function getTrabajos() {
  return Array.from(document.querySelectorAll('.trabajo-texto'))
    .map(i => i.value.trim())
    .filter(t => t.length > 0);
}

// ---------- REPUESTOS DINÁMICOS ----------
function addRepuesto(desc = '', cant = 1, valor = 0) {
  const tbody = document.getElementById('repuestosBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="rep-desc" placeholder="Descripción del repuesto" value="${desc.replace(/"/g, '&quot;')}"></td>
    <td><input type="number" class="rep-cant" min="1" step="1" value="${cant}"></td>
    <td><input type="number" class="rep-valor" min="0" step="100" value="${valor}"></td>
    <td><input type="number" class="rep-total" readonly value="${cant * valor}"></td>
    <td><button type="button" class="btn-remove" title="Eliminar">×</button></td>
  `;

  const cantInput = tr.querySelector('.rep-cant');
  const valorInput = tr.querySelector('.rep-valor');
  const totalInput = tr.querySelector('.rep-total');

  function recalc() {
    const c = parseNumber(cantInput.value) || 0;
    const v = parseNumber(valorInput.value) || 0;
    totalInput.value = Math.round(c * v);
    calcularTotales();
  }

  cantInput.addEventListener('input', recalc);
  valorInput.addEventListener('input', recalc);
  tr.querySelector('.btn-remove').addEventListener('click', () => {
    tr.remove();
    calcularTotales();
  });

  tbody.appendChild(tr);
  calcularTotales();
}

function getRepuestos() {
  return Array.from(document.querySelectorAll('#repuestosBody tr')).map(tr => {
    const desc = tr.querySelector('.rep-desc').value.trim();
    const cant = parseNumber(tr.querySelector('.rep-cant').value) || 0;
    const valor = parseNumber(tr.querySelector('.rep-valor').value) || 0;
    return { descripcion: desc, cantidad: cant, valorUnitario: valor, total: cant * valor };
  }).filter(r => r.descripcion.length > 0);
}

// ---------- CÁLCULOS ----------
function calcularTotales() {
  const repuestos = getRepuestos();
  const totalRepuestos = repuestos.reduce((s, r) => s + r.total, 0);
  document.getElementById('costoRepuestos').value = Math.round(totalRepuestos);

  const diag = parseNumber(document.getElementById('costoDiagnostico').value);
  const mano = parseNumber(document.getElementById('costoManoObra').value);
  const subtotal = diag + mano + totalRepuestos;
  const iva = Math.round(subtotal * 0.19);
  const total = subtotal + iva;

  document.getElementById('subtotal').value = Math.round(subtotal);
  document.getElementById('iva').value = iva;
  document.getElementById('total').value = total;
}

// ---------- FORMULARIO ----------
async function limpiarFormulario() {
  ordenActualId = null;
  const ordenes = await getOrdenes();
  document.getElementById('ordenNumero').value = generateOrderNumber(ordenes);
  document.getElementById('estado').value = 'FINALIZADO';
  document.getElementById('clienteNombre').value = '';
  document.getElementById('clienteRut').value = '';
  document.getElementById('clienteTel').value = '';
  document.getElementById('clienteEmail').value = '';
  document.getElementById('fechaIngreso').value = nowLocalDatetime();
  document.getElementById('fechaEntrega').value = '';
  document.getElementById('recepcionadoPor').value = '';
  document.getElementById('vehiculo').value = '';
  document.getElementById('matricula').value = '';
  document.getElementById('combustible').value = 'Diesel';
  document.getElementById('kilometraje').value = '';
  document.getElementById('trabajosList').innerHTML = '';
  document.getElementById('repuestosBody').innerHTML = '';
  document.getElementById('costoDiagnostico').value = 0;
  document.getElementById('costoManoObra').value = 0;
  document.getElementById('observaciones').value = '';
  document.getElementById('firmaCliente').value = '';
  document.getElementById('firmaTaller').value = document.getElementById('empresaNombre').value || 'TALLER ELISFER';

  addTrabajo();
  addRepuesto();
  calcularTotales();
}

function cargarOrden(orden) {
  ordenActualId = orden.id;
  document.getElementById('ordenNumero').value = orden.ordenNumero || '';
  document.getElementById('estado').value = orden.estado || 'FINALIZADO';
  document.getElementById('clienteNombre').value = orden.clienteNombre || '';
  document.getElementById('clienteRut').value = orden.clienteRut || '';
  document.getElementById('clienteTel').value = orden.clienteTel || '';
  document.getElementById('clienteEmail').value = orden.clienteEmail || '';
  document.getElementById('fechaIngreso').value = orden.fechaIngreso || '';
  document.getElementById('fechaEntrega').value = orden.fechaEntrega || '';
  document.getElementById('recepcionadoPor').value = orden.recepcionadoPor || '';
  document.getElementById('vehiculo').value = orden.vehiculo || '';
  document.getElementById('matricula').value = orden.matricula || '';
  document.getElementById('combustible').value = orden.combustible || 'Diesel';
  document.getElementById('kilometraje').value = orden.kilometraje || '';
  document.getElementById('costoDiagnostico').value = orden.costoDiagnostico || 0;
  document.getElementById('costoManoObra').value = orden.costoManoObra || 0;
  document.getElementById('observaciones').value = orden.observaciones || '';
  document.getElementById('firmaCliente').value = orden.firmaCliente || '';
  document.getElementById('firmaTaller').value = orden.firmaTaller || '';

  document.getElementById('trabajosList').innerHTML = '';
  (orden.trabajos || []).forEach(t => addTrabajo(t));
  if ((orden.trabajos || []).length === 0) addTrabajo();

  document.getElementById('repuestosBody').innerHTML = '';
  (orden.repuestos || []).forEach(r => addRepuesto(r.descripcion, r.cantidad, r.valorUnitario));
  if ((orden.repuestos || []).length === 0) addRepuesto();

  calcularTotales();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function recolectarDatos() {
  return {
    id: ordenActualId || uuid(),
    ordenNumero: document.getElementById('ordenNumero').value,
    estado: document.getElementById('estado').value,
    clienteNombre: document.getElementById('clienteNombre').value.trim(),
    clienteRut: document.getElementById('clienteRut').value.trim(),
    clienteTel: document.getElementById('clienteTel').value.trim(),
    clienteEmail: document.getElementById('clienteEmail').value.trim(),
    fechaIngreso: document.getElementById('fechaIngreso').value,
    fechaEntrega: document.getElementById('fechaEntrega').value,
    recepcionadoPor: document.getElementById('recepcionadoPor').value.trim(),
    vehiculo: document.getElementById('vehiculo').value.trim(),
    matricula: document.getElementById('matricula').value.trim().toUpperCase(),
    combustible: document.getElementById('combustible').value,
    kilometraje: document.getElementById('kilometraje').value,
    trabajos: getTrabajos(),
    repuestos: getRepuestos(),
    costoDiagnostico: parseNumber(document.getElementById('costoDiagnostico').value),
    costoManoObra: parseNumber(document.getElementById('costoManoObra').value),
    costoRepuestos: parseNumber(document.getElementById('costoRepuestos').value),
    subtotal: parseNumber(document.getElementById('subtotal').value),
    iva: parseNumber(document.getElementById('iva').value),
    total: parseNumber(document.getElementById('total').value),
    observaciones: document.getElementById('observaciones').value.trim(),
    firmaCliente: document.getElementById('firmaCliente').value.trim(),
    firmaTaller: document.getElementById('firmaTaller').value.trim(),
    empresa: {
      nombre: document.getElementById('empresaNombre').value,
      rut: document.getElementById('empresaRut').value,
      direccion: document.getElementById('empresaDireccion').value,
      tel: document.getElementById('empresaTel').value,
      email: document.getElementById('empresaEmail').value
    },
    fechaGuardado: new Date().toISOString()
  };
}

async function guardarOrden() {
  const datos = recolectarDatos();
  if (!datos.clienteNombre || !datos.clienteRut || !datos.vehiculo || !datos.matricula) {
    alert('Completa al menos: Cliente, RUT, Vehículo y Matrícula.');
    return;
  }

  saveConfig();
  const ok = await saveOrdenToDB(datos);
  if (ok) {
    ordenActualId = datos.id;
    const donde = useSupabase ? 'Supabase (nube)' : 'almacenamiento local';
    alert(`✅ Orden guardada correctamente en ${donde}.\nNº ${datos.ordenNumero}`);
  }
}

// ---------- BUSCADOR ----------
function abrirBuscador() {
  document.getElementById('modalBuscar').classList.remove('hidden');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '<p class="hint">Escribe RUT, nombre o patente y presiona Buscar.</p>';
  document.getElementById('searchInput').focus();
}

function cerrarBuscador() {
  document.getElementById('modalBuscar').classList.add('hidden');
}

async function realizarBusqueda() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const resultsDiv = document.getElementById('searchResults');

  if (!q) {
    resultsDiv.innerHTML = '<p class="hint">Escribe algo para buscar.</p>';
    return;
  }

  resultsDiv.innerHTML = '<p class="hint">Buscando...</p>';

  const ordenes = await getOrdenes();
  const filtradas = ordenes.filter(o => {
    return (
      (o.clienteRut || '').toLowerCase().includes(q) ||
      (o.clienteNombre || '').toLowerCase().includes(q) ||
      (o.matricula || '').toLowerCase().includes(q) ||
      (o.ordenNumero || '').toLowerCase().includes(q)
    );
  }).sort((a, b) => (b.fechaGuardado || '').localeCompare(a.fechaGuardado || ''));

  if (filtradas.length === 0) {
    resultsDiv.innerHTML = '<p class="hint">No se encontraron órdenes con ese criterio.</p>';
    return;
  }

  resultsDiv.innerHTML = filtradas.map(o => {
    const fecha = o.fechaIngreso ? new Date(o.fechaIngreso).toLocaleDateString('es-CL') : '—';
    return `
      <div class="orden-item" data-id="${o.id}">
        <div>
          <span class="orden-num">Nº ${o.ordenNumero}</span>
          <span class="estado-badge estado-${(o.estado || '').replace(/ /g, '\\ ')}">${o.estado || ''}</span>
        </div>
        <div class="meta">
          <strong>${o.clienteNombre || '—'}</strong> · RUT ${o.clienteRut || '—'} · ${o.vehiculo || ''} (${o.matricula || ''})
        </div>
        <div class="meta">Ingreso: ${fecha} · Total: $${formatCLP(o.total)}</div>
      </div>
    `;
  }).join('');

  resultsDiv.querySelectorAll('.orden-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const orden = ordenes.find(o => o.id === id);
      if (orden) {
        cargarOrden(orden);
        cerrarBuscador();
      }
    });
  });
}

// =====================================================
// PDF — DISEÑO NUEVO Y DISTINTO (moderno y limpio)
// =====================================================
function generarPDF() {
  const datos = recolectarDatos();
  if (!datos.clienteNombre || !datos.clienteRut) {
    alert('Completa al menos los datos del cliente antes de generar el PDF.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297
  const m = 16; // margin
  let y = 0;

  // Paleta nueva (más moderna, no igual a la imagen)
  const primary = [15, 23, 42];      // slate-900
  const accent  = [14, 165, 233];    // sky-500
  const soft    = [241, 245, 249];   // slate-100
  const muted   = [100, 116, 139];   // slate-500
  const dark    = [30, 41, 59];      // slate-800
  const green   = [22, 163, 74];     // green-600

  // ===== BARRA SUPERIOR DE COLOR =====
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 28, 'F');

  // Franja accent
  doc.setFillColor(...accent);
  doc.rect(0, 28, pageW, 2.5, 'F');

  // Logo (si existe)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', m, 5, 18, 18);
    } catch (e) {}
  }

  // Nombre taller
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(datos.empresa.nombre || 'TALLER ELISFER', logoBase64 ? m + 22 : m, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 210, 220);
  doc.text('Servicio Mecánico Automotriz  •  Mantención  •  Diagnóstico', logoBase64 ? m + 22 : m, 20);

  // Número de orden (derecha del header)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`N° ${datos.ordenNumero}`, pageW - m, 12, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(180, 200, 220);
  doc.text(datos.estado || '', pageW - m, 19, { align: 'right' });

  y = 38;

  // ===== INFO EMPRESA (línea pequeña) =====
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  const infoEmp = [
    datos.empresa.direccion,
    datos.empresa.tel ? `Tel: ${datos.empresa.tel}` : '',
    datos.empresa.email || '',
    datos.empresa.rut ? `RUT: ${datos.empresa.rut}` : ''
  ].filter(Boolean).join('   ·   ');
  doc.text(infoEmp, pageW / 2, y, { align: 'center' });
  y += 8;

  // ===== BLOQUE CLIENTE + SERVICIO =====
  const colW = (pageW - m * 2 - 5) / 2;

  // Cliente
  doc.setFillColor(...soft);
  doc.roundedRect(m, y, colW, 36, 2, 2, 'F');
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.8);
  doc.line(m, y, m, y + 36); // barra lateral accent

  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CLIENTE', m + 5, y + 6);

  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let cy = y + 13;
  doc.setFont('helvetica', 'bold');
  doc.text(datos.clienteNombre || '—', m + 5, cy);
  doc.setFont('helvetica', 'normal');
  cy += 5.5;
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(`RUT: ${datos.clienteRut || '—'}`, m + 5, cy); cy += 4.5;
  doc.text(`Tel: ${datos.clienteTel || '—'}`, m + 5, cy); cy += 4.5;
  doc.text(datos.clienteEmail || '', m + 5, cy);

  // Servicio
  const sx = m + colW + 5;
  doc.setFillColor(...soft);
  doc.roundedRect(sx, y, colW, 36, 2, 2, 'F');
  doc.setDrawColor(...accent);
  doc.line(sx, y, sx, y + 36);

  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SERVICIO', sx + 5, y + 6);

  function fmtFecha(dt) {
    if (!dt) return '—';
    try {
      const d = new Date(dt);
      return d.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dt; }
  }

  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  cy = y + 13;
  doc.text(`Ingreso:   ${fmtFecha(datos.fechaIngreso)}`, sx + 5, cy); cy += 5.5;
  doc.text(`Entrega:   ${fmtFecha(datos.fechaEntrega)}`, sx + 5, cy); cy += 5.5;
  doc.text(`Recepciona: ${datos.recepcionadoPor || '—'}`, sx + 5, cy);

  y += 42;

  // ===== VEHÍCULO (banda horizontal) =====
  doc.setFillColor(...primary);
  doc.roundedRect(m, y, pageW - m * 2, 16, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VEHÍCULO', m + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(datos.vehiculo || '—', m + 4, y + 12);
  doc.text(`Patente: ${datos.matricula || '—'}`, m + 95, y + 12);
  doc.text(`${datos.combustible || ''}  ·  ${datos.kilometraje ? formatCLP(datos.kilometraje) + ' km' : ''}`, m + 140, y + 12);

  y += 22;

  // ===== TRABAJOS REALIZADOS =====
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TRABAJOS REALIZADOS', m, y);
  y += 2;
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.6);
  doc.line(m, y + 1, m + 48, y + 1);
  y += 7;

  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);

  if (!datos.trabajos || datos.trabajos.length === 0) {
    doc.setTextColor(...muted);
    doc.text('Sin trabajos registrados', m + 2, y);
    y += 6;
  } else {
    datos.trabajos.forEach((t, i) => {
      const lines = doc.splitTextToSize(`${i + 1}.  ${t}`, pageW - m * 2 - 4);
      // viñeta
      doc.setFillColor(...accent);
      doc.circle(m + 1.5, y - 1, 1.1, 'F');
      doc.setTextColor(...dark);
      doc.text(lines, m + 5, y);
      y += lines.length * 4.3 + 2;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
    });
  }

  y += 4;

  // ===== REPUESTOS =====
  if (datos.repuestos && datos.repuestos.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }

    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('REPUESTOS Y MATERIALES', m, y);
    y += 2;
    doc.setDrawColor(...accent);
    doc.line(m, y + 1, m + 52, y + 1);
    y += 6;

    const tableBody = datos.repuestos.map(r => [
      r.descripcion,
      String(r.cantidad),
      '$ ' + formatCLP(r.valorUnitario),
      '$ ' + formatCLP(r.total)
    ]);

    doc.autoTable({
      startY: y,
      head: [['Descripción', 'Cant.', 'P. Unitario', 'Total']],
      body: tableBody,
      margin: { left: m, right: m },
      styles: {
        fontSize: 8,
        cellPadding: 2.8,
        textColor: dark,
        lineColor: [226, 232, 240],
        lineWidth: 0.3
      },
      headStyles: {
        fillColor: primary,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 3
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
      },
      theme: 'grid'
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== RESUMEN DE COSTOS (caja moderna a la derecha) =====
  if (y > 225) { doc.addPage(); y = 20; }

  const boxW = 78;
  const boxX = pageW - m - boxW;
  const boxH = 48;

  // Fondo suave
  doc.setFillColor(...soft);
  doc.roundedRect(boxX, y, boxW, boxH, 3, 3, 'F');

  // Borde accent izquierdo
  doc.setFillColor(...accent);
  doc.rect(boxX, y, 2.5, boxH, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);

  let ry = y + 7;
  const lx = boxX + 7;
  const vx = boxX + boxW - 5;

  const lineas = [
    ['Diagnóstico', datos.costoDiagnostico],
    ['Mano de Obra', datos.costoManoObra],
    ['Repuestos', datos.costoRepuestos],
    ['Subtotal', datos.subtotal],
    ['IVA 19%', datos.iva]
  ];

  lineas.forEach(([label, val], idx) => {
    if (idx === 3) {
      doc.setDrawColor(200, 210, 220);
      doc.setLineWidth(0.3);
      doc.line(lx, ry - 2.5, vx, ry - 2.5);
    }
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.text(label, lx, ry);
    doc.setTextColor(...dark);
    doc.setFont('helvetica', idx >= 3 ? 'bold' : 'normal');
    doc.text('$ ' + formatCLP(val), vx, ry, { align: 'right' });
    ry += 5.8;
  });

  // TOTAL destacado
  doc.setFillColor(...primary);
  doc.roundedRect(boxX, y + boxH - 11, boxW, 11, 0, 0, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', lx, y + boxH - 3.5);
  doc.text('$ ' + formatCLP(datos.total), vx, y + boxH - 3.5, { align: 'right' });

  // ===== OBSERVACIONES =====
  let obsY = y + 4;
  if (datos.observaciones) {
    if (obsY > 240) { doc.addPage(); obsY = 20; }

    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('OBSERVACIONES', m, obsY);
    obsY += 2;
    doc.setDrawColor(...accent);
    doc.line(m, obsY + 1, m + 38, obsY + 1);
    obsY += 6;

    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const obsLines = doc.splitTextToSize(datos.observaciones, pageW - m * 2 - boxW - 10);
    doc.text(obsLines, m, obsY);
  }

  // ===== FIRMAS =====
  const firmaY = 268;

  doc.setDrawColor(180, 190, 200);
  doc.setLineWidth(0.4);
  doc.line(m + 5, firmaY, m + 65, firmaY);
  doc.line(pageW - m - 65, firmaY, pageW - m - 5, firmaY);

  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text('Firma Cliente', m + 35, firmaY + 5, { align: 'center' });
  doc.text('Firma Taller', pageW - m - 35, firmaY + 5, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'bold');
  if (datos.firmaCliente) {
    doc.text(datos.firmaCliente, m + 35, firmaY - 3, { align: 'center' });
  }
  doc.text(datos.firmaTaller || datos.empresa.nombre || 'TALLER ELISFER', pageW - m - 35, firmaY - 3, { align: 'center' });

  // ===== PIE =====
  doc.setFillColor(...primary);
  doc.rect(0, pageH - 10, pageW, 10, 'F');
  doc.setTextColor(180, 190, 200);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `Gracias por confiar en ${datos.empresa.nombre || 'TALLER ELISFER'}  •  Garantía 30 días en mano de obra  •  Conserve este comprobante`,
    pageW / 2, pageH - 4, { align: 'center' }
  );

  // Descargar
  const nombreArchivo = `Orden_${datos.ordenNumero}_${(datos.matricula || 'sinpatente').replace(/\s/g, '')}.pdf`;
  doc.save(nombreArchivo);
}

// ---------- EVENTOS ----------
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar Supabase (conexión permanente, sin UI pública)
  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => initSupabase();
    document.head.appendChild(script);
  } else {
    initSupabase();
  }

  loadConfig();
  loadLogo();          // carga automática de logo.png
  await limpiarFormulario();

  // Botones principales
  document.getElementById('btnAddTrabajo').addEventListener('click', () => addTrabajo());
  document.getElementById('btnAddRepuesto').addEventListener('click', () => addRepuesto());
  document.getElementById('btnGuardar').addEventListener('click', guardarOrden);
  document.getElementById('btnGenerarPdf').addEventListener('click', generarPDF);
  document.getElementById('btnNueva').addEventListener('click', async () => {
    if (confirm('¿Crear una nueva orden? Se perderán los datos no guardados del formulario actual.')) {
      await limpiarFormulario();
    }
  });
  document.getElementById('btnBuscar').addEventListener('click', abrirBuscador);
  document.getElementById('cerrarModal').addEventListener('click', cerrarBuscador);
  document.getElementById('btnDoSearch').addEventListener('click', realizarBusqueda);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') realizarBusqueda();
  });

  // Costos en vivo
  ['costoDiagnostico', 'costoManoObra'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcularTotales);
  });

  // Guardar datos de empresa al cambiar
  ['empresaNombre', 'empresaRut', 'empresaDireccion', 'empresaTel', 'empresaEmail'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveConfig);
  });

  // Cerrar modal
  document.getElementById('modalBuscar').addEventListener('click', e => {
    if (e.target.id === 'modalBuscar') cerrarBuscador();
  });
});

function toggleSection(bodyId) {
  const section = document.getElementById('empresaSection');
  section.classList.toggle('collapsed');
}
