// D1のエラーはDrizzleに包まれて cause に元のエラーが入ることがあるため、
// 連鎖をたどって文面を集める。
export function isForeignKeyError(error: unknown): boolean {
  const visited = new Set<Error>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    if (current.message.includes('FOREIGN KEY constraint failed')) return true;
    visited.add(current);
    current = current.cause;
  }
  return false;
}
