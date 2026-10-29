import {
  DEFAULT_NOTIFICATION_IMPORTANCE,
  type NotificationAudienceType,
  type NotificationCreationMethod,
  type NotificationImportance,
  type NotificationScheduleStatus,
  type NotificationSourceType,
  type NotificationStopReason,
} from '../../domain/entities/Notification';
import type {
  AdminNotificationScheduleListItemDTO,
  NotificationScheduleSummaryDTO,
} from './NotificationScheduleDTO';

export interface NotificationContentPushDTO {
  title: string;
  body: string;
}

export interface NotificationContentDetailDTO {
  title: string;
  body: string;
}

export interface NotificationContentDTO {
  push: NotificationContentPushDTO;
  detail: NotificationContentDetailDTO;
}

export interface NotificationContentPushOnlyDTO {
  push: NotificationContentPushDTO;
}

export interface NotificationContentPatchDTO {
  push?: {
    title?: string;
    body?: string;
  };
  detail?: {
    title?: string;
    body?: string;
  };
}

export interface NotificationUserReferenceDTO {
  userId: number;
  userName: string;
}

export type NotificationAudienceInputItemDTO =
  | { type: 'all' }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      targetId: number;
    };

export interface NotificationAudienceInputDTO {
  items: NotificationAudienceInputItemDTO[];
}

export type NotificationAudienceItemDTO =
  | { type: 'all' }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      targetId: number;
      label: string | null;
    };

export interface NotificationAudienceDTO {
  items: NotificationAudienceItemDTO[];
}

export interface NotificationDateRangeQueryDTO {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export type NotificationDeliveryInputDTO =
  { type: 'immediate'; sendAt: null } | { type: 'scheduled'; sendAt: string };

export type NotificationCreationDTO =
  | {
      method: Extract<NotificationCreationMethod, 'manual'>;
      user: NotificationUserReferenceDTO | null;
      source: null;
    }
  | {
      method: Extract<NotificationCreationMethod, 'automatic'>;
      user: null;
      source: {
        type: NotificationSourceType;
        id: number;
        label: string | null;
      };
    };

export interface NotificationCreateRequestDTO {
  content: NotificationContentDTO;
  audience: NotificationAudienceInputDTO;
  delivery: NotificationDeliveryInputDTO;
  importance: NotificationImportance;
}

export interface NotificationCreateResponseDTO {
  notificationId: number;
  notificationScheduleId: number;
}

export interface NotificationPatchRequestDTO {
  content?: NotificationContentPatchDTO;
  importance?: NotificationImportance;
  schedule?: {
    notificationScheduleId: number;
    audience?: NotificationAudienceInputDTO;
    delivery?: NotificationDeliveryInputDTO;
  };
}

export interface AdminNotificationDetailDTO {
  notificationId: number;
  content: NotificationContentDTO;
  importance: NotificationImportance;
  creation: NotificationCreationDTO;
  createdAt: string;
  updatedAt: string;
  schedules: NotificationScheduleSummaryDTO[];
}

export type NotificationPatchResponseDTO = AdminNotificationDetailDTO;

export interface AdminNotificationListItemDTO {
  notificationId: number;
  content: NotificationContentPushOnlyDTO;
  importance: NotificationImportance;
  creation: NotificationCreationDTO;
  createdAt: string;
  schedules: AdminNotificationScheduleListItemDTO[];
}

export interface AdminNotificationPaginationDTO {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminNotificationListResponseDTO {
  items: AdminNotificationListItemDTO[];
  pagination: AdminNotificationPaginationDTO;
}

export interface NotificationConfigDTO {
  importance: {
    default: typeof DEFAULT_NOTIFICATION_IMPORTANCE;
    options: NotificationImportance[];
  };
}

export interface NotificationAudienceCountRequestDTO {
  audience: NotificationAudienceInputDTO;
}

export interface NotificationAudienceCountResponseDTO {
  recipientCount: number;
}

export interface NotificationStopResponseDTO {
  notificationScheduleId: number;
  status: Extract<NotificationScheduleStatus, 'stopped'>;
}

export type NotificationScheduleStopDTO = {
  reason: NotificationStopReason;
  stoppedAt: string;
  stoppedBy: NotificationUserReferenceDTO | null;
};
