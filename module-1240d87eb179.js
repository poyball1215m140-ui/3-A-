/** CSV and admissions text utilities. All extracted text is data, never instructions. */
const FIELD_LABELS = Object.freeze({
  method: '選抜方式', applicationStart: '出願開始日', applicationEnd: '出願締切日',
  examDate: '試験日', resultDate: '合格発表日', enrollmentDeadline: '手続き締切日',
});

const normalizeText = value => String(value ?? '').normalize('NFKC').replace(/\u00a0/g, ' ');
const cleanCell = value => String(value ?? '').trim();
const cleanIdentifier = value => cleanCell(value).replace(/^'/, '');

/** RFC 4180 style parsing, including quoted commas/newlines, escaped quotes and BOM. */
export function parseCSV(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  if (!input) return [];
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
      continue;
    }
    if (char === ',') finishCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"') {
      if (cell || closed) throw new Error(`CSVの引用符が不正です（${rows.length + 1}行目）。`);
      quoted = true;
    } else if (closed) {
      if (char !== ' ' && char !== '\t') throw new Error(`CSVの引用符の後に不正な文字があります（${rows.length + 1}行目）。`);
    } else cell += char;
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  if (cell || row.length || closed) finishRow();
  return rows;
}

function schoolParts(rawName) {
  const tokens = cleanCell(rawName).split(/[\s\u3000]+/).filter(Boolean);
  const markers = new Set(['前', '後', '中', '前期', '後期', '中期', '共テ']);
  const hasDepartment = Boolean(tokens[2] && !markers.has(tokens[2]));
  let rest = tokens.slice(hasDepartment ? 3 : 2), schedule = '';
  if (['前', '後', '中', '前期', '後期', '中期'].includes(rest[0])) {
    schedule = ({前: '前期', 後: '後期', 中: '中期'})[rest[0]] || rest[0];
    rest = rest.slice(1);
  }
  if (rest[0] === '共テ') rest[0] = '共通テスト利用';
  return {university: tokens[0] || '', faculty: tokens[1] || '', department: hasDepartment ? tokens[2] : '', method: rest.join(' '), schedule};
}

function makeStudent(classCode, number, name = '', className = '3A') {
  const rawNumber = cleanIdentifier(number);
  const numericNumber = Number(rawNumber);
  if (!rawNumber || !Number.isInteger(numericNumber) || numericNumber < 1) {
    throw new Error(`出席番号が不正です: ${rawNumber || '空欄'}`);
  }
  const originalClass = cleanIdentifier(classCode) || className;
  return {
    id: `${originalClass}-${rawNumber.padStart(4, '0')}`,
    classCode: originalClass, className: className || originalClass,
    number: numericNumber, name: cleanCell(name) || `出席番号 ${String(numericNumber).padStart(2, '0')}`, choices: [],
  };
}

function readWide(rows) {
  const students = [], warnings = [], identifiers = new Set();
  for (let index = 2; index < rows.length; index++) {
    const row = rows[index];
    if (row.every(value => !cleanCell(value))) continue;
    if (row.length < 80) warnings.push(`${index + 1}行目は${row.length}列です。空欄として補完して読み込みました。`);
    const student = makeStudent(row[0], row[1]);
    if (identifiers.has(student.id)) throw new Error(`生徒IDが重複しています: ${student.id}`);
    identifiers.add(student.id);
    for (let rank = 1; rank <= 8; rank++) {
      const offset = 16 + (rank - 1) * 8;
      const code = cleanIdentifier(row[offset]);
      const rawName = cleanCell(row[offset + 1]);
      if (!code && !rawName) continue;
      student.choices.push({
        id: `${student.id}-${rank}`, rank, code, rawName, ...schoolParts(rawName), notes: '',
        assessment: {
          dockingScore: cleanCell(row[offset + 2]), dockingJudgment: cleanCell(row[offset + 3]),
          commonScore: cleanCell(row[offset + 4]), commonJudgment: cleanCell(row[offset + 5]),
          generalScore: cleanCell(row[offset + 6]), generalJudgment: cleanCell(row[offset + 7]),
        },
      });
    }
    students.push(student);
  }
  return {students, warnings, source: {format: 'manavision-wide', rowCount: students.length, rankCount: 8}};
}

