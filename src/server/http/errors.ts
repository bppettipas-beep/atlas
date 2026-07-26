import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = 'You need to sign in to do that.', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to do that.', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'We could not find that.', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }
}

/** Wraps an async route handler so rejected promises reach the error handler. */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'That API endpoint does not exist.' },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some of the information you sent is not valid.',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta?.target as string[]).join(', ')
        : 'value';
      res.status(409).json({
        error: {
          code: 'DUPLICATE',
          message: `That ${target} is already taken.`,
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'We could not find that record.' },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: {
          code: 'INVALID_REFERENCE',
          message: 'That points at something which no longer exists.',
        },
      });
      return;
    }
  }

  const isMulterLimit =
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
  if (isMulterLimit) {
    res.status(413).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: `That file is larger than the ${env.MAX_UPLOAD_MB}MB limit.`,
      },
    });
    return;
  }

  console.error('[atlas] Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProduction
        ? 'Something went wrong on our side. Please try again.'
        : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
    },
  });
}
