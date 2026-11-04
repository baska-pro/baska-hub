"""Release metadata and installed entrypoints must advertise the same version."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

import baska_core_v2
import baska_legacy_core
from scripts.sync_repositories import project_version

ROOT = Path(__file__).resolve().parents[1]


class ReleaseVersionTests(unittest.TestCase):
    def test_versions_match(self):
        project = project_version()
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        self.assertRegex(project, r"^\d+\.\d+\.\d+$")
        self.assertEqual(project, manifest["cli"]["version"])
        self.assertEqual(project, baska_core_v2.VERSION)
        self.assertEqual(project, baska_legacy_core.VERSION)
        self.assertIn(
            "## Versi terbaru — v" + project,
            (ROOT / "README.md").read_text(encoding="utf-8"),
        )
        self.assertIn(
            "## [" + project + "]",
            (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
