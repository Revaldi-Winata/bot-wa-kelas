import { showToast, askConfirm } from './api.js';
import { ActionChip, Badge, EmptyState } from './components.js';

let cachedArchivedAssignments = [];

export function openArchivePage() {
  const activeView = document.getElementById('view-assignments-active');
  const archiveView = document.getElementById('view-assignments-archive');
  if (activeView) activeView.style.display = 'none';
  if (archiveView) archiveView.style.display = 'block';

  loadArchiveFilterSubjects();
  filterArchiveList();
}

export function closeArchivePage() {
  const activeView = document.getElementById('view-assignments-active');
  const archiveView = document.getElementById('view-assignments-archive');
  if (archiveView) archiveView.style.display = 'none';
  if (activeView) activeView.style.display = 'block';
}

async function loadArchiveFilterSubjects() {
  try {
    const res = await fetch('/api/subjects');
    const subs = await res.json();
    const select = document.getElementById('filterArchiveSubject');
    if (select) {
      const curVal = select.value;
      select.innerHTML = '<option value="">Semua Mata Kuliah</option>' +
        subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      select.value = curVal;
    }
  } catch (_) {}
}

export function filterArchiveList() {
  const q = (document.getElementById('searchArchiveInput')?.value || '').toLowerCase().trim();
  const subjectId = document.getElementById('filterArchiveSubject')?.value || '';
  const container = document.getElementById('archiveCardsList');
  const badgeDetail = document.getElementById('archiveDetailCountBadge');

  let filtered = cachedArchivedAssignments;

  if (subjectId) {
    filtered = filtered.filter(a => a.subject_id === subjectId);
  }

  if (q) {
    filtered = filtered.filter(a =>
      (a.title && a.title.toLowerCase().includes(q)) ||
      (a.subject_name && a.subject_name.toLowerCase().includes(q)) ||
      (a.description && a.description.toLowerCase().includes(q))
    );
  }

  if (badgeDetail) badgeDetail.innerText = `${filtered.length} Tugas`;

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = EmptyState({ message: 'Tidak ada arsip tugas yang cocok dengan filter pencarian.' });
    return;
  }

  container.innerHTML = filtered.map(a => `
    <div class="mobile-list-card" style="opacity: 0.88; border-color: #1e1e24; background: #0c0c0e;">
      <div class="mobile-list-card-header">
        <div>
          <div class="mobile-list-card-title" style="text-decoration: line-through; color: #9494a0;">${a.title}</div>
          <div class="mobile-list-card-meta">
            <span>${a.subject_name}</span>
            <span>•</span>
            <span>Pertemuan ${a.meeting_number}</span>
          </div>
        </div>
        ${Badge({ text: 'Selesai', variant: 'completed' })}
      </div>
      <div class="mobile-list-card-actions">
        <span style="font-size: 0.68rem; color: #71717a;">
          Berakhir: ${new Date(a.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
        ${ActionChip({ type: 'delete', onclick: `window.confirmDeleteAssignment('${a.id}')` })}
      </div>
    </div>
  `).join('');
}

