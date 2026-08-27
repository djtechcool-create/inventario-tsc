const UI = {
  showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewName);
    if (view) view.classList.add('active');
  },

  showModal(title, body, footer) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer || '';
    document.getElementById('modal-overlay').style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  },

  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    if (loading) {
      btn.disabled = true;
      if (text) text.style.display = 'none';
      if (loader) loader.style.display = 'inline-block';
    } else {
      btn.disabled = false;
      if (text) text.style.display = 'inline';
      if (loader) loader.style.display = 'none';
    }
  },

  formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  formatNumber(num) {
    return Number(num || 0).toLocaleString('es-CO');
  },

  statusBadge(status) {
    const colors = {
      'BORRADOR': '#6b7280', 'CONTEO_ABIERTO': '#2563eb', 'RECONTEO': '#d97706',
      'EN_REVISION': '#7c3aed', 'CONCILIADO': '#059669', 'CERRADO': '#1f2937',
      'ENVIADO': '#2563eb', 'APROBADO': '#059669', 'RECHAZADO': '#dc2626',
      'BLOQUEADO': '#1f2937', 'PENDIENTE': '#d97706', 'COMPLETADO': '#059669',
      'SIN_DIFERENCIA': '#059669', 'FALTANTE': '#dc2626', 'SOBRANTE': '#d97706',
      'CAMBIO_ESTADO': '#7c3aed'
    };
    return `<span class="status-badge" style="background:${colors[status] || '#6b7280'}">${status}</span>`;
  },

  diffBadge(tipo) {
    const labels = {
      'SIN_DIFERENCIA': 'Sin diferencia', 'FALTANTE': 'Faltante',
      'SOBRANTE': 'Sobrante', 'CAMBIO_ESTADO': 'Cambio estado'
    };
    return this.statusBadge(tipo);
  },

  confirm(message) {
    return new Promise(resolve => {
      this.showModal('Confirmar', `<p>${message}</p>`, `
        <button class="btn btn-secondary" id="modal-confirm-no">Cancelar</button>
        <button class="btn btn-primary" id="modal-confirm-yes">Confirmar</button>
      `);
      document.getElementById('modal-confirm-yes').onclick = () => { this.closeModal(); resolve(true); };
      document.getElementById('modal-confirm-no').onclick = () => { this.closeModal(); resolve(false); };
    });
  },

  prompt(message, defaultValue = '') {
    return new Promise(resolve => {
      this.showModal('Ingrese datos', `
        <p>${message}</p>
        <div class="form-group">
          <input type="text" id="modal-prompt-input" class="form-control" value="${defaultValue}">
        </div>
      `, `
        <button class="btn btn-secondary" id="modal-prompt-cancel">Cancelar</button>
        <button class="btn btn-primary" id="modal-prompt-ok">Aceptar</button>
      `);
      const input = document.getElementById('modal-prompt-input');
      input.focus();
      input.select();
      document.getElementById('modal-prompt-ok').onclick = () => { this.closeModal(); resolve(input.value); };
      document.getElementById('modal-prompt-cancel').onclick = () => { this.closeModal(); resolve(null); };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { this.closeModal(); resolve(input.value); }
        if (e.key === 'Escape') { this.closeModal(); resolve(null); }
      };
    });
  }
};

document.getElementById('modal-close').onclick = () => UI.closeModal();
document.getElementById('modal-overlay').onclick = (e) => {
  if (e.target === e.currentTarget) UI.closeModal();
};
