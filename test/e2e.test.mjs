import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  countSwaggerOperations,
  getGeneratedToolSpecs,
  getParameterInputNames
} from "../dist/swagger.js";

const API_TOKEN = "test-api-token";
const LOGIN_TOKEN = "test-login-token";
const USERNAME = "demo-user";
const PASSWORD = "demo-password";
const TOTP = "123456";

const LEGACY_TOOL_NAMES = [
  "vikunja_get_server_info",
  "vikunja_get_current_user",
  "vikunja_list_projects",
  "vikunja_get_project",
  "vikunja_create_project",
  "vikunja_update_project",
  "vikunja_delete_project",
  "vikunja_list_tasks",
  "vikunja_get_task",
  "vikunja_create_task",
  "vikunja_update_task",
  "vikunja_delete_task",
  "vikunja_list_labels",
  "vikunja_create_label",
  "vikunja_list_task_labels",
  "vikunja_add_label_to_task",
  "vikunja_remove_label_from_task",
  "vikunja_list_task_comments",
  "vikunja_create_task_comment"
];

const swaggerDocument = JSON.parse(
  readFileSync(new URL("../src/vikunja-docs.json", import.meta.url), "utf8")
);
const GENERATED_TOOL_SPECS = getGeneratedToolSpecs(swaggerDocument);
const GENERATED_TOOL_NAMES = GENERATED_TOOL_SPECS.map(spec => spec.toolName);
const ALL_TOOL_NAMES = [...new Set([...LEGACY_TOOL_NAMES, ...GENERATED_TOOL_NAMES])];
const PUBLIC_GENERATED_TOOLS = GENERATED_TOOL_SPECS.filter(
  spec => !spec.authRequired
).map(spec => spec.toolName);
const BINARY_PATHS = new Set([
  "/backgrounds/unsplash/image/{image}",
  "/backgrounds/unsplash/image/{image}/thumb",
  "/projects/{id}/background",
  "/tasks/{id}/attachments/{attachmentID}",
  "/{username}/avatar"
]);

