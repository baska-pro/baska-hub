# Private Repository Policy

Private repository metadata tidak boleh di-commit ke public BASKA Hub.

Preferred:
```bash
gh auth login
baska init
```

Alternatif environment: `BASKA_GITHUB_TOKEN`.
Fallback interactive token disimpan lokal di `~/.baska/auth/token` mode 0600 bila GitHub CLI tidak tersedia.

`baska logout` menghapus private catalog/token lokal BASKA tanpa mengubah login global GitHub CLI.
