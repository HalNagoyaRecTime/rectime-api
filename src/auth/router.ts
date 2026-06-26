import { Hono } from 'hono';
import type { Env as Bindings } from '../lib/env';
import { microsoftRouter } from './routes/microsoft';
import { meRouter } from './routes/me';
import { sessionRouter } from './routes/session';

const auth = new Hono<{ Bindings: Bindings }>();

auth.route('/microsoft', microsoftRouter);
auth.route('/me', meRouter);
auth.route('/', sessionRouter);

export { auth as authRouter };
