# 작업 로그

이 파일은 백엔드 repo에서 진행한 작업을 날짜별로 기록하기 위한 문서입니다.

## 2026-06-12

### 새 Cloudflare 계정으로 이전

Cloudflare 계정을 `rectime.project@gmail.com` 쪽으로 변경했습니다.

진행한 내용:

- Wrangler를 새 Cloudflare 계정으로 다시 로그인
- `wrangler.jsonc`의 `account_id`를 새 계정으로 변경
- 새 계정에 D1 database 생성
  - production: `rectime-api`
  - development: `rectime-api-dev`
- `wrangler.jsonc`의 D1 binding을 새 D1으로 변경
- `package.json`의 migration script를 새 D1 이름으로 변경
- production D1에 migration 적용
- 새 Worker에 배포

새 Worker URL:

```text
https://rectime-api.rectime-project.workers.dev
```

확인한 내용:

- `/` 정상 응답 확인
- `/api/v1/students/1`에서 seed data 조회 확인
- `/api/v1/firebase-tokens`로 production D1에 FCM Token 저장 확인
- `POST /api/v1/notifications/test`로 FCM 테스트 알림 발송 확인

### 경기 10분 전 자동 알림 MVP 추가

경기 시작 10분 전에 스케줄에 맞춰 자동으로 알림을 보내는 MVP를 추가했습니다.

구현 방향:

- Cloudflare Cron Trigger 사용
- cron은 매분 실행
- JST 기준 현재 시각 + 10분과 `t_events.f_time`이 일치하는 이벤트를 찾음
- 대상 이벤트가 있으면 active 상태의 `firebase_tokens`에 FCM 알림 발송
- 같은 이벤트와 같은 token에 같은 날짜 알림이 중복 발송되지 않도록 발송 로그로 제어

추가한 migration:

- `migrations/0004_create_notification_send_logs.sql`

추가한 테이블:

- `notification_send_logs`

추가 및 수정한 주요 파일:

- `src/services/ScheduledNotificationService.ts`
- `src/services/FcmService.ts`
- `src/index.ts`
- `src/types/services.ts`
- `wrangler.jsonc`
- `eslint.config.js`

추가한 수동 실행 API:

```http
POST /api/v1/notifications/schedule/run
```

mock 실행 예시:

```bash
curl -X POST https://rectime-api.rectime-project.workers.dev/api/v1/notifications/schedule/run \
  -H "Content-Type: application/json" \
  -d '{"now":"2026-06-12T01:50:00.000Z"}'
```

이 `now` 값은 JST 10:50을 의미하며, seed data의 11:00 시작 이벤트를 10분 전 알림 대상으로 검증했습니다.

검증 결과:

```json
{
  "checkedEvents": 1,
  "sent": 1,
  "failed": 1
}
```

결과 의미:

- `checkedEvents: 1`은 10분 뒤 시작하는 이벤트 1건을 찾았다는 뜻
- `sent: 1`은 실제 FCM Token으로 발송 성공했다는 뜻
- `failed: 1`은 이전에 등록한 테스트 문자열 token이 실패했다는 뜻

D1 확인 결과:

- 실제 FCM Token은 `is_active = 1`
- 테스트 문자열 token은 실패 후 `is_active = 0`
- `notification_send_logs`에 성공 발송 로그 저장
- FCM message id 저장

### 현재 스펙 메모

현재 자동 알림은 MVP 검증용이라 대상자 필터링이 아직 완전하지 않습니다.

현재:

- 10분 뒤 시작하는 이벤트를 찾음
- active 상태의 `firebase_tokens` 전체에 알림 발송

다음에 수정해야 할 스펙:

- `t_events.f_event_id`
- `t_entries.f_event_id`
- `m_students.f_student_id`
- `m_students.f_student_num`
- `users.student_number`
- `firebase_tokens.user_id`

위 값을 JOIN해서 해당 이벤트에 참가하는 유저의 token에만 알림을 보내야 합니다.

예상 SQL:

```sql
SELECT ft.id, ft.fcm_token
FROM firebase_tokens ft
JOIN users u ON u.id = ft.user_id
JOIN m_students s ON s.f_student_num = u.student_number
JOIN t_entries e ON e.f_student_id = s.f_student_id
WHERE e.f_event_id = ?
  AND ft.is_active = 1
  AND u.is_active = 1;
```

### 다음 단계

- 자동 알림 대상을 “전체 active token”에서 “해당 이벤트 참가자의 token”으로 변경
- Emulator를 켠 상태에서 cron / mock API의 Logcat 수신 확인
- `notification_send_logs` 기반 중복 발송 방지 계속 확인
- 필요하면 `notifications` 테이블에 알림 본문 저장 추가

## 2026-06-10

### FCM 테스트 알림 발송 API 추가

현재 브랜치 `feature/#14`에서 기존 Cloudflare Workers / Hono 구조에 FCM 테스트 알림 발송 API를 추가했습니다.

### 추가 및 수정 내용

- `POST /api/v1/notifications/test` 라우트 추가
- 알림 요청 body 검증용 컨트롤러 추가
- Firebase Service Account 정보로 Google OAuth access token을 생성하는 처리 추가
- FCM HTTP v1 API를 호출해서 Android Emulator로 테스트 알림을 보내는 처리 추가
- FCM 관련 service / controller 타입 정의 추가
- Cloudflare Workers 전역 API를 ESLint가 인식하도록 설정 수정

