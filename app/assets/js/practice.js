const DATA_ROOT = "../../data";
const DATA_VERSION = "20260802-reviewed-bank";
const DATA_FILES = {
  tasks: "daily_tasks.30_days.json",
  groups: "question_groups.jsonl",
  drills: "basic_drills.jsonl",
};
const SELECTED_TASK_KEY = "chi_v1_selected_task_id";
const ATTEMPT_KEY = "chi_v1_last_attempt";
const ANSWER_RECORDS_KEY = "chi_v1_answer_records";
const WRONG_QUESTIONS_KEY = "chi_v1_wrong_questions";
const WEAKNESSES_KEY = "chi_v1_weaknesses";
const REVIEW_SCHEDULE_KEY = "chi_v1_review_schedule";
const STUDENT_ID = "student_001";

const knowledgeLabels = {
  K01: "字音字形",
  K02: "詞語語境與成語辨析",
  K03: "文言字義",
  K05: "文意推論",
  K06: "概念理解",
  K08: "跨材料比較",
  K09: "推論判斷",
  K10: "古今轉用與跨情境判斷",
  K12: "非連續文本與圖表判讀",
  K14: "論證判斷",
  K15: "短答統整",
};

const contentStatusLabels = {
  draft_for_preview: "候選題",
  revised_after_feedback: "已修訂候選題",
  validated_by_student: "學生已試做",
  rule_checked: "規則已檢查",
  approved_for_app: "正式題",
};

