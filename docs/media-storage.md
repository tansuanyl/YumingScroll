# Media Storage

生成图片和视频会先从模型服务商返回的临时 URL 拉取文件，再写入本项目配置的持久化存储。

开发环境默认使用本地磁盘：

```env
STORAGE_PROVIDER=local
```

本地文件会写入：

```text
server/storage/media/<projectId>/<assetId>.<ext>
```

生产环境建议切换到 S3 兼容对象存储，例如 AWS S3、Cloudflare R2、阿里 OSS S3 兼容接口或火山 TOS S3 兼容接口：

```env
STORAGE_PROVIDER=s3
STORAGE_BUCKET=your-bucket
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://your-s3-compatible-endpoint
STORAGE_PREFIX=media
STORAGE_FORCE_PATH_STYLE=false
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
```

前端不直接访问对象存储签名 URL，统一通过后端代理：

```text
GET /api/projects/:projectId/assets/:assetId/file
GET /api/projects/:projectId/assets/:assetId/download
```

这样可以保证素材 URL 在项目里是稳定的，避免火山 TOS 临时 URL 过期后项目素材失效。
