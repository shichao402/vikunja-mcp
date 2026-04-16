type PrimitiveQueryValue = string | number | boolean;

export type QueryParams = Record<
  string,
  PrimitiveQueryValue | PrimitiveQueryValue[] | undefined
>;

type JsonRecord = Record<string, unknown>;

export interface VikunjaConfig {
  baseUrl: string;
  apiToken?: string;
  username?: string;
  password?: string;
  totpPasscode?: string;
  longToken?: boolean;
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

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
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
    return this.request("GET", "/info", { auth: false });
  }

  async getCurrentUser(): Promise<unknown> {
    return this.request("GET", "/user");
  }

  async listProjects(query?: QueryParams): Promise<unknown> {
    return this.request("GET", "/projects", { query });
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.request("GET", `/projects/${projectId}`);
  }

  async createProject(project: JsonRecord): Promise<unknown> {
    return this.request("PUT", "/projects", { body: project });
  }

  async updateProject(projectId: number, project: JsonRecord): Promise<unknown> {
    return this.request("POST", `/projects/${projectId}`, { body: project });
  }

  async deleteProject(projectId: number): Promise<unknown> {
    return this.request("DELETE", `/projects/${projectId}`);
  }

  async listTasks(query?: QueryParams): Promise<unknown> {
    return this.request("GET", "/tasks", { query });
  }

  async getTask(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.request("GET", `/tasks/${taskId}`, { query });
  }

  async createTask(projectId: number, task: JsonRecord): Promise<unknown> {
    return this.request("PUT", `/projects/${projectId}/tasks`, { body: task });
  }

  async updateTask(taskId: number, task: JsonRecord): Promise<unknown> {
    return this.request("POST", `/tasks/${taskId}`, { body: task });
  }

  async deleteTask(taskId: number): Promise<unknown> {
    return this.request("DELETE", `/tasks/${taskId}`);
  }

  async listLabels(query?: QueryParams): Promise<unknown> {
    return this.request("GET", "/labels", { query });
  }

  async createLabel(label: JsonRecord): Promise<unknown> {
    return this.request("PUT", "/labels", { body: label });
  }

  async listTaskLabels(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.request("GET", `/tasks/${taskId}/labels`, { query });
  }

  async addLabelToTask(taskId: number, labelId: number): Promise<unknown> {
    return this.request("PUT", `/tasks/${taskId}/labels`, {
      body: { label_id: labelId }
    });
  }

  async removeLabelFromTask(taskId: number, labelId: number): Promise<unknown> {
    return this.request("DELETE", `/tasks/${taskId}/labels/${labelId}`);
  }

  async listTaskComments(taskId: number, query?: QueryParams): Promise<unknown> {
    return this.request("GET", `/tasks/${taskId}/comments`, { query });
  }

  async createTaskComment(taskId: number, comment: string): Promise<unknown> {
    return this.request("PUT", `/tasks/${taskId}/comments`, {
      body: { comment }
    });
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
      Accept: "application/json",
      "User-Agent": "vikunja-mcp"
    };

    if (auth) {
      headers.Authorization = `Bearer ${await this.getAccessToken()}`;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
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
  url.pathname = `${basePath}/api/v1/${requestPath}`.replace(/\/+/g, "/");
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
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }

  const contentType = response.headers.get("content-type") ?? "";
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
