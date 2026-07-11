# GitHub Actions Tencent CVM Deployment

This optional workflow deploys to Tencent Cloud CVM only when an authorized
maintainer starts it manually. Configure a protected `production` environment
before enabling the workflow.

## Required GitHub Secrets

Set these in the GitHub repository:

| Secret | Value |
| --- | --- |
| `CVM_HOST` | CVM public IP, for example `203.0.113.10` |
| `CVM_USER` | SSH user, normally `ubuntu` |
| `CVM_PORT` | SSH port, normally `22` |
| `CVM_SSH_KEY` | Private key that can log in to the CVM without a password |

Do not put `.env.cvm`, API keys, database passwords, or provider keys into Git.

Optional repository variables:

| Variable | Value |
| --- | --- |
| `CVM_PRIMARY_DOMAIN` | Primary public domain. Leave empty to skip automatic TLS configuration. |
| `CVM_ALTERNATE_DOMAIN` | Optional alternate domain, such as `www.example.com`. |

## CVM Requirement

GitHub Actions cannot type an SSH password. The CVM must trust the public key that matches `CVM_SSH_KEY`.

On the CVM, append the deploy public key to:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Server Environment

The workflow preserves the existing `/home/ubuntu/ai-comic-workbench/.env.cvm` file during each deploy. If it is missing, it copies `.env.cvm.example` as a fallback, but production secrets still need to be filled manually on the CVM.

The single-CVM deployment uses:

- `docker-compose.cvm.yml`
- local Docker volume for PostgreSQL
- local Docker volume for generated media
- port `80` for the web app
- internal API service on port `8787`

## Deployment Flow

1. Checkout repository.
2. Run `npm ci`, tests, and production build.
3. Create a release archive without local env files, logs, build output, reports, generated decks, or runtime media.
4. Upload the archive to the CVM.
5. Replace the app source directory.
6. Restore `.env.cvm`.
7. Run:

```bash
docker compose --env-file .env.cvm -f docker-compose.cvm.yml up -d --build
docker compose --env-file .env.cvm -f docker-compose.cvm.yml ps
curl -fsS http://127.0.0.1/api/health
```

## Manual Deploy Fallback

If GitHub Actions is unavailable, use the existing local script:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\deploy-cvm.ps1" -HostIp "203.0.113.10"
```
