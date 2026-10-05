import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";

const COLORS = ['#7C6FFF', '#00CFA8', '#F59E0B', '#FF5260', '#3B82F6', '#EC4899', '#10B981'];
function getUserColor(id) {
  if (!id) return COLORS[0];
  const n = parseInt(String(id), 10) || id.charCodeAt(0);
  return COLORS[Math.abs(n) % COLORS.length];
}

if (typeof document !== "undefined" && !document.getElementById("leaflet-css")) {
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

if (typeof document !== "undefined" && !document.getElementById("np-marker-anim")) {
  const s = document.createElement("style");
  s.id = "np-marker-anim";
  s.textContent = `
    @keyframes mapPulse {
      0%   { transform:scale(1);  opacity:0.35; }
      100% { transform:scale(1.9);opacity:0; }
    }
  `;
  document.head.appendChild(s);
}

if (typeof document !== "undefined" && !document.getElementById("np-popup-css")) {
  const s = document.createElement("style");
  s.id = "np-popup-css";
  s.textContent = `
    .np-popup .leaflet-popup-content-wrapper {
      background: #1a1d27;
      color: #f0f0f0;
      border: 1px solid rgba(124,111,255,0.25);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      padding: 0;
    }
    .np-popup .leaflet-popup-content { margin: 12px 14px; }
    .np-popup .leaflet-popup-tip-container { margin-top: -1px; }
    .np-popup .leaflet-popup-tip { background: #1a1d27; }
    .np-popup .leaflet-popup-close-button { color: #666; top: 10px; right: 12px; font-size: 18px; }
  `;
  document.head.appendChild(s);
}

function relTime(iso) {
  if (!iso) return "unknown";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CLUSTER_RADIUS_PX = 60;

function clusterDevices(map, devices) {
  const items = devices.map((d) => ({
    device: d,
    pt: map.latLngToContainerPoint([d.last_lat, d.last_lng]),
    assigned: false,
  }));

  const clusters = [];

  for (let i = 0; i < items.length; i++) {
    if (items[i].assigned) continue;
    const cluster = [items[i].device];
    items[i].assigned = true;

    for (let j = i + 1; j < items.length; j++) {
      if (items[j].assigned) continue;
      const dx = items[i].pt.x - items[j].pt.x;
      const dy = items[i].pt.y - items[j].pt.y;
      if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS_PX) {
        cluster.push(items[j].device);
        items[j].assigned = true;
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function buildSingleIcon(device) {
  const color = getUserColor(device.owner_user_id);
  const letter = (device.owner_name || device.name || "?")[0].toUpperCase();
  const isLive = device.last_seen_at && (Date.now() - new Date(device.last_seen_at)) < 5 * 60 * 1000;
  return L.divIcon({
    className: "",
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54],
    html: `
      <div style="position:relative;width:44px;height:52px">
        ${isLive ? `<div style="position:absolute;top:0;left:0;width:44px;height:44px;border-radius:50%;background:${color};opacity:0.25;animation:mapPulse 2s infinite;z-index:0"></div>` : ""}
        <div style="width:44px;height:44px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:16px;box-shadow:0 4px 14px rgba(0,0,0,0.35);position:relative;z-index:1;font-family:'Plus Jakarta Sans',sans-serif;">${letter}</div>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid ${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));z-index:1;"></div>
      </div>`,
  });
}

function buildMergedIcon(group) {
  const MAX = 4;
  const shown = group.slice(0, MAX);
  const n = shown.length;
  const SIZE = 52;
  const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2;

  function toXY(deg, radius) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  let segs = "", lbls = "";
  const slice = 360 / n;

  shown.forEach((d, i) => {
    const color = getUserColor(d.owner_user_id);
    const start = i * slice, end = start + slice;
    const [x1, y1] = toXY(start, r);
    const [x2, y2] = toXY(end, r);
    const large = slice > 180 ? 1 : 0;
    segs += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z" fill="${color}"/>`;

    const mid = start + slice / 2;
    const lx = cx + r * 0.57 * Math.cos(((mid - 90) * Math.PI) / 180);
    const ly = cy + r * 0.57 * Math.sin(((mid - 90) * Math.PI) / 180);
    const letter = (d.owner_name || d.name || "?")[0].toUpperCase();
    lbls += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="white" font-weight="800" font-size="${n > 2 ? 13 : 17}" font-family="Plus Jakarta Sans,sans-serif">${letter}</text>`;
  });

  const extra = group.length > MAX
    ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.31}" fill="rgba(0,0,0,0.55)"/>
       <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="white" font-weight="900" font-size="11" font-family="Plus Jakarta Sans,sans-serif">+${group.length - MAX}</text>`
    : lbls;

  const tipColor = getUserColor(shown[0].owner_user_id);

  return L.divIcon({
    className: "",
    iconSize: [SIZE, SIZE + 10],
    iconAnchor: [SIZE / 2, SIZE + 10],
    popupAnchor: [0, -(SIZE + 14)],
    html: `
      <div style="position:relative;width:${SIZE}px;height:${SIZE + 10}px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4))">
        <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
          <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="white"/>
          ${segs}${extra}
          <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="white" stroke-width="3"/>
        </svg>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:10px solid ${tipColor};"></div>
      </div>`,
  });
}

const geoCache = {};
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache[key]) return geoCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const a = data.address || {};
    const label = [
      a.suburb || a.neighbourhood || a.quarter,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean).join(", ") || data.display_name?.split(",").slice(0, 2).join(", ") || "Unknown";
    geoCache[key] = label;
    return label;
  } catch { return "Unknown location"; }
}

function buildPopupHTML(group, deviceLocations) {
  const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

  const cards = group.map((d, i) => {
    const color = getUserColor(d.owner_user_id);
    const letter = (d.owner_name || "?")[0].toUpperCase();
    const loc = deviceLocations[i];
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:${i === 0 ? "0" : "10px"} 0 10px;${i < group.length - 1 ? "border-bottom:1px solid rgba(255,255,255,0.07)" : ""}">
        <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;">${letter}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;color:#f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.owner_name || "Unknown"}</div>
          <div style="font-size:12px;color:#aaa;margin-top:1px">${d.name} · ${d.device_type || "device"}</div>
          <div style="margin-top:5px">
            <a href="${mapsLink}" target="_blank" rel="noopener noreferrer"
               style="display:inline-flex;align-items:center;gap:4px;text-decoration:none;color:#7C6FFF;font-size:11px;font-weight:600;">
              ${pinSvg} ${loc.label}
            </a>
          </div>
          <div style="font-size:11px;color:#555;margin-top:3px">${relTime(d.last_seen_at)}</div>
        </div>
      </div>`;
  }).join("");

  return `<div style="min-width:210px;max-width:270px;font-family:'Plus Jakarta Sans',sans-serif">${cards}</div>`;
}

const MapComponent = forwardRef(({ devices, theme, colors }, ref) => {
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const containerRef = useRef(null);
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const active = devices.filter((d) => d.last_lat != null && d.last_lng != null);

  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !layerRef.current) return;

    layerRef.current.clearLayers();

    const currentActive = devicesRef.current.filter(
      (d) => d.last_lat != null && d.last_lng != null
    );
    if (currentActive.length === 0) return;

    const clusters = clusterDevices(map, currentActive);

    for (const group of clusters) {
      const lat = group.reduce((s, d) => s + d.last_lat, 0) / group.length;
      const lng = group.reduce((s, d) => s + d.last_lng, 0) / group.length;
      const icon = group.length === 1 ? buildSingleIcon(group[0]) : buildMergedIcon(group);

      const marker = L.marker([lat, lng], { icon });
      marker.addTo(layerRef.current);

      Promise.all(
        group.map((d) =>
          reverseGeocode(d.last_lat, d.last_lng).then((label) => ({
            label,
            lat: d.last_lat,
            lng: d.last_lng,
          }))
        )
      ).then((deviceLocations) => {
        marker.bindPopup(buildPopupHTML(group, deviceLocations), {
          maxWidth: 300,
          className: "np-popup",
        });
      });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    fitToMarkers: () => {
      if (!mapRef.current) return;
      const valid = devicesRef.current.filter(d => d.last_lat && d.last_lng);
      if (valid.length > 0) {
        try {
          mapRef.current.fitBounds(
            valid.map((d) => [d.last_lat, d.last_lng]),
            { padding: [60, 60], maxZoom: 16 }
          );
        } catch {}
      }
    }
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 78],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("zoomend", () => renderMarkers());

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    renderMarkers();
  }, [devices]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", zIndex: 1 }} />;
});

export default MapComponent;
