"""Download the pinned upstream tables and original PNGs using only Python's standard library."""

import argparse
import concurrent.futures
import hashlib
import http.client
import json
from pathlib import Path
import struct
import threading
import time
from urllib.parse import urlsplit
import zlib


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data/sources"
CONNECTIONS = threading.local()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def png_dimensions(data):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Not a PNG")
    offset = 8
    dimensions = None
    while offset + 12 <= len(data):
        size = struct.unpack_from(">I", data, offset)[0]
        end = offset + 12 + size
        if end > len(data):
            raise ValueError("Truncated PNG chunk")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + size]
        crc = struct.unpack_from(">I", data, offset + 8 + size)[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise ValueError("PNG CRC mismatch")
        if kind == b"IHDR":
            dimensions = struct.unpack_from(">II", payload)
        if kind == b"IEND":
            # A few original upstream files have NUL padding after IEND. Preserve it for byte-for-byte fidelity.
            if not dimensions or not all(dimensions) or any(data[end:]):
                raise ValueError("Invalid PNG dimensions or trailing bytes")
            return dimensions
        offset = end
    raise ValueError("PNG has no IEND")


def validate(data, entry):
    if len(data) != entry["bytes"]:
        raise ValueError("File size mismatch")
    header = f"blob {len(data)}\0".encode("ascii")
    if hashlib.sha1(header + data).hexdigest() != entry["git_blob_sha1"]:
        raise ValueError("Upstream Git blob hash mismatch")
    return png_dimensions(data) if entry["path"].endswith(".png") else None


def make_manifest():
    revisions = {name: read_json(SOURCES / f"{name}-revision.json") for name in ("pokeapi", "sprites")}
    entries = []

    def add(repo, item, upstream_path, local_path, category):
        commit = revisions[repo]["commit"]
        entries.append({
            "path": local_path, "category": category, "bytes": item["size"], "git_blob_sha1": item["sha"],
            "url": f"https://raw.githubusercontent.com/PokeAPI/{repo}/{commit}/{upstream_path}",
        })

    data_tree = read_json(SOURCES / "pokeapi-tree.json")
    if data_tree.get("truncated"):
        raise ValueError("Incomplete data tree")
    for item in data_tree["tree"]:
        path = item["path"]
        if item["type"] == "blob" and path.startswith("data/v2/csv/") and path.endswith(".csv"):
            add("pokeapi", item, path, "data/raw/pokeapi/" + Path(path).name, "table")
        elif path == "LICENSE.md":
            add("pokeapi", item, path, "data/sources/POKEAPI-LICENSE.md", "license")

    groups = [
        ("pokemon", "sprites/pokemon", "assets/pokemon/front", "front"),
        ("female", "sprites/pokemon/female", "assets/pokemon/front/female", "front_female"),
        ("back", "sprites/pokemon/back", "assets/pokemon/back", "back"),
        ("shiny", "sprites/pokemon/shiny", "assets/pokemon/front/shiny", "front_shiny"),
        ("artwork", "sprites/pokemon/other/official-artwork", "assets/pokemon/artwork", "artwork"),
    ]
    for name, source, target, category in groups:
        tree = read_json(SOURCES / f"sprites-{name}.json")
        if tree.get("truncated"):
            raise ValueError(f"Incomplete sprite tree: {name}")
        for item in tree["tree"]:
            path = item["path"]
            if item["type"] != "blob" or not path.endswith(".png"):
                continue
            # Large shiny artwork is outside this import; shiny pixel sprites are small enough to retain.
            if name == "artwork" and "shiny" in Path(path).parts:
                continue
            add("sprites", item, f"{source}/{path}", f"{target}/{path}", category)

    for item in read_json(SOURCES / "sprites-root.json")["tree"]:
        if item["path"] in ("LICENCE.txt", "README.md", "CONTRIBUTING_SPRITES.md"):
            add("sprites", item, item["path"], "data/sources/SPRITES-" + item["path"], "source_notice")
    return {"sources": revisions, "files": sorted(entries, key=lambda entry: entry["path"])}


def process_file(entry, verify_only):
    path = ROOT / entry["path"]
    try:
        dimensions = validate(path.read_bytes(), entry)
        return {"path": entry["path"], "status": "verified", "dimensions": dimensions}
    except (OSError, ValueError, struct.error) as error:
        if verify_only:
            return {"path": entry["path"], "status": "failed", "error": str(error)}

    for attempt in range(4):
        try:
            url = urlsplit(entry["url"])
            if not getattr(CONNECTIONS, "connection", None):
                CONNECTIONS.connection = http.client.HTTPSConnection(url.netloc, timeout=45)
            CONNECTIONS.connection.request("GET", url.path, headers={"User-Agent": "AFK-Pokemon-offline-data/1.0"})
            response = CONNECTIONS.connection.getresponse()
            data = response.read()
            if response.status != 200:
                raise OSError(f"HTTP {response.status}")
            dimensions = validate(data, entry)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".part")
            temporary.write_bytes(data)
            temporary.replace(path)
            return {"path": entry["path"], "status": "downloaded", "dimensions": dimensions}
        except (OSError, ValueError, struct.error, http.client.HTTPException) as error:
            if getattr(CONNECTIONS, "connection", None):
                CONNECTIONS.connection.close()
                CONNECTIONS.connection = None
            if attempt == 3:
                return {"path": entry["path"], "status": "failed", "error": str(error)}
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Check every local hash and PNG without network access")
    parser.add_argument("--workers", type=int, default=8, choices=range(1, 17), metavar="1..16")
    args = parser.parse_args()
    manifest = make_manifest()
    write_json(ROOT / "data/download-manifest.json", manifest)
    entries = manifest["files"]
    total_bytes = sum(entry["bytes"] for entry in entries)
    print(f"Selected {len(entries)} files, {total_bytes / 1024 ** 2:.1f} MiB", flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        ordered = sorted(entries, key=lambda entry: (entry["category"] != "table", entry["path"]))
        futures = [pool.submit(process_file, entry, args.verify) for entry in ordered]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            if result["status"] == "failed":
                print(json.dumps(result, ensure_ascii=True), flush=True)
            if len(results) % 250 == 0 or result["status"] == "failed":
                failures = sum(item["status"] == "failed" for item in results)
                print(f"{len(results)}/{len(entries)}, failures={failures}", flush=True)
    failed = [result for result in results if result["status"] == "failed"]
    report = {"files": len(entries), "bytes": total_bytes, "failures": failed, "results": sorted(results, key=lambda x: x["path"])}
    write_json(ROOT / "data/download-report.json", report)
    print(f"Finished: {len(results) - len(failed)} valid files; {len(failed)} failures", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
