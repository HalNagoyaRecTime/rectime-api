export class ScheduleNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`Schedule not found: id=${id}`);
    this.name = 'ScheduleNotFoundError';
  }
}
