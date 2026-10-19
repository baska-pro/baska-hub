"""New public repositories must never auto-execute unreviewed installers."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from scripts import sync_repositories as sync


class DiscoverySafetyTests(unittest.TestCase):
    def setUp(self):
        self.repo = {
            "id": 123456789, "name": "example-new-project",
            "full_name": "baska-pro/example-new-project",
            "clone_url": "https://github.com/baska-pro/example-new-project.git",
            "description": "A project with potentially executable setup scripts.",
            "topics": ["python"], "language": "Python",
            "created_at": "2026-10-19T00:00:00Z",
            "updated_at": "2026-10-19T00:00:00Z",
            "pushed_at": "2026-10-19T00:00:00Z", "default_branch": "main"
        }

    @patch.object(sync, "latest_release", return_value=None)
    @patch.object(sync, "root_contents", return_value=[{"name": "install.sh"}, {"name": "pyproject.toml"}])
    def test_unknown_repo_is_source_only(self, files, release):
        package = sync.build_public_package(self.repo, "50008", None, {})
        self.assertEqual(package["action"], "git")
        self.assertEqual(package["status"], "repository_only")
        self.assertEqual(package["trust"], "unreviewed")
        self.assertEqual(package["id"], "50008")
        self.assertEqual(package["platforms"], ["all"])

    @patch.object(sync, "latest_release", return_value=None)
    @patch.object(sync, "root_contents", return_value=[{"name": "install.sh"}])
    def test_explicit_policy_can_enable_smart_install(self, files, release):
        package = sync.build_public_package(self.repo, "50008", None, {
            str(self.repo["id"]): {"action": "smart", "trust": "reviewed"}
        })
        self.assertEqual(package["action"], "smart")
        self.assertEqual(package["trust"], "reviewed")
        self.assertEqual(package["status"], "ready")


if __name__ == "__main__":
    unittest.main()
