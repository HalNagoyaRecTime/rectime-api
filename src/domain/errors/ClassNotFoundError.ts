export class ClassNotFoundError extends Error {
  constructor(public readonly classRoomId: number) {
    super(`Class not found: id=${classRoomId}`);
    this.name = 'ClassNotFoundError';
  }
}
