/* ATTENDRIX – UI helpers (icons, toast, modal, charts) */
const ICONS = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V22h16"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M17 4a4 4 0 0 1 0 8"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  gear: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  mega: '<path d="M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M19 8a5 5 0 0 1 0 8"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.setAttribute('role', type === 'err' ? 'alert' : 'status');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3800);
}

/* modal({title, body (html), actions:[{label, cls, id, close}]}) */
function openModal({ title, body, actions = [] }) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay" data-action="modal-backdrop">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3><div>${body}</div>
      <div class="mactions">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-modal-btn="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div></div>`;
  $$('[data-modal-btn]', root).forEach(b => b.addEventListener('click', () => {
    const a = actions[+b.dataset.modalBtn];
    // an onClick that returns false keeps the dialog open (used for validation)
    if (!a.onClick || a.onClick() !== false) closeModal();
  }));
  const first = $('input,textarea,select', root);
  if (first) first.focus();
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ---------- charts (inline SVG, no libraries) ---------- */
function barChart(values, labels) {
  const w = 520, h = 190, pad = 28, max = 100, bw = (w - pad * 2) / values.length;
  let g = '';
  [0, 25, 50, 75, 100].forEach(v => {
    const y = h - pad - (h - pad * 2) * v / max;
    g += `<line x1="${pad}" x2="${w - 8}" y1="${y}" y2="${y}" stroke="#1d3166" stroke-dasharray="3 4"/><text x="2" y="${y + 4}">${v}</text>`;
  });
  values.forEach((v, i) => {
    const bh = (h - pad * 2) * v / max, x = pad + i * bw + bw * 0.18, y = h - pad - bh;
    g += `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${bh}" rx="6" fill="url(#bg)"><title>${labels[i]}: ${v}%</title></rect><text x="${x + bw * 0.32}" y="${h - 9}" text-anchor="middle">${labels[i]}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Weekly attendance percentage bar chart">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#35d0ff"/><stop offset="1" stop-color="#2f7bff"/></linearGradient></defs>${g}</svg>`;
}
function donut(pct, size = 96) {
  const r = 38, c = 2 * Math.PI * r, o = c * (1 - pct / 100), col = pct < 75 ? '#ff5d6c' : '#2f7bff';
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${pct}% attendance">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="#1d3166" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${o}" transform="rotate(-90 50 50)"/>
    <text x="50" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="#e8eefc">${pct}%</text></svg>`;
}
const emptyState = (ic, title, text) => `<div class="empty"><div class="eicon">${icon(ic)}</div><b>${esc(title)}</b><p class="small">${esc(text)}</p></div>`;
const chipFor = s => ({ Pending: 'warn', Approved: 'ok', Rejected: 'bad', P: 'ok', A: 'bad' }[s] || 'blue');
const pad2 = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