test("legacy ergonomic tools still work over stdio with API token auth", async t => {
  const mock = await startMockVikunjaServer();
  const mcp = await startMcpClient({
    VIKUNJA_BASE_URL: mock.baseUrl,
    VIKUNJA_API_TOKEN: API_TOKEN
  });

  t.after(async () => {
    await mcp.close();
    await mock.close();
  });

  const tools = await mcp.client.listTools();
  assert.deepEqual(
    tools.tools
      .map(tool => tool.name)
      .filter(name => LEGACY_TOOL_NAMES.includes(name))
      .sort(),
    [...LEGACY_TOOL_NAMES].sort()
  );

  const serverInfo = await callToolJson(mcp.client, "vikunja_get_server_info");
  assert.equal(serverInfo.endpoint, "get_server_info");
  assert.equal(serverInfo.auth, null);

  const currentUser = await callToolJson(mcp.client, "vikunja_get_current_user");
  assert.equal(currentUser.endpoint, "get_current_user");
  assert.equal(currentUser.auth, `Bearer ${API_TOKEN}`);

  const listProjects = await callToolJson(mcp.client, "vikunja_list_projects", {
    page: 2,
    per_page: 10,
    search: "alpha",
    is_archived: true,
    include_permissions: true
  });
  assert.deepEqual(listProjects.query, {
    page: "2",
    per_page: "10",
    s: "alpha",
    is_archived: "true",
    expand: "permissions"
  });

  const getProject = await callToolJson(mcp.client, "vikunja_get_project", {
    project_id: 42
  });
  assert.equal(getProject.path, "/api/v1/projects/42");

  const createProjectBody = {
    title: "Project A",
    description: "Created from test",
    hex_color: "#123456",
    identifier: "PA",
    is_favorite: true,
    is_archived: false,
    parent_project_id: 7,
    position: 3.5
  };
  const createProject = await callToolJson(
    mcp.client,
    "vikunja_create_project",
    createProjectBody
  );
  assert.deepEqual(createProject.body, createProjectBody);

  const updateProjectBody = {
    project_id: 42,
    title: "Project B",
    description: "Updated from test",
    hex_color: "#654321",
    identifier: "PB",
    is_favorite: false,
    is_archived: true,
    parent_project_id: 9,
    position: 7.25
  };
  const updateProject = await callToolJson(
    mcp.client,
    "vikunja_update_project",
    updateProjectBody
  );
  assert.equal(updateProject.path, "/api/v1/projects/42");
  assert.deepEqual(updateProject.body, {
    title: "Project B",
    description: "Updated from test",
    hex_color: "#654321",
    identifier: "PB",
    is_favorite: false,
    is_archived: true,
    parent_project_id: 9,
    position: 7.25
  });

  const deleteProject = await callToolJson(mcp.client, "vikunja_delete_project", {
    project_id: 42
  });
  assert.equal(deleteProject.path, "/api/v1/projects/42");

  const listTasks = await callToolJson(mcp.client, "vikunja_list_tasks", {
    page: 3,
    per_page: 20,
    search: "urgent",
    sort_by: ["title", "due_date"],
    order_by: "desc",
    filter: "done = false",
    filter_timezone: "Asia/Shanghai",
    filter_include_nulls: true,
    expand: ["comments", "subtasks"]
  });
  assert.deepEqual(listTasks.query, {
    page: "3",
    per_page: "20",
    s: "urgent",
    sort_by: ["title", "due_date"],
    order_by: "desc",
    filter: "done = false",
    filter_timezone: "Asia/Shanghai",
    filter_include_nulls: "true",
    expand: ["comments", "subtasks"]
  });

  const getTask = await callToolJson(mcp.client, "vikunja_get_task", {
    task_id: 55,
    expand: ["comments", "subtasks"]
  });
  assert.equal(getTask.path, "/api/v1/tasks/55");
  assert.deepEqual(getTask.query, {
    expand: ["comments", "subtasks"]
  });

  const createTaskBody = {
    project_id: 42,
    title: "Task A",
    description: "Created task",
    done: false,
    due_date: "2026-04-20T10:00:00+08:00",
    start_date: "2026-04-18T09:00:00+08:00",
    end_date: "2026-04-21T18:00:00+08:00",
    priority: 4,
    percent_done: 25,
    hex_color: "#0f0f0f",
    repeat_after: 3600,
    bucket_id: 8,
    position: 1.25,
    is_favorite: true
  };
  const createTask = await callToolJson(
    mcp.client,
    "vikunja_create_task",
    createTaskBody
  );
  assert.equal(createTask.path, "/api/v1/projects/42/tasks");
  assert.deepEqual(createTask.body, {
    title: "Task A",
    description: "Created task",
    done: false,
    due_date: "2026-04-20T10:00:00+08:00",
    start_date: "2026-04-18T09:00:00+08:00",
    end_date: "2026-04-21T18:00:00+08:00",
    priority: 4,
    percent_done: 25,
    hex_color: "#0f0f0f",
    repeat_after: 3600,
    bucket_id: 8,
    position: 1.25,
    is_favorite: true
  });

  const updateTaskBody = {
    task_id: 55,
    title: "Task B",
    description: "Updated task",
    done: true,
    due_date: "2026-04-22T10:00:00+08:00",
    start_date: "2026-04-20T09:00:00+08:00",
    end_date: "2026-04-23T18:00:00+08:00",
    priority: 5,
    percent_done: 100,
    project_id: 43,
    hex_color: "#f0f0f0",
    repeat_after: 7200,
    bucket_id: 9,
    position: 3.5,
    is_favorite: false
  };
  const updateTask = await callToolJson(
    mcp.client,
    "vikunja_update_task",
    updateTaskBody
  );
  assert.equal(updateTask.path, "/api/v1/tasks/55");
  assert.deepEqual(updateTask.body, {
    title: "Task B",
    description: "Updated task",
    done: true,
    due_date: "2026-04-22T10:00:00+08:00",
    start_date: "2026-04-20T09:00:00+08:00",
    end_date: "2026-04-23T18:00:00+08:00",
    priority: 5,
    percent_done: 100,
    project_id: 43,
    hex_color: "#f0f0f0",
    repeat_after: 7200,
    bucket_id: 9,
    position: 3.5,
    is_favorite: false
  });

  const deleteTask = await callToolJson(mcp.client, "vikunja_delete_task", {
    task_id: 55
  });
  assert.equal(deleteTask.path, "/api/v1/tasks/55");

  const listLabels = await callToolJson(mcp.client, "vikunja_list_labels", {
    page: 4,
    per_page: 12,
    search: "backend"
  });
  assert.deepEqual(listLabels.query, {
    page: "4",
    per_page: "12",
    s: "backend"
  });

  const createLabel = await callToolJson(mcp.client, "vikunja_create_label", {
    title: "Bug",
    description: "Bug label",
    hex_color: "#ff0000"
  });
  assert.deepEqual(createLabel.body, {
    title: "Bug",
    description: "Bug label",
    hex_color: "#ff0000"
  });

  const listTaskLabels = await callToolJson(mcp.client, "vikunja_list_task_labels", {
    task_id: 55,
    page: 1,
    per_page: 5,
    search: "prio"
  });
  assert.equal(listTaskLabels.path, "/api/v1/tasks/55/labels");
  assert.deepEqual(listTaskLabels.query, {
    page: "1",
    per_page: "5",
    s: "prio"
  });

  const addLabelToTask = await callToolJson(
    mcp.client,
    "vikunja_add_label_to_task",
    {
      task_id: 55,
      label_id: 66
    }
  );
  assert.equal(addLabelToTask.path, "/api/v1/tasks/55/labels");
  assert.deepEqual(addLabelToTask.body, { label_id: 66 });

  const removeLabelFromTask = await callToolJson(
    mcp.client,
    "vikunja_remove_label_from_task",
    {
      task_id: 55,
      label_id: 66
    }
  );
  assert.equal(removeLabelFromTask.path, "/api/v1/tasks/55/labels/66");

  const listTaskComments = await callToolJson(
    mcp.client,
    "vikunja_list_task_comments",
    {
      task_id: 55,
      order_by: "desc"
    }
  );
  assert.equal(listTaskComments.path, "/api/v1/tasks/55/comments");
  assert.deepEqual(listTaskComments.query, { order_by: "desc" });

  const createTaskComment = await callToolJson(
    mcp.client,
    "vikunja_create_task_comment",
    {
      task_id: 55,
      comment: "Looks good"
    }
  );
  assert.equal(createTaskComment.path, "/api/v1/tasks/55/comments");
  assert.deepEqual(createTaskComment.body, { comment: "Looks good" });

  assert.equal(mcp.stderr.trim(), "");
});

