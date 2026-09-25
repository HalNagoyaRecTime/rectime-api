/** 通知v2でDBへ保存する日時をUTC ISO 8601（Z・ミリ秒3桁）へ正規化する。 */
export function normalizeNotificationDateTime(value: string): string {
  return new Date(value).toISOString();
}

/** 通知v2でDBへ保存する現在時刻をUTC ISO 8601で返す。 */
export function notificationUtcNow(): string {
  return new Date().toISOString();
}
