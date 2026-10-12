import type { INotificationAccountDeletionService } from './INotificationAccountDeletionService';
import type { INotificationAccountDeletionRepository } from '../../domain/interfaces/repositories/INotificationAccountDeletionRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';

export function createNotificationAccountDeletionService(deps: {
  firebaseTokenRepository: Pick<
    IFirebaseTokenRepository,
    'findAllByUserId' | 'deleteByUserId'
  >;
  notificationScheduleRepository: Pick<
    INotificationScheduleRepository,
    'deleteByFirebaseTokenId' | 'anonymizeCreatedUserId'
  >;
  notificationAccountDeletionRepository: INotificationAccountDeletionRepository;
}): INotificationAccountDeletionService {
  const {
    firebaseTokenRepository,
    notificationScheduleRepository,
    notificationAccountDeletionRepository,
  } = deps;

  return {
    async purgeUserNotificationData(userId) {
      const firebaseTokens =
        await firebaseTokenRepository.findAllByUserId(userId);
      await notificationAccountDeletionRepository.deleteDirectUserAudiencesByUserId(
        userId
      );
      await notificationAccountDeletionRepository.anonymizeRecipientsByUserId(
        userId
      );
      // Recipient履歴を持たないLegacy Scheduleだけを消す。Recipientがある
      // ScheduleはRepository側で保持し、Token削除時にFKだけNULLへ変更する。
      for (const token of firebaseTokens) {
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          token.firebase_token_id
        );
      }
      if (firebaseTokens.length > 0) {
        // Tokenの物理削除で配下DeliveryのFKだけNULLになり、履歴は残る。
        await firebaseTokenRepository.deleteByUserId(userId);
      }
      await notificationScheduleRepository.anonymizeCreatedUserId(userId);
      await notificationAccountDeletionRepository.anonymizeV2ActorReferences(
        userId
      );
      return { firebaseTokensDeleted: firebaseTokens.length > 0 };
    },
  };
}
