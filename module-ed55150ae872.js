/** Search aliases and selection categories shared by the app and regression tests. */
export const SELECTION_TYPES = [
  {id:'unknown',label:'未確認'},
  {id:'comprehensive',label:'総合型選抜'},
  {id:'designated',label:'指定校推薦'},
  {id:'recommendation',label:'公募制推薦'},
  {id:'general',label:'一般入試'},
  {id:'other',label:'その他'}
];

// Keep aliases specific to each university. Partial matches are for searching,
// while linking requires the exact normalized university key.
const UNIVERSITY_ALIASES = [
  ['南山大','南山大学','南山','なんざんだいがく','なんざん'],
  ['中京大','中京大学','中京','ちゅうきょうだいがく','ちゅうきょう'],
  ['立命館大','立命館大学','立命館','立命','りつめいかんだいがく','りつめいかん'],
  ['名古屋大','名古屋大学','名大','なごやだいがく','めいだい'],
  ['静岡大','静岡大学','静大','しずおかだいがく','しずだい'],
  ['椙山女学園大','椙山女学園大学','椙山女学園','椙山','すぎやまじょがくえんだいがく','すぎやまじょがくえん','すぎやま'],
  ['関西学院大','関西学院大学','関西学院','関学','かんせいがくいんだいがく','かんせいがくいん','かんがく'],
  ['明治大','明治大学','明治','明大','めいじだいがく','めいじ','めいだい'],
  ['名古屋学院大','名古屋学院大学','名古屋学院','名学','なごやがくいんだいがく','なごやがくいん'],
  ['法政大','法政大学','法政','ほうせいだいがく','ほうせい'],
  ['静岡文化芸大','静岡文化芸術大学','静岡文化芸術','静岡文芸大','しずおかぶんかげいじゅつだいがく','しずおかぶんかげいじゅつ'],
  ['人間環境大','人間環境大学','人間環境','にんげんかんきょうだいがく','にんげんかんきょう'],
  ['名古屋経大','名古屋経済大学','名古屋経済大','名古屋経済','なごやけいざいだいがく','なごやけいざい'],
  ['奈良女子大','奈良女子大学','奈良女子','奈良女','ならじょしだいがく','ならじょし'],
  ['慶応大','慶應義塾大学','慶応義塾大学','慶應大','慶應大学','慶応大学','慶應義塾','慶応義塾','慶應','慶応','けいおうぎじゅくだいがく','けいおうぎじゅく','けいおうだいがく','けいおう'],
  ['早稲田大','早稲田大学','早稲田','早大','わせだだいがく','わせだ'],
  ['立教大','立教大学','立教','りっきょうだいがく','りっきょう'],
  ['近畿大','近畿大学','近畿','近大','きんきだいがく','きんき','きんだい'],
  ['高崎経大','高崎経済大学','高崎経済大','高崎経済','たかさきけいざいだいがく','たかさきけいざい'],
  ['愛知大','愛知大学','愛大','あいちだいがく','あいだい'],
  ['名城大','名城大学','名城','めいじょうだいがく','めいじょう'],
  ['愛知県立大','愛知県立大学','愛知県立','愛県大','県大','あいちけんりつだいがく','あいちけんりつ'],
  ['愛知淑徳大','愛知淑徳大学','愛知淑徳','淑徳','あいちしゅくとくだいがく','あいちしゅくとく'],
  ['三重大','三重大学','三重','みえだいがく','みえ'],
  ['大阪公立大','大阪公立大学','大阪公立','おおさかこうりつだいがく','おおさかこうりつ'],
  ['中央大','中央大学','中央','中大','ちゅうおうだいがく','ちゅうおう'],
  ['中部大','中部大学','中部','ちゅうぶだいがく','ちゅうぶ'],
  ['富山大','富山大学','富山','富大','とやまだいがく','とやま'],
  ['神戸大','神戸大学','神戸','こうべだいがく','こうべ'],
  ['京都府立大','京都府立大学','京都府立','きょうとふりつだいがく','きょうとふりつ'],
  ['名古屋商大','名古屋商科大学','名古屋商科大','名古屋商科','なごやしょうかだいがく','なごやしょうか'],
  ['名古屋造形大','名古屋造形大学','名古屋造形','なごやぞうけいだいがく','なごやぞうけい'],
  ['学習院大','学習院大学','学習院','がくしゅういんだいがく','がくしゅういん'],
  ['日本大','日本大学','日大','にほんだいがく','にちだい'],
  ['横浜市立大','横浜市立大学','横浜市立','横市','よこはましりつだいがく','よこはましりつ'],
  ['茨城大','茨城大学','茨城','いばらきだいがく','いばらき'],
  ['金城学院大','金城学院大学','金城学院','きんじょうがくいんだいがく','きんじょうがくいん'],
  ['高知大','高知大学','高知','こうちだいがく','こうち'],
  ['名古屋市立大','名古屋市立大学','名古屋市立','名市大','なごやしりつだいがく','なごやしりつ','めいしだい'],
  ['愛知教育大','愛知教育大学','愛知教育','愛教大','あいちきょういくだいがく','あいちきょういく','あいきょうだい'],
  ['同志社大','同志社大学','同志社','どうししゃだいがく','どうししゃ'],
  ['岐阜大','岐阜大学','岐阜','ぎふだいがく','ぎふ'],
  ['愛知学院大','愛知学院大学','愛知学院','あいちがくいんだいがく','あいちがくいん'],
  ['信州大','信州大学','信州','信大','しんしゅうだいがく','しんしゅう'],
  ['岐阜聖徳学園大','岐阜聖徳学園大学','岐阜聖徳学園','岐阜聖徳','ぎふしょうとくがくえんだいがく','ぎふしょうとくがくえん','ぎふしょうとく'],
  ['名古屋学芸大','名古屋学芸大学','名古屋学芸','なごやがくげいだいがく','なごやがくげい'],
  ['東京都立大','東京都立大学','東京都立','都立大','とうきょうとりつだいがく','とうきょうとりつ','とりつだい'],
  ['金沢大','金沢大学','金沢','かなざわだいがく','かなざわ'],
  ['京都教育大','京都教育大学','京都教育','京教大','きょうときょういくだいがく','きょうときょういく'],
  ['名古屋外大','名古屋外国語大学','名古屋外国語大','名古屋外国語','なごやがいこくごだいがく','なごやがいこくご','なごやがいだい'],
  ['埼玉大','埼玉大学','埼玉','さいたまだいがく','さいたま'],
  ['岡山大','岡山大学','岡山','おかやまだいがく','おかやま'],
  ['日本福祉大','日本福祉大学','日本福祉','日福大','にほんふくしだいがく','にほんふくし','にっぷくだい'],
  ['滋賀大','滋賀大学','滋賀','しがだいがく','しが'],
  ['藤田医大','藤田医科大学','藤田医科大','藤田医科','ふじたいかだいがく','ふじたいか','ふじたいだい'],
  ['青山学院大','青山学院大学','青山学院','青学','あおやまがくいんだいがく','あおやまがくいん','あおがく'],
  ['龍谷大','龍谷大学','龍谷','竜谷大','竜谷大学','竜谷','りゅうこくだいがく','りゅうこく']
];

