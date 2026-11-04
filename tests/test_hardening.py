"""Regression tests for auth privacy and installer fail-closed behavior."""
from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import baska_legacy_core as legacy
import baska_core_v2 as v2


class CredentialTests(unittest.TestCase):
    def test_private_files_are_atomic_and_restricted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            token = root / "auth" / "token"
            catalog = root / "private_catalog.json"
            with patch.object(legacy, "TOKEN_FILE", token), patch.object(legacy, "PRIVATE_FILE", catalog):
                legacy._write_private_text(token, "not-a-real-token\n")
                legacy.save_json(catalog, {"repositories": {}, "packages": []})
                self.assertEqual(token.read_text(), "not-a-real-token\n")
                self.assertEqual(legacy.load_json(catalog, {})["packages"], [])
                self.assertEqual(list(token.parent.glob(".baska-*")), [])
                if os.name != "nt":
                    self.assertEqual(stat.S_IMODE(token.stat().st_mode), 0o600)
                    self.assertEqual(stat.S_IMODE(catalog.stat().st_mode), 0o600)
                    self.assertEqual(stat.S_IMODE(token.parent.stat().st_mode), 0o700)

    def test_symlink_token_write_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "untouched"
            target.write_text("original")
            link = root / "token"
            try:
                link.symlink_to(target)
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks not supported")
            with self.assertRaises(RuntimeError):
                legacy._write_private_text(link, "unsafe")
            self.assertEqual(target.read_text(), "original")

    def test_private_repo_discovery_defaults_to_source_only(self):
        package = legacy.private_package_from_repo({
            "name": "example-private",
            "full_name": "baska-pro/example-private",
            "clone_url": "https://github.com/baska-pro/example-private.git",
            "id": 12345, "private": True,
        }, "P50000")
        self.assertEqual(package["action"], "git")
        self.assertEqual(package["trust"], "unreviewed")
        self.assertEqual(package["status"], "repository_only")


class InstallerTests(unittest.TestCase):
    def test_unreviewed_and_reviewed_yes_never_skip_review(self):
        execute = Mock()
        core = SimpleNamespace(
            config=lambda: {"smart_install": True},
            color=lambda kind, text: text,
            confirm=lambda text: False,
            run=execute,
        )
        plan = [{"kind": "script", "description": "example script", "deps": [], "cmd": ["sh", "install.sh"]}]
        with patch.object(v2, "_smart_plan", return_value=plan):
            v2._run_smart_install(core, {"trust": "unreviewed"}, Path("."), assume_yes=True)
            v2._run_smart_install(core, {"trust": "reviewed"}, Path("."), assume_yes=True)
        execute.assert_not_called()

    def test_recipe_rejects_traversal_and_unreviewed(self):
        core = SimpleNamespace(RAW_BASE="https://example.invalid", CACHE=Path("."), confirm=lambda text: False)
        base = {"id": "50000", "slug": "example", "source": "https://github.com/example/x.git"}
        for recipe in ("../outside.sh", "recipes/../../outside.sh", "https://evil.invalid/x.sh"):
            with self.subTest(recipe=recipe), self.assertRaises(SystemExit):
                v2._execute_recipe(core, {**base, "recipe": recipe, "trust": "trusted"}, Path("."), assume_yes=True)
        with self.assertRaises(SystemExit):
            v2._execute_recipe(core, {**base, "recipe": "recipes/good.sh", "trust": "unreviewed"}, Path("."), assume_yes=True)

    def test_recipe_checks_hash_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            execution = Mock()
            core = SimpleNamespace(
                RAW_BASE="https://example.invalid",
                CACHE=root,
                confirm=lambda text: False,
                download=lambda url, target: target.write_text("safe mock payload"),
                run=execution,
            )
            package = {
                "id": "50000", "slug": "example",
                "source": "https://github.com/example/example.git",
                "recipe": "recipes/good.sh", "trust": "trusted",
                "recipe_sha256": "0" * 64,
            }
            with self.assertRaises(SystemExit):
                v2._execute_recipe(core, package, root, assume_yes=True)
            execution.assert_not_called()
            self.assertEqual(list(root.glob("baska-recipe-*")), [])


class RecoveryTests(unittest.TestCase):
    def test_backup_failure_must_not_reset_or_clean(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packages = root / "packages"
            managed = packages / "sample"
            managed.mkdir(parents=True)
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                if command[1] == "status":
                    return SimpleNamespace(stdout=" M user.txt\n")
                if command[1] == "diff":
                    raise OSError("Simulated backup failure")
                raise AssertionError(f"Unexpected destructive command: {command}")

            core = SimpleNamespace(
                PACKAGES=packages, HOME=root, run=run,
                color=lambda kind, text: text,
            )
            with self.assertRaises(SystemExit):
                v2._backup_and_clean(core, managed, "sample")
            self.assertFalse(any(command[1] in {"clean", "reset"} for command in calls))


if __name__ == "__main__":
    unittest.main()