test("generated raw tools are registered for every swagger operation and route correctly", async t => {
  assert.equal(GENERATED_TOOL_SPECS.length, countSwaggerOperations(swaggerDocument));

  const mock = await startMockVikunjaServer();
  const mcp = await startMcpClient({
    VIKUNJA_BASE_URL: mock.baseUrl,
    VIKUNJA_API_TOKEN: API_TOKEN
  });

  t.after(async () => {
    await mcp.close();
    await mock.close();
  });

  const tools = await mcp.client.listTools();
  assert.deepEqual(
    tools.tools.map(tool => tool.name).sort(),
    [...ALL_TOOL_NAMES].sort()
  );

  for (const spec of GENERATED_TOOL_SPECS) {
    const args = buildGeneratedArgs(spec);
    const previousRequestCount = mock.requests.length;
    const result = await callToolJson(mcp.client, spec.toolName, args);
    const request = mock.requests[previousRequestCount];

    assert.ok(request, `No request captured for ${spec.toolName}`);
    assert.equal(request.method, spec.method, `Unexpected method for ${spec.toolName}`);
    assert.equal(
      request.path,
      buildExpectedApiPath(spec, args),
      `Unexpected path for ${spec.toolName}`
    );
    assert.equal(
      request.auth,
      spec.authRequired ? `Bearer ${API_TOKEN}` : null,
      `Unexpected auth header for ${spec.toolName}`
    );
    assert.deepEqual(
      request.query,
      buildExpectedQuery(spec, args),
      `Unexpected query for ${spec.toolName}`
    );

    if (spec.formParameters.length > 0) {
      assert.match(
        request.contentType ?? "",
        /^multipart\/form-data; boundary=/,
        `Expected multipart content-type for ${spec.toolName}`
      );
      verifyMultipartBody(spec, request.rawBody, args);
    } else if (args.body !== undefined) {
      assert.match(
        request.contentType ?? "",
        /^application\/json/,
        `Expected JSON content-type for ${spec.toolName}`
      );
      assert.deepEqual(request.body, args.body, `Unexpected JSON body for ${spec.toolName}`);
    } else {
      assert.equal(request.body, null, `Expected no body for ${spec.toolName}`);
    }

    if (isBinarySpec(spec)) {
      assert.equal(result.kind, "binary", `Expected binary result for ${spec.toolName}`);
      assert.equal(typeof result.contentBase64, "string");
      assert.ok(result.contentBase64.length > 0);
      continue;
    }

    assert.equal(result.method, spec.method, `Unexpected echoed method for ${spec.toolName}`);
    assert.equal(result.path, request.path, `Unexpected echoed path for ${spec.toolName}`);
  }

  assert.equal(mcp.stderr.trim(), "");
});

