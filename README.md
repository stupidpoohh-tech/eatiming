# 잇타이밍 EATIMING

> 내 몸의 타이밍에 맞는 한 끼

GLP-1 계열 약물을 사용하는 사람이 투여 경과와 현재 식사 컨디션을 확인하고, 지금 먹기 편한 음식을 빠르게 탐색하며, 그 정보를 동반자와 실시간으로 공유하는 웹서비스입니다.
칼로리·체중 관리 앱이나 AI 식단 서비스가 아니라, **지금 무엇을 먹을지 빠르게 결정하도록 돕는 서비스**입니다.

## 기술 구성 (Cloudflare 중심)

| 영역 | 사용 기술 |
| --- | --- |
| 호스팅 | Cloudflare Workers (정적 자산 + API 단일 Worker) |
| API | Hono (`worker/`) |
| 데이터베이스 | Cloudflare D1 (`migrations/`) |
| 실시간 공유 | Durable Objects + WebSocket Hibernation (`worker/realtime.ts`) |
| 인증 | Worker 자체 세션 인증 (PBKDF2 비밀번호 해시, HttpOnly 쿠키) |
| 프런트엔드 | React 19 + React Router + TanStack Query + Tailwind CSS v4 (`src/`) |
| 빌드 | Vite + `@cloudflare/vite-plugin` |
| 테스트 | Vitest(단위), `@cloudflare/vitest-plugin`(Workers 런타임 통합·권한), Playwright(E2E) |

공용 로직(시간대 계산, 투여 타임라인, 한글 검색, 적합도 정렬)은 `shared/`에 있으며 클라이언트와 Worker가 함께 사용합니다.

## 폴더 구조

```
shared/        타입, 음식 원본 데이터, 타임라인·검색·정렬 로직
worker/        API(Hono), 인증, 권한 검사, 실시간 허브(Durable Object)
src/           React 앱 (메뉴 탐색 / 약물 기록 / 함께 보기 / 프로필)
migrations/    D1 스키마와 음식 시드(0002는 스크립트로 생성)
scripts/       시드 생성 스크립트
tests/unit     공용 로직 단위 테스트
tests/worker   API·권한·실시간 통합 테스트 (workerd 런타임)
e2e/           Playwright 사용자 흐름 테스트
docs/          설계·보안·배포 문서
```

## 로컬 실행

```bash
npm install
npm run db:migrate:local   # 로컬 D1에 스키마·음식 데이터 적용
npm run dev                # http://localhost:5173
```

## 테스트

```bash
npm run typecheck
npm test          # 단위 + Workers 통합(권한·실시간) 테스트
npm run test:e2e  # Playwright E2E (빌드 후 로컬 Workers 런타임으로 실행)
```

## 음식 데이터 수정

`shared/food-data.ts`를 수정한 뒤 `npm run db:seed:gen`으로 시드 SQL을 다시 만듭니다.
이미 배포된 DB에는 새 마이그레이션 파일로 변경분을 추가해야 합니다(`docs/deploy.md` 참고).

## 배포

`docs/deploy.md`를 참고하세요. Cloudflare 계정 인증(API 토큰)과 D1 데이터베이스 ID가 필요합니다.

## 서비스 범위와 규제 검토

- 본 서비스는 의료 진단·처방을 제공하지 않습니다. 경과 표시는 시간 경과만 나타내며 혈중 농도·약효를 뜻하지 않습니다.
- 음식 분류는 참고 데이터이며 특정 음식의 섭취 안전을 보장하지 않습니다.
- **정식 출시 전 개인정보보호법(민감정보 처리 포함) 및 의료기기·의료 광고 관련 규제 검토가 필요할 수 있습니다.** 자세한 내용은 `docs/security-and-privacy.md`.
