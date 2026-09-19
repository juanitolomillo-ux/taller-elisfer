// =====================================================
// TALLER ELISFER — Sistema de Órdenes de Servicio
// Con soporte Supabase + localStorage (fallback)
// =====================================================

const STORAGE_KEY = 'taller_elisfer_ordenes';
const CONFIG_KEY = 'taller_elisfer_config';

// =====================================================
// CONEXIÓN SUPABASE PERMANENTE (oculta al público)
// =====================================================
// >>> Cambia este correo: aquí llega el reporte mensual (no se muestra en la web)
const ADMIN_EMAIL = 'tu-correo@gmail.com';

const SUPABASE_URL = 'https://kwgwsixsmppxibayxzor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z3dzaXhzbXBweGliYXl4em9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1OTE0NTYsImV4cCI6MjEwNTE2NzQ1Nn0.GMCXMDpvqBfycI9FXBeri-ixUae4U8h9MqqPXkcqKZg';

let logoBase64 = null;
let ultimoReporte = null; // datos del último reporte generado
let ordenActualId = null;
let supabaseClient = null;
let useSupabase = false;

function initSupabase() {
  if (!window.supabase) {
    console.warn('Librería supabase no cargada aún');
    return false;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    useSupabase = true;
    console.log('✅ Supabase cliente creado');
    // Prueba rápida de conexión (no bloquea)
    supabaseClient.from('ordenes').select('id').limit(1).then(({ error }) => {
      if (error) {
        console.error('❌ Error de conexión/tabla Supabase:', error);
        useSupabase = false;
      } else {
        console.log('✅ Supabase OK — tabla ordenes accesible');
      }
    });
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
        datos: datos
      };

      const { data, error } = await supabaseClient
        .from('ordenes')
        .upsert(row, { onConflict: 'id' })
        .select();

      if (error) {
        console.error('Error Supabase completo:', error);
        throw new Error(error.message || JSON.stringify(error));
      }

      console.log('Guardado en Supabase:', data);
      return { ok: true, donde: 'Supabase (nube)' };
    } catch (e) {
      console.error('Error guardando en Supabase:', e);
      alert('❌ Error al guardar en Supabase:\n\n' + (e.message || e) + '\n\nSe guardará solo en este navegador como respaldo.\nRevisa la consola (F12) para más detalles.');
      useSupabase = false;
    }
  }

  // Fallback localStorage
  const ordenes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const idx = ordenes.findIndex(o => o.id === datos.id);
  if (idx >= 0) ordenes[idx] = datos;
  else ordenes.push(datos);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordenes));
  return { ok: true, donde: 'almacenamiento local (este navegador)' };
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
  const cfg = getConfig();
  if (cfg.empresaNombre) document.getElementById('empresaNombre').value = cfg.empresaNombre;
  if (cfg.empresaRut) document.getElementById('empresaRut').value = cfg.empresaRut;
  if (cfg.empresaDireccion) document.getElementById('empresaDireccion').value = cfg.empresaDireccion;
  if (cfg.empresaTel) document.getElementById('empresaTel').value = cfg.empresaTel;
  if (cfg.empresaEmail) document.getElementById('empresaEmail').value = cfg.empresaEmail;
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
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 42) + 'px';
}

