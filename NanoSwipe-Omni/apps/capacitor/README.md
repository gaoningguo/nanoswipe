# Capacitor Shell

这里是 NanoSwipe Omni 的移动端壳层。

## 现状

- 复用 `apps/web` 作为唯一前端代码来源
- 通过 `../web/dist` 作为 Capacitor 的静态资源目录
- 后续在这里补 Android / iOS 平台桥接能力

## 下一步

1. 安装依赖
2. 执行 `npm run build:web`
3. 执行 `npm run cap:add:android` 或 `npm run cap:add:ios`
4. 执行 `npm run cap:sync`
