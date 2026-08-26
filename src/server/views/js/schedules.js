import { showToast, askConfirm } from './api.js';
import { ActionChip, Badge, EmptyState } from './components.js';

const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// Indonesian National Holidays 2026 Reference Table
const HOLIDAYS_2026 = {
  '2026-01-01': 'Tahun Baru 2026 Masehi',
  '2026-01-16': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
  '2026-03-21': 'Hari Suci Nyepi Tahun Baru Saka 1948',
  '2026-03-20': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-21': 'Hari Raya Idul Fitri 1447 H (Hari Kedua)',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-04-05': 'Hari Paskah',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-27': 'Hari Raya Idul Adha 1447 H',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 Hijriah',
  '2026-08-17': 'Hari Kemerdekaan Republik Indonesia',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-25': 'Hari Raya Natal',
};

function checkHoliday(dateStr) {
  if (!dateStr) return { isHoliday: false, name: '' };
  if (HOLIDAYS_2026[dateStr]) {
    return { isHoliday: true, name: HOLIDAYS_2026[dateStr] };
  }
  const d = new Date(dateStr + 'T00:00:00Z');
  if (d.getUTCDay() === 0) {
    return { isHoliday: true, name: 'Hari Minggu' };
  }
  return { isHoliday: false, name: '' };
}

let cachedMeetings = [];
let selectedSubjectId = null;
let isConfigUnlocked = false;

export function switchScheduleView(view) {
  localStorage.setItem('active_schedule_view', view);
  document.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.schedule-view').forEach(v => v.classList.remove('active'));

  if (view === 'calendar') {
    document.getElementById('btnViewCalendar')?.classList.add('active');
    document.getElementById('view-calendar')?.classList.add('active');
    loadMeetings();
  } else if (view === 'weekly') {
    document.getElementById('btnViewWeekly')?.classList.add('active');
    document.getElementById('view-weekly')?.classList.add('active');
    loadSchedules();
  } else if (view === 'config') {
    document.getElementById('btnViewConfig')?.classList.add('active');
    document.getElementById('view-config')?.classList.add('active');
    loadSemesterConfig();
  }
}

export function toggleConfigLock(checkbox) {
  isConfigUnlocked = checkbox.checked;
  applyConfigLockState();
}

export function updateAutoEndDate(startDateStr) {
  if (!startDateStr) return;
  const d = new Date(startDateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diffToMon = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const baseMonday = new Date(d);
  baseMonday.setUTCDate(diffToMon);

  const satWeek16 = new Date(baseMonday);
  satWeek16.setUTCDate(baseMonday.getUTCDate() + (16 - 1) * 7 + 5);
  const endInput = document.getElementById('semEndDate');
  if (endInput) {
    endInput.value = satWeek16.toISOString().split('T')[0];
  }
}

function applyConfigLockState() {
  const semStartDate = document.getElementById('semStartDate');
  const semEndDate = document.getElementById('semEndDate');
  const semName = document.getElementById('semName');
  const btnGen = document.getElementById('btnGenerateSemester');
  const lockText = document.getElementById('lockStatusText');
  const lockSwitch = document.getElementById('configLockSwitch');

  if (lockSwitch) lockSwitch.checked = isConfigUnlocked;
  if (semStartDate) semStartDate.disabled = !isConfigUnlocked;
  if (semEndDate) semEndDate.disabled = !isConfigUnlocked;
  if (semName) semName.disabled = !isConfigUnlocked;
  if (btnGen) btnGen.disabled = !isConfigUnlocked;

  if (lockText) {
    lockText.innerText = isConfigUnlocked ? 'Terbuka (Dapat Diedit)' : 'Terkunci (Aman)';
    lockText.style.color = isConfigUnlocked ? '#60a5fa' : 'var(--text-dim)';
  }
}

export async function loadSemesterConfig() {
  const res = await fetch('/api/semester');
  const sem = await res.json();
  if (sem) {
    const sDate = document.getElementById('semStartDate');
    const eDate = document.getElementById('semEndDate');
    const sName = document.getElementById('semName');
    if (sDate) sDate.value = sem.start_date;
    if (eDate) eDate.value = sem.end_date || '';
    if (sName) sName.value = sem.name;
    if (!sem.end_date && sem.start_date) updateAutoEndDate(sem.start_date);
    isConfigUnlocked = false;
  } else {
    isConfigUnlocked = true;
    updateAutoEndDate(document.getElementById('semStartDate')?.value);
  }
  applyConfigLockState();
}

export async function generateSemesterProjection() {
  if (!isConfigUnlocked) {
    return showToast('Buka switch kunci konfigurasi terlebih dahulu.');
  }

  const startDate = document.getElementById('semStartDate')?.value;
  const endDate = document.getElementById('semEndDate')?.value;
  const semesterName = document.getElementById('semName')?.value;
  if (!startDate) return showToast('Pilih tanggal mulai semester.');

  const res = await fetch('/api/semester/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, semesterName, totalWeeks: 16 })
  });
  const data = await res.json();
  showToast('Kalender berhasil dibuat: ' + data.totalGenerated + ' sesi.');
  isConfigUnlocked = false;
  applyConfigLockState();
  await loadMeetings();
  switchScheduleView('calendar');
}

