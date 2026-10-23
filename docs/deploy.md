# Cloudflare 배포 가이드

## 1회 준비

1. Cloudflare 계정 로그인(또는 API 토큰 설정)
   - 로컬: `npx wrangler login`
   - CI: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 환경 변수 (권한: Workers Scripts Edit, D1 Edit)
2. D1 데이터베이스 생성
   ```bash
   npx wrangler d1 create eatiming
   ```
   출력된 `database_id`를 `wrangler.jsonc`의 `d1_databases[0].database_id`에 넣습니다.
3. 원격 DB에 마이그레이션 적용
   ```bash
   npm run db:migrate:remote
   ```

## 배포

```bash
npm run deploy   # 빌드 → 원격 마이그레이션 → wrangler deploy
```

### GitHub 연동 배포(Workers Builds)

Cloudflare 대시보드 Workers & Pages > 생성 > Git 저장소 가져오기에서 이 저장소를 연결합니다.

- 빌드 명령: `npm run build && npx wrangler d1 migrations apply eatiming --remote`
- 배포 명령: `npx wrangler deploy`
- 프로덕션 브랜치: 배포할 브랜치 이름

Worker 이름은 `wrangler.jsonc`의 `name`(`eatiming`)과 같아야 합니다.

배포 후 `https://eatiming.<계정 서브도메인>.workers.dev`에서 확인할 수 있습니다. 커스텀 도메인은 Cloudflare 대시보드 Workers > 설정 > 도메인에서 연결합니다.

Durable Object(`ShareHub`)는 `wrangler.jsonc`의 `migrations`(v1, SQLite 클래스)로 첫 배포 시 자동 생성됩니다.

## 배포 후 확인

- `GET /api/health` → `{"ok":true}`
- 비로그인 상태로 메뉴 탐색 화면에서 262개 음식 표시
- 계정 2개로 초대 → 수락 → 컨디션 변경이 새로고침 없이 반영되는지 확인

## 음식 데이터 변경 시

`0002_seed_foods.sql`은 이미 적용된 뒤에는 다시 실행되지 않습니다. 배포 이후 음식 변경은 `migrations/0003_*.sql`처럼 새 마이그레이션(INSERT/UPDATE)으로 추가합니다.
음식 ID는 이름 기반 해시이므로, 이름을 바꾸면 새 ID가 됩니다(기존 반응 기록과의 연결을 유지하려면 UPDATE로 이름만 변경).
