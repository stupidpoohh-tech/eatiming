import { Hono } from 'hono';
import type { Food, FoodVariant } from '../../shared/types';
import type { AppEnv } from '../lib';

interface FoodRow {
  id: string;
  name: string;
  form_category: Food['form'];
  cuisine: Food['cuisine'];
  base_status: Food['status'];
  fat_level: Food['fat'];
  spice_level: Food['spice'];
  tags: string;
  description: string;
}

/** 공통 음식 DB (인증 불필요, 읽기 전용) */
export const foodRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const db = c.env.DB;
  const [foods, aliases, variants] = await db.batch([
    db.prepare('SELECT id, name, form_category, cuisine, base_status, fat_level, spice_level, tags, description FROM foods ORDER BY sort_order'),
    db.prepare('SELECT food_id, alias FROM food_aliases'),
    db.prepare('SELECT id, food_id, name, status, fat_level, note FROM food_variants ORDER BY sort_order'),
  ]);
  const aliasMap = new Map<string, string[]>();
  for (const a of aliases.results as { food_id: string; alias: string }[]) {
    aliasMap.set(a.food_id, [...(aliasMap.get(a.food_id) ?? []), a.alias]);
  }
  const variantMap = new Map<string, FoodVariant[]>();
  for (const v of variants.results as { id: string; food_id: string; name: string; status: FoodVariant['status']; fat_level: FoodVariant['fat']; note: string }[]) {
    variantMap.set(v.food_id, [...(variantMap.get(v.food_id) ?? []), { id: v.id, name: v.name, status: v.status, fat: v.fat_level, note: v.note }]);
  }
  const result: Food[] = (foods.results as unknown as FoodRow[]).map((f) => ({
    id: f.id,
    name: f.name,
    form: f.form_category,
    cuisine: f.cuisine,
    status: f.base_status,
    fat: f.fat_level,
    spice: f.spice_level,
    tags: JSON.parse(f.tags),
    description: f.description,
    aliases: aliasMap.get(f.id) ?? [],
    variants: variantMap.get(f.id) ?? [],
  }));
  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  return c.json({ foods: result });
});
