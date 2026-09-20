import type {
  NotificationAudienceType,
  NotificationCreationMethod,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationStopReason,
} from '../../domain/entities/NotificationV3';
import type { NotificationScheduleSummaryDTO } from './NotificationScheduleDTO';

export interface NotificationContentDTO {
  push: {
    title: string;
    body: string;
  };
  detail: {
    title: string;
    body: string;
  };
}

export interface NotificationUserReferenceDTO {
  userId: number;
  userName: string;
}

export type NotificationAudienceItemDTO =
  | { type: 'all'; label?: null }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      targetId: number;
      label?: string | null;
    };

export interface NotificationAudienceDTO {
  items: NotificationAudienceItemDTO[];
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
        type: 'gathering';
        id: number;
        label: string | null;
      };
    };

export interface NotificationCreateRequestDTO {
  content: NotificationContentDTO;
  audience: NotificationAudienceDTO;
  delivery: NotificationDeliveryInputDTO;
  importance: NotificationImportance;
}

export type NotificationCreateResponseDTO = {
  notificationId: number;
  notificationScheduleId: number;
};

export interface NotificationPatchRequestDTO {
  content?: NotificationContentDTO;
  audience?: NotificationAudienceDTO;
  delivery?: NotificationDeliveryInputDTO;
  importance?: NotificationImportance;
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

export interface AdminNotificationListResponseDTO {
  notifications: AdminNotificationDetailDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationConfigDTO {
  importance: {
    default: Extract<NotificationImportance, 'normal'>;
    options: NotificationImportance[];
  };
}

export interface NotificationAudienceCountRequestDTO {
  audience: NotificationAudienceDTO;
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
