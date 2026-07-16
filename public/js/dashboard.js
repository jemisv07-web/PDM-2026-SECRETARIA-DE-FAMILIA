'use strict';

// ── State ─────────────────────────────────────────────────────────────
let dashboardData = null;
let editMode = false;
let eventSource = null;

// ── DOM refs ──────────────────────────────────────────────────────────
const indicadoresGrid  = document.getElementById('indicadores-grid');
const programasTbody   = document.getElementById('programas-tbody');
const novedadesList    = document.getElementById('novedades-list');
const lastUpdatedEl    = document.getElementById('last-updated');
const statusDot        = document.querySelector('.status-dot');
const statusText       = document.getElementById('status-text');
const toastEl          = document.getElementById('toast');

const btnEditMode      = document.getElementById('btn-edit-mode');
const btnSaveAll       = document.getElementById('btn-save-all');
const btnCancelEdit    = document.getElementById('btn-cancel-edit');
const btnAddProgram    = document.getElementById('btn-add-program');
const btnAddNovedad    = document.getElementById('btn-add-novedad');

const modalIndicador      = document.getElementById('modal-indicador');
const formIndicador       = document.getElementById('form-indicador');
const btnCloseIndModal    = document.getElementById('btn-close-ind-modal');

const modalNovedad        = document.getElementById('modal-novedad');
const formNovedad         = document.getElementById('form-novedad');
const btnCloseNovModal    = document.getElementById('btn-close-nov-modal');

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'default', duration = 3200) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;
  toastEl.classList.remove('hidden');
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), duration);
}

// ── Format helpers ────────────────────────────────────────────────────
function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
}

function pct(value, meta) {
  if (!meta || meta === 0) return 0;
  return Math.min(100, Math.round((value / meta) * 100));
}

function badgeHtml(estado) {
  const classes = {
    'Activo':          'badge-activo',
    'Inactivo':        'badge-inactivo',
    'En Formulación':  'badge-formulacion',
  };
  const cls = classes[estado] || 'badge-formulacion';
  return `<span class="badge ${cls}">${estado}</span>`;
}

// ── Render indicadores ────────────────────────────────────────────────
function renderIndicadores(indicadores) {
  indicadoresGrid.innerHTML = '';
  for (const ind of indicadores) {
    const p = pct(ind.valor, ind.meta);
    const card = document.createElement('article');
    card.className = 'kpi-card';
    card.dataset.id = ind.id;
    card.innerHTML = `
      ${editMode ? `<button class="btn btn-icon edit-btn kpi-edit-btn" data-id="${ind.id}" title="Editar indicador">✏️</button>` : ''}
      <div class="kpi-category">${escHtml(ind.categoria)}</div>
      <div class="kpi-name">${escHtml(ind.nombre)}</div>
      <div>
        <span class="kpi-value">${ind.valor.toLocaleString('es-CO')}</span>
        <span class="kpi-unit">${escHtml(ind.unidad)}</span>
      </div>
      <div class="kpi-progress-bar">
        <div class="kpi-progress-fill" style="width:${p}%"></div>
      </div>
      <div class="kpi-meta-label">
        <span>Meta: ${ind.meta.toLocaleString('es-CO')} ${escHtml(ind.unidad)}</span>
        <span>${p}%</span>
      </div>
    `;
    indicadoresGrid.appendChild(card);
  }

  // Attach edit button listeners
  indicadoresGrid.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openIndicadorModal(parseInt(btn.dataset.id, 10)));
  });
}

// ── Render programas ──────────────────────────────────────────────────
function renderProgramas(programas) {
  programasTbody.innerHTML = '';
  const actionsHeader = document.getElementById('programas-actions-header');
  if (editMode) actionsHeader.classList.remove('hidden');
  else actionsHeader.classList.add('hidden');

  for (const prog of programas) {
    const tr = document.createElement('tr');
    tr.dataset.id = prog.id;

    const cells = [
      { field: 'nombre',        value: prog.nombre },
      { field: 'estado',        value: prog.estado },
      { field: 'beneficiarios', value: prog.beneficiarios.toLocaleString('es-CO') },
      { field: 'presupuesto',   value: formatCurrency(prog.presupuesto) },
      { field: 'responsable',   value: prog.responsable },
      { field: 'fechaInicio',   value: prog.fechaInicio },
      { field: 'observaciones', value: prog.observaciones },
    ];

    const editableFields = new Set(['nombre', 'beneficiarios', 'responsable', 'observaciones']);
    cells.forEach(({ field, value }) => {
      const td = document.createElement('td');
      td.dataset.field = field;
      if (field === 'estado') {
        td.innerHTML = badgeHtml(value);
        if (editMode) {
          // Estado as a select when editing
          const sel = document.createElement('select');
          sel.className = 'estado-select';
          ['Activo', 'Inactivo', 'En Formulación'].forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === prog.estado) o.selected = true;
            sel.appendChild(o);
          });
          td.innerHTML = '';
          td.appendChild(sel);
        }
      } else if (editMode && editableFields.has(field)) {
        td.contentEditable = 'true';
        td.textContent = value;
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    });

    if (editMode) {
      const actionsTd = document.createElement('td');
      actionsTd.innerHTML = `
        <button class="btn btn-sm btn-primary save-prog-btn" data-id="${prog.id}">💾</button>
      `;
      tr.appendChild(actionsTd);
    }

    programasTbody.appendChild(tr);
  }

  // Save individual program
  programasTbody.querySelectorAll('.save-prog-btn').forEach((btn) => {
    btn.addEventListener('click', () => savePrograma(parseInt(btn.dataset.id, 10)));
  });
}