test("raw public tools skip auth while protected raw tools still require credentials", async t => {
  const mock = await startMockVikunjaServer();
  const unauthenticated = await startMcpClient({
    VIKUNJA_BASE_URL: mock.baseUrl
  });

  t.after(async () => {
    await unauthenticated.close();
    await mock.close();
  });

  for (const toolName of PUBLIC_GENERATED_TOOLS) {
    const spec = GENERATED_TOOL_SPECS.find(candidate => candidate.toolName === toolName);
    assert.ok(spec, `Missing generated spec for ${toolName}`);
    const result = await callToolJson(
      unauthenticated.client,
      toolName,
      buildGeneratedArgs(spec)
    );

    if (isBinarySpec(spec)) {
      assert.equal(result.kind, "binary");
    }
  }

  const protectedTool = GENERATED_TOOL_SPECS.find(spec => spec.authRequired);
  assert.ok(protectedTool, "Expected at least one authenticated generated tool");

  const failure = await unauthenticated.client.callTool({
    name: protectedTool.toolName,
    arguments: buildGeneratedArgs(protectedTool)
  });

  assert.equal(failure.isError, true);
  const textBlock = failure.content.find(block => block.type === "text");
  assert.ok(textBlock);
  assert.match(textBlock.text, /Authentication is required/);
});

test("self-hosted login flow logs in once and reuses the JWT", async t => {
  const mock = await startMockVikunjaServer();
  const mcp = await startMcpClient({
    VIKUNJA_BASE_URL: mock.baseUrl,
    VIKUNJA_USERNAME: USERNAME,
    VIKUNJA_PASSWORD: PASSWORD,
    VIKUNJA_TOTP_PASSCODE: TOTP,
    VIKUNJA_LONG_TOKEN: "true"
  });

  t.after(async () => {
    await mcp.close();
    await mock.close();
  });

  const currentUser = await callToolJson(mcp.client, "vikunja_get_current_user");
  const listProjects = await callToolJson(mcp.client, "vikunja_list_projects", {
    search: "cached"
  });

  assert.equal(currentUser.auth, `Bearer ${LOGIN_TOKEN}`);
  assert.equal(listProjects.auth, `Bearer ${LOGIN_TOKEN}`);

  const loginRequests = mock.requests.filter(request => request.path === "/api/v1/login");
  assert.equal(loginRequests.length, 1);
  assert.deepEqual(loginRequests[0].body, {
    username: USERNAME,
    password: PASSWORD,
    totp_passcode: TOTP,
    long_token: true
  });
  assert.equal(mcp.stderr.trim(), "");
});

