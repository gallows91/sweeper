/* global L */

/** ~400 Duboce Ave / Duboce Triangle (WGS84) */
const DUBOCE = [37.76958, -122.43335];
const DEFAULT_ZOOM = 15;

/** All cleaning segments use one map color */
const LINE_COLOR = "#ff6b35";

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

function formatHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return String(h);
  const ampm = n >= 12 ? "PM" : "AM";
  const hr = n % 12 === 0 ? 12 : n % 12;
  return `${hr} ${ampm}`;
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

  const hint = document.createElement("div");
  hint.className = "p-hint";
  hint.textContent = "No parking during posted sweep hours — verify signs.";
  root.appendChild(hint);

  return root;
}

const map = L.map("map", { zoomControl: true }).setView(DUBOCE, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const geoLayer = L.geoJSON(null, {
  style: {
    color: LINE_COLOR,
    weight: 4,
    opacity: 0.9,
  },
  onEachFeature(feature, layer) {
    layer.bindPopup(buildPopupEl(feature), { maxWidth: 260 });
  },
}).addTo(map);

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

    const li = document.createElement("li");
    li.style.borderLeft = `4px solid ${LINE_COLOR}`;

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