const SIMPLE_HEADERS = {
  id: ['id', '生徒ID'], classCode: ['classCode', '組'], className: ['className', 'クラス'],
  number: ['number', '番号', '出席番号'], name: ['name', '氏名', '生徒名'], rank: ['rank', '志望順位', '順位'],
  code: ['code', '募集単位コード', '募集単位（コード）'], rawName: ['rawName', '志望校', '募集単位（名称）'],
  university: ['university', '大学', '大学名', '学校名'], faculty: ['faculty', '学部'], department: ['department', '学科'],
  method: ['method', '選抜方式'], schedule: ['schedule', '日程'], notes: ['notes', 'メモ'],
};

function readSimple(rows) {
  const headers = rows[0].map(cleanCell);
  const columns = Object.fromEntries(Object.entries(SIMPLE_HEADERS).map(([key, labels]) => [key, headers.findIndex(h => labels.includes(h))]));
  if (columns.number < 0 || columns.rank < 0 || (columns.university < 0 && columns.rawName < 0)) {
    throw new Error('CSV形式を確認してください。元の志望校CSV、または「出席番号・志望順位・大学」を含むCSVを読み込めます。');
  }
  const studentsById = new Map();
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every(value => !cleanCell(value))) continue;
    const get = key => columns[key] >= 0 ? cleanCell(row[columns[key]]) : '';
    const fresh = makeStudent(get('classCode') || get('className') || '3A', get('number'), get('name'), get('className') || '3A');
    if (get('id')) fresh.id = get('id');
    const student = studentsById.get(fresh.id) || fresh;
    if (!studentsById.has(fresh.id)) studentsById.set(fresh.id, student);
    const rankText = get('rank');
    // A row without a rank can retain a student who has no registered choices.
    if (!rankText && !get('university') && !get('rawName')) continue;
    const rank = Number(normalizeText(rankText));
    if (!Number.isInteger(rank) || rank < 1 || rank > 8) throw new Error(`${index + 1}行目の志望順位は1〜8で入力してください。`);
    if (student.choices.some(choice => choice.rank === rank)) throw new Error(`${index + 1}行目: ${student.name}の第${rank}志望が重複しています。`);
    const rawName = get('rawName') || [get('university'), get('faculty'), get('department')].filter(Boolean).join(' ');
    const parts = schoolParts(rawName);
    student.choices.push({
      id: `${student.id}-${rank}`, rank, code: get('code'), rawName,
      university: get('university') || parts.university, faculty: get('faculty') || parts.faculty,
      department: get('department') || parts.department, method: get('method') || parts.method,
      schedule: get('schedule') || parts.schedule, notes: get('notes'),
    });
  }
  const students = [...studentsById.values()];
  students.forEach(student => student.choices.sort((a, b) => a.rank - b.rank));
  return {students, warnings: [], source: {format: 'simple', rowCount: students.length, rankCount: 8}};
}

/** Import the original two-header 80-column source or a documented long-form CSV. */
export function importStudentCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('CSVが空です。');
  if (rows[0].some(cell => /第[1１]志望/.test(cell)) && rows[1]?.[0] === '組' && rows[1]?.[1] === '番号') return readWide(rows);
  return readSimple(rows);
}

const YEAR_PART = '(?:(?:19|20)\\d{2}\\s*年\\s*|(?:令和|平成)\\s*(?:元|\\d{1,2})\\s*年\\s*|[RH]\\s*\\d{1,2}\\s*[./-]\\s*)?';
const DATE_PATTERN = `${YEAR_PART}\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|(?:19|20)\\d{2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2}|[RH]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{1,2}|\\d{1,2}\\s*[./]\\s*\\d{1,2}`;

