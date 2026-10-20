import {applyRequestedAdmissionUpdates} from './module-406c6557ece5.js';
// All student records stay in this browser. PDF files use a separate IndexedDB store.
export const STORAGE_KEY = 'shiro-3a-v1';
const DATABASE_NAME = 'shiro-3a-documents';
const DOCUMENT_STORE = 'documents';
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_BACKUP_DOCUMENT_BYTES = 250 * 1024 * 1024;
const MAX_DOCUMENTS = 1000;
const SELECTION_TYPE_IDS = new Set(['unknown','comprehensive','designated','recommendation','general','other']);
function selectionTypeField(record) { if (hasOwn(record, 'selectionType') && !SELECTION_TYPE_IDS.has(record.selectionType)) fail('選抜方式の区分が正しくありません。'); }
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
let databasePromise;
let documentQueue = Promise.resolve();

function fail(message) { throw new Error(message); }
function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail(`${label}の形式が正しくありません。`);
  }
}

// Preserve future metadata, but only accept bounded, ordinary JSON data.
function cloneJson(input) {
  let nodes = 0;
  const ancestors = new Set();
  function visit(value, depth) {
    if (++nodes > 100000 || depth > 24) fail('データが大きすぎるか、入れ子が深すぎます。');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('データに無効な数値があります。');
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > 1000000) fail('データ内の文字列が長すぎます。');
      return value;
    }
    if (typeof value !== 'object') fail('データに保存できない値があります。');
    if (ancestors.has(value)) fail('データが循環参照になっています。');
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > 5000) fail('データの件数が上限を超えています。');
      result = value.map(item => visit(item, depth + 1));
    } else {
      plainObject(value, 'データ');
      const keys = Object.keys(value);
      if (keys.length > 1000) fail('データの項目数が多すぎます。');
      result = {};
      for (const key of keys) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('データに無効な項目名があります。');
        result[key] = visit(value[key], depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  }
  return visit(input, 0);
}

function textField(object, key, label, maximum = 20000) {
  if (!hasOwn(object, key) || object[key] === null) object[key] = '';
  if (typeof object[key] !== 'string' || object[key].length > maximum) fail(`${label}は${maximum}文字以内の文字列で指定してください。`);
  return object[key];
}

function identifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\u0000-\u001f]/.test(value)) {
    fail(`${label}が正しくありません。`);
  }
  return value;
}

function dateField(object, key, label) {
  const value = textField(object, key, label, 10);
  if (!value) return;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(`${label}は YYYY-MM-DD 形式で入力してください。`);
  const year = +match[1], month = +match[2], day = +match[3];
  const date = new Date(`${value}T00:00:00.000Z`);
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    fail(`${label}の日付が正しくありません。`);
  }
}