function addTrabajo(texto = '') {
  const list = document.getElementById('trabajosList');
  const div = document.createElement('div');
  div.className = 'trabajo-item';
  div.innerHTML = `
    <textarea class="trabajo-texto" rows="1" placeholder="Ej: Diagnóstico computarizado — Escaneo completo del sistema...">${texto.replace(/</g, '&lt;')}</textarea>
    <button type="button" class="btn-remove" title="Eliminar">×</button>
  `;
  const ta = div.querySelector('.trabajo-texto');
  ta.addEventListener('input', () => autoResizeTextarea(ta));
  div.querySelector('.btn-remove').addEventListener('click', () => div.remove());
  list.appendChild(div);
  if (texto) setTimeout(() => autoResizeTextarea(ta), 0);
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
    <td><textarea class="rep-desc" rows="1" placeholder="Descripción del repuesto">${desc.replace(/</g, '&lt;')}</textarea></td>
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

  const descTa = tr.querySelector('.rep-desc');
  descTa.addEventListener('input', () => autoResizeTextarea(descTa));
  if (desc) setTimeout(() => autoResizeTextarea(descTa), 0);

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
  document.getElementById('proximaRevisionKm').value = '';
  document.getElementById('proximaRevisionFecha').value = '';
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
  document.getElementById('proximaRevisionKm').value = orden.proximaRevisionKm || '';
  document.getElementById('proximaRevisionFecha').value = orden.proximaRevisionFecha || '';
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
    proximaRevisionKm: document.getElementById('proximaRevisionKm').value,
    proximaRevisionFecha: document.getElementById('proximaRevisionFecha').value.trim(),
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
  const resultado = await saveOrdenToDB(datos);
  if (resultado && resultado.ok) {
    ordenActualId = datos.id;
    alert(`✅ Orden guardada correctamente en ${resultado.donde}.\nNº ${datos.ordenNumero}`);
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

  // ===== OBSERVACIONES (ancho completo, debajo de los totales) =====
  let obsY = y + boxH + 8;
  if (datos.observaciones) {
    if (obsY > 245) { doc.addPage(); obsY = 20; }

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
    // Ancho completo de la hoja
    const obsLines = doc.splitTextToSize(datos.observaciones, pageW - m * 2);
    doc.text(obsLines, m, obsY);
    obsY += obsLines.length * 4 + 4;
  }

  // ===== PRÓXIMA REVISIÓN =====
  if (datos.proximaRevisionKm || datos.proximaRevisionFecha) {
    if (obsY > 250) { doc.addPage(); obsY = 20; }
    doc.setFillColor(240, 249, 255);
    doc.roundedRect(m, obsY, pageW - m * 2, 14, 2, 2, 'F');
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.5);
    doc.roundedRect(m, obsY, pageW - m * 2, 14, 2, 2, 'S');
    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PRÓXIMA REVISIÓN / MANTENCIÓN', m + 4, obsY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...dark);
    let revTxt = [];
    if (datos.proximaRevisionKm) revTxt.push('a los ' + formatCLP(datos.proximaRevisionKm) + ' km');
    if (datos.proximaRevisionFecha) revTxt.push(datos.proximaRevisionFecha);
    doc.text(revTxt.join('  ·  ') || '—', m + 4, obsY + 11);
    obsY += 18;
  }

  // ===== FIRMAS =====
  const firmaY = Math.min(Math.max(obsY + 12, 255), 268);

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


// ---------- REPORTE MENSUAL ----------
const MESES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function abrirReporte() {
  const now = new Date();
  document.getElementById('reporteMes').value = String(now.getMonth() + 1);
  document.getElementById('reporteAnio').value = now.getFullYear();
  document.getElementById('reporteResumen').innerHTML = '<p class="hint">Elige mes y año, luego Generar reporte.</p>';
  document.getElementById('btnPdfReporte').disabled = true;
  ultimoReporte = null;
  document.getElementById('modalReporte').classList.remove('hidden');
}

function cerrarReporte() {
  document.getElementById('modalReporte').classList.add('hidden');
}

function fechaOrdenParaFiltro(o) {
  // Prioriza fecha de ingreso, luego fecha de guardado
  const raw = o.fechaIngreso || o.fechaGuardado || '';
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

async function generarReporteMensual() {
  const mes = parseInt(document.getElementById('reporteMes').value, 10);
  const anio = parseInt(document.getElementById('reporteAnio').value, 10);
  const box = document.getElementById('reporteResumen');
  box.innerHTML = '<p class="hint">Cargando órdenes...</p>';

  const ordenes = await getOrdenes();
  const filtradas = ordenes.filter(o => {
    const d = fechaOrdenParaFiltro(o);
    if (!d) return false;
    return d.getMonth() + 1 === mes && d.getFullYear() === anio;
  });

  // Solo órdenes finalizadas cuentan como venta (las canceladas se listan aparte)
  const ventas = filtradas.filter(o => (o.estado || '') !== 'CANCELADO');
  const canceladas = filtradas.filter(o => (o.estado || '') === 'CANCELADO');

  const totalIngresos = ventas.reduce((s, o) => s + (parseNumber(o.total) || 0), 0);
  const totalDiag = ventas.reduce((s, o) => s + (parseNumber(o.costoDiagnostico) || 0), 0);
  const totalMano = ventas.reduce((s, o) => s + (parseNumber(o.costoManoObra) || 0), 0);
  const totalRep = ventas.reduce((s, o) => s + (parseNumber(o.costoRepuestos) || 0), 0);
  const totalIva = ventas.reduce((s, o) => s + (parseNumber(o.iva) || 0), 0);

  ultimoReporte = {
    mes, anio,
    mesNombre: MESES_NOMBRE[mes],
    ventas,
    canceladas,
    totalIngresos,
    totalDiag,
    totalMano,
    totalRep,
    totalIva,
    cantidad: ventas.length
  };

  if (filtradas.length === 0) {
    box.innerHTML = `<p class="hint">No hay órdenes en ${MESES_NOMBRE[mes]} ${anio}.</p>`;
    document.getElementById('btnPdfReporte').disabled = true;
    return;
  }

  const filas = ventas
    .sort((a, b) => (a.ordenNumero || '').localeCompare(b.ordenNumero || ''))
    .map(o => {
      const f = fechaOrdenParaFiltro(o);
      const fStr = f ? f.toLocaleDateString('es-CL') : '—';
      return `<tr>
        <td>${o.ordenNumero || '—'}</td>
        <td>${fStr}</td>
        <td>${o.clienteNombre || '—'}</td>
        <td>${o.matricula || '—'}</td>
        <td style="text-align:right">$${formatCLP(o.total)}</td>
      </tr>`;
    }).join('');

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
      <div style="background:#f0f9ff;padding:12px;border-radius:8px;text-align:center;">
        <div style="font-size:0.75rem;color:#64748b;">Órdenes</div>
        <div style="font-size:1.4rem;font-weight:700;color:#0f172a;">${ventas.length}</div>
      </div>
      <div style="background:#ecfdf5;padding:12px;border-radius:8px;text-align:center;">
        <div style="font-size:0.75rem;color:#64748b;">Ingresos (con IVA)</div>
        <div style="font-size:1.4rem;font-weight:700;color:#15803d;">$${formatCLP(totalIngresos)}</div>
      </div>
      <div style="background:#fefce8;padding:12px;border-radius:8px;text-align:center;">
        <div style="font-size:0.75rem;color:#64748b;">Mano de obra</div>
        <div style="font-size:1.1rem;font-weight:700;">$${formatCLP(totalMano)}</div>
      </div>
      <div style="background:#fdf4ff;padding:12px;border-radius:8px;text-align:center;">
        <div style="font-size:0.75rem;color:#64748b;">Repuestos</div>
        <div style="font-size:1.1rem;font-weight:700;">$${formatCLP(totalRep)}</div>
      </div>
    </div>
    <p style="font-size:0.85rem;margin-bottom:8px;"><strong>${MESES_NOMBRE[mes]} ${anio}</strong>
      · Diagnóstico: $${formatCLP(totalDiag)} · IVA recaudado: $${formatCLP(totalIva)}
      ${canceladas.length ? ` · Canceladas: ${canceladas.length}` : ''}
    </p>
    <div class="table-responsive">
      <table class="table">
        <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Patente</th><th>Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnPdfReporte').disabled = false;
}

function generarPdfReporte() {
  if (!ultimoReporte) return;
  const r = ultimoReporte;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const m = 14;
  let y = 16;
  const primary = [15, 23, 42];
  const accent = [14, 165, 233];

  const emp = document.getElementById('empresaNombre').value || 'TALLER ELISFER';

  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(emp, m, 10);
  doc.setFontSize(10);
  doc.text(`Reporte de ventas — ${r.mesNombre} ${r.anio}`, m, 17);

  y = 30;
  doc.setTextColor(...primary);
  doc.setFontSize(11);
  doc.text('Resumen del período', m, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const resumen = [
    [`Órdenes de servicio (no canceladas)`, String(r.cantidad)],
    [`Ingresos totales (con IVA)`, '$ ' + formatCLP(r.totalIngresos)],
    [`Diagnóstico`, '$ ' + formatCLP(r.totalDiag)],
    [`Mano de obra`, '$ ' + formatCLP(r.totalMano)],
    [`Repuestos / materiales`, '$ ' + formatCLP(r.totalRep)],
    [`IVA 19%`, '$ ' + formatCLP(r.totalIva)],
    [`Órdenes canceladas`, String(r.canceladas.length)]
  ];
  resumen.forEach(([lab, val]) => {
    doc.text(lab, m, y);
    doc.setFont('helvetica', 'bold');
    doc.text(val, pageW - m, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 6;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text('Detalle de órdenes', m, y);
  y += 4;

  const body = r.ventas.map(o => {
    const d = fechaOrdenParaFiltro(o);
    return [
      o.ordenNumero || '',
      d ? d.toLocaleDateString('es-CL') : '',
      o.clienteNombre || '',
      o.matricula || '',
      '$ ' + formatCLP(o.total)
    ];
  });

  doc.autoTable({
    startY: y,
    head: [['Nº', 'Fecha', 'Cliente', 'Patente', 'Total']],
    body,
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: primary, textColor: 255 },
    columnStyles: {
      4: { halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado el ${new Date().toLocaleString('es-CL')} — Uso interno del taller`, m, finalY);

  doc.save(`Reporte_${r.mesNombre}_${r.anio}.pdf`);
}


function abrirMailtoReporte(admin, r) {
  const asunto = encodeURIComponent(`Reporte ventas ${r.mesNombre} ${r.anio} — Taller`);
  const cuerpo = encodeURIComponent(
`Reporte mensual de ventas — ${r.mesNombre} ${r.anio}

Órdenes: ${r.cantidad}
Ingresos totales (con IVA): $${formatCLP(r.totalIngresos)}
Diagnóstico: $${formatCLP(r.totalDiag)}
Mano de obra: $${formatCLP(r.totalMano)}
Repuestos: $${formatCLP(r.totalRep)}
IVA: $${formatCLP(r.totalIva)}
Canceladas: ${r.canceladas.length}

Detalle:
` + r.ventas.map(o => {
  const d = fechaOrdenParaFiltro(o);
  return `Nº ${o.ordenNumero} | ${d ? d.toLocaleDateString('es-CL') : ''} | ${o.clienteNombre || ''} | ${o.matricula || ''} | $${formatCLP(o.total)}`;
}).join('\n') + `

---
Reporte de uso interno.`
  );
  window.location.href = `mailto:${admin}?subject=${asunto}&body=${cuerpo}`;
  alert('Se abrió tu correo dirigido a ' + admin + '. Pulsa Enviar.');
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
  document.getElementById('btnReporte').addEventListener('click', abrirReporte);
  document.getElementById('cerrarModalReporte').addEventListener('click', cerrarReporte);
  document.getElementById('btnGenerarReporte').addEventListener('click', generarReporteMensual);
  document.getElementById('btnPdfReporte').addEventListener('click', generarPdfReporte);
  document.getElementById('modalReporte').addEventListener('click', e => {
    if (e.target.id === 'modalReporte') cerrarReporte();
  });
  document.getElementById('btnDoSearch').addEventListener('click', realizarBusqueda);
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') realizarBusqueda();
  });

  // Costos en vivo
  ['costoDiagnostico', 'costoManoObra'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcularTotales);
  });

  // Observaciones: crecer hacia abajo al escribir
  const obs = document.getElementById('observaciones');
  if (obs) {
    obs.addEventListener('input', () => autoResizeTextarea(obs));
    autoResizeTextarea(obs);
  }

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
