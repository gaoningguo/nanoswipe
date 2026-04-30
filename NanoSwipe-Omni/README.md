# NanoSwipe Omni

NanoSwipe Omni 是 NanoSwipe 的全平台版本底座，目标是一套 Vue 3 核心应用同时交付：

- Web / PWA：`apps/web`
- Android / iOS：`apps/capacitor`
- Windows / macOS / Linux：`apps/tauri`
- 跨平台共享逻辑：`packages/shared`

## 当前能力

- 复用 NanoSwipe 的短视频滑动播放、MoonTVPlus 接入、自定义视频列表、搜索、播放进度记录。
- Web 开发模式通过 Vite `/moonapi` 代理规避浏览器 CORS。
- Capacitor/Tauri 运行时会自动识别平台，并优先使用原生 HTTP 通道访问 MoonTV。
- PWA 已包含 manifest 与 service worker，离线时可回退到应用壳。

## 开发

```bash
npm install
npm run dev:web
```

默认 Web 开发地址为 `http://localhost:3333`。

## 构建

```bash
npm run build:web
```

产物输出到 `apps/web/dist`，也是移动端和桌面端壳使用的 Web 资源目录。

## 移动端

首次添加原生平台：

```bash
npm run cap:add:android
npm run cap:add:ios
```

同步 Web 产物到原生工程：

```bash
npm run cap:sync
```

`cap:sync` 会先构建 `apps/web`，再执行 Capacitor 同步。

## 桌面端

开发：

```bash
npm run dev:desktop
```

构建：

```bash
npm run build:desktop
```

Tauri 开发模式会自动启动 `apps/web` 的 Vite 服务，窗口加载 `http://localhost:3333`。

## 目录说明

```text
apps/
  web/         Vue 3 + Vite 主应用，PWA 入口
  capacitor/   Android / iOS 原生壳配置
  tauri/       桌面端原生壳配置
packages/
  shared/      MoonTV API、HTTP 适配、存储、历史记录、平台识别
```

## 后续建议

- 为 PWA 补齐 192/512 PNG maskable 图标，提高浏览器安装兼容性。
- 为 Android/iOS 生成正式应用图标、启动图和权限配置。
- 为 Tauri 增加应用图标、签名与自动更新配置。
