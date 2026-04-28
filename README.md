# NanoSwipe

基于 Vue 3 + Vite 的短视频风格影视播放器。

## Docker 部署

项目支持自动构建并发布到 GitHub Container Registry (ghcr.io)。

### 自动构建

当代码推送到 `main` 或 `master` 分支，或者创建以 `v` 开头的标签（如 `v1.0.0`）时，GitHub Actions 会自动触发构建并推送镜像。

### 手动构建 (本地)

```bash
docker build -t nanoswipe .
```

### 运行镜像

```bash
docker run -d \
  -p 8080:80 \
  -e MOONTV_URL="https://your-moontv-instance.com" \
  ghcr.io/OWNER/REPO:latest
```

请将 `OWNER/REPO` 替换为您的 GitHub 用户名和仓库名。

## 开发

本项目使用 Vue 3 `<script setup>` SFCs。

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```
