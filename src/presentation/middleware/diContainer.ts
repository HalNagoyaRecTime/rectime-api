import { createMiddleware } from 'hono/factory';
import { createDIContainer, type DIContainer } from '../../di/container';
import type { Env } from '../../lib/env';

export type ContainerVariables = {
  container: DIContainer;
};

// DIコンテナをリクエストごとに生成してコンテキストへ注入する
export const diContainerMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables;
}>(async (c, next) => {
  c.set('container', createDIContainer(c.env));
  await next();
});
