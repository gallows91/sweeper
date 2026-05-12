#!/usr/bin/env python3
"""Split SF street sweeping FeatureCollection into per-weekday GeoJSON files (stdlib only)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

WEEKDAY_TO_STEM: dict[str, str] = {
    "Mon": "mon",
    "Tues": "tues",
    "Wed": "wed",
    "Thu": "thu",
    "Fri": "fri",
    "Sat": "sat",
    "Sun": "sun",
}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("data"))
    args = p.parse_args()

    raw = json.loads(args.src.read_text(encoding="utf-8"))
    if raw.get("type") != "FeatureCollection":
        raise SystemExit("Expected a GeoJSON FeatureCollection")

    buckets: dict[str, list[object]] = {s: [] for s in WEEKDAY_TO_STEM.values()}
    skipped = 0

    for feat in raw.get("features", []):
        props = feat.get("properties") or {}
        wd = props.get("weekday")
        if not isinstance(wd, str):
            skipped += 1
            continue
        stem = WEEKDAY_TO_STEM.get(wd)
        if stem is None:
            skipped += 1
            continue
        buckets[stem].append(feat)

    args.out.mkdir(parents=True, exist_ok=True)
    for stem, features in buckets.items():
        out_path = args.out / f"{stem}.geojson"
        fc = {"type": "FeatureCollection", "features": features}
        out_path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
        print(f"{stem}: {len(features)} features -> {out_path}")

    print(f"skipped (holiday/unknown): {skipped}")


if __name__ == "__main__":
    main()
