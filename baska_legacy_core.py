#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import csv
import getpass
import hashlib
import json
import os
import platform as py_platform
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.0.0"
OWNER = os.getenv("BASKA_OWNER", "baska-pro")
HUB_REPO = os.getenv("BASKA_HUB_REPO", f"{OWNER}/baska-hub")
HUB_BRANCH = os.getenv("BASKA_HUB_BRANCH", "main")
RAW_BASE = f"https://raw.githubusercontent.com/{HUB_REPO}/{HUB_BRANCH}"

HOME = Path(os.getenv("BASKA_HOME", str(Path.home() / ".baska"))).expanduser()
CACHE = HOME / "cache"
PACKAGES = HOME / "packages"
STATE_FILE = HOME / "state.json"
CONFIG_FILE = HOME / "config.json"
PRIVATE_FILE = HOME / "private_catalog.json"
TOKEN_FILE = HOME / "auth" / "token"
CATALOG_FILE = CACHE / "catalog.json"
COLLECTIONS_FILE = CACHE / "collections.json"

for p in (HOME, CACHE, PACKAGES, TOKEN_FILE.parent):
    p.mkdir(parents=True, exist_ok=True)

IS_TTY = sys.stdout.isatty()
C = {
    "reset": "\033[0m" if IS_TTY else "",
    "bold": "\033[1m" if IS_TTY else "",
    "dim": "\033[2m" if IS_TTY else "",
    "cyan": "\033[36m" if IS_TTY else "",
    "green": "\033[32m" if IS_TTY else "",
    "yellow": "\033[33m" if IS_TTY else "",
    "red": "\033[31m" if IS_TTY else "",
}

def color(name: str, text: str) -> str:
    return f"{C[name]}{text}{C['reset']}"

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)

def state() -> dict:
    return load_json(STATE_FILE, {"schema_version": 1, "installed": {}, "notifications": [], "catalog_ids": []})

def save_state(data: dict) -> None:
    save_json(STATE_FILE, data)

def config() -> dict:
    return load_json(CONFIG_FILE, {
        "schema_version": 1,
        "github_initialized": False,
        "github_user": None,
        "auto_refresh": True,
        "smart_install": True,
        "favorites": [],
    })

def save_config(data: dict) -> None:
    save_json(CONFIG_FILE, data)

