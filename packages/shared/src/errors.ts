/**
 * Centralized error classes for VaultysClaw
 * Used by both agent-controller and control-plane
 */

/** Base error class for all VaultysClaw errors */
export class VaultysError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** LLM is not configured or configuration is invalid */
export class LlmNotConfiguredError extends VaultysError {
  constructor(message: string = "LLM is not configured", details?: Record<string, any>) {
    super(message, "LLM_NOT_CONFIGURED", 400, details);
  }
}

/** LLM provider error (API error, rate limit, etc.) */
export class LlmProviderError extends VaultysError {
  constructor(
    message: string,
    public provider: string,
    public originalError?: Error,
    statusCode: number = 500
  ) {
    super(message, "LLM_PROVIDER_ERROR", statusCode);
  }
}

/** Invalid configuration or validation error */
export class ValidationError extends VaultysError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/** Resource not found */
export class NotFoundError extends VaultysError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "NOT_FOUND", 404, details);
  }
}

/** User is not authorized */
export class UnauthorizedError extends VaultysError {
  constructor(message: string = "Unauthorized", details?: Record<string, any>) {
    super(message, "UNAUTHORIZED", 401, details);
  }
}

/** User does not have permission */
export class ForbiddenError extends VaultysError {
  constructor(message: string = "Forbidden", details?: Record<string, any>) {
    super(message, "FORBIDDEN", 403, details);
  }
}

/** Conflict error (e.g., resource already exists) */
export class ConflictError extends VaultysError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "CONFLICT", 409, details);
  }
}

/** Workflow or operation timeout */
export class TimeoutError extends VaultysError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "TIMEOUT", 408, details);
  }
}

/** Agent is not available */
export class AgentNotAvailableError extends VaultysError {
  constructor(message: string = "Agent is not available", details?: Record<string, any>) {
    super(message, "AGENT_NOT_AVAILABLE", 503, details);
  }
}

/** Workflow or task execution error */
export class ExecutionError extends VaultysError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "EXECUTION_ERROR", 500, details);
  }
}
