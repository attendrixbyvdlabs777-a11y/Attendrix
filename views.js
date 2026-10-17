/* ATTENDRIX – views
   Two modes share these screens:
   - REAL mode (State.demo = false): signed in with Google. No data exists yet, so screens show
     empty states. Features not built yet say so instead of pretending to save.
   - DEMO mode (State.demo = true): clearly labelled sample data, no sign-in, nothing saved. */
const ROLE_LABEL = { faculty: 'Faculty / Admin', cr: 'Class Representative', student: 'Student' };

const State = {
  demo: false, role: null, view: 'dashboard', notifOpen: false, loading: false,
  // auth.status: 'loading' | 'signedOut' | 'signedIn' | 'unconfigured' | 'failed'
  auth: { status: 'loading', user: null, roles: [], warning: null, error: null },
  busy: false, authError: null,
  classes: [], roster: [], selected: new Set(), joinRequests: [], requests: [], myJoin: [],
  announcements: [], messages: [], room: null, history: [],
  att: { classId: null, marks: {}, sessionNo: 1, lastSummary: null },
  // Phase 3: real classes for the signed-in faculty. status: 'idle' | 'loading' | 'ready' | 'error'
  cls: { status: 'idle', error: null }, classOpen: null
};

/* Where on-screen data comes from: sample data in demo mode, nothing in real mode. */
const D = () => (State.demo ? DEMO : EMPTY_DATA);
function loadData(demo) {
  const src = demo ? DEMO : EMPTY_DATA;
  ['classes', 'roster', 'joinRequests', 'requests', 'myJoin', 'announcements', 'messages'].forEach(k => { State[k] = structuredClone(src[k]); });
  State.selected = new Set(); State.history = [];
  State.room = demo ? 'm1' : null;
  State.att = { classId: demo ? 'c1' : null, marks: {}, sessionNo: 1, lastSummary: null };
  State.cls = { status: 'idle', error: null }; State.classOpen = null;
}
loadData(false);

const NAV = {
  faculty: [['dashboard','Dashboard','home'],['classes','Classes','book'],['attendance','Attendance','check'],['roster','Roster','users'],['requests','Requests','inbox'],['chat','Chat','chat'],['audit','Audit','shield'],['settings','Settings','gear']],
  cr:      [['dashboard','Dashboard','home'],['attendance','Attendance','check'],['roster','Roster','users'],['requests','Requests','inbox'],['chat','Chat','chat'],['settings','Settings','gear']],
  student: [['dashboard','Dashboard','home'],['classes','My Classes','book'],['attendance','Attendance','check'],['requests','Requests','inbox'],['chat','Chat','chat'],['settings','Settings','gear']]
};
const TITLES = { dashboard:'Dashboard', classes:'Classes', attendance:'Attendance', roster:'Roster', requests:'Requests', chat:'Chat', audit:'Audit history', settings:'Settings' };

/* ----- who is using the app ----- */
function me() {
  if (State.demo) { const u = DEMO.user[State.role]; return { name: u.name, email: u.email, roleLabel: u.role, photo: null }; }
  const u = State.auth.user || {};
  return { name: u.displayName || u.email || 'Account', email: u.email || '', roleLabel: ROLE_LABEL[State.role] || '', photo: u.photoURL || null };
}
const allowedRoles = () => ['student', ...State.auth.roles];
const firstStaffRole = () => State.auth.roles.includes('faculty') ? 'faculty' : State.auth.roles.includes('cr') ? 'cr' : null;
const homeRole = () => firstStaffRole() || 'student';
const base = () => (State.demo ? '#/demo/' : '#/app/');
const avatar = (m, size) => {
  const st = size ? ` style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px"` : '';
  const ok = m.photo && /^https:\/\//.test(m.photo);
  return `<div class="avatar"${st}>${ok ? `<img src="${esc(m.photo)}" alt="" referrerpolicy="no-referrer">` : esc((m.name || '?')[0].toUpperCase())}</div>`;
};

const logo = () => `<div class="logo"><span class="logo-mark">✓</span><span>Attendrix</span></div>`;
const stat = (ic, val, label) => `<div class="card stat"><div class="sicon">${icon(ic)}</div><div><b>${val}</b><span>${label}</span></div></div>`;

/* Top-of-page status line. Honest about what is real. */
function banner(stage, msg) {
  if (State.demo) return `<div class="notice">Demo mode: this screen shows sample data. You are not signed in and nothing is saved.</div>`;
  const warn = State.auth.warning ? `<div class="notice bad">${esc(State.auth.warning)}</div>` : '';
  const info = msg ? `<div class="notice info">${esc(msg)}</div>` : stage ? `<div class="notice info">You are signed in. This section is not built yet, so it shows no data. It arrives in Stage ${stage}.</div>` : '';
  return warn + info;
}

