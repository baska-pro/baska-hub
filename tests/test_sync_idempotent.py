"""Regression: scheduled syncs with unchanged data must not churn timestamps."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import sync_repositories as sync


class StableCatalogSyncTests(unittest.TestCase):
    def test_unchanged_input_preserves_generated_timestamp_and_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "assets.json"
            assets.write_text('{"assets":[]}', encoding="utf-8")
            replacements = {
                "REGISTRY": root / "packages.tsv",
                "CATALOG": root / "catalog.json",
                "STATE": root / "repo-sync.json",
                "OVERRIDES": root / "overrides.json",
                "ASSETS": assets,
                "MANIFEST": root / "manifest.json",
            }
            patches = [patch.object(sync, name, path) for name, path in replacements.items()]
            patches.append(patch.object(sync, "fetch_public_repositories", return_value=[]))
            for item in patches:
                item.start()
                self.addCleanup(item.stop)

            sync.main()
            first = json.loads(sync.CATALOG.read_text(encoding="utf-8"))
            first["generated_at"] = "2001-01-01T00:00:00Z"
            sync.CATALOG.write_text(
                json.dumps(first, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            before = {name: path.read_bytes() for name, path in replacements.items() if path.is_file()}

            sync.main()
            after = {name: path.read_bytes() for name, path in replacements.items() if path.is_file()}
            self.assertEqual(before, after)
            self.assertEqual(json.loads(sync.CATALOG.read_text())["generated_at"], "2001-01-01T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
