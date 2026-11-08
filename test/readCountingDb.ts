import { env } from 'cloudflare:workers';

export function createReadCountingDb() {
  let rowsRead = 0;
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    ({
      statement,
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      async first<T>(column?: string) {
        const result = await statement.all<Record<string, unknown>>();
        rowsRead += result.meta.rows_read;
        const row = result.results[0];
        if (!row) return null;
        return (column ? row[column] : row) as T;
      },
      async all<T>() {
        const result = await statement.all<T>();
        rowsRead += result.meta.rows_read;
        return result;
      },
      async run<T>() {
        const result = await statement.run<T>();
        rowsRead += result.meta.rows_read;
        return result;
      },
    }) as unknown as D1PreparedStatement;
  const db = {
    prepare: (query: string) => wrap(env.DB.prepare(query)),
    async batch(statements: D1PreparedStatement[]) {
      const results = await env.DB.batch(
        statements.map(
          statement =>
            (statement as unknown as { statement: D1PreparedStatement })
              .statement
        )
      );
      for (const result of results) rowsRead += result.meta.rows_read;
      return results;
    },
  } as unknown as D1Database;
  return { db, rowsRead: () => rowsRead };
}
