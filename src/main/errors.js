export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super('INVALID_INPUT', message);
    this.name = 'ValidationError';
  }
}

export function publicError(error) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'The operation could not be completed.'
  };
}
