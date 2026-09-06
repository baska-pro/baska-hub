from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import time
from importlib.machinery import SourceFileLoader
from pathlib import Path

VERSION = "1.2.0"


def _legacy_path() -> Path:
    candidates = []
    found = shutil.which("baska-core")
    if found:
        candidates.append(Path(found))
    if sys.argv and sys.argv[0]:
        candidates.append(Path(sys.argv[0]).resolve().with_name("baska-core"))
    here = Path(__file__).resolve().parent
    candidates.extend([here / "bin" / "baska-core", here.parent / "bin" / "baska-core"])
    for path in candidates:
        try:
            if path.is_file():
                return path
        except OSError:
            pass
    raise RuntimeError("Komponen baska-core tidak ditemukan. Jalankan: pip install -U baska")


def _load_legacy():
    path = _legacy_path()
    loader = SourceFileLoader("_baska_legacy_core", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError("Gagal memuat baska-core.")
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    _patch(module)
    return module


def _is_managed(core, path: Path) -> bool:
    try:
        path.resolve().relative_to(core.PACKAGES.resolve())
        return True
    except (ValueError, OSError):
        return False


def _dirty_entries(core, path: Path) -> list[str]:
    try:
        out = core.run(["git", "status", "--porcelain"], cwd=path, capture=True).stdout
        return [line for line in out.splitlines() if line.strip()]
    except Exception:
        return []


def _backup_and_clean(core, path: Path, slug: str) -> Path | None:
    entries = _dirty_entries(core, path)
    if not entries:
        return None
    if not _is_managed(core, path):
        raise SystemExit(
            f"{slug} memiliki perubahan lokal di luar direktori terkelola BASKA. "
            "Commit/stash perubahan Anda dahulu."
        )

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = core.HOME / "backups" / slug / stamp
    backup.mkdir(parents=True, exist_ok=True)

    try:
        diff = core.run(["git", "diff", "--binary", "HEAD"], cwd=path, capture=True, check=False).stdout
        if diff:
            (backup / "changes.patch").write_text(diff, encoding="utf-8")
    except Exception:
        pass

    try:
        raw = core.run(
            ["git", "ls-files", "--others", "--exclude-standard", "-z"],
            cwd=path,
            capture=True,
            check=False,
        ).stdout
        for rel in [x for x in raw.split("\0") if x]:
            src = path / rel
            dst = backup / "untracked" / rel
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True)
            elif src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
    except Exception:
        pass

    core.run(["git", "reset", "--hard", "HEAD"], cwd=path)
    core.run(["git", "clean", "-fd"], cwd=path)
    print(core.color("yellow", f"Perubahan sisa instalasi dipulihkan. Backup: {backup}"))
    return backup


def _shell_interpreter(path: Path) -> tuple[str, list[str]]:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        text = ""
    first = text.splitlines()[0] if text else ""
    bash_only = bool(
        "bash" in first
        or re.search(r"\bpipefail\b|\[\[|BASH_SOURCE|\bdeclare\b|\blocal\b|\bmapfile\b", text)
    )
    if bash_only:
        return "bash", ["bash"]
    return "sh", []


