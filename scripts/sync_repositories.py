#!/usr/bin/env python3
import csv
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "registry" / "packages.tsv"
MANIFEST = ROOT / "manifest.json"
STATE = ROOT / "registry" / "repo-sync.json"
OWNER = "baska-pro"
HUB_FULL_NAME = "baska-pro/baska-hub"


def api_get(url, token=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "baska-hub-repo-sync/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp), resp.headers


def fetch_repositories(token=None):
    repos = []
    page = 1
    # Public owner listing always works. With a PAT, merge in private repos accessible to the token.
    while True:
        data, _ = api_get(f"https://api.github.com/users/{OWNER}/repos?per_page=100&page={page}&sort=created&direction=asc", token=None)
        if not data:
            break
        repos.extend(data)
        if len(data) < 100:
            break
        page += 1

    if token:
        page = 1
        seen = {r["id"] for r in repos}
        while True:
            data, _ = api_get(f"https://api.github.com/user/repos?per_page=100&page={page}&affiliation=owner&sort=created&direction=asc", token=token)
            if not data:
                break
            for repo in data:
                if repo.get("owner", {}).get("login", "").lower() == OWNER.lower() and repo["id"] not in seen:
                    repos.append(repo)
                    seen.add(repo["id"])
            if len(data) < 100:
                break
            page += 1

    repos.sort(key=lambda r: (r.get("created_at") or "", r["id"]))
    return repos


def slugify(name):
    slug = name.strip().lower().replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "repository"


def read_registry():
    with REGISTRY.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def write_registry(rows):
    fields = ["id", "slug", "aliases", "name", "category", "type", "version", "platforms", "source", "action", "sha256", "description"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, delimiter="\t", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    REGISTRY.write_text(buf.getvalue(), encoding="utf-8")


def registry_row_for_repo(repo, package_id):
    slug = slugify(repo["name"])
    alias = slug.replace("-", "")
    visibility = "privat" if repo.get("private") else "publik"
    return {
        "id": package_id,
        "slug": slug,
        "aliases": alias,
        "name": repo["name"],
        "category": "repositories",
        "type": "repo",
        "version": "repo",
        "platforms": "all",
        "source": repo["clone_url"],
        "action": "git",
        "sha256": "-",
        "description": f"Repository {visibility} {repo['full_name']}; baska install akan clone/update repository.",
    }


def manifest_package_from_row(row):
    aliases = [x for x in row["aliases"].split(",") if x]
    action = row["action"]
    install = {"action": action}
    if action.startswith("recipe:"):
        install = {"action": "recipe", "recipe": action.split(":", 1)[1]}
    elif action == "open":
        install = {"action": "open", "requires_confirmation": True}
    return {
        "id": row["id"],
        "slug": row["slug"],
        "aliases": aliases,
        "name": row["name"],
        "category": row["category"],
        "type": row["type"],
        "version": row["version"],
        "platforms": row["platforms"].split(","),
        "source": row["source"],
        "install": install,
        "sha256": None if row["sha256"] in ("", "-") else row["sha256"],
        "description": row["description"],
    }


def main():
    token = os.getenv("BASKA_GH_PAT") or os.getenv("GH_PAT") or None
    repos = fetch_repositories(token)
    state = json.loads(STATE.read_text(encoding="utf-8"))
    rows = read_registry()

    by_id = {r["id"]: r for r in rows}
    repo_state = state.setdefault("repositories", {})
    excluded = set(state.get("exclude_repository_ids", []))
    next_id = int(state.get("next_id", 1))
    changed = False

    for repo in repos:
        if repo["full_name"].lower() == HUB_FULL_NAME.lower() or repo["id"] in excluded:
            continue
        key = str(repo["id"])
        if key in repo_state:
            package_id = repo_state[key]["package_id"]
            # Preserve hand-crafted package definitions such as server-control recipe.
            if package_id in by_id and by_id[package_id]["category"] != "repositories":
                repo_state[key]["full_name"] = repo["full_name"]
                continue
            new_row = registry_row_for_repo(repo, package_id)
            if package_id not in by_id or by_id[package_id] != new_row:
                by_id[package_id] = new_row
                changed = True
            repo_state[key]["full_name"] = repo["full_name"]
            continue

        while f"{next_id:05d}" in by_id:
            next_id += 1
        package_id = f"{next_id:05d}"
        next_id += 1
        repo_state[key] = {"package_id": package_id, "full_name": repo["full_name"]}
        by_id[package_id] = registry_row_for_repo(repo, package_id)
        changed = True
        print(f"NEW {package_id} {repo['full_name']}")

    state["next_id"] = next_id
    state["repositories"] = repo_state

    ordered = sorted(by_id.values(), key=lambda r: int(r["id"]))
    if changed:
        write_registry(ordered)

    # Manifest is derived from the authoritative TSV registry on every run.
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["packages"] = [manifest_package_from_row(r) for r in ordered]
    manifest["repo_sync"] = {
        "state": "registry/repo-sync.json",
        "workflow": ".github/workflows/sync-repositories.yml",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    public_count = sum(1 for r in repos if not r.get("private"))
    private_count = sum(1 for r in repos if r.get("private"))
    print(f"SYNC OK: {len(repos)} repo terlihat ({public_count} publik, {private_count} privat). next_id={next_id:05d}")
    if not token:
        print("INFO: BASKA_GH_PAT tidak tersedia; repo privat baru tidak dapat dideteksi otomatis.")


if __name__ == "__main__":
    main()