/* ---------------- landing ---------------- */
function ctaButtons() {
  if (State.auth.status === 'signedIn') return `<a class="btn btn-primary" href="#/app/${homeRole()}/dashboard">Open dashboard</a>`;
  return `<a class="btn btn-primary" href="#/login/faculty">Faculty / Admin Login</a><a class="btn btn-ghost" href="#/login/student">Student Login</a>`;
}
function landingView() {
  const feats = [
    ['check','Fast attendance','Mark Present or Absent in seconds, with several sessions per day numbered automatically.'],
    ['users','Roster control','Add students by hand or import a spreadsheet, with automatic roll numbers.'],
    ['file','PDF reports','Printable reports with totals, percentages and clean page headers.'],
    ['shield','Safe by design','Roles are checked on the server, and every important action is logged.'],
    ['inbox','Student requests','Students send written requests and track Pending, Approved or Rejected.'],
    ['chat','Class chat','Group chats and announcements, limited to people in the class.'],
    ['chart','Clear statistics','Dashboards show attendance trends and who needs attention.'],
    ['lock','Private joining','Students join with a six-digit code plus a separate class password.']
  ];
  return `
  <header class="nav"><div class="container">${logo()}
    <nav class="nav-links"><a href="#features">Features</a><a href="#how">How it works</a></nav>
    <div class="nav-cta">${State.auth.status === 'signedIn' ? ctaButtons() : `<a class="btn btn-ghost" href="#/login/student">Student Login</a><a class="btn btn-primary" href="#/login/faculty">Faculty Login</a>`}</div>
  </div></header>
  <main>
  <section class="hero container">
    <span class="pill">Attendance, without the paperwork</span>
    <h1>Smart attendance for <span class="grad">every class</span></h1>
    <p>Attendrix helps faculty, class representatives and students keep accurate attendance records, handle requests and stay in touch, all in one place.</p>
    <div class="hero-cta">${ctaButtons()}</div>
    <div class="hero-preview" aria-label="Illustration with sample numbers">
      <div class="grid g3" style="text-align:left">${stat('users','12','Students')}${stat('check','86%','This week')}${stat('inbox','3','Pending')}</div>
      <div style="margin-top:14px">${barChart(DEMO.weekly, DEMO.weeklyLabels)}</div>
      <div class="muted small" style="margin-top:8px">Illustration only. Sample numbers.</div>
    </div>
  </section>
  <section class="block container" id="features"><h2>Everything a class needs</h2><p class="sub">Built for faculty, class representatives and students.</p>
    <div class="grid g4">${feats.map(f => `<div class="feature"><div class="ficon">${icon(f[0])}</div><h3>${f[1]}</h3><p>${f[2]}</p></div>`).join('')}</div></section>
  <section class="block container" id="how"><h2>How it works</h2><p class="sub">Three simple steps.</p>
    <div class="grid g3">
      <div class="feature step"><div class="num">1</div><h3>Create a class</h3><p>Faculty create a class and get a six-digit join code and a class password.</p></div>
      <div class="feature step"><div class="num">2</div><h3>Add students</h3><p>Students request to join, or faculty import a spreadsheet of names.</p></div>
      <div class="feature step"><div class="num">3</div><h3>Take attendance</h3><p>Mark each session, confirm, and download the PDF report.</p></div>
    </div></section>
  <section class="container"><div class="cta-box"><h2>Ready to try it?</h2><p class="muted" style="margin:8px 0 20px">Sign in with Google to continue.</p>
    <div class="hero-cta">${ctaButtons()}</div></div></section>
  </main>
  <footer class="foot"><div class="container">${logo()}<span class="small">© ${new Date().getFullYear()} Attendrix. All rights reserved.</span></div></footer>`;
}

