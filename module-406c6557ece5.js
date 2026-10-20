// Apply explicit teacher requests once, without replacing existing preferences.
const requestedSelectionTypes = new Set(['unknown', 'comprehensive', 'designated', 'recommendation', 'general', 'other']);
const requestedText = value => String(value ?? '').normalize('NFKC').replace(/[\s　]+/g, '').toLowerCase();
const requestedUniversity = value => requestedText(value).replace(/大学$/, '大');
const requestedFaculty = value => requestedText(value).replace(/科学部$/, '科学').replace(/学部$/, '');
const requestedDepartment = value => requestedText(value).replace(/学科$/, '');
const requestedGuideUpdateFields = new Set([
  'method', 'selectionType', 'year', 'applicationStart', 'applicationEnd',
  'webRegistrationStart', 'webRegistrationEnd', 'examDate', 'examDates', 'examDateOptions',
  'resultDate', 'enrollmentDeadline', 'secondEnrollmentDeadline', 'finalEnrollmentDeadline',
  'fieldSources', 'notes', 'sourceUrl', 'sourceName', 'sourcePage', 'pdfUrl',
  'reviewRequired', 'variantSelectionRequired', 'selectedAdmissionVariant', 'admissionVariants',
  'userModifiedAt', 'availabilityNote', 'publicationStatus', 'verifiedAt', 'checkedAt',
  'noIndividualExam', 'postalFinalDeadlineRequiresConfirmation'
]);

function requestedUpdateGuide(guide, update) {
  if (!guide || !update || typeof update !== 'object' || Array.isArray(update)) return;
  for (const [key, value] of Object.entries(update)) {
    if (requestedGuideUpdateFields.has(key)) guide[key] = structuredClone(value);
  }
}

function requestedChoiceMatches(choice, patch, includeRank = true) {
  const universities = [patch.university, ...(Array.isArray(patch.universityAliases) ? patch.universityAliases : [])];
  if (!universities.some(value => requestedUniversity(value) === requestedUniversity(choice.university))) return false;
  if (includeRank && patch.rank != null && Number(choice.rank) !== Number(patch.rank)) return false;
  if (patch.faculty && requestedFaculty(choice.faculty) !== requestedFaculty(patch.faculty)) return false;
  if (patch.department && requestedDepartment(choice.department) !== requestedDepartment(patch.department)) return false;
  return true;
}

function requestedNewChoice(student, patch, rank) {
  const source = patch.createChoice;
  const choice = {
    id: source.id || `${student.id}-requested-${rank}`,
    requestedAdmissionUpdateId: patch.id,
    rank,
    code: source.code || '',
    rawName: source.rawName || [source.university, source.faculty, source.department, source.method].filter(Boolean).join(' '),
    university: source.university || patch.university || '',
    faculty: source.faculty || patch.faculty || '',
    department: source.department || patch.department || '',
    method: source.method || '',
    selectionType: source.selectionType || 'unknown',
    schedule: source.schedule || '',
    notes: source.notes || '',
    assessment: {
      dockingScore: '', dockingJudgment: '', commonScore: '',
      commonJudgment: '', generalScore: '', generalJudgment: ''
    }
  };
  return choice;
}

