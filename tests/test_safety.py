"""Safety regression checks for BASKA-managed paths and offline catalog refreshes."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import baska_core_v2 as v2


class ManagedPathTests(unittest.TestCase):
    def test_accepts_direct_managed_child(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "packages"
            root.mkdir()
            v2._assert_managed_path(SimpleNamespace(PACKAGES=root), root / "good-project", "good-project")

    def test_rejects_external_and_parent_path(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "packages"
            root.mkdir()
            core = SimpleNamespace(PACKAGES=root)
            for path in (Path(d), root, root / ".." / "other"):
                with self.subTest(path=path), self.assertRaises(SystemExit):
                    v2._assert_managed_path(core, path, "good-project")

    def test_rejects_traversal_slug(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "packages"
            root.mkdir()
            with self.assertRaises(SystemExit):
                v2._assert_managed_path(SimpleNamespace(PACKAGES=root), root / "x", "../x")

    def test_rejects_symlink_escape_when_supported(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "packages"
            root.mkdir()
            link = root / "linked"
            try:
                link.symlink_to(Path(d), target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks unavailable on this platform")
            with self.assertRaises(SystemExit):
                v2._assert_managed_path(SimpleNamespace(PACKAGES=root), link, "linked")


class RefreshTests(unittest.TestCase):
    def test_failed_download_keeps_original_catalog(self):
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d)
            catalog = cache / "catalog.json"
            groups = cache / "collections.json"
            original = {"packages": [{"id": "50000", "slug": "legacy", "visibility": "public"}]}
            catalog.write_text(json.dumps(original), encoding="utf-8")
            groups.write_text('{"collections":{"existing":{}}}', encoding="utf-8")

            def download(url, target):
                if url.endswith("catalog.json"):
                    target.write_text('{"packages":[{"id":"50001","slug":"new"}]}', encoding="utf-8")
                else:
                    raise OSError("Simulated connection loss")

            state = {"installed": {}}
            core = SimpleNamespace(
                CACHE=cache, CATALOG_FILE=catalog, COLLECTIONS_FILE=groups,
                RAW_BASE="https://example.invalid", download=download,
                load_json=lambda path, default: json.loads(path.read_text(encoding="utf-8")) if path.exists() else default,
                state=lambda: state, save_state=lambda value: None, now_iso=lambda: "TEST",
                notify=lambda *args: None, color=lambda kind, msg: msg
            )
            v2._safe_refresh(core, silent=True)
            self.assertEqual(json.loads(catalog.read_text(encoding="utf-8")), original)
            self.assertEqual(json.loads(groups.read_text(encoding="utf-8")), {"collections": {"existing": {}}})
            self.assertFalse((cache / "catalog.json.download").exists())


if __name__ == "__main__":
    unittest.main()
