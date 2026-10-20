// Admin captains: signing in with one of these accounts fills the purse and
// unlocks everything, synced like any other progress. The check uses only the
// address Firebase itself verified at sign-in, never anything typed in the game.
// When a new unlockable system lands, add it to the game's onAdmin grant.

import type { CloudUser } from './firebase';

const ADMINS = new Set(['jpcpais01@gmail.com']);

/** The purse an admin captain is topped up to on every visit. */
export const ADMIN_GOLD = 1_000_000_000;

export function isAdmin(u: CloudUser) {
  return u.verified && u.provider === 'google' && ADMINS.has(u.email.trim().toLowerCase());
}