/* ---------------- login / auth screens ---------------- */
const googleG = () => `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

function loadingView(text) {
  return `<div class="fullpage"><div><div class="spinner"></div><p class="muted">${esc(text || 'Loading…')}</p></div></div>`;
}

function loginView(kind) {
  const fac = kind === 'faculty', a = State.auth;
  let status = '', disabled = false;
  if (a.status === 'unconfigured') { status = `<div class="notice bad"><b>Firebase is not configured yet.</b> Add your Firebase web config to <code>js/firebase-config.js</code> and reload. See SETUP.md.</div>`; disabled = true; }
  else if (a.status === 'failed') { status = `<div class="notice bad">${esc(a.error || 'Firebase could not start.')}</div>`; disabled = true; }
  else if (a.status === 'loading') { status = `<div class="row muted small"><div class="spinner" style="width:18px;height:18px;margin:0;border-width:2px"></div> Checking your sign-in…</div>`; disabled = true; }
  if (State.authError) status += `<div class="notice bad" role="alert">${esc(State.authError)}</div>`;
  const demoLinks = fac
    ? `<a class="btn btn-ghost btn-block" href="#/demo/faculty/dashboard">Explore the Faculty demo (sample data)</a><a class="btn btn-ghost btn-block" href="#/demo/cr/dashboard">Explore the Class Representative demo</a>`
    : `<a class="btn btn-ghost btn-block" href="#/demo/student/dashboard">Explore the Student demo (sample data)</a>`;
  return `<div class="auth-wrap"><div class="auth-card">
    ${logo()}
    <h2 style="text-align:center">${fac ? 'Faculty / Admin sign in' : 'Student sign in'}</h2>
    <p class="muted small" style="text-align:center">${fac ? 'For faculty, administrators and class representatives. Access is granted by an administrator.' : 'Sign in to see your classes and attendance.'}</p>
    <div class="stack" style="margin-top:20px">
      <button class="btn gbtn btn-block" data-action="google-signin" ${disabled || State.busy ? 'disabled' : ''}>${State.busy ? '<span class="spin"></span> Signing in…' : googleG() + ' Continue with Google'}</button>
      ${status}
    </div>
    <div class="divider">or look around first</div>
    <div class="stack">${demoLinks}<a class="btn btn-ghost btn-block" href="#/">Back to home</a></div>
  </div></div>`;
}

/* Shows the signed-in user's UID (what roles/{uid} must be named) and what the lookup found. */
function uidBlock() {
  const a = State.auth, u = a.user, d = a.diag;
  if (!u) return '';
  let line = '';
  if (d && !d.exists) line = `No document exists at <b>roles/${esc(u.uid)}</b>. Create a document in the <b>roles</b> collection with exactly this ID.`;
  else if (d && d.exists) line = `A roles document exists, but its <b>roles</b> field is <b>${esc(d.type)}</b>${d.type !== 'missing' ? ' (' + esc(d.valueText) + ')' : ''}. It must be an <b>array</b> containing <b>faculty</b> or <b>cr</b>.`;
  return `<div class="notice info" style="text-align:left;margin-top:12px"><div class="small muted">Your account ID (UID)</div>
    <code style="display:block;word-break:break-all;user-select:all;margin:6px 0">${esc(u.uid)}</code>
    <button class="btn btn-ghost btn-sm" data-action="copy-uid" data-uid="${esc(u.uid)}">Copy UID</button>
    ${line ? `<p class="small" style="margin-top:10px">${line}</p>` : ''}</div>`;
}

function deniedView(role) {
  const a = State.auth, who = esc((a.user && a.user.email) || '');
  const staff = role === 'faculty' || role === 'cr' || !role;
  return `<div class="auth-wrap"><div class="auth-card" style="text-align:center">
    ${logo()}
    <h2>${staff ? 'No ' + (role === 'cr' ? 'Class Representative' : 'faculty') + ' access' : 'Access denied'}</h2>
    <p class="muted small">You are signed in as <b>${who}</b>, but this account has not been given that role. Roles are assigned by an administrator and cannot be chosen from the browser.</p>
    ${a.warning ? `<div class="notice bad" style="margin-top:12px;text-align:left">${esc(a.warning)}</div>` : ''}
    ${uidBlock()}
    <div class="stack" style="margin-top:20px">
      <a class="btn btn-primary btn-block" href="#/app/student/dashboard">Continue as Student</a>
      <button class="btn btn-ghost btn-block" data-action="logout">Sign out</button>
    </div></div></div>`;
}

/* ---------------- dashboard shell ---------------- */
function shell(inner) {
  const role = State.role, nav = NAV[role], m = me();
  const items = () => nav.map(n => `<button class="nav-item ${State.view === n[0] ? 'active' : ''}" data-action="nav" data-view="${n[0]}">${icon(n[2])}<span>${n[1]}</span></button>`).join('');
  const notifs = D().notifications;
  const notif = notifs.length ? notifs.map(n => `<div class="item" style="margin-bottom:8px"><div class="grow"><div class="small">${esc(n.text)}</div><div class="muted small">${esc(n.when)}</div></div></div>`).join('')
    : `<p class="muted small">No notifications yet.</p>`;
  return `<div class="shell">
    <aside class="side">${logo()}${items()}<div class="spacer"></div>
      <button class="nav-item" data-action="logout">${icon('logout')}<span>${State.demo ? 'Exit demo' : 'Sign out'}</span></button></aside>
    <div class="main">
      <div class="topbar"><h1>${TITLES[State.view]}</h1>
        <div class="row">
          ${State.demo ? '<span class="chip warn">Demo</span>' : ''}
          <div class="relative"><button class="icon-btn" data-action="toggle-notif" aria-label="Notifications">${icon('bell')}${notifs.length ? '<span class="dot"></span>' : ''}</button>
            ${State.notifOpen ? `<div class="notif-panel"><b class="small">Notifications</b><div style="margin-top:10px">${notif}</div></div>` : ''}</div>
          <div class="row"><div class="whobox"><b>${esc(m.name)}</b><span class="muted small">${esc(m.roleLabel)}</span></div>${avatar(m)}</div>
        </div></div>
      <div class="content" id="content">${State.loading ? skeletons() : inner}</div>
    </div>
    <nav class="bottom" aria-label="Main">${items()}</nav>
  </div>`;
}
const skeletons = () => `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;

