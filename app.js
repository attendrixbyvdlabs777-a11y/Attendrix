/* ATTENDRIX – app logic: routing, Firebase sign-in, actions, dialogs */
const app = $('#app');
const B = window.AttendrixBackend;

const parseRoute = () => (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
const replaceHash = h => location.replace(h);
function setView(role, view) { State.role = role; State.view = NAV[role].some(n => n[0] === view) ? view : 'dashboard'; }

/* ---------- startup safety ---------- */
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('hide'); setTimeout(() => { sp.style.display = 'none'; }, 700); }
}
const plainEsc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Self-contained error screen. Uses no other app code, so it still works if views.js failed. */
function showFatal(title, err) {
  hideSplash();
  const detail = err ? String(err && err.message ? err.message : err) : '';
  const extra = (window.__startupErrors || []).slice(0, 3).map(plainEsc).join('<br>');
  app.innerHTML = '<div class="auth-wrap"><div class="auth-card" style="text-align:center">' +
    '<h2>' + plainEsc(title) + '</h2>' +
    '<p class="muted small">Reload the page. If this keeps happening, check that every file is uploaded next to index.html.</p>' +
    (detail || extra ? '<div class="notice bad" role="alert" style="text-align:left;margin-top:12px;word-break:break-word"><b class="small">Technical detail:</b> ' + plainEsc(detail) + (extra ? '<br>' + extra : '') + '</div>' : '') +
    '<div class="stack" style="margin-top:18px"><button class="btn btn-primary btn-block" onclick="location.reload()">Reload page</button></div>' +
    '</div></div>';
}

/* Resolves with `fallback` if `promise` has not settled after `ms`. Never rejects. */
function withTimeout(promise, ms, fallback) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/* Honest status line on the public pages when Firebase did not start. */
function initBanner() {
  const a = State.auth;
  if (a.status !== 'failed' && a.status !== 'unconfigured') return '';
  return '<div class="container" style="padding-top:12px"><div class="notice bad" role="alert"><b>Firebase is not connected.</b> ' + plainEsc(a.error || 'Sign-in is unavailable.') + '</div></div>';
}

/* Any draw error shows a readable message instead of a blank or stuck page. */
function render() {
  try { renderRoute(); }
  catch (e) { console.error('Render failed', e); showFatal('Attendrix could not draw this page.', e); }
}

/* One function decides what is on screen, from the URL and the sign-in state. */
function renderRoute() {
  const p = parseRoute(), a = State.auth;

  // Demo: sample data, no sign-in, clearly labelled.
  if (p[0] === 'demo' && NAV[p[1]]) {
    if (!State.demo) { State.demo = true; loadData(true); }
    setView(p[1], p[2]);
    app.innerHTML = shell(currentView());
    return;
  }
  if (State.demo) { State.demo = false; loadData(false); }

  if (p[0] === 'login' && (p[1] === 'faculty' || p[1] === 'student')) {
    if (a.status === 'signedIn') {
      const target = p[1] === 'student' ? 'student' : firstStaffRole();
      if (target) return replaceHash(`#/app/${target}/dashboard`);
      app.innerHTML = deniedView('faculty');
      return;
    }
    app.innerHTML = loginView(p[1]);
    return;
  }

  if (p[0] === 'app') {
    if (a.status === 'loading') { app.innerHTML = loadingView('Checking your sign-in…'); return; }
    if (a.status !== 'signedIn') return replaceHash('#/login/' + (p[1] === 'student' ? 'student' : 'faculty'));
    // UX guard only. Real protection is Firestore rules + server checks (later stages).
    if (!NAV[p[1]] || !allowedRoles().includes(p[1])) { app.innerHTML = deniedView(p[1]); return; }
    setView(p[1], p[2]);
    State.classOpen = (p[1] === 'faculty' && p[2] === 'classes' && p[3]) ? p[3] : null;
    if (p[1] === 'faculty') ensureClasses();
    app.innerHTML = shell(currentView());
    return;
  }

  app.innerHTML = initBanner() + landingView();
}

