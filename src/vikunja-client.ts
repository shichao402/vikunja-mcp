type PrimitiveQueryValue = string | number | boolean;

type JsonRecord = Record<string, unknown>;

export type QueryParams = Record<
  string,
  PrimitiveQueryValue | PrimitiveQueryValue[] | undefined
>;

export interface VikunjaConfig {
  baseUrl: string;
  apiToken?: string;
  username?: string;
  password?: string;
  totpPasscode?: string;
  longToken?: boolean;
}

export interface MultipartFileInput {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

export interface BinaryResponse {
  kind: "binary";
  contentType: string;
  contentDisposition?: string;
  filename?: string;
  size: number;
  contentBase64: string;
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  form?: Record<string, unknown>;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

export class VikunjaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VikunjaConfigError";
  }
}

export class VikunjaApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly details: unknown;

  constructor(options: {
    status: number;
    method: string;
    path: string;
    details: unknown;
    message: string;
  }) {
    super(options.message);
    this.name = "VikunjaApiError";
    this.status = options.status;
    this.method = options.method;
    this.path = options.path;
    this.details = options.details;
  }
}

export class VikunjaClient {
  private readonly config: VikunjaConfig;
  private readonly baseUrl: URL;
  private jwtToken?: string;

  constructor(config: VikunjaConfig) {
    this.config = config;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async getServerInfo(): Promise<unknown> {
    return this.rawRequest("GET", "/info", { auth: false });
  }

  async getCurrentUser(): Promise<unknown> {
    return this.rawRequest("GET", "/user");
  }

  async listProjects(query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", "/projects", { query });
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.rawRequest("GET", `/projects/${projectId}`);
  }

  async createProject(project: JsonRecord): Promise<unknown> {
    return this.rawRequest("PUT", "/projects", { body: project });
  }

  async updateProject(projectId: number, project: JsonRecord): Promise<unknown> {
    return this.rawRequest("POST", `/projects/${projectId}`, { body: project });
  }

  async deleteProject(projectId: number): Promise<unknown> {
    return this.rawRequest("DELETE", `/projects/${projectId}`);
  }

  async listTasks(query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", "/tasks", { query });
  }

  async getTask(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", `/tasks/${taskId}`, { query });
  }

  async createTask(projectId: number, task: JsonRecord): Promise<unknown> {
    return this.rawRequest("PUT", `/projects/${projectId}/tasks`, { body: task });
  }

  async updateTask(
    taskId: number,
    task: JsonRecord,
    options: { replace?: boolean } = {}
  ): Promise<unknown> {
    if (options.replace) {
      return this.rawRequest("POST", `/tasks/${taskId}`, { body: task });
    }

    const current = await this.getTask(taskId);
    const currentRecord = isJsonRecord(current) ? current : {};
    const merged = {
      ...stripReadOnlyTaskFields(currentRecord),
      ...task
    };
    return this.rawRequest("POST", `/tasks/${taskId}`, { body: merged });
  }

  async deleteTask(taskId: number): Promise<unknown> {
    return this.rawRequest("DELETE", `/tasks/${taskId}`);
  }

  async listLabels(query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", "/labels", { query });
  }

  async createLabel(label: JsonRecord): Promise<unknown> {
    return this.rawRequest("PUT", "/labels", { body: label });
  }

  async listTaskLabels(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", `/tasks/${taskId}/labels`, { query });
  }

  async addLabelToTask(taskId: number, labelId: number): Promise<unknown> {
    return this.rawRequest("PUT", `/tasks/${taskId}/labels`, {
      body: { label_id: labelId }
    });
  }

  async removeLabelFromTask(taskId: number, labelId: number): Promise<unknown> {
    return this.rawRequest("DELETE", `/tasks/${taskId}/labels/${labelId}`);
  }

  async listTaskComments(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.rawRequest("GET", `/tasks/${taskId}/comments`, { query });
  }

  async createTaskComment(taskId: number, comment: string): Promise<unknown> {
    return this.rawRequest("PUT", `/tasks/${taskId}/comments`, {
      body: { comment }
    });
  }

  async rawRequest(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<unknown> {
    return this.request(method, path, options);
  }

  private async request(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<unknown> {
    const auth = options.auth ?? true;
    const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
    const url = buildApiUrl(this.baseUrl, path, options.query);

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      "User-Agent": "vikunja-mcp"
    };

    if (auth) {
      headers.Authorization = `Bearer ${await this.getAccessToken()}`;
    }

    const requestBody = buildRequestBody(options, headers);

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody
    });

    const parsed = await parseResponse(response);

    if (
      response.status === 401 &&
      auth &&
      retryOnUnauthorized &&
      !this.config.apiToken &&
      this.config.username &&
      this.config.password
    ) {
      this.jwtToken = undefined;
      return this.request(method, path, {
        ...options,
        retryOnUnauthorized: false
      });
    }

    if (!response.ok) {
      throw new VikunjaApiError({
        status: response.status,
        method,
        path,
        details: parsed,
        message: buildApiErrorMessage(response.status, method, path, parsed)
      });
    }

    return parsed;
  }

  private async getAccessToken(): Promise<string> {
    if (this.config.apiToken) {
      return this.config.apiToken;
    }

    if (this.jwtToken) {
      return this.jwtToken;
    }

    if (!this.config.username || !this.config.password) {
      throw new VikunjaConfigError(
        "Authentication is required. Set VIKUNJA_API_TOKEN, or use VIKUNJA_USERNAME and VIKUNJA_PASSWORD for a self-hosted instance."
      );
    }

    const loginBody: JsonRecord = {
      username: this.config.username,
      password: this.config.password
    };

    if (this.config.totpPasscode) {
      loginBody.totp_passcode = this.config.totpPasscode;
    }

    if (this.config.longToken !== undefined) {
      loginBody.long_token = this.config.longToken;
    }

    const response = await this.request("POST", "/login", {
      auth: false,
      body: loginBody,
      retryOnUnauthorized: false
    });

    const token = asRecord(response).token;
    if (typeof token !== "string" || token.length === 0) {
      throw new VikunjaConfigError(
        "Login succeeded but no JWT token was returned by Vikunja."
      );
    }

    this.jwtToken = token;
    return token;
  }
}