function explicitYear(value) {
  const text = normalizeText(value);
  let match = text.match(/((?:19|20)\d{2})\s*(?:年|[./-])/);
  if (match) return Number(match[1]);
  match = text.match(/(令和|平成)\s*(元|\d{1,2})\s*年/);
  if (match) return (match[1] === '令和' ? 2018 : 1988) + (match[2] === '元' ? 1 : Number(match[2]));
  match = text.match(/\b([RH])\s*(\d{1,2})\s*[./-]/i);
  if (match) return (match[1].toUpperCase() === 'R' ? 2018 : 1988) + Number(match[2]);
  return null;
}

function datesIn(value) {
  const text = normalizeText(value);
  const regex = new RegExp(DATE_PATTERN, 'gi');
  const dates = [];
  for (const match of text.matchAll(regex)) {
    // Ignore matches carved from longer numbers or percentages.
    if (/\d/.test(text[match.index - 1] || '') || /\d/.test(text[match.index + match[0].length] || '')) continue;
    let raw = match[0].trim();
    const previous = dates[dates.length - 1];
    if (previous && /^[\s()月火水木金土日祝~〜～―－\-からまで]*$/.test(text.slice(previous.end, match.index))) {
      const sharedYear = explicitYear(previous.value);
      const previousMonth = previous.value.match(/(\d{1,2})\s*月/)?.[1] || previous.value.match(/(?:19|20)\d{2}\s*[./-]\s*(\d{1,2})/)?.[1];
      const currentMonth = raw.match(/^(\d{1,2})\s*(?:月|[./])/)?.[1];
      // A lower month may cross New Year. Leave its year for human confirmation.
      if (sharedYear && !explicitYear(raw) && previousMonth && currentMonth && Number(currentMonth) >= Number(previousMonth)) {
        raw = /月/.test(raw) ? `${sharedYear}年${raw}` : `${sharedYear}/${raw.replace(/[.]/g, '/')}`;
      }
    }
    dates.push({value: raw, index: match.index, end: match.index + match[0].length});
  }
  // A shortened right endpoint such as 1月5日〜10日 has an explicit shared month.
  for (let i = 0; i < dates.length; i++) {
    const current = dates[i];
    const tail = text.slice(current.end);
    const shortEnd = tail.match(/^[\s()月火水木金土日祝]*(?:~|〜|～|―|－|-|から)\s*(\d{1,2})\s*日/);
    if (!shortEnd) continue;
    const month = current.value.match(/(\d{1,2})\s*月/);
    if (!month) continue;
    const year = explicitYear(current.value);
    const value = `${year ? year + '年' : ''}${Number(month[1])}月${Number(shortEnd[1])}日`;
    const end = current.end + shortEnd[0].length;
    if (!dates.some(date => date.index >= current.end && date.index < end)) dates.splice(i + 1, 0, {value, index: current.end + shortEnd[0].search(/\d/), end});
  }
  return dates;
}

/** Exact calendar-year conversion. A caller-supplied year is never rolled across an academic year. */
export function normalizeDate(value, academicYear) {
  const text = normalizeText(value).trim();
  const dates = datesIn(text);
  if (dates.length !== 1) return '';
  const dateText = dates[0].value;
  let year = explicitYear(dateText);
  const confirmedYear = normalizeText(academicYear ?? '').trim();
  if (year === null && /^(?:19|20)\d{2}$/.test(confirmedYear)) year = Number(confirmedYear);
  if (year === null) return '';
  let match = dateText.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!match) match = dateText.match(/(?:^|[./-])\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*$/);
  if (!match) return '';
  const month = Number(match[1]), day = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const LABEL_RULES = [
  {kind: 'application', regex: /出願(?:期間|受付|開始|締切|期限|最終|締め切り|終了)|願書(?:受付|提出|締切)|インターネット出願|Web出願|ネット出願/gi},
  {kind: 'result', regex: /合格(?:者)?(?:発表|通知)|結果発表|選考結果/g},
  {kind: 'enrollment', regex: /入学手続(?:き)?|手続(?:き)?(?:締切|期限|期間)|入学金(?:納入|振込)|入学料(?:納入|振込)|納入期限/g},
  {kind: 'exam', regex: /試験日(?:程)?|試験期日|選抜日|検査日|面接日|実施日/g},
];
const METHOD_PATTERN = /大学入学共通テスト利用(?:選抜|入試)?|共通テスト利用(?:選抜|入試)?|学校推薦型選抜|総合型選抜|一般選抜|一般入試|学校推薦型|総合型|公募推薦|指定校推薦|特別選抜/g;

