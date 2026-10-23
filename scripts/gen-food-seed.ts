/**
 * shared/food-data.ts → migrations/0002_seed_foods.sql
 * 음식 ID는 이름 기반 해시로 결정적으로 생성한다(재생성해도 동일).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FOOD_DATA } from '../shared/food-data';
import { foodId, variantId } from '../shared/ids';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const lines: string[] = [
  '-- 자동 생성 파일: npm run db:seed:gen (원본: shared/food-data.ts)',
  '-- 초기 분류는 참고 데이터이며 의학적으로 확정한 값이 아니다.',
];

FOOD_DATA.forEach((f, i) => {
  const id = foodId(f.name);
  lines.push(
    `INSERT INTO foods (id, name, form_category, cuisine, base_status, fat_level, spice_level, tags, description, sort_order) VALUES (${[
      q(id), q(f.name), q(f.form), q(f.cuisine), q(f.status), f.fat, f.spice, q(JSON.stringify(f.tags)), q(f.description), i,
    ].join(', ')});`,
  );
  for (const a of new Set(f.aliases)) {
    lines.push(`INSERT INTO food_aliases (food_id, alias) VALUES (${q(id)}, ${q(a)});`);
  }
  f.variants.forEach((v, j) => {
    lines.push(
      `INSERT INTO food_variants (id, food_id, name, status, fat_level, note, sort_order) VALUES (${[
        q(variantId(f.name, v.name)), q(id), q(v.name), q(v.status), v.fat, q(v.note), j,
      ].join(', ')});`,
    );
  });
});

const out = fileURLToPath(new URL('../migrations/0002_seed_foods.sql', import.meta.url));
writeFileSync(out, lines.join('\n') + '\n');
console.log(`foods: ${FOOD_DATA.length} → ${out}`);
