import { useEffect, useRef } from "react";
import { MAP_DEFAULTS, STATIONS, distanceM, type Point } from "@els/domain";
import { L } from "./leaflet";
import "leaflet-rotate/dist/leaflet-rotate.js";
import { TILE_ATTRIBUTION, TILE_URL } from "./tiles";

export type MapMarker = {
  key: string;
  point: Point;
  html: string;
  className: string;
  size: [number, number];
  zIndex?: number;
};
export type MapLine = { key: string; points: Point[]; className: string };

type Props = {
  markers: MapMarker[];
  lines: MapLine[];
  bearing: number;
  onSelect: (key: string) => void;
  /** Langes Drücken / Rechtsklick bzw. Tippen im Einsatz-Modus. */
  onPress?: (point: Point) => void;
  pressMode?: boolean;
};

type RotatingMap = L.Map & { setBearing(deg: number): void };

/**
 * Revier mittig einpassen. fitBounds kennt die Drehung nicht; deshalb wird der
 * Zoom aus der Küstenlänge und der Kartenbreite (Seeseite oben) bzw. -höhe
 * (Norden oben) berechnet.
 */
function fitRevier(m: L.Map, bearing: number) {
  const south = STATIONS["9-12"];
  const north = STATIONS["9-18"];
  const lengthM = distanceM(south, north) * 1.3;
  const size = m.getSize();
  const px = Math.abs(Math.sin((bearing * Math.PI) / 180)) > 0.5 ? size.x : size.y;
  const center = { lat: (south.lat + north.lat) / 2, lng: (south.lng + north.lng) / 2 };
  const metersPerPx = lengthM / Math.max(200, px);
  const zoom = Math.log2((156_543.03 * Math.cos((center.lat * Math.PI) / 180)) / metersPerPx);
  m.setView([center.lat, center.lng], Math.min(17, Math.floor(zoom * 4) / 4), { animate: false });
}

/** Leaflet-Karte mit Drehung (Seeseite oben). Marker werden nur aktualisiert, nicht neu erzeugt. */
export function MapView({ markers, lines, bearing, onSelect, onPress, pressMode }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<RotatingMap | null>(null);
  const layers = useRef(new Map<string, L.Marker>());
  const lineLayers = useRef(new Map<string, L.Polyline>());
  const handlers = useRef({ onSelect, onPress, pressMode });
  handlers.current = { onSelect, onPress, pressMode };

  useEffect(() => {
    const m = L.map(host.current!, {
      center: [MAP_DEFAULTS.center.lat, MAP_DEFAULTS.center.lng],
      zoom: MAP_DEFAULTS.zoom,
      minZoom: 12,
      zoomSnap: 0.25,
      maxZoom: 19,
      zoomControl: false,
      rotate: true,
      bearing,
      touchRotate: false,
      rotateControl: false,
      attributionControl: true,
    } as L.MapOptions) as RotatingMap;
    fitRevier(m, bearing);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, maxNativeZoom: 19 }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (handlers.current.pressMode) handlers.current.onPress?.(e.latlng);
    });
    m.on("contextmenu", (e: L.LeafletMouseEvent) => handlers.current.onPress?.(e.latlng));
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(host.current!);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      layers.current.clear();
      lineLayers.current.clear();
    };
    // Die Karte wird einmal erzeugt; Drehung und Marker folgen in eigenen Effekten.
  }, []);

  useEffect(() => {
    if (!map.current) return;
    map.current.setBearing(bearing);
    fitRevier(map.current, bearing);
  }, [bearing]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.key);
      const icon = L.divIcon({
        html: marker.html,
        className: `map-pin ${marker.className}`,
        iconSize: marker.size,
        iconAnchor: [marker.size[0] / 2, marker.size[1] / 2],
      });
      const existing = layers.current.get(marker.key);
      if (existing) {
        existing.setLatLng([marker.point.lat, marker.point.lng]);
        existing.setIcon(icon);
        existing.setZIndexOffset(marker.zIndex ?? 0);
      } else {
        const layer = L.marker([marker.point.lat, marker.point.lng], {
          icon,
          zIndexOffset: marker.zIndex ?? 0,
          keyboard: true,
        });
        layer.on("click", () => handlers.current.onSelect(marker.key));
        layer.addTo(m);
        layers.current.set(marker.key, layer);
      }
    }
    for (const [key, layer] of layers.current)
      if (!seen.has(key)) {
        layer.remove();
        layers.current.delete(key);
      }
  }, [markers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const layer of lineLayers.current.values()) layer.remove();
    lineLayers.current.clear();
    for (const line of lines)
      lineLayers.current.set(
        line.key,
        L.polyline(
          line.points.map((p) => [p.lat, p.lng]),
          { className: line.className, interactive: false },
        ).addTo(m),
      );
  }, [lines]);

  return <div ref={host} className={pressMode ? "map press-mode" : "map"} data-testid="map" />;
}
