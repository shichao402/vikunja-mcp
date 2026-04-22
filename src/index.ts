#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { VikunjaClient, VikunjaConfigError } from "./vikunja-client.js";
import {
  getGeneratedToolSpecs,
  getParameterInputNames,
  type GeneratedToolSpec,
  type SwaggerDocument,
  type SwaggerParameter
} from "./swagger.js";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as {
  name?: string;
  version?: string;
};

const packageName = packageMetadata.name ?? "@shichao402/vikunja-mcp";
const packageVersion = packageMetadata.version ?? "0.0.0";
const swaggerDocument = loadSwaggerDocument();
const generatedToolSpecs = getGeneratedToolSpecs(swaggerDocument);

const HELP_TEXT = `${packageName}

Environment variables:
  VIKUNJA_BASE_URL   Vikunja instance URL, for example https://vikunja.example.com
  VIKUNJA_URL        Alias of VIKUNJA_BASE_URL
  VIKUNJA_API_TOKEN  Preferred auth method for cloud and self-hosted instances
  VIKUNJA_USERNAME   Optional fallback for self-hosted login
  VIKUNJA_PASSWORD   Optional fallback for self-hosted login
  VIKUNJA_TOTP_PASSCODE Optional TOTP code for self-hosted login
  VIKUNJA_LONG_TOKEN Optional, true/false for long-lived self-hosted login token

Examples:
  VIKUNJA_BASE_URL=https://vikunja.example.com VIKUNJA_API_TOKEN=xxx npx -y ${packageName}
`;

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(0);
}

const client = new VikunjaClient({
  baseUrl: process.env.VIKUNJA_BASE_URL ?? process.env.VIKUNJA_URL ?? "",
  apiToken: readOptionalEnv("VIKUNJA_API_TOKEN"),
  username: readOptionalEnv("VIKUNJA_USERNAME"),
  password: readOptionalEnv("VIKUNJA_PASSWORD"),
  totpPasscode: readOptionalEnv("VIKUNJA_TOTP_PASSCODE"),
  longToken: parseBooleanEnv(process.env.VIKUNJA_LONG_TOKEN)
});

const server = new McpServer({
  name: "vikunja-mcp",
  version: packageVersion
});

const commonListSchema = {
  page: z.number().int().positive().optional().describe("Page number."),
  per_page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of items per page."),
  search: z
    .string()
    .optional()
    .describe("Search text. Maps to Vikunja query parameter `s`.")
};

server.registerTool(
  "vikunja_get_server_info",
  {
    description:
      "Get public information about the configured Vikunja instance, including version and enabled settings. No auth token is required.",
    inputSchema: {}
  },
  async () => jsonResult(await client.getServerInfo())
);

server.registerTool(
  "vikunja_get_current_user",
  {
    description:
      "Get the authenticated Vikunja user profile and settings for the configured credentials.",
    inputSchema: {}
  },
  async () => jsonResult(await client.getCurrentUser())
);

server.registerTool(
  "vikunja_list_projects",
  {
    description: "List projects visible to the authenticated Vikunja user.",
    inputSchema: {
      ...commonListSchema,
      is_archived: z
        .boolean()
        .optional()
        .describe("Include archived projects when true."),
      include_permissions: z
        .boolean()
        .optional()
        .describe("Expand project permissions when true.")
    }
  },
  async ({ page, per_page, search, is_archived, include_permissions }) =>
    jsonResult(
      await client.listProjects({
        page,
        per_page,
        s: search,
        is_archived,
        expand: include_permissions ? "permissions" : undefined
      })
    )
);

server.registerTool(
  "vikunja_get_project",
  {
    description: "Get a single project by ID.",
    inputSchema: {
      project_id: z.number().int().positive().describe("Vikunja project ID.")
    }
  },
  async ({ project_id }) => jsonResult(await client.getProject(project_id))
);

