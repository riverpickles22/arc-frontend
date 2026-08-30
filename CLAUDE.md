# arc-frontend — agent notes

Read `../arc-system-design/AGENTS.md` first; it carries the rules every arc
repo shares. This file is only what is particular to the viewer.

- **A pure client.** The viewer holds no canon and never reads or writes
  YAML; everything comes through `src/api.ts`, whose types are imported from
  `arc-canon-graph/api-types.ts` in arc-core. Add the wire type there first.
- **Proven and argued are visibly different things on the page.** A
  mechanical finding never renders in the same register as a model's reading.
- **Locks show; they are not enforced here.** The backend refuses; the client
  explains (`lockNotice`, 423 handling) and never hides a locked region.
- **Manuscript-adjacent surfaces are quiet.** One thing at a time, no bare-key
  hotkeys, ⌘C always copies, nothing binds from a click that is not the
  author's accept. Product words: routes, marks, review, depth — not agents.
- Checks before you say done: `npm run build` · `npm test` · `npm run lint`.
  Commit with `-s` (DCO).
