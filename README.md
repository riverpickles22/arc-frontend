# arc-frontend

The living map/graph/timeline over a story's canon, with an embedded AI agent that shapes the world as you converse. Part of [arc](https://github.com/riverpickles22/arc-core).

This repo is the view. It holds no canon and no story — it reads both from **arc-backend**.

## Setup

The backend must be running first; it serves the canon and the agent.

```sh
# terminal 1
cd ../arc-backend && npm install && npm run dev    # :8787

# terminal 2
npm install && npm run dev                          # :5173
```

Vite proxies `/api` to `http://localhost:8787`. Point it elsewhere with `ARC_BACKEND_URL`.

## What it shows

- **Timeline** — era bands plus chapter bands (colored by part); drag the year slider to set story-time T, or click a chapter to jump to its span. Every panel answers "as of T."
- **Event strip** — the events dated in the selected year; click to inspect.
- **Map** — the story's geography; each character's marker sits at their state location at T (latest state ≤ T), with the selected character's movement trail dashed behind them.
- **Graph** — entities as nodes colored by type, objective relationship edges solid, and the selected character's *subjective perception at T* as dashed edges — hover to read the stance. Entities not extant at T (unborn, dead, dissolved) fade.
- **Profile** — the full versioned journey of the selected entity or chapter, with the snapshot active at T highlighted. Every ID is a link; `proposed` facts wear a badge.
- **Chat (✦)** — the world-shaping agent. It reads the full canon and conventions, discusses the story, and edits canon/docs through the validator. Failed writes are reverted and bounced back to the agent to fix; successful ones refresh the map, graph, and timeline live. New facts default to `status: proposed` until you ratify them in conversation.

## Architecture

The app is a pure client of two backend routes:

| Route | Used by |
|---|---|
| `GET /api/canon` | `loadCanon()` in `src/canon.ts` — the whole graph in one fetch |
| `POST /api/chat` | `src/components/ChatPanel.tsx` |

The canon JSON shape is the contract between canon and any app — it's produced by arc-core's `export-canon.py` and documented there. Nothing in this repo parses YAML or knows where the story lives.

Colors follow fixed categorical assignment per character and per entity type, in light and dark themes. `public/cuba.geo.json` is a coarse Natural-Earth-derived coastline; swap in a higher-resolution one when map fidelity starts to matter.