// ── Render novedades ──────────────────────────────────────────────────
function renderNovedades(novedades) {
  novedadesList.innerHTML = '';
  if (!novedades || novedades.length === 0) {
    novedadesList.innerHTML = '<p style="color:var(--color-muted);font-size:.9rem">Sin novedades registradas.</p>';
    return;
  }
  for (const nov of novedades) {
    const div = document.createElement('article');
    div.className = 'novedad-card';
    div.dataset.id = nov.id;
    div.innerHTML = `
      ${editMode ? `<button class="btn btn-icon delete-btn novedad-delete-btn" data-id="${nov.id}" title="Eliminar novedad">🗑️</button>` : ''}
      <div class="novedad-date">${escHtml(nov.fecha)}</div>
      <div class="novedad-title">${escHtml(nov.titulo)}</div>
      <div class="novedad-desc">${escHtml(nov.descripcion)}</div>
    `;
    novedadesList.appendChild(div);
  }

  novedadesList.querySelectorAll('.novedad-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteNovedad(parseInt(btn.dataset.id, 10)));
  });
}

// ── Full render ───────────────────────────────────────────────────────
function renderAll(data) {
  dashboardData = data;
  document.getElementById('dash-title').textContent = data.titulo || 'PDM 2026 – Secretaría de Familia';
  lastUpdatedEl.textContent = data.fechaActualizacion || '–';
  renderIndicadores(data.indicadores || []);
  renderProgramas(data.programas || []);
  renderNovedades(data.novedades || []);
}

// ── Escape HTML ───────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Fetch initial data ────────────────────────────────────────────────
async function fetchData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderAll(data);
  } catch (err) {
    showToast('No se pudo cargar la información del servidor.', 'error');
    console.error('[fetchData]', err);
  }
}

// ── SSE connection ────────────────────────────────────────────────────
function connectSSE() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/events');

  eventSource.addEventListener('connected', () => {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'En vivo';
  });

  eventSource.addEventListener('update', (e) => {
    try {
      const data = JSON.parse(e.data);
      renderAll(data);
      showToast('📥 Dashboard actualizado desde archivo.', 'success');
    } catch (err) {
      console.error('[SSE] Error parsing data:', err);
    }
  });

  eventSource.onerror = () => {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Desconectado';
    // Close current connection before retrying to avoid resource leaks
    eventSource.close();
    eventSource = null;
    setTimeout(connectSSE, 5000);
  };
}

// ── Edit mode toggle ──────────────────────────────────────────────────
function setEditMode(active) {
  editMode = active;
  btnEditMode.classList.toggle('hidden', active);
  btnSaveAll.classList.toggle('hidden', !active);
  btnCancelEdit.classList.toggle('hidden', !active);
  btnAddProgram.classList.toggle('hidden', !active);
  btnAddNovedad.classList.toggle('hidden', !active);
  if (dashboardData) renderAll(dashboardData);
}

btnEditMode.addEventListener('click', () => setEditMode(true));
btnCancelEdit.addEventListener('click', () => setEditMode(false));

// ── Save all ──────────────────────────────────────────────────────────
btnSaveAll.addEventListener('click', async () => {
  try {
    btnSaveAll.disabled = true;
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboardData),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    dashboardData.fechaActualizacion = result.fechaActualizacion;
    lastUpdatedEl.textContent = result.fechaActualizacion;
    showToast('✅ Cambios guardados correctamente.', 'success');
    setEditMode(false);
  } catch (err) {
    showToast('❌ Error al guardar los cambios.', 'error');
    console.error('[saveAll]', err);
  } finally {
    btnSaveAll.disabled = false;
  }
});