/* Re-render and keep scroll position and chat scroll. */
function refresh() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight;
}

function go(view) {
  State.notifOpen = false;
  const target = `${base()}${State.role}/${view}`;
  if (location.hash === target) return refresh();
  location.hash = target;
}

window.addEventListener('hashchange', () => {
  const r = parseRoute()[0];
  State.selected.clear(); State.notifOpen = false; State.authError = null;
  if (r === 'app' || r === 'demo') {
    State.loading = true; render();
    clearTimeout(window.__lt);
    window.__lt = setTimeout(() => { State.loading = false; refresh(); }, 220);
  } else { State.loading = false; render(); window.scrollTo(0, 0); }
});

/* ---------- Firebase auth state ---------- */
let authSeq = 0, resolveAuthReady;
const authReady = new Promise(r => { resolveAuthReady = r; });

async function onUser(user, err) {
  const seq = ++authSeq;
  // Never show one account's classes to another: clear everything on every sign-in / sign-out.
  // (Demo mode keeps its own sample classes; leaving demo reloads empty data anyway.)
  if (!State.demo) { State.classes = []; State.cls = { status: 'idle', error: null }; State.classOpen = null; }
  if (!user) {
    State.auth = { status: 'signedOut', user: null, roles: [], warning: null, error: err ? err.message : null };
    if (err) State.authError = err.message;
    resolveAuthReady(); render(); return;
  }
  State.auth = { status: 'loading', user: null, roles: [], warning: null, error: null };
  render();
  // Roles come from Firestore (read-only for users). The profile write is separate.
  const [rolesRes, profRes] = await Promise.allSettled([B.loadRoles(user.uid), B.syncProfile(user)]);
  if (seq !== authSeq) return; // a newer sign-in/out superseded this one
  const warnings = [];
  let roles = [];
  if (rolesRes.status === 'fulfilled') roles = rolesRes.value;
  else warnings.push('Could not load your role information, so you have Student access only. ' + rolesRes.reason.message);
  if (profRes.status === 'rejected' && !warnings.some(w => w.includes(profRes.reason.message))) warnings.push('Could not save your profile. ' + profRes.reason.message);
  // No staff role found: look at the roles document so the screen can say why.
  let diag = null;
  if (rolesRes.status === 'fulfilled' && roles.length === 0) {
    diag = await withTimeout(B.inspectRoles(user.uid), 6000, null);
    if (seq !== authSeq) return;
  }
  State.auth = {
    status: 'signedIn', roles, diag, error: null, warning: warnings.join(' ') || null,
    user: { uid: user.uid, displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || null }
  };
  resolveAuthReady(); render();
}

async function doSignIn() {
  if (State.busy || !B) return;
  State.busy = true; State.authError = null; refresh();
  try { await B.signIn(); }
  catch (e) { State.authError = e.cancelled ? 'Sign-in was cancelled. Tap the button to try again.' : e.message; }
  finally { State.busy = false; refresh(); }
}

