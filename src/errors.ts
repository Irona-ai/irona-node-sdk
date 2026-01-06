export class MissingApiKeyError extends Error {
  constructor(message = 'API key is missing') {
    super(message);
    this.name = 'MissingApiKeyError';

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, MissingApiKeyError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, MissingApiKeyError);
    }
  }
}

export class BadRequestError extends Error {
  constructor(message = 'Bad Request, Error occurred in request validation.') {
    super(message);
    this.name = 'BadRequestError';

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, BadRequestError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, BadRequestError);
    }
  }
}
export class UnsupportedModelError extends Error {
  constructor(message = 'Model is unsupported') {
    super(message);
    this.name = 'UnsupportedModelError';

    // Set the prototype explicitly for better compatibility across environments
    Object.setPrototypeOf(this, UnsupportedModelError.prototype);

    // Capture the stack trace for easier debugging, ignoring this constructor call
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, UnsupportedModelError);
    }
  }
}
