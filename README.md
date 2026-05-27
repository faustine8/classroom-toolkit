# 课堂工具集

一个基于 Vite + Vue 3 + TypeScript 的课堂辅助工具单页应用。当前重点工具是支持多端同步的「背书排号」。

## 背书排号

- 首页可创建房间，自动生成 4 位 `sessionCode`，创建后进入老师端。
- 首页可输入 `sessionCode` 加入已有房间，并选择学生端或老师端。
- 学生端输入学号加入队列，实时查看当前叫号、等待队列和自己前面人数。
- 创建房间时自动生成老师 PIN；老师端需要通过 PIN 校验后才显示管理操作。
- 老师端通过 PIN 后实时查看当前学生和等待队列，支持下一位、通过/完成、删除误输入和清空队列。
- 后端数据服务使用腾讯云 CloudBase 数据库和实时监听，不需要自建 Java/Spring Boot 后端。

## 环境变量

复制 `.env.example` 为 `.env`，填写 CloudBase 环境 ID 和客户端 Publishable Key。`VITE_` 变量会被 Vite 打包进浏览器端，只能放允许公开的配置。

```bash
VITE_CLOUDBASE_ENV_ID=xxx
VITE_CLOUDBASE_PUBLISHABLE_KEY=xxx
```

可公开配置：

- `VITE_CLOUDBASE_ENV_ID`：CloudBase 环境 ID。
- `VITE_CLOUDBASE_PUBLISHABLE_KEY`：CloudBase 控制台生成的客户端 Publishable Key。它可以放在前端，但不是服务端密钥，也不代表管理员权限。

绝对不能提交或写入前端 `.env` 的内容：

- 腾讯云 `SecretId`
- 腾讯云 `SecretKey`
- 服务端 API Key
- `CLOUDBASE_SECRET_KEY`
- 任何能代表服务端身份、绕过 CloudBase Auth 或拥有管理权限的密钥

`.env` 已加入 `.gitignore`。公开仓库只提交 `.env.example`，不要提交真实 `.env`。

## CloudBase 控制台配置

1. 创建或选择一个 CloudBase 环境。
2. 在「API Key 配置」中生成客户端 Publishable Key，填入 `.env` 的 `VITE_CLOUDBASE_PUBLISHABLE_KEY`。
3. 在文档型数据库中创建三个集合：`rooms`、`queueItems`、`archivedTasks`。
4. 建议给 `queueItems` 创建索引：`roomCode`、`status`、`createdAt`，用于等待队列查询和排序。
5. 建议给 `archivedTasks` 创建索引：`roomCode`、`archivedAt`，用于后续归档列表查询。

`rooms` 字段：

```text
title
sessionCode
teacherPin
currentStudentNo
createdAt
updatedAt
```

`queueItems` 字段：

```text
roomCode
studentNo
status: waiting | current | done | removed
createdAt
updatedAt
```

`archivedTasks` 字段：

```text
id
roomId
roomCode
roomTitle
archivedAt
totalStudents
completedCount
unfinishedCount
completedStudentNumbers
unfinishedStudentNumbers
completedRecords
waitingQueueSnapshot
currentCallingSnapshot
```

本项目使用 `@cloudbase/js-sdk` `3.3.10`，初始化时把客户端 Publishable Key 传给 `accessKey`：

```ts
cloudbase.init({
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID,
  accessKey: import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY
});
```

Publishable Key 模式不会生成普通 CloudBase Auth 登录态，也不携带具体用户信息。因此如果数据库安全规则写成 `auth != null`、`auth.uid` 或 `auth.openid`，可能会被拒绝。CloudBase 文档说明 Publishable Key 是可公开的访问凭证，使用匿名用户权限；真正防滥用依赖数据库权限、业务校验、限频和腾讯云用量告警。

Publishable Key 模式下的最小可用安全规则如下。它不是强权限隔离，只是避免所有人裸读写和禁止物理删除；当前 MVP 的老师权限仍由 `teacherPin` 在前端校验，后续应迁移到云函数校验。

`rooms`：

```json
{
  "read": true,
  "create": "doc.sessionCode != null && doc.title != null && doc.teacherPin != null",
  "update": "doc.sessionCode != null",
  "delete": false
}
```

`queueItems`：

```json
{
  "read": true,
  "create": "doc.roomCode != null && doc.studentNo != null && doc.status == 'waiting'",
  "update": "doc.roomCode != null && doc.studentNo != null && doc.status in ['waiting', 'current', 'done', 'removed']",
  "delete": false
}
```

`archivedTasks`：

```json
{
  "read": true,
  "create": "doc.roomCode != null && doc.archivedAt != null",
  "update": false,
  "delete": false
}
```

## 本地运行

```bash
npm install
npm run dev
```

测试和构建：

```bash
npm run test
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

GitHub Pages 构建时需要让 Vite 拿到公开环境变量：

- 使用 GitHub Actions 部署时，在仓库 `Settings -> Secrets and variables -> Actions -> Variables` 新增 repository variables：`VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_PUBLISHABLE_KEY`。
- 在 Pages 构建 workflow 的 build step 中通过 `env` 注入这些变量。
- 不要把 `SecretId`、`SecretKey`、服务端 API Key 或 `CLOUDBASE_SECRET_KEY` 放进 GitHub Actions variables、前端 `.env` 或源码。它们不是浏览器端配置。

示例：

```yaml
- name: Build
  run: npm run build
  env:
    VITE_CLOUDBASE_ENV_ID: ${{ vars.VITE_CLOUDBASE_ENV_ID }}
    VITE_CLOUDBASE_PUBLISHABLE_KEY: ${{ vars.VITE_CLOUDBASE_PUBLISHABLE_KEY }}
```

## 安全边界

当前是轻量 MVP：前端使用 CloudBase Web SDK + Publishable Key 直接读写数据库。Publishable Key 可以放前端，但它不是服务端密钥；它只提供匿名用户权限访问能力。老师 PIN 只用于前端显示和调用管理操作前的校验，不应视为最终安全边界，因为前端代码和数据库读写能力都在浏览器侧。后续升级方向是把写操作迁移到云函数，由云函数验证老师 PIN 或老师账号后再写数据库。

## 参考

- [CloudBase JavaScript SDK 数据库 watch 文档](https://docs.cloudbase.net/api-reference/webv3-next/database)
- [CloudBase JavaScript SDK 初始化文档](https://docs.cloudbase.net/api-reference/webv3-next/initialization)
- [CloudBase API Key 配置文档](https://docs.cloudbase.net/api-reference/webv2/api-key)
- [CloudBase Web SDK 身份认证文档](https://docs.cloudbase.net/en/api-reference/webv2/authentication)
- [CloudBase 数据库安全规则文档](https://docs.cloudbase.net/database/security-rules)
