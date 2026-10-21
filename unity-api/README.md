# Unity publishing API

Push to Unity publishes the selected land or painted copy as an immutable public snapshot. It does not star the land, alter the source, or remove published snapshots when unstarred. The server validates exact tile dimensions, bounds, non-overlap, and complete black/white coverage, then validates the supplied 1–4 difficulty solutions (or generates them when omitted). Publishing the same canonical configuration twice returns the same ID.

Base: https://morphotheque-unity-api.onrender.com

- POST /api/v1/lands — application/json body containing board_units:84, units_per_inch:12, source_id, playable and blocked tile arrays.
- GET /api/v1/lands — paginated published collection. Optional limit (1–100) and after (next_cursor).
- GET /api/v1/lands/{id} — complete snapshot, including all difficulty levels and per-level inventory.
- GET /health — backend/database availability.

Tiles contain piece, x, y, w, h. Coordinates are integers in twelfths of an inch on an 84-by-84 board; origin top-left, x right, y down. Unity scales these to its own world size. Use PublishedLandLoader.cs for the writable API's string IDs; the original MorphothequeLandLoader.cs is for the static catalog's numeric IDs.

Snapshots are public. This prototype has anonymous publication and catalog management, origin checks for browser callers, a 128 KiB request limit, and a per-IP land-publishing limit. Catalog removal unpublishes the entry rather than deleting its immutable geometry; existing games keep their embedded snapshots. There is no account system. These limits are not a substitute for authenticated management before wider release.

## Unity land manager and tower games

Open /unity.html on the gallery. Published lands can be named, removed from the active catalog, restored, added through the shape explorer, or imported as validated land JSON. PATCH /api/v1/lands/{id} accepts title (at most 100 characters) and enabled (boolean). DELETE on the same URL unpublishes. GET /api/v1/lands?include_unpublished=true includes inactive entries.

The Layer combinations tab accepts layer_count (default 10, maximum 24), piece_count (exact total), min_solutions (inclusive minimum), limit, and allow_repeated_lands. POST /api/v1/combinations/search returns ordered land IDs, one shared inventory, and verified solution assignments. Every counted assignment uses exactly the same counts of A2–A36, not merely the same total count. Only distinct stored solutions are counted; this is not an exhaustive tiling solver. The search has CPU/state limits, so absence of results does not prove no solution exists; truncated counts are explicitly lower bounds.

POST /api/v1/games accepts land_ids in bottom-to-top order and inventory. The server independently verifies that the inventory solves the complete tower, stores embedded land snapshots, and makes that game active. GET /api/v1/games lists recent games; GET /api/v1/games/{id} fetches one, and GET /api/v1/games/active fetches the most recently pushed game. Reposting activates an existing game. Games have their own immutable IDs and preserve geometry even after a source land is unpublished.

Unity fetches the active game on each fresh Play session. Set PublishedLandPreview.gameId to pin a game, or disable loadActiveTower for the previous single-land flow. A 404 for the active game falls back to the configured single land; other errors are not silently replaced with a different game.

## Prototype storage

The user approved Render's free 30-day PostgreSQL database. The database was created October 14, 2026 and expires November 13, 2026. Published data must be exported or migrated before expiration. Browser favorites remain local and are separate from published snapshots.

## Deployment

Run npm ci --prefix unity-api during the Render Node build, then node unity-api/server.cjs as its start command. Bind uses PORT on 0.0.0.0. Set DATABASE_URL privately in Render to the new database's INTERNAL connection URL (same workspace and Oregon region). Never put that credential in the gallery or Git.

PUBLIC_BASE_URL is the deployed API origin; ALLOWED_ORIGINS contains the gallery origin. DATABASE_URL is deliberately absent from the repository. Stored snapshots survive server restarts because PostgreSQL is separate from the web service.

Tests: node --test unity-api/test.cjs. The C# example has not been compiled in Unity in this workspace.
