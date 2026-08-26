import { EmptyState } from './components.js';

export async function loadLogs() {
  const categoryFilter = document.getElementById('logCategoryFilter')?.value || '';
  const container = document.getElementById('logsListContainer') || document.getElementById('logsCardsMobile');
  if (!container) return;

  try {
    const res = await fetch('/api/logs');
    let data = await res.json();

    if (categoryFilter) {
      data = data.filter(l => l.category === categoryFilter);
    }

    if (!data || data.length === 0) {
      container.innerHTML = EmptyState({ message: 'Belum ada catatan log aktivitas sistem.' });
      return;
    }

    container.innerHTML = data.map(l => {
      let badgeStyle = 'background: #18181f; color: #a1a1aa; border: 1px solid #282834;';
      if (l.level === 'SUCCESS') badgeStyle = 'background: #0f291e; color: #4ade80; border: 1px solid #165b3b;';
      else if (l.level === 'WARN') badgeStyle = 'background: #2a2010; color: #fbbf24; border: 1px solid #5a4015;';
      else if (l.level === 'ERROR') badgeStyle = 'background: #2a1414; color: #f87171; border: 1px solid #4a1f1f;';
      else if (l.level === 'INFO') badgeStyle = 'background: #101c2a; color: #60a5fa; border: 1px solid #1d3b5a;';

      const dateObj = new Date(l.created_at);
      const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

      let metaDetails = '';
      if (l.metadata_json) {
        try {
          const meta = JSON.parse(l.metadata_json);
          const keys = Object.keys(meta);
          if (keys.length > 0) {
            metaDetails = `<div style="margin-top: 6px; font-size: 0.68rem; color: var(--text-dim); font-family: monospace; word-break: break-all;">` +
              keys.map(k => `<span style="color: #a1a1aa;">${k}</span>: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : meta[k]}`).join(' | ') +
              `</div>`;
          }
        } catch (_) {}
      }

      return `
        <div class="mobile-list-card" style="padding: 10px 12px; margin-bottom: 8px;">
          <div class="mobile-list-card-header" style="align-items: flex-start;">
            <div>
              <div class="mobile-list-card-title" style="font-size: 0.78rem; font-weight: 600; color: #fff; line-height: 1.35;">${l.message}</div>
              <div class="mobile-list-card-meta" style="margin-top: 4px; font-size: 0.7rem;">
                <span style="font-weight: 500; color: var(--text-muted);">${l.category}</span>
                <span>•</span>
                <span>${dateStr}, ${timeStr}</span>
              </div>
              ${metaDetails}
            </div>
            <span class="badge" style="${badgeStyle}; flex-shrink: 0; margin-left: 8px; font-size: 0.62rem;">${l.level}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = EmptyState({ message: 'Gagal memuat log aktivitas sistem.' });
  }
}
