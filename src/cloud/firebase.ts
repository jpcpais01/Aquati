// Everything that touches the Firebase SDK. Loaded on demand (a dynamic
// import from cloud.ts) once the harbour is up, so the SDK never weighs on
// start-up and a build without Firebase settings never downloads it.
//
// Firestore layout, one document per captain:
//   captains/{uid}                 { v, rev, save (profile JSON), updated, name, gold, treasures, voyages }
//   captains/{uid}/paints/{hash}   { d: PNG data URL of a hand-painted flag }
// Security rules (firestore.rules) only ever let a signed-in captain reach their own.

import { initializeApp, FirebaseOptions } from 'firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile, User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { parseProfile, Profile } from './profile';

export interface CloudUser {
  uid: string;
  name: string;
  email: string;
  photo: string;
  provider: 'google' | 'email';
}

export interface Remote {
  profile: Profile | null;
  rev: number;
}

/** Shown alongside the save in the Firebase console, purely for reading. */
export interface Summary {
  name: string;
  gold: number;
  treasures: number;
  voyages: number;
}

function toUser(u: User): CloudUser {
  const google = u.providerData.some((p) => p.providerId === 'google.com');
  const email = u.email ?? '';
  return {
    uid: u.uid,
    name: (u.displayName || email.split('@')[0] || 'Captain').slice(0, 32),
    email,
    photo: u.photoURL ?? '',
    provider: google ? 'google' : 'email',
  };
}

const QUIET = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': "That email and password don't match a captain.",
  'auth/wrong-password': "That email and password don't match a captain.",
  'auth/user-not-found': "That email and password don't match a captain.",
  'auth/invalid-email': "That doesn't look like an email address.",
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'A captain already sails under that email. Sign in instead.',
  'auth/weak-password': 'Pick a password of at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': "Can't reach the harbour. Check your connection.",
  'auth/unauthorized-domain': "This site isn't on the sign-in list yet (Firebase › Authentication › Authorized domains).",
  'auth/operation-not-allowed': "That way of signing in isn't switched on yet.",
  'auth/user-disabled': 'This account has been disabled.',
  'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups and try again.',
  'auth/invalid-api-key': "Sign-in isn't set up right yet (the Firebase API key is wrong).",
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': "Sign-in isn't set up right yet (the Firebase API key is wrong).",
  'auth/configuration-not-found': "Sign-in isn't switched on for this game yet.",
};

/** A friendly line for a failed sign-in, or '' when the player simply closed the window. */
export function authMessage(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  if (QUIET.has(code)) return '';
  return MESSAGES[code] ?? 'Something went wrong signing in. Please try again.';
}

export function connect(config: FirebaseOptions, onUser: (u: CloudUser | null) => void) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.useDeviceLanguage();
  const db = getFirestore(app);
  const captain = (uid: string) => doc(db, 'captains', uid);
  const paint = (uid: string, h: string) => doc(db, 'captains', uid, 'paints', h);

  onAuthStateChanged(auth, (u) => onUser(u ? toUser(u) : null));
  // finishes a redirect sign-in (the fallback when pop-ups can't open)
  getRedirectResult(auth).catch((e) => console.warn('[cloud] redirect sign-in', e));

  return {
    async google() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code;
        // installed web apps on some phones can't open pop-ups: go the long way round
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
        else throw e;
      }
    },

    async signIn(email: string, password: string) {
      await signInWithEmailAndPassword(auth, email, password);
    },

    async create(email: string, password: string, name: string) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(cred.user, { displayName: name });
        onUser(toUser(cred.user));
      }
    },

    reset: (email: string) => sendPasswordResetEmail(auth, email),

    signOut: () => signOut(auth),

    /**
     * Reads the captain's save and, if `next` returns a profile, writes it back,
     * atomically: a save from another device in between makes Firestore re-run it.
     */
    async transact(uid: string, next: (remote: Remote) => Profile | null, summary: (p: Profile) => Summary) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(captain(uid));
        const data = snap.exists() ? snap.data() : null;
        const remote: Remote = { profile: parseProfile(data?.save), rev: Number(data?.rev) || 0 };
        const p = next(remote);
        if (p) tx.set(captain(uid), { v: 1, rev: remote.rev + 1, save: JSON.stringify(p), updated: serverTimestamp(), ...summary(p) });
        return remote.rev + (p ? 1 : 0);
      });
    },

    putPaint: (uid: string, h: string, d: string) => setDoc(paint(uid, h), { d }),

    async getPaint(uid: string, h: string) {
      const s = await getDoc(paint(uid, h));
      const d = s.exists() ? s.data().d : null;
      return typeof d === 'string' && d.startsWith('data:image/png') ? d : null;
    },
  };
}

export type CloudApi = ReturnType<typeof connect>;