server.registerTool(
  "vikunja_create_project",
  {
    description: "Create a new Vikunja project.",
    inputSchema: {
      title: z.string().min(1).max(250).describe("Project title."),
      description: z.string().optional().describe("Project description."),
      hex_color: z
        .string()
        .regex(/^#?[0-9A-Fa-f]{6}$/)
        .optional()
        .describe("Hex color like #4F46E5."),
      identifier: z
        .string()
        .max(10)
        .optional()
        .describe("Optional short identifier."),
      is_favorite: z.boolean().optional().describe("Mark project as favorite."),
      is_archived: z.boolean().optional().describe("Create project as archived."),
      parent_project_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional parent project ID."),
      position: z.number().optional().describe("Optional project position.")
    }
  },
  async (input) => jsonResult(await client.createProject(cleanPayload(input)))
);

server.registerTool(
  "vikunja_update_project",
  {
    description: "Update an existing Vikunja project.",
    inputSchema: {
      project_id: z.number().int().positive().describe("Project ID."),
      title: z.string().min(1).max(250).optional().describe("Project title."),
      description: z.string().optional().describe("Project description."),
      hex_color: z
        .string()
        .regex(/^#?[0-9A-Fa-f]{6}$/)
        .optional()
        .describe("Hex color like #4F46E5."),
      identifier: z
        .string()
        .max(10)
        .optional()
        .describe("Short identifier."),
      is_favorite: z.boolean().optional().describe("Favorite state."),
      is_archived: z.boolean().optional().describe("Archive state."),
      parent_project_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Parent project ID."),
      position: z.number().optional().describe("Project position.")
    }
  },
  async ({ project_id, ...project }) =>
    jsonResult(await client.updateProject(project_id, cleanPayload(project)))
);

server.registerTool(
  "vikunja_delete_project",
  {
    description: "Delete a project by ID.",
    inputSchema: {
      project_id: z.number().int().positive().describe("Project ID.")
    }
  },
  async ({ project_id }) => jsonResult(await client.deleteProject(project_id))
);

server.registerTool(
  "vikunja_list_tasks",
  {
    description:
      "List tasks across all accessible projects, with optional search, filtering, sorting, and expansions.",
    inputSchema: {
      ...commonListSchema,
      sort_by: z
        .array(z.string().min(1))
        .optional()
        .describe("One or more sort fields such as id, title, due_date, priority."),
      order_by: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort order."),
      filter: z
        .string()
        .optional()
        .describe("Vikunja filter query string."),
      filter_timezone: z
        .string()
        .optional()
        .describe("Timezone used by filter date comparisons."),
      filter_include_nulls: z
        .boolean()
        .optional()
        .describe("Include null values in filter results."),
      expand: z
        .array(z.enum(["subtasks", "buckets", "reactions", "comments"]))
        .optional()
        .describe("Expand task details." )
    }
  },
  async ({
    page,
    per_page,
    search,
    sort_by,
    order_by,
    filter,
    filter_timezone,
    filter_include_nulls,
    expand
  }) =>
    jsonResult(
      await client.listTasks({
        page,
        per_page,
        s: search,
        sort_by,
        order_by,
        filter,
        filter_timezone,
        filter_include_nulls,
        expand
      })
    )
);

server.registerTool(
  "vikunja_get_task",
  {
    description: "Get a single task by ID.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      expand: z
        .array(z.enum(["subtasks", "buckets", "reactions", "comments"]))
        .optional()
        .describe("Expand task details.")
    }
  },
  async ({ task_id, expand }) =>
    jsonResult(await client.getTask(task_id, { expand }))
);

server.registerTool(
  "vikunja_create_task",
  {
    description: "Create a task inside a project.",
    inputSchema: {
      project_id: z.number().int().positive().describe("Target project ID."),
      title: z.string().min(1).describe("Task title."),
      description: z.string().optional().describe("Task description."),
      done: z.boolean().optional().describe("Mark task as done."),
      due_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Due date in ISO 8601 format."),
      start_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Start date in ISO 8601 format."),
      end_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("End date in ISO 8601 format."),
      priority: z.number().int().optional().describe("Task priority."),
      percent_done: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Completion percentage."),
      hex_color: z
        .string()
        .regex(/^#?[0-9A-Fa-f]{6}$/)
        .optional()
        .describe("Task color."),
      repeat_after: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Repeat interval in seconds."),
      bucket_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Bucket ID inside the current view."),
      position: z.number().optional().describe("Task position."),
      is_favorite: z.boolean().optional().describe("Favorite state.")
    }
  },
  async ({ project_id, ...task }) =>
    jsonResult(await client.createTask(project_id, cleanPayload(task)))
);

server.registerTool(
  "vikunja_update_task",
  {
    description:
      "Update an existing task with PATCH-style semantics. By default only the fields you pass are changed; every other field keeps its current value (the MCP server reads the task first and merges your input on top). Set `_replace: true` to opt out and use Vikunja's native full-replacement behavior, which resets every unspecified field to its type default.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      _replace: z
        .boolean()
        .optional()
        .describe(
          "Opt-out escape hatch. When true, skip the read-then-merge step and post only the fields you pass, which causes Vikunja to reset any unspecified field to its default. Leave unset for safe partial updates."
        ),
      title: z.string().min(1).optional().describe("Task title."),
      description: z.string().optional().describe("Task description."),
      done: z.boolean().optional().describe("Mark task as done."),
      due_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Due date in ISO 8601 format."),
      start_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Start date in ISO 8601 format."),
      end_date: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("End date in ISO 8601 format."),
      priority: z.number().int().optional().describe("Task priority."),
      percent_done: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Completion percentage."),
      project_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Move task to another project."),
      hex_color: z
        .string()
        .regex(/^#?[0-9A-Fa-f]{6}$/)
        .optional()
        .describe("Task color."),
      repeat_after: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Repeat interval in seconds."),
      bucket_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Bucket ID inside the current view."),
      position: z.number().optional().describe("Task position."),
      is_favorite: z.boolean().optional().describe("Favorite state.")
    }
  },
  async ({ task_id, _replace, ...task }) =>
    jsonResult(
      await client.updateTask(task_id, cleanPayload(task), { replace: _replace })
    )
);

server.registerTool(
  "vikunja_delete_task",
  {
    description: "Delete a task by ID.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID.")
    }
  },
  async ({ task_id }) => jsonResult(await client.deleteTask(task_id))
);

