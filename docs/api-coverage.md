# API Coverage

[简体中文](api-coverage.zh-CN.md)

This document tracks how `@shichao402/vikunja-mcp` covers the Vikunja REST API.

Scope:

- Source of truth: bundled Swagger snapshot [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json)
- Swagger operations in the bundled snapshot: `161`
- Raw MCP tools covering Swagger operations: `161`
- Additional ergonomic MCP tools: `19`
- Total MCP tools exposed by the package: `180`

## Coverage Summary

All REST operations present in the bundled Swagger snapshot are now exposed as MCP tools. There is no remaining documented API gap in that snapshot.

The package exposes two layers:

- Ergonomic tools for common project, task, label, and comment workflows
- Raw tools generated one-to-one from Swagger operations, named as `vikunja_api_<method>_<path>`

## Ergonomic Tools

| MCP Tool | Notes |
| --- | --- |
| `vikunja_get_server_info` | Maps to `GET /info` |
| `vikunja_get_current_user` | Maps to `GET /user` |
| `vikunja_list_projects` | Maps to `GET /projects` |
| `vikunja_get_project` | Maps to `GET /projects/{id}` |
| `vikunja_create_project` | Maps to `PUT /projects` |
| `vikunja_update_project` | Maps to `POST /projects/{id}` |
| `vikunja_delete_project` | Maps to `DELETE /projects/{id}` |
| `vikunja_list_tasks` | Maps to `GET /tasks` |
| `vikunja_get_task` | Maps to `GET /tasks/{id}` |
| `vikunja_create_task` | Maps to `PUT /projects/{id}/tasks` |
| `vikunja_update_task` | Maps to `POST /tasks/{id}`. PATCH-style merge by default: the MCP server first reads the current task, merges your fields on top, and then posts the merged body so unspecified fields are not cleared. Pass `_replace: true` to opt out and post only the explicit fields (Vikunja will then reset every unspecified field to its default). |
| `vikunja_delete_task` | Maps to `DELETE /tasks/{id}` |
| `vikunja_list_labels` | Maps to `GET /labels` |
| `vikunja_create_label` | Maps to `PUT /labels` |
| `vikunja_list_task_labels` | Maps to `GET /tasks/{task}/labels` |
| `vikunja_add_label_to_task` | Maps to `PUT /tasks/{task}/labels` |
| `vikunja_remove_label_from_task` | Maps to `DELETE /tasks/{task}/labels/{label}` |
| `vikunja_list_task_comments` | Maps to `GET /tasks/{taskID}/comments` |
| `vikunja_create_task_comment` | Maps to `PUT /tasks/{taskID}/comments` |

## Raw Tools

Every Swagger operation has a corresponding raw tool. Examples:

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

Naming rules:

- Fixed prefix: `vikunja_api_`
- Lowercased HTTP method
- Path separators converted to `_`
- Path parameters stripped from braces and normalized to snake_case

## Input and Output Conventions

Raw tools follow these conventions:

- Path and query parameters are top-level input fields
- Each parameter accepts the original name, camelCase, and snake_case aliases
- JSON payloads go into `body`
- Multipart uploads go into `form`
- File fields use `{ filename, contentBase64, contentType? }`
- Multi-file fields accept arrays
- Binary download endpoints return `{ kind: "binary", contentType, filename, contentBase64, size }`

## Remaining Limitations to Track

The API gap is closed, but these implementation limits still matter:

| Type | Status | Details |
| --- | --- | --- |
| Swagger snapshot dependency | Known limitation | Coverage is tied to the bundled Swagger snapshot. If Vikunja adds new endpoints upstream, [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json) must be refreshed and the package republished. |
| Raw body typing | Known limitation | Raw tools mostly treat `body` as a permissive pass-through payload instead of validating every Swagger definition field-by-field. This keeps compatibility high but weakens type guidance. |
| Endpoints missing body schema in Swagger | Known limitation | Some endpoints such as `PUT /filters` do not declare an explicit body parameter in the snapshot. They are still supported through permissive `body` pass-through, but not via fully typed generation. |
| Binary responses | Implemented with caveat | MCP returns base64-wrapped metadata objects instead of a direct binary stream. Callers must decode the payload themselves. |
| Real-instance regression depth | Partial | There is full mock-based contract coverage plus live smoke coverage for core workflows, but there is not yet a semantic live assertion for all 161 endpoints. |

## Verification

Current verification is split into two layers:

- `npm test`
  Covers the 19 ergonomic tools plus registration, auth behavior, routing, JSON payloads, multipart payloads, and binary response wrapping for all 161 raw tools.
- `npm run test:live`
  Runs a smoke test against a real Vikunja instance, covering core project, task, filter, view, and attachment flows.

## Maintenance Guidance

When Vikunja evolves, update this package in this order:

1. Refresh the local Swagger snapshot [src/vikunja-docs.json](/Users/firoyang/workspace/vikunja-mcp/src/vikunja-docs.json)
2. Run `npm test` and confirm generated tool count still matches Swagger operation count
3. Run `npm run test:live` for real-instance validation of the critical paths
4. Add or refine ergonomic tools only for genuinely high-frequency workflows
