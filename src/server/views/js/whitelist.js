import { Badge, ActionChip, EmptyState } from './components.js';
import { showToast } from './api.js';

let cachedWhitelist = [];
let cachedGroups = [];

export function switchWhitelistView(view) {
  localStorage.setItem('active_whitelist_view', view);
  const btnMembers = document.getElementById('btnWlMembers');
  const btnGroup = document.getElementById('btnWlGroup');
  const btnSubjects = document.getElementById('btnWlSubjects');

  const viewMembers = document.getElementById('view-wl-members');
  const viewGroup = document.getElementById('view-wl-group');
  const viewSubjects = document.getElementById('view-wl-subjects');

  [btnMembers, btnGroup, btnSubjects].forEach(b => b?.classList.remove('active'));
  [viewMembers, viewGroup, viewSubjects].forEach(v => {
    if (v) v.style.display = 'none';
  });

  if (view === 'members') {
    btnMembers?.classList.add('active');
    if (viewMembers) viewMembers.style.display = 'block';
    renderWhitelistCards(cachedWhitelist);
  } else if (view === 'group') {
    btnGroup?.classList.add('active');
    if (viewGroup) viewGroup.style.display = 'block';
    loadGroups();
  } else if (view === 'subjects') {
    btnSubjects?.classList.add('active');
    if (viewSubjects) viewSubjects.style.display = 'block';
    loadSubjectGroupMappings();
  }
}

export async function loadGroups() {
  const select = document.getElementById('selectClassGroup');
  const badge = document.getElementById('groupStatusBadge');

  try {
    const res = await fetch('/api/groups');
    cachedGroups = await res.json();

    if (badge) {
      const mainGroup = cachedGroups.find(g => g.isMain);
      if (mainGroup) {
        badge.innerText = `${mainGroup.name} (${mainGroup.participantsCount} Anggota)`;
        badge.style.color = '#4ade80';
        badge.style.borderColor = 'rgba(74, 222, 128, 0.3)';
        badge.style.background = 'rgba(74, 222, 128, 0.08)';
      } else {
        badge.innerText = `${cachedGroups.length} Grup Terdeteksi`;
        badge.style.color = cachedGroups.length > 0 ? '#60a5fa' : '#a1a1aa';
        badge.style.borderColor = '#282834';
        badge.style.background = '#18181f';
      }
    }

    if (select) {
      if (cachedGroups.length === 0) {
        select.innerHTML = '<option value="">-- Tidak ada grup WhatsApp terdeteksi --</option>';
      } else {
        select.innerHTML = '<option value="">-- Pilih Grup WhatsApp Utama Kelas --</option>' +
          cachedGroups.map(g => `
            <option value="${g.id}" ${g.isMain ? 'selected' : ''}>
              ${g.isMain ? '⭐ ' : ''}${g.name} (${g.participantsCount} Anggota)
            </option>
          `).join('');
      }
    }
  } catch (err) {
    if (select) select.innerHTML = '<option value="">-- Gagal memuat daftar grup --</option>';
  }
}

export async function saveClassGroupSelection(groupJid) {
  if (!groupJid) return;
  const select = document.getElementById('selectClassGroup');
  const groupName = select?.options[select.selectedIndex]?.text?.replace('⭐ ', '')?.split(' (')[0] || 'Grup Kelas';

  showToast(`Menetapkan "${groupName}" sebagai Grup Utama...`);
  try {
    const res = await fetch('/api/groups/set-main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupJid, groupName }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Grup utama disimpan. ${data.syncedCount || 0} anggota berhasil disinkronkan.`);
      await loadWhitelist();
      await loadGroups();
    } else {
      showToast('Gagal: ' + (data.message || 'Error'));
    }
  } catch (err) {
    showToast('Koneksi gagal saat menyimpan grup.');
  }
}

export async function loadSubjectGroupMappings() {
  const container = document.getElementById('subjectGroupsMappingContainer');
  if (!container) return;

  try {
    // Ensure groups are cached first
    if (cachedGroups.length === 0) {
      const gRes = await fetch('/api/groups');
      cachedGroups = await gRes.json();
    }

    const res = await fetch('/api/subjects');
    const subjects = await res.json();

    if (subjects.length === 0) {
      container.innerHTML = EmptyState({ message: 'Belum ada mata kuliah terdaftar di jadwal.' });
      return;
    }

    container.innerHTML = subjects.map(s => {
      const isCustomGroup = Boolean(s.wa_group_jid);
      const activeGroupName = cachedGroups.find(g => g.id === s.wa_group_jid)?.name;

      return `
        <div class="mobile-list-card" style="padding: 12px 14px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <div style="font-size: 0.84rem; font-weight: 600; color: #fff;">${s.name}</div>
              <div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 2px;">
                ${s.sks} SKS • Dosen: ${s.lecturer_name || 'Belum diatur'}
              </div>
            </div>
            ${Badge({
              text: isCustomGroup ? (activeGroupName || 'Grup Khusus') : 'Grup Kelas (Default)',
              variant: isCustomGroup ? '3sks' : '2sks'
            })}
          </div>

          <div>
            <label style="font-size: 0.68rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Target Broadcast WhatsApp:</label>
            <select style="font-size: 0.74rem; padding: 6px 10px; margin-bottom: 0; background: #121217; border: 1px solid #242430; border-radius: 6px; width: 100%; color: #ededed;" onchange="window.saveSubjectGroupMapping('${s.id}', this.value)">
              <option value="">-- Gunakan Grup Utama Kelas (Default) --</option>
              ${cachedGroups.map(g => `
                <option value="${g.id}" ${s.wa_group_jid === g.id ? 'selected' : ''}>
                  ${g.name} (${g.participantsCount} Anggota)
                </option>
              `).join('')}
            </select>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div style="font-size: 0.75rem; color: #ef4444; padding: 12px;">Gagal memuat mata kuliah.</div>';
  }
}

export async function saveSubjectGroupMapping(subjectId, waGroupJid) {
  try {
    const res = await fetch(`/api/subjects/${subjectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_group_jid: waGroupJid || null }),
    });
    if (res.ok) {
      showToast('Target broadcast mata kuliah diperbarui.');
      loadSubjectGroupMappings();
    } else {
      showToast('Gagal menyimpan target grup matkul.');
    }
  } catch (err) {
    showToast('Koneksi gagal saat update grup matkul.');
  }
}

