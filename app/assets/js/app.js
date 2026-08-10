const DATA_ROOT = "../data";
const DATA_VERSION = "20260810-system01";
const DATA_FILES = {
  tasks: "daily_tasks.30_days.json",
  groups: "question_groups.jsonl",
  drills: "basic_drills.jsonl",
  wrongs: "wrong_questions.sample.jsonl",
  reviewSchedules: "review_schedule.sample.json",
  parentReport: "parent_weekly_report.sample.json",
  systemPlan: "gsat_review_system_v0_1.json",
};
const SELECTED_TASK_KEY = "chi_v1_selected_task_id";
const AUTH_KEY = "chi_v1_authenticated";
const ATTEMPT_KEY = "chi_v1_last_attempt";
const LOGIN_ACCOUNT = "admin";
const LOGIN_PASSWORD = "admin";

const statusLabel = {
  planned: "已規劃",
  not_started: "未開始",
  in_progress: "作答中",
  completed: "已完成",
  partial: "部分完成",
  missed: "未完成",
};

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

const strategyLabels = {
  basic_drill: "基礎短練",
  same_knowledge_variant: "同知識點變化題",
  short_answer_retry: "短答重練",
};

const taskTypeLabels = {
  daily_short_review: "每日闖關",
  daily_short_review_with_review: "每日闖關＋復活關",
};

const contentStatusLabels = {
  draft_for_preview: "候選題",
  revised_after_feedback: "已修訂候選題",
  validated_by_student: "學生已試做",
  rule_checked: "規則已檢查",
  approved_for_app: "正式題",
};

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

function byId(items, key) {
  return new Map(items.map((item) => [item[key], item]));
}

function countGroupQuestions(group) {
  return Array.isArray(group?.questions) ? group.questions.length : 0;
}

function storageKey(key) {
  return window.ChiAuth?.storageKey(key) || key;
}

function pickDisplayTask(tasks) {
  const selectedTaskId = localStorage.getItem(storageKey(SELECTED_TASK_KEY));
  return tasks.find((task) => task.task_id === selectedTaskId) || tasks.find((task) => isApprovedTaskStatus(task.app_readiness)) || tasks[0];
}

function formatStatus(status) {
  return statusLabel[status] || status || "--";
}

function formatKnowledge(code) {
  return knowledgeLabels[code] || "知識點待確認";
}

function formatStrategy(strategy) {
  return strategyLabels[strategy] || "同知識點複習";
}

function formatTaskType(type) {
  return taskTypeLabels[type] || "每日闖關";
}

