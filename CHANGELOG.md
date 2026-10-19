# Changelog

All notable BASKA Hub changes are documented here. Git tags and [GitHub Releases](https://github.com/baska-pro/baska-hub/releases) are the authoritative version records.

## [1.3.2] — 2026-10-19

### Security and reliability
- Restrict destructive remove, repair, update, rollback, and managed cleanup operations to direct children of the BASKA-managed packages directory; reject symlink escapes and tampered state paths.
- Download public catalog and collections to temporary files, validate structure and public visibility, then replace cached files only after successful validation.
- Default newly discovered public repositories to **source-only/unreviewed** until an explicit installation policy permits automated setup. Existing reviewed overrides remain unchanged.
- Check generated registry policy in the automated catalog sync workflow; maintain stable package IDs.

### Packaging and compatibility
- Provide native `baska` and `baska-core` executable launchers on Windows with proper Python console entry points, rather than script-files without Windows executable wrappers.
- Package the legacy core as an importable Python module while preserving the legacy source-checkout script paths.
- Support Python 3.10 without requiring `tomllib` at import time; test Python 3.10 on Linux and Python 3.11 on Windows.
- Add installed-wheel checks and security unit tests before PyPI publishing.

### Public catalog
- Fix GitHub links for repository aliases and file-based APK downloads; add alias search and universal-platform filtering.
- Add BASKA SEND / SendToCom package `50007`, Windows-only source and v2.2.4 release link.
- Correct Server Control Suite Linux default to track the Linux-capable `main` branch rather than a Windows-tagged release.
- Clarify whether a package is source-only and identify Android APK assets.

### Upgrade

```bash
python -m pip install --upgrade baska
baska version
baska doctor
```

On systems managed with pipx use `pipx upgrade baska`. Back up custom managed package modifications before upgrades. Installing BASKA updates the CLI, not every managed project.

## [1.3.1] — prior published PyPI release

Earlier package-manager version. See repository history for details.
