# Unity publishing API

Push to Unity publishes the selected land or painted copy as an immutable public snapshot. It does not star the land, alter the source, or remove published snapshots when unstarred. The server validates exact tile dimensions, bounds, non-overlap, and complete black/white coverage, then generates and verifies 1–4 difficulty solutions itself. Publishing the same canonical configuration twice returns the same ID.

Base: https://morphotheque-unity-api.onrender.com

- POST /api/v1/lands — application/json body containing board_units:84, units_per_inch:12, source_id, playable and blocked tile arrays.
- GET /api/v1/lands — paginated published collection. Optional limit (1–100) and after (next_cursor).
- GET /api/v1/lands/{id} — complete snapshot, including all difficulty levels and per-level inventory.
- GET /health — backend/database availability.

Tiles contain piece, x, y, w, h. Coordinates are integers in twelfths of an inch on an 84-by-84 board; origin top-left, x right, y down. Unity scales these to its own world size. Use PublishedLandLoader.cs for the writable API's string IDs; the original MorphothequeLandLoader.cs is for the static catalog's numeric IDs.

Snapshots are public. This prototype has anonymous append-only publication, origin checks for browser callers, a 128 KiB request limit, and a per-IP publishing limit. There is no public update/delete route and no account system. These limits are not a substitute for authenticated publishing before wider release.

## Prototype storage

The user approved Render's free 30-day PostgreSQL database. The database was created October 14, 2026 and expires November 13, 2026. Published data must be exported or migrated before expiration. Browser favorites remain local and are separate from published snapshots.

## Deployment

Run npm ci --prefix unity-api during the Render Node build, then node unity-api/server.cjs as its start command. Bind uses PORT on 0.0.0.0. Set DATABASE_URL privately in Render to the new database's INTERNAL connection URL (same workspace and Oregon region). Never put that credential in the gallery or Git.

PUBLIC_BASE_URL is the deployed API origin; ALLOWED_ORIGINS contains the gallery origin. DATABASE_URL is deliberately absent from the repository. Stored snapshots survive server restarts because PostgreSQL is separate from the web service.

Tests: node --test unity-api/test.cjs. The C# example has not been compiled in Unity in this workspace.
