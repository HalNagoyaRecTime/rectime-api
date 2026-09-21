-- 通知v2の最終制約へ収束するforward migration。
-- 0033で既にDB DEFAULTとplatform CHECKを最終形へ変更しているため、
-- ここではLegacy重複Tokenの解消と完全UNIQUEの確定だけを行う。
-- 既存の通知履歴・Schedule・Deliveryは削除せず、FKも付け替えない。

-- 旧partial UNIQUEが残る環境でも完全UNIQUEへ移行できるよう先に削除する。
DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token;
DROP INDEX IF EXISTS uq_firebase_tokens_fcm_token;

-- 同じfcm_tokenを持つ旧行は、現在所有者の行を元の値で保持する。
-- 旧行はSchedule/Deliveryの履歴FKを維持するため削除せず、追跡可能な値へ退避する。
UPDATE firebase_tokens AS legacy
SET fcm_token = legacy.fcm_token || '#legacy:' || legacy.firebase_token_id,
    is_firebase_active = 0
WHERE EXISTS (
  SELECT 1
  FROM firebase_tokens AS current_owner
  WHERE current_owner.fcm_token = legacy.fcm_token
    AND (
      current_owner.is_firebase_active > legacy.is_firebase_active
      OR (
        current_owner.is_firebase_active = legacy.is_firebase_active
        AND current_owner.firebase_token_id < legacy.firebase_token_id
      )
    )
);

-- active/inactiveに関係なくToken値を一意にする。
CREATE UNIQUE INDEX uq_firebase_tokens_fcm_token
  ON firebase_tokens(fcm_token);