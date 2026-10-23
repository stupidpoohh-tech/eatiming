/** 한글 음식 검색: 부분 일치, 별칭, 띄어쓰기·기호 무시, 초성 검색 */

const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s·・\-_.,()[\]/~!?'"`]+/g, '');
}

export function toChoseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) out += CHOSEONG[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
}

const CHOSEONG_ONLY = /^[ㄱ-ㅎ]+$/;

export interface SearchIndexEntry {
  names: string[];
  choseong: string[];
  tags: string[];
  variantNames: string[];
  variantChoseong: string[];
}

export function buildSearchEntry(food: { name: string; aliases: string[]; tags: string[]; variants?: { name: string }[] }): SearchIndexEntry {
  const names = [food.name, ...food.aliases].map(normalize);
  const variantNames = (food.variants ?? []).map((v) => normalize(v.name));
  return {
    names,
    choseong: names.map(toChoseong),
    tags: food.tags.map(normalize),
    variantNames,
    variantChoseong: variantNames.map(toChoseong),
  };
}

/** 0: 불일치, 3: 이름 시작 일치, 2: 이름·별칭 포함, 1: 태그 일치 */
export function matchScore(entry: SearchIndexEntry, query: string): number {
  const q = normalize(query);
  if (!q) return 3;
  if (CHOSEONG_ONLY.test(q)) {
    return entry.choseong.some((c) => c.includes(q)) || entry.variantChoseong.some((c) => c.includes(q)) ? 2 : 0;
  }
  if (entry.names[0].startsWith(q)) return 3;
  if (entry.names.some((n) => n.includes(q))) return 2;
  if (entry.variantNames.some((n) => n.includes(q))) return 2;
  if (entry.tags.some((t) => t === q || t.startsWith(q))) return 1;
  return 0;
}