function safeId(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatKnowledge(code) {
  return knowledgeLabels[code] || "知識點待確認";
}

function formatContentStatus(status) {
  return contentStatusLabels[status] || "候選題";
}

function withDataVersion(path) {
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}v=${DATA_VERSION}`;
}

function readJson(path) {
  return fetch(withDataVersion(path)).then((response) => {
    if (!response.ok) throw new Error(`讀取失敗：${path}`);
    return response.json();
  });
}

async function readJsonl(path) {
  const response = await fetch(withDataVersion(path));
  if (!response.ok) throw new Error(`讀取失敗：${path}`);
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function byId(items, key) {
  return new Map(items.map((item) => [item[key], item]));
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return [...value].sort();
  return value ?? "";
}

function answersEqual(a, b) {
  const left = normalizeAnswer(a);
  const right = normalizeAnswer(b);
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return String(left) === String(right);
}

function questionTypeLabel(type) {
  const labels = {
    single_choice: "單選",
    multiple_choice: "多選",
    short_answer: "短答",
  };
  return labels[type] || type || "--";
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(date);
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeById(existing, incoming, key) {
  const map = new Map(existing.map((item) => [item[key], item]));
  incoming.forEach((item) => map.set(item[key], item));
  return [...map.values()];
}

function pickDisplayTask(tasks) {
  const selectedTaskId = localStorage.getItem(SELECTED_TASK_KEY);
  return tasks.find((task) => task.task_id === selectedTaskId) || tasks.find((task) => task.app_readiness === "can_run_as_candidate") || tasks[0];
}

function isTaskRunnable(task, groupMap, drillMap) {
  const hasGroup = groupMap.has(task.group_id);
  const hasAllBasics = (task.basic_question_ids || []).every((id) => drillMap.has(id));
  return task.app_readiness === "can_run_as_candidate" && hasGroup && hasAllBasics;
}

function flattenGroupQuestions(groups) {
  return groups.flatMap((group) =>
    (group.questions || []).map((question) => ({
      ...question,
      group_id: group.group_id,
      group_title: group.title,
      source_section: "題組",
    })),
  );
}

function makeQuestionList(task, groupMap, drillMap, questionMap) {
  const basics = (task.basic_question_ids || [])
    .map((id) => drillMap.get(id))
    .filter(Boolean)
    .map((question) => ({
      ...question,
      question_type: "single_choice",
      group_id: null,
      source_section: "基礎短練",
    }));

  const group = groupMap.get(task.group_id);
  const groupQuestions = (group?.questions || []).map((question) => ({
    ...question,
    group_id: group.group_id,
    group_title: group.title,
    source_section: "今日題組",
  }));

  const reviewQuestions = (task.review_question_ids || [])
    .map((id) => drillMap.get(id) || questionMap.get(id))
    .filter(Boolean)
    .map((question) => ({
      ...question,
      question_type: question.question_type || "single_choice",
      source_section: "錯題複習",
    }));

  return [...basics, ...groupQuestions, ...reviewQuestions];
}

function renderChoice(question, choice) {
  const type = question.question_type === "multiple_choice" ? "checkbox" : "radio";
  const name = `answer_${question.question_id}`;
  return `
    <label class="choice-row">
      <input type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(choice.key)}" />
      <span class="choice-key">${escapeHtml(choice.key)}</span>
      <span>${escapeHtml(choice.text)}</span>
    </label>
  `;
}

function renderQuestion(question, index) {
  const isShort = question.question_type === "short_answer";
  const isMultiple = question.question_type === "multiple_choice";
  const name = `answer_${question.question_id}`;
  const wordRange = question.prompt.match(/(\d+)-(\d+)\s*字/);
  const suggestedRange = wordRange ? `${wordRange[1]}-${wordRange[2]} 字` : "30-50 字";
  const promptHint = isShort
    ? `請用 ${suggestedRange} 回答，交卷後會先列為待 AI 評分。`
    : isMultiple
      ? "本題可複選，請逐項判斷。"
      : "本題單選，請選出最適合的答案。";
  const choicesHtml = isShort
    ? `
      <textarea class="short-answer" name="${escapeHtml(name)}" rows="4" placeholder="請輸入短答，第一版會先保存答案並在解析頁顯示評分原則。"></textarea>
      <div class="answer-helper">
        <span>建議 ${escapeHtml(suggestedRange)}</span>
        <strong class="char-count" data-for="${escapeHtml(name)}">0 字</strong>
      </div>
    `
    : `<div class="choices">${(question.choices || []).map((choice) => renderChoice(question, choice)).join("")}</div>`;

  return `
    <article class="question-card unanswered" id="question_${escapeHtml(question.question_id)}" data-question-id="${escapeHtml(question.question_id)}" data-index="${index}">
      <div class="question-head">
        <span class="question-number">第 ${index + 1} 題</span>
        <span class="tag">${escapeHtml(question.source_section)}</span>
        <span class="tag">${escapeHtml(questionTypeLabel(question.question_type))}</span>
        <span class="tag">${escapeHtml(formatKnowledge(question.knowledge_code))}</span>
      </div>
      <h3>${escapeHtml(question.prompt)}</h3>
      <p class="question-hint">${escapeHtml(promptHint)}</p>
      ${choicesHtml}
    </article>
  `;
}

function renderQuestionSectionBreak(section, count) {
  const sectionNotes = {
    基礎短練: "先把字音字形、文言字義等短題完成。",
    今日題組: "閱讀左側材料後，逐題回到文本找依據。",
    錯題複習: "這些題目來自前次錯題，答完會更新弱點與下次複習日。",
  };
  return `
    <div class="question-section-break">
      <strong>${escapeHtml(section)}</strong>
      <span>${escapeHtml(count)} 題</span>
      <p>${escapeHtml(sectionNotes[section] || "依序完成這一段練習。")}</p>
    </div>
  `;
}

function renderQuestionStack(questions) {
  const counts = questions.reduce((acc, question) => {
    acc[question.source_section] = (acc[question.source_section] || 0) + 1;
    return acc;
  }, {});
  let lastSection = "";
  return questions
    .map((question, index) => {
      const section = question.source_section || "題目";
      const sectionHtml = section !== lastSection ? renderQuestionSectionBreak(section, counts[section]) : "";
      lastSection = section;
      return `${sectionHtml}${renderQuestion(question, index)}`;
    })
    .join("");
}

function renderQuestionNav(questions) {
  return questions
    .map(
      (question, index) => `
        <button class="question-nav-button" type="button" data-target="${escapeHtml(question.question_id)}" aria-label="前往第 ${index + 1} 題">
          ${index + 1}
        </button>
      `,
    )
    .join("");
}

function collectAnswer(form, question) {
  const name = `answer_${question.question_id}`;
  if (question.question_type === "multiple_choice") {
    return [...form.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map((input) => input.value);
  }
  if (question.question_type === "short_answer") {
    return form.elements[name]?.value.trim() || "";
  }
  return form.querySelector(`input[name="${CSS.escape(name)}"]:checked`)?.value || "";
}

function isAnswered(form, question) {
  const answer = collectAnswer(form, question);
  if (Array.isArray(answer)) return answer.length > 0;
  return String(answer).trim().length > 0;
}

function setQuestionAnsweredState(question, index, answered) {
  const card = document.querySelector(`[data-question-id="${CSS.escape(question.question_id)}"]`);
  const navButton = document.querySelector(`.question-nav-button[data-target="${CSS.escape(question.question_id)}"]`);
  if (card) {
    card.classList.toggle("answered", answered);
    card.classList.toggle("unanswered", !answered);
  }
  if (navButton) {
    navButton.classList.toggle("answered", answered);
    navButton.classList.toggle("unanswered", !answered);
    navButton.setAttribute("aria-label", `${answered ? "已作答" : "未作答"}，前往第 ${index + 1} 題`);
  }
}

function updateCharCounts(form) {
  document.querySelectorAll(".char-count").forEach((node) => {
    const name = node.dataset.for;
    const value = form.elements[name]?.value.trim() || "";
    node.textContent = `${value.length} 字`;
    node.classList.toggle("in-range", value.length >= 30 && value.length <= 50);
    node.classList.toggle("over-range", value.length > 50);
  });
}

function updateProgress(form, questions) {
  let answered = 0;
  questions.forEach((question, index) => {
    const done = isAnswered(form, question);
    if (done) answered += 1;
    setQuestionAnsweredState(question, index, done);
  });

  const total = questions.length;
  const unanswered = total - answered;
  const percent = total ? Math.round((answered / total) * 100) : 0;
  const answeredCount = document.getElementById("answeredCount");
  const unansweredCount = document.getElementById("unansweredCount");
  const progressFill = document.getElementById("progressFill");
  if (answeredCount) answeredCount.textContent = `${answered} / ${total} 題`;
  if (unansweredCount) unansweredCount.textContent = `未作答 ${unanswered} 題`;
  if (progressFill) progressFill.style.width = `${percent}%`;
  updateCharCounts(form);
}

function unansweredIndexes(form, questions) {
  return questions
    .map((question, index) => (isAnswered(form, question) ? null : index + 1))
    .filter(Boolean);
}

function wirePracticeTools(form, questions) {
  form.addEventListener("input", () => updateProgress(form, questions));
  form.addEventListener("change", () => updateProgress(form, questions));
  document.getElementById("questionNav")?.addEventListener("click", (event) => {
    const button = event.target.closest(".question-nav-button");
    if (!button) return;
    const card = document.querySelector(`[data-question-id="${CSS.escape(button.dataset.target)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = card.querySelector("input, textarea");
    input?.focus({ preventScroll: true });
  });
  updateProgress(form, questions);
}

