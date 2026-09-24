import type { INotificationAccountDeletionService } from './INotificationAccountDeletionService';
import type { INotificationAccountDeletionRepository } from '../../domain/interfaces/repositories/INotificationAccountDeletionRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';

export function createNotificationAccountDeletionService(deps: {
  notificationScheduleRepository: Pick<
    INotificationScheduleRepository,
    'deleteByFirebaseTokenId' | 'anonymizeCreatedUserId'
  >;
  notificationAccountDeletionRepository: INotificationAccountDeletionRepository;
}): INotificationAccountDeletionService {
  const {
    notificationScheduleRepository,
    notificationAccountDeletionRepository,
  } = deps;

  return {
    async deleteUserDeliveryData(userId, firebaseTokenIds) {
      for (const firebaseTokenId of firebaseTokenIds) {
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          firebaseTokenId
        );
      }
      await notificationAccountDeletionRepository.deleteRecipientsByUserId(
        userId
      );
    },

    async anonymizeUserActorReferences(userId) {
      await notificationScheduleRepository.anonymizeCreatedUserId(userId);
      await notificationAccountDeletionRepository.anonymizeV2ActorReferences(
        userId
      );
    },
  };
}
