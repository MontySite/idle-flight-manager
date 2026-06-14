"""
Flask server for the Idle Flight Manager game.

- On startup, ensures airports.json is present (runs fetch_data).
- Serves the static frontend (HTML/CSS/JS).
- Exposes a single JSON API: GET /api/airports -> list of airports.

Run:
    pip install flask
    python app.py
Then open http://localhost:5000
"""
import json
import sys
from pathlib import Path

from flask import Flask, jsonify, send_from_directory

import fetch_data

ROOT = Path(__file__).parent
FRONTEND = ROOT.parent / "frontend"
DATA_FILE = ROOT / "data" / "airports.json"

app = Flask(__name__, static_folder=str(FRONTEND), static_url_path="")


def load_airports() -> list[dict]:
    if not DATA_FILE.exists():
        rc = fetch_data.main()
        if rc != 0 or not DATA_FILE.exists():
            return []
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[app] failed to read {DATA_FILE}: {exc!r}", file=sys.stderr)
        return []


@app.route("/api/airports")
def api_airports():
    return jsonify(load_airports())


@app.route("/api/health")
def api_health():
    return jsonify({"ok": True, "airports": len(load_airports())})


@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(FRONTEND, path)


if __name__ == "__main__":
    fetch_data.main()
    n = len(load_airports())
    print(f"[app] loaded {n} airports, starting server on http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
