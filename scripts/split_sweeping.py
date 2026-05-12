#!/usr/bin/env python3
"""Split SF street sweeping FeatureCollection into per-weekday GeoJSON files (stdlib only).

Also sets ``cleaning_days_abbr`` (e.g. ``MW``, ``TuTh``) when the same segment
(same corridor, limits, cnn, cnnrightleft, blockside) appears on two or more
weekdays in the source — required for multi-day styling on the map.

Re-annotate already-split files under ``data/`` without the master export::

    python3 scripts/split_sweeping.py --annotate-existing data/
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
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

DAY_ORDER = ("Mon", "Tues", "Wed", "Thu", "Fri", "Sat", "Sun")
DAY_ABBR: dict[str, str] = {
    "Mon": "M",
    "Tues": "Tu",
    "Wed": "W",
    "Thu": "Th",
    "Fri": "F",
    "Sat": "Sa",
    "Sun": "Su",
}


def segment_key(props: object) -> tuple[object, ...]:
    if not isinstance(props, dict):
        return (None, None, None, None, None)
    return (
        props.get("corridor"),
        props.get("limits"),
        props.get("cnn"),
        props.get("cnnrightleft"),
        props.get("blockside"),
    )


def weekdays_to_abbr(days: set[str]) -> str:
    ordered = [d for d in DAY_ORDER if d in days]
    return "".join(DAY_ABBR[d] for d in ordered)


def multiday_sets_from_features(features: list[object]) -> dict[tuple[object, ...], set[str]]:
    key_to_days: dict[tuple[object, ...], set[str]] = defaultdict(set)
    for feat in features:
        if not isinstance(feat, dict):
            continue
        props = feat.get("properties")
        if not isinstance(props, dict):
            continue
        wd = props.get("weekday")
        if not isinstance(wd, str) or wd not in DAY_ABBR:
            continue
        key_to_days[segment_key(props)].add(wd)
    return key_to_days


def abbr_for_props(
    props: dict[str, object], key_to_days: dict[tuple[object, ...], set[str]]
) -> str | None:
    days = key_to_days.get(segment_key(props))
    if not days or len(days) < 2:
        return None
    return weekdays_to_abbr(days)


def enrich_feature(
    feat: object, key_to_days: dict[tuple[object, ...], set[str]]
) -> dict[str, object]:
    if not isinstance(feat, dict):
        return {}
    props = dict(feat.get("properties") or {})
    abbr = abbr_for_props(props, key_to_days)
    if abbr:
        props["cleaning_days_abbr"] = abbr
    else:
        props.pop("cleaning_days_abbr", None)
    return {**feat, "properties": props}


def annotate_existing_data_dir(out: Path) -> None:
    combined: list[object] = []
    per_stem: dict[str, list[object]] = {}
    for stem in WEEKDAY_TO_STEM.values():
        path = out / f"{stem}.geojson"
        if not path.exists():
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        feats = raw.get("features", [])
        if not isinstance(feats, list):
            continue
        per_stem[stem] = feats
        combined.extend(feats)

    key_to_days = multiday_sets_from_features(combined)

    for stem, feats in per_stem.items():
        new_feats = [enrich_feature(f, key_to_days) for f in feats]
        out_path = out / f"{stem}.geojson"
        fc = {"type": "FeatureCollection", "features": new_feats}
        out_path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
        multi = sum(
            1
            for f in new_feats
            if isinstance(f, dict)
            and isinstance(f.get("properties"), dict)
            and f["properties"].get("cleaning_days_abbr")
        )
        print(f"{stem}: {len(new_feats)} features ({multi} multi-day) -> {out_path}")


def split_from_src(src: Path, out: Path) -> None:
    raw = json.loads(src.read_text(encoding="utf-8"))
    if raw.get("type") != "FeatureCollection":
        raise SystemExit("Expected a FeatureCollection")

    features = raw.get("features", [])
    if not isinstance(features, list):
        raise SystemExit("Invalid features array")

    key_to_days = multiday_sets_from_features(features)

    buckets: dict[str, list[object]] = {s: [] for s in WEEKDAY_TO_STEM.values()}
    skipped = 0

    for feat in features:
        if not isinstance(feat, dict):
            skipped += 1
            continue
        feat_e = enrich_feature(feat, key_to_days)
        props = feat_e.get("properties") or {}
        wd = props.get("weekday")
        if not isinstance(wd, str):
            skipped += 1
            continue
        stem = WEEKDAY_TO_STEM.get(wd)
        if stem is None:
            skipped += 1
            continue
        buckets[stem].append(feat_e)

    out.mkdir(parents=True, exist_ok=True)
    for stem, bucket_feats in buckets.items():
        out_path = out / f"{stem}.geojson"
        fc = {"type": "FeatureCollection", "features": bucket_feats}
        out_path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
        print(f"{stem}: {len(bucket_feats)} features -> {out_path}")

    print(f"skipped (holiday/unknown): {skipped}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--src", type=Path, help="City export FeatureCollection (.geojson)")
    g.add_argument(
        "--annotate-existing",
        type=Path,
        metavar="DIR",
        help="Re-write mon..sun.geojson in DIR with cleaning_days_abbr from cross-file keys",
    )
    p.add_argument("--out", type=Path, default=Path("data"))
    args = p.parse_args()

    if args.annotate_existing is not None:
        annotate_existing_data_dir(args.annotate_existing)
        return

    split_from_src(args.src, args.out)


if __name__ == "__main__":
    main()