def _smart_plan(core, path: Path) -> list[dict]:
    plan: list[dict] = []
    platform = core.detect_platform()

    ps1 = path / "install.ps1"
    sh_file = path / "install.sh"
    if platform == "windows" and ps1.is_file():
        ps = "pwsh" if core.command_exists("pwsh") else "powershell"
        return [{
            "kind": "script",
            "description": "Jalankan install.ps1",
            "deps": ["powershell"],
            "cmd": [ps, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "install.ps1"],
        }]
    if platform != "windows" and sh_file.is_file():
        interpreter, deps = _shell_interpreter(sh_file)
        return [{
            "kind": "script",
            "description": f"Jalankan install.sh dengan {interpreter}",
            "deps": deps,
            "cmd": [interpreter, "install.sh"],
        }]

    reqs = sorted(path.glob("requirements*.txt"))
    pyproject = path / "pyproject.toml"
    setup_py = path / "setup.py"
    if reqs or pyproject.exists() or setup_py.exists():
        preferred = None
        names = [p.name.lower() for p in reqs]
        if platform == "windows":
            for p in reqs:
                if "windows" in p.name.lower():
                    preferred = p
                    break
        else:
            for p in reqs:
                if "linux" in p.name.lower() or "termux" in p.name.lower():
                    preferred = p
                    break
        preferred = preferred or (reqs[0] if reqs else None)
        plan.append({
            "kind": "python",
            "description": "Siapkan Python virtualenv dan dependency",
            "deps": ["python"],
            "requirements": preferred.name if preferred else None,
            "editable": pyproject.exists() or setup_py.exists(),
        })

    package_json = path / "package.json"
    if package_json.is_file():
        npm_cmd = ["npm", "ci"] if (path / "package-lock.json").is_file() else ["npm", "install"]
        plan.append({
            "kind": "node",
            "description": "Install dependency Node.js",
            "deps": ["node", "npm"],
            "cmd": npm_cmd,
        })

    compose = next((n for n in ("compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml") if (path / n).is_file()), None)
    if compose:
        plan.append({
            "kind": "compose",
            "description": f"Validasi Docker Compose ({compose})",
            "deps": ["docker"],
            "cmd": ["docker", "compose", "-f", compose, "config"],
        })
    elif (path / "Dockerfile").is_file():
        plan.append({
            "kind": "docker",
            "description": "Validasi Dockerfile",
            "deps": ["docker"],
            "cmd": ["docker", "build", "--check", "."],
        })

    if not plan and platform != "windows":
        shell_candidates = [p for p in path.glob("*.sh") if p.is_file() and p.name not in {"install.sh", "uninstall.sh"}]
        preferred = next((p for p in shell_candidates if p.stem == path.name or p.stem in path.name), None)
        if preferred is None and len(shell_candidates) == 1:
            preferred = shell_candidates[0]
        if preferred:
            interpreter, deps = _shell_interpreter(preferred)
            plan.append({
                "kind": "shell-entrypoint",
                "description": f"Pasang command {preferred.stem}",
                "deps": deps,
                "script": preferred.name,
                "interpreter": interpreter,
            })

    if not plan and platform == "windows":
        cmd_files = [p for p in path.glob("*.cmd") if p.is_file()]
        bat_files = [p for p in path.glob("*.bat") if p.is_file()]
        candidates = cmd_files + bat_files
        if candidates:
            preferred = max(candidates, key=lambda p: p.stat().st_size)
            plan.append({
                "kind": "windows-entrypoint",
                "description": f"Siapkan launcher {preferred.name}",
                "deps": [],
                "script": preferred.name,
            })
    return plan


