import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from './errors';

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
