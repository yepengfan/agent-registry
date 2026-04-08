# Deployment Runbook

<!-- Fill in your deployment procedures below -->

## Pre-Deployment

- [ ] All tests passing on the deployment branch
- [ ] Change reviewed and approved
- [ ] Database migrations tested (if applicable)
- [ ] Feature flags configured (if applicable)

## Deployment Steps

1. Notify the team in the deployment channel
2. Deploy to staging and verify
3. Run smoke tests against staging
4. Deploy to production
5. Monitor dashboards for anomalies
6. Confirm deployment success

## Rollback Procedure

1. Identify the issue and severity
2. If critical: immediately roll back to previous version
3. If non-critical: assess fix-forward vs rollback
4. Notify the team of rollback decision
5. Execute rollback and verify

## Post-Deployment

- [ ] Verify health checks passing
- [ ] Check error rates in monitoring
- [ ] Update deployment log

<!-- TODO: Add environment-specific URLs, commands, and escalation contacts -->