function scoreAnswer(question, studentAnswer) {
  if (question.question_type === "short_answer") {
    return {
      is_correct: null,
      score: null,
      max_score: 1,
      result_status: "needs_ai_review",
      ai_scoring_required: true,
      ai_confidence: question.ai_confidence_default || "中",
    };
  }
  const correct = answersEqual(studentAnswer, question.answer);
  return {
    is_correct: correct,
    score: correct ? 1 : 0,
    max_score: 1,
    result_status: correct ? "correct" : "wrong",
    ai_scoring_required: false,
    ai_confidence: "高",
  };
}

function buildAnswerRecords(task, questions, answers, submittedAt) {
  const taskKey = safeId(task.task_id || task.task_date);
  return answers.map((answer, index) => ({
    answer_id: `ANS_${taskKey}_${String(index + 1).padStart(3, "0")}`,
    task_id: task.task_id,
    student_id: task.student_id || STUDENT_ID,
    question_id: answer.question_id,
    group_id: answer.group_id,
    question_type: answer.question_type,
    knowledge_code: answer.knowledge_code,
    secondary_knowledge_codes: questions[index].secondary_knowledge_codes || [],
    student_answer: answer.student_answer,
    correct_answer: answer.correct_answer,
    is_correct: answer.is_correct,
    score: answer.score,
    max_score: answer.max_score,
    ai_scoring_required: answer.ai_scoring_required,
    ai_confidence: answer.ai_confidence,
    answered_at: submittedAt,
    time_spent_seconds: null,
    result_status: answer.result_status,
  }));
}

function errorReasonFor(question) {
  return question.error_reason_options?.[0] || question.common_mistakes?.[0] || "本題判斷錯誤，需回到題目依據檢查。";
}

