import { z } from "zod";

const SUPPORTED_METHODS = ["get", "put", "post", "delete", "patch"] as const;
const METHODS_WITH_JSON_BODY = new Set(["PUT", "POST", "PATCH"]);
const PUBLIC_OPERATION_KEYS = new Set([
  "POST /auth/openid/{provider}/callback",
  "GET /info",
  "POST /login",
  "POST /register",
  "POST /shares/{share}/auth",
  "POST /user/confirm",
  "POST /user/deletion/cancel",
  "POST /user/deletion/confirm",
  "POST /user/password/reset",
  "POST /user/password/token",
  "GET /{username}/avatar"
]);

const scalarInputSchema = z.union([z.string(), z.number(), z.boolean()]);
const queryInputSchema = z.union([scalarInputSchema, z.array(scalarInputSchema)]);

export type SwaggerMethod = Uppercase<(typeof SUPPORTED_METHODS)[number]>;

export interface SwaggerDocument {
  paths: Record<string, SwaggerPathItem>;
}

interface SwaggerPathItem {
  parameters?: SwaggerParameter[];
  get?: SwaggerOperation;
  put?: SwaggerOperation;
  post?: SwaggerOperation;
  delete?: SwaggerOperation;
  patch?: SwaggerOperation;
}

interface SwaggerOperation {
  summary?: string;
  description?: string;
  parameters?: SwaggerParameter[];
  security?: Array<Record<string, string[]>>;
}

export interface SwaggerParameter {
  name: string;
  in: "path" | "query" | "body" | "formData";
  required?: boolean;
  description?: string;
  type?: string;
  schema?: unknown;
}

export interface GeneratedToolSpec {
  toolName: string;
  method: SwaggerMethod;
  path: string;
  summary: string;
  description: string;
  pathParameters: SwaggerParameter[];
  queryParameters: SwaggerParameter[];
  bodyParameter?: SwaggerParameter;
  formParameters: SwaggerParameter[];
  authRequired: boolean;
  inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
}

export function countSwaggerOperations(document: SwaggerDocument): number {
  let count = 0;

  for (const pathItem of Object.values(document.paths)) {
    for (const methodName of SUPPORTED_METHODS) {
      if (pathItem[methodName]) {
        count += 1;
      }
    }
  }

  return count;
}

export function getGeneratedToolSpecs(
  document: SwaggerDocument
): GeneratedToolSpec[] {
  const specs: GeneratedToolSpec[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const methodName of SUPPORTED_METHODS) {
      const operation = pathItem[methodName];
      if (!operation) {
        continue;
      }

      const method = methodName.toUpperCase() as SwaggerMethod;
      const parameters = mergeParameters(
        pathItem.parameters ?? [],
        operation.parameters ?? []
      );
      const pathParameters = parameters.filter(
        parameter => parameter.in === "path"
      );
      const queryParameters = parameters.filter(
        parameter => parameter.in === "query"
      );
      const bodyParameter = parameters.find(
        parameter => parameter.in === "body"
      );
      const formParameters = parameters.filter(
        parameter => parameter.in === "formData"
      );

      specs.push({
        toolName: buildToolName(method, path),
        method,
        path,
        summary: operation.summary ?? method + " " + path,
        description: buildToolDescription({
          method,
          path,
          operation,
          bodyParameter,
          formParameters
        }),
        pathParameters,
        queryParameters,
        bodyParameter,
        formParameters,
        authRequired: operationRequiresAuth(method, path, operation),
        inputSchema: buildInputSchema({
          method,
          pathParameters,
          queryParameters,
          bodyParameter,
          formParameters
        })
      });
    }
  }

  return specs.sort((left, right) => left.toolName.localeCompare(right.toolName));
}

function mergeParameters(
  sharedParameters: SwaggerParameter[],
  operationParameters: SwaggerParameter[]
): SwaggerParameter[] {
  const merged = new Map<string, SwaggerParameter>();

  for (const parameter of [...sharedParameters, ...operationParameters]) {
    merged.set(parameter.in + ":" + parameter.name, parameter);
  }

  return [...merged.values()];
}

function buildToolName(method: SwaggerMethod, path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map(segment => sanitizeToolSegment(segment));

  return ["vikunja", "api", method.toLowerCase(), ...segments].join("_");
}

