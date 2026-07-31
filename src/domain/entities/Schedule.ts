export interface ScheduleUpdateEntity {
  user_id: number;
  event_id: number;
  firebase_token_id?: number;
  importance: number;
  send_at: string; // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  gathering_id: number;
}

export class HttpError extends Error {
  constructor(
    public statusCode: 400 | 404 | 409 | 500,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