server.registerTool(
  "vikunja_list_labels",
  {
    description: "List labels visible to the authenticated user.",
    inputSchema: {
      ...commonListSchema
    }
  },
  async ({ page, per_page, search }) =>
    jsonResult(await client.listLabels({ page, per_page, s: search }))
);

server.registerTool(
  "vikunja_create_label",
  {
    description: "Create a new label.",
    inputSchema: {
      title: z.string().min(1).max(250).describe("Label title."),
      description: z.string().optional().describe("Label description."),
      hex_color: z
        .string()
        .regex(/^#?[0-9A-Fa-f]{6}$/)
        .optional()
        .describe("Label color." )
    }
  },
  async (input) => jsonResult(await client.createLabel(cleanPayload(input)))
);

server.registerTool(
  "vikunja_list_task_labels",
  {
    description: "List labels attached to a task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      ...commonListSchema
    }
  },
  async ({ task_id, page, per_page, search }) =>
    jsonResult(
      await client.listTaskLabels(task_id, { page, per_page, s: search })
    )
);

server.registerTool(
  "vikunja_add_label_to_task",
  {
    description: "Attach an existing label to a task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      label_id: z.number().int().positive().describe("Label ID.")
    }
  },
  async ({ task_id, label_id }) =>
    jsonResult(await client.addLabelToTask(task_id, label_id))
);

server.registerTool(
  "vikunja_remove_label_from_task",
  {
    description: "Remove a label from a task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      label_id: z.number().int().positive().describe("Label ID.")
    }
  },
  async ({ task_id, label_id }) =>
    jsonResult(await client.removeLabelFromTask(task_id, label_id))
);

server.registerTool(
  "vikunja_list_task_comments",
  {
    description: "List comments on a task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      order_by: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Comment ordering.")
    }
  },
  async ({ task_id, order_by }) =>
    jsonResult(await client.listTaskComments(task_id, { order_by }))
);

server.registerTool(
  "vikunja_create_task_comment",
  {
    description: "Create a comment on a task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
      comment: z.string().min(1).describe("Comment body.")
    }
  },
  async ({ task_id, comment }) =>
    jsonResult(await client.createTaskComment(task_id, comment))
);

registerGeneratedTools();

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message =
    error instanceof VikunjaConfigError || error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

function registerGeneratedTools(): void {
  for (const spec of generatedToolSpecs) {
    server.registerTool(
      spec.toolName,
      {
        description: spec.description,
        inputSchema: spec.inputSchema
      },
      async input =>
        jsonResult(await invokeGeneratedTool(spec, normalizeToolInput(input)))
    );
  }
}

async function invokeGeneratedTool(
  spec: GeneratedToolSpec,
  input: Record<string, unknown>
): Promise<unknown> {
  const requestPath = resolveRequestPath(spec, input);
  const query = resolveQuery(spec, input);
  const body = resolveBodyInput(spec, input);
  const form = resolveFormInput(spec, input);

  if (body !== undefined && form !== undefined) {
    throw new VikunjaConfigError(
      `Tool ${spec.toolName} received both body and form input. Use only one payload style per request.`
    );
  }

  return client.rawRequest(spec.method, requestPath, {
    auth: spec.authRequired,
    query,
    body,
    form
  });
}