def _install_shell_entrypoint(core, package: dict, path: Path, item: dict) -> None:
    script = path / item["script"]
    if core.detect_platform() == "termux":
        bindir = Path(os.getenv("PREFIX", str(Path.home() / ".local"))) / "bin"
    else:
        bindir = Path.home() / ".local" / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    command = re.sub(r"[^a-z0-9_-]+", "-", package["slug"].lower()).strip("-")
    wrapper = bindir / command
    wrapper.write_text(
        "#!/usr/bin/env sh\n"
        f"cd {shlex_quote(str(path))}\n"
        f"exec {item['interpreter']} {shlex_quote(str(script))} \"$@\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(0o755)
    print(core.color("green", f"Command siap: {wrapper}"))


def shlex_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def _install_windows_entrypoint(core, package: dict, path: Path, item: dict) -> None:
    local = Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "BASKA" / "bin"
    local.mkdir(parents=True, exist_ok=True)
    launcher = local / f"{package['slug']}.cmd"
    target = path / item["script"]
    launcher.write_text(f'@echo off\r\ncall "{target}" %*\r\n', encoding="utf-8")
    print(core.color("green", f"Launcher siap: {launcher}"))
    print(core.color("yellow", "Tambahkan folder tersebut ke PATH bila ingin menjalankan command dari terminal lain."))


def _run_smart_install(core, package: dict, path: Path, assume_yes: bool = False) -> None:
    cfg = core.config()
    if not cfg.get("smart_install", True):
        print(core.color("yellow", "Smart installer OFF; repository berhasil dipasang sebagai clone terkelola."))
        return
    plan = _smart_plan(core, path)
    if not plan:
        print(core.color("green", "Repository berhasil dipasang (repository-only)."))
        return

    print(core.color("cyan", "Rencana instalasi:"))
    for i, item in enumerate(plan, 1):
        print(f"  {i}. {item['description']}")

    trust = package.get("trust", "reviewed")
    allowed = assume_yes or trust == "trusted"
    if not allowed:
        allowed = core.confirm("Jalankan rencana instalasi di atas?")
    if not allowed:
        print("Eksekusi installer dilewati. Repository tetap terpasang.")
        return

    try:
        for item in plan:
            for dep in item.get("deps", []):
                if dep == "bash" and not core.command_exists("bash"):
                    if core.detect_platform() == "termux" and core.command_exists("pkg"):
                        core.run(["pkg", "install", "-y", "bash"])
                    elif core.command_exists("apt-get"):
                        prefix = [] if getattr(os, "geteuid", lambda: 1)() == 0 else (["sudo"] if core.command_exists("sudo") else [])
                        core.run(prefix + ["apt-get", "install", "-y", "bash"])
                    else:
                        raise SystemExit("Bash diperlukan tetapi tidak tersedia.")
                elif dep != "bash" and not core.ensure_dependency(dep, assume_yes=assume_yes):
                    raise SystemExit(f"Dependency '{dep}' belum tersedia.")

            kind = item["kind"]
            if kind == "python":
                core.execute_python_plan(path, item)
            elif kind == "shell-entrypoint":
                _install_shell_entrypoint(core, package, path, item)
            elif kind == "windows-entrypoint":
                _install_windows_entrypoint(core, package, path, item)
            else:
                core.run(item["cmd"], cwd=path)
    except subprocess.CalledProcessError as exc:
        cmd = " ".join(str(x) for x in (exc.cmd if isinstance(exc.cmd, (list, tuple)) else [exc.cmd]))
        raise SystemExit(f"Installer gagal (exit {exc.returncode}): {cmd}") from None


def _clone_or_update(core, package: dict, requested_ref: str | None = None):
    if not core.command_exists("git"):
        if not core.ensure_dependency("git", assume_yes=False):
            raise SystemExit("Git diperlukan untuk memasang repository.")
    slug = package["slug"]
    target = core.PACKAGES / slug
    env = core.private_git_env(package)
    source = package["source"]
    chosen_ref = core.choose_ref(package, requested_ref)

    if target.exists() and not (target / ".git").exists():
        if _is_managed(core, target):
            backup = core.HOME / "backups" / slug / (time.strftime("%Y%m%d-%H%M%S") + "-broken")
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(backup))
            print(core.color("yellow", f"Folder instalasi rusak dipindahkan ke: {backup}"))
        else:
            raise SystemExit(f"{target} sudah ada tetapi bukan Git repository.")

    if not target.exists():
        core.run(["git", "clone", "--depth", "1", source, str(target)], env=env)
    else:
        _backup_and_clean(core, target, slug)
        core.run(["git", "fetch", "--all", "--tags", "--prune"], cwd=target, env=env)

    previous = core.git_head(target)
    if chosen_ref:
        core.run(["git", "fetch", "--tags", "origin"], cwd=target, env=env, check=False)
        core.run(["git", "checkout", "--detach", chosen_ref], cwd=target, env=env)
    else:
        branch = core.git_default_branch(target, env)
        if branch:
            core.run(["git", "checkout", branch], cwd=target, env=env, check=False)
            core.run(["git", "reset", "--hard", f"origin/{branch}"], cwd=target, env=env, check=False)
    return target, previous