export function normalizeSearch(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0x60))
    .replace(/\s+/g,' ').trim();
}
const aliasOwners = new Map();
for (const aliases of UNIVERSITY_ALIASES) {
  const key = normalizeSearch(aliases[0]);
  for (const alias of aliases) {
    const normalized = normalizeSearch(alias);
    if (!aliasOwners.has(normalized)) aliasOwners.set(normalized,key);
    else if (aliasOwners.get(normalized)!==key) aliasOwners.set(normalized,null);
  }
}
const aliasTextByKey = new Map(UNIVERSITY_ALIASES.map(aliases => [normalizeSearch(aliases[0]),aliases.join(' ')]));
export function universityKey(text) {
  const normalized = normalizeSearch(text);
  return aliasOwners.get(normalized) || normalized;
}
export function universitySearchText(text) {
  return aliasTextByKey.get(universityKey(text)) || String(text ?? '');
}
export function matchesSearch(query, fields) {
  const keywords = normalizeSearch(query).split(' ').filter(Boolean);
  const haystack = normalizeSearch((Array.isArray(fields)?fields:[fields]).filter(value=>value!=null).join(' '));
  return keywords.every(keyword=>haystack.includes(keyword));
}

const validSelectionTypes = new Set(SELECTION_TYPES.map(type=>type.id));
function inferredSelectionType(text) {
  const normalized = normalizeSearch(text);
  if (/指定校/.test(normalized)) return 'designated';
  if (/総合型|(?:^|[^a-z])ao(?:[^a-z]|$)/.test(normalized)) return 'comprehensive';
  if (/公募/.test(normalized)) return 'recommendation';
  if (/一般|共通てすと|せんたー利用/.test(normalized)) return 'general';
  return 'unknown';
}
export function selectionTypeOf(record) {
  if (!record) return 'unknown';
  if (validSelectionTypes.has(record.selectionType)) return record.selectionType;
  const selected = inferredSelectionType([record.method,record.selectionMethod,record.rawName].filter(Boolean).join(' '));
  if (selected!=='unknown') return selected;
  // An official general-admissions source may use a short row name such as A2.
  // Do not infer a student's route from a term (前期・後期) or letter alone.
  if (record.sourceKind==='official') return inferredSelectionType(record.sourceName || '');
  return 'unknown';
}
export function selectionLabel(id) {
  return SELECTION_TYPES.find(type=>type.id===id)?.label || SELECTION_TYPES[0].label;
}
const selectionSearchAliases = {
  unknown:'未確認 未定',
  comprehensive:'総合型選抜 AO AO入試 総合型',
  designated:'指定校推薦 学校推薦型選抜',
  recommendation:'公募制推薦 公募推薦 学校推薦型選抜',
  general:'一般入試 一般選抜',
  other:'その他'
};
export function selectionSearchText(id) {
  return selectionSearchAliases[id] || selectionSearchAliases.unknown;
}
export function isGuideCompatible(choice, guide) {
  if (!choice || !guide || !universityKey(choice.university) || universityKey(choice.university)!==universityKey(guide.university)) return false;
  const choiceType = selectionTypeOf(choice);
  return choiceType==='unknown' || choiceType===selectionTypeOf(guide);
}
export function applyChoiceEdit(choice, data) {
  const linkFields = ['selectionType','university','faculty','department','method','schedule','code'];
  const changed = linkFields.some(key=>Object.prototype.hasOwnProperty.call(data,key) && String(key==='selectionType'?selectionTypeOf(choice):(choice[key]??''))!==String(data[key]??''));
  const identityChanged = ['university','faculty','department','code'].some(key=>Object.prototype.hasOwnProperty.call(data,key)&&String(choice[key]??'')!==String(data[key]??''));
  Object.assign(choice,data);
  if(identityChanged)for(const route of choice.additionalAdmissions||[])route.guideId='';
  if (changed) {choice.guideId='';choice.officialLinkDismissed=true;}
  return choice;
}
