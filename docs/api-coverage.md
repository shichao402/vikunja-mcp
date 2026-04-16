# API Coverage

本文档用于追踪 `@shichao402/vikunja-mcp` 对 Vikunja REST API 的覆盖情况。

统计口径：

- 数据来源：仓库内置 Swagger 快照 [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json)
- 当前 Swagger operation 总数：`161`
- 当前原始 MCP 工具覆盖 operation 数：`161`
- 当前额外易用 MCP 工具数：`19`
- 当前 MCP 工具总数：`180`

## 覆盖结论

当前 Swagger 文档中的所有 REST operation 都已经暴露为 MCP 工具，不再有“未实现接口”缺口。

两类工具并存：

- 易用工具：围绕项目、任务、标签、评论做了更贴近模型调用习惯的参数设计
- 原始工具：逐个映射 Swagger operation，命名规则为 `vikunja_api_<method>_<path>`

## 易用工具

| MCP Tool | Notes |
| --- | --- |
| `vikunja_get_server_info` | 对应 `GET /info` |
| `vikunja_get_current_user` | 对应 `GET /user` |
| `vikunja_list_projects` | 对应 `GET /projects` |
| `vikunja_get_project` | 对应 `GET /projects/{id}` |
| `vikunja_create_project` | 对应 `PUT /projects` |
| `vikunja_update_project` | 对应 `POST /projects/{id}` |
| `vikunja_delete_project` | 对应 `DELETE /projects/{id}` |
| `vikunja_list_tasks` | 对应 `GET /tasks` |
| `vikunja_get_task` | 对应 `GET /tasks/{id}` |
| `vikunja_create_task` | 对应 `PUT /projects/{id}/tasks` |
| `vikunja_update_task` | 对应 `POST /tasks/{id}` |
| `vikunja_delete_task` | 对应 `DELETE /tasks/{id}` |
| `vikunja_list_labels` | 对应 `GET /labels` |
| `vikunja_create_label` | 对应 `PUT /labels` |
| `vikunja_list_task_labels` | 对应 `GET /tasks/{task}/labels` |
| `vikunja_add_label_to_task` | 对应 `PUT /tasks/{task}/labels` |
| `vikunja_remove_label_from_task` | 对应 `DELETE /tasks/{task}/labels/{label}` |
| `vikunja_list_task_comments` | 对应 `GET /tasks/{taskID}/comments` |
| `vikunja_create_task_comment` | 对应 `PUT /tasks/{taskID}/comments` |

## 原始工具

每个 Swagger operation 都有一个原始工具。示例：

| REST Operation | MCP Tool |
| --- | --- |
| `PUT /filters` | `vikunja_api_put_filters` |
| `POST /tasks/bulk` | `vikunja_api_post_tasks_bulk` |
| `PUT /tasks/{taskID}/relations` | `vikunja_api_put_tasks_task_id_relations` |
| `PUT /projects/{project}/views` | `vikunja_api_put_projects_project_views` |
| `PUT /tasks/{id}/attachments` | `vikunja_api_put_tasks_id_attachments` |
| `GET /tasks/{id}/attachments/{attachmentID}` | `vikunja_api_get_tasks_id_attachments_attachment_id` |
| `PUT /user/settings/avatar/upload` | `vikunja_api_put_user_settings_avatar_upload` |
| `POST /shares/{share}/auth` | `vikunja_api_post_shares_share_auth` |

命名规则：

- 前缀固定为 `vikunja_api_`
- HTTP method 转成小写后拼进名字
- 路径中的 `/` 转 `_`
- 路径参数去掉花括号，并统一转成 snake_case

## 参数与返回约定

原始工具统一约定如下：

- 路径参数和查询参数直接作为顶层字段传入
- 同一个参数同时接受原始名字、camelCase、snake_case 三种别名
- JSON 请求体统一放在 `body`
- `multipart/form-data` 上传统一放在 `form`
- 文件字段格式为 `{ filename, contentBase64, contentType? }`
- 多文件字段直接传数组
- 二进制下载接口返回 `{ kind: "binary", contentType, filename, contentBase64, size }`

## 仍需跟踪的限制

虽然“接口缺口”已经补齐，但还有下面这些已知限制，后续应继续跟踪：

| 类型 | 状态 | 说明 |
| --- | --- | --- |
| Swagger 快照依赖 | 已知限制 | 当前覆盖基于仓库内的 Swagger 快照；若 Vikunja 上游新增接口，需要同步更新 [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json) 并重新发布。 |
| 原始工具输入模型 | 已知限制 | 目前原始工具对 `body` 基本采用宽松透传，不会按 definition 逐字段做强校验。这样兼容性更高，但类型提示不够细。 |
| 文档缺 schema 的接口 | 已知限制 | 例如 `PUT /filters` 这类 Swagger 未显式声明 body 参数的接口，当前通过宽松 `body` 透传支持，行为已经可用，但不是强类型生成。 |
| 二进制响应 | 已实现但需知晓 | MCP 返回的是 base64 包装对象，不是直接二进制流。调用方需要自行解码。 |
| 真实实例回归范围 | 部分覆盖 | 当前已经有本地 mock 全量契约测试，以及针对本地 Vikunja 的核心 live smoke test；还没有对全部 161 个接口逐个跑真实服务语义断言。 |

## 已做验证

当前验证分两层：

- `npm test`
  覆盖 19 个易用工具，以及 161 个原始工具的注册、鉴权、路由、JSON body、multipart body、二进制响应封装
- `npm run test:live`
  针对真实 Vikunja 实例跑核心 smoke test，已覆盖项目、任务、筛选器、视图、附件上传等关键路径

## 后续维护建议

后续如果 Vikunja API 继续演进，建议按这个顺序维护：

1. 更新本地 Swagger 快照 [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json)
2. 重新运行 `npm test` 检查生成工具数是否与 operation 总数一致
3. 运行 `npm run test:live` 验证关键真实链路
4. 如有必要，再为新增高频场景补一层易用工具
