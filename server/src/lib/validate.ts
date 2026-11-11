import type { z } from 'zod';
import { ApiError } from './errors.js';

/** Parse untrusted input with a zod schema and raise a 400 with field-level details. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new ApiError(400, 'validation_failed', 'Some fields need your attention.', fields);
  }
  return result.data;
}
