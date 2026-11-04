# BASKA release and maintenance policy

## Branches and continuous integration

- Make code, recipe and registry policy changes in a pull request; do not push them directly to production.
- Run `Validate BASKA Hub`, `Cross-platform BASKA Smoke`, and the Apps Script mirror checks when applicable.
- Require approval and passing checks before merging into protected `main`. Configure the actual required checks and reviewers under repository Rules/Settings; a workflow file alone does not enforce branch protection.
- Scheduled catalog sync may update public metadata without releasing the Python package. A timestamp-only sync must not create commits.
- Mirror Apps Script files are **not** deployment automation. Test and deploy Apps Script production independently.

## PyPI release checklist

1. Confirm all branch checks pass on the exact commit to be released.
2. Confirm `pyproject.toml`, `manifest.json`, internal version markers, README and CHANGELOG agree on the next version. Never rewrite a version already published to PyPI.
3. Merge the reviewed changes into `main`.
4. Create an annotated version tag such as `v1.3.3` on that reviewed `main` commit, then push the tag.
5. `.github/workflows/publish-pypi.yml` verifies tag ancestry/version/PyPI immutability, tests Ubuntu and Windows, builds and smoke-tests the wheel, then publishes via PyPI Trusted Publishing in the `pypi` environment.
6. Configure required reviewers on the GitHub `pypi` environment if manual publication approval is required. This is a repository Settings control, not something the workflow YAML itself can guarantee.
7. `.github/workflows/release-integrity.yml` creates/checksums and attests the source archive from the same tag.
8. After publication, verify the PyPI version, provenance, installed wheel entrypoints (`baska`, `baska-core`), and a non-destructive `baska doctor` on supported operating systems.

Do not trigger a release solely to refresh the catalog. A package release is reserved for reviewed CLI/packaging changes.

## Installer review

- New public and private repositories are source-only until reviewed.
- An unreviewed repository must not run its own installer, even when `--yes` is supplied.
- Approved recipes must reside under `recipes/`; for high-risk recipes, pin `recipe_sha256` in `registry/overrides.json` and review the source before updating the hash.
- Back up local user changes before any operation that resets or cleans a managed Git checkout.
- Do not upload private GitHub catalog entries, credentials, device IDs, or production Apps Script properties to this public repository.

## Platform verification limits

GitHub-hosted CI checks Linux, Windows, and macOS, with a simulated Termux platform-detection test. It does not replace running the published package on real Android Termux devices, Windows 7, or production Armbian boxes. Use separate device smoke checks before enabling updates in production.
