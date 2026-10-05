// cleanup失敗の詳細を隠し、Presentationへ再試行可能な失敗だけを伝える。
export class LogoutCleanupFailedError extends Error {
  constructor() {
    super('ログアウトの後片付けに失敗しました');
    this.name = 'LogoutCleanupFailedError';
  }
}