def run(cmd, cwd: Path | None = None, check: bool = True, capture: bool = False,
        env: dict | None = None, shell: bool = False):
    kwargs = {
        "cwd": str(cwd) if cwd else None,
        "check": check,
        "text": True,
        "env": env,
        "shell": shell,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    return subprocess.run(cmd, **kwargs)

def command_exists(name: str) -> bool:
    return shutil.which(name) is not None

def detect_platform() -> str:
    if os.getenv("TERMUX_VERSION") or "com.termux" in os.getenv("PREFIX", ""):
        return "termux"
    sysname = py_platform.system().lower()
    if sysname == "windows":
        return "windows"
    if sysname == "darwin":
        return "macos"
    if sysname == "linux":
        return "linux"
    msystem = os.getenv("MSYSTEM", "").lower()
    if "mingw" in msystem or "msys" in msystem or "cygwin" in msystem:
        return "windows"
    return sysname or "unknown"

def detect_arch() -> str:
    machine = py_platform.machine().lower()
    aliases = {
        "amd64": "x86_64",
        "x64": "x86_64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }
    return aliases.get(machine, machine or "unknown")

def http_get(url: str, token: str | None = None, timeout: int = 25):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": f"baska-cli/{VERSION}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
        if "json" in content_type or url.startswith("https://api.github.com/"):
            return json.loads(data.decode("utf-8"))
        return data

def download(url: str, target: Path, token: str | None = None) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": f"baska-cli/{VERSION}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp, target.open("wb") as fh:
        shutil.copyfileobj(resp, fh)
    return target

def notify(kind: str, message: str) -> None:
    s = state()
    item = {"id": f"{int(time.time()*1000)}", "time": now_iso(), "kind": kind, "message": message, "read": False}
    s.setdefault("notifications", []).insert(0, item)
    s["notifications"] = s["notifications"][:100]
    save_state(s)

def refresh(silent: bool = False) -> None:
    old_catalog = load_json(CATALOG_FILE, {"packages": []})
    old_ids = {p.get("id") for p in old_catalog.get("packages", [])}
    try:
        download(f"{RAW_BASE}/registry/catalog.json", CATALOG_FILE)
        download(f"{RAW_BASE}/registry/collections.json", COLLECTIONS_FILE)
    except Exception as exc:
        if not silent:
            print(color("red", f"Gagal refresh: {exc}"))
        if not CATALOG_FILE.exists():
            raise
        return

    new_catalog = load_json(CATALOG_FILE, {"packages": []})
    new_ids = {p.get("id") for p in new_catalog.get("packages", [])}
    added = [p for p in new_catalog.get("packages", []) if p.get("id") in (new_ids - old_ids)]
    if old_ids and added:
        names = ", ".join(p.get("slug", p.get("id")) for p in added[:5])
        notify("catalog", f"{len(added)} paket/repo baru: {names}")
    s = state()
    s["catalog_ids"] = sorted(x for x in new_ids if x)
    s["last_refresh"] = now_iso()
    save_state(s)
    if not silent:
        print(color("green", "Katalog diperbarui."))

def ensure_catalog() -> None:
    cfg = config()
    if not CATALOG_FILE.exists():
        refresh(silent=True)
    elif cfg.get("auto_refresh"):
        try:
            age = time.time() - CATALOG_FILE.stat().st_mtime
            if age > 3600:
                refresh(silent=True)
        except OSError:
            pass

def gh_token() -> str | None:
    for key in ("BASKA_GITHUB_TOKEN", "GH_TOKEN"):
        if os.getenv(key):
            return os.getenv(key)
    if command_exists("gh"):
        try:
            p = run(["gh", "auth", "token"], check=True, capture=True)
            token = p.stdout.strip()
            if token:
                return token
        except Exception:
            pass
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text(encoding="utf-8").strip() or None
    return None

def verify_github_auth(token: str | None = None, silent: bool = False) -> tuple[bool, str | None]:
    token = token or gh_token()
    if not token:
        return False, None
    try:
        user = http_get("https://api.github.com/user", token=token)
        login = user.get("login")
        ok = bool(login and login.lower() == OWNER.lower())
        if not ok and not silent:
            print(color("red", f"Akun GitHub aktif '{login}', tetapi BASKA membutuhkan '{OWNER}'."))
        return ok, login
    except Exception as exc:
        if not silent:
            print(color("red", f"Gagal memverifikasi GitHub: {exc}"))
        return False, None

def fetch_private_repositories(token: str) -> list[dict]:
    repos = []
    page = 1
    while True:
        url = (
            "https://api.github.com/user/repos?"
            + urllib.parse.urlencode({
                "per_page": 100,
                "page": page,
                "affiliation": "owner",
                "visibility": "private",
                "sort": "created",
                "direction": "desc",
            })
        )
        data = http_get(url, token=token)
        if not data:
            break
        repos.extend(
            r for r in data
            if r.get("owner", {}).get("login", "").lower() == OWNER.lower()
            and r.get("private")
        )
        if len(data) < 100:
            break
        page += 1
    repos.sort(key=lambda r: (r.get("created_at") or "", r.get("id", 0)), reverse=True)
    return repos

def private_package_from_repo(repo: dict, package_id: str) -> dict:
    name = repo["name"]
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    topics = list(repo.get("topics") or [])
    language = repo.get("language")
    if language:
        topics.append(language.lower())
    return {
        "id": package_id,
        "slug": slug,
        "aliases": [slug.replace("-", "")],
        "name": name,
        "category": "repositories",
        "type": "repo",
        "version": "repo",
        "platforms": ["all"],
        "architectures": ["all"],
        "source": repo["clone_url"],
        "action": "smart",
        "trust": "reviewed",
        "status": "discovered",
        "visibility": "private",
        "repository_id": repo["id"],
        "created_at": repo.get("created_at"),
        "updated_at": repo.get("updated_at"),
        "pushed_at": repo.get("pushed_at"),
        "language": language,
        "tags": sorted(set(topics)),
        "dependencies": ["git"],
        "description": repo.get("description") or f"Private repository {repo['full_name']}.",
        "latest_release": None,
    }

def init_github() -> None:
    token = gh_token()
    if not token:
        if not sys.stdin.isatty():
            raise SystemExit("Tidak ada autentikasi GitHub. Gunakan GH_TOKEN/BASKA_GITHUB_TOKEN atau jalankan interaktif.")
        print("Masukkan GitHub Personal Access Token dengan akses read ke repo private.")
        print("Token hanya disimpan lokal di ~/.baska/auth/token dengan permission 600.")
        token = getpass.getpass("GitHub token: ").strip()
        if not token:
            raise SystemExit("Dibatalkan.")

    ok, login = verify_github_auth(token)
    if not ok:
        raise SystemExit(1)

    repos = fetch_private_repositories(token)
    old = load_json(PRIVATE_FILE, {"schema_version": 1, "repositories": {}, "packages": []})
    mapping = old.get("repositories", {})
    used = []
    for data in mapping.values():
        m = re.fullmatch(r"P(\d{5})", str(data.get("package_id", "")))
        if m:
            used.append(int(m.group(1)))

    if not mapping:
        next_down = 50000
        for repo in repos:
            mapping[str(repo["id"])] = {
                "package_id": f"P{next_down:05d}",
                "full_name": repo["full_name"],
                "created_at": repo.get("created_at"),
            }
            next_down -= 1
    else:
        next_up = max(used or [49999]) + 1
        next_down = min(used or [50001]) - 1
        existing_dates = [v.get("created_at") for v in mapping.values() if v.get("created_at")]
        newest_date = max(existing_dates) if existing_dates else ""
        oldest_date = min(existing_dates) if existing_dates else ""
        for repo in repos:
            key = str(repo["id"])
            if key in mapping:
                mapping[key]["full_name"] = repo["full_name"]
                mapping[key]["created_at"] = repo.get("created_at")
                continue
            created = repo.get("created_at") or ""
            if created >= newest_date:
                pid = f"P{next_up:05d}"
                next_up += 1
            elif created <= oldest_date:
                pid = f"P{max(1, next_down):05d}"
                next_down -= 1
            else:
                pid = f"P{next_up:05d}"
                next_up += 1
            mapping[key] = {"package_id": pid, "full_name": repo["full_name"], "created_at": created}

    packages = [
        private_package_from_repo(repo, mapping[str(repo["id"])]["package_id"])
        for repo in repos
    ]
    save_json(PRIVATE_FILE, {
        "schema_version": 1,
        "owner": OWNER,
        "generated_at": now_iso(),
        "repositories": mapping,
        "packages": packages,
    })

    if not command_exists("gh") and token:
        TOKEN_FILE.write_text(token + "\n", encoding="utf-8")
        try:
            TOKEN_FILE.chmod(0o600)
        except OSError:
            pass
    elif command_exists("gh"):
        try:
            run(["gh", "auth", "setup-git"], check=False)
        except Exception:
            pass

    cfg = config()
    cfg["github_initialized"] = True
    cfg["github_user"] = login
    save_config(cfg)
    print(color("green", f"GitHub terhubung sebagai {login}."))
    print(f"{len(packages)} repo private tersedia secara lokal dan tidak ditulis ke katalog publik.")

def logout_github() -> None:
    cfg = config()
    cfg["github_initialized"] = False
    cfg["github_user"] = None
    save_config(cfg)
    if PRIVATE_FILE.exists():
        PRIVATE_FILE.unlink()
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    print("Sesi private BASKA dihapus. Login GitHub CLI tidak diubah.")

def private_enabled() -> bool:
    cfg = config()
    if not cfg.get("github_initialized") or cfg.get("github_user", "").lower() != OWNER.lower():
        return False
    ok, _ = verify_github_auth(silent=True)
    return ok

def catalog_packages(include_private: bool = True) -> list[dict]:
    ensure_catalog()
    public = load_json(CATALOG_FILE, {"packages": []}).get("packages", [])
    packages = list(public)
    if include_private and private_enabled():
        packages.extend(load_json(PRIVATE_FILE, {"packages": []}).get("packages", []))
    return packages

def package_sort_key(p: dict):
    created = p.get("created_at") or ""
    pid = str(p.get("id", ""))
    match = re.search(r"(\d+)$", pid)
    num = int(match.group(1)) if match else 0
    return (1 if p.get("type") == "repo" else 0, created, num)

def resolve_package(query: str) -> dict | None:
    q = query.lower()
    for p in catalog_packages():
        candidates = [str(p.get("id", "")).lower(), str(p.get("slug", "")).lower()]
        candidates.extend(str(a).lower() for a in p.get("aliases", []))
        if q in candidates:
            return p
    return None

def split_target(value: str) -> tuple[str, str | None]:
    if "@" not in value:
        return value, None
    name, ref = value.rsplit("@", 1)
    return name, ref or None

def display_packages(packages: list[dict]) -> None:
    if not packages:
        print("Tidak ada paket.")
        return
    width = max(16, min(34, max(len(str(p.get("slug", ""))) for p in packages)))
    print(f"{'ID':<8} {'SLUG':<{width}} {'AKSES':<8} {'STATUS':<15} {'PLATFORM':<16} KETERANGAN")
    print("-" * min(120, 8 + width + 8 + 15 + 16 + 40))
    for p in sorted(packages, key=package_sort_key, reverse=True):
        vis = "PRIVATE" if p.get("visibility") == "private" else "PUBLIC"
        status = p.get("status") or "ready"
        platforms = ",".join(p.get("platforms") or ["all"])
        desc = (p.get("description") or "").replace("\n", " ")
        if len(desc) > 42:
            desc = desc[:39] + "..."
        print(f"{p.get('id',''):<8} {p.get('slug',''):<{width}} {vis:<8} {status:<15} {platforms:<16} {desc}")

def list_command(category: str | None = None) -> None:
    pkgs = catalog_packages()
    if category:
        pkgs = [p for p in pkgs if p.get("category") == category or category in p.get("tags", [])]
    display_packages(pkgs)

def search_command(term: str) -> None:
    needle = term.lower()
    matches = []
    for p in catalog_packages():
        hay = " ".join([
            str(p.get("id", "")),
            str(p.get("slug", "")),
            str(p.get("name", "")),
            str(p.get("description", "")),
            " ".join(p.get("aliases", [])),
            " ".join(p.get("tags", [])),
        ]).lower()
        if needle in hay:
            matches.append(p)
    display_packages(matches)

def info_command(query: str) -> None:
    p = resolve_package(query)
    if not p:
        raise SystemExit(f"Paket '{query}' tidak ditemukan.")
    fields = [
        ("ID", p.get("id")),
        ("Slug", p.get("slug")),
        ("Nama", p.get("name")),
        ("Akses", p.get("visibility", "public")),
        ("Status", p.get("status")),
        ("Trust", p.get("trust")),
        ("Kategori", p.get("category")),
        ("Versi", p.get("version")),
        ("Platform", ", ".join(p.get("platforms") or [])),
        ("Arsitektur", ", ".join(p.get("architectures") or [])),
        ("Bahasa", p.get("language")),
        ("Dibuat", p.get("created_at")),
        ("Update", p.get("updated_at")),
        ("Source", p.get("source")),
        ("Action", p.get("action")),
        ("Dependencies", ", ".join(p.get("dependencies") or [])),
        ("Tags", ", ".join(p.get("tags") or [])),
        ("Deskripsi", p.get("description")),
    ]
    for key, value in fields:
        if value not in (None, "", []):
            print(f"{key:<13}: {value}")
    release = p.get("latest_release")
    if release:
        print(f"{'Release':<13}: {release.get('tag_name')} ({release.get('published_at') or '-'})")

def compatible(package: dict) -> bool:
    supported = set(package.get("platforms") or ["all"])
    current = detect_platform()
    if "all" in supported:
        return True
    if current in supported:
        return True
    if current == "termux" and "linux" in supported:
        return True
    return False

def private_git_env(package: dict) -> dict:
    env = os.environ.copy()
    if package.get("visibility") != "private":
        return env
    token = gh_token()
    if not token:
        raise SystemExit("Repo private memerlukan 'baska init' atau autentikasi GitHub CLI.")
    basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
    env["GIT_CONFIG_COUNT"] = "1"
    env["GIT_CONFIG_KEY_0"] = "http.extraHeader"
    env["GIT_CONFIG_VALUE_0"] = f"Authorization: Basic {basic}"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env

def choose_ref(package: dict, requested_ref: str | None) -> str | None:
    if requested_ref == "latest":
        release = package.get("latest_release") or {}
        return release.get("tag_name")
    if requested_ref:
        return requested_ref
    if package.get("preferred_delivery") == "release":
        release = package.get("latest_release") or {}
        return release.get("tag_name")
    return None

def git_clone_or_update(package: dict, requested_ref: str | None = None) -> tuple[Path, str | None]:
    if not command_exists("git"):
        ensure_dependency("git", assume_yes=False)
    slug = package["slug"]
    target = PACKAGES / slug
    env = private_git_env(package)
    source = package["source"]
    chosen_ref = choose_ref(package, requested_ref)

    if target.exists() and not (target / ".git").exists():
        raise SystemExit(f"{target} sudah ada tetapi bukan Git repository.")

    if not target.exists():
        cmd = ["git", "clone", source, str(target)]
        run(cmd, env=env)
    else:
        if git_dirty(target):
            raise SystemExit(f"{slug} memiliki perubahan lokal. Commit/stash dahulu sebelum update.")
        run(["git", "fetch", "--all", "--tags", "--prune"], cwd=target, env=env)

    previous = git_head(target)
    if chosen_ref:
        run(["git", "checkout", "--detach", chosen_ref], cwd=target, env=env)
    else:
        branch = git_default_branch(target, env)
        if branch:
            run(["git", "checkout", branch], cwd=target, env=env, check=False)
            run(["git", "pull", "--ff-only"], cwd=target, env=env, check=False)
    return target, previous

def git_head(path: Path) -> str | None:
    try:
        return run(["git", "rev-parse", "HEAD"], cwd=path, capture=True).stdout.strip()
    except Exception:
        return None

def git_dirty(path: Path) -> bool:
    try:
        return bool(run(["git", "status", "--porcelain"], cwd=path, capture=True).stdout.strip())
    except Exception:
        return False

def git_default_branch(path: Path, env: dict | None = None) -> str | None:
    try:
        out = run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=path, capture=True, env=env).stdout.strip()
        return out.rsplit("/", 1)[-1]
    except Exception:
        for candidate in ("main", "master"):
            try:
                run(["git", "show-ref", "--verify", f"refs/remotes/origin/{candidate}"], cwd=path, capture=True)
                return candidate
            except Exception:
                pass
    return None

def system_install_command(dep: str) -> list[str] | None:
    plat = detect_platform()
    mapping = {
        "git": {"apt": "git", "dnf": "git", "pacman": "git", "apk": "git", "pkg": "git", "brew": "git", "winget": "Git.Git", "choco": "git"},
        "python": {"apt": "python3 python3-venv python3-pip", "dnf": "python3 python3-pip", "pacman": "python python-pip", "apk": "python3 py3-pip", "pkg": "python", "brew": "python", "winget": "Python.Python.3.12", "choco": "python"},
        "node": {"apt": "nodejs npm", "dnf": "nodejs npm", "pacman": "nodejs npm", "apk": "nodejs npm", "pkg": "nodejs", "brew": "node", "winget": "OpenJS.NodeJS.LTS", "choco": "nodejs-lts"},
        "docker": {"apt": "docker.io docker-compose-v2", "dnf": "docker docker-compose-plugin", "pacman": "docker docker-compose", "apk": "docker docker-cli-compose", "brew": "docker", "winget": "Docker.DockerDesktop", "choco": "docker-desktop"},
    }
    pkg = mapping.get(dep)
    if not pkg:
        return None
    if plat == "termux" and command_exists("pkg"):
        return ["pkg", "install", "-y"] + pkg.get("pkg", dep).split()
    if plat in ("linux", "macos"):
        if command_exists("apt-get"):
            prefix = [] if os.geteuid() == 0 else (["sudo"] if command_exists("sudo") else [])
            return prefix + ["apt-get", "install", "-y"] + pkg["apt"].split()
        if command_exists("dnf"):
            prefix = [] if os.geteuid() == 0 else (["sudo"] if command_exists("sudo") else [])
            return prefix + ["dnf", "install", "-y"] + pkg["dnf"].split()
        if command_exists("pacman"):
            prefix = [] if os.geteuid() == 0 else (["sudo"] if command_exists("sudo") else [])
            return prefix + ["pacman", "-S", "--noconfirm"] + pkg["pacman"].split()
        if command_exists("apk"):
            prefix = [] if os.geteuid() == 0 else (["sudo"] if command_exists("sudo") else [])
            return prefix + ["apk", "add"] + pkg["apk"].split()
        if command_exists("brew"):
            return ["brew", "install"] + pkg["brew"].split()
    if plat == "windows":
        if command_exists("winget"):
            return ["winget", "install", "--id", pkg["winget"], "-e", "--accept-source-agreements", "--accept-package-agreements"]
        if command_exists("choco"):
            return ["choco", "install", "-y", pkg["choco"]]
    return None

def dependency_present(dep: str) -> bool:
    checks = {
        "git": ["git"],
        "python": ["python3", "python"],
        "node": ["node"],
        "npm": ["npm"],
        "docker": ["docker"],
        "powershell": ["pwsh", "powershell"],
    }
    return any(command_exists(x) for x in checks.get(dep, [dep]))

def confirm(prompt: str, default: bool = False) -> bool:
    if not sys.stdin.isatty():
        return default
    suffix = " [Y/n] " if default else " [y/N] "
    ans = input(prompt + suffix).strip().lower()
    if not ans:
        return default
    return ans in ("y", "yes", "ya")

def ensure_dependency(dep: str, assume_yes: bool = False) -> bool:
    if dependency_present(dep):
        return True
    cmd = system_install_command(dep)
    if not cmd:
        print(color("yellow", f"Dependency '{dep}' belum ada dan installer otomatis tidak tersedia."))
        return False
    print(f"Dependency belum ada: {dep}")
    print("Command:", " ".join(cmd))
    if not assume_yes and not confirm(f"Install {dep}?"):
        return False
    try:
        run(cmd)
        return dependency_present(dep)
    except Exception as exc:
        print(color("red", f"Gagal memasang {dep}: {exc}"))
        return False

def smart_plan(path: Path) -> list[dict]:
    plan = []
    if (path / "install.sh").is_file():
        plan.append({"kind": "script", "description": "Jalankan install.sh", "deps": [], "cmd": ["sh", "install.sh"]})
        return plan
    if (path / "install.ps1").is_file() and detect_platform() == "windows":
        ps = "pwsh" if command_exists("pwsh") else "powershell"
        plan.append({"kind": "script", "description": "Jalankan install.ps1", "deps": ["powershell"], "cmd": [ps, "-ExecutionPolicy", "Bypass", "-File", "install.ps1"]})
        return plan

    reqs = sorted(path.glob("requirements*.txt"))
    pyproject = path / "pyproject.toml"
    setup_py = path / "setup.py"
    if reqs or pyproject.exists() or setup_py.exists():
        plan.append({"kind": "python", "description": "Siapkan Python virtualenv dan dependency", "deps": ["python"], "requirements": str(reqs[0].name) if reqs else None, "editable": pyproject.exists() or setup_py.exists()})

    if (path / "package.json").is_file():
        plan.append({"kind": "node", "description": "Install dependency Node.js", "deps": ["node", "npm"], "cmd": ["npm", "install"]})

    compose = None
    for name in ("compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"):
        if (path / name).is_file():
            compose = name
            break
    if compose:
        plan.append({"kind": "compose", "description": f"Validasi Docker Compose ({compose})", "deps": ["docker"], "cmd": ["docker", "compose", "-f", compose, "config"]})
    elif (path / "Dockerfile").is_file():
        plan.append({"kind": "docker", "description": "Build Docker image", "deps": ["docker"], "cmd": ["docker", "build", "-t", f"baska-{path.name}", "."]})
    return plan

def execute_python_plan(path: Path, item: dict) -> None:
    py = shutil.which("python3") or shutil.which("python")
    if not py:
        raise RuntimeError("Python tidak tersedia.")
    venv = path / ".venv"
    if not venv.exists():
        run([py, "-m", "venv", str(venv)], cwd=path)
    if detect_platform() == "windows":
        pip = venv / "Scripts" / "pip.exe"
    else:
        pip = venv / "bin" / "pip"
    run([str(pip), "install", "--upgrade", "pip"], cwd=path)
    if item.get("requirements"):
        run([str(pip), "install", "-r", item["requirements"]], cwd=path)
    if item.get("editable"):
        run([str(pip), "install", "-e", "."], cwd=path)

def run_smart_install(package: dict, path: Path, assume_yes: bool = False) -> None:
    plan = smart_plan(path)
    if not plan:
        print(color("yellow", "Tidak ditemukan installer standar; repository berhasil di-clone saja."))
        return
    print(color("cyan", "Smart install plan:"))
    for i, item in enumerate(plan, 1):
        print(f"  {i}. {item['description']}")
    trust = package.get("trust", "discovered")
    allowed = assume_yes or trust == "trusted"
    if not allowed:
        allowed = confirm("Jalankan rencana instalasi di atas?")
    if not allowed:
        print("Smart install dilewati. Repository tetap tersedia.")
        return
    for item in plan:
        for dep in item.get("deps", []):
            if not ensure_dependency(dep, assume_yes=assume_yes):
                raise SystemExit(f"Dependency '{dep}' belum tersedia.")
        if item["kind"] == "python":
            execute_python_plan(path, item)
        else:
            run(item["cmd"], cwd=path)

def execute_recipe(package: dict, path: Path, assume_yes: bool = False) -> None:
    recipe = package.get("recipe")
    if not recipe:
        action = package.get("action", "")
        if action.startswith("recipe:"):
            recipe = action.split(":", 1)[1]
    if not recipe:
        return
    tmp = CACHE / f"recipe-{package['id']}.sh"
    download(f"{RAW_BASE}/{recipe}", tmp)
    tmp.chmod(0o700)
    env = os.environ.copy()
    env.update({
        "BASKA_PACKAGE_ID": str(package["id"]),
        "BASKA_PACKAGE_SLUG": package["slug"],
        "BASKA_PACKAGE_SOURCE": package["source"],
        "BASKA_PACKAGE_HOME": str(path),
    })
    run(["sh", str(tmp)], env=env)

def install_file_package(package: dict) -> None:
    source = package["source"]
    filename = Path(urllib.parse.urlparse(source).path).name or package["slug"]
    if package.get("type") == "apk" and (Path.home() / "storage" / "downloads").is_dir():
        out = Path.home() / "storage" / "downloads" / filename
    else:
        out = PACKAGES / package["slug"] / filename
    download(source, out)
    expected = package.get("sha256")
    if expected:
        actual = hashlib.sha256(out.read_bytes()).hexdigest()
        if actual.lower() != expected.lower():
            out.unlink(missing_ok=True)
            raise SystemExit("SHA-256 tidak cocok. File dihapus.")
    print(color("green", f"Downloaded: {out}"))
    if package.get("action") == "open":
        if command_exists("termux-open"):
            run(["termux-open", str(out)], check=False)
        elif command_exists("xdg-open"):
            run(["xdg-open", str(out)], check=False)

def record_install(package: dict, path: Path | None, previous_commit: str | None, ref: str | None) -> None:
    s = state()
    current = git_head(path) if path and (path / ".git").exists() else None
    old = s.setdefault("installed", {}).get(package["slug"], {})
    s["installed"][package["slug"]] = {
        "id": package["id"],
        "slug": package["slug"],
        "path": str(path) if path else None,
        "type": package.get("type"),
        "source": package.get("source"),
        "visibility": package.get("visibility", "public"),
        "installed_at": old.get("installed_at") or now_iso(),
        "updated_at": now_iso(),
        "ref": ref,
        "current_commit": current,
        "previous_commit": previous_commit or old.get("current_commit"),
        "version": package.get("version"),
    }
    save_state(s)

def install_command(target: str, assume_yes: bool = False) -> None:
    name, requested_ref = split_target(target)
    package = resolve_package(name)
    if not package:
        raise SystemExit(f"Paket '{name}' tidak ditemukan.")
    if not compatible(package):
        raise SystemExit(f"{package['slug']} tidak kompatibel dengan platform {detect_platform()}.")
    if package.get("visibility") == "private" and not private_enabled():
        raise SystemExit("Repo private hanya tersedia setelah 'baska init' dengan akun GitHub yang benar.")

    if package.get("type") != "repo":
        install_file_package(package)
        record_install(package, None, None, requested_ref)
        return

    path, previous = git_clone_or_update(package, requested_ref)
    action = package.get("action", "smart")
    if action.startswith("recipe") or package.get("recipe"):
        execute_recipe(package, path, assume_yes=assume_yes)
    elif action == "smart":
        run_smart_install(package, path, assume_yes=assume_yes)
    else:
        print(color("green", f"Repository tersedia: {path}"))
    record_install(package, path, previous, requested_ref)
    print(color("green", f"Install selesai: {package['slug']} ({package['id']})"))

def installed_rows() -> list[dict]:
    s = state()
    return list(s.get("installed", {}).values())

def status_command() -> None:
    rows = installed_rows()
    if not rows:
        print("Belum ada paket yang tercatat terpasang.")
        return
    print(f"{'SLUG':<28} {'STATUS':<14} {'REF':<18} PATH")
    print("-" * 100)
    for item in rows:
        path = Path(item["path"]) if item.get("path") else None
        if path and not path.exists():
            st = "MISSING"
        elif path and (path / ".git").exists() and git_dirty(path):
            st = "MODIFIED"
        else:
            st = "OK"
        print(f"{item['slug']:<28} {st:<14} {(item.get('ref') or '-'):<18} {item.get('path') or '-'}")

def update_one(query: str, assume_yes: bool = False) -> None:
    package = resolve_package(query)
    if not package:
        raise SystemExit(f"Paket '{query}' tidak ditemukan.")
    s = state()
    installed = s.get("installed", {}).get(package["slug"])
    if not installed:
        return install_command(query, assume_yes=assume_yes)
    if package.get("type") != "repo":
        return install_command(query, assume_yes=assume_yes)
    path = Path(installed["path"])
    if git_dirty(path):
        raise SystemExit(f"{package['slug']} memiliki perubahan lokal; update dibatalkan.")
    old = git_head(path)
    env = private_git_env(package)
    run(["git", "fetch", "--all", "--tags", "--prune"], cwd=path, env=env)
    ref = installed.get("ref")
    if ref:
        chosen = choose_ref(package, ref) or ref
        run(["git", "checkout", "--detach", chosen], cwd=path, env=env)
    else:
        branch = git_default_branch(path, env)
        if branch:
            run(["git", "checkout", branch], cwd=path, env=env, check=False)
            run(["git", "pull", "--ff-only"], cwd=path, env=env)
    new = git_head(path)
    if new != old:
        installed["previous_commit"] = old
        installed["current_commit"] = new
        installed["updated_at"] = now_iso()
        save_state(s)
        notify("update", f"{package['slug']} diperbarui ke {new[:8] if new else 'latest'}")
        if package.get("action") == "smart":
            run_smart_install(package, path, assume_yes=assume_yes)
        print(color("green", f"{package['slug']} diperbarui."))
    else:
        print(f"{package['slug']} sudah terbaru.")

def update_all(assume_yes: bool = False) -> None:
    for item in installed_rows():
        try:
            update_one(item["slug"], assume_yes=assume_yes)
        except Exception as exc:
            print(color("red", f"{item['slug']}: {exc}"))

def outdated_command() -> None:
    found = 0
    for item in installed_rows():
        path = Path(item["path"]) if item.get("path") else None
        if not path or not (path / ".git").exists():
            continue
        package = resolve_package(item["slug"])
        if not package:
            continue
        if git_dirty(path):
            print(f"{item['slug']}: modified (skip)")
            continue
        env = private_git_env(package)
        try:
            run(["git", "fetch", "--quiet", "origin"], cwd=path, env=env)
            branch = git_default_branch(path, env)
            if not branch:
                continue
            head = git_head(path)
            remote = run(["git", "rev-parse", f"origin/{branch}"], cwd=path, capture=True, env=env).stdout.strip()
            if head != remote:
                print(f"{item['slug']}: UPDATE {head[:8] if head else '-'} -> {remote[:8]}")
                found += 1
        except Exception as exc:
            print(f"{item['slug']}: tidak dapat dicek ({exc})")
    if not found:
        print("Tidak ada update repo yang terdeteksi.")
    else:
        notify("update", f"{found} paket memiliki update.")

def remove_command(query: str, assume_yes: bool = False) -> None:
    package = resolve_package(query)
    slug = package["slug"] if package else query
    s = state()
    item = s.get("installed", {}).get(slug)
    if not item:
        raise SystemExit(f"{slug} tidak tercatat terpasang.")
    path = Path(item["path"]) if item.get("path") else None
    if path and path.exists():
        if not assume_yes and not confirm(f"Hapus {path}?"):
            print("Dibatalkan.")
            return
        shutil.rmtree(path)
    del s["installed"][slug]
    save_state(s)
    print(color("green", f"{slug} dihapus dari BASKA."))

def rollback_command(query: str, assume_yes: bool = False) -> None:
    package = resolve_package(query)
    slug = package["slug"] if package else query
    s = state()
    item = s.get("installed", {}).get(slug)
    if not item or not item.get("path"):
        raise SystemExit("Paket tidak ditemukan di state instalasi.")
    path = Path(item["path"])
    prev = item.get("previous_commit")
    if not prev:
        raise SystemExit("Tidak ada commit rollback yang tersimpan.")
    if git_dirty(path):
        raise SystemExit("Repository memiliki perubahan lokal; rollback dibatalkan.")
    if not assume_yes and not confirm(f"Rollback {slug} ke {prev[:8]}?"):
        return
    current = git_head(path)
    run(["git", "reset", "--hard", prev], cwd=path)
    item["current_commit"] = prev
    item["previous_commit"] = current
    item["updated_at"] = now_iso()
    save_state(s)
    print(color("green", f"{slug} di-rollback ke {prev[:8]}."))

def repair_command(query: str, assume_yes: bool = False) -> None:
    package = resolve_package(query)
    if not package:
        raise SystemExit("Paket tidak ditemukan.")
    s = state()
    item = s.get("installed", {}).get(package["slug"])
    if not item:
        return install_command(query, assume_yes=assume_yes)
    path = Path(item["path"]) if item.get("path") else None
    if not path or not path.exists():
        print("Folder instalasi hilang; memasang ulang.")
        return install_command(query, assume_yes=assume_yes)
    if (path / ".git").exists():
        run(["git", "fsck", "--no-progress"], cwd=path, check=False)
    if package.get("action") == "smart":
        run_smart_install(package, path, assume_yes=assume_yes)
    print(color("green", f"Repair selesai: {package['slug']}"))

def versions_command(query: str) -> None:
    package = resolve_package(query)
    if not package or package.get("type") != "repo":
        raise SystemExit("Versions hanya tersedia untuk repository package.")
    env = private_git_env(package)
    p = run(["git", "ls-remote", "--tags", "--refs", package["source"]], capture=True, env=env)
    tags = []
    for line in p.stdout.splitlines():
        if "\trefs/tags/" in line:
            tags.append(line.split("\trefs/tags/", 1)[1])
    release = package.get("latest_release") or {}
    if release.get("tag_name"):
        print(f"Latest release: {release['tag_name']}")
    if not tags:
        print("Tidak ada tag.")
        return
    for tag in tags[-30:][::-1]:
        print(tag)

def favorites_command(action: str, value: str | None = None) -> None:
    cfg = config()
    fav = cfg.setdefault("favorites", [])
    if action == "list":
        display_packages([p for p in catalog_packages() if p.get("slug") in fav])
        return
    if not value:
        raise SystemExit("Slug/ID diperlukan.")
    p = resolve_package(value)
    if not p:
        raise SystemExit("Paket tidak ditemukan.")
    if action == "add" and p["slug"] not in fav:
        fav.append(p["slug"])
    elif action == "remove" and p["slug"] in fav:
        fav.remove(p["slug"])
    save_config(cfg)
    print("Favorites diperbarui.")

def collections() -> dict:
    ensure_catalog()
    return load_json(COLLECTIONS_FILE, {"collections": {}}).get("collections", {})

def profile_list() -> None:
    for key, item in collections().items():
        print(f"{key:<16} {item.get('name', key)} — {item.get('description','')}")

def profile_show(name: str) -> None:
    item = collections().get(name)
    if not item:
        raise SystemExit("Profile tidak ditemukan.")
    print(f"{item.get('name', name)}")
    print(item.get("description", ""))
    members = []
    for value in item.get("members", []):
        p = resolve_package(value)
        if p:
            members.append(p)
    display_packages(members)

def profile_setup(name: str, assume_yes: bool = False) -> None:
    item = collections().get(name)
    if not item:
        raise SystemExit("Profile tidak ditemukan.")
    for member in item.get("members", []):
        try:
            install_command(member, assume_yes=assume_yes)
        except Exception as exc:
            print(color("red", f"{member}: {exc}"))

def notifications_command(action: str = "list") -> None:
    s = state()
    notes = s.setdefault("notifications", [])
    if action == "clear":
        s["notifications"] = []
        save_state(s)
        print("Notifikasi dibersihkan.")
        return
    if not notes:
        print("Tidak ada notifikasi.")
        return
    for n in notes[:30]:
        mark = "*" if not n.get("read") else " "
        print(f"{mark} {n.get('time','')} [{n.get('kind','info')}] {n.get('message','')}")
        n["read"] = True
    save_state(s)

def doctor() -> None:
    ok, login = verify_github_auth(silent=True)
    checks = {
        "BASKA": f"v{VERSION}",
        "Platform": detect_platform(),
        "Architecture": detect_arch(),
        "Python": py_platform.python_version(),
        "Home": str(HOME),
        "Git": shutil.which("git") or "not found",
        "Node": shutil.which("node") or "not found",
        "Docker": shutil.which("docker") or "not found",
        "GitHub": login if ok else "not initialized/unauthorized",
        "Catalog": str(CATALOG_FILE) if CATALOG_FILE.exists() else "not cached",
    }
    for k, v in checks.items():
        print(f"{k:<14}: {v}")

def open_catalog() -> None:
    url = f"https://{OWNER}.github.io/baska-hub/"
    if command_exists("termux-open-url"):
        run(["termux-open-url", url], check=False)
    elif command_exists("xdg-open"):
        run(["xdg-open", url], check=False)
    else:
        print(url)

def settings_menu() -> None:
    cfg = config()
    while True:
        print("\nSettings")
        print(f"1. Auto refresh : {'ON' if cfg.get('auto_refresh') else 'OFF'}")
        print(f"2. Smart install: {'ON' if cfg.get('smart_install') else 'OFF'}")
        print("0. Kembali")
        choice = input("Pilih: ").strip()
        if choice == "1":
            cfg["auto_refresh"] = not cfg.get("auto_refresh")
        elif choice == "2":
            cfg["smart_install"] = not cfg.get("smart_install")
        elif choice == "0":
            break
        save_config(cfg)

def clear_screen() -> None:
    if IS_TTY:
        print("\033[2J\033[H", end="")

def dashboard_header() -> None:
    cfg = config()
    s = state()
    unread = sum(1 for n in s.get("notifications", []) if not n.get("read"))
    auth = cfg.get("github_user") if private_enabled() else "public"
    print(color("bold", "BASKA HUB"))
    print(f"v{VERSION}  |  {detect_platform()}/{detect_arch()}  |  GitHub: {auth}  |  Notifikasi: {unread}")
    print("=" * 72)

def prompt_package(label: str = "ID/slug") -> str:
    return input(f"{label}: ").strip()

def dashboard() -> None:
    ensure_catalog()
    while True:
        clear_screen()
        dashboard_header()
        print("""
1.  Daftar repository & paket
2.  Cari
3.  Detail paket
4.  Install
5.  Paket terpasang / status
6.  Cek update
7.  Update paket
8.  Update semua
9.  Remove
10. Repair
11. Rollback
12. Versi / tag
13. Profiles & collections
14. Favorites
15. Notifikasi
16. GitHub init / private repo
17. Refresh katalog
18. Doctor
19. Web catalog
20. Settings
0.  Keluar
""".strip())
        choice = input("\nPilih menu: ").strip()
        try:
            if choice == "1":
                list_command()
            elif choice == "2":
                search_command(input("Kata pencarian: ").strip())
            elif choice == "3":
                info_command(prompt_package())
            elif choice == "4":
                install_command(prompt_package("ID/slug[@versi]"))
            elif choice == "5":
                status_command()
            elif choice == "6":
                outdated_command()
            elif choice == "7":
                update_one(prompt_package())
            elif choice == "8":
                update_all()
            elif choice == "9":
                remove_command(prompt_package())
            elif choice == "10":
                repair_command(prompt_package())
            elif choice == "11":
                rollback_command(prompt_package())
            elif choice == "12":
                versions_command(prompt_package())
            elif choice == "13":
                profile_list()
                sub = input("Profile (kosong untuk kembali): ").strip()
                if sub:
                    profile_show(sub)
                    if confirm("Install seluruh profile?"):
                        profile_setup(sub)
            elif choice == "14":
                print("a=add, r=remove, l=list")
                a = input("Aksi: ").strip().lower()
                if a == "l":
                    favorites_command("list")
                elif a == "a":
                    favorites_command("add", prompt_package())
                elif a == "r":
                    favorites_command("remove", prompt_package())
            elif choice == "15":
                notifications_command()
                if confirm("Bersihkan semua notifikasi?"):
                    notifications_command("clear")
            elif choice == "16":
                if private_enabled():
                    print(f"Terhubung ke {OWNER}.")
                    if confirm("Logout sesi private BASKA?"):
                        logout_github()
                else:
                    init_github()
            elif choice == "17":
                refresh()
            elif choice == "18":
                doctor()
            elif choice == "19":
                open_catalog()
            elif choice == "20":
                settings_menu()
            elif choice == "0":
                return
            else:
                print("Pilihan tidak dikenal.")
        except (KeyboardInterrupt, EOFError):
            print("\nDibatalkan.")
        except Exception as exc:
            print(color("red", f"Error: {exc}"))
        if choice != "0":
            input("\nEnter untuk kembali ke dashboard...")

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="baska", description="BASKA Hub package/repository manager")
    parser.add_argument("--yes", "-y", action="store_true", help="konfirmasi otomatis untuk operasi yang didukung")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("dashboard")
    sub.add_parser("list")
    p = sub.add_parser("search"); p.add_argument("term")
    p = sub.add_parser("info"); p.add_argument("package")
    p = sub.add_parser("install"); p.add_argument("package")
    p = sub.add_parser("update"); p.add_argument("package", nargs="?")
    sub.add_parser("update-all")
    sub.add_parser("outdated")
    p = sub.add_parser("remove"); p.add_argument("package")
    p = sub.add_parser("repair"); p.add_argument("package")
    p = sub.add_parser("rollback"); p.add_argument("package")
    p = sub.add_parser("versions"); p.add_argument("package")
    sub.add_parser("status")
    sub.add_parser("refresh")
    sub.add_parser("doctor")
    sub.add_parser("init")
    sub.add_parser("logout")
    sub.add_parser("catalog")
    sub.add_parser("notifications")
    p = sub.add_parser("favorite"); p.add_argument("action", choices=["add","remove","list"]); p.add_argument("package", nargs="?")
    p = sub.add_parser("profile"); p.add_argument("action", choices=["list","show","setup"]); p.add_argument("name", nargs="?")
    sub.add_parser("version")
    return parser

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    cmd = args.command
    if cmd is None or cmd == "dashboard":
        return dashboard()
    if cmd == "list":
        return list_command()
    if cmd == "search":
        return search_command(args.term)
    if cmd == "info":
        return info_command(args.package)
    if cmd == "install":
        return install_command(args.package, assume_yes=args.yes)
    if cmd == "update":
        if args.package:
            return update_one(args.package, assume_yes=args.yes)
        return refresh()
    if cmd == "update-all":
        return update_all(assume_yes=args.yes)
    if cmd == "outdated":
        return outdated_command()
    if cmd == "remove":
        return remove_command(args.package, assume_yes=args.yes)
    if cmd == "repair":
        return repair_command(args.package, assume_yes=args.yes)
    if cmd == "rollback":
        return rollback_command(args.package, assume_yes=args.yes)
    if cmd == "versions":
        return versions_command(args.package)
    if cmd == "status":
        return status_command()
    if cmd == "refresh":
        return refresh()
    if cmd == "doctor":
        return doctor()
    if cmd == "init":
        return init_github()
    if cmd == "logout":
        return logout_github()
    if cmd == "catalog":
        return open_catalog()
    if cmd == "notifications":
        return notifications_command()
    if cmd == "favorite":
        return favorites_command(args.action, args.package)
    if cmd == "profile":
        if args.action == "list":
            return profile_list()
        if not args.name:
            raise SystemExit("Nama profile diperlukan.")
        if args.action == "show":
            return profile_show(args.name)
        return profile_setup(args.name, assume_yes=args.yes)
    if cmd == "version":
        print(VERSION)
        return
    parser.print_help()

if __name__ == "__main__":
    main()
