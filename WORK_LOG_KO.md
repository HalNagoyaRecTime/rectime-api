# 작업 로그

이 파일은 백엔드 repo에서 진행한 작업을 날짜별로 기록하기 위한 문서입니다.

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
