"use client";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip, Rectangle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Vessel = {
  mmsi: number;
  name: string;
  type: string;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
};
type Positions = {
  updatedAt: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  vessels: Vessel[];
  demo?: boolean;
};

const TYPE_COLOR: Record<string, string> = {
  Tanker: "#f59e0b",
  Cargo: "#10b981",
  Passenger: "#3b82f6",
  Fishing: "#8b5cf6",
  Other: "#9ca3af",
};

export default function VesselMap({ positions }: { positions: Positions }) {
  const moving = positions.vessels.filter((v) => v.sog > 1);
  const stationary = positions.vessels.filter((v) => v.sog <= 1);

  return (
    <div className="relative h-[420px] rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={[26.52, 56.3]}
        zoom={9}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", background: "#0b0f17" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
        />
        <TileLayer
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
          attribution='&copy; OpenSeaMap'
        />
        <Rectangle
          bounds={[
            [positions.bbox.minLat, positions.bbox.minLon],
            [positions.bbox.maxLat, positions.bbox.maxLon],
          ]}
          pathOptions={{ color: "#f59e0b", weight: 1, fillOpacity: 0.04, dashArray: "4 4" }}
        />
        {positions.vessels.map((v) => {
          const color = TYPE_COLOR[v.type] ?? TYPE_COLOR.Other;
          const isMoving = v.sog > 1;
          return (
            <CircleMarker
              key={v.mmsi}
              center={[v.lat, v.lon]}
              radius={isMoving ? 7 : 5}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isMoving ? 0.85 : 0.35,
                weight: 1.5,
              }}
            >
              <LTooltip direction="top" offset={[0, -8]} opacity={0.95}>
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold">{v.name}</div>
                  <div className="text-muted">{v.type} · MMSI {v.mmsi}</div>
                  <div>{v.sog.toFixed(1)} kn · {v.cog}°</div>
                </div>
              </LTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="absolute top-3 right-3 bg-bg/90 border border-border rounded-md px-3 py-2 text-[11px] space-y-1 pointer-events-none z-[400]">
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" />Tanker</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-good" />Cargo</div>
        <div className="text-muted pt-1 border-t border-border/60">
          {moving.length} moving · {stationary.length} anchored
        </div>
      </div>
      {positions.demo && (
        <div
          className="absolute bottom-3 left-3 bg-accent/20 border border-accent text-accent text-[11px] px-2 py-1 rounded z-[400] cursor-help"
          title="AISStream free tier relies on volunteer receivers, and the Persian Gulf has little volunteer coverage. Every hour the collector samples for 3min; when it sees 0 vessels it preserves the last known positions rather than blanking the map. Paid AIS (MarineTraffic, Spire) would fix this."
        >
          AIS coverage gap — showing last known positions
        </div>
      )}
    </div>
  );
}
