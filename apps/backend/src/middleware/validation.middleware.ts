import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

import { badRequest, unauthorized } from '../lib/http-errors';
import type { Actor } from '../types/actor';

type AnySchema = z.ZodType;

interface Schemas {
  body?: AnySchema;
  params?: AnySchema;
  query?: AnySchema;
}

type Infer<S> = S extends AnySchema ? z.output<S> : undefined;

export interface HandlerInput<S extends Schemas> {
  body: Infer<S['body']>;
  params: Infer<S['params']>;
  query: Infer<S['query']>;
  req: Request;
  res: Response;
}

export interface AuthedInput<S extends Schemas> extends HandlerInput<S> {
  actor: Actor;
}

function parse<S extends AnySchema | undefined>(schema: S, value: unknown, where: string) {
  if (!schema) return undefined as Infer<S>;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      'VALIDATION_ERROR',
      `Invalid request ${where}`,
      result.error.issues.map((i) => ({ path: [where, ...i.path].join('.'), message: i.message })),
    );
  }
  return result.data as Infer<S>;
}

function parseAll<S extends Schemas>(schemas: S, req: Request) {
  return {
    params: parse(schemas.params, req.params, 'params'),
    query: parse(schemas.query, req.query, 'query'),
    body: parse(schemas.body, req.body ?? {}, 'body'),
  };
}

/**
 * Validate body/params/query with zod (unknown keys stripped, values coerced), then call
 * `fn` with typed input. Whatever `fn` returns is sent as `{ data }` with `status`.
 */
export function handle<S extends Schemas>(
  schemas: S,
  fn: (input: HandlerInput<S>) => Promise<unknown> | unknown,
  status?: number,
): RequestHandler {
  return async (req, res) => {
    const data = await fn({ ...parseAll(schemas, req), req, res } as HandlerInput<S>);
    if (res.headersSent) return;
    if (data === undefined) {
      res.status(204).end();
      return;
    }
    // `status` fixes the code; otherwise keep whatever the handler set (e.g. 201 vs 200).
    if (status) res.status(status);
    res.json({ data });
  };
}

/** Same as `handle`, for routes behind requireAuth; `actor` is guaranteed. */
export function authed<S extends Schemas>(
  schemas: S,
  fn: (input: AuthedInput<S>) => Promise<unknown> | unknown,
  status?: number,
): RequestHandler {
  return handle(
    schemas,
    (input) => {
      if (!input.req.actor) throw unauthorized();
      return fn({ ...input, actor: input.req.actor });
    },
    status,
  );
}