test("authenticated tools return MCP tool errors when credentials are missing", async t => {
  const mock = await startMockVikunjaServer();
  const mcp = await startMcpClient({
    VIKUNJA_BASE_URL: mock.baseUrl
  });

  t.after(async () => {
    await mcp.close();
    await mock.close();
  });

  const result = await mcp.client.callTool({
    name: "vikunja_get_current_user",
    arguments: {}
  });

  assert.equal(result.isError, true);
  const textBlock = result.content.find(block => block.type === "text");
  assert.ok(textBlock);
  assert.match(textBlock.text, /Authentication is required/);
  assert.equal(mock.requests.length, 0);
});

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
    name: "vikunja-mcp-test-client",
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

async function startMockVikunjaServer() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { body, rawBody } = await readRequestBody(req);
    const request = {
      method,
      path: url.pathname,
      query: searchParamsToObject(url.searchParams),
      body,
      rawBody,
      auth: req.headers.authorization ?? null,
      contentType: typeof req.headers["content-type"] === "string"
        ? req.headers["content-type"]
        : null
    };

    requests.push(request);

    if (method === "GET" && url.pathname === "/api/v1/info") {
      return json(res, 200, {
        endpoint: "get_server_info",
        ...request
      });
    }

    if (method === "POST" && url.pathname === "/api/v1/login") {
      return json(res, 200, { token: LOGIN_TOKEN, ...request });
    }

    if (!isPublicRoute(method, url.pathname) && !isAuthorized(request.auth)) {
      return json(res, 401, { message: "Unauthorized" });
    }

    if (isBinaryRoute(method, url.pathname)) {
      return binary(res, {
        contentType: detectBinaryContentType(url.pathname),
        filename: detectBinaryFilename(url.pathname),
        body: Buffer.from(`binary:${method}:${url.pathname}`, "utf8")
      });
    }

    return json(res, 200, {
      endpoint: resolveLegacyEndpoint(method, url.pathname),
      ...request
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    }
  };
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
    if (value === undefined) {
      delete env[key];
      continue;
    }

    env[key] = String(value);
  }

  return env;
}

function isAuthorized(auth) {
  return auth === `Bearer ${API_TOKEN}` || auth === `Bearer ${LOGIN_TOKEN}`;
}

function resolveLegacyEndpoint(method, path) {
  if (method === "GET" && path === "/api/v1/user") return "get_current_user";
  if (method === "GET" && path === "/api/v1/projects") return "list_projects";
  if (method === "PUT" && path === "/api/v1/projects") return "create_project";
  if (method === "GET" && /^\/api\/v1\/projects\/\d+$/.test(path)) return "get_project";
  if (method === "POST" && /^\/api\/v1\/projects\/\d+$/.test(path)) return "update_project";
  if (method === "DELETE" && /^\/api\/v1\/projects\/\d+$/.test(path)) return "delete_project";
  if (method === "GET" && path === "/api/v1/tasks") return "list_tasks";
  if (method === "PUT" && /^\/api\/v1\/projects\/\d+\/tasks$/.test(path)) return "create_task";
  if (method === "GET" && /^\/api\/v1\/tasks\/\d+$/.test(path)) return "get_task";
  if (method === "POST" && /^\/api\/v1\/tasks\/\d+$/.test(path)) return "update_task";
  if (method === "DELETE" && /^\/api\/v1\/tasks\/\d+$/.test(path)) return "delete_task";
  if (method === "GET" && path === "/api/v1/labels") return "list_labels";
  if (method === "PUT" && path === "/api/v1/labels") return "create_label";
  if (method === "GET" && /^\/api\/v1\/tasks\/\d+\/labels$/.test(path)) return "list_task_labels";
  if (method === "PUT" && /^\/api\/v1\/tasks\/\d+\/labels$/.test(path)) return "add_label_to_task";
  if (method === "DELETE" && /^\/api\/v1\/tasks\/\d+\/labels\/\d+$/.test(path)) return "remove_label_from_task";
  if (method === "GET" && /^\/api\/v1\/tasks\/\d+\/comments$/.test(path)) return "list_task_comments";
  if (method === "PUT" && /^\/api\/v1\/tasks\/\d+\/comments$/.test(path)) return "create_task_comment";

  return null;
}

