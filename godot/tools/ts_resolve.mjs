// Lets the bake scripts import the web game's TypeScript as it is written,
// with its extensionless relative imports (`import ... from './fireworks'`)
// and the type names it imports among its values (dropped: type stripping
// leaves nothing to import them from):
//
//   node --experimental-strip-types --import ./tools/ts_resolve.mjs tools/bake_art.mjs
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx);
    throw e;
  }
}
const TYPES = /^(FireworkId|FireworkCounts|FireworkType)$/;
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (!url.endsWith('.ts') || !r.source) return r;
  const src = String(r.source).replace(/import \{([^}]*)\} from/g, (m, names) => {
    const keep = names.split(',').map((n) => n.trim()).filter((n) => n && !TYPES.test(n));
    return keep.length ? 'import { ' + keep.join(', ') + ' } from' : 'import {} from';
  });
  return { ...r, source: src };
}`),
);
