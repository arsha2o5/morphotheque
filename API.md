# Morphotheque Unity data API (v1)

This is a static read-only JSON API hosted by GitHub Pages. It supplies precomputed lands and solutions over HTTPS; it does not run a server-side solver or accept POST requests. URL query parameters do not filter or select lands. Painted browser favorites are local; export their JSON to import them into your game.

Base URL: https://arsha2o5.github.io/morphotheque/

1. GET api-index.json. The catalog has count, coordinates, piece dimensions, and a lands array. Look up an ID to get its data file and available level count.
2. GET the entry's file, for example api-lands-001.json. Read its lands array and select the matching ID. Cache the file to reuse other lands from that batch. Files contain up to 1,000 lands.
3. Choose levels[...].level (1 through level_count). There are at most four distinct solutions. Fewer are returned if exact subdivision cannot produce four different tile counts.

api-example-land.json is a small complete example for land 1.

## Coordinates

A1 is 84 by 84 integer units. Twelve units equal one inch. Origin is top left; x grows right and y grows down. Each tile has piece, x, y, w, h. All sizes match the supplied exact A2–A36 dimensions, with rotations allowed. Data does not assume a particular Unity world scale or physical tile thickness.

For a centered horizontal board of Unity width W:

    scale = W / 84
    centerX = (x + w/2 - 42) * scale
    centerZ = (42 - y - h/2) * scale
    sizeX = w * scale
    sizeZ = h * scale

Use an independent Unity Y coordinate for tower height. Difficulty level is a tile solution for the SAME land, not the tower's physical layer index. Put each land under its own parent GameObject to move it like a drawer.

## Land fields

- id: stable ID in the current collection.
- playable: reference white tile decomposition (union defines the playable outline).
- blocked: black tile decomposition.
- levels: white tile solutions with level, tile_count, mean_area_in2, solution, inventory.
- inventory: array of piece and count, suitable for Unity JsonUtility. It describes that solution, not a fixed global inventory economy.

All levels have exactly the same white union; blocked stays fixed. No overlaps or gaps. Repeated sizes allowed. Solutions can be changed by the player: do not require exact agreement with the reference tile placement to accept a valid fill.

## Difficulty method and limits

Greedily merge neighboring rectangles when their combined rectangle is a listed size. Then subdivide listed rectangles into two smaller listed rectangles, always exactly. Select up to four progressively increasing tile counts across that sequence. Level 1 is the coarsest solution found by this procedure, not a proof of the minimum possible tile count. Counts/mean tile area are geometric difficulty estimates, not validated human difficulty. The method does not search all alternative tilings or enforce the game's future shared inventory limits.

Current collection: 11,354 sampled lands. 11,101 have four levels, 186 have three, 54 have two, 13 have one. All level geometries were verified against the original playable masks.

## Unity example

Download MorphothequeLandLoader.cs, put it in Assets, and attach it to an empty GameObject. Call LoadLand(1, 1, 0). It fetches the catalog and batch, creates a board and blocked rectangles as cubes, and exposes the white solution and inventory via LandLoaded. Set showSolution=true only for a solution preview; false is the default to avoid revealing the answer. Difficulty and towerLayer are independent.

This is an integration example, not a complete game. Unity is not installed in this workspace, so the script has not been compiled or run in Unity. Use UnityWebRequest.Get and JsonUtility with ordinary serializable data classes. References:

- https://docs.unity.com/en-us/engine/6000.7/script-reference/unityengine/networking/unitywebrequest/get
- https://docs.unity.com/en-us/engine/6000.6/script-reference/unityengine/jsonutility

For offline/mobile startup, cache downloaded batches or package selected lands with the app. Native Android/iOS requests can use HTTPS; WebGL cross-origin behavior depends on the hosting browser and response headers. This endpoint is public, and solutions are downloadable; it is not an anti-cheat service.