export async function loadWhitelist() {
  try {
    const [wRes, gRes] = await Promise.all([
      fetch('/api/whitelist'),
      fetch('/api/groups')
    ]);
    cachedWhitelist = await wRes.json();
    cachedGroups = await gRes.json();

    const countBadge = document.getElementById('whitelistCountBadge');
    if (countBadge) countBadge.innerText = `${cachedWhitelist.length} Mahasiswa`;

    const activeSubView = localStorage.getItem('active_whitelist_view') || 'members';
    switchWhitelistView(activeSubView);
  } catch (err) {
    console.error('Failed to load whitelist:', err);
  }
}

export function renderWhitelistCards(data) {
  const mobileContainer = document.getElementById('whitelistCardsMobile');
  if (!mobileContainer) return;

  if (data.length === 0) {
    mobileContainer.innerHTML = EmptyState({
      message: 'Belum ada anggota terdaftar. Buka tab "Grup Kelas" lalu pilih grup WhatsApp untuk sinkronisasi otomatis.'
    });
    return;
  }

  mobileContainer.innerHTML = data.map(w => {
    const displayName = w.display_name && w.display_name.trim() ? w.display_name : 'Mahasiswa (Belum diberi nama)';
    const isNamed = Boolean(w.display_name && w.display_name.trim());
    const lastSeenStr = w.last_seen_at
      ? new Date(w.last_seen_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Baru';

    return `
      <div class="mobile-list-card">
        <div class="mobile-list-card-header">
          <div>
            <div class="mobile-list-card-title" style="color: ${isNamed ? '#ffffff' : '#a1a1aa'};">
              ${displayName}
            </div>
            <div class="mobile-list-card-meta" style="margin-top: 3px; display: flex; align-items: center; gap: 5px;">
              <svg style="width: 12px; height: 12px; stroke: var(--text-dim); fill: none; stroke-width: 2;" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span style="font-family: monospace; font-size: 0.72rem; color: #60a5fa;">+${w.phone_number}</span>
            </div>
          </div>
          ${Badge({ text: isNamed ? 'Terdaftar' : 'Auto-Sync', variant: isNamed ? '3sks' : '2sks' })}
        </div>
        <div class="mobile-list-card-actions">
          <span style="font-size: 0.68rem; color: var(--text-dim);">
            Sync: ${lastSeenStr}
          </span>
          <div style="display: flex; gap: 4px;">
            ${ActionChip({
              type: 'edit',
              text: 'Ubah Nama',
              onclick: `window.openEditMemberNameDialog('${w.id}', '${w.phone_number}', '${(w.display_name || '').replace(/'/g, "\\'")}')`
            })}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function openEditMemberNameDialog(id, phone, name) {
  const dialog = document.getElementById('dialogEditMember');
  if (!dialog) return;
  document.getElementById('editMemberId').value = id;
  document.getElementById('editMemberPhone').value = '+' + phone;
  document.getElementById('editMemberName').value = name || '';
  dialog.showModal();
}

export async function saveMemberName(e) {
  e.preventDefault();
  const id = document.getElementById('editMemberId').value;
  const displayName = document.getElementById('editMemberName').value.trim();

  try {
    const res = await fetch(`/api/whitelist/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    if (res.ok) {
      showToast('Nama mahasiswa berhasil disimpan.');
      document.getElementById('dialogEditMember').close();
      await loadWhitelist();
    } else {
      showToast('Gagal menyimpan nama mahasiswa.');
    }
  } catch (err) {
    showToast('Koneksi gagal.');
  }
}

export function filterWhitelistTable() {
  const q = (document.getElementById('searchWhitelistInput')?.value || '').toLowerCase().trim();
  const filtered = cachedWhitelist.filter(w =>
    (w.phone_number && w.phone_number.toLowerCase().includes(q)) ||
    (w.display_name && w.display_name.toLowerCase().includes(q))
  );
  renderWhitelistCards(filtered);
}