function buildWrongQuestions(task, questions, answerRecords) {
  const taskKey = safeId(task.task_id || task.task_date);
  return answerRecords
    .map((record, index) => ({ record, question: questions[index] }))
    .filter(({ record }) => record.result_status === "wrong")
    .map(({ record, question }, index) => ({
      wrong_id: `WRONG_${taskKey}_${String(index + 1).padStart(3, "0")}`,
      answer_id: record.answer_id,
      student_id: task.student_id || STUDENT_ID,
      question_id: record.question_id,
      group_id: record.group_id,
      wrong_date: task.task_date,
      knowledge_code: record.knowledge_code,
      error_tags: question.error_tags || [],
      error_reason: errorReasonFor(question),
      student_answer_snapshot: record.student_answer,
      correct_answer_snapshot: record.correct_answer,
      review_due_date: addDays(task.task_date, 2),
      review_status: "pending",
    }));
}

function knowledgeNameFor(code, question) {
  const localNames = {
    K01: "字音字形",
    K02: "詞語語境與成語辨析",
    K03: "文言字義",
    K05: "文意推論",
    K06: "概念理解",
    K08: "跨材料比較",
    K09: "推論判斷",
    K10: "古今轉用與跨情境判斷",
    K12: "非連續文本與圖表判讀",
    K14: "論證判斷",
    K15: "短答統整",
  };
  return question.knowledge_name || localNames[code] || code;
}

function buildWeaknesses(task, questions, wrongs) {
  const questionMap = byId(questions, "question_id");
  const groups = new Map();
  wrongs.forEach((wrong) => {
    const current = groups.get(wrong.knowledge_code) || [];
    current.push(wrong);
    groups.set(wrong.knowledge_code, current);
  });

  return [...groups.entries()].map(([code, items]) => {
    const question = questionMap.get(items[0].question_id) || {};
    const weight = Math.min(
      3,
      Math.max(1, Math.round(items.reduce((sum, wrong) => sum + (questionMap.get(wrong.question_id)?.review_weight || 1), 0))),
    );
    return {
      weakness_id: `WEAK_${task.student_id || STUDENT_ID}_${code}`,
      student_id: task.student_id || STUDENT_ID,
      subject: task.subject,
      mode: task.mode,
      knowledge_code: code,
      knowledge_name: knowledgeNameFor(code, question),
      wrong_count_total: items.length,
      wrong_count_week: items.length,
      last_wrong_date: task.task_date,
      next_review_date: addDays(task.task_date, 2),
      review_weight: weight,
      status: weight >= 2 ? "active" : "watching",
    };
  });
}

function strategyFor(question) {
  if (question.question_type === "short_answer") return "short_answer_retry";
  if (question.source_section === "基礎短練" || question.knowledge_code === "K01" || question.knowledge_code === "K03") {
    return "basic_drill";
  }
  return "same_knowledge_variant";
}

function buildReviewSchedule(task, questions, wrongs) {
  const taskKey = safeId(task.task_id || task.task_date);
  const questionMap = byId(questions, "question_id");
  return wrongs.map((wrong, index) => {
    const question = questionMap.get(wrong.question_id) || {};
    return {
      review_id: `REVIEW_${taskKey}_${String(index + 1).padStart(3, "0")}`,
      student_id: task.student_id || STUDENT_ID,
      source_wrong_id: wrong.wrong_id,
      knowledge_code: wrong.knowledge_code,
      review_type: "two_day_retry",
      scheduled_date: wrong.review_due_date,
      question_strategy: strategyFor(question),
      assigned_question_id: wrong.question_id,
      status: "scheduled",
    };
  });
}

function saveFormalRecords({ answerRecords, wrongs, weaknesses, schedules }) {
  localStorage.setItem(ANSWER_RECORDS_KEY, JSON.stringify(mergeById(readStoredArray(ANSWER_RECORDS_KEY), answerRecords, "answer_id")));
  localStorage.setItem(WRONG_QUESTIONS_KEY, JSON.stringify(mergeById(readStoredArray(WRONG_QUESTIONS_KEY), wrongs, "wrong_id")));
  localStorage.setItem(WEAKNESSES_KEY, JSON.stringify(mergeById(readStoredArray(WEAKNESSES_KEY), weaknesses, "weakness_id")));
  localStorage.setItem(REVIEW_SCHEDULE_KEY, JSON.stringify(mergeById(readStoredArray(REVIEW_SCHEDULE_KEY), schedules, "review_id")));
}

