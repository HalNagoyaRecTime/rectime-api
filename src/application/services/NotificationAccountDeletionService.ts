import type { INotificationAccountDeletionService } from './INotificationAccountDeletionService';
import type { INotificationAccountDeletionRepository } from '../../domain/interfaces/repositories/INotificationAccountDeletionRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';

export function createNotificationAccountDeletionService(deps: {
  firebaseTokenRepository: Pick<
    IFirebaseTokenRepository,
    'findAllByUserId' | 'deleteByUserId'
  >;
  notificationAccountDeletionRepository: INotificationAccountDeletionRepository;
}): INotificationAccountDeletionService {
  const { firebaseTokenRepository, notificationAccountDeletionRepository } =
    deps;

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
      if (firebaseTokens.length > 0) {
        // Tokenの物理削除で配下DeliveryのFKだけNULLになり、履歴は残る。
        await firebaseTokenRepository.deleteByUserId(userId);
      }
      // Schedule / Notificationの作成者・実行者参照を匿名化する。
      await notificationAccountDeletionRepository.anonymizeV2ActorReferences(
        userId
      );
      return { firebaseTokensDeleted: firebaseTokens.length > 0 };
    },
  };
}