function timestamp(value, label, allowNull = false) {
  if ((allowNull && value === null) || value === '') return value;
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label}の日時が正しくありません。`);
  }
  dateField({ value: value.slice(0, 10) }, 'value', label);
  if (+value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59) fail(`${label}の日時が正しくありません。`);
  return value;
}

export function validateState(input) {
  plainObject(input, '保存データ');
  const state = cloneJson(input);
  if (state.schemaVersion !== 1) fail('この保存データのバージョンには対応していません。');
  if (!Array.isArray(state.students) || state.students.length !== 42) fail('生徒データは3Aの42人分である必要があります。');
  if (!Array.isArray(state.guidelines) || state.guidelines.length > 5000) fail('募集要項データの形式または件数が正しくありません。');
  const studentIds = new Set(), studentNumbers = new Set(), choiceIds = new Set();
  for (const student of state.students) {
    plainObject(student, '生徒');
    identifier(student.id, '生徒ID');
    if (studentIds.has(student.id)) fail('生徒IDが重複しています。');
    studentIds.add(student.id);
    if (typeof student.number === 'string' && /^\d{1,2}$/.test(student.number)) student.number = Number(student.number);
    if (!Number.isInteger(student.number) || student.number < 1 || student.number > 42 || studentNumbers.has(student.number)) fail('出席番号は1〜42の重複しない番号にしてください。');
    studentNumbers.add(student.number);
    for (const field of ['classCode', 'className', 'name']) textField(student, field, '生徒情報', 200);
    if (!Array.isArray(student.choices) || student.choices.length > 8) fail('志望校は1人につき最大8件です。');
    const ranks = new Set();
    for (const choice of student.choices) {
      plainObject(choice, '志望校');
      identifier(choice.id, '志望校ID');
      if (choiceIds.has(choice.id)) fail('志望校IDが重複しています。');
      choiceIds.add(choice.id);
      if (!Number.isInteger(choice.rank) || choice.rank < 1 || choice.rank > 8 || ranks.has(choice.rank)) fail('志望順位は1〜8の重複しない番号にしてください。');
      ranks.add(choice.rank);
      for (const field of ['code', 'rawName', 'university', 'faculty', 'department', 'method', 'schedule', 'notes']) textField(choice, field, '志望校情報');
      selectionTypeField(choice);
      if (hasOwn(choice, 'additionalAdmissions')) {
        if (!Array.isArray(choice.additionalAdmissions) || choice.additionalAdmissions.length > 16) fail('追加方式は1志望につき16件までです。');
        const admissionIds = new Set();
        for (const admission of choice.additionalAdmissions) {
          plainObject(admission, '追加方式');identifier(admission.id, '追加方式ID');
          if (admissionIds.has(admission.id)) fail('追加方式IDが重複しています。');admissionIds.add(admission.id);
          selectionTypeField(admission);if (!admission.selectionType) fail('追加方式の区分がありません。');
          for (const field of ['method','notes']) textField(admission, field, '追加方式');
          if (hasOwn(admission, 'guideId')) { const guideId = textField(admission, 'guideId', '追加方式の募集要項ID', 128);if (guideId) identifier(guideId, '追加方式の募集要項ID'); }
        }
      }
      if (!hasOwn(choice, 'assessment') || choice.assessment === null) choice.assessment = {};
      if (typeof choice.assessment === 'string') textField(choice, 'assessment', '判定情報');
      else plainObject(choice.assessment, '判定情報');
      if (hasOwn(choice, 'guideId')) {
        const guideId = textField(choice, 'guideId', '募集要項ID', 128);
        if (guideId) identifier(guideId, '募集要項ID');
      }
      if (hasOwn(choice, 'guidelineId')) {
        const legacyGuideId = textField(choice, 'guidelineId', '募集要項ID', 128);
        if (legacyGuideId) identifier(legacyGuideId, '募集要項ID');
        if (choice.guideId && legacyGuideId && choice.guideId !== legacyGuideId) fail('志望校にひも付いた募集要項IDが一致していません。');
        if (!choice.guideId && legacyGuideId) choice.guideId = legacyGuideId;
        delete choice.guidelineId;
      }
    }
    student.choices.sort((a, b) => a.rank - b.rank);
  }
  const guidelineIds = new Set();
  for (const guideline of state.guidelines) {
    plainObject(guideline, '募集要項');
    identifier(guideline.id, '募集要項ID');
    if (guidelineIds.has(guideline.id)) fail('募集要項IDが重複しています。');
    guidelineIds.add(guideline.id);
    for (const field of ['university', 'faculty', 'department', 'method', 'sourceName', 'notes']) textField(guideline, field, '募集要項情報');
    selectionTypeField(guideline);
    textField(guideline, 'excerpt', '募集要項の抜粋', 200000);
    if (Number.isInteger(guideline.year)) guideline.year = String(guideline.year);
    const year = textField(guideline, 'year', '年度', 20);
    if (year && !/^\d{4}(?:年度)?$/.test(year)) fail('年度は4桁の西暦で入力してください。');
    for (const [field, label] of Object.entries({ applicationStart: '出願開始日', applicationEnd: '出願締切日', examDate: '試験日', resultDate: '合格発表日', enrollmentDeadline: '手続き締切日', webRegistrationStart:'Web出願登録開始日',webRegistrationEnd:'Web出願登録締切日',secondEnrollmentDeadline:'第二次手続締切日',finalEnrollmentDeadline:'最終手続締切日' })) dateField(guideline, field, label);
    for (const field of ['examDates', 'examDateOptions']) {
      if (!hasOwn(guideline, field)) continue;
      if (!Array.isArray(guideline[field]) || guideline[field].length > 60) fail('試験日の一覧が正しくありません。');
      for (const value of guideline[field]) dateField({value}, 'value', '試験日');
      guideline[field] = [...new Set(guideline[field])].sort();
    }
    const sourceUrl = textField(guideline, 'sourceUrl', '参照URL', 4000);
    if (sourceUrl) {
      try { if (!['https:', 'http:'].includes(new URL(sourceUrl).protocol)) throw new Error(); }
      catch { fail('参照URLは http:// または https:// から始まるURLにしてください。'); }
    }
    if (Number.isInteger(guideline.sourcePage)) {
      if (guideline.sourcePage < 1 || guideline.sourcePage > 100000) fail('参照ページが正しくありません。');
      guideline.sourcePage = String(guideline.sourcePage);
    }
    textField(guideline, 'sourcePage', '参照ページ', 100);
    const documentId = textField(guideline, 'documentId', '資料ID', 128);
    if (documentId) identifier(documentId, '資料ID');
    if (!hasOwn(guideline, 'verifiedAt') || guideline.verifiedAt === null) guideline.verifiedAt = '';
    if (guideline.verifiedAt && /^\d{4}-\d{2}-\d{2}$/.test(guideline.verifiedAt)) dateField(guideline, 'verifiedAt', '確認日');
    else timestamp(guideline.verifiedAt, '確認日');
  }
  for (const student of state.students) {
    for (const choice of student.choices) {
      if (choice.guideId && !guidelineIds.has(choice.guideId)) fail('志望校にひも付いた募集要項が見つかりません。');
      for (const admission of choice.additionalAdmissions || []) if (admission.guideId && !guidelineIds.has(admission.guideId)) fail('追加方式にひも付いた募集要項が見つかりません。');
    }
  }
  if (!hasOwn(state, 'updatedAt')) state.updatedAt = null;
  timestamp(state.updatedAt, '更新日', true);
  return state;
}

function storage() {
  try {
    if (!globalThis.localStorage) throw new Error();
    return globalThis.localStorage;
  } catch { fail('このブラウザーでは保存領域を利用できません。保存を許可した通常のブラウザーで開いてください。'); }
}

export function mergeOfficialSeed(input, seed) {
  const state = validateState(input);
  if (!seed?.officialRevision || state.officialRevision === seed.officialRevision) return validateState(applyRequestedAdmissionUpdates(state, seed));
  const existing = new Map(state.guidelines.map(record => [record.id, record]));
  const suppressed = new Set(state.suppressedOfficialIds || []);
  for (const record of seed.guidelines || []) {
    if (suppressed.has(record.id)) continue;
    const previous = existing.get(record.id);
    if (!previous || (previous.sourceKind === 'official' && !previous.userModifiedAt)) existing.set(record.id, cloneJson(record));
  }
  state.guidelines = [...existing.values()];
  const guides = new Map(state.guidelines.filter(g => g.sourceKind === 'official' && g.autoLink !== false && !g.reviewRequired).map(g => [g.code, g]));
  const baseline = new Map((seed.students || []).flatMap(s => s.choices).map(c => [c.code, c]));
  for (const student of state.students) for (const choice of student.choices) {
    if (choice.guideId || choice.officialLinkDismissed || choice.selectionType) continue;
    const original = baseline.get(choice.code), guide = guides.get(choice.code);
    if (!original || !guide || ['university','faculty','department','method','schedule'].some(key => (choice[key] || '') !== (original[key] || ''))) continue;
    choice.guideId = guide.id;
  }
  state.officialCatalog = cloneJson(seed.officialCatalog || []);
  state.officialRevision = seed.officialRevision;
  return validateState(applyRequestedAdmissionUpdates(state, seed));
}

export async function loadState(seed) {
  let raw;
  try { raw = storage().getItem(STORAGE_KEY); }
  catch (error) { fail(`保存データを読み込めませんでした。${error.message || ''}`); }
  if (raw === null) {
    const initial = mergeOfficialSeed({ schemaVersion: 1, students: seed?.students, guidelines: [], updatedAt: null }, seed);
    return seed?.officialRevision ? saveState(initial) : initial;
  }
  try {
    const previous = validateState(JSON.parse(raw));
    const merged = mergeOfficialSeed(previous, seed);
    return previous.officialRevision !== merged.officialRevision || JSON.stringify(previous.appliedRequestedAdmissionUpdateIds || []) !== JSON.stringify(merged.appliedRequestedAdmissionUpdateIds || []) ? saveState(merged) : merged;
  }
  catch (error) { fail(`保存データを読み込めませんでした。元のデータは変更していません。${error.message || ''}`); }
}

export function saveState(input) {
  const state = validateState(input);
  state.updatedAt = new Date().toISOString();
  try { storage().setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) {
    const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
    fail(quota ? '保存容量が不足しています。バックアップをダウンロードしてから、不要なデータを整理してください。変更は保存されていません。' : `保存できませんでした。変更は保存されていません。${error.message || ''}`);
  }
  return state;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('このブラウザーではPDFの保存領域を利用できません。')); return; }
    let request, settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('PDF保存領域を開けませんでした。他のタブを閉じて再度お試しください。')); }
    }, 10000);
    function rejectOpen(message) {
      if (!settled) { settled = true; clearTimeout(timeout); reject(new Error(message)); }
    }
    try { request = indexedDB.open(DATABASE_NAME, 1); }
    catch { rejectOpen('PDF保存領域を開けませんでした。ブラウザーの保存設定を確認してください。'); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DOCUMENT_STORE)) request.result.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
    };
    request.onerror = () => rejectOpen('PDF保存領域を開けませんでした。ブラウザーの保存設定と空き容量を確認してください。');
    request.onblocked = () => rejectOpen('PDF保存領域が他のタブで使用されています。他のタブを閉じて再度お試しください。');
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timeout);
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

async function transaction(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx, result, actionError;
    try {
      tx = database.transaction(DOCUMENT_STORE, mode);
      tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
      tx.onabort = () => reject(actionError || new Error('PDFの読み込み・保存に失敗しました。空き容量とブラウザーの保存設定を確認してください。'));
      tx.onerror = () => { /* onabort reports the complete transaction failure. */ };
      result = action(tx.objectStore(DOCUMENT_STORE));
    } catch (error) {
      actionError = new Error(`PDFの読み込み・保存に失敗しました。${error.message || ''}`);
      if (tx) { try { tx.abort(); } catch { reject(actionError); } }
      else reject(actionError);
    }
  });
}

function queueDocuments(action) {
  const operation = documentQueue.then(action, action);
  documentQueue = operation.catch(() => {});
  return operation;
}

async function documentRecord(id, blob, name) {
  identifier(id, '資料ID');
  if (typeof name !== 'string' || !name.trim() || name.length > 1000) fail('PDFのファイル名が正しくありません。');
  if (!(blob instanceof Blob) || blob.size < 5 || blob.size > MAX_DOCUMENT_BYTES) fail('PDFは50MB以下のファイルを選択してください。');
  if (blob.type && blob.type.toLowerCase() !== 'application/pdf') fail('PDFファイルを選択してください。');
  const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...signature) !== '%PDF-') fail('PDFファイルの内容を確認できません。正しいPDFを選択してください。');
  return { id, blob: blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }), name };
}

export async function putDocument(id, blob, name) {
  const record = await documentRecord(id, blob, name);
  return queueDocuments(async () => {
    await transaction('readwrite', store => { store.put(record); });
    return { id: record.id, name: record.name, size: record.blob.size, type: record.blob.type };
  });
}

export async function getDocument(id) {
  identifier(id, '資料ID');
  return queueDocuments(() => transaction('readonly', store => {
    const request = store.get(id);
    return () => request.result;
  }));
}

export async function deleteDocument(id) {
  identifier(id, '資料ID');
  return queueDocuments(() => transaction('readwrite', store => { store.delete(id); }));
}

function bytesToBase64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(''));
}

function base64ToBytes(encoded) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('バックアップ内のPDFデータが正しくありません。');
  let binary;
  try { binary = atob(encoded); } catch { fail('バックアップ内のPDFデータを読み込めません。'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  // Reject noncanonical base64 rather than accepting ambiguous corrupt input.
  if (bytesToBase64(bytes) !== encoded) fail('バックアップ内のPDFデータが正しくありません。');
  return bytes;
}

export async function exportBackup(input) {
  const state = validateState(input);
  const referencedIds = [...new Set(state.guidelines.map(guideline => guideline.documentId).filter(Boolean))];
  if (referencedIds.length > MAX_DOCUMENTS) fail('PDFの件数がバックアップの上限を超えています。');
  const records = referencedIds.length ? await queueDocuments(() => transaction('readonly', store => {
    const requests = referencedIds.map(id => store.get(id));
    return () => requests.map(request => request.result);
  })) : [];
  const savedIds = new Set(records.filter(Boolean).map(record => record.id));
  for (const guideline of state.guidelines) {
    if (guideline.documentId && !savedIds.has(guideline.documentId)) fail(`「${guideline.sourceName || guideline.university || '募集要項'}」のPDFが保存領域に見つかりません。PDFを再登録してからバックアップしてください。`);
  }
  const documents = [];
  let totalBytes = 0;
  for (const rawRecord of records) {
    const record = await documentRecord(rawRecord.id, rawRecord.blob, rawRecord.name);
    totalBytes += record.blob.size;
    if (totalBytes > MAX_BACKUP_DOCUMENT_BYTES) fail('PDFの合計が250MBを超えるため、一度にバックアップできません。');
    documents.push({ id: record.id, name: record.name, type: 'application/pdf', dataBase64: bytesToBase64(new Uint8Array(await record.blob.arrayBuffer())) });
  }
  return { format: 'shiro-3a', version: 1, state, documents };
}

export async function restoreBackup(parsed) {
  plainObject(parsed, 'バックアップ');
  if (parsed.format !== 'shiro-3a' || parsed.version !== 1) fail('このアプリのバックアップファイルを選択してください。');
  const state = validateState(parsed.state);
  if (!Array.isArray(parsed.documents) || parsed.documents.length > MAX_DOCUMENTS) fail('バックアップ内のPDF一覧が正しくありません。');
  const documents = [], ids = new Set();
  let totalBytes = 0;
  // Validate and decode every record before touching either saved data store.
  for (const candidate of parsed.documents) {
    plainObject(candidate, 'バックアップ内のPDF');
    identifier(candidate.id, '資料ID');
    if (ids.has(candidate.id)) fail('バックアップ内の資料IDが重複しています。');
    ids.add(candidate.id);
    if (candidate.type !== 'application/pdf') fail('バックアップにPDF以外の資料が含まれています。');
    const bytes = base64ToBytes(candidate.dataBase64);
    totalBytes += bytes.length;
    if (totalBytes > MAX_BACKUP_DOCUMENT_BYTES) fail('バックアップ内のPDFの合計が250MBを超えています。');
    documents.push(await documentRecord(candidate.id, new Blob([bytes], { type: candidate.type }), candidate.name));
  }
  for (const guideline of state.guidelines) {
    if (guideline.documentId && !ids.has(guideline.documentId)) fail('募集要項に対応するPDFがバックアップに含まれていません。元の保存データは変更していません。');
  }
  // Check localStorage access and serialization before committing PDF records.
  const local = storage();
  try { local.getItem(STORAGE_KEY); JSON.stringify(state); }
  catch { fail('保存領域を利用できないため復元できません。元の保存データは変更していません。'); }
  return queueDocuments(async () => {
    const previous = await transaction('readonly', store => {
      const requests = documents.map(record => store.get(record.id));
      return () => requests.map(request => request.result);
    });
    if (documents.length) await transaction('readwrite', store => { for (const record of documents) store.put(record); });
    try { return saveState(state); }
    catch (error) {
      // Never clear the database: unrelated PDF records remain intact.
      try {
        if (documents.length) await transaction('readwrite', store => {
          documents.forEach((record, index) => previous[index] ? store.put(previous[index]) : store.delete(record.id));
        });
      } catch { fail(`復元を完了できませんでした。生徒情報は変更していませんが、PDF保存領域の復旧に失敗しました。バックアップを保管して再度お試しください。${error.message || ''}`); }
      throw error;
    }
  });
}
