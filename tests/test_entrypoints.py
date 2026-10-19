"""Installed entrypoint smoke tests that work without network access."""
import contextlib
import io
import sys
import unittest
from unittest.mock import patch

import baska_cli


class CliEntrypointTests(unittest.TestCase):
    def call(self, entry, args):
        out=io.StringIO()
        with patch.object(sys, "argv", ["baska", *args]), contextlib.redirect_stdout(out):
            code=entry()
        return code,out.getvalue()

    def test_help_works_without_curses(self):
        rc,out=self.call(baska_cli.main,["--help"])
        self.assertEqual(rc,0)
        self.assertIn("BASKA",out)

    def test_cli_and_core_report_version(self):
        a,txt=self.call(baska_cli.main,["version"])
        b,txt2=self.call(baska_cli.core_main,["version"])
        self.assertEqual((a,b),(0,0))
        self.assertEqual(txt.strip(),txt2.strip())
        self.assertRegex(txt.strip(),r"^\d+\.\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()