function sanitizeToolSegment(segment: string): string {
  return segment
    .replace(/[{}]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildToolDescription(options: {
  method: SwaggerMethod;
  path: string;
  operation: SwaggerOperation;
  bodyParameter?: SwaggerParameter;
  formParameters: SwaggerParameter[];
}): string {
  const summary = options.operation.summary ?? options.method + " " + options.path;
  const description = options.operation.description?.trim();
  const formFields = options.formParameters.map(parameter => parameter.name);
  const requiredFormFields = options.formParameters
    .filter(parameter => parameter.required)
    .map(parameter => parameter.name);

  return [
    summary + ".",
    "Raw Vikunja REST proxy for " + options.method + " " + options.path + ".",
    description ? collapseWhitespace(description) : null,
    options.formParameters.length > 0
      ? "Pass multipart form data in the form field. File values use an object with filename, contentBase64 and optional contentType. Multi-file fields accept arrays."
      : options.bodyParameter || METHODS_WITH_JSON_BODY.has(options.method)
        ? "Pass the JSON request payload in the optional body field."
        : "This endpoint does not usually require a request body.",
    "Path and query parameters are top-level fields. Original parameter names also accept camelCase and snake_case aliases.",
    options.formParameters.length > 0
      ? "Form fields: " + formFields.join(", ") + ". Required: " + (requiredFormFields.length > 0 ? requiredFormFields.join(", ") : "none") + "."
      : null,
    operationRequiresAuth(options.method, options.path, options.operation)
      ? "Authentication is required."
      : "Authentication is not required."
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildInputSchema(options: {
  method: SwaggerMethod;
  pathParameters: SwaggerParameter[];
  queryParameters: SwaggerParameter[];
  bodyParameter?: SwaggerParameter;
  formParameters: SwaggerParameter[];
}): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const parameter of options.pathParameters) {
    for (const inputName of getParameterInputNames(parameter.name)) {
      shape[inputName] = scalarInputSchema
        .optional()
        .describe(buildParameterDescription(parameter));
    }
  }

  for (const parameter of options.queryParameters) {
    for (const inputName of getParameterInputNames(parameter.name)) {
      shape[inputName] = queryInputSchema
        .optional()
        .describe(buildParameterDescription(parameter));
    }
  }

  if (options.formParameters.length > 0) {
    const formSchema = z
      .record(z.string(), z.unknown())
      .describe(buildFormFieldDescription(options.formParameters));

    shape.form = options.formParameters.some(parameter => parameter.required)
      ? formSchema
      : formSchema.optional();
  } else if (options.bodyParameter || METHODS_WITH_JSON_BODY.has(options.method)) {
    const description =
      options.bodyParameter?.description ??
      "Optional JSON request body. Some Vikunja endpoints accept payloads even when the Swagger snapshot omits the schema.";

    const bodySchema = z.unknown().describe(description);
    shape.body = options.bodyParameter?.required ? bodySchema : bodySchema.optional();
  }

  return z.object(shape).strict();
}

function buildParameterDescription(parameter: SwaggerParameter): string {
  const requirement = parameter.required ? " Required." : " Optional.";
  return (
    (parameter.description ?? parameter.in + " parameter " + parameter.name + ".") +
    requirement
  );
}

function buildFormFieldDescription(parameters: SwaggerParameter[]): string {
  const fieldDescriptions = parameters.map(parameter => {
    const type = parameter.type === "file" ? "file" : parameter.type ?? "string";
    const requirement = parameter.required ? ", required" : "";
    return parameter.name + " (" + type + requirement + ")";
  });

  return (
    "Multipart form data fields: " +
    fieldDescriptions.join("; ") +
    ". Use file objects shaped like { filename, contentBase64, contentType? }. Non-file objects are JSON-stringified before upload."
  );
}

function operationRequiresAuth(
  method: SwaggerMethod,
  path: string,
  operation: SwaggerOperation
): boolean {
  if (PUBLIC_OPERATION_KEYS.has(method + " " + path)) {
    return false;
  }

  if (
    operation.security?.some(
      security => "JWTKeyAuth" in security || "BasicAuth" in security
    )
  ) {
    return true;
  }

  return true;
}

export function getParameterInputNames(name: string): string[] {
  const aliases = [name, toCamelCase(name), toSnakeCase(name)];
  return [...new Set(aliases.filter(alias => alias.length > 0))];
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function toCamelCase(value: string): string {
  const snakeCase = toSnakeCase(value);
  return snakeCase.replace(/_([a-z0-9])/g, (_, character: string) =>
    character.toUpperCase()
  );
}
