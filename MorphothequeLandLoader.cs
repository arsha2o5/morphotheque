using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

// Attach to an empty GameObject. Call LoadLand(id, difficulty, towerLayer).
// Default view shows the blocked land, without revealing its solution.
public class MorphothequeLandLoader : MonoBehaviour
{
    public string baseUrl = "https://arsha2o5.github.io/morphotheque/";
    public float boardSize = 7f;
    public float thickness = 0.15f;
    public float layerSpacing = 0.5f;
    public bool showSolution = false;
    public event Action<Land, Level, GameObject> LandLoaded;
    Catalog catalog;
    readonly Dictionary<string, Chunk> cache = new Dictionary<string, Chunk>();
    public void LoadLand(int id, int difficulty = 1, int towerLayer = 0)
    { StartCoroutine(Load(id, difficulty, towerLayer)); }
    IEnumerator Load(int id, int difficulty, int towerLayer)
    {
        if (catalog == null)
        {
            using (var request = UnityWebRequest.Get(baseUrl + "api-index.json"))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success) { Debug.LogError(request.error); yield break; }
                catalog = JsonUtility.FromJson<Catalog>(request.downloadHandler.text);
            }
        }
        var entry = Array.Find(catalog.lands, item => item.id == id);
        if (entry == null) { Debug.LogError("Unknown land ID: " + id); yield break; }
        if (!cache.TryGetValue(entry.file, out var chunk))
        {
            using (var request = UnityWebRequest.Get(baseUrl + entry.file))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success) { Debug.LogError(request.error); yield break; }
                chunk = JsonUtility.FromJson<Chunk>(request.downloadHandler.text);
                cache[entry.file] = chunk;
            }
        }
        var land = Array.Find(chunk.lands, item => item.id == id);
        if (land == null) { Debug.LogError("Land missing from data file."); yield break; }
        var level = Array.Find(land.levels, item => item.level == difficulty);
        if (level == null) { Debug.LogError("This land has only " + land.levels.Length + " levels."); yield break; }
        var root = new GameObject("Land " + id + " - Level " + difficulty);
        root.transform.SetParent(transform, false);
        root.transform.localPosition = new Vector3(0, towerLayer * layerSpacing, 0);
        // Board base; game logic treats playable area as empty until player fills it.
        var board = GameObject.CreatePrimitive(PrimitiveType.Cube);
        board.name = "Board"; board.transform.SetParent(root.transform, false);
        board.transform.localScale = new Vector3(boardSize, thickness, boardSize);
        board.transform.localPosition = new Vector3(0, -thickness / 2, 0);
        board.GetComponent<Renderer>().material.color = Color.white;
        foreach (var tile in land.blocked) AddTile(tile, root.transform, Color.black);
        if (showSolution) foreach (var tile in level.solution) AddTile(tile, root.transform, new Color(.6f, .8f, .7f));
        LandLoaded?.Invoke(land, level, root);
    }
    void AddTile(Tile tile, Transform parent, Color color)
    {
        var obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
        obj.name = tile.piece; obj.transform.SetParent(parent, false);
        float unit = boardSize / 84f;
        obj.transform.localScale = new Vector3(tile.w * unit, thickness, tile.h * unit);
        obj.transform.localPosition = new Vector3((tile.x + tile.w / 2f - 42f) * unit, thickness / 2,
                                                   (42f - tile.y - tile.h / 2f) * unit);
        obj.GetComponent<Renderer>().material.color = color;
    }
    [Serializable] public class Catalog { public int schema_version, count, board_units, units_per_inch; public Entry[] lands; }
    [Serializable] public class Entry { public int id, level_count, min_tiles, max_tiles; public string file; }
    [Serializable] public class Chunk { public int schema_version, board_units, units_per_inch; public Land[] lands; }
    [Serializable] public class Land { public int id; public float coverage, area_in2; public Tile[] playable, blocked; public Level[] levels; }
    [Serializable] public class Level { public int level, tile_count; public float mean_area_in2; public Tile[] solution; public Inventory[] inventory; }
    [Serializable] public class Tile { public string piece; public int x, y, w, h; }
    [Serializable] public class Inventory { public string piece; public int count; }
}