function buildRequestBody(
  options: RequestOptions,
  headers: Record<string, string>
): BodyInit | undefined {
  if (options.form && options.body !== undefined) {
    throw new VikunjaConfigError(
      "A Vikunja request cannot send JSON body and multipart form data at the same time."
    );
  }

  if (options.form) {
    return buildFormData(options.form);
  }

  if (options.body === undefined) {
    return undefined;
  }

  headers["Content-Type"] = "application/json";

  if (typeof options.body === "string") {
    return options.body;
  }

  return JSON.stringify(options.body);
}

function buildFormData(fields: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    appendFormValue(formData, name, value);
  }

  return formData;
}

function appendFormValue(
  formData: FormData,
  name: string,
  value: unknown
): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendFormValue(formData, name, item);
    }
    return;
  }

  if (isMultipartFileInput(value)) {
    const fileBuffer = Buffer.from(value.contentBase64, "base64");
    const blob = new Blob([fileBuffer], {
      type: value.contentType ?? "application/octet-stream"
    });
    formData.append(name, blob, value.filename);
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    formData.append(name, String(value));
    return;
  }

  if (value === null) {
    formData.append(name, "null");
    return;
  }

  formData.append(name, JSON.stringify(value));
}

function isMultipartFileInput(value: unknown): value is MultipartFileInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.filename === "string" &&
    typeof candidate.contentBase64 === "string"
  );
}

function normalizeBaseUrl(input: string): URL {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new VikunjaConfigError(
      "Missing Vikunja base URL. Set VIKUNJA_BASE_URL or VIKUNJA_URL."
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new VikunjaConfigError(
      `Invalid Vikunja base URL: ${trimmed}. Expected a full URL like https://vikunja.example.com`
    );
  }

  url.hash = "";
  url.search = "";

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/api/v1")) {
    pathname = pathname.slice(0, -"/api/v1".length);
  }

  url.pathname = pathname.length === 0 ? "/" : `${pathname}/`;

  return url;
}

function buildApiUrl(baseUrl: URL, path: string, query?: QueryParams): URL {
  const url = new URL(baseUrl.toString());
  const basePath = url.pathname.replace(/\/+$/, "");
  const requestPath = path.replace(/^\/+/, "");
  url.pathname = `${basePath}/api/v1/${requestPath}`.replace(/\/+?/g, "/");
  url.search = "";

  if (query) {
    for (const [key, rawValue] of Object.entries(query)) {
      if (rawValue === undefined) {
        continue;
      }

      if (Array.isArray(rawValue)) {
        for (const item of rawValue) {
          url.searchParams.append(key, String(item));
        }
        continue;
      }

      url.searchParams.append(key, String(rawValue));
    }
  }

  return url;
}

async function parseResponse(response: Response): Promise<unknown> {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    return {};
  }

  const contentType = response.headers.get("content-type") ?? "";
  const contentDisposition = response.headers.get("content-disposition") ?? undefined;

  if (isBinaryResponse(contentType, contentDisposition)) {
    return {
      kind: "binary",
      contentType: contentType || "application/octet-stream",
      contentDisposition,
      filename: extractFilename(contentDisposition),
      size: buffer.length,
      contentBase64: buffer.toString("base64")
    } satisfies BinaryResponse;
  }

  const text = buffer.toString("utf8");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isBinaryResponse(
  contentType: string,
  contentDisposition: string | undefined
): boolean {
  if (contentDisposition && /filename\*?=/i.test(contentDisposition)) {
    return true;
  }

  const normalized = contentType.toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  if (normalized.includes("application/json")) {
    return false;
  }

  if (normalized.startsWith("text/")) {
    return false;
  }

  if (
    normalized.includes("xml") ||
    normalized.includes("yaml") ||
    normalized.includes("javascript") ||
    normalized.includes("svg")
  ) {
    return false;
  }

  return true;
}

function extractFilename(contentDisposition: string | undefined): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1];
}

function buildApiErrorMessage(
  status: number,
  method: string,
  path: string,
  details: unknown
): string {
  const payload = asRecord(details, false);
  const message =
    typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : JSON.stringify(details);

  const code =
    typeof payload.code === "number" || typeof payload.code === "string"
      ? ` (code: ${String(payload.code)})`
      : "";

  return `Vikunja request failed: ${method} ${path} returned ${status}${code}. ${message}`;
}

function asRecord(value: unknown, throwOnInvalid = true): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  if (throwOnInvalid) {
    throw new VikunjaConfigError("Expected a JSON object response from Vikunja.");
  }

  return {};
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const READ_ONLY_TASK_FIELDS: ReadonlySet<string> = new Set([
  "created",
  "updated",
  "done_at",
  "created_by",
  "identifier",
  "index",
  "related_tasks",
  "reactions",
  "attachments",
  "cover_image_attachment_id",
  "labels",
  "assignees",
  "subscription",
  "buckets",
  "reminders"
]);

function stripReadOnlyTaskFields(task: JsonRecord): JsonRecord {
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(task)) {
    if (READ_ONLY_TASK_FIELDS.has(key)) {
      continue;
    }
    result[key] = value;
  }
  return result;
}
