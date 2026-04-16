#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { VikunjaClient, VikunjaConfigError } from "./vikunja-client.js";

const HELP_TEXT = `@shichao402/vikunja-mcp

Environment variables:
  VIKUNJA_BASE_URL   Vikunja instance URL, for example https://vikunja.example.com
  VIKUNJA_URL        Alias of VIKUNJA_BASE_URL
  VIKUNJA_API_TOKEN  Preferred auth method for cloud and self-hosted instances
  VIKUNJA_USERNAME   Optional fallback for self-hosted login
  VIKUNJA_PASSWORD   Optional fallback for self-hosted login
  VIKUNJA_TOTP_PASSCODE Optional TOTP code for self-hosted login
  VIKUNJA_LONG_TOKEN Optional, true/false for long-lived self-hosted login token

Examples:
  VIKUNJA_BASE_URL=https://vikunja.example.com VIKUNJA_API_TOKEN=xxx npx -y @shichao402/vikunja-mcp
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
  version: "0.1.0"
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
    description: "Update an existing task.",
    inputSchema: {
      task_id: z.number().int().positive().describe("Task ID."),
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
  async ({ task_id, ...task }) =>
    jsonResult(await client.updateTask(task_id, cleanPayload(task)))
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
