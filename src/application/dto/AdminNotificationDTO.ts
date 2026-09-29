import type {
  NotificationAudienceType,
  NotificationCreationMethod,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
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
  content: {
    push: NotificationContentPushDTO;
  };
  importance: NotificationImportance;
  creation: NotificationCreationDTO;
  createdAt: string;
  schedules: AdminNotificationScheduleListItemDTO[];
}

export interface AdminNotificationListResponseDTO {
  items: AdminNotificationListItemDTO[];
}

export interface NotificationConfigDTO {
  importance: {
    default: Extract<NotificationImportance, 'normal'>;
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
