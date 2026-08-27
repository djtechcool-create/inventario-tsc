/* ============================================================
   CAPA DE DATOS - Inventario TSC
   Separación estricta por roles + cifrado del inventario virtual.
   - El inventario virtual se guarda CIFRADO (AES-GCM). Solo el
     Administrador puede descifrarlo.
   - Las tareas que recibe Bodega NUNCA contienen cantidades
     virtuales, solo producto/lote y los estados a contar.
   ============================================================ */
const DB = (() => {
  const K = 'itsc_';
  const VERSION = '1.0.0';

  function get(k, def) { try { const v = JSON.parse(localStorage.getItem(K + k)); return v === null ? def : v; } catch (e) { return def; } }
  function set(k, v) { localStorage.setItem(K + k, JSON.stringify(v)); }

  // ---------- Crypto helpers ----------
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function deriveKey(pass, salt) {
    const h = pass + '::' + salt + '::INVENTARIO-TSC';
    // 32 bytes exactos (AES-256) a partir del digest SHA-256 (64 hex chars)
    const digest = await sha256(h);
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(digest.substr(i * 2, 2), 16);
    }
    return crypto.subtle.importKey('raw', keyBytes,
      { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function encryptAES(text, pass, salt) {
    const key = await deriveKey(pass, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
      key, new TextEncoder().encode(text));
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(enc)) };
  }
  async function decryptAES(ivArr, dataArr, pass, salt) {
    const key = await deriveKey(pass, salt);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivArr) },
      key, new Uint8Array(dataArr));
    return new TextDecoder().decode(dec);
  }

  // ---------- Usuarios ----------
  async function init() {
    if (!get('meta', null)) {
      const users = get('users', []);
      if (users.length === 0) {
        const exists = await seedAdmin();
        if (!exists) return;
      }
      set('meta', { version: VERSION, created: new Date().toISOString() });
    }
  }
  async function seedAdmin() {
    const users = get('users', []);
    if (users.length > 0) return false;
    const adminPass = 'admin123';
    const hash = await sha256(adminPass);
    const salt = Date.now().toString(36);
    users.push({ id: 'u_admin', name: 'Administrador', username: 'admin', role: 'admin',
      passHash: hash, salt, createdAt: new Date().toISOString() });
    set('users', users);
    return true;
  }
  async function createUser({ name, username, role }) {
    const users = get('users', []);
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('El usuario ya existe');
    const pass = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await sha256(pass);
    const salt = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const u = { id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, username, role, passHash: hash, salt, temp: true,
      createdAt: new Date().toISOString() };
    users.push(u);
    set('users', users);
    return { user: u, password: pass };
  }
  async function setPassword(userId, newPass) {
    const users = get('users', []);
    const u = users.find(x => x.id === userId);
    if (!u) throw new Error('Usuario no encontrado');
    u.passHash = await sha256(newPass);
    u.salt = Date.now().toString(36) + Math.random().toString(36).slice(2);
    u.temp = false;
    set('users', users);
    return u;
  }
  async function authenticate(username, pass) {
    const users = get('users', []);
    const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u) return null;
    const hash = await sha256(pass);
    if (hash !== u.passHash) return null;
    return u;
  }
  function listUsers() { return get('users', []); }

  // ---------- Sesión ----------
  function session() { return get('session', null); }
  function setSession(user) { set('session', { id: user.id, name: user.name, username: user.username, role: user.role }); }
  function logout() { localStorage.removeItem(K + 'session'); }

  // ---------- Inventarios (semana) ----------
  function listInventories() { return get('inventories', []); }
  function getInventory(id) { return get('inventories', []).find(i => i.id === id) || null; }
  // Archivo crudo del inventario virtual, cifrado. Solo admin lo descifra.
  const virtualStore = get('virtual_store', {});
  function saveVirtualCipher(id, cipher) { virtualStore[id] = cipher; set('virtual_store', virtualStore); }
  function getVirtualCipher(id) { return virtualStore[id] || null; }
  function deleteVirtualCipher(id) { delete virtualStore[id]; set('virtual_store', virtualStore); }

  // ---------- Tareas de bodega por usuarios ----------
  function userTasks(userId) { return get('tasks_' + userId, {}); }
  function setUserTasks(userId, tasks) { set('tasks_' + userId, tasks); }

  function saveInventory(inv) {
    const list = get('inventories', []);
    const idx = list.findIndex(i => i.id === inv.id);
    if (idx >= 0) list[idx] = inv; else list.push(inv);
    set('inventories', list);
  }
  // Auditoría global
  function addAudit(entry) {
    const a = get('audit', []);
    a.push({ ts: new Date().toISOString(), ...entry });
    set('audit', a);
  }
  function getAudit() { return get('audit', []); }
  // Config de cantidades por producto (sacos/pallet sugeridos)
  function getProductConfig() { return get('pconfig', {}); }
  function setProductConfig(cfg) { set('pconfig', cfg); }
  // Estado físico estándar vs virtual (mapeo de estados)
  function getStateAliases() {
    return {
      buenos: ['bueno', 'buenos', 'buen', 'sanos', 'sano'],
      danados: ['dañado', 'dañados', 'dannado', 'danados', 'dano', 'dano', 'dannados', 'deteriorado'],
      arreglados: ['arreglado', 'arreglados', 'reparado', 'reparados', 'reparacion'],
      reempacados: ['reempacado', 'reempacados', 'rempacado', 'reempacado', 'reempaquetado']
    };
  }

  return {
    init, get, set, session, setSession, logout, sha256,
    createUser, setPassword, authenticate, listUsers, seedAdmin,
    listInventories, getInventory, saveInventory, addAudit, getAudit,
    encryptAES, decryptAES, saveVirtualCipher, getVirtualCipher, deleteVirtualCipher,
    userTasks, setUserTasks, getProductConfig, setProductConfig, getStateAliases
  };
})();
