const BodegaView = {
  currentCycleId: null,
  currentCountId: null,
  palletGroups: [],
  individualSacos: [],

  async init() {
    this.bindEvents();
    await this.loadCycles();
  },

  bindEvents() {
    document.querySelectorAll('.bodega-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.bodega-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.bodega-content .view').forEach(v => v.classList.remove('active'));
        document.getElementById(`bodega-view-${view}`).classList.add('active');
        this.loadView(view);
      });
    });
  },

  async loadView(view) {
    switch (view) {
      case 'cycles': await this.loadCycles(); break;
      case 'count': await this.loadCountForm(); break;
      case 'history': await this.loadHistory(); break;
    }
  },

  async loadCycles() {
    const container = document.getElementById('bodega-view-cycles');
    container.innerHTML = '<div class="loading">Cargando inventarios...</div>';
    try {
      const cycles = await DB.getCycles();
      const activeCycles = cycles.filter(c =>
        ['CONTEO_ABIERTO', 'RECONTEO'].includes(c.status)
      );

      container.innerHTML = `
        <h2>Inventarios Abiertos</h2>
        ${activeCycles.length === 0 ? '<p class="empty-state">No hay inventarios abiertos para conteo.</p>' : ''}
        <div class="cycle-list">
          ${activeCycles.map(c => `
            <div class="cycle-card ${this.currentCycleId === c.id ? 'selected' : ''}" onclick="BodegaView.selectCycle('${c.id}')">
              <h3>${c.name}</h3>
              <p>${UI.statusBadge(c.status)}</p>
              <p class="text-sm text-muted">${c.description || ''}</p>
            </div>
          `).join('')}
        </div>
        ${this.currentCycleId ? '<button class="btn btn-primary btn-block" onclick="BodegaView.goToCount()">Ir a Conteo</button>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  selectCycle(cycleId) {
    this.currentCycleId = cycleId;
    this.loadCycles();
  },

  goToCount() {
    if (!this.currentCycleId) { UI.toast('Seleccione un inventario', 'error'); return; }
    document.querySelectorAll('.bodega-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.bodega-nav-item[data-view="count"]').classList.add('active');
    document.querySelectorAll('.bodega-content .view').forEach(v => v.classList.remove('active'));
    document.getElementById('bodega-view-count').classList.add('active');
    this.loadCountForm();
  },

  async loadCountForm() {
    const container = document.getElementById('bodega-view-count');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario primero.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      const myCounts = await DB.getPhysicalCounts(this.currentCycleId, { userId: Auth.currentUser.uid });
      const lastCount = myCounts[0];

      this.palletGroups = lastCount?.palletGroups || [];
      this.individualSacos = lastCount?.individualSacos || [];
      this.currentCountId = lastCount?.id || null;

      container.innerHTML = `
        <h2>Registrar Conteo</h2>
        <p class="text-muted">Inventario: ${cycle?.name || ''}</p>

        <div class="form-group">
          <label>Producto</label>
          <select id="count-producto" class="form-control" onchange="BodegaView.onProductChange()">
            <option value="">-- Seleccionar producto --</option>
          </select>
        </div>

        <div id="count-lote-section" style="display:none">
          <div class="form-group">
            <label>Lote</label>
            <select id="count-lote" class="form-control">
              <option value="">-- Seleccionar lote --</option>
            </select>
          </div>
        </div>

        <div id="count-pallet-section" style="display:none">
          <h3>Calculadora de Pallets</h3>
          <p class="text-sm text-muted">Los pallets completos se registran como BUENOS automáticamente.</p>

          <div id="pallet-groups-container">
            ${(this.palletGroups || []).map((g, i) => `
              <div class="pallet-group-card">
                <div class="form-row">
                  <div class="form-group">
                    <label>Pallets</label>
                    <input type="number" class="form-control pallet-pallets" data-index="${i}" value="${g.pallets}" min="0" onchange="BodegaView.updateGroupTotal(${i})">
                  </div>
                  <div class="form-group">
                    <label>Sacos/Pallet</label>
                    <input type="number" class="form-control pallet-sacos" data-index="${i}" value="${g.sacosPerPallet}" min="0" onchange="BodegaView.updateGroupTotal(${i})">
                  </div>
                  <div class="form-group">
                    <label>Total</label>
                    <input type="text" class="form-control" id="group-total-${i}" value="${g.total}" readonly>
                  </div>
                  <button class="btn btn-sm btn-danger" onclick="BodegaView.removeGroup(${i})">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-outline btn-block" onclick="BodegaView.addGroup()">+ Agregar Grupo de Pallets</button>

          <h3>Sacos Individuales</h3>
          <p class="text-sm text-muted">Los sacos incompletos se registran uno por uno, clasificados por estado.</p>

          <div id="individual-sacos-container">
            ${(this.individualSacos || []).map((s, i) => `
              <div class="individual-saco-card">
                <div class="form-row">
                  <div class="form-group">
                    <label>Cantidad</label>
                    <input type="number" class="form-control saco-qty" data-index="${i}" value="${s.quantity}" min="0">
                  </div>
                  <div class="form-group">
                    <label>Estado</label>
                    <select class="form-control saco-state" data-index="${i}">
                      <option value="buenos" ${s.state === 'buenos' ? 'selected' : ''}>Buenos</option>
                      <option value="danados" ${s.state === 'danados' ? 'selected' : ''}>Dañados</option>
                      <option value="arreglados" ${s.state === 'arreglados' ? 'selected' : ''}>Arreglados</option>
                      <option value="reempacados" ${s.state === 'reempacados' ? 'selected' : ''}>Reempacados</option>
                    </select>
                  </div>
                  <button class="btn btn-sm btn-danger" onclick="BodegaView.removeSaco(${i})">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-outline btn-block" onclick="BodegaView.addSaco()">+ Agregar Saco Individual</button>

          <div id="count-summary" class="count-summary"></div>

          <button class="btn btn-primary btn-block" onclick="BodegaView.saveCount()">
            <span class="btn-text">${this.currentCountId ? 'Actualizar Conteo' : 'Guardar Conteo'}</span>
            <span class="btn-loader" style="display:none"></span>
          </button>
        </div>
      `;

      await this.loadProducts();
      this.updateSummary();
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  },

  async loadProducts() {
    try {
      const cycle = await DB.getCycle(this.currentCycleId);
      if (!cycle?.virtualImportId) {
        UI.toast('No hay inventario virtual importado', 'warning');
        return;
      }

      const virtualItems = await DB.getVirtualItems(cycle.virtualImportId);
      const products = {};
      virtualItems.forEach(v => {
        if (!products[v.codigo]) {
          products[v.codigo] = { codigo: v.codigo, producto: v.producto, lotes: [] };
        }
        products[v.codigo].lotes.push(v.lote);
      });

      const select = document.getElementById('count-producto');
      if (!select) return;
      Object.values(products).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.codigo;
        opt.textContent = `${p.codigo} - ${p.producto}`;
        opt.dataset.producto = p.producto;
        opt.dataset.lotes = JSON.stringify(p.lotes);
        select.appendChild(opt);
      });

      const lastCount = (await DB.getPhysicalCounts(this.currentCycleId, { userId: Auth.currentUser.uid }))[0];
      if (lastCount?.detail?.[0]) {
        select.value = lastCount.detail[0].codigo;
        this.onProductChange();
      }
    } catch (err) {
      console.error('Error loading products:', err);
    }
  },

  onProductChange() {
    const select = document.getElementById('count-producto');
    const option = select.options[select.selectedIndex];
    const loteSection = document.getElementById('count-lote-section');
    const palletSection = document.getElementById('count-pallet-section');

    if (!option.value) {
      loteSection.style.display = 'none';
      palletSection.style.display = 'none';
      return;
    }

    const lotes = JSON.parse(option.dataset.lotes || '[]');
    const loteSelect = document.getElementById('count-lote');
    loteSelect.innerHTML = '<option value="">-- Seleccionar lote --</option>';
    lotes.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      loteSelect.appendChild(opt);
    });

    loteSection.style.display = 'block';
    palletSection.style.display = 'block';
  },

  addGroup() {
    this.palletGroups.push(Calculator.createEmptyGroup());
    this.renderGroups();
  },

  removeGroup(index) {
    this.palletGroups.splice(index, 1);
    this.renderGroups();
    this.updateSummary();
  },

  updateGroupTotal(index) {
    const pallets = document.querySelector(`.pallet-pallets[data-index="${index}"]`);
    const sacos = document.querySelector(`.pallet-sacos[data-index="${index}"]`);
    if (!pallets || !sacos) return;

    this.palletGroups[index] = {
      pallets: Number(pallets.value) || 0,
      sacosPerPallet: Number(sacos.value) || 0,
      total: Calculator.calculateGroupTotal(Number(pallets.value), Number(sacos.value))
    };

    const totalEl = document.getElementById(`group-total-${index}`);
    if (totalEl) totalEl.value = this.palletGroups[index].total;
    this.updateSummary();
  },

  renderGroups() {
    const container = document.getElementById('pallet-groups-container');
    if (!container) return;
    container.innerHTML = this.palletGroups.map((g, i) => `
      <div class="pallet-group-card">
        <div class="form-row">
          <div class="form-group">
            <label>Pallets</label>
            <input type="number" class="form-control pallet-pallets" data-index="${i}" value="${g.pallets}" min="0" onchange="BodegaView.updateGroupTotal(${i})">
          </div>
          <div class="form-group">
            <label>Sacos/Pallet</label>
            <input type="number" class="form-control pallet-sacos" data-index="${i}" value="${g.sacosPerPallet}" min="0" onchange="BodegaView.updateGroupTotal(${i})">
          </div>
          <div class="form-group">
            <label>Total</label>
            <input type="text" class="form-control" id="group-total-${i}" value="${g.total}" readonly>
          </div>
          <button class="btn btn-sm btn-danger" onclick="BodegaView.removeGroup(${i})">✕</button>
        </div>
      </div>
    `).join('');
  },

  addSaco() {
    this.individualSacos.push({ quantity: 0, state: 'buenos' });
    this.renderSacos();
  },

  removeSaco(index) {
    this.individualSacos.splice(index, 1);
    this.renderSacos();
    this.updateSummary();
  },

  renderSacos() {
    const container = document.getElementById('individual-sacos-container');
    if (!container) return;
    container.innerHTML = this.individualSacos.map((s, i) => `
      <div class="individual-saco-card">
        <div class="form-row">
          <div class="form-group">
            <label>Cantidad</label>
            <input type="number" class="form-control saco-qty" data-index="${i}" value="${s.quantity}" min="0" onchange="BodegaView.updateSacoState(${i})">
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select class="form-control saco-state" data-index="${i}" onchange="BodegaView.updateSacoState(${i})">
              <option value="buenos" ${s.state === 'buenos' ? 'selected' : ''}>Buenos</option>
              <option value="danados" ${s.state === 'danados' ? 'selected' : ''}>Dañados</option>
              <option value="arreglados" ${s.state === 'arreglados' ? 'selected' : ''}>Arreglados</option>
              <option value="reempacados" ${s.state === 'reempacados' ? 'selected' : ''}>Reempacados</option>
            </select>
          </div>
          <button class="btn btn-sm btn-danger" onclick="BodegaView.removeSaco(${i})">✕</button>
        </div>
      </div>
    `).join('');
  },

  updateSacoState(index) {
    const qty = document.querySelector(`.saco-qty[data-index="${index}"]`);
    const state = document.querySelector(`.saco-state[data-index="${index}"]`);
    if (qty && state) {
      this.individualSacos[index] = { quantity: Number(qty.value) || 0, state: state.value };
    }
    this.updateSummary();
  },

  updateSummary() {
    const summaryEl = document.getElementById('count-summary');
    if (!summaryEl) return;

    const summary = Calculator.getSummary(this.palletGroups, this.individualSacos);
    summaryEl.innerHTML = `
      <div class="summary-box">
        <h4>Resumen del Conteo</h4>
        <div class="summary-grid">
          <div><span>Buenos:</span> <strong>${UI.formatNumber(summary.buenos)}</strong></div>
          <div><span>Dañados:</span> <strong>${UI.formatNumber(summary.danados)}</strong></div>
          <div><span>Arreglados:</span> <strong>${UI.formatNumber(summary.arreglados)}</strong></div>
          <div><span>Reempacados:</span> <strong>${UI.formatNumber(summary.reempacados)}</strong></div>
          <div class="summary-total"><span>Total:</span> <strong>${UI.formatNumber(summary.total)}</strong></div>
        </div>
        <p class="text-sm text-muted">${summary.summary}</p>
      </div>
    `;
  },

  async saveCount() {
    const codigo = document.getElementById('count-producto')?.value;
    const lote = document.getElementById('count-lote')?.value;
    const producto = document.getElementById('count-producto')?.options[document.getElementById('count-producto').selectedIndex]?.dataset?.producto;

    if (!codigo || !lote || !producto) {
      UI.toast('Seleccione producto y lote', 'error');
      return;
    }

    this.palletGroups = [];
    this.individualSacos = [];

    document.querySelectorAll('.pallet-pallets').forEach((el, i) => {
      this.palletGroups.push({
        pallets: Number(el.value) || 0,
        sacosPerPallet: Number(document.querySelector(`.pallet-sacos[data-index="${i}"]`)?.value) || 0,
        total: Calculator.calculateGroupTotal(Number(el.value), Number(document.querySelector(`.pallet-sacos[data-index="${i}"]`)?.value))
      });
    });

    document.querySelectorAll('.saco-qty').forEach((el, i) => {
      this.individualSacos.push({
        quantity: Number(el.value) || 0,
        state: document.querySelector(`.saco-state[data-index="${i}"]`)?.value || 'buenos'
      });
    });

    const detail = Calculator.buildDetailFromCalc(
      { codigo, producto, lote },
      this.palletGroups,
      this.individualSacos
    );

    const errors = Calculator.validateDetail(detail);
    if (errors.length > 0) {
      UI.toast(errors.join(', '), 'error');
      return;
    }

    try {
      await DB.callFunction('registerPhysicalCount', {
        cycleId: this.currentCycleId,
        countId: this.currentCountId,
        detail: [detail],
        palletGroups: this.palletGroups,
        individualSacos: this.individualSacos
      });

      UI.toast('Conteo guardado exitosamente', 'success');
      await this.loadCountForm();
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async loadHistory() {
    const container = document.getElementById('bodega-view-history');
    if (!this.currentCycleId) {
      container.innerHTML = '<p class="empty-state">Seleccione un inventario primero.</p>';
      return;
    }

    container.innerHTML = '<div class="loading">Cargando historial...</div>';
    try {
      const counts = await DB.getPhysicalCounts(this.currentCycleId, { userId: Auth.currentUser.uid });

      container.innerHTML = `
        <h2>Mi Historial de Conteos</h2>
        ${counts.length === 0 ? '<p class="empty-state">No tiene conteos registrados.</p>' : ''}
        ${counts.map(c => {
          const totalQty = (c.detail || []).reduce((sum, d) => sum + (d.buenos||0) + (d.danados||0) + (d.arreglados||0) + (d.reempacados||0), 0);
          return `
            <div class="history-card">
              <div class="history-header">
                <span>${UI.formatDateTime(c.createdAt)}</span>
                ${UI.statusBadge(c.status)}
              </div>
              <div class="history-body">
                ${(c.detail || []).map(d => `
                  <p><strong>${d.codigo}</strong> - ${d.producto} | Lote: ${d.lote}</p>
                  <p class="text-sm">Buenos: ${d.buenos} | Dañados: ${d.danados} | Arreglados: ${d.arreglados} | Reempacados: ${d.reempacados}</p>
                  <p class="text-sm"><strong>Total: ${UI.formatNumber(totalQty)}</strong></p>
                `).join('')}
              </div>
              <div class="history-footer">
                <span class="text-sm text-muted">Versión: ${c.version || 1}</span>
              </div>
            </div>
          `;
        }).join('')}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    }
  }
};
