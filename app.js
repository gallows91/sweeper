/* global L */

/** ~400 Duboce Ave / Duboce Triangle (WGS84) */
const DUBOCE = [37.76971, -122.42934];
const DEFAULT_ZOOM = 16;

/** Single-weekday segments: arrows + list strip. */
const ARROW_COLOR_DEFAULT = "#39ff14";
/** Multi-day (`cleaning_days_abbr`): arrows + list strip + tooltip accent. */
const ARROW_COLOR_MULTI = "#ff6b35";

/** Arrows along each line: spacing (m) and cap for performance on long blocks */
const ARROW_SPACING_M = 85;
const MAX_ARROWS_PER_LINE = 5;

const DAYS = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tues", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];

function todayKey() {
  return DAYS[new Date().getDay()].key;
}

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Bearing along Market toward downtown (~NE). Used so south-blockface
 * segments point ~NE and north-blockface ~SW, instead of raw GIS direction.
 */
const MARKET_TOWARD_DOWNTOWN_DEG = 54;

function angularDiffDeg(a, b) {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** North vs south *face* from `blockside` (e.g. NorthEast vs SouthEast). */
function blocksideNorthSouth(blockside) {
  const s = String(blockside || "");
  const hasNorth = /North/i.test(s);
  const hasSouth = /South/i.test(s);
  if (hasNorth && !hasSouth) return "north";
  if (hasSouth && !hasNorth) return "south";
  return "neutral";
}

/**
 * 0 or 180 — added to local segment bearing. Market + block face → ~NE / ~SW;
 * other streets: reverse for north-only block faces vs digitized line.
 */
function arrowFlipDeg(latlngs, corridor, blockside) {
  if (latlngs.length < 2) return 0;
  const bChord = bearingDeg(
    latlngs[0].lat,
    latlngs[0].lng,
    latlngs[latlngs.length - 1].lat,
    latlngs[latlngs.length - 1].lng,
  );
  const side = blocksideNorthSouth(blockside);
  const onMarket = /market/i.test(String(corridor || ""));

  if (onMarket && (side === "north" || side === "south")) {
    const target =
      side === "south"
        ? MARKET_TOWARD_DOWNTOWN_DEG
        : (MARKET_TOWARD_DOWNTOWN_DEG + 180) % 360;
    const d0 = angularDiffDeg(bChord, target);
    const d180 = angularDiffDeg((bChord + 180) % 360, target);
    return d180 < d0 ? 180 : 0;
  }
  if (!onMarket && side === "north") return 180;
  if (!onMarket && side === "south") return 0;
  return 0;
}

/** Flatten nested LatLng arrays (e.g. some multi-part lines). */
function flattenLatLngs(ll) {
  if (!ll?.length) return [];
  const first = ll[0];
  if (first && typeof first.lat === "number") return ll;
  return ll.flatMap(flattenLatLngs);
}

function polylineLengthM(latlngs) {
  let d = 0;
  for (let i = 1; i < latlngs.length; i += 1) {
    d += latlngs[i - 1].distanceTo(latlngs[i]);
  }
  return d;
}

/**
 * Point at distance `distM` from start along polyline + bearing of segment there.
 */
function pointAtDistance(latlngs, distM) {
  const total = polylineLengthM(latlngs);
  const target = Math.min(Math.max(0, distM), Math.max(total - 0.01, 0));
  let accum = 0;
  for (let i = 1; i < latlngs.length; i += 1) {
    const a = latlngs[i - 1];
    const b = latlngs[i];
    const seg = a.distanceTo(b);
    if (accum + seg >= target) {
      const t = seg > 0 ? (target - accum) / seg : 0;
      const lat = a.lat + t * (b.lat - a.lat);
      const lng = a.lng + t * (b.lng - a.lng);
      const brg = bearingDeg(a.lat, a.lng, b.lat, b.lng);
      return { latlng: L.latLng(lat, lng), bearing: brg };
    }
    accum += seg;
  }
  const a = latlngs[latlngs.length - 2];
  const b = latlngs[latlngs.length - 1];
  return {
    latlng: b,
    bearing: bearingDeg(a.lat, a.lng, b.lat, b.lng),
  };
}

/** e.g. MW, TuTh — only when source has 2+ weekdays (property omitted otherwise). */
function multiDayAbbr(p) {
  const x = String(p?.cleaning_days_abbr ?? p?.cleaningDaysAbbr ?? "").trim();
  if (x.length < 2) return "";
  return x;
}

function addDirectionArrows(polylineLayer, arrowGroup, feature) {
  let latlngs = polylineLayer.getLatLngs();
  latlngs = flattenLatLngs(latlngs);
  if (latlngs.length < 2) return;

  const total = polylineLengthM(latlngs);
  if (total < 2) return;

  const props = feature?.properties || {};
  const flip =
    arrowFlipDeg(latlngs, props.corridor, props.blockside) % 360;
  const isMulti = Boolean(multiDayAbbr(props));

  const positions = [];
  if (total <= ARROW_SPACING_M) {
    positions.push(total * 0.5);
  } else {
    let d = ARROW_SPACING_M * 0.45;
    while (d < total && positions.length < MAX_ARROWS_PER_LINE) {
      positions.push(d);
      d += ARROW_SPACING_M;
    }
    if (positions.length === 0) positions.push(total * 0.5);
  }

  for (const pos of positions) {
    const { latlng, bearing: bLocal } = pointAtDistance(latlngs, pos);
    const bearing = (bLocal + flip) % 360;
    const innerClass = isMulti
      ? "arrowhead-inner arrowhead-multi"
      : "arrowhead-inner";
    const icon = L.divIcon({
      className: "leaflet-arrowhead",
      html: `<div class="${innerClass}" style="transform:rotate(${bearing}deg)">▲</div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker(latlng, {
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 450,
    }).addTo(arrowGroup);
  }
}

function formatHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return String(h);
  const ampm = n >= 12 ? "PM" : "AM";
  const hr = n % 12 === 0 ? 12 : n % 12;
  return `${hr} ${ampm}`;
}

function buildMultiDayTooltipText(p) {
  const abbr = multiDayAbbr(p);
  if (!abbr) return "";
  const corridor = String(p.corridor ?? "").trim();
  const limits = String(p.limits ?? "").trim();
  const fullname = String(p.fullname ?? "").trim();
  const fh = p.fromhour ?? "";
  const th = p.tohour ?? "";
  const time =
    fh !== "" && th !== "" ? `${formatHour(fh)}–${formatHour(th)}` : "";
  const lines = [
    `Also cleaned on other weekdays: ${abbr}`,
    corridor || null,
    limits || null,
    time || null,
    fullname || null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildPopupEl(feature) {
  const p = feature.properties || {};
  const corridor = p.corridor ?? "";
  const limits = p.limits ?? "";
  const fullname = p.fullname ?? "";
  const fh = p.fromhour ?? "";
  const th = p.tohour ?? "";
  const time =
    fh !== "" && th !== "" ? `${formatHour(fh)}–${formatHour(th)}` : "";

  const root = document.createElement("div");
  root.className = "popup-sweep";

  const name = document.createElement("div");
  name.className = "p-name";
  name.textContent = corridor || "Street segment";
  root.appendChild(name);

  if (limits) {
    const row = document.createElement("div");
    row.className = "p-row";
    row.textContent = limits;
    root.appendChild(row);
  }

  if (time) {
    const row = document.createElement("div");
    row.className = "p-row";
    row.textContent = time;
    root.appendChild(row);
  }

  if (fullname) {
    const row = document.createElement("div");
    row.className = "p-row";
    row.textContent = fullname;
    root.appendChild(row);
  }

  const md = multiDayAbbr(p);
  if (md) {
    const lab = document.createElement("div");
    lab.className = "p-label";
    lab.textContent = "Other cleaning days";
    root.appendChild(lab);
    const row = document.createElement("div");
    row.className = "p-row";
    row.textContent = md;
    root.appendChild(row);
  }

  const hint = document.createElement("div");
  hint.className = "p-hint";
  hint.textContent =
    "Arrows use the line shape plus block face (north vs south) so Market runs ~NE / ~SW by curb; other streets flip for north-only faces. Verify signs.";
  root.appendChild(hint);

  return root;
}

const map = L.map("map", { zoomControl: true }).setView(DUBOCE, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const arrowLayer = L.layerGroup();

const geoLayer = L.geoJSON(null, {
  /** Invisible wide stroke so taps still open popups; only arrows are visible. */
  style: {
    color: "rgba(0,0,0,0)",
    weight: 14,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
  },
  onEachFeature(feature, layer) {
    layer.bindPopup(buildPopupEl(feature), { maxWidth: 260 });
    const p = feature.properties || {};
    if (multiDayAbbr(p)) {
      layer.bindTooltip(buildMultiDayTooltipText(p), {
        className: "sweep-tooltip-multi",
        sticky: true,
        opacity: 0.95,
      });
    }
    if (layer instanceof L.Polyline) {
      addDirectionArrows(layer, arrowLayer, feature);
    }
  },
}).addTo(map);

arrowLayer.addTo(map);

const daySelect = $("day-select");
const segmentList = $("segment-list");
const listCount = $("list-count");
const statusEl = $("status");

for (const { key, label } of DAYS) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = label;
  daySelect.appendChild(opt);
}

daySelect.value = todayKey();

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", Boolean(isError));
}

function clearList() {
  segmentList.replaceChildren();
}

function renderList(features) {
  clearList();
  let i = 0;
  for (const f of features) {
    const p = f.properties || {};
    const corridor = p.corridor ?? "";
    const limits = p.limits ?? "";
    const fullname = p.fullname ?? "";
    const fh = p.fromhour ?? "";
    const th = p.tohour ?? "";
    const time =
      fh !== "" && th !== "" ? `${formatHour(fh)}–${formatHour(th)}` : "";

    const md = multiDayAbbr(p);
    li.style.borderLeft = `4px solid ${
      md ? ARROW_COLOR_MULTI : ARROW_COLOR_DEFAULT
    }`;

    const title = document.createElement("div");
    title.className = "seg-title";
    title.textContent = corridor || "Street segment";

    const meta = document.createElement("div");
    meta.className = "seg-meta";
    meta.textContent = [limits, fullname, time].filter(Boolean).join(" · ");

    li.appendChild(title);
    li.appendChild(meta);

    const idx = i;
    li.addEventListener("click", () => {
      const layer = geoLayer.getLayers()[idx];
      if (layer?.getBounds?.()) {
        map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 17 });
        layer.openPopup?.();
      }
    });

    segmentList.appendChild(li);
    i += 1;
  }
}

async function loadDay(key) {
  setStatus("Loading…", false);
  arrowLayer.clearLayers();
  geoLayer.clearLayers();
  clearList();
  listCount.textContent = "";

  let fc;
  try {
    const res = await fetch(`data/${key}.geojson`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    fc = await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(`Could not load data (${msg})`, true);
    return;
  }

  const features = Array.isArray(fc.features) ? fc.features : [];
  geoLayer.addData(fc);
  renderList(features);
  listCount.textContent = `${features.length} streets / segments`;
  setStatus("", false);

  map.setView(DUBOCE, DEFAULT_ZOOM, { animate: false });
}

daySelect.addEventListener("change", () => {
  loadDay(daySelect.value);
});

window.addEventListener("resize", () => {
  map.invalidateSize();
});

loadDay(daySelect.value);
