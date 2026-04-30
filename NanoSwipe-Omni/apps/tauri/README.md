# Tauri Shell

这里是 NanoSwipe Omni 的桌面端壳层。

## 现状

- 复用 `apps/web` 作为唯一前端代码来源
- 使用 Tauri 承载 Windows / macOS / Linux 桌面窗口
- 当前只放最小可运行壳层配置，后续再补托盘、菜单和自动更新

## 下一步

1. 安装依赖
2. 执行 `npm run build:web`
3. 执行 `npm run dev` 或 `npm run build`