// Master Mata Kuliah & Jadwal (Master Matkul)
export async function loadSchedules() {
  const res = await fetch('/api/schedules');
  const data = await res.json();
  const mobileContainer = document.getElementById('schedulesCardsMobile');
  if (!mobileContainer) return;

  if (data.length === 0) {
    mobileContainer.innerHTML = EmptyState({ message: 'Belum ada mata kuliah. Klik "+ Tambah Matkul" untuk membuat mata kuliah dan jadwalnya.' });
    return;
  }

  mobileContainer.innerHTML = data.map(s => {
    const hasSchedule = Boolean(s.day_of_week && s.start_time && s.end_time);
    const dayStr = hasSchedule ? (DAY_NAMES[s.day_of_week] || `Hari ${s.day_of_week}`) : 'Jadwal belum diatur';
    const timeStr = hasSchedule ? `${s.start_time} - ${s.end_time} WIB` : '';
    const roomStr = s.room ? `Ruang ${s.room}` : '';

    return `
      <div class="mobile-list-card">
        <div class="mobile-list-card-header">
          <div>
            <div class="mobile-list-card-title">${s.subject_name}</div>
            <div class="mobile-list-card-meta">
              <span>${dayStr}</span>
              ${timeStr ? `<span>•</span><span>${timeStr}</span>` : ''}
              ${roomStr ? `<span>•</span><span>${roomStr}</span>` : ''}
            </div>
          </div>
          ${Badge({ text: `${s.subject_sks || 2} SKS`, variant: s.subject_sks === 3 ? '3sks' : '2sks' })}
        </div>

        <div style="font-size: 0.72rem; color: var(--text-muted); margin: 6px 0 8px 0; line-height: 1.4;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <svg style="width: 12px; height: 12px; stroke: var(--text-dim); fill: none; stroke-width: 2;" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Dosen:</strong> ${s.lecturer_name || 'Belum diatur'} ${s.lecturer_phone ? `(${s.lecturer_phone})` : ''}</span>
          </div>
          ${s.general_notes ? `<div style="margin-top: 3px; color: var(--text-dim); display: flex; align-items: center; gap: 5px;">
            <svg style="width: 12px; height: 12px; stroke: var(--text-dim); fill: none; stroke-width: 2;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${s.general_notes}</span>
          </div>` : ''}
        </div>

        <div class="mobile-list-card-actions">
          <span style="font-size: 0.68rem; color: var(--text-dim);">
            ${s.subject_code ? `Kode: ${s.subject_code}` : 'ID: ' + s.subject_id.slice(0, 8)}
          </span>
          <div style="display: flex; gap: 6px;">
            ${ActionChip({
              type: 'edit',
              onclick: `window.openEditSubjectDialog('${s.subject_id}', '${(s.subject_name || '').replace(/'/g, "\\'")}', '${s.subject_code || ''}', ${s.subject_sks || 2}, '${s.lecturer_id || ''}', '${s.schedule_id || ''}', ${s.day_of_week || 1}, '${s.start_time || '08:00'}', '${s.end_time || '10:30'}', '${(s.room || '').replace(/'/g, "\\'")}', '${(s.general_notes || '').replace(/'/g, "\\'")}')`
            })}
            ${ActionChip({
              type: 'delete',
              onclick: `window.confirmDeleteSubject('${s.subject_id}', '${(s.subject_name || '').replace(/'/g, "\\'")}')`
            })}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Meetings Sessions (Drill-down per Subject)
