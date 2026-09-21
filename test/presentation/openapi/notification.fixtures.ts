export const date = '2026-11-07T15:35:00+09:00';

export const content = {
  push: { title: '集合時間変更', body: '集合時間が変更されました。' },
  detail: { title: '集合時間変更のお知らせ', body: '詳細をご確認ください。' },
};

export const creation = {
  method: 'automatic' as const,
  user: null,
  source: { type: 'gathering' as const, id: 51, label: null },
};

export const audience = {
  items: [{ type: 'gathering' as const, targetId: 51, label: null }],
  recipientResolution: { status: 'resolved' as const, resolvedCount: 4 },
};

export const recipientPushSummary = {
  totalCount: 1204,
  successCount: 1058,
  failedCount: 8,
  noPushTargetCount: 138,
};

export const stop = {
  reason: 'manual' as const,
  stoppedAt: date,
  stoppedBy: { userId: 123, userName: 'HAL 太郎' },
};

export const adminListSchedule = {
  notificationScheduleId: 501,
  sendAt: date,
  status: 'sending' as const,
  scheduledBy: null,
  createdAt: date,
  audience,
  recipientPushSummary,
};

export const adminDetailSchedule = {
  ...adminListSchedule,
  stop: null,
};

export const scheduleListItem = {
  notificationId: 108,
  notificationScheduleId: 501,
  content: { push: content.push },
  importance: 'normal' as const,
  sendAt: date,
  status: 'sending' as const,
  stop,
  creation,
};

export const scheduleDetail = {
  ...scheduleListItem,
  audienceProgress: { totalCount: 4, resolvedCount: 4 },
  recipientProgress: { count: 1204, status: 'resolved' as const },
  deliveryProgress: {
    totalCount: 1229,
    pendingCount: 0,
    sendingCount: 12,
    retryWaitCount: 151,
    sentCount: 1058,
    failedCount: 8,
    stoppedCount: 0,
  },
};

export const recipientResult = {
  notificationRecipientId: 1201,
  user: { userId: 123, userName: 'HAL 太郎' },
  deliveries: [
    {
      notificationPushDeliveryId: 9012,
      platform: 'ios' as const,
      status: 'failed' as const,
      attemptCount: 2,
      lastAttemptAt: date,
      sentAt: null,
    },
  ],
};

export const pushDetail = {
  notificationPushDeliveryId: 9012,
  notificationRecipientId: 1201,
  firebaseTokenId: null,
  platform: 'ios' as const,
  status: 'failed' as const,
  attemptCount: 2,
  firstAttemptAt: date,
  lastAttemptAt: date,
  nextRetryAt: null,
  sentAt: null,
  failedReason: 'UNREGISTERED',
  fcmMessageId: null,
};
