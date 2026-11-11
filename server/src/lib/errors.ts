export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Sign in to continue.') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this.') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message: string, code = 'conflict') {
    return new ApiError(409, code, message);
  }
}
