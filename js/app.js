const App = {
  init() {
    this.bindEvents();
    Auth.onAuthStateChanged((user) => {
      if (user) {
        this.handleAuth(user);
      } else {
        this.showScreen('login');
      }
    });
  },

  bindEvents() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
    document.getElementById('admin-logout').addEventListener('click', () => this.logout());
    document.getElementById('bodega-logout').addEventListener('click', () => this.logout());
  },

  async login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    UI.setLoading('login-btn', true);
    errorEl.style.display = 'none';

    try {
      const { user, role } = await Auth.login(email, password);
      if (!role) {
        await Auth.logout();
        errorEl.textContent = 'Su cuenta no tiene un rol asignado. Contacte al administrador.';
        errorEl.style.display = 'block';
        return;
      }
      await this.handleAuth(user);
    } catch (err) {
      errorEl.textContent = this.getFirebaseError(err.code);
      errorEl.style.display = 'block';
    } finally {
      UI.setLoading('login-btn', false);
    }
  },

  async handleAuth(user) {
    const role = await Auth.refreshRole();
    if (!role) {
      UI.toast('Su cuenta no tiene un rol asignado.', 'error');
      await Auth.logout();
      return;
    }

    const profile = await Auth.getUserProfile();
    const displayName = profile?.displayName || user.email || user.uid.substring(0, 8);

    if (role === 'ADMIN') {
      document.getElementById('admin-user-name').textContent = displayName;
      this.showScreen('admin');
      AdminView.init();
    } else {
      document.getElementById('bodega-user-name').textContent = displayName;
      this.showScreen('bodega');
      BodegaView.init();
    }
  },

  showScreen(screen) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('bodega-screen').style.display = 'none';

    switch (screen) {
      case 'login':
        document.getElementById('login-screen').style.display = 'flex';
        break;
      case 'admin':
        document.getElementById('admin-screen').style.display = 'flex';
        break;
      case 'bodega':
        document.getElementById('bodega-screen').style.display = 'flex';
        break;
    }
  },

  async logout() {
    await Auth.logout();
    this.showScreen('login');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').style.display = 'none';
  },

  getFirebaseError(code) {
    const errors = {
      'auth/user-not-found': 'Usuario no encontrado.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/invalid-email': 'Correo electrónico inválido.',
      'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
      'auth/too-many-requests': 'Demasiados intentos. Intente más tarde.',
      'auth/network-request-failed': 'Error de red. Verifique su conexión.',
      'auth/invalid-credential': 'Credenciales inválidas.',
    };
    return errors[code] || 'Error al iniciar sesión. Intente de nuevo.';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW registration failed'));
  });
}
