#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "registry" / "catalog.json"
OVERRIDES = ROOT / "registry" / "overrides.json"
ALLOWED_PLATFORMS = {"all", "linux", "termux", "windows", "macos"}
ALLOWED_ACTIONS = {"smart", "git", "open", "download", "file", "executable"}


def fail(msg: str) -> None:
    raise SystemExit(f"AUDIT FAIL: {msg}")


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")).get("repositories", {})
    packages = catalog.get("packages", [])

    ids = set()
    slugs = set()
    checked = 0
    for p in packages:
        pid = str(p.get("id", ""))
        slug = p.get("slug")
        if not pid or not slug:
            fail("package without id/slug")
        if pid in ids:
            fail(f"duplicate id {pid}")
        if slug in slugs:
            fail(f"duplicate slug {slug}")
        ids.add(pid); slugs.add(slug)

        if p.get("visibility") == "private":
            fail(f"private package leaked into public catalog: {slug}")

        platforms = set(p.get("platforms") or [])
        if not platforms or not platforms <= ALLOWED_PLATFORMS:
            fail(f"invalid platforms for {slug}: {sorted(platforms)}")

        if p.get("type") != "repo":
            checked += 1
            continue

        action = str(p.get("action") or "git")
        recipe = p.get("recipe")
        if action.startswith("recipe:"):
            recipe = action.split(":", 1)[1]
            if not (ROOT / recipe).is_file():
                fail(f"missing recipe for {slug}: {recipe}")
        elif action not in ALLOWED_ACTIONS:
            fail(f"unknown action for {slug}: {action}")

        status = p.get("status")
        if status == "ready" and action == "git":
            fail(f"{slug} marked ready but only has git action")

        rid = str(p.get("repository_id") or "")
        override = overrides.get(rid)
        if rid and override is None:
            fail(f"public repo {slug} has no explicit install policy in overrides.json")

        if action == "smart" and not p.get("installer_indicators"):
            # A deliberate smart override is allowed for a single-file entrypoint
            # such as a top-level .sh/.cmd that runtime v1.2 can expose.
            if slug not in {"siskamling-digital", "windows-shortcut-control"}:
                fail(f"smart action for {slug} has no installer indicators")

        checked += 1

    # ID format policy.
    for pid in ids:
        if not re.fullmatch(r"(?:\d{5}|A\d{5})", pid):
            fail(f"invalid public ID: {pid}")

    print(f"AUDIT OK: {checked} public packages have a valid installation policy")


if __name__ == "__main__":
    main()
