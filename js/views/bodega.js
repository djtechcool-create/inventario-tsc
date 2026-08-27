/* ============================================================
   VISTA BODEGA (MÓVIL)
   - Solo ve producto y lote + campos de conteo físico.
   - Calculadora de pallets/sacos (Sección 30).
   - Progreso, guardar avance, finalizar, reconteo.
   - NUNCA muestra cantidades virtuales / diferencias.
   ============================================================ */
const BodegaView = (() => {
  const app = document.getElementById('app');
  let session = null;

  function init(s) {
    session = s;
    renderHome();
  }

  function logout() { DB.logout(); location.reload(); }

  // ---------- Lista de inventarios asignados ----------
  function renderHome() {
    const invs = DB.listInventories().filter(i =>
      i.assignees && i.assignees.includes(session.id));
    const active = invs.filter(i => ['EN CONTEO', 'RECONTEO'].includes(i.status));
    const historical = invs.filter(i => !['EN CONTEO', 'RECONTEO'].includes(i.status));

    app.innerHTML = `
      <div class="bodega-app">
        <div class="bodega-header">
          <h1>Contador de Bodega</h1>
          <div class="meta">${UI.esc(session.name)} · ${UI.esc(session.username)}</div>
          <div style="margin-top:6px"><button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff" onclick="BodegaView.logout()">Cerrar sesión</button></div>
        </div>
        <div class="bodega-body">
          <h2 style="font-size:1.1rem;margin-bottom:12px">Inventarios activos</h2>
          ${active.length === 0 ? `<p class="hint">No tienes inventarios en curso.</p>` :
            active.map(i => `
              <div class="card" style="margin-bottom:12px">
                <h3 style="font-size:1rem;margin-bottom:6px">${UI.esc(i.name)}</h3>
                <p class="hint">${i.id}</p>
                <span class="pill ${i.status==='EN CONTEO'?'pill-blue':'pill-orange'}">${UI.esc(i.status)}</span>
                <div style="margin-top:12px">
                  <button class="btn btn-primary btn-block" onclick="BodegaView.openInventory('${i.id}')">${i.status==='RECONTEO' ? 'Continuar / Reconteo' : 'Continuar conteo'}</button>
                </div>
              </div>`).join('')}

          ${historical.length ? `<h2 style="font-size:1.1rem;margin:20px 0 12px">Historial</h2>` : ''}
          ${historical.map(i => `
            <div class="card" style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
              <div><h3 style="font-size:.95rem">${UI.esc(i.name)}</h3><span class="pill pill-green">${UI.esc(i.status)}</span></div>
            </div>`).join('')}
        </div>
        <div style="height:20px"></div>
      </div>`;
  }

  // ---------- Conteo de un inventario ----------
  function openInventory(invId) {
    const inv = DB.getInventory(invId);
    if (!inv) return UI.toast('Inventario no encontrado', 'err');

    // tareas del usuario en este inventario
    const tasks = DB.userTasks(session.id);
    let state = tasks[invId];
    if (!state) {
      // inicializar desde las tareas asignadas (sin cantidades virtuales)
      state = {
        invId,
        items: inv.tasks.filter(t => t.assignee === session.id).map(t => ({
          id: t.id, producto: t.producto, lote: t.lote, estados: t.estados,
          conteo: null, total: 0, done: false
        })),
        currentIndex: 0,
        startedAt: null,
        view: 'list'
      };
      tasks[invId] = state;
      DB.setUserTasks(session.id, tasks);
    }
    currentState = state;
    currentInv = inv;
    renderList();
  }

  let currentState = null;
  let currentInv = null;

  function persist() {
    const tasks = DB.userTasks(session.id);
    tasks[currentInv.id] = currentState;
    DB.setUserTasks(session.id, tasks);
  }

  function progress() {
    const total = currentState.items.length;
    const done = currentState.items.filter(i => i.done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function renderList() {
    const { total, done, pct } = progress();
    const statusPill = currentInv.status === 'RECONTEO' ? 'pill-orange' : 'pill-blue';
    app.innerHTML = `
      <div class="bodega-app">
        <div class="bodega-header">
          <h1>${UI.esc(currentInv.name)}</h1>
          <div class="meta">${UI.esc(currentInv.id)}</div>
          <div style="margin-top:6px"><button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff" onclick="BodegaView.renderHome()">← Volver</button></div>
        </div>
        <div class="bodega-body">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="pill ${statusPill}">${UI.esc(currentInv.status)}</span>
            <span class="hint">${done} / ${total} completados</span>
          </div>
          <div class="progress-bar"><div style="width:${pct}%"></div></div>

          ${currentState.items.map((it, idx) => `
            <div class="b-item ${it.done ? 'done' : 'pending'}">
              <div class="b-prod">${UI.esc(it.producto)}</div>
              <div class="b-lote">LOTE: ${UI.esc(it.lote)}</div>
              ${it.done
                ? `<p class="b-sub" style="font-weight:700;color:var(--success)">Contado: ${it.total} sacos</p>`
                : `<p class="b-sub">Pendiente de conteo</p>`}
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm ${it.done?'btn-outline':'btn-primary'}" onclick="BodegaView.openItem(${idx})">${it.done?'Revisar':'Contar'}</button>
                ${it.done && currentInv.status==='EN CONTEO' ? `<button class="btn btn-sm btn-outline" onclick="BodegaView.clearItem(${idx})">Limpiar</button>` : ''}
              </div>
            </div>`).join('')}

          ${total === done && total > 0 ? `
            <button class="btn btn-success btn-lg btn-block" onclick="BodegaView.finish()" style="margin-top:16px">FINALIZAR INVENTARIO</button>` : ''}
        </div>
      </div>`;
  }

  // ---------- Calculadora de conteo por item ----------
  function openItem(idx) {
    const it = currentState.items[idx];
    // modelo del conteo
    if (!it.conteo) it.conteo = { palletGroups: [], indiv: {} };
    currentState.currentIndex = idx;
    renderItem(idx);
  }

  function renderItem(idx) {
    const it = currentState.items[idx];
    const conteo = it.conteo || { palletGroups: [], indiv: {} };
    const c = Calc.compute(conteo, it.estados);
    persist();

    app.innerHTML = `
      <div class="bodega-app">
        <div class="bodega-header">
          <h1>Conteo</h1>
          <div class="meta">${UI.esc(it.producto)} · LOTE ${UI.esc(it.lote)}</div>
          <div style="margin-top:6px"><button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff" onclick="BodegaView.renderList()">← Lista</button></div>
        </div>
        <div class="bodega-body">
          <div class="b-item pending">
            <div class="b-prod">${UI.esc(it.producto)}</div>
            <div class="b-lote">LOTE: ${UI.esc(it.lote)}</div>
          </div>

          <h3 style="font-size:1rem;margin-bottom:8px">🧺 Pallets completos (se cuentan como BUENOS)</h3>
          ${(conteo.palletGroups || []).map((g, gi) => `
            <div class="b-palletgrp">
              <div class="row">
                <div class="b-field"><label>Cant. pallets</label>
                  <input type="number" min="0" value="${g.qty||''}" oninput="BodegaView.editPallet(${idx},${gi},'qty',this.value)"></div>
                <div class="b-field"><label>Sacos por pallet</label>
                  <input type="number" min="0" value="${g.per||''}" oninput="BodegaView.editPallet(${idx},${gi},'per',this.value)"></div>
              </div>
              <p class="b-sub"><b>Subtotal: ${(g.qty||0)*(g.per||0)} BUENOS</b></p>
              <button class="btn btn-sm btn-danger" onclick="BodegaView.removePallet(${idx},${gi})">Eliminar grupo</button>
            </div>`).join('')}
          <button class="btn btn-outline btn-block" onclick="BodegaView.addPallet(${idx})" style="margin-bottom:16px">+ Agregar otro tipo de pallet</button>

          <h3 style="font-size:1rem;margin:10px 0 8px">🎒 Sacos individuales</h3>
          ${(['buenos','danados','arreglados','reempacados']).map(s => {
            const label = s==='buenos'?'BUENOS':s==='danados'?'DAÑADOS':s==='arreglados'?'ARREGLADOS':'REEMPACADOS';
            return `<div class="b-field"><label>${label}</label>
              <input type="number" min="0" value="${conteo.indiv[s]||''}" placeholder="0" oninput="BodegaView.editIndiv(${idx},'${s}',this.value)"></div>`;
          }).join('')}
          ${(it.estados||[]).filter(s => !['buenos','danados','arreglados','reempacados'].includes(s)).map(s => `
            <div class="b-field"><label>${UI.esc(s.toUpperCase())}</label>
              <input type="number" min="0" value="${conteo.indiv[s]||''}" placeholder="0" oninput="BodegaView.editIndiv(${idx},'${s}',this.value)"></div>`).join('')}

          <div class="b-total-display">TOTAL CONTADO: <span style="color:var(--primary)">${c.total}</span> sacos</div>

          <div class="btn-group">
            <button class="btn btn-accent" onclick="BodegaView.saveItem(${idx})">Guardar conteo</button>
            ${idx > 0 ? `<button class="btn btn-outline" onclick="BodegaView.renderItem(${idx-1})">← Anterior</button>`:''}
            ${idx < currentState.items.length-1 ? `<button class="btn btn-primary" onclick="BodegaView.saveAndNext(${idx})">Guardar y Siguiente →</button>`:''}
            ${idx === currentState.items.length-1 ? `<button class="btn btn-success" onclick="BodegaView.saveItem(${idx});BodegaView.renderList()">Guardar y Lista</button>`:''}
          </div>
        </div>
      </div>`;
  }

  function addPallet(idx) {
    currentState.items[idx].conteo.palletGroups.push({ qty: '', per: '' });
    renderItem(idx);
  }
  function removePallet(idx, gi) {
    currentState.items[idx].conteo.palletGroups.splice(gi, 1);
    renderItem(idx);
  }
  function editPallet(idx, gi, field, val) {
    const g = currentState.items[idx].conteo.palletGroups[gi];
    g[field] = val === '' ? '' : Math.max(0, parseInt(val) || 0);
    updateItemTotal(idx, true);
  }
  function editIndiv(idx, state, val) {
    currentState.items[idx].conteo.indiv[state] = val === '' ? '' : Math.max(0, parseInt(val) || 0);
    updateItemTotal(idx, true);
  }
  function updateItemTotal(idx, rerender) {
    const it = currentState.items[idx];
    const c = Calc.compute(it.conteo, it.estados);
    it.total = c.total;
    it.done = c.total > 0;
    persist();
    if (rerender) renderItem(idx);
  }
  function saveItem(idx) {
    const it = currentState.items[idx];
    const c = Calc.compute(it.conteo, it.estados);
    if (c.total <= 0) { UI.toast('Ingresa al menos 1 saco para este lote.', 'err'); return; }
    it.total = c.total;
    it.done = true;
    it.completedAt = new Date().toISOString();
    // limpiar placeholders dejados como ''
    (it.conteo.palletGroups||[]).forEach(g => { g.qty = g.qty===''?0:g.qty; g.per = g.per===''?0:g.per; });
    Object.keys(it.conteo.indiv||{}).forEach(s => { it.conteo.indiv[s] = it.conteo.indiv[s]===''?0:it.conteo.indiv[s]; });
    persist();
    UI.toast('Conteo guardado');
    renderList();
  }
  function saveAndNext(idx) {
    const it = currentState.items[idx];
    const c = Calc.compute(it.conteo, it.estados);
    if (c.total <= 0) { UI.toast('Ingresa al menos 1 saco para este lote.', 'err'); return; }
    it.total = c.total; it.done = true; it.completedAt = new Date().toISOString();
    (it.conteo.palletGroups||[]).forEach(g => { g.qty = g.qty===''?0:g.qty; g.per = g.per===''?0:g.per; });
    Object.keys(it.conteo.indiv||{}).forEach(s => { it.conteo.indiv[s] = it.conteo.indiv[s]===''?0:it.conteo.indiv[s]; });
    persist();
    const next = idx + 1;
    if (next < currentState.items.length) openItem(next); else renderList();
  }

  function clearItem(idx) {
    if (!UI.confirm('¿Limpiar este conteo y volver a contarlo?')) return;
    const it = currentState.items[idx];
    it.conteo = { palletGroups: [], indiv: {} };
    it.total = 0; it.done = false; it.completedAt = null;
    persist();
    renderList();
  }

  // ---------- Finalizar ----------
  function finish() {
    const { total, done } = progress();
    if (done < total) { UI.toast('Completa todos los lotes antes de finalizar.', 'err'); return; }
    if (!UI.confirm('¿Finalizar el inventario físico? Quedará bloqueado.')) return;
    // construir el físico final del usuario (solo cantidades por estado)
    const fisico = {
      invId: currentInv.id,
      userItem: {
        userId: session.id, userName: session.name,
        finishedAt: new Date().toISOString(),
        isReconteo: currentInv.status === 'RECONTEO'
      },
      items: currentState.items.map(it => {
        const estados = {};
        const c = Calc.compute(it.conteo, it.estados);
        Object.keys(c.estados).forEach(s => estados[s] = c.estados[s]);
        return { producto: it.producto, lote: it.lote, estados, total: c.total };
      })
    };
    // guardar en el inventario (admin lo consolidará)
    const inv = DB.getInventory(currentInv.id);
    if (inv) {
      if (!inv.fisicos) inv.fisicos = {};
      inv.fisicos[session.id] = fisico;
      // registrar historial del usuario
      if (!inv.historial) inv.historial = [];
      inv.historial.push({
        type: currentInv.status === 'RECONTEO' ? 'reconteo' : 'conteo',
        userId: session.id, userName: session.name,
        at: new Date().toISOString(), items: fisico.items.length
      });
      DB.saveInventory(inv);
    }
    DB.addAudit({ action: currentInv.status==='RECONTEO'?'reconteo_finalizado':'conteo_finalizado', user: session.username, invId: currentInv.id });
    persist();
    UI.toast('Inventario enviado al administrador');
    // volver a home, el inventario deja de estar "EN CONTEO" para el usuario
    currentState = null; currentInv = null;
    renderHome();
  }

  return { init, logout, renderHome, openInventory, openItem, renderItem, renderList,
    addPallet, removePallet, editPallet, editIndiv, updateItemTotal, saveItem, saveAndNext,
    clearItem, finish };
})();
