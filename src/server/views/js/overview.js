import { showToast } from './api.js';

export async function loadTelemetry() {
  try {
    const res = await fetch('/api/telemetry');
    const data = await res.json();
    const t = data.telemetry;

    const phoneFormatted = t.phoneNumber ? '+' + t.phoneNumber : '-';

    // Status Texts
    const botPhone = document.getElementById('botPhoneText');
    const desktopPhone = document.getElementById('desktopPhoneText');
    const botBadgeText = document.getElementById('botStatusBadgeText');
    const mobileStatusText = document.getElementById('mobileStatusText');
    const desktopStatusText = document.getElementById('desktopStatusText');

    if (botPhone) botPhone.innerText = phoneFormatted;
    if (desktopPhone) desktopPhone.innerText = phoneFormatted;
    if (botBadgeText) botBadgeText.innerText = t.status;

    const mobBadge = document.getElementById('mobileStatusBadge');
    const dskBadge = document.getElementById('desktopStatusBadge');
    const qrCard = document.getElementById('qrCard');
    const qrImage = document.getElementById('qrImage');

    if (t.status === 'CONNECTED') {
      if (mobBadge) mobBadge.className = 'header-status-pill';
      if (dskBadge) dskBadge.className = 'header-status-pill';
      if (mobileStatusText) mobileStatusText.innerText = 'Connected';
      if (desktopStatusText) desktopStatusText.innerText = 'Connected';
      if (qrCard) qrCard.style.display = 'none';
    } else if (t.status === 'QR_REQUIRED' && t.qrDataUrl) {
      if (mobBadge) mobBadge.className = 'header-status-pill qr';
      if (dskBadge) dskBadge.className = 'header-status-pill qr';
      if (mobileStatusText) mobileStatusText.innerText = 'Scan QR';
      if (desktopStatusText) desktopStatusText.innerText = 'Scan QR';
      if (qrCard) qrCard.style.display = 'block';
      if (qrImage) qrImage.src = t.qrDataUrl;
    } else {
      if (mobBadge) mobBadge.className = 'header-status-pill disconnected';
      if (dskBadge) dskBadge.className = 'header-status-pill disconnected';
      if (mobileStatusText) mobileStatusText.innerText = t.status;
      if (desktopStatusText) desktopStatusText.innerText = t.status;
      if (qrCard) qrCard.style.display = 'none';
    }

    const statSub = document.getElementById('statSubjects');
    const statTask = document.getElementById('statTasks');
    const statWhite = document.getElementById('statWhitelist');

    if (statSub) statSub.innerText = data.stats.totalSubjects;
    if (statTask) statTask.innerText = data.stats.totalActiveTasks;
    if (statWhite) statWhite.innerText = data.stats.totalWhitelistMembers;

    loadRecentBotMessages();
  } catch (e) {
    console.error('Failed to load telemetry:', e);
  }
}

export async function loadRecentBotMessages() {
  const container = document.getElementById('recentBotMessagesContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/bot/recent-messages');
    const messages = await res.json();

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 18px 8px;">
          Belum ada riwayat pesan atau broadcast bot dalam 7 hari terakhir.
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => {
      let meta = {};
      try {
        if (m.metadata_json) meta = JSON.parse(m.metadata_json);
      } catch (_) {}

      const dateObj = new Date(m.created_at);
      const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
      const dayStr = dateObj.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

      let catBadge = '<span class="badge badge-exam">BOT MESSAGE</span>';
      if (m.category === 'DAILY_SCHEDULE' || m.category === 'BROADCAST_SCHEDULE') {
        catBadge = '<span class="badge badge-2sks">JADWAL KULIAH</span>';
      } else if (m.category === 'TASK_REMINDER' || m.category === 'BROADCAST_TASK') {
        catBadge = '<span class="badge badge-3sks">PENGINGAT TUGAS</span>';
      } else if (m.category === 'ELEARNING_REMINDER') {
        catBadge = '<span class="badge badge-elearning">E-LEARNING</span>';
      }

      return `
        <div class="mobile-list-card" style="padding: 10px 12px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <div style="font-size: 0.76rem; font-weight: 600; color: #fff;">${m.message}</div>
            ${catBadge}
          </div>
          <div class="mobile-list-card-meta" style="font-size: 0.68rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>${dayStr}, ${timeStr}</span>
            ${meta.senderJid ? `<span>•</span><span>Dari: ${meta.senderJid.split('@')[0]}</span>` : ''}
            ${meta.targetJid ? `<span>•</span><span>Tujuan: ${meta.targetJid.includes('@g.us') ? 'Grup' : 'DM'}</span>` : ''}
            <span>•</span>
            <span style="color: #4ade80; display: inline-flex; align-items: center; gap: 3px;">
              <svg style="width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.5;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Terkirim</span>
            </span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Gagal memuat riwayat pesan.</div>';
  }
}

export async function restartBot() {
  await fetch('/api/bot/restart', { method: 'POST' });
  showToast('Perintah restart socket terkirim.');
  setTimeout(loadTelemetry, 1500);
}

export async function syncWhitelist() {
  const groupJid = document.getElementById('selectClassGroup')?.value;
  showToast('Memulai sinkronisasi anggota...');
  try {
    const res = await fetch('/api/whitelist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupJid: groupJid || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Sinkronisasi berhasil: ' + (data.count || 0) + ' anggota diimpor.');
      const { loadWhitelist } = await import('./whitelist.js');
      loadWhitelist();
    } else {
      showToast(data.message || 'Gagal sinkronisasi.');
    }
  } catch (err) {
    showToast('Koneksi gagal saat sync anggota.');
  }
  loadTelemetry();
}
