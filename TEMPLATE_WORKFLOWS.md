# Template CI Workflows

This repository's GitHub Actions workflows are designed to be copied into template repositories.

## What is included

- Python reusable jobs (`.github/workflows/python-*.yml`)
- Optional frontend reusable jobs for React/JavaScript (`.github/workflows/frontend-*.yml`)
- Reusable Docker build/push job (`.github/workflows/build-and-push.yml`)
- Main orchestrator (`.github/workflows/ci.yml`) with stack auto-detection and release support

## Defaults and repo-level overrides

`ci.yml` supports repository variables (`Settings -> Secrets and variables -> Actions -> Variables`) so you can reuse workflows without editing YAML in every repo.

Set any of these optional variables:

- `CI_PYTHON_VERSION` (default: `3.12`)
- `CI_PYTHON_TEST_VERSIONS` (default: `["3.11","3.12","3.13"]`)
- `CI_PYTHON_INSTALL_SPEC` (default: `.[dev]`)
- `CI_PYTHON_COMPILE_FILES` (default: empty)
- `CI_PYTHON_COVERAGE_TARGET` (default: empty)
- `CI_PYTHON_COVERAGE_THRESHOLD` (default: `85`)
- `CI_FRONTEND_NODE_VERSION` (default: `22`)
- `CI_FRONTEND_WORKDIR` (default: `frontend`)

## Optional secret

- `GITLEAKS_LICENSE` is optional. If not set, the gitleaks step still runs with default behavior.

## Required GitHub secrets for staging deploy trigger

To trigger Woodpecker staging deploy only after image push succeeds, set these GitHub Actions secrets:

- `WOODPECKER_SERVER` (example: `https://ci.example.com`)
- `WOODPECKER_TOKEN` (Woodpecker PAT)
- `WOODPECKER_REPO` (optional override, default is GitHub `owner/repo`)
- `WOODPECKER_REPO_ID` (optional numeric repo id, recommended to skip lookup)

If `WOODPECKER_SERVER` or `WOODPECKER_TOKEN` is not set, the GitHub trigger job is skipped.

## Auto-detection behavior

The CI workflow detects project components and only runs relevant jobs:

- Python jobs run if `pyproject.toml`, `setup.py`, or `requirements.txt` exists.
- Frontend jobs run if `${CI_FRONTEND_WORKDIR}/package.json` exists.
- Frontend E2E runs only when frontend exists, Python exists, and a Playwright config exists in frontend workdir.
- Docker jobs run only when `Dockerfile` exists.

## Release/container behavior

- `docker-build` runs on pull requests (build only, no push).
- `docker-push` runs on:
  - push to `main`
  - tag push matching `v*`
  - release published
- GitHub release job runs on `v*` tag pushes after quality gate and Docker push succeed.

## Suggested template usage

1. Copy `.github/workflows/*` into the template repository.
2. Configure repo variables listed above (only if defaults do not fit).
3. Add optional secrets (for example `GITLEAKS_LICENSE`) as needed.
4. Ensure your repo uses expected conventions:
   - Python package config at root.
   - Frontend at `frontend/` (or override with `CI_FRONTEND_WORKDIR`).
   - `Dockerfile` at root for Docker jobs.

## Woodpecker deploy templates

The Woodpecker deploy pipelines in `.woodpecker/deploy-staging.yml` and `.woodpecker/deploy-production.yml` are template-ready and derive naming from repo/org by default.

- Staging namespace: `<org-prefix>-staging` (example: `graphras-staging`)
- Production namespace: `<org-prefix>-prod` (example: `graphras-prod`)
- Container image: `ghcr.io/<org-ghcr>/<app-name>:<tag>`
- Staging host: `staging-<app-name>.<org-dns>`
- Production host: `<app-name>.<org-dns>`
- Staging deploy image tag: `staging` (published by GitHub Actions on `main` pushes)
- Production deploy image tag: release tag from CI (`CI_COMMIT_TAG`)

Trigger behavior:

- Staging deploy workflow runs on manual/API trigger only.
- GitHub Actions triggers staging after `docker-push` succeeds on `main`.
- This avoids race conditions between forge push events and image publication timing.

Optional Woodpecker environment overrides:

- `APP_NAME` (default: repository name)
- `ORG_GHCR` (default: GitHub org slug from CI, e.g. `graphras-com`)
- `ORG_DNS` (default heuristic from `ORG_GHCR`, e.g. `graphras.com`)
- `ORG_NS` (default: `ORG_GHCR` stripped of common TLD suffixes, e.g. `graphras`)

This split handles GitHub org slug vs DNS domain naming (for example `graphras-com` -> `graphras.com`).