export async function loadMeetings() {
  const res = await fetch('/api/meetings');
  cachedMeetings = await res.json();

  if (selectedSubjectId) {
    renderSubjectTimeline(selectedSubjectId);
  } else {
    renderSubjectsOverview();
  }
}

function renderSubjectsOverview() {
  const container = document.getElementById('meetingsCardsMobile');
  if (!container) return;

  document.getElementById('drillDownHeader').style.display = 'none';
  document.getElementById('calendarFilterBar').style.display = 'none';

  if (cachedMeetings.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada kalender semester. Buka tab Pengaturan lalu klik "Generate Kalender".</div>`;
    return;
  }

  // Group meetings by subject_id
  const subjectsMap = {};
  cachedMeetings.forEach(m => {
    if (!subjectsMap[m.subject_id]) {
      subjectsMap[m.subject_id] = {
        id: m.subject_id,
        name: m.subject_name,
        sks: m.subject_sks,
        lecturer: m.lecturer_name,
        totalMeetings: 0,
        completedMeetings: 0,
        elearningCount: 0,
      };
    }
    subjectsMap[m.subject_id].totalMeetings += 1;
    if (m.is_completed) subjectsMap[m.subject_id].completedMeetings += 1;
    if (m.session_type === 'ELEARNING') subjectsMap[m.subject_id].elearningCount += 1;
  });

  const subjects = Object.values(subjectsMap);

  container.innerHTML = subjects.map(s => `
    <div class="mobile-list-card" style="cursor: pointer;" onclick="window.selectSubjectDrillDown('${s.id}', '${s.name.replace(/'/g, "\\'")}', ${s.sks})">
      <div class="mobile-list-card-header">
        <div>
          <div class="mobile-list-card-title">${s.name}</div>
          <div class="mobile-list-card-meta">
            <span>Dosen: ${s.lecturer || 'Dosen Pengampu'}</span>
          </div>
        </div>
        <span class="badge ${s.sks === 3 ? 'badge-3sks' : 'badge-2sks'}">${s.sks} SKS</span>
      </div>
      <div class="mobile-list-card-actions">
        <span style="font-size: 0.72rem; color: var(--text-dim);">
          ${s.totalMeetings} Sesi Pertemuan • ${s.elearningCount} E-Learning
        </span>
        <button class="icon-btn-action" style="padding: 5px 9px;">
          <span>Lihat Jadwal →</span>
        </button>
      </div>
    </div>
  `).join('');
}

export function selectSubjectDrillDown(subjectId, subjectName, sks) {
  selectedSubjectId = subjectId;
  document.getElementById('drillSubjectTitle').innerText = subjectName;
  document.getElementById('drillSubjectSks').innerText = `${sks} SKS`;
  document.getElementById('drillSubjectSks').className = `badge ${sks === 3 ? 'badge-3sks' : 'badge-2sks'}`;
  document.getElementById('drillDownHeader').style.display = 'flex';
  document.getElementById('calendarFilterBar').style.display = 'flex';
  renderSubjectTimeline(subjectId);
}

export function closeSubjectDrillDown() {
  selectedSubjectId = null;
  renderSubjectsOverview();
}

function renderSubjectTimeline(subjectId) {
  const container = document.getElementById('meetingsCardsMobile');
  if (!container) return;

  const filterWeek = document.getElementById('filterWeekSelect')?.value;
  let meetings = cachedMeetings.filter(m => m.subject_id === subjectId);
  if (filterWeek) {
    meetings = meetings.filter(m => m.week_number === Number(filterWeek));
  }

  // Ensure ELEARNING is placed on the far right of its week
  meetings.sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    const aEle = a.session_type === 'ELEARNING' ? 2 : 1;
    const bEle = b.session_type === 'ELEARNING' ? 2 : 1;
    if (aEle !== bEle) return aEle - bEle;
    if (a.meeting_number && b.meeting_number && a.meeting_number !== b.meeting_number) {
      return a.meeting_number - b.meeting_number;
    }
    return (a.session_date || '').localeCompare(b.session_date || '');
  });

  if (meetings.length === 0) {
    container.innerHTML = `<div class="empty-state">Belum ada sesi pertemuan untuk mata kuliah ini. Buka Pengaturan lalu Generate Kalender.</div>`;
    return;
  }

  container.innerHTML = meetings.map(m => {
    let badgeClass = 'badge-offline';
    if (m.session_type === 'ELEARNING') badgeClass = 'badge-elearning';
    if (m.session_type === 'ZOOM') badgeClass = 'badge-zoom';
    if (m.session_type === 'UTS' || m.session_type === 'UAS') badgeClass = 'badge-exam';
    if (m.session_type === 'LIBUR') badgeClass = 'badge-libur';

    const pNum = m.meeting_number > 0 ? `Pertemuan ${m.meeting_number}` : m.session_type;

    // Tanggal Merah / National Holiday Detection
    const holidayCheck = checkHoliday(m.session_date);
    const holidayBanner = holidayCheck.isHoliday
      ? `<div class="holiday-tag"><span class="badge badge-holiday">Tanggal Merah</span> <span>${holidayCheck.name}</span></div>`
      : '';

    const mentariChip = m.mentari_url
      ? `<span class="meta-chip" style="color: #60a5fa; border-color: rgba(96,165,250,0.3);"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Mentari Link</span></span>`
      : '';

    return `
      <div class="mobile-list-card" style="${holidayCheck.isHoliday ? 'border-color: rgba(239,68,68,0.25);' : ''}">
        <div class="mobile-list-card-header">
          <div>
            <div class="mobile-list-card-title">${pNum} • Minggu ${m.week_number}</div>
            <div class="mobile-list-card-meta">
              <span class="meta-chip">
                <svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                <span>${m.session_date}</span>
              </span>
              <span>•</span>
              <span class="meta-chip">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${m.start_time} - ${m.end_time}</span>
              </span>
              <span>•</span>
              <span class="meta-chip">
                <svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
                <span>Ruang ${m.room}</span>
              </span>
              ${mentariChip}
            </div>
            ${holidayBanner}
          </div>
          <span class="badge ${badgeClass}">${m.session_type}</span>
        </div>
        <div class="mobile-list-card-actions">
          <span style="font-size: 0.7rem; color: var(--text-dim); max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${m.notes || 'Jadwal Normal'}
          </span>
          <button class="icon-btn-action" onclick="window.openEditMeetingDialog('${m.id}', '${m.session_type}', '${(m.notes || '').replace(/'/g, "\\'")}', '${(m.mentari_url || '').replace(/'/g, "\\'")}')">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Edit Sesi</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export function filterMeetingsTable() {
  if (selectedSubjectId) {
    renderSubjectTimeline(selectedSubjectId);
  }
}

