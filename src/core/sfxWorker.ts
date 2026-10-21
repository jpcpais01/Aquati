// Renders the sound bank off the main thread so the game never hitches while
// the cannons are being "cast".
import { bankJobs } from './sfx';

self.onmessage = (e: MessageEvent<{ sr: number; lite?: boolean }>) => {
  for (const job of bankJobs(e.data.sr, e.data.lite)) {
    const data = job.render();
    (self as unknown as Worker).postMessage({ kind: job.kind, index: job.index, data }, data.map((d) => d.buffer));
  }
};