async function main() {
  const [tasks, groups, drills] = await Promise.all([
    readJson(`${DATA_ROOT}/${DATA_FILES.tasks}`),
    readJsonl(`${DATA_ROOT}/${DATA_FILES.groups}`),
    readJsonl(`${DATA_ROOT}/${DATA_FILES.drills}`),
  ]);

  const task = pickDisplayTask(tasks);
  const groupMap = byId(groups, "group_id");
  const drillMap = byId(drills, "question_id");
  const questionMap = byId(flattenGroupQuestions(groups), "question_id");
  const group = groupMap.get(task.group_id);
  if (!isTaskRunnable(task, groupMap, drillMap)) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>這一天還不能作答</h1>
        <p>第 ${escapeHtml(task.day_number || "--")} 天已排進度，但題庫還沒補齊。請先回首頁選擇標示「可測」的天數。</p>
        <p><a class="text-link" href="../index.html">回今日任務</a></p>
      </section>
    `;
    return;
  }
  localStorage.setItem(SELECTED_TASK_KEY, task.task_id);
  const questions = makeQuestionList(task, groupMap, drillMap, questionMap);
  const basicCount = (task.basic_question_ids || []).length;
  const reviewCount = (task.review_question_ids || []).length || (task.review_due_slots || []).length;
  const groupQuestionCount = group?.questions?.length || 0;
  const flowTags = [`基礎短練 ${basicCount} 題`, `閱讀題組 ${groupQuestionCount} 題`];
  if (reviewCount) flowTags.push(`錯題複習 ${reviewCount} 題`);

  document.getElementById("practiceTitle").textContent = group?.title || task.group_id;
  document.getElementById("practiceMeta").textContent = `${task.task_date}｜${questions.length} 題｜${task.estimated_minutes} 分鐘`;
  document.getElementById("practiceDescription").innerHTML = `
    <span>今日流程：${flowTags.map(escapeHtml).join(" → ")}。</span>
    <span>短答第一版先保存答案，解析頁會顯示參考答案與評分原則。</span>
  `;
  document.getElementById("groupBadge").textContent = formatContentStatus(group?.status);
  document.getElementById("questionBadge").textContent = `${questions.length} 題`;
  document.getElementById("passageBox").textContent = group?.passage || "找不到今日題組材料。";
  const questionNav = document.getElementById("questionNav");
  if (questionNav) questionNav.innerHTML = renderQuestionNav(questions);
  document.getElementById("questionStack").innerHTML = renderQuestionStack(questions);

  const practiceForm = document.getElementById("practiceForm");
  wirePracticeTools(practiceForm, questions);

  practiceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const missing = unansweredIndexes(form, questions);
    if (missing.length) {
      const shouldSubmit = window.confirm(`還有 ${missing.length} 題未作答：第 ${missing.join("、")} 題。確定要交卷嗎？`);
      if (!shouldSubmit) return;
    }
    const submittedAt = new Date().toISOString();
    const answers = questions.map((question, index) => {
      const studentAnswer = collectAnswer(form, question);
      const score = scoreAnswer(question, studentAnswer);
      return {
        question_id: question.question_id,
        order: index + 1,
        group_id: question.group_id || null,
        source_section: question.source_section,
        question_type: question.question_type,
        knowledge_code: question.knowledge_code,
        student_answer: studentAnswer,
        correct_answer: question.answer,
        ...score,
      };
    });
    const answerRecords = buildAnswerRecords(task, questions, answers, submittedAt);
    const wrongs = buildWrongQuestions(task, questions, answerRecords);
    const weaknesses = buildWeaknesses(task, questions, wrongs);
    const schedules = buildReviewSchedule(task, questions, wrongs);

    const attempt = {
      attempt_id: `ATTEMPT_${Date.now()}`,
      task_id: task.task_id,
      task_date: task.task_date,
      subject: task.subject,
      mode: task.mode,
      group_id: task.group_id,
      group_title: group?.title || task.group_id,
      submitted_at: submittedAt,
      unanswered_count: missing.length,
      generated_records: {
        answer_records: answerRecords.length,
        wrong_questions: wrongs.length,
        weaknesses: weaknesses.length,
        review_schedule: schedules.length,
      },
      answers,
    };

    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    saveFormalRecords({ answerRecords, wrongs, weaknesses, schedules });
    window.location.href = "./review.html";
  });
}

main().catch((error) => {
  document.querySelector(".app-shell").innerHTML = `
    <section class="error-box">
      <h1>作答頁讀取失敗</h1>
      <p>${escapeHtml(error.message)}</p>
    </section>
  `;
});