function buildGeneratedArgs(spec) {
  const args = {};

  for (const parameter of spec.pathParameters) {
    args[getPreferredArgumentName(parameter.name)] = buildScalarSample(parameter.name, parameter.type);
  }

  for (const parameter of spec.queryParameters) {
    args[getPreferredArgumentName(parameter.name)] = buildQuerySample(parameter.name, parameter.type);
  }

  if (spec.formParameters.length > 0) {
    args.form = Object.fromEntries(
      spec.formParameters.map(parameter => [
        parameter.name,
        buildFormSample(parameter.name, parameter.type)
      ])
    );
  } else if (spec.bodyParameter?.required || ["PUT", "POST", "PATCH"].includes(spec.method)) {
    args.body = buildBodySample(spec);
  }

  return args;
}

function getPreferredArgumentName(parameterName) {
  const aliases = getParameterInputNames(parameterName);
  return aliases[aliases.length - 1] ?? parameterName;
}

function buildScalarSample(name, type) {
  const lowerName = name.toLowerCase();

  if (type === "integer") {
    return 7;
  }

  if (type === "number") {
    return 1.5;
  }

  if (type === "boolean") {
    return true;
  }

  if (lowerName === "relationkind") {
    return "related";
  }

  if (lowerName === "provider") {
    return "oidc";
  }

  if (lowerName === "kind") {
    return "tasks";
  }

  if (lowerName === "entity") {
    return "project";
  }

  if (lowerName === "table") {
    return "tasks";
  }

  if (lowerName === "username") {
    return "demo-user";
  }

  if (lowerName === "share") {
    return "sharehash";
  }

  if (lowerName === "image") {
    return "image-id";
  }

  return `${name}-value`;
}

function buildQuerySample(name, type) {
  const lowerName = name.toLowerCase();

  if (lowerName === "sort_by") {
    return ["id", "title"];
  }

  if (lowerName === "expand") {
    return ["subtasks", "comments"];
  }

  if (lowerName === "order_by") {
    return "desc";
  }

  if (lowerName === "preview_size") {
    return "sm";
  }

  if (lowerName === "filter") {
    return "done = false";
  }

  if (lowerName === "filter_timezone") {
    return "Asia/Shanghai";
  }

  if (lowerName === "s") {
    return "search-term";
  }

  if (type === "integer") {
    return 2;
  }

  if (type === "number") {
    return 2.5;
  }

  if (type === "boolean") {
    return true;
  }

  return `${name}-query`;
}

function buildFormSample(name, type) {
  const lowerName = name.toLowerCase();

  if (
    type === "file" ||
    lowerName === "files" ||
    lowerName === "background" ||
    lowerName === "avatar" ||
    lowerName === "import"
  ) {
    const file = {
      filename: `${name}.txt`,
      contentBase64: Buffer.from(`${name}-file-content`, "utf8").toString("base64"),
      contentType: "text/plain"
    };

    return lowerName === "files" ? [file, { ...file, filename: `${name}-2.txt` }] : file;
  }

  if (lowerName === "config") {
    return JSON.stringify({ sample: true, field: name });
  }

  return `${name}-form`;
}

