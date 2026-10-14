using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

// Loads a snapshot published by the gallery's Push to Unity button.
// Call FetchLand(id) and use Loaded to build your land/piece inventory.
public class PublishedLandLoader : MonoBehaviour
{
    public string apiBase = "https://morphotheque-unity-api.onrender.com";
    public event Action<PublishedLand> Loaded;
    public void FetchLand(string id) { StartCoroutine(Fetch(id)); }
    IEnumerator Fetch(string id)
    {
        if (string.IsNullOrEmpty(id) || id.Length != 64) { Debug.LogError("Use the published Unity land ID."); yield break; }
        using (var request = UnityWebRequest.Get(apiBase.TrimEnd('/') + "/api/v1/lands/" + UnityWebRequest.EscapeURL(id)))
        {
            request.timeout = 90; // A free Render service may need time to wake up.
            yield return request.SendWebRequest();
            if (request.result != UnityWebRequest.Result.Success) { Debug.LogError(request.error); yield break; }
            var land = JsonUtility.FromJson<PublishedLand>(request.downloadHandler.text);
            if (land == null || land.schema_version != 1 || land.board_units != 84) { Debug.LogError("Unsupported land data."); yield break; }
            Loaded?.Invoke(land);
        }
    }
    // X/Z board plane centered at zero; Unity Y is reserved for tower height.
    public static Vector3 Center(Tile tile, float boardSize, float towerY)
    { float scale = boardSize / 84f; return new Vector3((tile.x + tile.w / 2f - 42f) * scale, towerY, (42f - tile.y - tile.h / 2f) * scale); }
    public static Vector3 Size(Tile tile, float boardSize, float thickness)
    { float scale = boardSize / 84f; return new Vector3(tile.w * scale, thickness, tile.h * scale); }
    [Serializable] public class PublishedLand { public string id, source_id, created_at, origin, x_axis, y_axis; public int schema_version, board_units, units_per_inch; public float area_in2, coverage; public Tile[] playable, blocked; public Level[] levels; }
    [Serializable] public class Tile { public string piece; public int x, y, w, h; }
    [Serializable] public class Level { public int level, tile_count; public float mean_area_in2; public Tile[] solution; public Inventory[] inventory; }
    [Serializable] public class Inventory { public string piece; public int count; }
}