/* ---------------- shared pieces ---------------- */
const classOptions = sel => State.classes.filter(c => !c.archived).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const sessionsTable = rows => rows.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Session</th><th>Class</th><th>Present</th><th>Absent</th><th>%</th></tr></thead><tbody>${rows.map(s => `<tr><td>${s.date}</td><td>#${s.no}</td><td>${esc(s.cls)}</td><td>${s.present}</td><td>${s.absent}</td><td>${Math.round(s.present * 100 / (s.present + s.absent))}%</td></tr>`).join('')}</tbody></table></div>` : emptyState('clock', 'No sessions yet', 'Finalized sessions will appear here.');
const allSessions = () => [...State.history, ...D().sessions];

const announcementList = () => State.announcements.length ? `<div class="list">${State.announcements.map(a => `<div class="item"><div class="grow"><b>${esc(a.title)}</b><div class="muted small">${esc(a.body)}</div></div><span class="chip">${esc(a.when)}</span></div>`).join('')}</div>` : emptyState('mega', 'No announcements', 'Nothing has been posted yet.');

const joinRequestList = (canAct) => {
  if (!State.joinRequests.length) return emptyState('inbox', 'No join requests', 'New requests will show up here.');
  return `<div class="list">${State.joinRequests.map(j => `<div class="item"><div class="grow"><b>${esc(j.student)}</b><div class="muted small">${esc(j.cls)} · ${j.when}</div></div>
    ${j.status === 'Pending' && canAct ? `<div class="actions"><button class="btn btn-ok btn-sm" data-action="join-approve" data-id="${j.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="join-reject" data-id="${j.id}">Reject</button></div>` : `<span class="chip ${chipFor(j.status)}">${j.status}</span>`}</div>`).join('')}</div>`;
};
const attendanceDonuts = () => D().myAttendance.length ? `<div class="grid g3">${D().myAttendance.map(a => { const p = Math.round(a.attended * 100 / a.total); return `<div class="row">${donut(p, 84)}<div><b class="small">${esc(a.cls)}</b><div class="muted small">${a.attended} of ${a.total} sessions</div>${p < 75 ? '<span class="chip bad">Below 75%</span>' : '<span class="chip ok">On track</span>'}</div></div>`; }).join('')}</div>` : emptyState('chart', 'No attendance yet', 'Your attendance appears here once you are in a class and sessions are recorded.');
const weeklyChart = () => D().weekly.length ? barChart(D().weekly, D().weeklyLabels) : emptyState('chart', 'No attendance data yet', 'Charts appear after attendance is recorded.');

/* ---------------- views ---------------- */
const V = {};

V.dashboard = () => {
  const role = State.role;
  if (role === 'student') {
    const mine = D().myAttendance, tot = mine.reduce((a, c) => a + c.total, 0);
    const overall = tot ? Math.round(mine.reduce((a, c) => a + c.attended, 0) * 100 / tot) + '%' : '—';
    return `${banner(3)}
    <div class="grid g4 stats-row">${stat('book', State.myJoin.filter(j => j.status === 'Approved').length, 'Enrolled classes')}${stat('chart', overall, 'Overall attendance')}${stat('inbox', State.requests.filter(r => r.status === 'Pending').length, 'Pending requests')}${stat('mega', State.announcements.length, 'Announcements')}</div>
    <div class="card"><h3>Attendance by class</h3>${attendanceDonuts()}</div>
    <div class="card"><h3>Announcements</h3>${announcementList()}</div>`;
  }
  const fac = role === 'faculty';
  return `${fac ? banner(0, 'Classes are live. Attendance, requests and chat are not built yet, so those parts show no data.') : banner(3)}
  <div class="grid g4 stats-row">${stat('book', State.classes.filter(c => !c.archived).length, 'Classes')}${stat('users', State.roster.length, State.demo ? 'Students (sample class)' : 'Students')}${stat('check', allSessions().filter(s => s.date === isoDate(new Date())).length, "Today's sessions")}${stat('inbox', State.joinRequests.filter(j => j.status === 'Pending').length + State.requests.filter(r => r.status === 'Pending').length, 'Pending items')}</div>
  <div class="grid g2">
    <div class="card"><h3>Weekly attendance</h3>${weeklyChart()}</div>
    <div class="card"><h3>Classes</h3><div class="list">${State.classes.filter(c => !c.archived).map(dashClassItem).join('') || emptyState('book', 'No classes yet', fac ? 'Create your first class in the Classes tab.' : 'Classes you are assigned to will appear here.')}</div></div>
  </div>
  <div class="card"><h3>Recent sessions</h3>${sessionsTable(allSessions().slice(0, 6))}</div>
  ${fac ? `<div class="grid g2"><div class="card"><h3>Join requests</h3>${joinRequestList(true)}</div>
    <div class="card"><div class="row between"><h3>Announcements</h3><button class="btn btn-ghost btn-sm" data-action="new-announcement">${icon('plus')} New</button></div>${announcementList()}</div></div>`
  : `<div class="card"><h3>Announcements</h3>${announcementList()}</div>`}`;
};

/* ---------------- Phase 3: real classes (faculty) ---------------- */
const codeFmt = c => (c ? c.slice(0, 4) + ' ' + c.slice(4) : '');
const classMeta = c => [c.course, c.department, c.academicYear].filter(Boolean).join(' · ');
const classTag = c => `Sem ${c.semester} · Sec ${c.section}`;

/* One row in the dashboard "Classes" card. Sample data keeps its attendance bar; real classes link to their page. */
function dashClassItem(c) {
  if (State.demo) return `<div class="item"><div class="grow"><b class="small">${esc(c.name)}</b><div class="bar ${c.att < 80 ? 'low' : ''}" style="margin-top:8px"><i style="width:${c.att}%"></i></div></div><b>${c.att}%</b></div>`;
  return `<div class="item"><div class="grow"><b class="small">${esc(c.name)}</b><div class="muted small">${esc(classTag(c))}</div></div><a class="btn btn-ghost btn-sm" href="#/app/faculty/classes/${esc(c.id)}">Open</a></div>`;
}

function classCard(c) {
  return `<div class="card"><div class="row between"><b>${esc(c.name)}</b><span class="chip blue">${esc(classTag(c))}</span></div>
    <div class="muted small" style="margin-top:6px">${esc(classMeta(c))}${c.subject ? ' · ' + esc(c.subject) : ''}</div>
    <div class="muted small" style="margin:12px 0 4px">Join code</div><div style="font-size:1.4rem;letter-spacing:.15em;font-weight:700" class="grad">${esc(codeFmt(c.codeKey))}</div>
    <div class="row wrap" style="margin-top:14px"><button class="btn btn-primary btn-sm" data-action="open-class" data-id="${esc(c.id)}">Open</button><button class="btn btn-ghost btn-sm" data-action="edit-class" data-id="${esc(c.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="archive-class" data-id="${esc(c.id)}">Archive</button></div></div>`;
}

function classDashboard(c) {
  const info = (l, v) => `<div><div class="muted small">${l}</div><b>${v ? esc(v) : '—'}</b></div>`;
  return `<div style="margin-bottom:12px"><a class="btn btn-ghost btn-sm" href="#/app/faculty/classes">← All classes</a></div>
  <div class="card"><div class="row between wrap"><div><h3 style="margin:0">${esc(c.name)}</h3><div class="muted small" style="margin-top:4px">${esc(classTag(c))}</div></div>
      <span class="chip ${c.archived ? 'warn' : 'ok'}">${c.archived ? 'Archived' : 'Active'}</span></div>
    <div class="grid g3" style="margin-top:14px">${info('Course', c.course)}${info('Department', c.department)}${info('Academic year', c.academicYear)}${info('Semester', String(c.semester))}${info('Section', c.section)}${info('Subject', c.subject)}</div>
    <div class="row wrap" style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="edit-class" data-id="${esc(c.id)}">Edit details</button>
      ${c.archived ? `<button class="btn btn-ghost btn-sm" data-action="restore-class" data-id="${esc(c.id)}">Restore class</button>` : `<button class="btn btn-danger btn-sm" data-action="archive-class" data-id="${esc(c.id)}">Archive class</button>`}</div></div>
  <div class="card"><h3>Joining this class</h3>
    <div class="muted small">Join code</div>
    <div style="font-size:1.6rem;letter-spacing:.18em;font-weight:700;margin:4px 0 12px" class="grad">${esc(codeFmt(c.codeKey))}</div>
    <div class="row wrap"><button class="btn btn-ghost btn-sm" data-action="copy-text" data-text="${esc(c.codeKey)}" data-what="Join code">${icon('file')} Copy code</button>
      <button class="btn btn-ghost btn-sm" data-action="reset-pass" data-id="${esc(c.id)}">${icon('lock')} Reset password</button></div>
    <p class="muted small" style="margin-top:12px">The enrollment password is never stored or shown again after it is created. If you lose it, reset it to get a new one.</p></div>
  <div class="grid g4 stats-row">${stat('users', 0, 'Enrolled students')}${stat('inbox', 0, 'Pending join requests')}</div>
  <div class="grid g2">
    <div class="card"><h3>Enrolled students</h3>${emptyState('users', 'No students yet', 'Students will appear here once they join or you add them. Roster tools are the next step.')}</div>
    <div class="card"><h3>Pending join requests</h3>${emptyState('inbox', 'No join requests', 'Student join requests are the next step. Nobody can request to join yet.')}</div>
  </div>`;
}

function facultyClassesReal() {
  const k = State.cls;
  const head = `<div class="row between wrap"><p class="muted">Create and manage your classes. Each class has an 8-character join code and a separate enrollment password.</p><button class="btn btn-primary" data-action="new-class">${icon('plus')} New class</button></div>`;
  if (k.status === 'idle' || k.status === 'loading') return banner() + head + skeletons();
  if (k.status === 'error') return `${banner()}<div class="notice bad" role="alert"><b>Could not load your classes.</b> ${esc(k.error || '')}</div><div style="margin-top:12px"><button class="btn btn-primary" data-action="reload-classes">Try again</button></div>`;
  if (State.classOpen) {
    const c = State.classes.find(x => x.id === State.classOpen);
    return banner() + (c ? classDashboard(c) : `<div class="card">${emptyState('book', 'Class not found', 'This class does not exist or does not belong to you.')}<a class="btn btn-ghost" href="#/app/faculty/classes">Back to classes</a></div>`);
  }
  const act = State.classes.filter(c => !c.archived), arch = State.classes.filter(c => c.archived);
  return `${banner()}${head}
  <div class="grid g3">${act.map(classCard).join('') || `<div class="card" style="grid-column:1/-1">${emptyState('book', 'No classes yet', 'Create your first class to get a join code and password.')}</div>`}</div>
  ${arch.length ? `<div class="card"><h3>Archived</h3><div class="list">${arch.map(c => `<div class="item"><div class="grow"><b>${esc(c.name)}</b><div class="muted small">${esc(classTag(c))}</div></div><a class="btn btn-ghost btn-sm" href="#/app/faculty/classes/${esc(c.id)}">Open</a><button class="btn btn-ghost btn-sm" data-action="restore-class" data-id="${esc(c.id)}">Restore</button></div>`).join('')}</div></div>` : ''}`;
}

V.classes = () => {
  if (!State.demo && State.role === 'faculty') return facultyClassesReal();
  if (State.role === 'student') {
    const rows = State.myJoin.map(j => `<div class="item"><div class="grow"><b>${esc(j.cls)}</b><div class="muted small">Requested ${j.when}</div></div><span class="chip ${chipFor(j.status)}">${j.status}</span></div>`).join('');
    return `${banner(3)}<div class="card"><div class="row between wrap"><h3>My classes and join requests</h3><button class="btn btn-primary btn-sm" data-action="join-class">${icon('plus')} Join a class</button></div><div class="list">${rows || emptyState('book', 'No classes yet', 'Use a six-digit code and the class password to request access.')}</div></div>`;
  }
  const act = State.classes.filter(c => !c.archived), arch = State.classes.filter(c => c.archived);
  return `${banner(3)}<div class="row between wrap"><p class="muted">Create and manage classes. Each class has a six-digit join code and a separate password.</p><button class="btn btn-primary" data-action="new-class">${icon('plus')} New class</button></div>
  <div class="grid g3">${act.map(c => `<div class="card"><div class="row between"><b>${esc(c.name)}</b><span class="chip blue">${c.students} students</span></div>
    <div class="muted small" style="margin:10px 0 4px">Join code</div><div style="font-size:1.5rem;letter-spacing:.2em;font-weight:700" class="grad">${c.code}</div>
    <div class="bar ${c.att < 80 ? 'low' : ''}" style="margin:14px 0 6px"><i style="width:${c.att}%"></i></div><div class="muted small">Average attendance ${c.att}%</div>
    <div class="row" style="margin-top:14px"><button class="btn btn-ghost btn-sm" data-action="edit-class" data-id="${c.id}">Edit</button><button class="btn btn-danger btn-sm" data-action="archive-class" data-id="${c.id}">Archive</button></div></div>`).join('') || `<div class="card" style="grid-column:1/-1">${emptyState('book', 'No classes yet', 'Create your first class to get a join code.')}</div>`}</div>
  ${arch.length ? `<div class="card"><h3>Archived</h3><div class="list">${arch.map(c => `<div class="item"><b class="grow">${esc(c.name)}</b><button class="btn btn-ghost btn-sm" data-action="restore-class" data-id="${c.id}">Restore</button></div>`).join('')}</div></div>` : ''}`;
};

V.attendance = () => {
  const role = State.role;
  if (role === 'student') {
    const hist = D().myHistory;
    return `${banner(5)}<div class="card"><h3>My attendance</h3>${attendanceDonuts()}</div>
    <div class="card"><h3>Session history</h3>${hist.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Class</th><th>Session</th><th>Status</th></tr></thead><tbody>${hist.map(h => `<tr><td>${h.date}</td><td>${esc(h.cls)}</td><td>#${h.no}</td><td><span class="chip ${chipFor(h.s)}">${h.s === 'P' ? 'Present' : 'Absent'}</span></td></tr>`).join('')}</tbody></table></div>` : emptyState('clock', 'No sessions yet', 'Sessions you were part of will be listed here.')}
    <p class="muted small" style="margin-top:10px">These records are read-only. Ask your faculty if something looks wrong.</p></div>`;
  }
  const a = State.att, cls = State.classes.find(c => c.id === a.classId) || State.classes[0];
  const total = State.roster.length;
  const p = State.roster.filter(s => a.marks[s.id] === 'P').length, ab = State.roster.filter(s => a.marks[s.id] === 'A').length, un = total - p - ab;
  return `${banner(5)}
  <div class="card"><div class="row between wrap"><div><h3 style="margin:0">Session #${a.sessionNo} · ${isoDate(new Date())}</h3><div class="muted small">The date is filled in automatically. Sessions are numbered for you.</div></div>
    <select class="input" style="width:auto;max-width:100%" data-change="att-class" ${State.classes.length ? '' : 'disabled'}>${State.classes.length ? classOptions(cls && cls.id) : '<option>No classes</option>'}</select></div></div>
  <div class="counts"><div><b>${total}</b><span class="muted small">Total</span></div><div><b style="color:var(--ok)">${p}</b><span class="muted small">Present</span></div><div><b style="color:var(--bad)">${ab}</b><span class="muted small">Absent</span></div><div><b style="color:var(--warn)">${un}</b><span class="muted small">Unmarked</span></div></div>
  <div class="card">${total ? `<div class="list">${State.roster.map((s, i) => `<div class="item"><span class="roll">${i + 1}</span><span class="grow">${esc(s.name)}</span>
    <div class="mark"><button class="mbtn p ${a.marks[s.id] === 'P' ? 'on' : ''}" data-action="mark" data-id="${s.id}" data-v="P" aria-label="Present">P</button><button class="mbtn a ${a.marks[s.id] === 'A' ? 'on' : ''}" data-action="mark" data-id="${s.id}" data-v="A" aria-label="Absent">A</button></div></div>`).join('')}</div>` : emptyState('users', 'No students in this class', 'Add students in the Roster tab first.')}</div>
  <div class="sticky-actions"><button class="btn btn-ghost" data-action="mark-all" ${total ? '' : 'disabled'}>Mark all present</button><button class="btn btn-primary" data-action="finalize" ${total ? '' : 'disabled'}>Finalize attendance</button></div>
  ${a.lastSummary ? `<div class="card"><h3>Last finalized session</h3><p class="muted small">Session #${a.lastSummary.no}: ${a.lastSummary.p} present, ${a.lastSummary.a} absent.</p><button class="btn btn-ghost btn-sm" data-action="pdf" style="margin-top:10px">${icon('download')} Download PDF (Attendance_${isoDate(new Date())}_${a.lastSummary.no}.pdf)</button></div>` : ''}
  <div class="card"><h3>Session history</h3>${sessionsTable(allSessions())}</div>`;
};

V.roster = () => {
  const n = State.roster.length, sel = State.selected.size;
  return `${banner(4)}
  <div class="row between wrap"><p class="muted">${n} students. Roll numbers follow the list order.</p>
    <div class="row wrap"><button class="btn btn-ghost" data-action="import">${icon('upload')} Import CSV / Excel</button><button class="btn btn-primary" data-action="add-student">${icon('plus')} Add student</button></div></div>
  <div class="card">${n ? `<div class="row between wrap" style="margin-bottom:12px"><label class="row small"><input type="checkbox" data-change="roster-all" ${sel === n ? 'checked' : ''}> Select all</label>
    <button class="btn btn-danger btn-sm" data-action="delete-selected" ${sel ? '' : 'disabled'}>${icon('trash')} Delete selected (${sel})</button></div>
    <div class="tablewrap"><table><thead><tr><th></th><th>Roll</th><th>Name</th></tr></thead><tbody>${State.roster.map((s, i) => `<tr><td><input type="checkbox" data-change="roster-check" data-id="${s.id}" ${State.selected.has(s.id) ? 'checked' : ''} aria-label="Select ${esc(s.name)}"></td><td>${i + 1}</td><td>${esc(s.name)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('users', 'Roster is empty', 'Add students manually or import a spreadsheet.')}</div>`;
};

V.requests = () => {
  const role = State.role;
  const list = State.requests.map(r => `<div class="item" style="align-items:flex-start"><div class="grow"><div class="row between wrap"><b>${esc(r.title)}</b><span class="chip ${chipFor(r.status)}">${r.status}</span></div>
    <div class="muted small">${esc(r.cls)} · ${r.when}</div><p style="margin-top:8px">${esc(r.body)}</p>
    ${r.response ? `<div class="notice info" style="margin-top:8px"><b class="small">Faculty response:</b> ${esc(r.response)}</div>` : ''}
    ${role === 'faculty' && r.status === 'Pending' ? `<div class="row" style="margin-top:10px"><button class="btn btn-ok btn-sm" data-action="req-approve" data-id="${r.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="req-reject" data-id="${r.id}">Reject</button></div>` : ''}
  </div></div>`).join('');
  const note = role === 'cr' ? '<div class="notice">Class Representatives can read requests but cannot approve or reject them.</div>'
    : role === 'faculty' ? '<div class="notice">Approving a request never changes attendance records by itself.</div>' : '';
  return `${banner(7)}${note}
  ${role === 'student' ? `<div class="row between wrap"><p class="muted">Write to your faculty and track the answer here.</p><button class="btn btn-primary" data-action="new-request">${icon('plus')} New request</button></div>` : ''}
  <div class="card"><h3>${role === 'student' ? 'My requests' : 'Student requests'}</h3>${State.requests.length ? `<div class="list">${list}</div>` : emptyState('inbox', 'No requests', role === 'student' ? 'Requests you send will be tracked here.' : 'Nothing to review right now.')}</div>
  ${role === 'faculty' ? `<div class="card"><h3>Join requests</h3>${joinRequestList(true)}</div>` : role === 'cr' ? `<div class="card"><h3>Join requests (view only)</h3>${joinRequestList(false)}</div>` : ''}`;
};

V.chat = () => {
  if (!D().rooms.length) return `${banner(8)}<div class="card">${emptyState('chat', 'No chats yet', 'Class group chats appear here once you belong to a class.')}</div>`;
  const room = D().rooms.find(r => r.id === State.room) || D().rooms[0];
  return `${banner(8)}<div class="notice">Prototype: messages here stay on this screen. Real-time delivery with server-checked access arrives in Stage 8.</div>
  <div class="chat"><div class="card rooms"><h3>Class chats</h3><div class="list">${D().rooms.map(r => `<div class="item ${r.id === room.id ? 'active' : ''}" data-action="room" data-id="${r.id}"><span class="grow small"><b>${esc(r.name)}</b></span>${r.unread && r.id !== room.id ? `<span class="unread">${r.unread}</span>` : ''}</div>`).join('')}</div></div>
  <div class="card" style="display:flex;flex-direction:column;gap:12px"><b>${esc(room.name)}</b>
    <div class="msgs" id="msgs">${State.messages.length ? State.messages.map(m => `<div class="msg ${m.me ? 'me' : ''}"><div class="who">${esc(m.me ? 'You' : m.who)}</div>${esc(m.text)}<time>${m.time}</time></div>`).join('') : emptyState('chat', 'No messages yet', 'Say hello to your class.')}</div>
    <form class="row" data-form="chat" autocomplete="off"><input class="input grow" name="msg" maxlength="500" placeholder="Write a message (max 500 characters)" aria-label="Message"><button class="btn btn-primary" type="submit" aria-label="Send">${icon('send')}</button></form></div></div>`;
};

V.audit = () => `${banner(9)}<div class="card"><h3>Audit history</h3><p class="muted small" style="margin-bottom:12px">Important actions are listed here. Ordinary users will never be able to edit or delete these entries.</p>
  ${D().audit.length ? `<div class="tablewrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Class</th><th>Action</th><th>Details</th></tr></thead><tbody>${D().audit.map(a => `<tr><td>${a.time}</td><td>${esc(a.actor)}</td><td>${esc(a.role)}</td><td>${a.cls}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('shield', 'No audit entries yet', 'Important actions will be recorded here once they exist.')}</div>`;

V.settings = () => {
  const m = me();
  if (State.demo) return `${banner()}<div class="card"><h3>Profile (demo)</h3><div class="row">${avatar(m, 60)}<div><b>${esc(m.name)}</b><div class="muted small">${esc(m.email)}</div><span class="chip blue">${esc(m.roleLabel)}</span></div></div></div>
  <div class="card"><button class="btn btn-danger" data-action="logout">${icon('logout')} Exit demo</button></div>`;
  const roles = allowedRoles();
  return `${banner()}<div class="card"><h3>Profile</h3><div class="row">${avatar(m, 60)}
    <div><b>${esc(m.name)}</b><div class="muted small">${esc(m.email)}</div>${roles.map(r => `<span class="chip blue" style="margin-right:6px">${ROLE_LABEL[r]}</span>`).join('')}</div></div>${uidBlock()}</div>
  <div class="card"><h3>Access</h3><p class="muted small" style="margin-bottom:12px">Staff roles are assigned by an administrator. Everyone who signs in can use the Student dashboard.</p>
    <div class="row wrap">${roles.map(r => `<a class="btn ${r === State.role ? 'btn-primary' : 'btn-ghost'} btn-sm" href="#/app/${r}/dashboard">${ROLE_LABEL[r]} dashboard</a>`).join('')}</div></div>
  <div class="card"><h3>Account</h3><p class="muted small" style="margin-bottom:12px">Signed in with Google. Your session is remembered on this device until you sign out.</p>
    <button class="btn btn-danger" data-action="logout">${icon('logout')} Sign out</button></div>`;
};

function currentView() { return (V[State.view] || V.dashboard)(); }
