#!/usr/bin/env python3
import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path

ALLOWED_CHANGED = {"assets/browser-tool.zip"}

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def entries(path: Path):
    with zipfile.ZipFile(path, "r") as z:
        return {info.filename: digest(z.read(info.filename)) for info in z.infolist()}

def inspect_browser_tool(apk: Path):
    with zipfile.ZipFile(apk, "r") as z:
        blob = z.read("assets/browser-tool.zip")
    with zipfile.ZipFile(io.BytesIO(blob), "r") as nested:
        index = nested.read("lib/index.js").decode("utf-8")
        package = json.loads(nested.read("package.json").decode("utf-8"))
    required = [
        "userQuestions",
        "CONTROL_LEASE_MS",
        "DEVICE_MODES",
        "requestControl",
        "action === 'device'",
        "networkUserAgentChanged = false",
    ]
    missing = [x for x in required if x not in index]
    return package.get("version"), missing

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, type=Path)
    ap.add_argument("--candidate", required=True, type=Path)
    args = ap.parse_args()

    base = entries(args.base)
    cand = entries(args.candidate)

    if set(base) != set(cand):
        missing = sorted(set(base) - set(cand))
        extra = sorted(set(cand) - set(base))
        raise SystemExit(f"ENTRY_SET_MISMATCH missing={missing[:20]} extra={extra[:20]}")

    changed = sorted(name for name in base if base[name] != cand[name])
    unexpected = [name for name in changed if name not in ALLOWED_CHANGED]
    if unexpected:
        raise SystemExit(f"UNEXPECTED_ENTRY_CHANGES={unexpected[:50]}")
    if changed != sorted(ALLOWED_CHANGED):
        raise SystemExit(f"EXPECTED_ONLY_BROWSER_TOOL_CHANGE actual={changed}")

    version, missing_markers = inspect_browser_tool(args.candidate)
    if version != "1.1.0":
        raise SystemExit(f"BROWSER_TOOL_VERSION_BAD={version}")
    if missing_markers:
        raise SystemExit(f"BROWSER_TOOL_MARKERS_MISSING={missing_markers}")

    print("VERIFY=PASS")
    print(f"BASE_SHA256={file_sha(args.base)}")
    print(f"CANDIDATE_SHA256={file_sha(args.candidate)}")
    print("ENTRY_SET_IDENTICAL=YES")
    print("ONLY_CHANGED_ENTRY=assets/browser-tool.zip")
    print("BROWSER_TOOL_VERSION=1.1.0")
    print("CLASSES_DEX_UNCHANGED=YES")
    print("BROWSER_PANE_UNCHANGED=YES")

if __name__ == "__main__":
    main()
