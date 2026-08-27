const UI = {
  el(id) { return document.getElementById(id); },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },
  money(n) { return Number(n || 0).toLocaleString('es-CO'); },
  fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  },
  toast(msg, type = 'ok') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(t._h);
    t._h = setTimeout(() => t.className = 'toast', 3000);
  },
  confirm(msg) { return window.confirm(msg); },
  loading(show) {
    let l = document.getElementById('loading');
    if (!l) { l = document.createElement('div'); l.id = 'loading'; l.innerHTML = 'Procesando...'; document.body.appendChild(l); }
    l.style.display = show ? 'flex' : 'none';
  }
};
