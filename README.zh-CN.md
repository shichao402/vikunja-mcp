# @shichao402/vikunja-mcp

[English](README.md) | 简体中文

一个可直接通过 `npx` 启动的 Vikunja MCP Server，走 `stdio` 传输，适合接到 Claude Desktop、Cursor、Cherry Studio 和其他兼容 MCP 的客户端。

当前版本分两层能力：

- 19 个高频“易用工具”，覆盖项目、任务、标签、评论这些日常核心操作
- 161 个基于仓库内 Vikunja Swagger 快照自动生成的原始 REST 工具，覆盖该快照里的全部 operation

也就是说，当前总共暴露 `180` 个 MCP 工具。原始工具命名规则为 `vikunja_api_<method>_<path>`，便于模型在需要时精确调用任意 Vikunja API。

## 安装方式

不需要全局安装，推荐直接使用 `npx`：

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

# 自建实例可选用户名密码登录
VIKUNJA_USERNAME=your_username
VIKUNJA_PASSWORD=your_password
VIKUNJA_TOTP_PASSCODE=123456
VIKUNJA_LONG_TOKEN=true
```

说明：

- `VIKUNJA_API_TOKEN` 适用于 Vikunja Cloud 和自建实例，优先级最高。
- `VIKUNJA_USERNAME` / `VIKUNJA_PASSWORD` 主要用于自建实例，服务端会自动调用 `/api/v1/login` 换取 JWT 并缓存复用。
- 如果地址写成 `https://host/api/v1`，服务端也会自动规范化。

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

## 工具分层

易用工具：

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

原始工具：

- 与仓库内 Vikunja Swagger 快照中的 `161` 个 operation 一一对应
- 命名示例：`vikunja_api_put_filters`、`vikunja_api_post_tasks_bulk`、`vikunja_api_put_projects_project_views`、`vikunja_api_put_tasks_id_attachments`
- 路径参数和查询参数直接放顶层
- JSON 请求体统一放在 `body`
- `multipart/form-data` 上传统一放在 `form`
- `form` 中文件字段格式为 `{ "filename": "a.txt", "contentBase64": "...", "contentType": "text/plain" }`
- 二进制下载接口会返回 `{ kind, contentType, filename, contentBase64, size }`

## API 覆盖追踪

完整覆盖和仍有约束的地方见 [中文覆盖文档](docs/api-coverage.zh-CN.md) 和 [English coverage docs](docs/api-coverage.md)。

当前状态：

- 仓库内 Swagger 快照 operation 总数：`161`
- 原始 MCP 工具覆盖：`161 / 161`
- 额外易用工具：`19`
- `POST /login` 已同时作为原始工具暴露，也仍保留为自建实例用户名密码登录的内部能力

## 测试

本地契约测试：

```bash
npm test
```

针对真实 Vikunja 实例的冒烟测试：

```bash
VIKUNJA_LIVE_BASE_URL=http://127.0.0.1:34560 \
VIKUNJA_LIVE_USERNAME=mcpadmin \
VIKUNJA_LIVE_PASSWORD='StrongPass123!' \
npm run test:live
```

## 本地开发

```bash
npm install
npm run build
```

查看帮助：

```bash
node dist/index.js --help
```

## 发布方式

当前仍然保留 `npx` 作为默认分发方式，因为它对 MCP 客户端的接入成本最低。

```bash
npm publish
```

GitHub 仓库：`https://github.com/shichao402/vikunja-mcp`
