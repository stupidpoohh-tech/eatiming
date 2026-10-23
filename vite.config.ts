import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// E2E 테스트는 개발용 로컬 데이터와 분리된 저장소를 사용한다.
const persistPath = process.env.EATIMING_PERSIST_PATH;

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(persistPath ? { persistState: { path: persistPath } } : {})],
});
