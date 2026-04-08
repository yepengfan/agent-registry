# CI/CD Pipeline Reference

<!-- Fill in your CI/CD configuration below -->

## Pipeline Stages

1. **Build** — Compile, lint, type-check
2. **Test** — Unit tests, integration tests
3. **Security** — Dependency scanning, SAST
4. **Deploy Staging** — Automated deployment to staging
5. **Deploy Production** — Manual approval + deployment

## Branch Strategy

- `main` — production-ready code
- `develop` — integration branch
- `feature/*` — feature branches
- `hotfix/*` — production fixes

## Environment Configuration

| Environment | Purpose           | Deployment Trigger   |
|-------------|-------------------|----------------------|
| Dev         | Development       | Push to feature/*    |
| Staging     | Pre-production    | Merge to develop     |
| Production  | Live              | Manual from main     |

<!-- TODO: Add CI tool configuration, secret management, and artifact registry details -->
