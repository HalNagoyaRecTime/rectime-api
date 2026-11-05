/** 配信先の匿名化・削除・停止・Tokenの別利用者への付替えを同じ条件で拒否する。 */
export function sendableRecipientSql(delivery: string): string {
  return `EXISTS (
    SELECT 1 FROM notification_recipients eligible_recipient
    JOIN users eligible_user ON eligible_user.user_id = eligible_recipient.user_id
    JOIN firebase_tokens eligible_token ON eligible_token.user_id = eligible_recipient.user_id
    WHERE eligible_recipient.notification_recipient_id = ${delivery}.notification_recipient_id
      AND eligible_token.firebase_token_id = ${delivery}.firebase_token_id
      AND eligible_user.is_live_active = 1 AND eligible_user.deletion_status = 'active'
  )`;
}