// ── Save individual programa ──────────────────────────────────────────
async function savePrograma(id) {
  const tr = programasTbody.querySelector(`tr[data-id="${id}"]`);
  if (!tr) return;

  const estadoSel = tr.querySelector('.estado-select');

  const getField = (field) => tr.querySelector(`td[data-field="${field}"]`)?.textContent.trim() ?? '';

  const updates = {
    nombre:        getField('nombre'),
    estado:        estadoSel ? estadoSel.value : getField('estado'),
    beneficiarios: parseInt(getField('beneficiarios').replace(/\D/g, ''), 10) || 0,
    responsable:   getField('responsable'),
    observaciones: getField('observaciones'),
  };

  try {
    const res = await fetch(`/api/data/programas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    // Update local state
    const idx = dashboardData.programas.findIndex((p) => p.id === id);
    if (idx !== -1) dashboardData.programas[idx] = result.programa;
    showToast(`✅ Programa "${updates.nombre}" guardado.`, 'success');
  } catch (err) {
    showToast('❌ Error al guardar el programa.', 'error');
    console.error('[savePrograma]', err);
  }
}

// ── Indicador modal ───────────────────────────────────────────────────
function openIndicadorModal(id) {
  const ind = dashboardData.indicadores.find((i) => i.id === id);
  if (!ind) return;
  document.getElementById('ind-id').value = id;
  document.getElementById('ind-nombre').value = ind.nombre;
  document.getElementById('ind-descripcion').value = ind.descripcion || '';
  document.getElementById('ind-valor').value = ind.valor;
  document.getElementById('ind-meta').value = ind.meta;
  document.getElementById('ind-unidad').value = ind.unidad || '';
  document.getElementById('ind-categoria').value = ind.categoria || '';
  modalIndicador.classList.remove('hidden');
  document.getElementById('ind-nombre').focus();
}

function closeIndicadorModal() {
  modalIndicador.classList.add('hidden');
  formIndicador.reset();
}

btnCloseIndModal.addEventListener('click', closeIndicadorModal);
modalIndicador.addEventListener('click', (e) => { if (e.target === modalIndicador) closeIndicadorModal(); });

formIndicador.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = parseInt(document.getElementById('ind-id').value, 10);
  const updates = {
    nombre:      document.getElementById('ind-nombre').value.trim(),
    descripcion: document.getElementById('ind-descripcion').value.trim(),
    valor:       parseFloat(document.getElementById('ind-valor').value) || 0,
    meta:        parseFloat(document.getElementById('ind-meta').value) || 0,
    unidad:      document.getElementById('ind-unidad').value.trim(),
    categoria:   document.getElementById('ind-categoria').value.trim(),
  };

  try {
    const res = await fetch(`/api/data/indicadores/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const idx = dashboardData.indicadores.findIndex((i) => i.id === id);
    if (idx !== -1) dashboardData.indicadores[idx] = result.indicador;
    renderIndicadores(dashboardData.indicadores);
    closeIndicadorModal();
    showToast(`✅ Indicador "${updates.nombre}" actualizado.`, 'success');
  } catch (err) {
    showToast('❌ Error al actualizar el indicador.', 'error');
    console.error('[saveIndicador]', err);
  }
});

// ── Novedad modal ─────────────────────────────────────────────────────
btnAddNovedad.addEventListener('click', () => {
  formNovedad.reset();
  modalNovedad.classList.remove('hidden');
  document.getElementById('nov-titulo').focus();
});

function closeNovedadModal() {
  modalNovedad.classList.add('hidden');
  formNovedad.reset();
}

btnCloseNovModal.addEventListener('click', closeNovedadModal);
modalNovedad.addEventListener('click', (e) => { if (e.target === modalNovedad) closeNovedadModal(); });

formNovedad.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    titulo:      document.getElementById('nov-titulo').value.trim(),
    descripcion: document.getElementById('nov-descripcion').value.trim(),
  };
  if (!payload.titulo || !payload.descripcion) {
    showToast('Por favor complete todos los campos.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/data/novedades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    dashboardData.novedades.unshift(result.novedad);
    renderNovedades(dashboardData.novedades);
    closeNovedadModal();
    showToast('✅ Novedad publicada.', 'success');
  } catch (err) {
    showToast('❌ Error al publicar la novedad.', 'error');
    console.error('[addNovedad]', err);
  }
});

// ── Delete novedad ────────────────────────────────────────────────────
async function deleteNovedad(id) {
  if (!confirm('¿Desea eliminar esta novedad?')) return;
  try {
    const res = await fetch(`/api/data/novedades/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dashboardData.novedades = dashboardData.novedades.filter((n) => n.id !== id);
    renderNovedades(dashboardData.novedades);
    showToast('🗑️ Novedad eliminada.', 'default');
  } catch (err) {
    showToast('❌ Error al eliminar la novedad.', 'error');
    console.error('[deleteNovedad]', err);
  }
}

// ── Keyboard accessibility: close modals with Escape ─────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeIndicadorModal();
    closeNovedadModal();
  }
});

// ── Init ──────────────────────────────────────────────────────────────
fetchData();
connectSSE();
