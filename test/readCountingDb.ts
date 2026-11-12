import { env } from 'cloudflare:workers';

interface ReadCountingStatement {
  statement: D1PreparedStatement;
  bind(...values: unknown[]): ReadCountingStatement;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run<T>(): Promise<D1Result<T>>;
  raw<T>(): Promise<T[]>;
}

export function createReadCountingDb(source: D1Database = env.DB) {
  let rowsRead = 0;
  const wrap = (statement: D1PreparedStatement): ReadCountingStatement => ({
    statement,
    bind: (...values) => wrap(statement.bind(...values)),
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
    // raw()はmetaを返さないため、同じ文をall()でも流して行数だけ数える。
    async raw<T>() {
      const [rows, result] = await Promise.all([
        statement.raw<T>(),
        statement.all(),
      ]);
      rowsRead += result.meta.rows_read;
      return rows;
    },
  });
  const db = {
    prepare: (query: string) => wrap(source.prepare(query)),
    async batch(statements: ReadCountingStatement[]) {
      const results = await source.batch(
        statements.map(({ statement }) => statement)
      );
      for (const result of results) rowsRead += result.meta.rows_read;
      return results;
    },
  } as unknown as D1Database;
  return {
    db,
    reset: () => {
      rowsRead = 0;
    },
    rowsRead: () => rowsRead,
  };
}
