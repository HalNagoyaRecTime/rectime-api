export class ScheduleNotFoundError extends Error {
  constructor(public readonly scheduleId: number) {
    super(`Schedule not found: id=${scheduleId}`);
    this.name = 'ScheduleNotFoundError';
  }
}
