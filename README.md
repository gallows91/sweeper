# SF street sweeping map

Static, mobile-friendly page: pick a **day of the week** (defaults to **today**) and see **street sweeping segments** on a map centered near **400 Duboce Ave**.

## One-time data prep

You need **Python 3** (stdlib only; no `pip`).

```bash
python3 scripts/split_sweeping.py \
  --src ~/Downloads/Street_Sweeping_Schedule_20260510.geojson \
  --out data/
```

Commit the generated `data/*.geojson` files for GitHub Pages. You do **not** need to commit the full ~22 MB source file.

## Local preview

```bash
cd ~/Desktop/sf-sweeping-map
python3 -m http.server 8080
```

Open `http://localhost:8080` (not `file://`).

## GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages**: deploy from branch **`/`** (root).
3. Open `https://<user>.github.io/<repo>/`.

## Map behavior

- Pick a **weekday** → map and list show **all** segments that have street cleaning on that day of the week (from the city dataset).
- One **orange** line per segment. Tap a line or list row for block, hours, and schedule text. **Holiday** rows are omitted when building `data/`.

## Notes

- Segments like “Mon 1st & 3rd” still show for every Monday; check `fullname` for the pattern.
- Map tiles: [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
