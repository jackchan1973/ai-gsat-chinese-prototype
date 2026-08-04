const DATA_ROOT = "../../data";
const WRONG_QUESTIONS_KEY = "chi_v1_wrong_questions";
const WEAKNESSES_KEY = "chi_v1_weaknesses";
const REVIEW_SCHEDULE_KEY = "chi_v1_review_schedule";

function readJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error(`讀取失敗：${path}`);
    return response.json();
  });
}

async function readJsonl(path) {
  const response = await fetch(path);
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

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storageKey(key) {
  return window.ChiAuth?.storageKey(key) || key;
}

function isLoggedIn() {
  return window.ChiAuth ? window.ChiAuth.isLoggedIn() : true;
}

function preferGeneratedData(sample, key) {
  const generated = readStoredArray(key);
  return generated.length ? generated : sample;
}

function formatAnswer(value) {
  if (Array.isArray(value)) return value.join("、") || "未作答";
  return value || "未作答";
}

function statusText(status) {
  const labels = {
    active: "加強中",
    watching: "觀察中",
    pending: "待複習",
    scheduled: "已排程",
    completed: "已完成",
  };
  return labels[status] || status || "--";
}

function strategyText(strategy) {
  const labels = {
    basic_drill: "基礎短練",
    same_knowledge_variant: "同知識點變化題",
    short_answer_retry: "短答重練",
  };
  return labels[strategy] || strategy || "--";
}

function reviewTypeText(type) {
  const labels = {
    two_day_retry: "2 天後複習",
  };
  return labels[type] || type || "--";
}

function reviewTimingText(wrong, schedule) {
  const date = schedule?.scheduled_date || wrong.review_due_date || "--";
  const type = reviewTypeText(schedule?.review_type || "two_day_retry");
  return `${type}：${date}`;
}

function knowledgeDisplayName(code, weakness) {
  const names = {
    K01: "字音字形",
    K02: "詞語語境與成語辨析",
    K03: "文言字義",
    K05: "文意推論",
    K06: "概念理解",
    K08: "跨材料比較",
    K09: "推論判斷",
    K10: "古今轉用與跨情境判斷",
    K14: "論證判斷",
    K15: "短答統整",
  };
  return weakness?.knowledge_name || names[code] || "知識點待確認";
}

function weaknessClass(weight) {
  if (weight >= 3) return "high";
  if (weight >= 2) return "mid";
  return "low";
}

function renderWrongs(wrongs, weaknessMap, scheduleMap) {
  const stack = document.getElementById("wrongStack");
  document.getElementById("wrongListStatus").textContent = `${wrongs.length} 題`;

  if (!wrongs.length) {
    stack.innerHTML = `<div class="empty-box">目前沒有錯題紀錄。</div>`;
    return;
  }

  stack.innerHTML = wrongs
    .map((wrong) => {
      const weakness = weaknessMap.get(wrong.knowledge_code);
      const schedule = scheduleMap.get(wrong.wrong_id);
      const tags = wrong.error_tags || [];
      const title = knowledgeDisplayName(wrong.knowledge_code, weakness);
      return `
        <article class="wrong-card">
          <div class="question-head">
            <span class="question-number">錯題</span>
            <span class="tag">${escapeHtml(title)}</span>
            <span class="tag">${escapeHtml(statusText(wrong.review_status))}</span>
            <span class="tag">${escapeHtml(reviewTimingText(wrong, schedule))}</span>
          </div>
          <h3>${escapeHtml(wrong.error_reason)}</h3>
          <div class="answer-grid">
            <div>
              <p class="label">作答</p>
              <strong>${escapeHtml(formatAnswer(wrong.student_answer_snapshot))}</strong>
            </div>
            <div>
              <p class="label">參考答案</p>
              <strong>${escapeHtml(formatAnswer(wrong.correct_answer_snapshot))}</strong>
            </div>
          </div>
          <div class="wrong-meta-grid">
            <div>
              <p class="label">錯題日期</p>
              <strong>${escapeHtml(wrong.wrong_date)}</strong>
            </div>
            <div>
              <p class="label">下次複習</p>
              <strong>${escapeHtml(schedule?.scheduled_date || wrong.review_due_date || "--")}</strong>
            </div>
            <div>
              <p class="label">複習方式</p>
              <strong>${escapeHtml(strategyText(schedule?.question_strategy))}</strong>
            </div>
          </div>
          ${
            tags.length
              ? `<div class="task-meta">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderWeaknesses(weaknesses) {
  const stack = document.getElementById("weaknessStack");
  document.getElementById("weaknessStatus").textContent = `${weaknesses.length} 項`;

  if (!weaknesses.length) {
    stack.innerHTML = `<div class="empty-box">目前沒有弱點資料。</div>`;
    return;
  }

  const sorted = [...weaknesses].sort((a, b) => b.review_weight - a.review_weight);
  stack.innerHTML = sorted
    .map((weakness) => {
      const weight = Number(weakness.review_weight) || 0;
      return `
        <article class="weakness-card ${weaknessClass(weight)}">
          <div class="weakness-head">
            <div>
              <p class="label">主要弱點</p>
              <h3>${escapeHtml(weakness.knowledge_name)}</h3>
            </div>
            <div class="weight-badge">
              <span>權重</span>
              <strong>${escapeHtml(weight)}</strong>
            </div>
          </div>
          <div class="weight-track" aria-hidden="true">
            <span style="width: ${Math.min(weight, 3) * 33.3333}%"></span>
          </div>
          <div class="wrong-meta-grid">
            <div>
              <p class="label">累計錯題</p>
              <strong>${escapeHtml(weakness.wrong_count_total)} 題</strong>
            </div>
            <div>
              <p class="label">本週錯題</p>
              <strong>${escapeHtml(weakness.wrong_count_week)} 題</strong>
            </div>
            <div>
              <p class="label">下次複習</p>
              <strong>${escapeHtml(weakness.next_review_date)}</strong>
            </div>
          </div>
          <div class="task-meta">
            <span class="tag">${escapeHtml(statusText(weakness.status))}</span>
            <span class="tag">最後錯題 ${escapeHtml(weakness.last_wrong_date)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSchedule(schedules, wrongMap, weaknessMap) {
  const grid = document.getElementById("scheduleGrid");
  document.getElementById("scheduleStatus").textContent = `${schedules.length} 筆`;

  if (!schedules.length) {
    grid.innerHTML = `<div class="empty-box">目前沒有排程。</div>`;
    return;
  }

  grid.innerHTML = schedules
    .map((schedule) => {
      const wrong = wrongMap.get(schedule.source_wrong_id);
      const weakness = weaknessMap.get(schedule.knowledge_code);
      return `
        <article class="schedule-card">
          <p class="label">${escapeHtml(reviewTypeText(schedule.review_type))}</p>
          <h3>${escapeHtml(schedule.scheduled_date)}</h3>
          <p>${escapeHtml(knowledgeDisplayName(schedule.knowledge_code, weakness))}</p>
          <div class="task-meta">
            <span class="tag">${escapeHtml(strategyText(schedule.question_strategy))}</span>
            <span class="tag">${escapeHtml(statusText(schedule.status))}</span>
          </div>
          ${wrong ? `<p class="muted-text">${escapeHtml(wrong.error_reason)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

async function main() {
  if (!isLoggedIn()) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>請先登入</h1>
        <p>回首頁使用座號或導師帳號登入後，再查看錯題。</p>
        <p><a class="text-link" href="../index.html">回首頁登入</a></p>
      </section>
    `;
    return;
  }

  const [sampleWrongs, sampleWeaknesses, sampleSchedules] = await Promise.all([
    readJsonl(`${DATA_ROOT}/wrong_questions.sample.jsonl`),
    readJson(`${DATA_ROOT}/weaknesses.sample.json`),
    readJson(`${DATA_ROOT}/review_schedule.sample.json`),
  ]);
  const wrongs = preferGeneratedData(sampleWrongs, WRONG_QUESTIONS_KEY);
  const weaknesses = preferGeneratedData(sampleWeaknesses, WEAKNESSES_KEY);
  const schedules = preferGeneratedData(sampleSchedules, REVIEW_SCHEDULE_KEY);
  const hasGeneratedData =
    readStoredArray(WRONG_QUESTIONS_KEY).length ||
    readStoredArray(WEAKNESSES_KEY).length ||
    readStoredArray(REVIEW_SCHEDULE_KEY).length;
  const dataSource = hasGeneratedData ? "最新作答" : "範例資料";

  const weaknessMap = byId(weaknesses, "knowledge_code");
  const wrongMap = byId(wrongs, "wrong_id");
  const scheduleMap = byId(schedules, "source_wrong_id");
  const activeWeaknesses = weaknesses.filter((item) => item.status === "active").length;

  document.getElementById("wrongsStatus").textContent = "已讀取";
  document.getElementById("wrongsMeta").textContent = `${dataSource}｜目前 ${activeWeaknesses} 項需要加強，錯題會排在答錯後 2 天回來複習。`;
  document.getElementById("wrongTotal").textContent = wrongs.length;
  document.getElementById("weaknessTotal").textContent = weaknesses.length;
  document.getElementById("scheduleTotal").textContent = schedules.filter((item) => item.status === "scheduled").length;

  renderWrongs(wrongs, weaknessMap, scheduleMap);
  renderWeaknesses(weaknesses);
  renderSchedule(schedules, wrongMap, weaknessMap);
}

main().catch((error) => {
  document.querySelector(".app-shell").innerHTML = `
    <section class="error-box">
      <h1>錯題 / 弱點頁讀取失敗</h1>
      <p>${escapeHtml(error.message)}</p>
      <p>請用本機伺服器開啟此原型頁面。</p>
    </section>
  `;
});
