// Renders the voyage band's instruments off the main thread (see ./musicKit).
import { kitJobs } from './musicKit';

self.onmessage = (e: MessageEvent<{ sr: number }>) => {
  for (const job of kitJobs(e.data.sr)) {
    const data = job.render();
    (self as unknown as Worker).postMessage({ kind: job.kind, index: job.index, sr: job.sr, data }, data.map((d) => d.buffer));
  }
};
