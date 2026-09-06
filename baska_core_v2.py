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

VERSION = "1.2.2"


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
    raise FileNotFoundError("baska-core tidak ditemukan")


def _load_legacy_module():
    path = _legacy_path()
    name = "_baska_legacy_core"
    loader = SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    if spec is None:
        raise RuntimeError("Tidak dapat memuat baska-core")
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


LEGACY = _load_legacy_module()

# Export legacy names so the enhanced installer can reuse the mature catalog,
# authentication and command code without duplicating the entire old CLI.
for _name in dir(LEGACY):
    if _name.startswith("__"):
        continue
    if _name not in globals():
        globals()[_name] = getattr(LEGACY, _name)

VERSION = "1.2.2"


def _is_managed_path(path: Path) -> bool:
    try:
        root = (HOME / "packages").resolve()
        return path.resolve().is_relative_to(root)
    except (OSError, ValueError, AttributeError):
        try:
            return os.path.commonpath([str(path.resolve()), str((HOME / "packages").resolve())]) == str((HOME / "packages").resolve())
        except Exception:
            return False


def _git_dirty(path: Path) -> bool:
    if not (path / ".git").exists():
        return False
    result = subprocess.run(["git", "status", "--porcelain"], cwd=str(path), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return bool(result.stdout.strip())


def _backup_managed_changes(package: dict, path: Path) -> Path | None:
    if not _git_dirty(path):
        return None
    if not _is_managed_path(path):
        raise RuntimeError(f"{package.get('slug')} memiliki perubahan lokal. Commit/stash dahulu sebelum update.")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = HOME / "backups" / package.get("slug", "package") / stamp
    backup.mkdir(parents=True, exist_ok=True)
    diff = subprocess.run(["git", "diff"], cwd=str(path), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
    (backup / "working-tree.patch").write_text(diff, encoding="utf-8")
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=str(path), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout.splitlines()
    for rel in untracked:
        src = path / rel
        dst = backup / "untracked" / rel
        try:
            if src.is_file():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        except OSError:
            pass
    print(f"Backup perubahan managed clone: {backup}")
    subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=str(path), check=True)
    subprocess.run(["git", "clean", "-fd"], cwd=str(path), check=True)
    return backup


def _ensure_tool(tool: str):
    if shutil.which(tool):
        return
    ensure_dependency(tool)
    if not shutil.which(tool):
        raise RuntimeError(f"Dependency '{tool}' belum tersedia.")


def _script_interpreter(script: Path) -> list[str]:
    try:
        text = script.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        text = ""
    first = text.splitlines()[0] if text else ""
    low = first.lower()
    if "bash" in low or re.search(r"\b(pipefail|bash_source|declare\s+-|\[\[)", text, re.I):
        _ensure_tool("bash")
        return ["bash", script.name]
    return ["sh", script.name]


def _single_shell_candidate(path: Path) -> Path | None:
    ignored = {"install.sh", "uninstall.sh", "setup.sh", "bootstrap.sh"}
    shell_files = [p for p in path.glob("*.sh") if p.name.lower() not in ignored and p.is_file()]
    if len(shell_files) == 1:
        return shell_files[0]
    preferred = [p for p in shell_files if any(x in p.stem.lower() for x in ("main", "run", "start", "launch"))]
    return preferred[0] if len(preferred) == 1 else None


def _single_windows_candidate(path: Path) -> Path | None:
    files = [p for pattern in ("*.cmd", "*.bat") for p in path.glob(pattern) if p.is_file()]
    if len(files) == 1:
        return files[0]
    preferred = [p for p in files if any(x in p.stem.lower() for x in ("main", "run", "start", "launch"))]
    return preferred[0] if len(preferred) == 1 else None


def _managed_bin_dir() -> Path:
    d = HOME / "bin"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _launcher_name(package: dict) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", package.get("slug", "package")).strip("-") or "package"


def _write_shell_launcher(package: dict, script: Path, cwd: Path):
    target = _managed_bin_dir() / _launcher_name(package)
    interpreter = _script_interpreter(script)
    command = " ".join([shlex_quote(str(x)) for x in interpreter])
    target.write_text(f"#!/bin/sh\ncd {shlex_quote(str(cwd))}\nexec {command} \"$@\"\n", encoding="utf-8")
    target.chmod(0o755)
    print(f"Launcher: {target}")


def shlex_quote(value: str) -> str:
    import shlex
    return shlex.quote(value)


def _write_windows_launcher(package: dict, script: Path, cwd: Path):
    target = _managed_bin_dir() / (_launcher_name(package) + ".cmd")
    target.write_text(f"@echo off\r\ncd /d \"{cwd}\"\r\ncall \"{script}\" %*\r\n", encoding="utf-8")
    print(f"Launcher: {target}")


def _python_venv_install(path: Path, requirement: Path | None = None):
    _ensure_tool("python3" if os.name != "nt" else "python")
    python = shutil.which("python3") or shutil.which("python")
    venv = path / ".baska-venv"
    subprocess.run([python, "-m", "venv", str(venv)], cwd=str(path), check=True)
    pip = venv / ("Scripts/pip.exe" if os.name == "nt" else "bin/pip")
    if requirement:
        subprocess.run([str(pip), "install", "-r", requirement.name], cwd=str(path), check=True)
    elif (path / "pyproject.toml").exists() or (path / "setup.py").exists():
        subprocess.run([str(pip), "install", "."], cwd=str(path), check=True)
    print(f"Python environment: {venv}")


def _node_install(path: Path):
    _ensure_tool("npm")
    command = ["npm", "ci"] if (path / "package-lock.json").exists() else ["npm", "install"]
    subprocess.run(command, cwd=str(path), check=True)


def _docker_validate(path: Path, compose: Path | None = None):
    _ensure_tool("docker")
    if compose:
        result = subprocess.run(["docker", "compose", "version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            subprocess.run(["docker", "compose", "-f", compose.name, "config", "--quiet"], cwd=str(path), check=True)
    print("Docker project terdeteksi. BASKA tidak otomatis menjalankan service/container tanpa recipe eksplisit.")


def universal_install(package: dict, path: Path, assume_yes: bool = False):
    platform_name, _arch = detect_platform()
    indicators = []
    plan = []
    install_sh = path / "install.sh"
    install_ps1 = path / "install.ps1"
    if platform_name == "windows" and install_ps1.exists():
        indicators.append("install.ps1")
        exe = shutil.which("pwsh") or shutil.which("powershell")
        if not exe:
            raise RuntimeError("PowerShell tidak tersedia untuk install.ps1")
        plan.append(("PowerShell installer", lambda: subprocess.run([exe, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(install_ps1)], cwd=str(path), check=True)))
    elif install_sh.exists() and platform_name != "windows":
        indicators.append("install.sh")
        cmd = _script_interpreter(install_sh)
        plan.append((f"Installer shell ({cmd[0]})", lambda cmd=cmd: subprocess.run(cmd, cwd=str(path), check=True)))
    elif install_ps1.exists() and platform_name == "windows":
        indicators.append("install.ps1")
    reqs = sorted(path.glob("requirements*.txt"))
    if not plan and reqs:
        indicators.append(reqs[0].name)
        plan.append((f"Python requirements ({reqs[0].name})", lambda: _python_venv_install(path, reqs[0])))
    if not plan and ((path / "pyproject.toml").exists() or (path / "setup.py").exists()):
        indicators.append("python-package")
        plan.append(("Python package (.baska-venv)", lambda: _python_venv_install(path)))
    if not plan and (path / "package.json").exists():
        indicators.append("package.json")
        plan.append(("Node dependencies", lambda: _node_install(path)))
    compose = next((path / n for n in ("compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml") if (path / n).exists()), None)
    if not plan and compose:
        indicators.append(compose.name)
        plan.append(("Docker Compose validation", lambda: _docker_validate(path, compose)))
    if not plan and (path / "Dockerfile").exists():
        indicators.append("Dockerfile")
        plan.append(("Docker project validation", lambda: _docker_validate(path)))
    if not plan and platform_name != "windows":
        shell = _single_shell_candidate(path)
        if shell:
            indicators.append(shell.name)
            plan.append((f"Shell launcher ({shell.name})", lambda shell=shell: _write_shell_launcher(package, shell, path)))
    if not plan and platform_name == "windows":
        win = _single_windows_candidate(path)
        if win:
            indicators.append(win.name)
            plan.append((f"Windows launcher ({win.name})", lambda win=win: _write_windows_launcher(package, win, path)))
    if not plan:
        print("Tidak ada installer standar yang aman untuk dijalankan otomatis.")
        print(f"Repository tetap terpasang sebagai managed repository: {path}")
        return "repository_only"
    print("Universal install plan:")
    for i, (label, _fn) in enumerate(plan, 1):
        print(f"  {i}. {label}")
    if not assume_yes and package.get("trust", "reviewed") != "trusted":
        answer = input("Jalankan rencana instalasi di atas? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("Instalasi dibatalkan; repository tetap di-clone.")
            return "repository_only"
    for label, fn in plan:
        print(f"[BASKA] {label}...")
        fn()
    return "+".join(indicators) if indicators else "smart"


def enhanced_install_command(spec: str, assume_yes: bool = False):
    refresh_catalog(silent=True)
    package_name, requested_ref = parse_package_spec(spec)
    package = find_package(package_name)
    if not package:
        die(f"Paket '{package_name}' tidak ditemukan.")
    platform_name, arch = detect_platform()
    if not platform_ok(package, platform_name, arch):
        die(f"{package['slug']} tidak kompatibel dengan platform {platform_name}/{arch}.")
    ensure_deps(package)
    source = package.get("source", "")
    action = package.get("action", "smart")
    if not source.startswith("http") and package.get("type") != "repo":
        return LEGACY.install_command(spec, assume_yes=assume_yes)
    path = PACKAGES_DIR / package["slug"]
    if not (path / ".git").exists():
        if path.exists():
            shutil.rmtree(path)
        git_clone(package, path)
    else:
        _backup_managed_changes(package, path)
        subprocess.run(["git", "fetch", "--tags", "--prune", "origin"], cwd=str(path), check=True)
        default_branch = package.get("default_branch") or "main"
        subprocess.run(["git", "checkout", default_branch], cwd=str(path), check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "reset", "--hard", f"origin/{default_branch}"], cwd=str(path), check=True)
    ref = resolve_ref(package, requested_ref)
    if ref:
        subprocess.run(["git", "checkout", "--detach", ref], cwd=str(path), check=True)
    current_commit = git_head(path)
    if str(action).startswith("recipe:"):
        recipe = str(action).split(":", 1)[1]
        recipe_path = ROOT / recipe
        if not recipe_path.is_file():
            die(f"Recipe tidak ditemukan: {recipe}")
        command = _script_interpreter(recipe_path)
        subprocess.run(command + [source, str(path)], cwd=str(ROOT), check=True)
        install_type = f"recipe:{recipe}"
    else:
        install_type = universal_install(package, path, assume_yes=assume_yes)
    state = load_state()
    old = state.setdefault("installed", {}).get(package["slug"], {})
    state["installed"][package["slug"]] = {
        "id": package["id"], "slug": package["slug"], "path": str(path), "type": install_type,
        "source": source, "visibility": package.get("visibility", "public"), "installed_at": old.get("installed_at") or now(),
        "updated_at": now(), "ref": ref or package.get("default_branch") or "main", "current_commit": current_commit,
        "previous_commit": old.get("current_commit"),
    }
    save_state(state)
    print(f"OK: {package['id']} {package['slug']} terpasang di {path}")
    return 0


def enhanced_update_command(identifier: str, assume_yes: bool = False):
    package = find_package(identifier)
    if not package:
        die(f"Paket '{identifier}' tidak ditemukan.")
    path = PACKAGES_DIR / package["slug"]
    if path.exists() and (path / ".git").exists():
        _backup_managed_changes(package, path)
    return LEGACY.update_command(identifier, assume_yes=assume_yes)


def enhanced_repair_command(identifier: str, assume_yes: bool = False):
    package = find_package(identifier)
    if not package:
        die(f"Paket '{identifier}' tidak ditemukan.")
    path = PACKAGES_DIR / package["slug"]
    if path.exists() and (path / ".git").exists():
        _backup_managed_changes(package, path)
        action = package.get("action", "smart")
        if str(action).startswith("recipe:"):
            recipe = str(action).split(":", 1)[1]
            recipe_path = ROOT / recipe
            command = _script_interpreter(recipe_path)
            subprocess.run(command + [package.get("source", ""), str(path)], cwd=str(ROOT), check=True)
        else:
            universal_install(package, path, assume_yes=assume_yes)
        print(f"Repair selesai: {package['slug']}")
        return 0
    return enhanced_install_command(identifier, assume_yes=assume_yes)


def run_cli(argv: list[str]) -> int:
    if not argv:
        return 0
    # Delegate parser/help and non-mutating commands to legacy CLI, while
    # intercepting install/update/repair with the managed universal installer.
    command_index = 0
    while command_index < len(argv) and argv[command_index] in ("--yes", "-y"):
        command_index += 1
    if command_index >= len(argv):
        return LEGACY.main(argv)
    cmd = argv[command_index]
    assume_yes = "--yes" in argv[:command_index+1] or "-y" in argv[:command_index+1]
    rest = argv[command_index + 1:]
    if cmd == "install" and rest:
        return enhanced_install_command(rest[0], assume_yes=assume_yes)
    if cmd == "update" and rest:
        return enhanced_update_command(rest[0], assume_yes=assume_yes)
    if cmd == "repair" and rest:
        return enhanced_repair_command(rest[0], assume_yes=assume_yes)
    old_argv = sys.argv[:]
    try:
        sys.argv = [old_argv[0]] + argv
        result = LEGACY.main()
        return int(result or 0)
    finally:
        sys.argv = old_argv
