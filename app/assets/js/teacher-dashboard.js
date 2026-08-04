const ATTEMPT_KEY = "chi_v1_last_attempt";
const ANSWER_RECORDS_KEY = "chi_v1_answer_records";
const WRONG_QUESTIONS_KEY = "chi_v1_wrong_questions";
const LAST_LOGIN_KEY = "chi_v1_last_login";

let studentRows = [];
let activeFilter = "all";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readJsonValue(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readArrayForStudent(student, baseKey) {
  const key = window.ChiAuth.storageKeyForUser(baseKey, student);
  const parsed = readJsonValue(key, []);
  return Array.isArray(parsed) ? parsed : [];
}

function readAttemptForStudent(student) {
  return readJsonValue(window.ChiAuth.storageKeyForUser(ATTEMPT_KEY, student), null);
}

function formatDateTime(value) {
  if (!value) return "尚未登入";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間格式待確認";
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function answerRate(records) {
  const autoScored = records.filter((record) => record.ai_scoring_required !== true && record.is_correct !== null);
  if (!autoScored.length) return null;
  const correct = autoScored.filter((record) => record.is_correct === true).length;
  return Math.round((correct / autoScored.length) * 100);
}

function buildStudentRows() {
  return window.ChiAuth.students.map((student) => {
    const attempt = readAttemptForStudent(student);
    const answerRecords = readArrayForStudent(student, ANSWER_RECORDS_KEY);
    const wrongs = readArrayForStudent(student, WRONG_QUESTIONS_KEY);
    const rate = answerRate(answerRecords);
    const lastLogin = localStorage.getItem(window.ChiAuth.storageKeyForUser(LAST_LOGIN_KEY, student));
    const completed = Boolean(attempt?.submitted_at || answerRecords.length);
    const logged = Boolean(lastLogin);
    const attention = !logged || !completed || (rate !== null && rate < 60) || wrongs.length >= 3;

    return {
      ...student,
      logged,
      completed,
      attention,
      taskLabel: attempt?.task_date ? `${attempt.task_date}｜${attempt.task_id || "最新任務"}` : "尚無作答",
      rate,
      wrongCount: wrongs.length,
      answerCount: answerRecords.length,
      lastLogin,
    };
  });
}

function renderSummary(rows) {
  const logged = rows.filter((row) => row.logged).length;
  const completed = rows.filter((row) => row.completed).length;
  const rates = rows.map((row) => row.rate).filter((rate) => rate !== null);
  const average = rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : null;
  const attention = rows.filter((row) => row.attention).length;

  document.getElementById("loggedInCount").textContent = `${logged}`;
  document.getElementById("completedCount").textContent = `${completed}`;
  document.getElementById("averageRate").textContent = average === null ? "--" : `${average}%`;
  document.getElementById("attentionCount").textContent = `${attention}`;
}

function statusBadge(row) {
  if (row.completed) return `<span class="teacher-status done">已完成</span>`;
  if (row.logged) return `<span class="teacher-status active">已登入</span>`;
  return `<span class="teacher-status idle">未登入</span>`;
}

function rowMatchesFilter(row) {
  if (activeFilter === "logged") return row.logged;
  if (activeFilter === "completed") return row.completed;
  if (activeFilter === "attention") return row.attention;
  return true;
}

function renderRows() {
  const searchValue = document.getElementById("studentSearch").value.trim().toLowerCase();
  const visibleRows = studentRows.filter((row) => {
    const text = `${row.seat_no} ${row.name}`.toLowerCase();
    return rowMatchesFilter(row) && (!searchValue || text.includes(searchValue));
  });

  document.getElementById("visibleCount").textContent = `${visibleRows.length} 位`;
  document.getElementById("studentTableBody").innerHTML = visibleRows.length
    ? visibleRows
        .map(
          (row) => `
            <tr class="${row.attention ? "needs-attention" : ""}">
              <td><strong>${escapeHtml(row.seat_no)}</strong></td>
              <td>${escapeHtml(row.name)}</td>
              <td>${statusBadge(row)}</td>
              <td>${escapeHtml(row.taskLabel)}</td>
              <td>${row.rate === null ? "--" : `${escapeHtml(row.rate)}%`}<small>${row.answerCount ? `｜${escapeHtml(row.answerCount)}題` : ""}</small></td>
              <td>${escapeHtml(row.wrongCount)}</td>
              <td>${escapeHtml(formatDateTime(row.lastLogin))}</td>
              <td><code>${escapeHtml(row.seat_no)} / ${escapeHtml(row.password)}</code></td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="8"><div class="empty-box">沒有符合條件的學生。</div></td></tr>`;
}

function wireFilters() {
  document.querySelectorAll(".teacher-filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      document.querySelectorAll(".teacher-filter").forEach((item) => item.classList.toggle("active", item === button));
      renderRows();
    });
  });

  document.getElementById("studentSearch").addEventListener("input", renderRows);
}

function requireTeacher() {
  if (!window.ChiAuth?.isLoggedIn()) return false;
  return window.ChiAuth.getCurrentUser()?.role === "teacher";
}

function renderAccessDenied() {
  document.querySelector(".app-shell").innerHTML = `
    <section class="error-box">
      <h1>請使用導師帳號登入</h1>
      <p>此頁只開放導師模式查看。請回首頁使用 admin / admin 登入。</p>
      <p><a class="text-link" href="../index.html">回首頁登入</a></p>
    </section>
  `;
}

function main() {
  if (!requireTeacher()) {
    renderAccessDenied();
    return;
  }

  document.getElementById("teacherIdentity").textContent = window.ChiAuth.displayName();
  studentRows = buildStudentRows();
  renderSummary(studentRows);
  wireFilters();
  renderRows();
}

main();
