/**
 * LocationPicker — 3 radio options:
 *  1. Manual lat/lng entry
 *  2. Use current GPS location
 *  3. Pick from OpenStreetMap (Leaflet, free, no API key)
 *
 * Outputs hidden inputs named "lat" and "lng" for form submission.
 */
import { useState, useEffect, useRef } from "react";

interface Props {
  defaultLat?: number;
  defaultLng?: number;
}

export function LocationPicker({ defaultLat, defaultLng }: Props) {
  const [mode, setMode] = useState<"manual" | "gps" | "map">("manual");
  const [lat, setLat] = useState(defaultLat?.toString() ?? "");
  const [lng, setLng] = useState(defaultLng?.toString() ?? "");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const getGPS = () => {
    setGpsStatus("loading");
    setGpsMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsStatus("done");
        setGpsMsg(`✅ Got location (±${Math.round(pos.coords.accuracy)}m accuracy)`);
      },
      err => {
        setGpsStatus("error");
        setGpsMsg(err.code === 1 ? "Location denied. Allow permission." : "Cannot get GPS.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // Load Leaflet when map mode selected
  useEffect(() => {
    if (mode !== "map") return;
    if (mapInstanceRef.current) return; // already loaded

    // Load Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      if (!mapRef.current) return;
      const L = (window as any).L;
      const initLat = parseFloat(lat) || 20.5937;
      const initLng = parseFloat(lng) || 78.9629;

      const map = L.map(mapRef.current).setView([initLat, initLng], lat ? 15 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const marker = lat
        ? L.marker([parseFloat(lat), parseFloat(lng)], { draggable: true }).addTo(map)
        : null;

      const updateFromLatLng = (latlng: any) => {
        setLat(latlng.lat.toFixed(6));
        setLng(latlng.lng.toFixed(6));
      };

      if (marker) {
        markerRef.current = marker;
        marker.on("dragend", (e: any) => updateFromLatLng(e.target.getLatLng()));
      }

      map.on("click", (e: any) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng);
        } else {
          markerRef.current = L.marker(e.latlng, { draggable: true }).addTo(map);
          markerRef.current.on("dragend", (ev: any) => updateFromLatLng(ev.target.getLatLng()));
        }
        updateFromLatLng(e.latlng);
      });

      mapInstanceRef.current = map;
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [mode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Hidden inputs for form */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />

      {/* Mode selector */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {([
          { key: "manual", label: "✏️ Manual Entry" },
          { key: "gps",    label: "📍 Use My Location" },
          { key: "map",    label: "🗺️ Pick on Map" },
        ] as const).map(opt => (
          <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", border: `1.5px solid ${mode === opt.key ? "var(--primary)" : "var(--gray-200)"}`, borderRadius: "var(--radius-full)", cursor: "pointer", fontSize: "13px", fontWeight: "500", background: mode === opt.key ? "var(--primary-light)" : "white", transition: "all .15s" }}>
            <input type="radio" name="_location_mode" value={opt.key} checked={mode === opt.key} onChange={() => setMode(opt.key)} style={{ display: "none" }} />
            {opt.label}
          </label>
        ))}
      </div>

      {/* Current values display — only in GPS / Map mode to avoid duplicating the manual inputs */}
      {mode !== "manual" && (lat || lng) && (
        <div style={{ display: "flex", gap: "12px" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Latitude</label>
            <div style={{ padding: "10px 12px", background: "var(--gray-50)", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)", fontSize: "14px", fontWeight: "500" }}>{lat || "—"}</div>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Longitude</label>
            <div style={{ padding: "10px 12px", background: "var(--gray-50)", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)", fontSize: "14px", fontWeight: "500" }}>{lng || "—"}</div>
          </div>
        </div>
      )}

      {/* Manual mode */}
      {mode === "manual" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="form-label">Latitude *</label>
            <input type="number" step="0.000001" className="form-input" placeholder="18.792000" value={lat} onChange={e => setLat(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Longitude *</label>
            <input type="number" step="0.000001" className="form-input" placeholder="72.905000" value={lng} onChange={e => setLng(e.target.value)} required />
          </div>
          <div style={{ gridColumn: "1/-1", fontSize: "12px", color: "var(--gray-400)" }}>
            💡 Get coordinates: Open Google Maps → Long-press location → coordinates shown at bottom
          </div>
        </div>
      )}

      {/* GPS mode */}
      {mode === "gps" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" className="btn btn-primary btn-md" onClick={getGPS} disabled={gpsStatus === "loading"} title="Get your current GPS coordinates">
            {gpsStatus === "loading" ? <><span className="spinner" style={{ borderTopColor: "white" }} /> Getting location…</> : "📍 Get My Current Location"}
          </button>
          {gpsMsg && (
            <div className={`gps-status ${gpsStatus === "done" ? "gps-inside" : gpsStatus === "error" ? "gps-outside" : "gps-loading"}`}>
              <div className="gps-dot" />
              <span style={{ fontSize: "13px" }}>{gpsMsg}</span>
            </div>
          )}
          {gpsStatus === "done" && lat && lng && (
            <div style={{ fontSize: "12px", color: "var(--success)", fontWeight: "500" }}>
              ✅ Location set: {lat}, {lng}
            </div>
          )}
        </div>
      )}

      {/* Map mode */}
      {mode === "map" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", color: "var(--gray-500)" }}>
            Click anywhere on the map to set the location. Drag the marker to fine-tune.
          </div>
          <div
            ref={mapRef}
            style={{ width: "100%", height: "300px", borderRadius: "var(--radius-sm)", border: "1px solid var(--gray-200)", background: "var(--gray-100)" }}
          />
          {lat && lng && (
            <div style={{ fontSize: "12px", color: "var(--success)", fontWeight: "500" }}>
              ✅ Selected: {lat}, {lng}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
