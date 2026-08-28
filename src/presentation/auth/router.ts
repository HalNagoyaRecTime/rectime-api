import { Hono } from 'hono';
import type { Env as Bindings } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import { microsoft } from './routes/microsoft';
import { account } from './routes/account';

const auth = new Hono<{ Bindings: Bindings; Variables: ContainerVariables }>();

auth.route('/microsoft', microsoft);
auth.route('/', account);

export { auth as authRouter };
