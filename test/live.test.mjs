import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LIVE_BASE_URL = process.env.VIKUNJA_LIVE_BASE_URL;
const LIVE_API_TOKEN = process.env.VIKUNJA_LIVE_API_TOKEN;
const LIVE_USERNAME = process.env.VIKUNJA_LIVE_USERNAME;
const LIVE_PASSWORD = process.env.VIKUNJA_LIVE_PASSWORD;
const LIVE_TOTP = process.env.VIKUNJA_LIVE_TOTP_PASSCODE;
const LIVE_LONG_TOKEN = process.env.VIKUNJA_LIVE_LONG_TOKEN;

const HAS_AUTH =
  Boolean(LIVE_API_TOKEN) || (Boolean(LIVE_USERNAME) && Boolean(LIVE_PASSWORD));

test(
  "live Vikunja smoke covers core raw and ergonomic tools",
  {
    skip: !LIVE_BASE_URL || !HAS_AUTH
      ? "Set VIKUNJA_LIVE_BASE_URL plus VIKUNJA_LIVE_API_TOKEN or VIKUNJA_LIVE_USERNAME/VIKUNJA_LIVE_PASSWORD to run live tests."
      : false
  },
  async t => {
    const mcp = await startMcpClient({
      VIKUNJA_BASE_URL: LIVE_BASE_URL,
      VIKUNJA_API_TOKEN: LIVE_API_TOKEN,
      VIKUNJA_USERNAME: LIVE_USERNAME,
      VIKUNJA_PASSWORD: LIVE_PASSWORD,
      VIKUNJA_TOTP_PASSCODE: LIVE_TOTP,
      VIKUNJA_LONG_TOKEN: LIVE_LONG_TOKEN
    });

    const suffix = String(Date.now());
    let createdProjectId;
    let createdFilterId;

    t.after(async () => {
      if (createdFilterId) {
        await callToolAllowError(mcp.client, "vikunja_api_delete_filters_id", {
          id: createdFilterId
        });
      }

      if (createdProjectId) {
        await callToolAllowError(mcp.client, "vikunja_delete_project", {
          project_id: createdProjectId
        });
      }

      await mcp.close();
    });

    const currentUser = await callToolJson(mcp.client, "vikunja_get_current_user");
    assert.equal(typeof currentUser.id, "number");

    const project = await callToolJson(mcp.client, "vikunja_create_project", {
      title: `mcp live project ${suffix}`,
      description: "Live smoke test project"
    });
    createdProjectId = project.id;
    assert.equal(typeof createdProjectId, "number");

    const task = await callToolJson(mcp.client, "vikunja_create_task", {
      project_id: createdProjectId,
      title: `mcp live task ${suffix}`,
      description: "Live smoke test task"
    });
    assert.equal(typeof task.id, "number");

    const filter = await callToolJson(mcp.client, "vikunja_api_put_filters", {
      body: {
        title: `mcp live filter ${suffix}`,
        description: "Live smoke test filter",
        filters: {
          filter: `project_id = ${createdProjectId}`
        }
      }
    });
    createdFilterId = filter.id;
    assert.equal(typeof createdFilterId, "number");

    const duplicatedTask = await callToolJson(
      mcp.client,
      "vikunja_api_put_tasks_task_id_duplicate",
      {
        task_id: task.id
      }
    );
    assert.equal(typeof duplicatedTask.duplicated_task?.id, "number");

    const view = await callToolJson(
      mcp.client,
      "vikunja_api_put_projects_project_views",
      {
        project: createdProjectId,
        body: {
          title: `Board ${suffix}`,
          view_kind: "kanban",
          position: 1
        }
      }
    );
    assert.equal(typeof view.id, "number");

    const uploadResult = await callToolJson(
      mcp.client,
      "vikunja_api_put_tasks_id_attachments",
      {
        id: task.id,
        form: {
          files: [
            {
              filename: `note-${suffix}.txt`,
              contentBase64: Buffer.from("live attachment", "utf8").toString(
                "base64"
              ),
              contentType: "text/plain"
            }
          ]
        }
      }
    );
    assert.ok(Array.isArray(uploadResult.success));
    assert.ok(uploadResult.success.length > 0);

    const attachments = await callToolJson(
      mcp.client,
      "vikunja_api_get_tasks_id_attachments",
      {
        id: task.id,
        page: 1,
        per_page: 20
      }
    );
    assert.ok(Array.isArray(attachments));
    assert.ok(attachments.length > 0);

    const taskList = await callToolJson(mcp.client, "vikunja_list_tasks", {
      search: suffix,
      page: 1,
      per_page: 20
    });
    assert.ok(Array.isArray(taskList));
    assert.ok(taskList.some(item => item.id === task.id));

    assert.equal(mcp.stderr.trim(), "");
  }
);

async function startMcpClient(overrides) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: buildEnv(overrides),
    stderr: "pipe"
  });

  const stderrChunks = [];
  transport.stderr?.on("data", chunk => {
    stderrChunks.push(String(chunk));
  });

  const client = new Client({
    name: "vikunja-mcp-live-test-client",
    version: "1.0.0"
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await transport.close();
    },
    get stderr() {
      return stderrChunks.join("");
    }
  };
}

async function callToolJson(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(
    result.isError,
    true,
    `Tool ${name} returned an error: ${result.content.map(block => block.type === "text" ? block.text : block.type).join(" ")}`
  );

  const textBlock = result.content.find(block => block.type === "text");
  assert.ok(textBlock, `Tool ${name} did not return a text block.`);

  return JSON.parse(textBlock.text);
}

async function callToolAllowError(client, name, args = {}) {
  await client.callTool({ name, arguments: args });
}

function buildEnv(overrides) {
  const env = {};
  const isolatedKeys = new Set([
    "VIKUNJA_BASE_URL",
    "VIKUNJA_URL",
    "VIKUNJA_API_TOKEN",
    "VIKUNJA_USERNAME",
    "VIKUNJA_PASSWORD",
    "VIKUNJA_TOTP_PASSCODE",
    "VIKUNJA_LONG_TOKEN"
  ]);

  for (const [key, value] of Object.entries(process.env)) {
    if (isolatedKeys.has(key)) {
      continue;
    }

    if (typeof value === "string") {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "") {
      delete env[key];
      continue;
    }

    env[key] = String(value);
  }

  return env;
}
