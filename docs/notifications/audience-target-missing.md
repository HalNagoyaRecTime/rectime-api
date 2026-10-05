# Audience対象消失時の扱い

## 対象未確定の通知

Resolverで直接指定されたclass_room / gathering / event / userが存在しない場合、Schedule全体をfailedにする。
Userはdeletion_statusがactiveでない場合も対象消失として扱う。
有効な対象のRecipientが0人である場合は、対象消失と区別する。

アカウント削除で直接User Audienceを消す場合は、その前に対象未確定のSchedule全体をfailedにする。
対象はnotification_generalのscheduled / resolvingかつrecipients_resolved_atがNULLのScheduleに限定する。
複数Audienceの1人が削除された場合も、残った対象への部分配信は行わない。
Schedule更新と直接User Audience削除は同じD1 batchで実行し、失敗時は両方rollbackする。
再実行時に既存の失敗理由を上書きしない。

## 理由とAPI

アカウント削除時のreasonは「Audienceの対象ユーザーが削除されました」とし、個人情報やUser IDを含めない。
既存のResolver失敗理由は維持する。
管理用Schedule一覧・詳細APIにnullableなfailureReasonを追加し、failedの場合にreasonを返す。
停止理由stop.reasonのmanual / source_deletedは変更しない。
failed以外ではfailureReasonはNULLとなる。

## 影響範囲

Recipients確定済み、sending / completed / stopped / failedのSchedule状態・理由は変更しない。
クラス等の間接Audienceについては、このアカウント削除処理でSchedule全体を失敗させない。
Resolverが既に一部Recipientを作成していても、failed後は対象確定・配信へ進めない。
既存のアカウント削除によるRecipient削除・匿名化は従来のままとし、他UserのRecipientは維持する。
Gathering source削除の停止処理とは責務を分ける。

## 検証

実際のAccountDeletionService、Resolver、D1を使用し、単独・複数Audience、scheduled / resolving、
対象確定済み・終了済み、途中実行、再実行、D1 rollbackを検証する。
管理用一覧・詳細APIとOpenAPIでも失敗理由を検証する。