function buildBodySample(spec) {
  return {
    tool: spec.toolName,
    method: spec.method,
    path: spec.path
  };
}

function buildExpectedApiPath(spec, args) {
  let path = spec.path;

  for (const parameter of spec.pathParameters) {
    const value = readArgumentValue(args, parameter.name);
    path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(value)));
  }

  return `/api/v1${path}`;
}

function buildExpectedQuery(spec, args) {
  const query = {};

  for (const parameter of spec.queryParameters) {
    const value = readArgumentValue(args, parameter.name);
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      query[parameter.name] = value.map(item => String(item));
      continue;
    }

    query[parameter.name] = String(value);
  }

  return query;
}

function readArgumentValue(args, parameterName) {
  for (const alias of getParameterInputNames(parameterName)) {
    if (args[alias] !== undefined) {
      return args[alias];
    }
  }

  return undefined;
}

function verifyMultipartBody(spec, rawBody, args) {
  assert.equal(typeof rawBody, "string", `Expected raw multipart body for ${spec.toolName}`);

  for (const parameter of spec.formParameters) {
    assert.match(rawBody, new RegExp(`name="${escapeRegExp(parameter.name)}"`));
    const value = args.form[parameter.name];

    if (Array.isArray(value)) {
      for (const item of value) {
        assert.match(rawBody, new RegExp(`filename="${escapeRegExp(item.filename)}"`));
      }
      continue;
    }

    if (value && typeof value === "object" && "filename" in value) {
      assert.match(rawBody, new RegExp(`filename="${escapeRegExp(value.filename)}"`));
      continue;
    }

    assert.match(rawBody, new RegExp(escapeRegExp(String(value))));
  }
}

function isBinarySpec(spec) {
  return spec.method === "GET" && BINARY_PATHS.has(spec.path);
}

function isBinaryRoute(method, path) {
  if (method !== "GET") {
    return false;
  }

  return GENERATED_TOOL_SPECS.some(spec => {
    return isBinarySpec(spec) && matchesApiPath(spec.path, path);
  });
}

function isPublicRoute(method, path) {
  const spec = GENERATED_TOOL_SPECS.find(candidate => {
    return candidate.method === method && matchesApiPath(candidate.path, path);
  });

  return spec ? !spec.authRequired : false;
}

function matchesApiPath(templatePath, actualPath) {
  const regex = new RegExp(
    "^/api/v1" + templatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^/]+?\\\}/g, "[^/]+") + "$"
  );
  return regex.test(actualPath);
}

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBuffer = Buffer.concat(chunks);
  const rawBody = rawBuffer.toString("utf8");
  if (rawBuffer.length === 0) {
    return { body: null, rawBody: "" };
  }

  const contentType = typeof req.headers["content-type"] === "string"
    ? req.headers["content-type"]
    : "";

  if (contentType.includes("application/json")) {
    return {
      body: JSON.parse(rawBody),
      rawBody
    };
  }

  return {
    body: null,
    rawBody
  };
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function binary(res, options) {
  const headers = {
    "content-type": options.contentType
  };

  if (options.filename) {
    headers["content-disposition"] = `attachment; filename="${options.filename}"`;
  }

  res.writeHead(200, headers);
  res.end(options.body);
}

function detectBinaryContentType(path) {
  if (path.includes("/avatar")) {
    return "image/png";
  }

  if (path.includes("/background") || path.includes("/unsplash/")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function detectBinaryFilename(path) {
  if (path.includes("/avatar")) {
    return "avatar.png";
  }

  if (path.includes("/background") || path.includes("/unsplash/")) {
    return "background.jpg";
  }

  return "attachment.bin";
}

function searchParamsToObject(searchParams) {
  const result = {};

  for (const [key, value] of searchParams.entries()) {
    if (!(key in result)) {
      result[key] = value;
      continue;
    }

    const existing = result[key];
    result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
