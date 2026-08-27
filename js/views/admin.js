const AdminView = {
  currentCycleId: null,

  async init() {
    this.bindEvents();
    await this.loadDashboard();
  },

  bindEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('#admin-content .view').forEach(v => v.classList.remove('active'));
        document.getElementById(`admin-view-${view}`).classList.add('active');
        this.loadView(view);
      });
    });
  },

  async loadView(view) {
    switch (view) {
      case 'dashboard': await this.loadDashboard(); break;
      case 'cycles': await this.loadCycles(); break;
      case 'import': await this.loadImport(); break;
      case 'counts': await this.loadCounts(); break;
      case 'compare': await this.loadCompare(); break;
      case 'recounts': await this.loadRecounts(); break;
      case 'reconcile': await this.loadReconcile(); break;
      case 'reports': await this.loadReports(); break;
      case 'users': await this.loadUsers(); break;
    }
  },

  async loadDashboard() {
    const container = document.getElementById('admin-view-dashboard');
    container.innerHTML = '<div class="loading">Cargando dashboard...</div>';
    try {
      const cycles = await DB.getCycles();
      const activeCycle = cycles.find(c => c.status !== 'CERRADO' && c.status !== 'BORRADOR');
      let stats = { totalCycles: cycles.length, openCycles: 0, virtualImported: 0 };

      cycles.forEach(c => {
        if (['CONTEO_ABIERTO', 'RECONTEO', 'EN_REVISION'].includes(c.status)) stats.openCycles++;
        if (c.virtualImportId) stats.virtualImported++;
      });

      let cycleDetails = [];
      for (const cycle of cycles.slice(0, 5)) {
        const counts = await DB.getPhysicalCounts(cycle.id);
        const pending = counts.filter(c => c.status === 'BORRADOR' || c.status === 'ENVIADO').length;
        const approved = counts.filter(c => c.status === 'APROBADO' || c.status === 'BLOQUEADO').length;
        cycleDetails.push({ ...cycle, countPending: pending, countApproved: approved, totalCounts: counts.length });
      }

      container.innerHTML = `
        <h2>Dashboard</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${stats.totalCycles}</div>
            <div class="stat-label">Inventarios Totales</div>
          </div>
          <div class="stat-card stat-active">
            <div class="stat-number">${stats.openCycles}</div>
            <div class="stat-label">Inventarios Activos</div>
          </div>
          <div class="stat-card stat-success">
            <div class="stat-number">${stats.virtualImported}</div>
            <div class="stat-label">Con Virtual Importado</div>
          </div>
        </div>
        <h3>Inventarios Recientes</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Conteos</th>
                <th>Pendientes</th>
                <th>Aprobados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${cycleDetails.map(c => `
                <tr>
                  <td>${c.name}</td>
                  <td>${UI.statusBadge(c.status)}</td>
                  <td>${c.totalCounts}</td>
                  <td>${c.countPending}</td>
                  <td>${c.countApproved}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="AdminView.selectCycle('${c.id}')">Seleccionar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${cycles.length === 0 ? '<p class="empty-state">No hay inventarios creados. Cree uno desde la pestaña Inventarios.</p>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async loadCycles() {
    const container = document.getElementById('admin-view-cycles');
    container.innerHTML = '<div class="loading">Cargando inventarios...</div>';
    try {
      const cycles = await DB.getCycles();
      container.innerHTML = `
        <div class="view-header">
          <h2>Inventarios Semanales</h2>
          <button class="btn btn-primary" onclick="AdminView.showCreateCycle()">+ Nuevo Inventario</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Virtual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${cycles.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${UI.statusBadge(c.status)}</td>
                  <td>${UI.formatDate(c.createdAt)}</td>
                  <td>${c.virtualImportId ? '✓ Importado' : 'Pendiente'}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-outline" onclick="AdminView.selectCycle('${c.id}')">Seleccionar</button>
                    ${c.status === 'CONCILIADO' ? `<button class="btn btn-sm btn-success" onclick="AdminView.closeCycle('${c.id}')">Cerrar</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${cycles.length === 0 ? '<p class="empty-state">No hay inventarios creados aún.</p>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async showCreateCycle() {
    UI.showModal('Crear Inventario Semanal', `
      <div class="form-group">
        <label>Nombre del inventario</label>
        <input type="text" id="cycle-name" class="form-control" placeholder="Ej: Inventario Semana 35 - 2026" required>
      </div>
      <div class="form-group">
        <label>Descripción (opcional)</label>
        <textarea id="cycle-desc" class="form-control" rows="2" placeholder="Descripción del inventario..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="AdminView.createCycle()">Crear</button>
    `);
  },

  async createCycle() {
    const name = document.getElementById('cycle-name').value.trim();
    const description = document.getElementById('cycle-desc').value.trim();
    if (!name) { UI.toast('Ingrese un nombre', 'error'); return; }

    try {
      const cycleId = await DB.createCycle({
        name, description,
        createdBy: Auth.currentUser.uid
      });
      UI.closeModal();
      UI.toast('Inventario creado exitosamente', 'success');
      this.currentCycleId = cycleId;
      await this.loadCycles();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  selectCycle(cycleId) {
    this.currentCycleId = cycleId;
    UI.toast('Inventario seleccionado', 'info');
  },

  async closeCycle(cycleId) {
    if (!await UI.confirm('¿Está seguro de cerrar este inventario? No se podrán hacer más cambios.')) return;
    try {
      await DB.callFunction('closeCycle', { cycleId });
      UI.toast('Inventario cerrado', 'success');
      await this.loadCycles();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadImport() {
    const container = document.getElementById('admin-view-import');
    const cycles = await DB.getCycles();
    const activeCycles = cycles.filter(c => c.status !== 'CERRADO');

    container.innerHTML = `
      <div class="view-header">
        <h2>Importar Inventario Virtual</h2>
      </div>
      <div class="card">
        <div class="form-group">
          <label>Seleccionar inventario semanal</label>
          <select id="import-cycle" class="form-control">
            <option value="">-- Seleccionar --</option>
            ${activeCycles.map(c => `<option value="${c.id}">${c.name} (${c.status})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Archivo Excel</label>
          <div class="file-upload" id="file-upload-area">
            <input type="file" id="import-file" accept=".xlsx,.xls" style="display:none">
            <button class="btn btn-outline" onclick="document.getElementById('import-file').click()">
              Seleccionar archivo Excel
            </button>
            <span id="file-name" class="file-name">Ningún archivo seleccionado</span>
          </div>
        </div>
        <div id="import-preview" style="display:none"></div>
        <div id="import-errors" style="display:none"></div>
        <button class="btn btn-primary" id="import-btn" onclick="AdminView.importExcel()" disabled>
          <span class="btn-text">Importar Inventario Virtual</span>
          <span class="btn-loader" style="display:none"></span>
        </button>
      </div>
    `;

    document.getElementById('import-file').addEventListener('change', (e) => this.previewExcel(e));
  },

  async previewExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('file-name').textContent = file.name;
    UI.setLoading('import-btn', true);
    document.getElementById('import-btn').disabled = true;

    try {
      const workbook = await ExcelUtil.parseFile(file);
      const analysis = ExcelUtil.analyzeWorkbook(workbook);
      const preview = document.getElementById('import-preview');
      const errorsDiv = document.getElementById('import-errors');

      preview.style.display = 'block';
      preview.innerHTML = `
        <h4>Vista previa del archivo</h4>
        <p><strong>Hoja:</strong> ${analysis.sheetName} | <strong>Registros:</strong> ${analysis.totalRows}</p>
        <p><strong>Estados detectados:</strong> ${analysis.states.join(', ')}</p>
        <table class="data-table data-table-sm">
          <thead>
            <tr>
              ${analysis.headers.slice(0, 10).map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${analysis.items.slice(0, 5).map(item => `
              <tr>
                <td>${item.codigo}</td>
                <td>${item.producto}</td>
                <td>${item.lote}</td>
                <td>${UI.formatNumber(item.ingresos)}</td>
                <td>${UI.formatNumber(item.egresos)}</td>
                <td>${UI.formatNumber(item.saldo)}</td>
                <td>${UI.formatNumber(item.buenos)}</td>
                <td>${UI.formatNumber(item.danados)}</td>
                <td>${UI.formatNumber(item.arreglados)}</td>
                <td>${UI.formatNumber(item.reempacados)}</td>
              </tr>
            `).join('')}
            ${analysis.items.length > 5 ? `<tr><td colspan="10" class="text-center">... y ${analysis.items.length - 5} registros más</td></tr>` : ''}
          </tbody>
        </table>
      `;

      if (analysis.errors.length > 0) {
        errorsDiv.style.display = 'block';
        errorsDiv.innerHTML = `
          <div class="warning-box">
            <strong>Advertencias (${analysis.errors.length}):</strong>
            <ul>${analysis.errors.slice(0, 10).map(e => `<li>Fila ${e.row}: ${e.message}</li>`).join('')}</ul>
          </div>
        `;
      }

      this._pendingAnalysis = analysis;
      const cycleId = document.getElementById('import-cycle').value;
      document.getElementById('import-btn').disabled = !cycleId;
    } catch (err) {
      UI.toast('Error al analizar archivo: ' + err.message, 'error');
    } finally {
      UI.setLoading('import-btn', false);
    }
  },

  async importExcel() {
    const cycleId = document.getElementById('import-cycle').value;
    if (!cycleId) { UI.toast('Seleccione un inventario', 'error'); return; }

    const file = document.getElementById('import-file').files[0];
    if (!file) { UI.toast('Seleccione un archivo', 'error'); return; }

    if (!await UI.confirm('¿Importar este inventario virtual? Se reemplazará cualquier importación anterior.')) return;

    UI.setLoading('import-btn', true);
    try {
      const fileBase64 = await ExcelUtil.fileToBase64(file);
      const result = await DB.callFunction('importVirtualInventory', {
        cycleId, fileBase64, fileName: file.name
      });

      UI.toast(`Importados ${result.data.itemCount} registros exitosamente`, 'success');
      if (result.data.errors && result.data.errors.length > 0) {
        UI.toast(`${result.data.errors.length} advertencias encontradas`, 'warning');
      }
      await this.loadImport();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      UI.setLoading('import-btn', false);
    }
  },

  async loadCounts() {
    const container = document.getElementById('admin-view-counts');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario desde el Dashboard o la pestaña Inventarios.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando conteos...</div>';
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const counts = await DB.getPhysicalCounts(this.currentCycleId);
      const draftCounts = counts.filter(c => c.status === 'BORRADOR' || c.status === 'ENVIADO');
      const approvedCounts = counts.filter(c => c.status === 'APROBADO' || c.status === 'BLOQUEADO');

      container.innerHTML = `
        <div class="view-header">
          <h2>Conteos Físicos - ${cycle?.name || ''}</h2>
          <div class="btn-group">
            <button class="btn btn-outline" onclick="AdminView.blockAllCounts()">Bloquear Aprobados</button>
          </div>
        </div>
        <div class="stats-row">
          <span class="stat-inline">Total: <strong>${counts.length}</strong></span>
          <span class="stat-inline">Pendientes: <strong>${draftCounts.length}</strong></span>
          <span class="stat-inline">Aprobados: <strong>${approvedCounts.length}</strong></span>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Registros</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Versión</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${counts.map(c => {
                const totalQty = (c.detail || []).reduce((sum, d) => sum + (d.buenos||0) + (d.danados||0) + (d.arreglados||0) + (d.reempacados||0), 0);
                return `
                  <tr>
                    <td>${UI.formatDateTime(c.createdAt)}</td>
                    <td>${c.userId?.substring(0, 8)}...</td>
                    <td>${(c.detail || []).length}</td>
                    <td>${UI.formatNumber(totalQty)}</td>
                    <td>${UI.statusBadge(c.status)}</td>
                    <td>${c.version || 1}</td>
                    <td class="actions-cell">
                      ${c.status === 'BORRADOR' || c.status === 'ENVIADO' ? `
                        <button class="btn btn-sm btn-success" onclick="AdminView.approveCount('${c.id}', true)">Aprobar</button>
                        <button class="btn btn-sm btn-danger" onclick="AdminView.approveCount('${c.id}', false)">Rechazar</button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${counts.length === 0 ? '<p class="empty-state">No hay conteos registrados aún.</p>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async approveCount(countId, approved) {
    if (!await UI.confirm(approved ? '¿Aprobar este conteo?' : '¿Rechazar este conteo?')) return;
    try {
      await DB.callFunction('approvePhysicalCount', {
        cycleId: this.currentCycleId, countId, approved
      });
      UI.toast(approved ? 'Conteo aprobado' : 'Conteo rechazado', 'success');
      await this.loadCounts();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async blockAllCounts() {
    if (!await UI.confirm('¿Bloquear todos los conteos aprobados? No se podrán editar.')) return;
    try {
      const result = await DB.callFunction('blockPhysicalCounts', { cycleId: this.currentCycleId });
      UI.toast(`${result.data.blocked} conteos bloqueados`, 'success');
      await this.loadCounts();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadCompare() {
    const container = document.getElementById('admin-view-compare');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando comparación...</div>';
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const comparisons = await DB.getComparisons(this.currentCycleId);
      const latest = comparisons[0];

      container.innerHTML = `
        <div class="view-header">
          <h2>Comparación Virtual vs Físico - ${cycle?.name || ''}</h2>
          <button class="btn btn-primary" onclick="AdminView.runComparison()">Ejecutar Comparación</button>
        </div>
        ${latest ? `
          <div class="card">
            <h4>Última Comparación - ${UI.formatDateTime(latest.createdAt)}</h4>
            <div class="stats-grid">
              <div class="stat-card"><div class="stat-number">${latest.summary.total}</div><div class="stat-label">Total</div></div>
              <div class="stat-card stat-success"><div class="stat-number">${latest.summary.sinDiferencia}</div><div class="stat-label">Sin diferencia</div></div>
              <div class="stat-card stat-danger"><div class="stat-number">${latest.summary.faltantes}</div><div class="stat-label">Faltantes</div></div>
              <div class="stat-card stat-warning"><div class="stat-number">${latest.summary.sobrantes}</div><div class="stat-label">Sobrantes</div></div>
              <div class="stat-card"><div class="stat-number" style="color:#7c3aed">${latest.summary.cambioEstado}</div><div class="stat-label">Cambios estado</div></div>
            </div>
            <div class="table-responsive">
              <table class="data-table data-table-sm">
                <thead>
                  <tr>
                    <th>Código</th><th>Producto</th><th>Lote</th>
                    <th>Virtual</th><th>Físico</th><th>Dif.</th><th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  ${latest.results.map(r => `
                    <tr class="${r.tipo !== 'SIN_DIFERENCIA' ? 'row-highlight' : ''}">
                      <td>${r.codigo}</td><td>${r.producto}</td><td>${r.lote}</td>
                      <td>${UI.formatNumber(r.virtual.total)}</td>
                      <td>${UI.formatNumber(r.physical.total)}</td>
                      <td class="${r.diferencia < 0 ? 'text-danger' : r.diferencia > 0 ? 'text-warning' : ''}">${UI.formatNumber(r.diferencia)}</td>
                      <td>${UI.diffBadge(r.tipo)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <button class="btn btn-outline" onclick="AdminView.exportComparison()">Exportar Excel</button>
          </div>
        ` : '<p class="empty-state">No hay comparaciones ejecutadas aún.</p>'}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async runComparison() {
    if (!await UI.confirm('¿Ejecutar comparación virtual vs físico?')) return;
    try {
      const result = await DB.callFunction('runComparison', { cycleId: this.currentCycleId });
      UI.toast('Comparación ejecutada', 'success');
      await this.loadCompare();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async exportComparison() {
    try {
      const comparisons = await DB.getComparisons(this.currentCycleId);
      if (!comparisons[0]) { UI.toast('No hay comparación', 'error'); return; }
      ExcelUtil.exportComparisonToExcel(comparisons[0]);
      UI.toast('Exportado correctamente', 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadRecounts() {
    const container = document.getElementById('admin-view-recounts');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando reconteos...</div>';
    try {
      const requests = await DB.getRecountRequests(this.currentCycleId);
      const users = await Auth.getAllUsers();
      const userMap = {};
      users.forEach(u => userMap[u.uid] = u.email || u.uid.substring(0, 8));

      container.innerHTML = `
        <div class="view-header">
          <h2>Solicitudes de Reconteo</h2>
          <button class="btn btn-primary" onclick="AdminView.showCreateRecount()">+ Solicitar Reconteo</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Producto/Lote</th>
                <th>Motivo</th>
                <th>Asignado a</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map(r => `
                <tr>
                  <td>${r.productKey}</td>
                  <td>${r.motivo}</td>
                  <td>${userMap[r.assignedTo] || r.assignedTo?.substring(0, 8)}</td>
                  <td>${UI.statusBadge(r.status)}</td>
                  <td>${UI.formatDateTime(r.createdAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${requests.length === 0 ? '<p class="empty-state">No hay reconteos solicitados.</p>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async showCreateRecount() {
    const users = await Auth.getAllUsers();
    const bodegaUsers = users.filter(u => u.role === 'BODEGA');

    UI.showModal('Solicitar Reconteo', `
      <div class="form-group">
        <label>Producto/Lote (formato: Código|Producto|Lote)</label>
        <input type="text" id="recount-key" class="form-control" placeholder="01-001|LECHE DESCREMADA|Z53100017">
      </div>
      <div class="form-group">
        <label>Motivo</label>
        <textarea id="recount-motivo" class="form-control" rows="2" placeholder="Motivo del reconteo..."></textarea>
      </div>
      <div class="form-group">
        <label>Asignar a</label>
        <select id="recount-assigned" class="form-control">
          ${bodegaUsers.map(u => `<option value="${u.uid}">${u.email || u.uid}</option>`).join('')}
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="AdminView.createRecount()">Crear</button>
    `);
  },

  async createRecount() {
    const productKey = document.getElementById('recount-key').value.trim();
    const motivo = document.getElementById('recount-motivo').value.trim();
    const assignedTo = document.getElementById('recount-assigned').value;

    if (!productKey || !motivo || !assignedTo) {
      UI.toast('Todos los campos son requeridos', 'error');
      return;
    }

    try {
      await DB.callFunction('createRecountRequest', {
        cycleId: this.currentCycleId, productKey, motivo, assignedTo
      });
      UI.closeModal();
      UI.toast('Reconteo solicitado', 'success');
      await this.loadRecounts();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadReconcile() {
    const container = document.getElementById('admin-view-reconcile');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const comparisons = await DB.getComparisons(this.currentCycleId);
      const latest = comparisons[0];
      const reconciliations = await DB.getReconciliations(this.currentCycleId);

      container.innerHTML = `
        <div class="view-header">
          <h2>Conciliación - ${cycle?.name || ''}</h2>
        </div>
        ${reconciliations.length > 0 ? `
          <div class="card">
            <h4>Historial de Conciliaciones</h4>
            ${reconciliations.map(r => `
              <div class="reconciliation-item">
                <p><strong>Fecha:</strong> ${UI.formatDateTime(r.createdAt)}</p>
                <p><strong>Notas:</strong> ${r.notes || '-'}</p>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${latest ? `
          <div class="card">
            <h4>Conciliación Pendiente</h4>
            <p>Faltantes: ${latest.summary.faltantes} | Sobrantes: ${latest.summary.sobrantes} | Cambios de estado: ${latest.summary.cambioEstado}</p>
            <div class="form-group">
              <label>Notas de conciliación</label>
              <textarea id="reconcile-notes" class="form-control" rows="3" placeholder="Observaciones de la conciliación..."></textarea>
            </div>
            <button class="btn btn-success" onclick="AdminView.runReconcile()">Confirmar Conciliación</button>
          </div>
        ` : '<p class="empty-state">No hay comparaciones para conciliar.</p>'}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async runReconcile() {
    if (!await UI.confirm('¿Confirmar conciliación? Se actualizará el inventario virtual.')) return;

    try {
      const comparisons = await DB.getComparisons(this.currentCycleId);
      const latest = comparisons[0];
      if (!latest) throw new Error('No hay comparación');

      const notes = document.getElementById('reconcile-notes')?.value || '';

      await DB.callFunction('reconcileInventory', {
        cycleId: this.currentCycleId,
        comparisonId: latest.id,
        acceptedCounts: [],
        adjustments: {},
        notes
      });

      UI.toast('Inventario conciliado', 'success');
      await this.loadReconcile();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadReports() {
    const container = document.getElementById('admin-view-reports');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando reportes...</div>';
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const virtualItems = await DB.getVirtualItems(cycle?.virtualImportId || '');
      const counts = await DB.getPhysicalCounts(this.currentCycleId);
      const comparisons = await DB.getComparisons(this.currentCycleId);

      container.innerHTML = `
        <div class="view-header">
          <h2>Reportes y Exportaciones</h2>
        </div>
        <div class="reports-grid">
          <div class="report-card">
            <h4>Inventario Virtual</h4>
            <p>${virtualItems.length} registros</p>
            <button class="btn btn-outline" onclick="AdminView.exportVirtual()" ${virtualItems.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
          </div>
          <div class="report-card">
            <h4>Conteos Físicos</h4>
            <p>${counts.length} conteos</p>
            <button class="btn btn-outline" onclick="AdminView.exportPhysicalCounts()" ${counts.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
          </div>
          <div class="report-card">
            <h4>Comparación</h4>
            <p>${comparisons.length > 0 ? 'Disponible' : 'No ejecutada'}</p>
            <button class="btn btn-outline" onclick="AdminView.exportComparison()" ${comparisons.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
          </div>
          <div class="report-card">
            <h4>Auditoría</h4>
            <p>Historial de acciones</p>
            <button class="btn btn-outline" onclick="AdminView.showAuditLog()">Ver Log</button>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async exportVirtual() {
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const items = await DB.getVirtualItems(cycle?.virtualImportId || '');
      ExcelUtil.exportVirtualToExcel(items);
      UI.toast('Exportado', 'success');
    } catch (err) { UI.toast('Error: ' + err.message, 'error'); }
  },

  async exportPhysicalCounts() {
    try {
      const counts = await DB.getPhysicalCounts(this.currentCycleId);
      ExcelUtil.exportPhysicalCountsToExcel(counts);
      UI.toast('Exportado', 'success');
    } catch (err) { UI.toast('Error: ' + err.message, 'error'); }
  },

  async showAuditLog() {
    const logs = await DB.getAuditLogs({ cycleId: this.currentCycleId });
    UI.showModal('Log de Auditoría', `
      <div class="table-responsive">
        <table class="data-table data-table-sm">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Detalles</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${UI.formatDateTime(l.timestamp)}</td>
                <td>${l.action}</td>
                <td>${l.userId?.substring(0, 8)}</td>
                <td><pre>${JSON.stringify(l.details, null, 1)}</pre></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `, '<button class="btn btn-secondary" onclick="UI.closeModal()">Cerrar</button>');
  },

  async loadUsers() {
    const container = document.getElementById('admin-view-users');
    container.innerHTML = '<div class="loading">Cargando usuarios...</div>';
    try {
      const users = await Auth.getAllUsers();
      container.innerHTML = `
        <div class="view-header">
          <h2>Gestión de Usuarios</h2>
          <button class="btn btn-primary" onclick="AdminView.showCreateUser()">+ Crear Usuario</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>UID</th><th>Email</th><th>Rol</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>${u.uid.substring(0, 12)}...</td>
                  <td>${u.email || '-'}</td>
                  <td>${UI.statusBadge(u.role || 'SIN_ROL')}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" onclick="AdminView.changeRole('${u.uid}', '${u.role || ''}')">Cambiar Rol</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async showCreateUser() {
    UI.showModal('Crear Usuario', `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="new-user-email" class="form-control" placeholder="correo@ejemplo.com">
      </div>
      <div class="form-group">
        <label>Contraseña</label>
        <input type="password" id="new-user-password" class="form-control" placeholder="Mínimo 6 caracteres">
      </div>
      <div class="form-group">
        <label>Rol</label>
        <select id="new-user-role" class="form-control">
          <option value="BODEGA">BODEGA</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="AdminView.createUser()">Crear</button>
    `);
  },

  async createUser() {
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!email || !password) { UI.toast('Email y contraseña requeridos', 'error'); return; }
    if (password.length < 6) { UI.toast('Contraseña mínima 6 caracteres', 'error'); return; }

    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      await DB.callFunction('setUserRole', { uid: result.user.uid, role });
      UI.closeModal();
      UI.toast('Usuario creado', 'success');
      await this.loadUsers();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async changeRole(uid, currentRole) {
    const newRole = currentRole === 'ADMIN' ? 'BODEGA' : 'ADMIN';
    if (!await UI.confirm(`¿Cambiar rol a ${newRole}?`)) return;
    try {
      await DB.callFunction('setUserRole', { uid, role: newRole });
      UI.toast('Rol actualizado', 'success');
      await this.loadUsers();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  }
};