function formatContentStatus(status) {
  return contentStatusLabels[status] || "候選題";
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createTaskItem(title, body, tags = []) {
  const node = document.createElement("article");
  node.className = "task-item";
  const tagHtml = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  node.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(body)}</p>
    ${tags.length ? `<div class="task-meta">${tagHtml}</div>` : ""}
  `;
  return node;
}

function renderBasics(task, drillMap) {
  const summary = document.getElementById("basicSummary");
  if (!summary) return;
  const ids = task.basic_question_ids || [];
  setText("basicCount", `${ids.length} 題`);
  setText("basicStepText", `${ids.length} 題暖身，先把基本分拿穩。`);
  const knowledgeNames = ids
    .map((id) => drillMap.get(id))
    .filter(Boolean)
    .map((drill) => formatKnowledge(drill.knowledge_code));
  const uniqueNames = [...new Set(knowledgeNames)];

  summary.innerHTML = `
    <h2>第 1 關｜基礎暖身</h2>
    <p>先做 ${escapeHtml(ids.length)} 題短練，拿穩基本分再進主線挑戰。</p>
    <div class="task-meta">
      ${["基礎短練", ...uniqueNames].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderGroup(task, groupMap) {
  const group = groupMap.get(task.group_id);
  const summary = document.getElementById("groupSummary");
  if (!summary) return;
  if (!group) {
    setText("groupStatus", "待檢查");
    summary.innerHTML = `<div class="error-box">今天的閱讀題組暫時讀取不到。</div>`;
    return;
  }

  const questionCount = countGroupQuestions(group);
  setText("groupStatus", formatContentStatus(group.status));
  setText("groupStepText", `${questionCount} 題閱讀挑戰，回到文本找答案依據。`);
  summary.innerHTML = `
    <h2>第 2 關｜閱讀挑戰</h2>
    <h3 class="group-title">${escapeHtml(group.title)}</h3>
    <p>第 2 段進入 ${escapeHtml(group.material_type || "學測型閱讀題組")}，共 ${questionCount} 題。材料與題目會在作答頁分區顯示。</p>
    <div class="task-meta">
      ${(group.knowledge_codes || []).map((code) => `<span class="tag">${escapeHtml(formatKnowledge(code))}</span>`).join("")}
    </div>
  `;
}

function renderReviews(task, wrongMap, reviewSchedules) {
  const summary = document.getElementById("reviewSummary");
  if (!summary) return;
  const ids = task.review_question_ids || [];
  const dueSlots = task.review_due_slots || [];
  const scheduled = reviewSchedules.filter((item) => ids.includes(item.assigned_question_id));
  const scheduleMap = byId(scheduled, "assigned_question_id");
  setText("reviewStatus", ids.length || dueSlots.length ? "待挑戰" : "今日無");
  const reviewAmount = ids.length || dueSlots.length;
  setText("reviewStepText", reviewAmount ? `${reviewAmount} 題復活挑戰，完成後修復弱點。` : "今天沒有復活關，保持一般節奏。");

  if (!ids.length && !dueSlots.length) {
    summary.innerHTML = `
      <h2>第 3 關｜復活關</h2>
      <p>今天沒有復活關，完成前兩關即可通關。</p>
      <div class="task-meta"><span class="tag">今日無</span></div>
    `;
    return;
  }

  if (!ids.length && dueSlots.length) {
    summary.innerHTML = `
      <h2>第 3 關｜復活關</h2>
      <p>這一天有 ${escapeHtml(dueSlots.length)} 個復活關位置；實際題目會依前 2 天答錯內容安排。</p>
      <div class="task-meta">
        <span class="tag">2 天後複習</span>
        <span class="tag">弱點修復</span>
      </div>
    `;
    return;
  }

  const reviewTags = ids
    .map((id) => scheduleMap.get(id))
    .filter(Boolean)
    .map((item) => formatKnowledge(item.knowledge_code));
  const uniqueTags = [...new Set(reviewTags)];
  summary.innerHTML = `
    <h2>第 3 關｜復活關</h2>
    <p>排入 ${escapeHtml(ids.length)} 題復活挑戰，來源是前次錯題 2 天後回流。</p>
    <div class="task-meta">
      ${["2 天後複習", ...uniqueTags].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderFlowSummary(task, groupQuestionCount) {
  const basicCount = (task.basic_question_ids || []).length;
  const reviewCount = (task.review_question_ids || []).length || (task.review_due_slots || []).length;
  const reviewText = reviewCount ? ` → 復活關 ${reviewCount} 題` : "";
  return `今日三關：基礎暖身 ${basicCount} 題 → 閱讀挑戰 ${groupQuestionCount} 題${reviewText}`;
}

function isTaskRunnable(task, groupMap, drillMap) {
  const hasGroup = groupMap.has(task.group_id);
  const hasAllBasics = (task.basic_question_ids || []).every((id) => drillMap.has(id));
  return isApprovedTaskStatus(task.app_readiness) && hasGroup && hasAllBasics;
}

function isApprovedTaskStatus(status) {
  return status === "approved_for_app" || status === "can_run_as_candidate";
}

function readinessText(task, runnable) {
  if (runnable) return "今日關卡已開放。";
  if (task.app_readiness === "needs_bank_items_before_app_use") return "這一關還在準備中。";
  return "這一關還需要檢查後才會開放。";
}

function readStoredAttempt() {
  try {
    return JSON.parse(localStorage.getItem(storageKey(ATTEMPT_KEY)) || "null");
  } catch {
    return null;
  }
}

function renderCurrentUser() {
  setText("userIdentity", window.ChiAuth?.displayName() || "尚未登入");
}

function missionMessage(task, group, reviewCount, completed) {
  if (completed) return "今日關卡已通關，可以查看結算或繼續修復弱點。";
  if (reviewCount) return "今天有復活關，完成後把弱點補回來。";
  if ((task.basic_question_ids || []).length) return "先完成基礎暖身，再進入閱讀挑戰。";
  return `今天主線是「${group?.title || "閱讀理解"}」，抓準題幹再作答。`;
}

function renderMissionProgress(task, group, reviewCount) {
  const attempt = readStoredAttempt();
  const completed = attempt?.task_id === task.task_id;
  const doneCount = completed ? 3 : 0;
  const percent = Math.round((doneCount / 3) * 100);

  setText("missionProgressText", `${doneCount} / 3 關`);
  setText("missionProgressLabel", completed ? "已通關" : "未開始");
  setText("studentMessage", missionMessage(task, group, reviewCount, completed));

  const fill = document.getElementById("missionProgressFill");
  if (fill) fill.style.width = `${percent}%`;

  ["basicStep", "groupStep", "reviewStep"].forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.classList.toggle("complete", completed);
    node.classList.toggle("current", !completed && id === "basicStep");
  });
}

function setActiveDayButton(selectedTaskId) {
  document.querySelectorAll(".day-button").forEach((button) => {
    const active = button.dataset.taskId === selectedTaskId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderTaskSelector(tasks, selectedTask, groupMap, drillMap, onChange) {
  const selector = document.getElementById("taskSelector");
  if (!selector) return;
  const taskByDay = new Map(tasks.map((task) => [Number(task.day_number), task]));
  selector.innerHTML = Array.from({ length: 31 }, (_, index) => {
    const dayNumber = index + 1;
    const task = taskByDay.get(dayNumber);
    if (!task) {
      return `
        <button class="day-button empty" type="button" disabled role="listitem" aria-label="${dayNumber} 號尚未開放">
          <strong>${dayNumber}號</strong>
          <span>待開放</span>
        </button>
      `;
    }
      const runnable = isTaskRunnable(task, groupMap, drillMap);
      const suffix = runnable ? "開放" : "準備中";
      return `
        <button class="day-button${runnable ? "" : " pending"}" type="button" role="listitem" data-task-id="${escapeHtml(task.task_id)}" aria-pressed="false">
          <strong>${escapeHtml(dayNumber)}號</strong>
          <span>${escapeHtml(suffix)}</span>
        </button>
      `;
    })
    .join("");
  selector.addEventListener("click", (event) => {
    const button = event.target.closest(".day-button[data-task-id]");
    if (!button) return;
    setActiveDayButton(button.dataset.taskId);
    onChange(button.dataset.taskId);
  });
  setActiveDayButton(selectedTask.task_id);
}

function renderTask(data, selectedTaskId) {
  const { tasks, groups, drills, wrongs, reviewSchedules, report, systemPlan } = data;
  const groupMap = byId(groups, "group_id");
  const drillMap = byId(drills, "question_id");
  const wrongMap = byId(wrongs, "wrong_id");
  const task = tasks.find((item) => item.task_id === selectedTaskId) || pickDisplayTask(tasks);
  const group = groupMap.get(task.group_id);
  const runnable = isTaskRunnable(task, groupMap, drillMap);
  const reviewCount = (task.review_question_ids || []).length || (task.review_due_slots || []).length;
  const totalQuestionCount = (task.basic_question_ids || []).length + countGroupQuestions(group) + (task.review_question_ids || []).length;

  localStorage.setItem(storageKey(SELECTED_TASK_KEY), task.task_id);

  setText("taskDate", `第 ${task.day_number} 天｜${task.task_date}`);
  setText("taskTitle", "今日國文三關");
  setText("taskMeta", `主線材料：${group?.title || task.group_id}｜${renderFlowSummary(task, countGroupQuestions(group))}`);
  setText("estimatedMinutes", task.estimated_minutes);
  setText("questionCount", totalQuestionCount);
  setText("reviewCount", reviewCount);
  setText("taskStatus", runnable ? "可闖關" : "準備中");
  setText("taskReadiness", readinessText(task, runnable));
  renderMissionProgress(task, group, reviewCount);
  setActiveDayButton(task.task_id);

  const statusNode = document.getElementById("taskStatus");
  statusNode?.classList.toggle("completed", readStoredAttempt()?.task_id === task.task_id);
  statusNode?.classList.toggle("not-started", runnable && readStoredAttempt()?.task_id !== task.task_id);
  statusNode?.classList.toggle("blocked", !runnable);

  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.disabled = !runnable;
    startButton.textContent = runnable ? "開始今日闖關" : "這一關尚未開放";
  }

  renderBasics(task, drillMap);
  renderGroup(task, groupMap);
  renderReviews(task, wrongMap, reviewSchedules);
  renderWeekSummary(report);
  renderSystemPlan(systemPlan);
}

function renderWeekSummary(report) {
  const node = document.getElementById("weekSummary");
  if (!node) return;
  node.innerHTML = `
    <h2>本週闖關情報</h2>
    <p>${escapeHtml(report.parent_message).replaceAll("任務", "關卡").replaceAll("練習", "闖關")}</p>
    <div class="task-meta">
      <span class="tag">通關 ${escapeHtml(report.completed_days)} 天</span>
      <span class="tag">星等表現 ${escapeHtml(Math.round(report.correct_rate * 100))}%</span>
      <span class="tag">${escapeHtml(report.weakness_summary)}</span>
    </div>
  `;
}

function renderSystemPlan(systemPlan) {
  const status = document.getElementById("systemPlanStatus");
  const weekGrid = document.getElementById("systemWeekGrid");
  const subjectGrid = document.getElementById("systemSubjectGrid");
  if (!status || !weekGrid || !subjectGrid || !systemPlan) return;

  status.textContent = systemPlan.meta?.time_control?.weekday_target_minutes
    ? `平日 ${systemPlan.meta.time_control.weekday_target_minutes} 分鐘`
    : "已建立";

  weekGrid.innerHTML = (systemPlan.weekly_plan || [])
    .map(
      (day) => `
        <article class="system-day-card${day.weekday === "Fri" ? " catchup" : ""}">
          <div>
            <strong>${escapeHtml(day.label)}</strong>
            <span>${escapeHtml(day.target_minutes)} 分</span>
          </div>
          <p>${escapeHtml(day.student_view)}</p>
          <small>${escapeHtml(day.rule)}</small>
        </article>
      `,
    )
    .join("");

  subjectGrid.innerHTML = (systemPlan.subject_maps || [])
    .map(
      (subject) => `
        <article class="system-subject-card">
          <div>
            <strong>${escapeHtml(subject.subject)}</strong>
            <span>${escapeHtml(subject.current_formal_count)} 題</span>
          </div>
          <p>${escapeHtml(subject.coverage_status)}</p>
          <div class="task-meta">
            ${(subject.weekly_days || []).map((day) => `<span class="tag">${escapeHtml(day)}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderDataStatus(data) {
  setText("dataStatus", "正常");
  const grid = document.getElementById("dataGrid");
  const groupQuestionCount = data.groups.reduce((sum, group) => sum + countGroupQuestions(group), 0);
  const cards = [
    ["閱讀題組", data.groups.length, "候選題庫"],
    ["題組題目", groupQuestionCount, "閱讀理解"],
    ["基礎短練", data.drills.length, "高中程度"],
    ["復活關排程", data.reviewSchedules.length, "2 天後修復"],
  ];
  grid.innerHTML = cards
    .map(
      ([label, value, detail]) => `
        <article class="data-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(detail)}</span>
        </article>
      `,
    )
    .join("");
}

function wireButtons(data) {
  document.getElementById("startButton")?.addEventListener("click", () => {
    window.location.href = "./pages/practice.html";
  });
  document.getElementById("reviewButton")?.addEventListener("click", () => {
    window.location.href = "./pages/wrongs.html";
  });
  ["chineseFocusButton", "chineseCardButton"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", () => {
      document.getElementById("chineseTaskPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  const groupMap = byId(data.groups, "group_id");
  const drillMap = byId(data.drills, "question_id");
  renderTaskSelector(data.tasks, pickDisplayTask(data.tasks), groupMap, drillMap, (taskId) => renderTask(data, taskId));
}

function isLoggedIn() {
  if (window.ChiAuth) return window.ChiAuth.isLoggedIn();
  return localStorage.getItem(AUTH_KEY) === "yes";
}

function showDashboard() {
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("dashboard").hidden = false;
  window.scrollTo({ top: 0, left: 0 });
  renderCurrentUser();
}

function showLogin() {
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("dashboard").hidden = true;
}

function portalCopy(portal) {
  const copy = {
    student: {
      title: "學生登入",
      hint: "用座號與個人密碼進入闖關地圖。",
      accountLabel: "學生座號",
      accountValue: "01",
      accountPlaceholder: "例如 01",
      passwordValue: "100501",
      button: "進入闖關地圖",
    },
    parent: {
      title: "家長登入",
      hint: "帳號密碼同學生，用來查看孩子週報。",
      accountLabel: "孩子座號",
      accountValue: "01",
      accountPlaceholder: "例如 01",
      passwordValue: "100501",
      button: "查看家長週報",
    },
    teacher: {
      title: "導師登入",
      hint: "導師帳號 admin / admin，登入後直接進班級後台。",
      accountLabel: "導師帳號",
      accountValue: "admin",
      accountPlaceholder: "admin",
      passwordValue: "admin",
      button: "進入導師後台",
    },
  };
  return copy[portal] || copy.student;
}

function setPortal(portal) {
  const selected = portalCopy(portal);
  document.getElementById("portalInput").value = portal;
  setText("loginTitle", selected.title);
  setText("loginHint", selected.hint);
  setText("accountLabel", selected.accountLabel);
  setText("loginSubmitButton", selected.button);
  const accountInput = document.getElementById("accountInput");
  const passwordInput = document.getElementById("passwordInput");
  accountInput.value = selected.accountValue;
  accountInput.placeholder = selected.accountPlaceholder;
  passwordInput.value = selected.passwordValue;
  document.querySelectorAll(".portal-option").forEach((button) => {
    const active = button.dataset.portal === portal;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.getElementById("loginError").textContent = "";
}

function routeUser(user) {
  if (user?.role === "teacher") {
    window.location.href = "./pages/teacher-dashboard.html";
    return true;
  }
  if (user?.role === "parent") {
    window.location.href = "./pages/parent-report.html";
    return true;
  }
  return false;
}

function wireLogin() {
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  document.querySelectorAll(".portal-option").forEach((button) => {
    button.addEventListener("click", () => setPortal(button.dataset.portal || "student"));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const portal = form.elements.portal.value || "student";
    const account = form.elements.account.value.trim();
    const password = form.elements.password.value;
    const user = window.ChiAuth ? window.ChiAuth.login(account, password, portal) : null;
    if (!user && (window.ChiAuth || account !== LOGIN_ACCOUNT || password !== LOGIN_PASSWORD)) {
      error.textContent = "帳戶或密碼不正確。";
      return;
    }
    if (!user) localStorage.setItem(AUTH_KEY, "yes");
    error.textContent = "";
    if (routeUser(user)) return;
    showDashboard();
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    if (window.ChiAuth) window.ChiAuth.logout();
    else localStorage.removeItem(AUTH_KEY);
    showLogin();
  });
}

async function main() {
  try {
    wireLogin();
    if (isLoggedIn()) {
      const user = window.ChiAuth?.getCurrentUser();
      if (routeUser(user)) return;
      showDashboard();
    } else {
      showLogin();
      setPortal("student");
    }

    const [tasks, groups, drills, wrongs, reviewSchedules, report, systemPlan] = await Promise.all([
      readJson(`${DATA_ROOT}/${DATA_FILES.tasks}`),
      readJsonl(`${DATA_ROOT}/${DATA_FILES.groups}`),
      readJsonl(`${DATA_ROOT}/${DATA_FILES.drills}`),
      readJsonl(`${DATA_ROOT}/${DATA_FILES.wrongs}`),
      readJson(`${DATA_ROOT}/${DATA_FILES.reviewSchedules}`),
      readJson(`${DATA_ROOT}/${DATA_FILES.parentReport}`),
      readJson(`${DATA_ROOT}/${DATA_FILES.systemPlan}`),
    ]);

    const data = { tasks, groups, drills, wrongs, reviewSchedules, report, systemPlan };
    wireButtons(data);
    renderTask(data, pickDisplayTask(tasks).task_id);
  } catch (error) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>資料讀取失敗</h1>
        <p>${error.message}</p>
        <p>請用本機伺服器開啟此原型頁面。</p>
      </section>
    `;
  }
}

main();
