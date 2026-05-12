# SF street sweeping map

Static, mobile-friendly page: pick a **day of the week** (defaults to **today**) and see **street sweeping segments** on a map centered near **400 Duboce Ave**.

## One-time data prep

You need **Python 3** (stdlib only; no `pip`).

```bash
python3 scripts/split_sweeping.py \
  --src ~/Downloads/Street_Sweeping_Schedule_20260510.geojson \
  --out data/
```

The splitter adds **`cleaning_days_abbr`** (for example `TuTh`, `MW`) when the same segment — same **`corridor`**, **`limits`**, **`cnn`**, **`cnnrightleft`**, **`blockside`** — appears on **two or more weekdays** in the city export. The map uses that for orange arrows and multi-day tooltips.

If you already have split `data/*.geojson` files without that property, re-annotate in place (no master file needed):

```bash
python3 scripts/split_sweeping.py --annotate-existing data/
```

Commit the generated `data/*.geojson` files for GitHub Pages. You do **not** need to commit the full ~22 MB source file.

## Local preview

```bash
cd ~/Desktop/sf-sweeping-map
python3 -m http.server 8080
```

Open `http://localhost:8080` (not `file://`).

### Safari not showing your latest edits

Safari (especially on iPhone) **caches** `app.js` and `styles.css` aggressively. The IDE preview often bypasses that cache.

1. **Bump the cache-buster** in [`index.html`](index.html): change `styles.css?v=6` and `app.js?v=6` to the same new number (e.g. `?v=7`) whenever you change those files, then reload.
2. Or force-reload: **Mac Safari** — empty cache (**Develop → Empty Caches**, enable Develop menu in Safari Settings → Advanced). **iPhone** — close the tab, or Settings → Safari → **Clear History and Website Data** (heavy-handed), or add/remove a character in the URL.

GitHub Pages also caches; bump `?v=` after each deploy if Safari serves old JS.

## GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages**: deploy from branch **`/`** (root).
3. Open `https://<user>.github.io/<repo>/`.

## Map behavior

- Pick a **weekday** → map and list show **all** segments that have street cleaning on that day of the week (from the city dataset).
- **Arrows only** on the map (no drawn street lines). Invisible wide polylines stay under the route so you can still **tap** to open the popup. **▲** direction logic unchanged (Market NE/SW heuristic, etc.).

## Notes

- Segments like “Mon 1st & 3rd” still show for every Monday; check `fullname` for the pattern.
- Map tiles: [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