async function doSignOut() {
  if (State.demo) { location.hash = '#/'; return; }
  try { await B.signOut(); location.hash = '#/'; toast('You have been signed out.', 'info'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------- field helpers ---------- */
const val = id => ($('#' + id) || { value: '' }).value.trim();
function setErr(id, msg) {
  const i = $('#' + id), e = $('#e-' + id);
  if (i) i.classList.toggle('err', !!msg);
  if (e) e.textContent = msg || '';
  return !!msg;
}
const field = (id, label, extra = '') => `<div style="margin-bottom:12px"><label class="f" for="${id}">${label}</label>${extra}<div class="errtext" id="e-${id}"></div></div>`;
const inputHtml = (id, attrs = '') => `<input class="input" id="${id}" ${attrs}>`;

/* ---------- dialogs ---------- */
function newClassDialog(existing) {
  const code = existing ? existing.code : String(Math.floor(100000 + Math.random() * 900000));
  openModal({
    title: existing ? 'Edit class' : 'New class',
    body: field('f-name', 'Class name', inputHtml('f-name', `maxlength="60" value="${existing ? esc(existing.name) : ''}" placeholder="e.g. BCA Cybersecurity – Sem 1"`)) +
      (existing ? '' : field('f-pass', 'Class password (at least 6 characters)', inputHtml('f-pass', 'type="password" autocomplete="new-password" maxlength="40"'))) +
      `<div class="notice">Join code: <b>${code}</b>. ${existing ? 'The code stays the same.' : 'In the real app, the code and password are created and checked on the server. This password is not stored anywhere in preview mode.'}</div>`,
    actions: [{ label: 'Cancel' }, {
      label: existing ? 'Save' : 'Create class', cls: 'btn-primary', onClick() {
        const name = val('f-name'); let bad = false;
        bad = setErr('f-name', name.length < 3 ? 'Enter a class name (3+ characters).' : '') || bad;
        if (!existing) bad = setErr('f-pass', val('f-pass').length < 6 ? 'Password must be at least 6 characters.' : '') || bad;
        if (bad) return false;
        if (existing) { existing.name = name; toast('Class updated (demo only).'); }
        else { State.classes.push({ id: 'c' + Date.now(), name, code, students: 0, att: 0, archived: false }); toast('Class created (demo only).'); }
        refresh();
      }
    }]
  });
}

function reviewDialog(kind, id) {
  const r = State.requests.find(x => x.id === id), approve = kind === 'approve';
  openModal({
    title: (approve ? 'Approve' : 'Reject') + ' request',
    body: `<p class="muted small" style="margin-bottom:12px">${esc(r.title)}</p>` + field('f-resp', 'Response to the student (optional)', `<textarea class="input" id="f-resp" maxlength="300"></textarea>`) +
      (approve ? '<div class="notice">Approving does not change any attendance record automatically.</div>' : ''),
    actions: [{ label: 'Cancel' }, {
      label: approve ? 'Approve' : 'Reject', cls: approve ? 'btn-ok' : 'btn-danger', onClick() {
        r.status = approve ? 'Approved' : 'Rejected'; r.response = val('f-resp');
        toast('Request ' + r.status.toLowerCase() + ' (demo only).', approve ? 'ok' : 'info'); refresh();
      }
    }]
  });
}

function finalizeDialog() {
  const a = State.att, total = State.roster.length;
  const p = State.roster.filter(s => a.marks[s.id] === 'P').length, ab = State.roster.filter(s => a.marks[s.id] === 'A').length, un = total - p - ab;
  openModal({
    title: 'Finalize attendance?',
    body: `<div class="counts" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px"><div><b>${total}</b><span class="muted small">Total students</span></div><div><b style="color:var(--ok)">${p}</b><span class="muted small">Present</span></div><div><b style="color:var(--bad)">${ab}</b><span class="muted small">Absent</span></div><div><b style="color:var(--warn)">${un}</b><span class="muted small">Unmarked</span></div></div>` +
      (un ? `<div class="notice"><b>${un}</b> student${un > 1 ? 's are' : ' is'} still unmarked. If you confirm, ${un > 1 ? 'they' : 'this student'} will automatically be marked <b>Present</b>.</div>` : '<p class="muted small">Everyone is marked. Confirm to save this session.</p>'),
    actions: [{ label: 'Go back' }, {
      label: 'Confirm and finalize', cls: 'btn-primary', onClick() {
        State.roster.forEach(s => { if (!a.marks[s.id]) a.marks[s.id] = 'P'; });
        const P = State.roster.filter(s => a.marks[s.id] === 'P').length, A = State.roster.length - P;
        const cls = State.classes.find(c => c.id === a.classId) || State.classes[0];
        State.history.unshift({ date: isoDate(new Date()), no: a.sessionNo, cls: cls.name, present: P, absent: A });
        a.lastSummary = { no: a.sessionNo, p: P, a: A };
        a.sessionNo++; a.marks = {};
        toast('Session finalized (demo only, not saved).'); refresh();
      }
    }]
  });
}

function addStudentDialog() {
  openModal({
    title: 'Add student', body: field('f-sname', 'Student name', inputHtml('f-sname', 'maxlength="60" autocomplete="off"')),
    actions: [{ label: 'Cancel' }, {
      label: 'Add', cls: 'btn-primary', onClick() {
        const n = val('f-sname').replace(/\s+/g, ' ');
        if (setErr('f-sname', !n ? 'Name cannot be blank.' : State.roster.some(s => s.name.toLowerCase() === n.toLowerCase()) ? 'This name is already in the roster.' : '')) return false;
        State.roster.push({ id: 's' + Date.now(), name: n }); toast('Student added as roll ' + State.roster.length + '.'); refresh();
      }
    }]
  });
}

function deleteDialog() {
  const n = State.selected.size;
  openModal({
    title: `Delete ${n} student${n > 1 ? 's' : ''}?`,
    body: `<p class="muted">Roll numbers will be renumbered without gaps. In the real app, past attendance records keep the original names and roll numbers.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Delete', cls: 'btn-danger', onClick() {
        State.roster = State.roster.filter(s => !State.selected.has(s.id));
        State.selected.clear(); toast(`Deleted ${n} student${n > 1 ? 's' : ''}. Rolls renumbered.`); refresh();
      }
    }]
  });
}

function joinClassDialog() {
  openModal({
    title: 'Join a class',
    body: field('f-code', 'Six-digit join code', inputHtml('f-code', 'inputmode="numeric" maxlength="6" autocomplete="off" placeholder="123456"')) +
      field('f-jpass', 'Class password', inputHtml('f-jpass', 'type="password" autocomplete="off" maxlength="40"')) +
      '<div class="notice">Demo only: no code or password is checked yet. Real checking happens on the server in Stage 3.</div>',
    actions: [{ label: 'Cancel' }, {
      label: 'Send request', cls: 'btn-primary', onClick() {
        let bad = setErr('f-code', /^\d{6}$/.test(val('f-code')) ? '' : 'Enter exactly 6 digits.');
        bad = setErr('f-jpass', val('f-jpass') ? '' : 'Enter the class password.') || bad;
        if (bad) return false;
        State.myJoin.unshift({ cls: 'Class ' + val('f-code'), status: 'Pending', when: isoDate(new Date()) });
        toast('Join request sent (demo only).'); refresh();
      }
    }]
  });
}

function newRequestDialog() {
  openModal({
    title: 'New request',
    body: field('f-rt', 'Title', inputHtml('f-rt', 'maxlength="80"')) +
      field('f-rc', 'Related class', `<select class="input" id="f-rc">${State.classes.map(c => `<option>${esc(c.name)}</option>`).join('')}</select>`) +
      field('f-rb', 'Description (at least 20 characters)', `<textarea class="input" id="f-rb" maxlength="1000"></textarea>`),
    actions: [{ label: 'Cancel' }, {
      label: 'Submit', cls: 'btn-primary', onClick() {
        let bad = setErr('f-rt', val('f-rt').length < 4 ? 'Add a short title.' : '');
        bad = setErr('f-rb', val('f-rb').length < 20 ? 'Please write at least 20 characters.' : '') || bad;
        if (bad) return false;
        State.requests.unshift({ id: 'r' + Date.now(), title: val('f-rt'), body: val('f-rb'), cls: val('f-rc'), status: 'Pending', when: isoDate(new Date()), response: '' });
        toast('Request submitted (demo only).'); refresh();
      }
    }]
  });
}

function announceDialog() {
  openModal({
    title: 'New announcement',
    body: field('f-at', 'Title', inputHtml('f-at', 'maxlength="80"')) + field('f-ab', 'Message', `<textarea class="input" id="f-ab" maxlength="500"></textarea>`),
    actions: [{ label: 'Cancel' }, {
      label: 'Post', cls: 'btn-primary', onClick() {
        let bad = setErr('f-at', val('f-at').length < 3 ? 'Add a title.' : '');
        bad = setErr('f-ab', val('f-ab').length < 5 ? 'Write a message.' : '') || bad;
        if (bad) return false;
        State.announcements.unshift({ title: val('f-at'), body: val('f-ab'), when: isoDate(new Date()) }); toast('Announcement posted (demo only).'); refresh();
      }
    }]
  });
}

function importDialog() {
  openModal({
    title: 'Import students',
    body: `<div class="notice">Spreadsheet import (CSV and Excel, with preview, column choice and duplicate checks) is built in Stage 4. It is not available yet.</div>`,
    actions: [{ label: 'Got it', cls: 'btn-primary' }]
  });
}

/* ---------- Phase 3: classes (real mode) ---------- */
let modalLocked = false, opBusy = false;

/* Loads the signed-in faculty member's classes. Quiet: it does not blank the page. */
async function fetchClasses() {
  const uid = State.auth.user && State.auth.user.uid;
  if (!uid || !B) return;
  try {
    const list = await B.listClasses();
    if (!State.auth.user || State.auth.user.uid !== uid) return; // signed out or switched account meanwhile
    State.classes = list; State.cls = { status: 'ready', error: null };
  } catch (e) {
    if (!State.auth.user || State.auth.user.uid !== uid) return;
    let msg = e.message;
    // A refusal is either "new rules not published" or "roles document is not exactly right". Show what the roles document holds.
    if (e && e.code === 'permission-denied') {
      const d = await withTimeout(B.inspectRoles(uid), 6000, null);
      if (!State.auth.user || State.auth.user.uid !== uid) return;
      if (d) msg += d.exists
        ? ` What your roles document holds right now: field "roles" is of type ${d.type}, value ${d.valueText || '(empty)'}. It must be type array with value ["faculty"]. If it already is, the new rules are not published yet.`
        : ` There is no document at roles/${uid}.`;
    }
    State.cls = { status: 'error', error: msg };
  }
  refresh();
}
function ensureClasses() {
  if (State.demo || State.cls.status !== 'idle') return;
  State.cls = { status: 'loading', error: null };
  fetchClasses();
}

function setModalBusy(on, label) {
  const b = $('[data-modal-btn="1"]'); if (!b) return;
  if (on) { b.dataset.label = b.textContent; b.disabled = true; if (label) b.textContent = label; }
  else { b.disabled = false; if (b.dataset.label) b.textContent = b.dataset.label; }
}
function showFormErr(msg) { const el = $('#f-formerr'); if (el) el.innerHTML = '<div class="notice bad" role="alert" style="margin-bottom:12px">' + plainEsc(msg) + '</div>'; }

/* Runs an async step from a dialog button: blocks double-taps, shows errors inside the dialog. */
async function runDialog(run, done, busyLabel) {
  if (opBusy) return;
  opBusy = true; setModalBusy(true, busyLabel); showFormErr('');
  try { const r = await run(); closeModal(); if (done) await done(r); }
  catch (e) { showFormErr(e && e.message ? e.message : 'Something went wrong. Please try again.'); setModalBusy(false); }
  finally { opBusy = false; }
}

/* Shown once after a class is created or its password is reset. The dialog cannot be dismissed by accident. */
function secretDialog(o) {
  modalLocked = true;
  const big = 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:1.3rem;letter-spacing:.1em;font-weight:700;word-break:break-all;margin-top:4px';
  openModal({
    title: o.title,
    body: (o.name ? `<p class="muted small" style="margin-bottom:12px">${esc(o.name)}</p>` : '') +
      (o.code ? `<div class="muted small">Join code</div><div style="${big}">${esc(codeFmt(o.code))}</div>` : '') +
      `<div class="muted small" style="margin-top:12px">Enrollment password</div><div style="${big}" id="secret-pass">${esc(o.password)}</div>
      <div class="row wrap" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-action="copy-text" data-text="${esc(o.password)}" data-what="Password">Copy password</button>${o.code ? `<button class="btn btn-ghost btn-sm" data-action="copy-text" data-text="${esc(o.code)}" data-what="Join code">Copy code</button>` : ''}</div>
      <div class="notice" style="margin-top:14px"><b>Save this password now.</b> It is not stored anywhere and will not be shown again. If you lose it, use Reset password to make a new one.</div>`,
    actions: [{ label: 'I have saved it', cls: 'btn-primary', onClick() { modalLocked = false; } }]
  });
}

const ACADEMIC_YEAR = /^(\d{4})-(\d{2})$/;
function readClassForm() {
  const clean = id => val(id).replace(/\s+/g, ' ');
  const f = { name: clean('f-name'), course: clean('f-course'), department: clean('f-dept'), academicYear: clean('f-year'), semester: parseInt(val('f-sem'), 10), section: clean('f-sec'), subject: clean('f-subj') };
  const ym = ACADEMIC_YEAR.exec(f.academicYear);
  let bad = false;
  bad = setErr('f-name', f.name.length < 3 || f.name.length > 80 ? 'Enter a class name (3 to 80 characters).' : '') || bad;
  bad = setErr('f-course', !f.course || f.course.length > 60 ? 'Enter the course (up to 60 characters).' : '') || bad;
  bad = setErr('f-dept', !f.department || f.department.length > 60 ? 'Enter the department (up to 60 characters).' : '') || bad;
  bad = setErr('f-year', !ym || (+ym[1] + 1) % 100 !== +ym[2] ? 'Use the form 2025-26.' : '') || bad;
  bad = setErr('f-sem', !(f.semester >= 1 && f.semester <= 12) ? 'Choose a semester from 1 to 12.' : '') || bad;
  bad = setErr('f-sec', !f.section || f.section.length > 10 ? 'Enter a section (up to 10 characters).' : '') || bad;
  bad = setErr('f-subj', f.subject.length > 80 ? 'Subject can be up to 80 characters.' : '') || bad;
  return bad ? null : f;
}

function classFormDialog(existing) {
  const e = existing || {};
  const sem = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${Number(e.semester) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const txt = (id, max, v, ph, extra = '') => inputHtml(id, `maxlength="${max}" value="${esc(v || '')}" placeholder="${ph}" autocomplete="off" ${extra}`);
  openModal({
    title: existing ? 'Edit class' : 'New class',
    body: '<div id="f-formerr"></div>' +
      field('f-name', 'Class name', txt('f-name', 80, e.name, 'e.g. BCA Cybersecurity – Sem 1')) +
      field('f-course', 'Course', txt('f-course', 60, e.course, 'e.g. BCA')) +
      field('f-dept', 'Department', txt('f-dept', 60, e.department, 'e.g. Computer Science')) +
      field('f-year', 'Academic year', txt('f-year', 7, e.academicYear, '2025-26', 'inputmode="numeric"')) +
      field('f-sem', 'Semester', `<select class="input" id="f-sem">${sem}</select>`) +
      field('f-sec', 'Section', txt('f-sec', 10, e.section, 'e.g. A')) +
      field('f-subj', 'Subject (optional)', txt('f-subj', 80, e.subject, 'Leave blank for a whole-class register')) +
      (existing ? '' : '<div class="notice info">A join code and a random enrollment password are created for you. The password is shown once and is never stored.</div>'),
    actions: [{ label: 'Cancel' }, {
      label: existing ? 'Save' : 'Create class', cls: 'btn-primary',
      onClick() {
        const f = readClassForm(); if (!f) return false;
        if (existing) runDialog(() => B.updateClass(existing.id, f), async () => { toast('Class updated.'); await fetchClasses(); }, 'Saving…');
        else runDialog(() => B.createClass(f), async r => { secretDialog({ title: 'Class created', name: f.name, code: r.code, password: r.password }); await fetchClasses(); }, 'Creating…');
        return false;
      }
    }]
  });
}

function archiveClassDialog(c) {
  openModal({
    title: 'Archive this class?',
    body: `<div id="f-formerr"></div><p class="muted">“${esc(c.name)}” will move to the Archived list. Nothing is deleted, and you can restore it at any time.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Archive', cls: 'btn-danger',
      onClick() { runDialog(() => B.setClassStatus(c.id, 'archived'), async () => { toast('Class archived.', 'info'); await fetchClasses(); }, 'Archiving…'); return false; }
    }]
  });
}
async function restoreClass(c) {
  if (opBusy) return; opBusy = true;
  try { await B.setClassStatus(c.id, 'active'); toast('Class restored.'); await fetchClasses(); }
  catch (e) { toast(e.message, 'err'); }
  finally { opBusy = false; }
}
function resetPassDialog(c) {
  openModal({
    title: 'Reset enrollment password?',
    body: `<div id="f-formerr"></div><p class="muted">A new random password will be created for “${esc(c.name)}”. The old password stops working for new join requests. Students who are already enrolled are not affected.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Reset password', cls: 'btn-primary',
      onClick() { runDialog(() => B.resetClassPassword(c.id, c.codeKey), r => secretDialog({ title: 'New password', name: c.name, password: r.password }), 'Resetting…'); return false; }
    }]
  });
}
const classById = id => State.classes.find(c => c.id === id);

/* ---------- click actions ---------- */
/* Features that are not built yet. In real mode they say so instead of pretending to save. */
const STAGE_FOR = {
  'join-approve': 3, 'join-reject': 3, 'join-class': 3,
  'add-student': 4, import: 4, 'delete-selected': 4,
  mark: 5, 'mark-all': 5, finalize: 5, pdf: 6,
  'req-approve': 7, 'req-reject': 7, 'new-request': 7,
  'new-announcement': 8, room: 8
};
const notYet = n => toast(`Not available yet. This feature arrives in Stage ${n}.`, 'info');

const Actions = {
  'google-signin': doSignIn,
  nav: el => go(el.dataset.view),
  'copy-uid': async el => {
    try { await navigator.clipboard.writeText(el.dataset.uid); toast('UID copied.'); }
    catch (e) { toast('Could not copy. Press and hold the UID text to select it.', 'err'); }
  },
  logout: doSignOut,
  'toggle-notif': () => { State.notifOpen = !State.notifOpen; refresh(); },
  'modal-backdrop': (el, e) => { if (e.target === el && !modalLocked) closeModal(); },
  'copy-text': async el => {
    try { await navigator.clipboard.writeText(el.dataset.text); toast((el.dataset.what || 'Text') + ' copied.'); }
    catch (e) { toast('Could not copy. Press and hold the text to select it.', 'err'); }
  },
  'open-class': el => { location.hash = `${base()}faculty/classes/${el.dataset.id}`; },
  'reload-classes': () => { State.cls = { status: 'loading', error: null }; refresh(); fetchClasses(); },
  'reset-pass': el => { const c = classById(el.dataset.id); if (c) resetPassDialog(c); },
  'join-approve': el => { State.joinRequests.find(j => j.id === el.dataset.id).status = 'Approved'; toast('Join request approved (demo only).'); refresh(); },
  'join-reject': el => { State.joinRequests.find(j => j.id === el.dataset.id).status = 'Rejected'; toast('Join request rejected (demo only).', 'info'); refresh(); },
  'new-announcement': announceDialog,
  'new-class': () => State.demo ? newClassDialog() : classFormDialog(null),
  'edit-class': el => { const c = classById(el.dataset.id); if (!c) return; State.demo ? newClassDialog(c) : classFormDialog(c); },
  'archive-class': el => {
    const c = classById(el.dataset.id); if (!c) return;
    if (State.demo) { c.archived = true; toast('Class archived (demo only).', 'info'); refresh(); } else archiveClassDialog(c);
  },
  'restore-class': el => {
    const c = classById(el.dataset.id); if (!c) return;
    if (State.demo) { c.archived = false; toast('Class restored.'); refresh(); } else restoreClass(c);
  },
  'join-class': joinClassDialog,
  mark: el => { const m = State.att.marks; m[el.dataset.id] = m[el.dataset.id] === el.dataset.v ? undefined : el.dataset.v; refresh(); },
  'mark-all': () => { State.roster.forEach(s => State.att.marks[s.id] = 'P'); refresh(); },
  finalize: finalizeDialog,
  pdf: () => toast('PDF reports are built in Stage 6. Not available yet.', 'info'),
  'add-student': addStudentDialog,
  import: importDialog,
  'delete-selected': () => State.selected.size && deleteDialog(),
  'req-approve': el => reviewDialog('approve', el.dataset.id),
  'req-reject': el => reviewDialog('reject', el.dataset.id),
  'new-request': newRequestDialog,
  room: el => { State.room = el.dataset.id; refresh(); }
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (t && Actions[t.dataset.action]) {
    const stage = STAGE_FOR[t.dataset.action];
    if (!State.demo && stage) return notYet(stage);
    Actions[t.dataset.action](t, e);
  } else if (State.notifOpen && !e.target.closest('.notif-panel')) { State.notifOpen = false; refresh(); }
});

const Changes = {
  'att-class': el => { State.att.classId = el.value; State.att.marks = {}; refresh(); },
  'roster-all': el => { State.selected = el.checked ? new Set(State.roster.map(s => s.id)) : new Set(); refresh(); },
  'roster-check': el => { el.checked ? State.selected.add(el.dataset.id) : State.selected.delete(el.dataset.id); refresh(); }
};
document.addEventListener('change', e => {
  const t = e.target.closest('[data-change]');
  if (t && Changes[t.dataset.change] && State.demo) Changes[t.dataset.change](t);
});

document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form="chat"]'); if (!f) return;
  e.preventDefault();
  if (!State.demo) return notYet(8);
  const text = f.msg.value.trim();
  if (!text) return toast('Type a message first.', 'err');
  if (text.length > 500) return toast('Messages can be up to 500 characters.', 'err');
  const now = new Date();
  State.messages.push({ who: me().name, me: true, text, time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()) });
  refresh(); const i = $('input[name=msg]'); if (i) i.focus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalLocked) closeModal(); });

/* ---------- start ---------- */
/* Rules: (1) the splash never stays longer than 7 seconds, whatever Firebase does;
   (2) every step is guarded so an exception becomes a readable message;
   (3) Firebase is only reported as working after it has really started. */
window.addEventListener('error', e => { if (!app.children.length) showFatal('Attendrix hit an error while starting.', e.error || e.message); });
window.addEventListener('unhandledrejection', e => { if (!app.children.length) showFatal('Attendrix hit an error while starting.', e.reason); });

(async function start() {
  setTimeout(hideSplash, 7000);
  try {
    render(); // draw straight away; render() is guarded, so a drawing error cannot stall startup
    let res;
    if (!B) res = { ok: false, reason: 'load-failed', message: 'The Firebase script (firebase.js) did not load. Check that it is uploaded next to index.html, then reload.' };
    else res = await withTimeout(B.init(), 15000, { ok: false, reason: 'timeout', message: 'Firebase took too long to load. Check your internet connection and reload the page.' });

    if (!res.ok) {
      State.auth = { status: res.reason === 'unconfigured' ? 'unconfigured' : 'failed', user: null, roles: [], warning: null, error: res.message };
      resolveAuthReady(); render();
    } else {
      if (res.redirectError) State.authError = res.redirectError;
      B.onAuth(onUser);
      // If Firebase never reports a sign-in state, stop waiting and say so.
      setTimeout(() => {
        if (authSeq === 0) {
          State.auth = { status: 'failed', user: null, roles: [], warning: null, error: 'Firebase did not report your sign-in state in time. Check your internet connection and reload the page.' };
          resolveAuthReady(); render();
        }
      }, 12000);
    }
  } catch (e) {
    console.error('Startup failed', e);
    State.auth = { status: 'failed', user: null, roles: [], warning: null, error: 'Startup error: ' + (e && e.message ? e.message : e) };
    resolveAuthReady();
    showFatal('Attendrix hit an error while starting.', e);
  }
  // Normal path: keep the splash for at least 1.6s, then hide once the sign-in state is known.
  Promise.all([new Promise(r => setTimeout(r, 1600)), authReady]).then(hideSplash);
})();
