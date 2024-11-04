export class MissingApiKeyError extends Error {
  constructor(message = "API key is missing") {
    super(message);
    this.name = "MissingApiKeyError";

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, MissingApiKeyError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MissingApiKeyError);
    }
  }
}

export class ValidationError extends Error {
  constructor(message = "Validation error occurred") {
    super(message);
    this.name = "ValidationError";

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, ValidationError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}
export class UnsupportedModelError extends Error {
  constructor(message = "Model is unsupported") {
    super(message);
    this.name = "UnsupportedModelError";

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, UnsupportedModelError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsupportedModelError);
    }
  }
}
