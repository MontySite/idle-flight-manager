"""
Downloads the OurAirports public CSV dataset and converts it to a compact
JSON file the game frontend can consume. Caches the result on disk so we
don't hammer the upstream every time the server starts.

Data source: https://ourairports.com/data/  (public domain, CC0)
"""
import csv
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
CACHE_DIR = Path(__file__).parent / "data"
OUT_FILE = CACHE_DIR / "airports.json"
TYPES_WE_WANT = {"large_airport", "medium_airport", "small_airport"}


def http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "IdleFlightManager/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_csv(raw: bytes) -> list[dict]:
    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    airports = []
    for row in reader:
        if row.get("type") not in TYPES_WE_WANT:
            continue
        iata = (row.get("iata_code") or "").strip().upper()
        icao = (row.get("icao_code") or "").strip().upper()
        ident = (row.get("ident") or "").strip().upper()
        code = iata or icao or ident
        if not code or len(code) not in (3, 4):
            continue
        try:
            lat = float(row["latitude_deg"])
            lon = float(row["longitude_deg"])
        except (TypeError, ValueError):
            continue
        airports.append({
            "id": code,
            "name": (row.get("name") or "").strip(),
            "city": (row.get("municipality") or "").strip(),
            "country": (row.get("iso_country") or "").strip(),
            "type": row["type"],
            "lat": lat,
            "lon": lon,
        })
    return airports


def main(force: bool = False) -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    raw_csv = OUT_FILE.with_suffix(".csv")
    if not force and OUT_FILE.exists() and raw_csv.exists():
        age_days = (time.time() - OUT_FILE.stat().st_mtime) / 86400
        if age_days < 30:
            print(f"[fetch_data] cache hit ({age_days:.1f}d old): {OUT_FILE}")
            return 0

    print(f"[fetch_data] downloading {OURAIRPORTS_URL} ...")
    try:
        data = http_get(OURAIRPORTS_URL)
    except Exception as exc:
        if OUT_FILE.exists():
            print(f"[fetch_data] download failed ({exc!r}), using cached file")
            return 0
        print(f"[fetch_data] FATAL: download failed and no cache: {exc!r}")
        return 1

    raw_csv.write_bytes(data)
    airports = parse_csv(data)
    OUT_FILE.write_text(json.dumps(airports, ensure_ascii=False), encoding="utf-8")
    print(f"[fetch_data] wrote {len(airports)} airports -> {OUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--force" in sys.argv))
