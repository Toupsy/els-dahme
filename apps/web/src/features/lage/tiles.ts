import { STATIONS } from "@els/domain";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Kacheln des Reviers (alle Stationen plus Rand) für die angegebenen Zoomstufen. */
export function revierTiles(minZoom = 13, maxZoom = 17): string[] {
  const lats = Object.values(STATIONS).map((s) => s.lat);
  const lngs = Object.values(STATIONS).map((s) => s.lng);
  const [south, north] = [Math.min(...lats) - 0.006, Math.max(...lats) + 0.006];
  const [west, east] = [Math.min(...lngs) - 0.012, Math.max(...lngs) + 0.012];
  const urls: string[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const [x0, y0] = tileOf(north, west, z);
    const [x1, y1] = tileOf(south, east, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
  }
  return urls;
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

/**
 * Lädt die Revier-Kacheln einmal über den Service Worker in den Cache.
 * Bewusst klein gehalten (wenige hundert Kacheln), nacheinander, mit Pause –
 * die Nutzungsregeln der OSM-Kachelserver verbieten Massen-Downloads.
 */
export async function preloadTiles(onProgress: (done: number, total: number) => void): Promise<number> {
  const urls = revierTiles();
  let failed = 0;
  for (const [i, url] of urls.entries()) {
    try {
      await fetch(url, { mode: "no-cors" });
    } catch {
      failed++;
    }
    onProgress(i + 1, urls.length);
    await new Promise((r) => setTimeout(r, 50));
  }
  return failed;
}
