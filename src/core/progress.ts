// A tiny bus for "the captain's progress just changed on disk". Every save that
// should follow a player between devices (purse, vault, livery, designs,
// records, gifts, chosen ship) calls progressSaved() right after it writes;
// the cloud save listens and syncs a moment later. Nothing here knows about
// Firebase, so the stores stay light.

type Fn = () => void;
const subs = new Set<Fn>();

export function progressSaved() {
  subs.forEach((f) => f());
}

export function onProgressSaved(fn: Fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
