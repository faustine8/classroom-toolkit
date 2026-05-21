# 课堂工具集

一个基于 Vite + Vue 3 + TypeScript 的课堂辅助工具单页应用。当前版本是极简 MVP，优先适配教室电脑大屏展示。

## 当前工具

- 背书排号：学生输入学号加入等待队列，老师通过按钮或快捷键完成、跳过、叫下一位，减少抢顺序、插队和围在讲台前的情况。

## 本地运行

```bash
npm install
npm run dev
```

构建验证：

```bash
npm run build
```

本地预览生产构建：

```bash
npm run preview
```

## GitHub Pages 部署

项目已在 `vite.config.ts` 中为仓库名 `classroom-toolkit` 配置生产环境 `base: '/classroom-toolkit/'`。

常见部署方式：

1. 运行 `npm run build`。
2. 将生成的 `dist` 目录发布到 GitHub Pages。
3. 如果使用 GitHub Actions，可将 `dist` 作为 Pages artifact 上传并部署。

本项目使用 Vue Router 的 hash history，部署到 GitHub Pages 后刷新页面也能回到当前前端路由。

## 当前版本限制

- 纯前端实现，无后端、无数据库。
- 数据只保存在当前浏览器的 `localStorage`。
- 只支持同一台设备继续使用当前课堂，不支持老师手机和教室电脑实时同步。
- 暂不支持登录、权限、学生名单导入、多端同步和复杂 UI 组件库。
