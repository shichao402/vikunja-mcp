# @shichao402/vikunja-mcp

一个可直接通过 `npx` 启动的 Vikunja MCP Server，走 `stdio` 传输，适合接到 Claude Desktop、Cherry Studio、Cursor 或任何兼容 MCP 的客户端。

它基于 Vikunja 官方 Swagger/OpenAPI 文档实现，覆盖了最常用的能力：

- 实例信息
- 当前用户信息
- 项目列表 / 查询 / 创建 / 更新 / 删除
- 任务列表 / 查询 / 创建 / 更新 / 删除
- 标签列表 / 创建 / 任务标签管理
- 任务评论列表 / 创建

## 安装方式

不需要全局安装，推荐直接用 `npx`：

```bash
npx -y @shichao402/vikunja-mcp
```

## 环境变量

至少需要配置实例地址：

```bash
VIKUNJA_BASE_URL=https://vikunja.example.com
```

认证优先推荐 API Token：

```bash
VIKUNJA_API_TOKEN=your_token
```

完整支持的环境变量：

```bash
VIKUNJA_BASE_URL=https://vikunja.example.com
VIKUNJA_API_TOKEN=your_api_token

# 可选别名
VIKUNJA_URL=https://vikunja.example.com

# 自建实例可选用户名密码登录，不推荐用于 Vikunja Cloud
VIKUNJA_USERNAME=your_username
VIKUNJA_PASSWORD=your_password
VIKUNJA_TOTP_PASSCODE=123456
VIKUNJA_LONG_TOKEN=true
```

说明：

- `VIKUNJA_API_TOKEN` 适用于 Vikunja Cloud 和自建实例，优先级最高。
- `VIKUNJA_USERNAME` / `VIKUNJA_PASSWORD` 只适合自建实例，服务端会自动调用 `/api/v1/login` 换取 JWT 并缓存。
- 如果你把地址写成 `https://host/api/v1`，服务端也会自动规范化，不需要手动改。

## Claude Desktop 配置示例

```json
{
  "mcpServers": {
    "vikunja": {
      "command": "npx",
      "args": ["-y", "@shichao402/vikunja-mcp"],
      "env": {
        "VIKUNJA_BASE_URL": "https://vikunja.example.com",
        "VIKUNJA_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

## 可用工具

- `vikunja_get_server_info`
- `vikunja_get_current_user`
- `vikunja_list_projects`
- `vikunja_get_project`
- `vikunja_create_project`
- `vikunja_update_project`
- `vikunja_delete_project`
- `vikunja_list_tasks`
- `vikunja_get_task`
- `vikunja_create_task`
- `vikunja_update_task`
- `vikunja_delete_task`
- `vikunja_list_labels`
- `vikunja_create_label`
- `vikunja_list_task_labels`
- `vikunja_add_label_to_task`
- `vikunja_remove_label_from_task`
- `vikunja_list_task_comments`
- `vikunja_create_task_comment`

## 本地开发

```bash
npm install
npm run build
```

查看帮助：

```bash
node dist/index.js --help
```

## 发布到 npm

先确认包名没被占用，并已登录 npm：

```bash
npm whoami
npm publish
```

GitHub 仓库地址会是 `https://github.com/shichao402/vikunja-mcp`。

## 设计取舍

- 分发方式保留为 `npx`，因为对 MCP 客户端最直接，用户侧几乎没有安装成本。
- 默认只做 `stdio` server，不额外引入 HTTP 包装层，减少部署和故障面。
- 认证优先走 API Token，避免把账号密码暴露给模型上下文。
