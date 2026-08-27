/* ============================================================
   VISTA ADMINISTRADOR (PC)
   - Dashboard, inventarios, subir virtual, diferencias,
     cambios de estado, reconteos, usuarios, historial.
   - El inventario virtual se mantiene CIFRADO.
   ============================================================ */
const AdminView = (() => {
  const app = document.getElementById('app');
  let session = null;
  let route = 'dashboard';
  let pendingUpload = null;
  let selectedInv = null;
  // Semilla del módulo admin para descifrar el inventario virtual.
  // SOLO se usa en este módulo (rol admin); el módulo bodega nunca la usa.
  const ADMIN_KEY = 'ITSC-ADMIN-CIPHER-SEED';
  const virtualCache = new Map();

  async function getVirtualLines(inv) {
    if (virtualCache.has(inv.id)) return virtualCache.get(inv.id);
    const cipher = DB.getVirtualCipher(inv.virtualRef);
    if (!cipher) return [];
    try {
      const lines = JSON.parse(await DB.decryptAES(cipher.iv, cipher.data, ADMIN_KEY, inv.virtualSalt));
      virtualCache.set(inv.id, lines);
      return lines;
    } catch (e) {
      console.error('No se pudo descifrar el inventario virtual', e);
      return [];
    }
  }

  function init(s) { session = s; nav('dashboard'); }

  function logout() { DB.logout(); location.reload(); }
  function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

  const MENU = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'inventarios', icon: '📋', label: 'Inventarios' },
    { id: 'subir', icon: '⬆️', label: 'Subir inventario virtual' },
    { id: 'usuarios', icon: '👥', label: 'Usuarios' },
    { id: 'reportes', icon: '📈', label: 'Reportes' },
    { id: 'historial', icon: '🕘', label: 'Historial' }
  ];

  function nav(routeId) {
    route = routeId;
    if (routeId === 'dashboard') renderDashboard();
    else if (routeId === 'inventarios') renderInventarios();
    else if (routeId === 'subir') renderUpload();
    else if (routeId === 'usuarios') renderUsuarios();
    else if (routeId === 'reportes') ReportView.init(session);
    else if (routeId === 'historial') renderHistorial();
  }

  function shell(content) {
    app.innerHTML = `
      <div class="layout">
        <div class="sidebar" id="sidebar">
          <div class="brand">Inventario TSC<small>Panel de Administración</small></div>
          <nav>
            ${MENU.map(m => `<a href="#" class="${m.id===route?'active':''}" data-nav="${m.id}" onclick="AdminView.nav('${m.id}')">${m.icon} ${m.label}</a>`).join('')}
          </nav>
          <div class="foot">
            <div><b>${UI.esc(session.name)}</b> (Admin)</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%" onclick="AdminView.logout()">Cerrar sesión</button>
          </div>
        </div>
        <button class="menu-toggle" onclick="AdminView.toggleMenu()">☰</button>
        <div class="main">
          <div class="topbar">
            <div class="page-title">${MENU.find(m=>m.id===route)?.label || ''}</div>
            <span class="hint">${new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          </div>
          ${content}
        </div>
      </div>`;
  }

  // ============ DASHBOARD ============
  async function renderDashboard() {
    const invs = DB.listInventories();
    const latest = invs[invs.length - 1] || null;
    let cards = '';
    if (latest) {
      const data = await buildComparison(latest);
      cards = `
        <div class="card"><h3>TOTAL VIRTUAL (sacos)</h3><div class="stat-value">${UI.money(data.summary.totalVirtual)}</div></div>
        <div class="card"><h3>TOTAL FÍSICO (sacos)</h3><div class="stat-value">${UI.money(data.summary.totalFisico)}</div></div>
        <div class="card"><h3>FALTANTE</h3><div class="stat-value bad">${UI.money(data.summary.sacosFaltantes)}</div></div>
        <div class="card"><h3>SOBRANTE</h3><div class="stat-value warnc">${UI.money(data.summary.sacosSobrantes)}</div></div>
        <div class="card"><h3>Cambios de estado (sacos)</h3><div class="stat-value warnc">${data.resumenEstados}</div></div>
        <div class="card"><h3>Lotes cuadrados</h3><div class="stat-value ok">${data.summary.cuadrados}/${data.summary.totalRegistros}</div></div>
        <div class="card"><h3>Coincidencia</h3><div class="stat-value ${data.summary.pctCoincidencia>=90?'ok':'warnc'}">${data.summary.pctCoincidencia}%</div></div>
        <div class="card"><h3>Estado del inventario</h3><div class="stat-value" style="font-size:1rem">${statusPill(latest.status)}</div></div>`;
    } else {
      cards = `<div class="card"><p class="hint">No hay inventarios todavía. Sube un inventario virtual para comenzar.</p></div>`;
    }

    const pendientes = invs.filter(i => ['EN CONTEO','RECONTEO','BORRADOR','PENDIENTE DE REVISIÓN'].includes(i.status)).length;
    const finalizados = invs.filter(i => ['FINALIZADO','CON DIFERENCIAS','CONCILIADO','CERRADO'].includes(i.status)).length;
    const porEstado = {}
    invs.forEach(i => porEstado[i.status] = (porEstado[i.status]||0)+1);

    shell(`
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="card"><h3>Total productos</h3><div class="stat-value">${invs.length?latest?.productos||0:0}</div></div>
        <div class="card"><h3>Total lotes</h3><div class="stat-value">${invs.length?latest?.lotes||0:0}</div></div>
        <div class="card"><h3>Inventarios</h3><div class="stat-value">${invs.length}</div></div>
        <div class="card"><h3>Estado actual</h3><div class="stat-value" style="font-size:1rem">${invs.length?statusPill(latest.status):'—'}</div></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="card"><h3>Pendientes</h3><div class="stat-value warnc">${pendientes}</div></div>
        <div class="card"><h3>Finalizados</h3><div class="stat-value ok">${finalizados}</div></div>
        ${Object.entries(porEstado).map(([s,n])=>`<div class="card"><h3>${UI.esc(s)}</h3><div class="stat-value">${n}</div></div>`).join('')}
      </div>
      <h3 style="margin-bottom:10px">Inventario actual: ${latest?UI.esc(latest.name):'ninguno'}</h3>
      <div class="grid grid-4">${cards}</div>
      ${latest ? `<div style="margin-top:20px" class="table-wrap card"><h3 style="margin-bottom:10px">Resumen por producto (último inventario)</h3>${resumenTabla(latest)}</div>` : ''}
    `);
  }

  // ============ INVENTARIOS ============
  async function renderInventarios(selId) {
    const invs = DB.listInventories().slice().reverse();
    if (selId) selectedInv = DB.getInventory(selId);
    let detailHtml = '';
    if (selectedInv) detailHtml = await invDetail(selectedInv);
    shell(`
      <div class="table-wrap card">
        <h3 style="margin-bottom:10px">Inventarios semanales</h3>
        <table>
          <thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Fecha virtual</th><th>Lotes</th><th>Acciones</th></tr></thead>
          <tbody>
            ${invs.length===0?'<tr><td colspan="6" class="hint">Sin inventarios. Sube el inventario virtual.</td></tr>':
              invs.map(i=>`<tr>
                <td>${UI.esc(i.id)}</td>
                <td><b>${UI.esc(i.name)}</b></td>
                <td>${statusPill(i.status)}</td>
                <td class="num">${i.virtualDate?UI.esc(i.virtualDate.slice(0,10)):'—'}</td>
                <td class="num">${i.lotes||0}</td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="AdminView.detailInventory('${i.id}')">Detalle</button>
                  ${['EN CONTEO','RECONTEO'].includes(i.status) ? `<button class="btn btn-sm btn-warn" onclick="AdminView.reopen('${i.id}')">Reabrir/Recuento</button>` : ''}
                  ${['FINALIZADO','CON DIFERENCIAS','CONCILIADO'].includes(i.status) ? `<button class="btn btn-sm btn-success" onclick="AdminView.conciliar('${i.id}')">Conciliar</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${detailHtml}
    `);
  }

  function detailInventory(id) {
    selectedInv = DB.getInventory(id);
    renderInventarios(id);
  }

  async function invDetail(inv) {
    const data = await buildComparison(inv);
    return `
      <div class="card" style="margin-top:20px">
        <h3 style="margin-bottom:4px">${UI.esc(inv.name)} <span style="font-weight:400;color:var(--muted)">(${inv.id})</span></h3>
        <p class="hint">Estado: ${statusPill(inv.status)} · Virtual date: ${inv.virtualDate?UI.esc(inv.virtualDate.slice(0,10)):'—'}</p>
        <div class="grid grid-4" style="margin-top:14px">
          <div class="card"><h3>Total virtual</h3><div class="stat-value">${UI.money(data.summary.totalVirtual)}</div></div>
          <div class="card"><h3>Total físico</h3><div class="stat-value">${UI.money(data.summary.totalFisico)}</div></div>
          <div class="card"><h3>Faltante</h3><div class="stat-value bad">${UI.money(data.summary.sacosFaltantes)}</div></div>
          <div class="card"><h3>Sobrante</h3><div class="stat-value warnc">${UI.money(data.summary.sacosSobrantes)}</div></div>
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-sm btn-primary" onclick="ReportView.showReport('${inv.id}')">Ver reporte detallado</button>
          <button class="btn btn-sm btn-success" onclick="ReportView.export('${inv.id}')">Exportar a Excel</button>
          ${['EN CONTEO','RECONTEO'].includes(inv.status) ? `<button class="btn btn-sm btn-warn" onclick="AdminView.reopen('${inv.id}')">Reabrir para reconteo</button>` : ''}
        </div>
        <div class="table-wrap" style="margin-top:16px"><h3 style="margin-bottom:8px">Comparación detallada</h3>${comparisonTabla(data, inv)}</div>
      </div>`;
  }

  function reopen(id) {
    const inv = DB.getInventory(id);
    if (!UI.confirm('¿Reabrir el inventario para reconteo? Se conservará el conteo anterior.')) return;
    inv.status = 'RECONTEO';
    inv.startRecuentoAt = new Date().toISOString();
    // permitir a los asignados recontar: restablecer done en sus tareas (sin borrar conteo anterior)
    const assignments = new Set(inv.assignees || []);
    assignments.forEach(uid => {
      const tasks = DB.userTasks(uid);
      if (tasks[id]) {
        tasks[id].items.forEach(it => {
          if (!it.historicConteo && it.conteo) { it.historicConteo = it.conteo; it.historicTotal = it.total; }
          it.conteo = null; it.total = 0; it.done = false; it.completedAt = null;
        });
      }
      DB.setUserTasks(uid, tasks);
    });
    DB.saveInventory(inv);
    DB.addAudit({ action: 'reabrir_reconteo', user: session.username, invId: id });
    UI.toast('Inventario reabierto para reconteo');
    renderInventarios(id);
  }

  function conciliar(id) {
    const inv = DB.getInventory(id);
    if (!UI.confirm('¿Marcar el inventario como CONCILIADO/CUADRADO?')) return;
    inv.status = 'CONCILIADO';
    inv.conciliatedAt = new Date().toISOString();
    inv.conciliatedBy = session.username;
    DB.saveInventory(inv);
    DB.addAudit({ action: 'conciliar', user: session.username, invId: id });
    UI.toast('Inventario conciliado');
    renderInventarios(id);
  }

  // ============ SUBIR INVENTARIO VIRTUAL ============
  function renderUpload() {
    shell(`
      <div class="card">
        <h3 style="margin-bottom:10px">Subir inventario virtual (Excel)</h3>
        <p class="hint">Selecciona el archivo Excel generado por el sistema. Se detectarán columnas y estados automáticamente.</p>
        <div style="margin-top:14px">
          <input type="file" id="upload-file" accept=".xlsx,.xls,.csv">
          <button class="btn btn-primary" onclick="AdminView.processUpload()" style="margin-left:10px">Procesar archivo</button>
        </div>
      </div>
      ${pendingUpload ? previewUpload(pendingUpload) : ''}
    `);
  }

  function processUpload() {
    const input = document.getElementById('upload-file');
    if (!input.files.length) return UI.toast('Selecciona un archivo Excel', 'err');
    UI.loading(true);
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        const res = ExcelImport.parseExcel(arrayBuffer);
        pendingUpload = { name: file.name, res };
        renderUpload();
        UI.loading(false);
        if (!res.success) {
          UI.toast('No se pudo procesar el archivo. Verifica el formato.', 'err');
        }
      } catch (err) {
        UI.loading(false);
        UI.toast('No se pudo leer el archivo: ' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function previewUpload(pu) {
    const res = pu.res;
    if (!res.success) return '';
    return `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-bottom:10px">Vista previa: ${UI.esc(pu.name)}</h3>
        <p class="hint">Hoja: ${UI.esc(res.sheetName)} · Estados detectados: ${res.states.map(s=>UI.esc(s.toUpperCase())).join(', ')} · Registros: ${res.lines.length}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Producto</th><th>Lote</th>${res.states.map(s=>`<th class="num">${UI.esc(s.toUpperCase())}</th>`).join('')}<th class="num">Total</th></tr></thead>
          <tbody>${res.lines.slice(0,15).map((l,i)=>`<tr>
            <td>${i+1}</td><td>${UI.esc(l.producto)}</td><td>${UI.esc(l.lote)}</td>
            ${res.states.map(s=>`<td class="num">${l.estados[s]||0}</td>`).join('')}
            <td class="num"><b>${l.total}</b></td>
          </tr>`).join('')}</tbody>
        </table></div>
        ${res.lines.length>15?`<p class="hint">... y ${res.lines.length-15} más</p>`:''}
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:220px"><label>Nombre del inventario (ej. Inventario Viernes 28/08/2026)</label>
            <input id="inv-name" placeholder="Inventario Viernes ${new Date().toLocaleDateString('es-CO')}"></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-success" onclick="AdminView.createInventory()">Crear inventario (BORRADOR)</button>
        </div>
      </div>`;
  }

  async function createInventory() {
    const pu = pendingUpload;
    if (!pu) return;
    const res = pu.res;
    const name = (document.getElementById('inv-name')?.value || '').trim() || ('Inventario ' + new Date().toLocaleDateString('es-CO'));
    UI.loading(true);
    try {
      // cifrar el inventario virtual completo (solo admin puede descifrar)
      const salt = 'v' + Date.now().toString(36);
      const ref = 'v_' + Date.now().toString(36);
      const cipher = await DB.encryptAES(JSON.stringify(res.lines), ADMIN_KEY, salt);
      DB.saveVirtualCipher(ref, cipher);

      const id = 'INV-' + Date.now().toString(36).toUpperCase().slice(0,6);
      const numProductos = new Set(res.lines.map(l => l.producto)).size;
      const inv = {
        id, name,
        virtualSalt: salt,
        virtualRef: ref,
        productos: numProductos,
        lotes: res.lines.length,
        estados: res.states,
        virtualDate: new Date().toISOString(),
        status: 'BORRADOR',
        createdAt: new Date().toISOString(),
        createdBy: session.username,
        tasks: [],
        assignees: [],
        fisicos: {},
        historial: []
      };
      virtualCache.set(id, res.lines);
      inv.tasks = res.lines.map((l, i) => ({
        id: 't' + i + '_' + Date.now().toString(36),
        producto: l.producto, lote: l.lote, estados: res.states
      }));
      DB.saveInventory(inv);
      pendingUpload = null;
      UI.loading(false);
      UI.toast('Inventario virtual creado (BORRADOR)');
      nav('inventarios');
    } catch (err) {
      UI.loading(false);
      UI.toast('Error: ' + err.message, 'err');
    }
  }

  // ============ USUARIOS ============
  function renderUsuarios() {
    const users = DB.listUsers();
    shell(`
      <div class="card">
        <h3 style="margin-bottom:14px">Crear usuario</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div class="field" style="flex:1;min-width:160px"><label>Nombre</label><input id="nu-name"></div>
          <div class="field" style="flex:1;min-width:140px"><label>Usuario</label><input id="nu-username"></div>
          <div class="field"><label>Rol</label><select id="nu-role"><option value="bodega">BODEGA</option><option value="admin">ADMIN</option></select></div>
          <div style="align-self:end"><button class="btn btn-primary" onclick="AdminView.createUser()">Crear</button></div>
        </div>
        <div id="nu-result" style="margin-top:10px"></div>
      </div>
      <div class="table-wrap card" style="margin-top:18px">
        <h3 style="margin-bottom:10px">Usuarios</h3>
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr></thead>
          <tbody>${users.map(u=>`<tr>
            <td>${UI.esc(u.name)}</td><td>${UI.esc(u.username)}</td>
            <td>${u.role==='admin'?'<span class="pill pill-purple">ADMIN</span>':'<span class="pill pill-blue">BODEGA</span>'}</td>
            <td>${UI.fmtDate(u.createdAt)}</td>
            <td><button class="btn btn-sm btn-outline" onclick="AdminView.resetPass('${u.id}')">Resetear contraseña</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="card" style="margin-top:18px">
        <h3 style="margin-bottom:8px">Asignar inventario a usuarios de bodega</h3>
        ${assignForm()}
      </div>
    `);
  }

  function assignForm() {
    const invs = DB.listInventories().filter(i => ['BORRADOR','EN CONTEO','RECONTEO'].includes(i.status));
    const users = DB.listUsers().filter(u => u.role === 'bodega');
    if (!invs.length || !users.length) return `<p class="hint">Crea primero un inventario y usuarios de bodega.</p>`;
    return `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="field"><label>Inventario</label><select id="assign-inv">${invs.map(i=>`<option value="${i.id}">${UI.esc(i.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Usuarios de bodega</label><select id="assign-users" multiple size="4">${users.map(u=>`<option value="${u.id}">${UI.esc(u.name)}</option>`).join('')}</select></div>
        <button class="btn btn-success" onclick="AdminView.assignInventory()">Asignar y abrir conteo</button>
      </div>
      <p class="hint" style="margin-top:6px">Mantén Ctrl para seleccionar varios usuarios.</p>`;
  }

  function assignInventory() {
    const invSel = document.getElementById('assign-inv');
    const userSel = document.getElementById('assign-users');
    if (!invSel || !userSel) return;
    const invId = invSel.value;
    const uids = Array.from(userSel.selectedOptions).map(o => o.value);
    if (!uids.length) return UI.toast('Selecciona al menos un usuario', 'err');
    const inv = DB.getInventory(invId);
    uids.forEach(uid => {
      if (!inv.assignees.includes(uid)) inv.assignees.push(uid);
      // crear tareas del usuario (solo producto/lote/estados, SIN cantidades)
      const tasks = DB.userTasks(uid);
      if (!tasks[invId]) {
        tasks[invId] = { invId, items: inv.tasks.map(t => ({
          id: t.id, producto: t.producto, lote: t.lote, estados: t.estados,
          conteo: null, total: 0, done: false
        })), currentIndex: 0, startedAt: new Date().toISOString() };
        DB.setUserTasks(uid, tasks);
      }
    });
    if (inv.status === 'BORRADOR') inv.status = 'EN CONTEO';
    inv.openedAt = new Date().toISOString();
    DB.saveInventory(inv);
    DB.addAudit({ action: 'abrir_inventario', user: session.username, invId, users: uids });
    UI.toast('Inventario asignado y abierto en conteo');
    nav('usuarios');
  }

  async function createUser() {
    const name = document.getElementById('nu-name').value.trim();
    const username = document.getElementById('nu-username').value.trim();
    const role = document.getElementById('nu-role').value;
    if (!name || !username) return UI.toast('Completa nombre y usuario', 'err');
    try {
      const { user, password } = await DB.createUser({ name, username, role });
      document.getElementById('nu-result').innerHTML = `
        <div class="card" style="background:#e8f5e9;border:1px solid #a5d6a7">
          Usuario <b>${UI.esc(username)}</b> creado. Contraseña temporal: <b>${password}</b><br>
          <span class="hint">Entrega esta contraseña al usuario. La cambiará al primer ingreso.</span>
        </div>`;
      nav('usuarios');
      document.getElementById('nu-result').scrollIntoView();
    } catch (err) { UI.toast(err.message, 'err'); }
  }

  async function resetPass(id) {
    const u = DB.listUsers().find(x => x.id === id);
    if (!u) return;
    const newPass = String(Math.floor(100000 + Math.random() * 900000));
    await DB.setPassword(id, newPass);
    UI.toast(`Nueva contraseña para ${u.name}: ${newPass}`);
  }

  // ============ HISTORIAL ============
  function renderHistorial() {
    const audit = DB.getAudit().slice().reverse();
    const invs = DB.listInventories();
    shell(`
      <div class="table-wrap card">
        <h3 style="margin-bottom:10px">Historial de auditoría</h3>
        <table><thead><tr><th>Fecha/Hora</th><th>Acción</th><th>Usuario</th><th>Inventario</th></tr></thead>
        <tbody>${audit.map(a=>`<tr>
          <td>${UI.fmtDate(a.ts)}</td><td>${UI.esc(a.action)}</td>
          <td>${UI.esc(a.user)}</td><td>${a.invId?UI.esc(a.invId):'—'}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="hint">Sin actividad registrada.</td></tr>'}</tbody></table>
      </div>
      <div class="table-wrap card" style="margin-top:18px">
        <h3 style="margin-bottom:10px">Historial de conteos por inventario</h3>
        ${invs.map(inv => {
          const h = (inv.historial||[]).slice().reverse();
          return `<h4 style="margin:8px 0">${UI.esc(inv.name)} (${inv.id})</h4>
            ${h.length?`<table><thead><tr><th>Tipo</th><th>Usuario</th><th>Fecha/Hora</th><th>Items</th></tr></thead>
              <tbody>${h.map(x=>`<tr><td>${x.type==='reconteo'?'<span class="pill pill-orange">RECONTEO</span>':'<span class="pill pill-blue">CONTEO</span>'}</td>
                <td>${UI.esc(x.userName)}</td><td>${UI.fmtDate(x.at)}</td><td class="num">${x.items}</td></tr>`).join('')}</tbody></table>`
              :'<p class="hint">Sin conteos registrados.</p>'}`;
        }).join('') || '<p class="hint">Sin inventarios.</p>'}
      </div>
    `);
  }

  // ============ HELPERS DE COMPARACIÓN ============
  async function buildComparison(inv) {
    const virtual = await getVirtualLines(inv);
    const fisicoItems = consolidateFisico(inv);
    const summary = Compare.compare(virtual, fisicoItems, inv.estados);
    // resumen de cambios de estado
    let resumenEstados = 0;
    summary.rows.forEach(r => {
      if (r.estado === 'CAMBIO DE ESTADO') {
        resumenEstados += Object.keys(r.estados).reduce((a,s)=>a+Math.abs(r.estados[s].diff),0);
      }
    });
    return { summary, virtual, fisicoItems, resumenEstados };
  }

  function consolidateFisico(inv) {
    const fis = inv.fisicos || {};
    const items = [];
    const map = {};
    Object.values(fis).forEach(f => {
      (f.items||[]).forEach(it => {
        const key = it.producto + '|' + it.lote;
        if (!map[key]) { map[key] = { producto: it.producto, lote: it.lote, estados: {} }; items.push(map[key]); }
        Object.keys(it.estados||{}).forEach(s => map[key].estados[s] = (map[key].estados[s]||0) + it.estados[s]);
      });
    });
    // totales físicos
    items.forEach(i => {
      i.total = Object.values(i.estados).reduce((a,b)=>a+b,0);
      if (!i.estados.buenos) i.estados.buenos = i.total;
    });
    return items;
  }

  function statusPill(s) {
    const map = {
      'BORRADOR': 'pill-gray', 'EN CONTEO': 'pill-blue', 'PENDIENTE DE REVISIÓN': 'pill-yellow',
      'RECONTEO': 'pill-orange', 'FINALIZADO': 'pill-green', 'CON DIFERENCIAS': 'pill-red',
      'CONCILIADO': 'pill-purple', 'CERRADO': 'pill-green'
    };
    return `<span class="pill ${map[s]||'pill-gray'}">${UI.esc(s)}</span>`;
  }

  function comparisonTabla(data, inv) {
    const rows = data.summary.rows;
    const estados = inv.estados;
    if (!rows.length) return '<p class="hint">Sin datos.</p>';
    return `<table>
      <thead><tr><th>Producto</th><th>Lote</th><th class="num">Virtual</th><th class="num">Físico</th><th class="num">Diff</th><th>Estado</th>${
        estados.map(s=>`<th class="num">V.${UI.esc(s.slice(0,3)).toUpperCase()}</th>`).join('')}${
        estados.map(s=>`<th class="num">F.${UI.esc(s.slice(0,3)).toUpperCase()}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr class="${r.hasDiff?'row-diff':''}">
        <td>${UI.esc(r.producto)}</td><td>${UI.esc(r.lote)}</td>
        <td class="num">${r.vTotal}</td><td class="num">${r.fTotal}</td>
        <td class="num" style="color:${r.totalDiff<0?'var(--danger)':r.totalDiff>0?'var(--warn)':'inherit'}">${r.totalDiff>0?'+':''}${r.totalDiff}</td>
        <td>${statePill(r.estado)}</td>
        ${estados.map(s=>`<td class="num">${r.estados[s]?r.estados[s].v:0}</td>`).join('')}
        ${estados.map(s=>`<td class="num">${r.estados[s]?r.estados[s].f:0}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function statePill(s) {
    const map = { 'CUADRADO':'pill-green','FALTANTE':'pill-red','SOBRANTE':'pill-orange','CAMBIO DE ESTADO':'pill-purple','NO ENCONTRADO':'pill-gray','NO ESPERADO':'pill-yellow','SIN DIFERENCIA':'pill-green' };
    return `<span class="pill ${map[s]||'pill-gray'}">${UI.esc(s)}</span>`;
  }

  function resumenTabla(inv) {
    const fis = inv.fisicos || {};
    let pendientes = inv.assignees.filter(u => !fis[u]).length;
    return `<p class="hint">Asignados: ${inv.assignees.length} · Han finalizado: ${Object.keys(fis).length} · Pendientes: ${pendientes}</p>`;
  }

  return { init, nav, logout, toggleMenu, renderDashboard, renderInventarios, detailInventory,
    renderUpload, processUpload, createInventory, renderUsuarios, createUser, resetPass,
    assignInventory, renderHistorial, reopen, conciliar, buildComparison, statusPill };
})();
