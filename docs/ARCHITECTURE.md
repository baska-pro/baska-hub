# BASKA Hub Architecture

Public repositories -> sync_repositories.py -> catalog.json/packages.tsv/repo-sync.json -> baska CLI + GitHub Pages.

Private repository discovery hanya terjadi lokal melalui `baska init` dan disimpan pada `~/.baska/private_catalog.json`.

ID: public 5 digit, private Pxxxxx, assets Axxxxx. Public anchor terbaru migrasi 50000; repo baru increment sehingga ID lama tidak bergeser.

Trust model: trusted, reviewed, discovered/repository_only. Tagged BASKA releases menghasilkan SHA256SUMS dan provenance attestation.
