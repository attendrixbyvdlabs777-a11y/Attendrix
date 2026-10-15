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

  window.AttendrixBackend = { init, onAuth, signIn, signOut, syncProfile, loadRoles, inspectRoles, isConfigured };
})();
