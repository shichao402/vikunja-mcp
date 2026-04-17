# @shichao402/vikunja-mcp

English | [简体中文](README.zh-CN.md)

A Vikunja MCP server you can start directly with `npx`, using `stdio` transport for Claude Desktop, Cursor, Cherry Studio, and any other MCP-compatible client.

The current package exposes two layers:

- 19 ergonomic tools for day-to-day project, task, label, and comment workflows
- 161 raw REST tools generated from the bundled Vikunja Swagger snapshot, covering every documented operation in that snapshot

That means the package currently exposes `180` MCP tools in total. Raw tools follow the naming pattern `vikunja_api_<method>_<path>` so the model can call any Vikunja API endpoint precisely when needed.

## Installation

No global install is required. The recommended distribution path is `npx`:

```bash
npx -y @shichao402/vikunja-mcp
```

## Environment Variables

You must at least provide the Vikunja base URL:

```bash
VIKUNJA_BASE_URL=https://vikunja.example.com
```

API token authentication is the preferred option:

```bash
VIKUNJA_API_TOKEN=your_token
```

Supported environment variables:

```bash
VIKUNJA_BASE_URL=https://vikunja.example.com
VIKUNJA_API_TOKEN=your_api_token

# Optional alias
VIKUNJA_URL=https://vikunja.example.com

# Optional username/password login for self-hosted Vikunja
VIKUNJA_USERNAME=your_username
VIKUNJA_PASSWORD=your_password
VIKUNJA_TOTP_PASSCODE=123456
VIKUNJA_LONG_TOKEN=true
```

Notes:

- `VIKUNJA_API_TOKEN` works for both Vikunja Cloud and self-hosted instances and has the highest priority.
- `VIKUNJA_USERNAME` and `VIKUNJA_PASSWORD` are intended for self-hosted instances. The server will call `/api/v1/login`, cache the JWT, and reuse it.
- If you pass a URL ending in `/api/v1`, the server normalizes it automatically.

## Claude Desktop Example

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

## Tool Layers

Ergonomic tools:

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

Raw tools:

- One raw tool for each of the `161` operations in the bundled Vikunja Swagger snapshot
- Example names: `vikunja_api_put_filters`, `vikunja_api_post_tasks_bulk`, `vikunja_api_put_projects_project_views`, `vikunja_api_put_tasks_id_attachments`
- Path and query parameters are top-level fields
- JSON request payloads go in `body`
- Multipart uploads go in `form`
- File values inside `form` use `{ "filename": "a.txt", "contentBase64": "...", "contentType": "text/plain" }`
- Binary download endpoints return `{ kind, contentType, filename, contentBase64, size }`

## API Coverage

Full coverage details and remaining limitations are tracked in [English coverage docs](docs/api-coverage.md) and [中文覆盖文档](docs/api-coverage.zh-CN.md).

Current status:

- Swagger operations in the bundled snapshot: `161`
- Raw MCP coverage: `161 / 161`
- Additional ergonomic tools: `19`
- `POST /login` is exposed both as a raw tool and as an internal self-hosted login capability

## Testing

Contract tests:

```bash
npm test
```

Live smoke tests against a real Vikunja instance:

```bash
VIKUNJA_LIVE_BASE_URL=http://127.0.0.1:34560 \
VIKUNJA_LIVE_USERNAME=mcpadmin \
VIKUNJA_LIVE_PASSWORD='StrongPass123!' \
npm run test:live
```

## Local Development

```bash
npm install
npm run build
```

Show help:

```bash
node dist/index.js --help
```

## Publishing

The package is intentionally distributed via `npx` because that is the lowest-friction path for MCP clients.

```bash
npm publish
```

GitHub repository: `https://github.com/shichao402/vikunja-mcp`