def _repair(core, query: str, assume_yes: bool = False) -> None:
    package = core.resolve_package(query)
    if not package:
        raise SystemExit("Paket tidak ditemukan.")
    state = core.state()
    item = state.get("installed", {}).get(package["slug"])
    path = Path(item["path"]) if item and item.get("path") else core.PACKAGES / package["slug"]
    if not path.exists():
        return core.install_command(query, assume_yes=assume_yes)
    if (path / ".git").exists():
        _backup_and_clean(core, path, package["slug"])
        core.run(["git", "fsck", "--no-progress"], cwd=path, check=False)
    action = package.get("action", "smart")
    if action.startswith("recipe") or package.get("recipe"):
        core.execute_recipe(package, path, assume_yes=assume_yes)
    elif action == "smart":
        _run_smart_install(core, package, path, assume_yes=assume_yes)
    print(core.color("green", f"Repair selesai: {package['slug']}"))


def _compatible(core, package: dict) -> bool:
    supported = set(package.get("platforms") or ["all"])
    current = core.detect_platform()
    return "all" in supported or current in supported


def _patch(core) -> None:
    core.VERSION = VERSION
    core.compatible = lambda package: _compatible(core, package)
    core.smart_plan = lambda path: _smart_plan(core, path)
    core.run_smart_install = lambda package, path, assume_yes=False: _run_smart_install(core, package, path, assume_yes)
    core.git_clone_or_update = lambda package, requested_ref=None: _clone_or_update(core, package, requested_ref)
    core.repair_command = lambda query, assume_yes=False: _repair(core, query, assume_yes)

    original_update = core.update_one

    def update_one(query: str, assume_yes: bool = False):
        package = core.resolve_package(query)
        if package:
            item = core.state().get("installed", {}).get(package["slug"])
            if item and item.get("path"):
                path = Path(item["path"])
                if path.exists() and (path / ".git").exists():
                    _backup_and_clean(core, path, package["slug"])
        before = None
        if package:
            item = core.state().get("installed", {}).get(package["slug"])
            if item and item.get("path"):
                before = core.git_head(Path(item["path"]))
        result = original_update(query, assume_yes=assume_yes)
        if package:
            item = core.state().get("installed", {}).get(package["slug"])
            path = Path(item["path"]) if item and item.get("path") else None
            after = core.git_head(path) if path and path.exists() else None
            if path and after != before and (package.get("action", "").startswith("recipe") or package.get("recipe")):
                core.execute_recipe(package, path, assume_yes=assume_yes)
        return result

    core.update_one = update_one


def run_cli(args: list[str]) -> int:
    try:
        core = _load_legacy()
        old_argv = sys.argv[:]
        try:
            sys.argv = ["baska", *args]
            core.main()
            return 0
        finally:
            sys.argv = old_argv
    except SystemExit as exc:
        code = exc.code
        if code in (None, 0):
            return 0
        if isinstance(code, int):
            return code
        print(str(code), file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        cmd = " ".join(str(x) for x in (exc.cmd if isinstance(exc.cmd, (list, tuple)) else [exc.cmd]))
        print(f"BASKA: command gagal (exit {exc.returncode}): {cmd}", file=sys.stderr)
        return exc.returncode or 1
    except KeyboardInterrupt:
        print("\nDibatalkan.", file=sys.stderr)
        return 130
    except Exception as exc:
        if os.getenv("BASKA_DEBUG") == "1":
            raise
        print(f"BASKA: {exc}", file=sys.stderr)
        print("Gunakan BASKA_DEBUG=1 untuk traceback teknis.", file=sys.stderr)
        return 1


def main() -> None:
    raise SystemExit(run_cli(sys.argv[1:]))


if __name__ == "__main__":
    main()