function labelPositions(line) {
  const found = [];
  for (const rule of LABEL_RULES) {
    for (const match of line.matchAll(new RegExp(rule.regex.source, rule.regex.flags))) found.push({kind: rule.kind, index: match.index, end: match.index + match[0].length});
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Conservative review candidates. pages may be strings or {page,text} objects.
 * No candidate is applied to a school and no missing year is invented here.
 */
export function extractCandidates(text, pages = []) {
  const sources = pages.length ? pages.map((page, index) => typeof page === 'string' ? {text: page, page: index + 1} : {text: page.text || '', page: page.page ?? page.pageNumber ?? index + 1}) : [{text: String(text ?? ''), page: null}];
  const candidates = [], seen = new Set();
  const add = (field, value, excerpt, page) => {
    if (!value) return;
    const key = `${field}\0${value}\0${page}\0${excerpt}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({field, label: FIELD_LABELS[field], value, excerpt: excerpt.slice(0, 600), page});
  };
  for (const source of sources) {
    const lines = normalizeText(source.text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let priorLabels = [], priorLine = '', priorAge = 0;
    for (const line of lines) {
      const labels = labelPositions(line), dates = datesIn(line);
      const excerpt = labels.length ? line : [priorLine, line].filter(Boolean).join('\n');
      for (const method of line.matchAll(new RegExp(METHOD_PATTERN.source, 'g'))) add('method', method[0], line, source.page);
      if (dates.length) {
        const activeLabels = labels.length ? labels : priorAge < 2 ? priorLabels : [];
        const groups = new Map();
        for (const date of dates) {
          // In flattened tables, use the closest preceding label. A single header may precede all its dates.
          const own = [...activeLabels].reverse().find(label => !labels.length || label.index <= date.index) || (activeLabels.length === 1 ? activeLabels[0] : null);
          if (!own) continue;
          if (!groups.has(own)) groups.set(own, []);
          groups.get(own).push(date);
        }
        for (const [label, items] of groups) {
          const contextEnd = labels.find(other => other.index > label.index)?.index ?? line.length;
          const context = labels.length ? line.slice(label.index, contextEnd) : excerpt;
          if (label.kind === 'application') {
            if (items.length >= 2 && /[~〜～―－\-]|から|まで/.test(context)) {
              add('applicationStart', items[0].value, excerpt, source.page);
              add('applicationEnd', items[items.length - 1].value, excerpt, source.page);
            } else if (/締切|締め切り|期限|最終|必着|消印有効|終了|まで/.test(context)) {
              items.forEach(item => add('applicationEnd', item.value, excerpt, source.page));
            } else if (/開始|初日|から/.test(context)) {
              items.forEach(item => add('applicationStart', item.value, excerpt, source.page));
            }
          } else if (label.kind === 'enrollment') {
            add('enrollmentDeadline', items[items.length - 1].value, excerpt, source.page);
          } else {
            items.forEach(item => add(label.kind === 'exam' ? 'examDate' : 'resultDate', item.value, excerpt, source.page));
          }
        }
      }
      if (labels.length) {
        // Only a date-free, single-field header may describe the next date line.
        // A completed row must never relabel a later unrelated deadline.
        priorLabels = dates.length === 0 && labels.length === 1 ? labels : [];
        priorLine = line; priorAge = 0;
      } else {
        if (dates.length) priorLabels = [];
        priorAge++;
      }
    }
  }
  return candidates;
}
