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
      // Legacy履歴は個人情報削除方針に従い先に消す。v2 Delivery履歴は保持し、
      // Token削除後にFK参照だけをNULLにするため、履歴を新Tokenへ移さない。
      for (const token of firebaseTokens) {
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          token.firebase_token_id
        );
      }
      await notificationAccountDeletionRepository.deleteRecipientsByUserId(
        userId
      );
      if (firebaseTokens.length > 0) {
        // logoutやFCM UNREGISTEREDとは別のAccount deletion内部経路で全Tokenを消す。
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
