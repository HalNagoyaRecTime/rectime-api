export class LogoutCleanupFailedError extends Error {
  constructor() {
    super('ログアウトの後片付けに失敗しました');
    this.name = 'LogoutCleanupFailedError';
  }
}