export function applyRequestedAdmissionUpdates(state, seed) {
  const patches = Array.isArray(seed?.requestedAdmissionUpdates) ? seed.requestedAdmissionUpdates : [];
  if (!patches.length) return state;
  const applied = new Set(Array.isArray(state.appliedRequestedAdmissionUpdateIds) ? state.appliedRequestedAdmissionUpdateIds : []);
  const warnings = [];
  // The seed may contain a guide the teacher has deleted or declined to import.
  // Only link records actually retained in this state, so validation stays safe.
  const guideIds = new Set((state.guidelines || []).map(guide => guide.id));
  const warn = (patch, message) => warnings.push(`${patch.studentNumber}番：${message}`);
  for (const patch of patches) {
    if (applied.has(patch.id)) continue;
    if (!patch.id || !patch.route?.id || !requestedSelectionTypes.has(patch.route.selectionType) || !patch.route.method) {
      warn(patch, '追加する選抜方式の設定を確認してください。');
      continue;
    }
    const student = state.students?.find(item => Number(item.number) === Number(patch.studentNumber));
    if (!student || !Array.isArray(student.choices)) {
      warn(patch, '対象の生徒が見つかりません。');
      continue;
    }
    const matches = student.choices.filter(choice => requestedChoiceMatches(choice, patch));
    if (matches.length > 1) {
      warn(patch, '対象の志望校が複数あります。学部・学科・順位を確認してください。');
      continue;
    }
    let choice = matches[0];
    if (patch.route.guideId && !guideIds.has(patch.route.guideId)) {
      warn(patch, '追加方式の募集要項が見つかりません。');
      continue;
    }
    if (patch.guideUpdate && !patch.route.guideId) {
      warn(patch, '更新する募集要項が指定されていません。');
      continue;
    }
    let created = false;
    if (!choice && patch.createChoice) {
      // Do not duplicate the university/faculty already held at another rank.
      const existingElsewhere = student.choices.filter(item => requestedChoiceMatches(item, patch, false));
      if (existingElsewhere.length === 1) choice = existingElsewhere[0];
      else if (existingElsewhere.length > 1) {
        warn(patch, '対象の志望校が複数あります。順位を確認してください。');
        continue;
      } else {
        const rank = Number(patch.preferredRank ?? patch.createChoice.rank ?? 8);
        if (!Number.isInteger(rank) || rank < 1 || rank > 8 || student.choices.length >= 8 || student.choices.some(item => Number(item.rank) === rank)) {
          warn(patch, `第${rank}志望に空きがないため、志望校を追加できません。`);
          continue;
        }
        const candidate = requestedNewChoice(student, patch, rank);
        if (!requestedChoiceMatches(candidate, patch, false) || !requestedSelectionTypes.has(candidate.selectionType) || state.students.some(item => item.choices?.some(existing => existing.id === candidate.id))) {
          warn(patch, '追加する志望校の大学・学部・IDを確認してください。');
          continue;
        }
        choice = candidate;
        created = true;
      }
    }
    if (!choice) {
      warn(patch, '指定の大学・学部・学科の志望校が見つかりません。');
      continue;
    }
    if (choice.additionalAdmissions != null && !Array.isArray(choice.additionalAdmissions)) {
      warn(patch, '既存の追加方式の形式を確認してください。');
      continue;
    }
    if (!created && choice.additionalAdmissions?.length >= 16 && !choice.additionalAdmissions.some(route => route.id === patch.route.id)) {
      warn(patch, '追加方式が上限の16件に達しています。');
      continue;
    }
    // A newly added choice can use the requested route as its main route.
    const existingRoute = choice.additionalAdmissions?.find(route => route.id === patch.route.id);
    if (created && choice.selectionType === patch.route.selectionType && choice.method === patch.route.method) {
      if (patch.route.guideId) choice.guideId = patch.route.guideId;
    } else if (existingRoute && patch.updateExistingRoute === true) {
      Object.assign(existingRoute, {
        selectionType: patch.route.selectionType, method: patch.route.method,
        guideId: patch.route.guideId || '', notes: patch.route.notes || ''
      });
    } else if (!existingRoute) {
      const route = { id: patch.route.id, selectionType: patch.route.selectionType, method: patch.route.method };
      if (patch.route.guideId) route.guideId = patch.route.guideId;
      if (patch.route.notes) route.notes = patch.route.notes;
      (choice.additionalAdmissions ||= []).push(route);
    }
    requestedUpdateGuide(state.guidelines.find(guide => guide.id === patch.route.guideId), patch.guideUpdate);
    if (created) {
      student.choices.push(choice);
      student.choices.sort((a, b) => a.rank - b.rank);
    }
    applied.add(patch.id);
  }
  state.appliedRequestedAdmissionUpdateIds = [...applied];
  state.requestedAdmissionUpdateWarnings = warnings;
  return state;
}
