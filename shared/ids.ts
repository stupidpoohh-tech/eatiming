/** 음식·조리 옵션의 결정적 ID (FNV-1a 64bit, 런타임 독립) */
function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export const foodId = (name: string) => `f_${fnv1a64(name).slice(0, 12)}`;
export const variantId = (foodName: string, variantName: string) => `v_${fnv1a64(`${foodName}::${variantName}`).slice(0, 12)}`;
