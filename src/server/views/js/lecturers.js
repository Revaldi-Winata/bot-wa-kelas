import { showToast, askConfirm } from './api.js';
import { ActionChip, Badge, EmptyState } from './components.js';

export async function loadLecturers() {
  const res = await fetch('/api/lecturers');
  const data = await res.json();
  const mobileContainer = document.getElementById('lecturersCardsMobile');
  if (!mobileContainer) return;

  if (data.length === 0) {
    mobileContainer.innerHTML = EmptyState({ message: 'Belum ada data dosen pengampu. Klik Tambah untuk mendaftarkan dosen.' });
    return;
  }

  mobileContainer.innerHTML = data.map(l => `
    <div class="mobile-list-card">
      <div class="mobile-list-card-header">
        <div>
          <div class="mobile-list-card-title">${l.name}</div>
          <div class="mobile-list-card-meta">
            <span class="meta-chip">
              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>${l.phone}</span>
            </span>
          </div>
        </div>
        ${Badge({ text: l.subject_name || 'Umum / Semua Matkul', variant: l.subject_name ? '3sks' : 'default' })}
      </div>
      <div class="mobile-list-card-actions">
        <span style="font-size: 0.7rem; color: var(--text-dim);">${l.notes || 'Dosen Pengampu'}</span>
        <div style="display: flex; gap: 6px;">
          ${ActionChip({ type: 'edit', onclick: `window.openEditLecturerDialog('${l.id}', '${(l.name || '').replace(/'/g, "\\'")}', '${l.phone}', '${l.subject_id || ''}', '${(l.notes || '').replace(/'/g, "\\'")}')` })}
          ${ActionChip({ type: 'delete', onclick: `window.confirmDeleteLecturer('${l.id}')` })}
        </div>
      </div>
    </div>
  `).join('');
}

export async function openLecturerDialog() {
  const res = await fetch('/api/subjects');
  const subjects = await res.json();
  const title = document.getElementById('dialogLecturerTitle');
  if (title) title.innerText = 'Tambah Dosen';
  const idEl = document.getElementById('lecId');
  if (idEl) idEl.value = '';

  document.getElementById('lecName').value = '';
  document.getElementById('lecPhone').value = '';
  document.getElementById('lecNotes').value = '';

  const select = document.getElementById('lecSubject');
  if (select) {
    select.innerHTML = '<option value="">-- Pilih Mata Kuliah (Opsional) --</option>' +
      subjects.map(s => `<option value="${s.id}">${s.name} (${s.sks} SKS)</option>`).join('');
  }
  document.getElementById('dialogLecturer').showModal();
}

export async function openEditLecturerDialog(id, name, phone, subjectId, notes) {
  const res = await fetch('/api/subjects');
  const subjects = await res.json();
  const title = document.getElementById('dialogLecturerTitle');
  if (title) title.innerText = 'Ubah Dosen';
  const idEl = document.getElementById('lecId');
  if (idEl) idEl.value = id;

  document.getElementById('lecName').value = name;
  document.getElementById('lecPhone').value = phone;
  document.getElementById('lecNotes').value = notes;

  const select = document.getElementById('lecSubject');
  if (select) {
    select.innerHTML = '<option value="">-- Pilih Mata Kuliah (Opsional) --</option>' +
      subjects.map(s => `<option value="${s.id}" ${s.id === subjectId ? 'selected' : ''}>${s.name} (${s.sks} SKS)</option>`).join('');
  }
  document.getElementById('dialogLecturer').showModal();
}

export async function saveLecturer(e) {
  e.preventDefault();
  const id = document.getElementById('lecId')?.value;
  const body = {
    name: document.getElementById('lecName').value,
    phone: document.getElementById('lecPhone').value,
    subject_id: document.getElementById('lecSubject')?.value || null,
    notes: document.getElementById('lecNotes').value,
  };

  if (id) {
    await fetch(`/api/lecturers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Data dosen berhasil diperbarui.');
  } else {
    await fetch('/api/lecturers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Dosen berhasil ditambahkan.');
  }

  document.getElementById('dialogLecturer').close();
  loadLecturers();
  // Auto-sync schedule views
  const { loadSchedules, loadMeetings } = await import('./schedules.js');
  loadSchedules();
  loadMeetings();
}

export function confirmDeleteLecturer(id) {
  askConfirm('Hapus Dosen', 'Apakah Anda yakin ingin menghapus data dosen ini?', async () => {
    await fetch('/api/lecturers/' + id, { method: 'DELETE' });
    showToast('Dosen dihapus.');
    loadLecturers();
    const { loadSchedules, loadMeetings } = await import('./schedules.js');
    loadSchedules();
    loadMeetings();
  });
}