### 주요 대상 파일

- `src/index.ts`
- `src/controllers/NotificationController.ts`
- `src/services/FcmService.ts`
- `src/types/services.ts`
- `src/types/controllers.ts`
- `eslint.config.js`

### 코드 검증 내용

- `npm run type-check` 성공 확인
- `npm run format:check` 성공 확인
- `npm run lint` 에러 없이 완료 확인
- 기존 `any` 경고 2개만 남아 있는 것 확인
- 로컬 실행 시 `/` 응답에 `testNotification` 엔드포인트가 표시되는 것 확인
- Cloudflare Secret 미설정 시 `/api/v1/notifications/test`가 부족한 Secret 목록을 반환하는 것 확인
- 잘못된 body `{}`를 보냈을 때 400 validation 에러가 반환되는 것 확인

### Cloudflare 배포 설정 수정

Cloudflare Workers Builds가 예전 `wrangler.jsonc`를 읽으면서 Worker 이름과 D1 binding이 맞지 않아 배포가 실패했습니다.

확인된 에러:

- Worker 이름: `recreation-management-api`와 `rectime-api` 불일치
- D1 binding: `rec_time_stg`의 `database_id`가 `00000000-0000-0000-0000-000000000000`

수정한 내용:

- Worker 이름을 `rectime-api`로 수정
- Cloudflare `account_id` 설정
- 기존 D1 database `rec-time-be`를 production `DB` binding으로 사용
- local migration은 기존 D1 database `rec-time-be-dev`를 사용하도록 수정
- `npx wrangler deploy`로 수동 배포 실행

배포 결과:

- Worker: `rectime-api`
- URL: `https://rectime-api.ellan122316.workers.dev`
- D1 binding: `env.DB (rec-time-be)`
- Version ID: `a3be94b5-671f-48d2-a30f-9bc34f6e62b1`

### FCM Secret 등록 및 실제 발송 확인

Cloudflare Secret에 Firebase / FCM용 값을 등록했습니다.

등록한 Secret:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `TEST_FCM_TOKEN`

처음에는 `Google OAuth token request failed: invalid_grant` 에러가 발생했지만, Firebase Service Account 값을 다시 등록해서 해결했습니다.

배포된 Worker에 다음 API를 호출했습니다.

```bash
curl -X POST https://rectime-api.ellan122316.workers.dev/api/v1/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"title":"test通知","body":"君に届け"}'
```

성공 응답:

```json
{
  "success": true,
  "messageId": "projects/rectime-3c0ba/messages/0:1781098147631193%df262460df262460"
}
```

Android Emulator Logcat에서도 FCM 수신을 확인했습니다.

```text
D RectimeFCM: FCM message received from: 946149362229
```

### 완료된 것

- Cloudflare Worker에서 Firebase OAuth access token 발급 성공
- FCM HTTP v1 API 호출 성공
- Android Emulator의 FCM Token으로 테스트 알림 발송 성공
- Android 앱에서 FCM 메시지 수신 확인

### 남은 주의 사항

- Android 시스템 알림 목록에서 title/body 표시 여부 추가 확인
- Firebase Service Account key는 Git이나 문서에 올리지 않기
- private key가 외부에 노출된 경우 Firebase Console에서 해당 key 삭제 후 재발급하기

## 2026-06-12

### Firebase Token 저장 API 추가

MVP PDF 자료를 확인하고, 알림용 DB 구조를 `device_tokens`가 아니라 `users` / `firebase_tokens` / `notifications` 기준으로 맞췄습니다.

추가한 migration:

- `migrations/0003_create_notification_mvp_tables.sql`

추가한 테이블:

- `users`
- `firebase_tokens`
- `notifications`

추가한 API:

```http
POST /api/v1/firebase-tokens
```

요청 예시:

```json
{
  "studentNumber": "24A001",
  "platform": "android",
  "token": "FCM_TOKEN"
}
```

처리 내용:

- `studentNumber` 기준으로 `users`를 생성하거나 갱신
- FCM Token을 `firebase_tokens`에 저장
- 같은 FCM Token이 다시 등록되면 새로 만들지 않고 `last_seen_at`, `updated_at` 갱신
- 프론트에서 보내기 쉽게 `fcmToken`과 `token` 필드명을 둘 다 허용

로컬 D1 검증:

- `users` / `firebase_tokens` / `notifications` migration 적용 성공
- `POST /api/v1/firebase-tokens`로 테스트 token 저장 성공
- Android 앱에서 발급된 실제 FCM Token 저장 성공
- 잘못된 body `{}`에 대해 400 validation 에러 반환 확인

주의:

- 현재 저장된 데이터는 로컬 D1 기준
- 원격 D1에 저장하려면 별도로 `npm run "db:migrate --remote"`가 필요
- 지금 단계에서는 remote migration이 필수는 아니고, 프론트와 배포 환경에서 연결 검증할 때 실행하면 됨

### 다음 단계

- 모바일 앱에서 `POST /api/v1/firebase-tokens` 호출
- remote D1에 migration을 적용할 타이밍 결정
- 저장된 `firebase_tokens.fcm_token`을 사용해 FCM 발송
- `UNREGISTERED`, invalid token 등 실패 응답 처리