export async function loadAssignments() {
  const res = await fetch('/api/assignments');
  const data = await res.json();
  const activeContainer = document.getElementById('assignmentsCardsMobile');
  const badgeCount = document.getElementById('archiveCountBadge');

  const now = Date.now();
  const activeAssignments = data.filter(a => new Date(a.deadline).getTime() > now);
  cachedArchivedAssignments = data.filter(a => new Date(a.deadline).getTime() <= now);

  if (badgeCount) badgeCount.innerText = `${cachedArchivedAssignments.length} Tugas`;

  // Render Active Assignments in Front View
  if (activeContainer) {
    if (activeAssignments.length === 0) {
      activeContainer.innerHTML = EmptyState({ message: 'Tidak ada tugas aktif yang sedang berjalan.' });
    } else {
      activeContainer.innerHTML = activeAssignments.map(a => `
        <div class="mobile-list-card">
          <div class="mobile-list-card-header">
            <div>
              <div class="mobile-list-card-title">${a.title}</div>
              <div class="mobile-list-card-meta">
                <span>${a.subject_name}</span>
                <span>•</span>
                <span>Pertemuan ${a.meeting_number}</span>
              </div>
            </div>
            ${Badge({ text: 'Aktif', variant: '3sks' })}
          </div>

          ${a.description ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin: 6px 0 8px 0; line-height: 1.4; display: flex; align-items: flex-start; gap: 6px;">
            <svg style="width: 13px; height: 13px; stroke: var(--text-dim); fill: none; stroke-width: 2; flex-shrink: 0; margin-top: 2px;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${a.description}</span>
          </div>` : ''}

          <div class="mobile-list-card-actions">
            <span style="font-size: 0.7rem; color: var(--text-dim);">
              Deadline: ${new Date(a.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <div class="card-dropdown-wrapper">
              <button class="icon-btn-dots" onclick="window.toggleAssignmentDropdown('${a.id}', event)" title="Menu Opsi">
                <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2.2;"><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/></svg>
              </button>
              <div class="card-dropdown-menu" id="dropdown-task-${a.id}">
                <button class="card-dropdown-item highlight" onclick="window.broadcastSingleAssignment('${a.id}', '${(a.title || '').replace(/'/g, "\\'")}')">
                  <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  <span>Kirim ke WhatsApp</span>
                </button>
                <button class="card-dropdown-item" onclick="window.openEditAssignmentDialog('${a.id}', '${a.subject_id}', '${(a.title || '').replace(/'/g, "\\'")}', ${a.meeting_number}, '${a.deadline || ''}', '${(a.submission_url || '').replace(/'/g, "\\'")}', '${(a.description || '').replace(/'/g, "\\'")}')">
                  <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  <span>Ubah Tugas</span>
                </button>
                <button class="card-dropdown-item danger" onclick="window.confirmDeleteAssignment('${a.id}', '${(a.title || '').replace(/'/g, "\\'")}')">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Hapus Tugas</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // Refresh archive list if currently viewing archive page
  const archiveView = document.getElementById('view-assignments-archive');
  if (archiveView && archiveView.style.display !== 'none') {
    filterArchiveList();
  }
}

export async function updateMeetingOptionsForSubject(subjectId, selectedMeetingNum) {
  const meetingSelect = document.getElementById('asMeeting');
  if (!meetingSelect) return;

  if (!subjectId) {
    meetingSelect.innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Pertemuan ${i + 1}</option>`).join('');
    return;
  }

  try {
    const res = await fetch(`/api/meetings?subject_id=${subjectId}`);
    const meetings = await res.json();

    if (meetings && meetings.length > 0) {
      meetingSelect.innerHTML = meetings.map(m => `
        <option value="${m.meeting_number}" data-date="${m.session_date || ''}" ${selectedMeetingNum && m.meeting_number === Number(selectedMeetingNum) ? 'selected' : ''}>
          Pertemuan ${m.meeting_number} (${m.session_date ? m.session_date : 'Jadwal'} - ${m.session_type})
        </option>
      `).join('');
    } else {
      meetingSelect.innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${selectedMeetingNum && i + 1 === Number(selectedMeetingNum) ? 'selected' : ''}>Pertemuan ${i + 1}</option>`).join('');
    }
    if (!selectedMeetingNum) updateDeadlineFromMeeting();
  } catch (_) {
    meetingSelect.innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Pertemuan ${i + 1}</option>`).join('');
  }
}

export function updateDeadlineFromMeeting() {
  const meetingSelect = document.getElementById('asMeeting');
  const deadlineInput = document.getElementById('asDeadline');
  if (!meetingSelect || !deadlineInput) return;

  const selectedOption = meetingSelect.options[meetingSelect.selectedIndex];
  const sessionDate = selectedOption?.getAttribute('data-date');

  if (sessionDate) {
    deadlineInput.value = `${sessionDate}T23:59`;
  } else {
    // Default to today + 7 days at 23:59
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const dateStr = d.toISOString().split('T')[0];
    deadlineInput.value = `${dateStr}T23:59`;
  }
}

export async function openAssignmentDialog() {
  const res = await fetch('/api/subjects');
  const subs = await res.json();
  document.getElementById('dialogAssignmentTitle').innerText = 'Tambah Tugas';
  document.getElementById('asId').value = '';

  const subSelect = document.getElementById('asSubject');
  if (subSelect) {
    subSelect.innerHTML = subs.map(s => `<option value="${s.id}">${s.name} (${s.sks} SKS)</option>`).join('');
    if (subs.length > 0) {
      await updateMeetingOptionsForSubject(subs[0].id);
    }
  }

  document.getElementById('asTitle').value = '';
  document.getElementById('asUrl').value = '';
  document.getElementById('asDesc').value = '';
  document.getElementById('dialogAssignment').showModal();
}

export async function openEditAssignmentDialog(id, subjectId, title, meetingNumber, deadline, submissionUrl, description) {
  const res = await fetch('/api/subjects');
  const subs = await res.json();

  document.getElementById('dialogAssignmentTitle').innerText = 'Ubah Tugas';
  document.getElementById('asId').value = id;

  const subSelect = document.getElementById('asSubject');
  if (subSelect) {
    subSelect.innerHTML = subs.map(s => `<option value="${s.id}" ${s.id === subjectId ? 'selected' : ''}>${s.name} (${s.sks} SKS)</option>`).join('');
  }

  await updateMeetingOptionsForSubject(subjectId, meetingNumber);

  document.getElementById('asTitle').value = title || '';
  if (deadline) {
    // Format YYYY-MM-DDTHH:MM
    const datePart = deadline.replace(' ', 'T').slice(0, 16);
    document.getElementById('asDeadline').value = datePart;
  }
  document.getElementById('asUrl').value = submissionUrl || '';
  document.getElementById('asDesc').value = description || '';

  document.getElementById('dialogAssignment').showModal();
}

export async function saveAssignment(e) {
  e.preventDefault();
  const id = document.getElementById('asId').value;
  const body = {
    subject_id: document.getElementById('asSubject').value,
    title: document.getElementById('asTitle').value.trim(),
    meeting_number: Number(document.getElementById('asMeeting').value) || 1,
    deadline: document.getElementById('asDeadline').value,
    submission_url: document.getElementById('asUrl').value.trim() || null,
    description: document.getElementById('asDesc').value.trim() || null,
  };

  try {
    if (id) {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast('Tugas berhasil diperbarui.');
      } else {
        showToast('Gagal memperbarui tugas.');
      }
    } else {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast('Tugas baru berhasil ditambahkan.');
      } else {
        showToast('Gagal menambahkan tugas.');
      }
    }
    document.getElementById('dialogAssignment').close();
    await loadAssignments();
  } catch (err) {
    showToast('Koneksi gagal saat menyimpan tugas.');
  }
}

export function confirmDeleteAssignment(id, title) {
  askConfirm(
    'Hapus Tugas',
    `Apakah Anda yakin ingin menghapus tugas "${title || 'ini'}"?`,
    async () => {
      try {
        const res = await fetch('/api/assignments/' + id, { method: 'DELETE' });
        if (res.ok) {
          showToast('Tugas dihapus.');
          await loadAssignments();
        } else {
          showToast('Gagal menghapus tugas.');
        }
      } catch (err) {
        showToast('Koneksi gagal.');
      }
    }
  );
}

export function broadcastSingleAssignment(id, title) {
  askConfirm(
    'Broadcast Tugas ke WhatsApp',
    `Kirim pengumuman tugas "${title || 'ini'}" sekarang ke Grup Kelas & Grup Matkul terkait?`,
    async () => {
      try {
        showToast('Mengirim broadcast WhatsApp...');
        const res = await fetch(`/api/assignments/${id}/broadcast`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          showToast(data.message || 'Tugas berhasil dibroadcast ke WhatsApp!');
        } else {
          showToast(data.message || 'Gagal broadcast tugas.');
        }
      } catch (err) {
        showToast('Koneksi gagal saat mengirim broadcast.');
      }
    }
  );
}

export function broadcastAllActiveAssignments() {
  askConfirm(
    'Broadcast Semua Tugas Aktif',
    'Kirim rekap seluruh tugas aktif saat ini ke Grup Kelas (1 pesan gabungan) dan masing-masing grup mata kuliah?',
    async () => {
      try {
        showToast('Mengirim rekap seluruh tugas...');
        const res = await fetch('/api/assignments/broadcast-all', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          showToast(data.message || 'Seluruh tugas berhasil dibroadcast!');
        } else {
          showToast(data.message || 'Gagal broadcast tugas.');
        }
      } catch (err) {
        showToast('Koneksi gagal saat mengirim broadcast.');
      }
    }
  );
}

export function toggleAssignmentDropdown(id, event) {
  event?.stopPropagation();
  const current = document.getElementById('dropdown-task-' + id);
  const isAlreadyOpen = current?.classList.contains('show');

  // Close all other dropdowns
  document.querySelectorAll('.card-dropdown-menu').forEach(m => m.classList.remove('show'));

  if (!isAlreadyOpen && current) {
    current.classList.add('show');
  }
}