export function openEditMeetingDialog(id, sessionType, notes, mentariUrl = '') {
  document.getElementById('editMeetingId').value = id;
  document.getElementById('editSessionType').value = sessionType;
  document.getElementById('editNotes').value = notes;
  document.getElementById('editMentariUrl').value = mentariUrl;
  document.getElementById('dialogEditMeeting').showModal();
}

export async function saveMeetingEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editMeetingId').value;
  const session_type = document.getElementById('editSessionType').value;
  const notes = document.getElementById('editNotes').value;
  const mentari_url = document.getElementById('editMentariUrl').value;

  await fetch(`/api/meetings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_type, notes, mentari_url })
  });

  document.getElementById('dialogEditMeeting').close();
  showToast('Perubahan sesi pertemuan berhasil disimpan.');
  await loadMeetings();
}

export async function openSubjectDialog() {
  const lecRes = await fetch('/api/lecturers');
  const lecs = await lecRes.json();

  document.getElementById('dialogSubjectTitle').innerText = 'Tambah Mata Kuliah';
  document.getElementById('subSubjectId').value = '';
  document.getElementById('subScheduleId').value = '';
  document.getElementById('subName').value = '';
  document.getElementById('subCode').value = '';
  document.getElementById('subSks').value = '3';

  const lecSelect = document.getElementById('subLecturer');
  if (lecSelect) {
    lecSelect.innerHTML = '<option value="">-- Belum Ada Dosen --</option>' +
      lecs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  }

  document.getElementById('subDay').value = '1';
  document.getElementById('subStart').value = '08:00';
  document.getElementById('subEnd').value = '10:30';
  document.getElementById('subRoom').value = '';
  document.getElementById('subNotes').value = '';

  document.getElementById('dialogSubject').showModal();
}

export async function openEditSubjectDialog(
  subjectId,
  name,
  code,
  sks,
  lecturerId,
  scheduleId,
  dayOfWeek,
  startTime,
  endTime,
  room,
  notes
) {
  const lecRes = await fetch('/api/lecturers');
  const lecs = await lecRes.json();

  document.getElementById('dialogSubjectTitle').innerText = 'Ubah Mata Kuliah & Jadwal';
  document.getElementById('subSubjectId').value = subjectId;
  document.getElementById('subScheduleId').value = scheduleId || '';
  document.getElementById('subName').value = name;
  document.getElementById('subCode').value = code || '';
  document.getElementById('subSks').value = sks || 2;

  const lecSelect = document.getElementById('subLecturer');
  if (lecSelect) {
    lecSelect.innerHTML = '<option value="">-- Belum Ada Dosen --</option>' +
      lecs.map(l => `<option value="${l.id}" ${l.id === lecturerId ? 'selected' : ''}>${l.name}</option>`).join('');
  }

  document.getElementById('subDay').value = dayOfWeek || 1;
  document.getElementById('subStart').value = startTime || '08:00';
  document.getElementById('subEnd').value = endTime || '10:30';
  document.getElementById('subRoom').value = room || '';
  document.getElementById('subNotes').value = notes || '';

  document.getElementById('dialogSubject').showModal();
}

export async function saveSubject(e) {
  e.preventDefault();
  const subjectId = document.getElementById('subSubjectId').value;
  const scheduleId = document.getElementById('subScheduleId').value;

  const body = {
    subject_id: subjectId || undefined,
    schedule_id: scheduleId || undefined,
    name: document.getElementById('subName').value.trim(),
    code: document.getElementById('subCode').value.trim() || null,
    sks: Number(document.getElementById('subSks').value) || 2,
    lecturer_id: document.getElementById('subLecturer').value || null,
    day_of_week: Number(document.getElementById('subDay').value) || 1,
    start_time: document.getElementById('subStart').value,
    end_time: document.getElementById('subEnd').value,
    room: document.getElementById('subRoom').value.trim() || 'Kelas',
    general_notes: document.getElementById('subNotes').value.trim() || null,
  };

  try {
    const res = await fetch('/api/subjects/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      showToast(subjectId ? 'Mata kuliah berhasil diperbarui.' : 'Mata kuliah baru berhasil ditambahkan.');
      document.getElementById('dialogSubject').close();
      await loadSchedules();
      await loadMeetings();
      // Also update subjects in assignments dialog & whitelist mappings
      const { loadSubjectGroupMappings } = await import('./whitelist.js');
      loadSubjectGroupMappings();
    } else {
      showToast('Gagal menyimpan mata kuliah.');
    }
  } catch (err) {
    showToast('Koneksi gagal.');
  }
}

export function confirmDeleteSubject(subjectId, subjectName) {
  askConfirm(
    'Hapus Mata Kuliah',
    `Apakah Anda yakin ingin menghapus "${subjectName}" beserta seluruh jadwal, sesi pertemuan, dan tugasnya?`,
    async () => {
      try {
        const res = await fetch(`/api/subjects/full/${subjectId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast(`Mata kuliah "${subjectName}" dihapus.`);
          await loadSchedules();
          await loadMeetings();
          const { loadSubjectGroupMappings } = await import('./whitelist.js');
          loadSubjectGroupMappings();
        } else {
          showToast('Gagal menghapus mata kuliah.');
        }
      } catch (err) {
        showToast('Koneksi gagal.');
      }
    }
  );
}
