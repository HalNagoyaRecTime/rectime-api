import type { MicrosoftTokenFailure } from '../../domain/auth/types';
import { AuthErrors } from './authErrors';
import type { ApiErrorDefinition } from './errorResponse';

// HTTP層での変換を共有し、ログイン・写真取得でも一時障害を401にしない。
export function microsoftTokenError(
  failure: MicrosoftTokenFailure,
  reauthenticationError: ApiErrorDefinition,
  unavailableError: ApiErrorDefinition
): ApiErrorDefinition {
  switch (failure.reason) {
    case 'reauthentication_required':
      return reauthenticationError;
    case 'unavailable':
      return unavailableError;
    case 'provider_error':
      return AuthErrors.AUTH_PROVIDER_ERROR;
  }
}
