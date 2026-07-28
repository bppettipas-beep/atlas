import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { ApiError } from './errors';

/**
 * A boolean read off a query string.
 *
 * `z.coerce.boolean()` is the wrong tool here: it is `Boolean(value)`, and
 * every non-empty string is truthy, so `?includeDone=false` arrived as `true`
 * and the filter quietly did nothing. Query values are always strings, so the
 * words have to be read rather than coerced.
 */
const TRUE_WORDS = new Set(['true', '1', 'yes', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'off', '']);

export function booleanQuery(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      if (typeof value === 'boolean') return value;
      const word = value.trim().toLowerCase();
      if (TRUE_WORDS.has(word)) return true;
      if (FALSE_WORDS.has(word)) return false;
      // Anything unrecognised falls back rather than failing the whole request:
      // a malformed filter should not break the page it belongs to.
      return defaultValue;
    });
}

function format(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Validates and replaces `req.body`. */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new ApiError(
          422,
          'VALIDATION_ERROR',
          'Please check the highlighted fields.',
          format(result.error),
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates `req.query`. Express 5 makes `req.query` a getter, so the parsed
 * result is stored on `res.locals.query` and read back with `parsedQuery()`.
 */
export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new ApiError(
          422,
          'VALIDATION_ERROR',
          'Some of the filters you used are not valid.',
          format(result.error),
        ),
      );
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export function parsedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
