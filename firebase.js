/* ATTENDRIX – Firebase module (Web SDK v10, modular, loaded from Google's CDN)
 *
 * Why this is firebase.js and not firebase.ts: browsers cannot run TypeScript
 * directly, and a .ts file needs a build step (Node, npm, a bundler). This
 * project deliberately has no build step so it can be edited and deployed from
 * a phone. This file plays the role of firebase.ts.
 *
 * Exposes one global, window.AttendrixBackend. The rest of the app never
 * touches the Firebase SDK directly.
 */
(function () {
  const SDK_VERSION = '10.14.1';
  const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
  const ALLOWED_STAFF_ROLES = ['faculty', 'cr'];

  let fb = null;          // { auth, db, authM, fsM } once initialised
  let initPromise = null;

  function isConfigured() {
    const c = window.FIREBASE_CONFIG;
    return !!c && ['apiKey', 'authDomain', 'projectId', 'appId'].every(
      k => typeof c[k] === 'string' && c[k].trim() && !/PASTE|YOUR_/i.test(c[k])
    );
  }

  /* Turns raw Firebase errors into messages a beginner can act on. */
  function friendly(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/popup-closed-by-user': 'Sign-in was cancelled before it finished.',
      'auth/cancelled-popup-request': 'Sign-in was cancelled before it finished.',
      'auth/network-request-failed': 'Network problem. Check your internet connection and try again.',
      'auth/unauthorized-domain': 'This website address is not authorized in Firebase. In the Firebase console open Authentication > Settings > Authorized domains and add this site\'s domain.',
      'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project. Enable it under Authentication > Sign-in method.',
      'auth/operation-not-supported-in-this-environment': 'Sign-in only works when the site is opened from its https:// address, not from a downloaded file.',
      'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/web-storage-unsupported': 'Your browser is blocking site storage, so sign-in cannot be remembered. Allow cookies and site data for this site, or leave private browsing mode.',
      'auth/internal-error': 'Firebase reported an internal error. Please try again.',
      'auth/invalid-api-key': 'The Firebase API key in js/firebase-config.js is not valid.',
      'auth/configuration-not-found': 'Authentication is not set up for this Firebase project yet.',
      'permission-denied': 'Firestore refused the request. Publish the rules from firestore.rules in the Firebase console (Firestore Database > Rules).',
      'unavailable': 'Could not reach the database. Check your internet connection.',
      'failed-precondition': 'The database is not ready yet. Check that Firestore is created in this project.'
    };
    return map[code] || 'Something went wrong' + (code ? ' (' + code + ')' : '') + '. Please try again.';
  }
  function wrap(e) {
    const err = new Error(friendly(e));
    err.code = (e && e.code) || 'unknown';
    err.cancelled = err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request';
    return err;
  }

  /* Loads the SDK and starts Firebase. Safe to call many times. Never throws;
     resolves { ok:true } or { ok:false, reason, message }. */
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!isConfigured()) {
        return { ok: false, reason: 'unconfigured', message: 'Firebase is not configured yet. Add your web config to js/firebase-config.js.' };
      }
      try {
        const [appM, authM, fsM] = await Promise.all([
          import(CDN + 'firebase-app.js'),
          import(CDN + 'firebase-auth.js'),
          import(CDN + 'firebase-firestore.js')
        ]);
        const app = appM.initializeApp(window.FIREBASE_CONFIG);
        const auth = authM.getAuth(app);
        // Keep the user signed in across tab closes and browser restarts.
        await authM.setPersistence(auth, authM.browserLocalPersistence);
        const db = fsM.getFirestore(app);
        fb = { auth, db, authM, fsM };

        // If sign-in used the redirect fallback, finish it and surface any error.
        let redirectError = null;
        try { await authM.getRedirectResult(auth); } catch (e) { redirectError = wrap(e); }
        return { ok: true, redirectError: redirectError ? redirectError.message : null };
      } catch (e) {
        console.error('Firebase failed to start', e);
        const code = e && e.code;
        return {
          ok: false, reason: 'load-failed',
          message: code === 'auth/web-storage-unsupported' ? friendly(e)
            : 'Could not load Firebase. Check your internet connection and reload the page.'
        };
      }
    })();
    return initPromise;
  }

  /* cb(user | null, error?) – fires on load, sign-in and sign-out. Returns unsubscribe. */
  function onAuth(cb) {
    return fb.authM.onAuthStateChanged(fb.auth, u => cb(u, null), err => cb(null, wrap(err)));
  }

  async function signIn() {
    const { auth, authM } = fb;
    const provider = new authM.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await authM.signInWithPopup(auth, provider);
    } catch (e) {
      // Some phone browsers block popups; fall back to a full-page redirect.
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        try { await authM.signInWithRedirect(auth, provider); return; } catch (e2) { throw wrap(e2); }
      }
      throw wrap(e);
    }
  }

  async function signOut() {
    try { await fb.authM.signOut(fb.auth); } catch (e) { throw wrap(e); }
  }

  /* Creates or refreshes the signed-in user's OWN profile document.
     Writes only the fields firestore.rules allows. Never writes a role. */
  async function syncProfile(user) {
    const { db, fsM } = fb;
    const ref = fsM.doc(db, 'users', user.uid);
    try {
      const snap = await fsM.getDoc(ref);
      const fields = {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || null,
        lastLoginAt: fsM.serverTimestamp()
      };
      if (snap.exists()) await fsM.updateDoc(ref, fields);
      else await fsM.setDoc(ref, { ...fields, createdAt: fsM.serverTimestamp() });
    } catch (e) { throw wrap(e); }
  }

  /* Reads roles/{uid}. That document can only be created by an administrator
     (from the Firebase console); the rules forbid every browser write to it.
     Returns a subset of ['faculty','cr']. "student" is implicit for everyone. */
  async function loadRoles(uid) {
    const { db, fsM } = fb;
    try {
      const snap = await fsM.getDoc(fsM.doc(db, 'roles', uid));
      if (!snap.exists()) return [];
      const r = snap.data().roles;
      // Tolerates common console slips: a single text value, capital letters, stray spaces.
      // Safe because only an administrator can write this document.
      const list = Array.isArray(r) ? r : (typeof r === 'string' ? r.split(',') : []);
      const clean = list.map(x => String(x).trim().toLowerCase());
      return [...new Set(clean)].filter(x => ALLOWED_STAFF_ROLES.includes(x));
    } catch (e) { throw wrap(e); }
  }

  /* Describes what roles/{uid} contains, so the screen can explain why access was not granted.
     Only ever reads the signed-in user's own document. */
  async function inspectRoles(uid) {
    const { db, fsM } = fb;
    try {
      const snap = await fsM.getDoc(fsM.doc(db, 'roles', uid));
      if (!snap.exists()) return { exists: false };
      const v = snap.data().roles;
      let text = '';
      try { text = JSON.stringify(v); } catch (e) { text = ''; }
      return {
        exists: true,
        type: v === undefined ? 'missing' : Array.isArray(v) ? 'array' : typeof v,
        valueText: String(text === undefined ? '' : text).slice(0, 80)
      };
    } catch (e) { throw wrap(e); }
  }

  /* ================= Phase 3: classes =================
     Enrollment password design (no server is available on the free plan):
       - The app generates the password (12 random characters, ~60 bits). It is shown once and never stored.
       - Only PBKDF2-SHA256(password, salt) is stored, in classSecrets/{classId}, which no browser can read.
       - A student's browser will compute the same hash and send it as "proof"; the Firestore rules
         accept a join request only if the proof equals the stored hash (step 3b).
       - Limit: rules cannot count failed attempts, so there is no lockout. A long random
         password is the protection. */
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I, O, 0, 1
  const PBKDF2_ITER = 210000;

  function randomString(n) {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    let s = ''; for (const x of b) s += ALPHABET[x & 31]; // 256 is a multiple of 32, so no bias
    return s;
  }
  const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
  const normSecret = p => String(p).toUpperCase().replace(/[\s-]+/g, '');
  const groupPassword = p => p.match(/.{1,4}/g).join('-');

  async function derive(password, saltHex, iter) {
    if (!(window.crypto && crypto.subtle)) throw new Error('This browser cannot do secure hashing. Open the site from its https:// address in an up-to-date browser.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(normSecret(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: iter }, key, 256);
    return toHex(bits);
  }
  async function newSecret() {
    const password = randomString(12);
    const saltHex = toHex(crypto.getRandomValues(new Uint8Array(16)));
    return { password: groupPassword(password), saltHex, iter: PBKDF2_ITER, verifier: await derive(password, saltHex, PBKDF2_ITER) };
  }

  function meUid() {
    const u = fb && fb.auth && fb.auth.currentUser;
    if (!u) { const e = new Error('You are not signed in. Sign in again and retry.'); e.code = 'app/not-signed-in'; throw e; }
    return u.uid;
  }
  /* Class errors: a refused write usually means the rules are not published or the role is wrong. */
  function classErr(e) {
    if (e && e.code === 'permission-denied') {
      const err = new Error('Firestore refused this. Check that (1) the new rules are published, and (2) your roles document is exactly: field roles, type array, item "faculty" in lowercase.');
      err.code = 'permission-denied'; return err;
    }
    return e && e.code === 'app/not-signed-in' ? e : wrap(e);
  }
  function toClass(id, d) {
    const ms = d.createdAt && typeof d.createdAt.toMillis === 'function' ? d.createdAt.toMillis() : 0;
    return {
      id, name: d.name || '', course: d.course || '', department: d.department || '', academicYear: d.academicYear || '',
      semester: d.semester, section: d.section || '', subject: d.subject || '', codeKey: d.codeKey || '',
      status: d.status === 'archived' ? 'archived' : 'active', archived: d.status === 'archived',
      students: null, att: null, createdMs: ms
    };
  }
  const classFields = f => {
    const o = { name: f.name, course: f.course, department: f.department, academicYear: f.academicYear, semester: f.semester, section: f.section };
    if (f.subject) o.subject = f.subject;
    return o;
  };

  async function listClasses() {
    try {
      const uid = meUid(), { db, fsM } = fb;
      const snap = await fsM.getDocs(fsM.query(fsM.collection(db, 'classes'), fsM.where('ownerUid', '==', uid)));
      const out = []; snap.forEach(d => out.push(toClass(d.id, d.data())));
      out.sort((a, b) => b.createdMs - a.createdMs || a.name.localeCompare(b.name));
      backfillCodes(out, uid); // background, never blocks or fails the list
      return out;
    } catch (e) { throw classErr(e); }
  }
  /* Classes created before step 3b have a public lookup without className/ownerUid. Add them (owner only). */
  async function backfillCodes(list, uid) {
    const { db, fsM } = fb;
    await Promise.allSettled(list.slice(0, 40).map(async c => {
      const ref = fsM.doc(db, 'classCodes', c.codeKey), snap = await fsM.getDoc(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.className === c.name && d.ownerUid === uid) return;
      await fsM.updateDoc(ref, { className: c.name, ownerUid: uid });
    }));
  }

  /* Creates the class, its public code lookup and its hashed secret in ONE atomic batch.
     Returns the plain password ONCE; it is not stored anywhere. */
  async function createClass(fields) {
    const { db, fsM } = fb;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const uid = meUid();
        const code = randomString(8);
        const codeRef = fsM.doc(db, 'classCodes', code);
        if ((await fsM.getDoc(codeRef)).exists()) continue; // code already taken, pick another
        const classRef = fsM.doc(fsM.collection(db, 'classes'));
        const sec = await newSecret();
        const batch = fsM.writeBatch(db);
        batch.set(classRef, { ownerUid: uid, ...classFields(fields), status: 'active', codeKey: code, createdAt: fsM.serverTimestamp(), updatedAt: fsM.serverTimestamp() });
        batch.set(codeRef, { classId: classRef.id, ownerUid: uid, className: fields.name, salt: sec.saltHex, iter: sec.iter });
        batch.set(fsM.doc(db, 'classSecrets', classRef.id), { verifier: sec.verifier });
        await batch.commit();
        return { id: classRef.id, code, password: sec.password };
      } catch (e) { lastErr = e; if (!(e && e.code === 'permission-denied') || attempt === 2) break; }
    }
    throw lastErr ? classErr(lastErr) : new Error('Could not find a free class code. Please try again.');
  }

  /* `c` is the class being edited (needs id, codeKey, name). The public lookup keeps a copy of the class name,
     so it is updated in the SAME batch when the name changes. */
  async function updateClass(c, fields) {
    try {
      const { db, fsM } = fb; meUid();
      const data = { ...classFields(fields), updatedAt: fsM.serverTimestamp() };
      if (!fields.subject) data.subject = fsM.deleteField();
      const batch = fsM.writeBatch(db);
      batch.update(fsM.doc(db, 'classes', c.id), data);
      if (fields.name !== c.name) batch.update(fsM.doc(db, 'classCodes', c.codeKey), { className: fields.name });
      await batch.commit();
    } catch (e) { throw classErr(e); }
  }
  async function setClassStatus(id, status) {
    try {
      const { db, fsM } = fb; meUid();
      await fsM.updateDoc(fsM.doc(db, 'classes', id), { status, updatedAt: fsM.serverTimestamp() });
    } catch (e) { throw classErr(e); }
  }
  /* New random password with a new salt. The old password stops working for new join requests. */
  async function resetClassPassword(id, codeKey, className) {
    try {
      const { db, fsM } = fb; const uid = meUid();
      const sec = await newSecret();
      const batch = fsM.writeBatch(db);
      batch.update(fsM.doc(db, 'classCodes', codeKey), { salt: sec.saltHex, iter: sec.iter, className, ownerUid: uid });
      batch.update(fsM.doc(db, 'classSecrets', id), { verifier: sec.verifier });
      await batch.commit();
      return { password: sec.password };
    } catch (e) { throw classErr(e); }
  }

  /* ================= Phase 3b: joining and approving ================= */
  const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/, PASS_RE = /^[A-HJ-NP-Z2-9]{12}$/;
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const appErr = (msg, code) => { const e = new Error(msg); e.code = code || 'app/invalid'; return e; };
  const dateText = ts => { try { return ts && ts.toDate ? ts.toDate().toISOString().slice(0, 10) : ''; } catch (e) { return ''; } };
  const STATUS_TEXT = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', removed: 'Removed' };
  function joinErr(e) {
    if (e && e.code === 'permission-denied') {
      const err = new Error('Firestore refused this. Check that the latest firestore.rules is published in the Firebase console.');
      err.code = 'permission-denied'; return err;
    }
    return e && /^app\//.test(e.code || '') ? e : wrap(e);
  }
  const toRequest = (id, d) => ({
    id, classId: d.classId, studentUid: d.studentUid, ownerUid: d.ownerUid, cls: d.className || '', student: d.displayName || d.email || '',
    email: d.email || '', photoURL: d.photoURL || null, status: STATUS_TEXT[d.status] || 'Pending', raw: d.status, when: dateText(d.createdAt)
  });

  /* Student: ask to join a class. Returns { already: status } or { className }. */
  async function requestJoin(codeRaw, passRaw) {
    try {
      const { db, fsM } = fb, u = fb.auth.currentUser;
      if (!u) throw appErr('You are not signed in. Sign in again and retry.', 'app/not-signed-in');
      const code = normCode(codeRaw), pass = normSecret(passRaw);
      if (!CODE_RE.test(code)) throw appErr('The class code is 8 characters (letters and numbers).');
      if (!PASS_RE.test(pass)) throw appErr('The class password is 12 characters (letters and numbers), like ABCD-EFGH-JKLM.');
      let snap;
      try { snap = await fsM.getDoc(fsM.doc(db, 'classCodes', code)); }
      catch (e) { throw joinErr(e); }
      if (!snap.exists()) throw appErr('No class was found for that code. Check it and try again.', 'app/no-class');
      const c = snap.data();
      if (!c.className || !c.ownerUid || !c.salt) throw appErr('This class is not ready for join requests yet. Ask the faculty member to open the Classes page once, then try again.', 'app/not-ready');
      const reqRef = fsM.doc(db, 'joinRequests', c.classId + '_' + u.uid);
      let ex;
      try { ex = await fsM.getDoc(reqRef); } catch (e) { throw joinErr(e); }
      if (ex.exists()) return { already: ex.data().status, className: c.className };
      const proof = await derive(pass, c.salt, c.iter);
      try {
        await fsM.setDoc(reqRef, {
          classId: c.classId, ownerUid: c.ownerUid, studentUid: u.uid, className: c.className,
          displayName: u.displayName || u.email || 'Student', email: u.email || '', photoURL: u.photoURL || null,
          status: 'pending', proof, createdAt: fsM.serverTimestamp()
        });
      } catch (e) {
        if (e && e.code === 'permission-denied') throw appErr('The request was not accepted. The most likely reason is a wrong class password. It can also mean the class is archived, you are already enrolled, or the latest rules are not published.', 'permission-denied');
        throw joinErr(e);
      }
      return { className: c.className };
    } catch (e) { throw e && /^(app\/|permission-denied)/.test(e.code || '') ? e : joinErr(e); }
  }
  async function listMyRequests() {
    try {
      const { db, fsM } = fb, uid = meUid();
      const snap = await fsM.getDocs(fsM.query(fsM.collection(db, 'joinRequests'), fsM.where('studentUid', '==', uid)));
      const out = []; snap.forEach(d => out.push(toRequest(d.id, d.data())));
      for (const r of out) if (r.raw === 'approved') {
        try { const m = await fsM.getDoc(fsM.doc(db, 'classes', r.classId, 'members', uid)); if (m.exists() && m.data().removed === true) r.status = 'Removed'; } catch (e) { /* keep Approved */ }
      }
      return out.sort((a, b) => b.when.localeCompare(a.when));
    } catch (e) { throw joinErr(e); }
  }
  async function cancelRequest(id) {
    try { await fb.fsM.deleteDoc(fb.fsM.doc(fb.db, 'joinRequests', id)); } catch (e) { throw joinErr(e); }
  }
  /* Faculty: every pending request for the signed-in faculty member's classes. */
  async function listPendingRequests() {
    try {
      const { db, fsM } = fb, uid = meUid();
      const snap = await fsM.getDocs(fsM.query(fsM.collection(db, 'joinRequests'), fsM.where('ownerUid', '==', uid), fsM.where('status', '==', 'pending')));
      const out = []; snap.forEach(d => out.push(toRequest(d.id, d.data())));
      return out.sort((a, b) => a.when.localeCompare(b.when));
    } catch (e) { throw joinErr(e); }
  }
  /* Roster = joined students (members) + students added by hand. Removed ones come back flagged. */
  async function listMembers(classId) {
    try {
      const { db, fsM } = fb; meUid();
      const [a, b] = await Promise.all([fsM.getDocs(fsM.collection(db, 'classes', classId, 'members')), fsM.getDocs(fsM.collection(db, 'classes', classId, 'students'))]);
      const out = [];
      a.forEach(d => { const x = d.data(); out.push({ kind: 'member', id: d.id, uid: d.id, name: x.displayName || x.email || '', email: x.email || '', photoURL: x.photoURL || null, joined: dateText(x.joinedAt), removed: x.removed === true }); });
      b.forEach(d => { const x = d.data(); out.push({ kind: 'manual', id: d.id, uid: null, name: x.name || '', email: x.email || '', photoURL: null, joined: dateText(x.createdAt), removed: x.removed === true }); });
      return out.sort((p, q) => p.name.localeCompare(q.name, undefined, { sensitivity: 'base' }) || p.id.localeCompare(q.id));
    } catch (e) { throw joinErr(e); }
  }
  const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim();
  const cleanEmail = n => String(n || '').trim();
  function checkStudent(name, email) {
    if (!name) throw appErr('The name cannot be blank.');
    if (name.length > 120) throw appErr('The name is too long (120 characters at most).');
    if (email.length > 200 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw appErr('That email address does not look right. Leave it empty if you do not have one.');
  }
  async function addStudent(classId, nameRaw, emailRaw) {
    try {
      const { db, fsM } = fb; meUid();
      const name = cleanName(nameRaw), email = cleanEmail(emailRaw); checkStudent(name, email);
      await fsM.addDoc(fsM.collection(db, 'classes', classId, 'students'), { name, email, removed: false, createdAt: fsM.serverTimestamp() });
    } catch (e) { throw joinErr(e); }
  }
  /* Bulk add (CSV import). rows = [{name, email}], already checked by the screen; checked again here. Chunks of 400. */
  async function addStudents(classId, rows) {
    let done = 0;
    try {
      const { db, fsM } = fb; meUid();
      if (!Array.isArray(rows) || !rows.length) throw appErr('There are no students to import.');
      if (rows.length > 1000) throw appErr('Import at most 1000 students at a time.');
      const clean = rows.map(r => { const name = cleanName(r.name), email = cleanEmail(r.email); checkStudent(name, email); return { name, email }; });
      for (let i = 0; i < clean.length; i += 400) {
        const batch = fsM.writeBatch(db);
        clean.slice(i, i + 400).forEach(r => batch.set(fsM.doc(fsM.collection(db, 'classes', classId, 'students')), { name: r.name, email: r.email, removed: false, createdAt: fsM.serverTimestamp() }));
        await batch.commit(); done += Math.min(400, clean.length - i);
      }
      return done;
    } catch (e) { const x = joinErr(e); x.imported = done; throw x; }
  }
  /* Edit the name/email of a hand-added student. Joined students' details come from their own account and stay as they sent them. */
  async function updateStudent(classId, id, nameRaw, emailRaw) {
    try {
      const { db, fsM } = fb; meUid();
      const name = cleanName(nameRaw), email = cleanEmail(emailRaw); checkStudent(name, email);
      await fsM.updateDoc(fsM.doc(db, 'classes', classId, 'students', id), { name, email });
    } catch (e) { throw joinErr(e); }
  }
  /* Soft remove / restore. Nothing is deleted. */
  async function setStudentRemoved(classId, x, removed) {
    try {
      const { db, fsM } = fb; meUid();
      const ref = fsM.doc(db, 'classes', classId, x.kind === 'member' ? 'members' : 'students', x.id);
      await fsM.updateDoc(ref, { removed: !!removed, removedAt: fsM.serverTimestamp() });
    } catch (e) { throw joinErr(e); }
  }
  /* Faculty: approve or reject. Approving writes the request update AND the member document in one batch. */
  async function decideRequest(r, approve) {
    try {
      const { db, fsM } = fb, uid = meUid();
      const batch = fsM.writeBatch(db);
      batch.update(fsM.doc(db, 'joinRequests', r.id), { status: approve ? 'approved' : 'rejected', decidedAt: fsM.serverTimestamp(), decidedBy: uid });
      if (approve) batch.set(fsM.doc(db, 'classes', r.classId, 'members', r.studentUid), {
        studentUid: r.studentUid, displayName: r.student, email: r.email, photoURL: r.photoURL, joinedAt: fsM.serverTimestamp()
      });
      await batch.commit();
    } catch (e) { throw joinErr(e); }
  }
  /* Is the latest rules file published? The 3b rules let any signed-in user "get" their own joinRequests id
     (even a missing one); older rules refuse it. Reads nothing private. */
  async function probeRules() {
    try { await fb.fsM.getDoc(fb.fsM.doc(fb.db, 'joinRequests', 'ZZZZZZZZ_' + meUid())); return 'published'; }
    catch (e) { return e && e.code === 'permission-denied' ? 'not-published' : 'unknown'; }
  }

  window.AttendrixBackend = { init, onAuth, signIn, signOut, syncProfile, loadRoles, inspectRoles, isConfigured, probeRules,
    listClasses, createClass, updateClass, setClassStatus, resetClassPassword,
    requestJoin, listMyRequests, cancelRequest, listPendingRequests, listMembers, addStudent, addStudents, updateStudent, setStudentRemoved, decideRequest, _derive: derive, _newSecret: newSecret };
})();
