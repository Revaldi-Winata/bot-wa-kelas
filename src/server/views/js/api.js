// Shared API and UI utilities

export function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

export function askConfirm(title, message, onConfirm, options = {}) {
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const btn = document.getElementById('confirmActionBtn');
  const dialog = document.getElementById('confirmDialog');

  const isDanger = options.isDanger ?? (title.toLowerCase().includes('hapus') || title.toLowerCase().includes('delete'));
  const confirmText = options.confirmText || (isDanger ? 'Hapus' : 'Ya, Lanjutkan');

  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = message;
  if (btn) {
    btn.innerText = confirmText;
    btn.className = isDanger ? 'btn btn-ghost-danger btn-sm' : 'btn btn-primary btn-sm';
    btn.style.background = isDanger ? 'rgba(239, 68, 68, 0.15)' : 'var(--brand-primary, #3b82f6)';
    btn.style.color = isDanger ? '#f87171' : '#ffffff';
    btn.style.borderColor = isDanger ? 'rgba(239, 68, 68, 0.3)' : 'transparent';
    btn.style.fontWeight = '600';
    btn.onclick = () => {
      dialog.close();
      onConfirm();
    };
  }

  if (dialog) {
    dialog.showModal();
  }
}

export async function checkAuth(onSuccess) {
  const token = localStorage.getItem('bot_admin_token');
  const loginScreen = document.getElementById('loginScreen');

  if (!token) {
    if (loginScreen) loginScreen.style.display = 'flex';
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.authenticated) {
      if (loginScreen) loginScreen.style.display = 'none';
      if (onSuccess) onSuccess();
    } else {
      localStorage.removeItem('bot_admin_token');
      if (loginScreen) loginScreen.style.display = 'flex';
    }
  } catch (err) {
    // If offline or network glitch, trust existing valid token to avoid blocking user
    if (loginScreen) loginScreen.style.display = 'none';
    if (onSuccess) onSuccess();
  }
}

export async function handleLogin(e, onSuccess) {
  if (e) e.preventDefault();
  const username = document.getElementById('loginUsername')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value?.trim();
  const errDiv = document.getElementById('loginError');
  if (errDiv) errDiv.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('bot_admin_token', data.token);
      const loginScreen = document.getElementById('loginScreen');
      if (loginScreen) loginScreen.style.display = 'none';
      showToast('Login berhasil. Sesi tersimpan.');
      if (onSuccess) onSuccess();
    } else {
      if (errDiv) {
        errDiv.innerText = data.error || 'Username atau password salah.';
        errDiv.style.display = 'block';
      }
    }
  } catch (err) {
    if (errDiv) {
      errDiv.innerText = 'Koneksi ke server gagal.';
      errDiv.style.display = 'block';
    }
  }
}

export async function handleLogout() {
  localStorage.removeItem('bot_admin_token');
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'flex';
  showToast('Telah keluar dari sesi.');
}

