# Tencent Cloud Deployment

This project is production-ready for Tencent Cloud as three managed pieces:

- CVM runs the Node.js containers.
- TencentDB for PostgreSQL stores projects, workflow state, assets metadata, and generation jobs.
- Tencent Cloud COS stores generated image and video files through the existing S3-compatible storage adapter.

The app should not rely on local disk for generated media in production. Use `STORAGE_PROVIDER=s3`.

## 1. Tencent Cloud Resources

Create these resources in the same region when possible:

- CVM: Ubuntu 22.04 or TencentOS Server, 2 vCPU / 4 GB RAM minimum for a prototype.
- TencentDB for PostgreSQL: PostgreSQL 16 preferred, database name `ai_comic_workbench`.
- COS bucket: private bucket, for example `ai-comic-prod-1250000000`.
- Security group:
  - Inbound `80/tcp` from the internet.
  - Inbound `22/tcp` only from your own IP.
  - Do not expose PostgreSQL publicly.

For HTTPS, put a Tencent Cloud CLB, CDN, or Nginx/Caddy reverse proxy in front of port 80 after the first HTTP smoke test passes.

## 2. COS Settings

The code uses `@aws-sdk/client-s3`, and Tencent Cloud COS supports S3-compatible access.

Use these values in `.env.tencent`:

```env
STORAGE_PROVIDER=s3
STORAGE_BUCKET=your-bucket-name-1250000000
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com
STORAGE_PREFIX=media
STORAGE_FORCE_PATH_STYLE=false
STORAGE_ACCESS_KEY_ID=your-secret-id
STORAGE_SECRET_ACCESS_KEY=your-secret-key
```

Replace `ap-guangzhou` with the COS bucket region. For COS buckets created after 2024-01-01, keep `STORAGE_FORCE_PATH_STYLE=false` because Tencent recommends virtual-hosted-style access for new buckets.

## 3. Server Setup

Install Docker and Compose on the CVM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

Upload or clone this repository to the CVM, then create the production env file:

```bash
cp .env.tencent.example .env.tencent
nano .env.tencent
```

Fill in:

- `WEB_ORIGIN`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `SEEDANCE_API_KEY`
- COS bucket, endpoint, SecretId, and SecretKey

## 4. Deploy

Build and start:

```bash
docker compose -f docker-compose.tencent.yml up -d --build
```

Check the containers:

```bash
docker compose -f docker-compose.tencent.yml ps
docker compose -f docker-compose.tencent.yml logs -f api
docker compose -f docker-compose.tencent.yml logs -f web
```

Smoke test:

```bash
curl http://127.0.0.1/api/health
curl http://127.0.0.1
```

Open the CVM public IP in a browser:

```text
http://YOUR_CVM_PUBLIC_IP
```

## 5. Domain And HTTPS

After the HTTP smoke test passes:

1. Point your domain `A` record to the CVM public IP or CLB public IP.
2. Update `.env.tencent`:

```env
WEB_ORIGIN=https://your-domain.com
```

3. Restart the containers:

```bash
docker compose -f docker-compose.tencent.yml up -d
```

For mainland China public access with a custom domain, plan for ICP filing before production launch.

## 6. Update Release

Pull the latest code and redeploy:

```bash
git pull
docker compose -f docker-compose.tencent.yml up -d --build
```

Database migrations run automatically when the `api` container starts:

```bash
npx prisma migrate deploy
```

## 7. Rollback

If a release fails, check logs first:

```bash
docker compose -f docker-compose.tencent.yml logs --tail=200 api
docker compose -f docker-compose.tencent.yml logs --tail=200 web
```

Then roll back the repository to the previous known-good commit and rebuild:

```bash
git checkout <previous-commit>
docker compose -f docker-compose.tencent.yml up -d --build
```

Do not delete the PostgreSQL instance or COS bucket during app rollback.