function resolveRequestPath(
  spec: GeneratedToolSpec,
  input: Record<string, unknown>
): string {
  let resolvedPath = spec.path;

  for (const parameter of spec.pathParameters) {
    const value = getInputValue(input, parameter);
    if (value === undefined) {
      throw new VikunjaConfigError(
        `Missing required path parameter ${parameter.name} for tool ${spec.toolName}.`
      );
    }

    resolvedPath = resolvedPath.replace(
      `{${parameter.name}}`,
      encodeURIComponent(stringifyPrimitiveValue(value, parameter.name, spec.toolName))
    );
  }

  return resolvedPath;
}

function resolveQuery(
  spec: GeneratedToolSpec,
  input: Record<string, unknown>
): Record<string, string | number | boolean | Array<string | number | boolean>> | undefined {
  const query: Record<
    string,
    string | number | boolean | Array<string | number | boolean>
  > = {};

  for (const parameter of spec.queryParameters) {
    const value = getInputValue(input, parameter);
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      query[parameter.name] = value.map(item =>
        normalizeQueryPrimitive(item, parameter.name, spec.toolName)
      );
      continue;
    }

    query[parameter.name] = normalizeQueryPrimitive(
      value,
      parameter.name,
      spec.toolName
    );
  }

  return Object.keys(query).length > 0 ? query : undefined;
}

function resolveBodyInput(
  spec: GeneratedToolSpec,
  input: Record<string, unknown>
): unknown {
  if (input.body !== undefined) {
    return input.body;
  }

  if (spec.bodyParameter) {
    for (const alias of getParameterInputNames(spec.bodyParameter.name)) {
      const value = input[alias];
      if (value !== undefined) {
        return value;
      }
    }

    if (spec.bodyParameter.required) {
      throw new VikunjaConfigError(
        `Missing required body payload for tool ${spec.toolName}. Pass it in the body field.`
      );
    }
  }

  return undefined;
}

function resolveFormInput(
  spec: GeneratedToolSpec,
  input: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (spec.formParameters.length === 0) {
    return undefined;
  }

  const rawForm = input.form;
  if (rawForm === undefined) {
    const requiredFields = spec.formParameters.filter(parameter => parameter.required);
    if (requiredFields.length > 0) {
      throw new VikunjaConfigError(
        `Missing required form payload for tool ${spec.toolName}. Pass multipart fields in the form object.`
      );
    }

    return undefined;
  }

  if (!isPlainObject(rawForm)) {
    throw new VikunjaConfigError(
      `Tool ${spec.toolName} expects form to be an object of multipart fields.`
    );
  }

  const form = cleanPayload(rawForm);

  for (const parameter of spec.formParameters) {
    if (parameter.required && form[parameter.name] === undefined) {
      throw new VikunjaConfigError(
        `Missing required form field ${parameter.name} for tool ${spec.toolName}.`
      );
    }
  }

  return form;
}

function getInputValue(
  input: Record<string, unknown>,
  parameter: SwaggerParameter
): unknown {
  for (const alias of getParameterInputNames(parameter.name)) {
    const value = input[alias];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function normalizeQueryPrimitive(
  value: unknown,
  parameterName: string,
  toolName: string
): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  throw new VikunjaConfigError(
    `Tool ${toolName} received a non-scalar value for query parameter ${parameterName}.`
  );
}

function stringifyPrimitiveValue(
  value: unknown,
  parameterName: string,
  toolName: string
): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  throw new VikunjaConfigError(
    `Tool ${toolName} received a non-scalar value for path parameter ${parameterName}.`
  );
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (isPlainObject(input)) {
    return input;
  }

  return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadSwaggerDocument(): SwaggerDocument {
  const candidateUrls = [
    new URL("./vikunja-docs.json", import.meta.url),
    new URL("../src/vikunja-docs.json", import.meta.url)
  ];

  for (const candidateUrl of candidateUrls) {
    if (!existsSync(candidateUrl)) {
      continue;
    }

    return JSON.parse(readFileSync(candidateUrl, "utf8")) as SwaggerDocument;
  }

  throw new VikunjaConfigError(
    "Missing bundled Vikunja Swagger snapshot. Expected vikunja-docs.json to be available at runtime."
  );
}

function jsonResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function cleanPayload<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new VikunjaConfigError(
    `Invalid boolean value for VIKUNJA_LONG_TOKEN: ${value}`
  );
}
