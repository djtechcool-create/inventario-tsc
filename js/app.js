/* ============================================================
   APP - Router e inicialización
   - Login.
   - Ruta por rol (admin → panel, bodega → vista móvil).
   - Cambio de contraseña temporal.
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const form = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');

  await DB.init();

  // si hay sesión activa, ir directo
  const s = DB.session();
  if (s) {
    // validar que el usuario siga existiendo
    const u = DB.listUsers().find(x => x.id === s.id);
    if (u) { startApp(u); return; }
    DB.logout();
  }

  loginScreen.hidden = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const user = await DB.authenticate(
      document.getElementById('login-user').value,
      document.getElementById('login-pass').value
    );
    if (!user) { errEl.textContent = 'Usuario o contraseña incorrectos.'; return; }
    DB.setSession(user);
    loginScreen.hidden = true;
    startApp(user);
  });

  function startApp(user) {
    // Si tiene contraseña temporal y es admin o bodega, pedir cambio
    if (user.temp) {
      promptNewPassword(user);
      return;
    }
    app.hidden = false;
    if (user.role === 'admin') {
      AdminView.init(user);
    } else {
      BodegaView.init(user);
    }
  }

  function promptNewPassword(user) {
    app.hidden = false;
    app.innerHTML = `
      <div class="login-card" style="max-width:400px;margin:60px auto">
        <h1>Cambiar contraseña</h1>
        <p class="sub">${UI.esc(user.name)}, define tu nueva contraseña.</p>
        <div class="field"><label>Nueva contraseña</label><input id="np1" type="password" minlength="4" required></div>
        <div class="field"><label>Confirmar</label><input id="np2" type="password" minlength="4" required></div>
        <button class="btn btn-primary btn-block" id="np-btn">Guardar y continuar</button>
        <p id="np-err" class="hint" style="color:var(--danger);margin-top:10px"></p>
      </div>`;
    document.getElementById('np-btn').addEventListener('click', async () => {
      const p1 = document.getElementById('np1').value;
      const p2 = document.getElementById('np2').value;
      const errEl2 = document.getElementById('np-err');
      if (p1.length < 4) { errEl2.textContent = 'Mínimo 4 caracteres.'; return; }
      if (p1 !== p2) { errEl2.textContent = 'Las contraseñas no coinciden.'; return; }
      await DB.setPassword(user.id, p1);
      user.temp = false;
      DB.setSession(user);
      UI.toast('Contraseña actualizada');
      if (user.role === 'admin') AdminView.init(user); else BodegaView.init(user);
    });
  }
});
