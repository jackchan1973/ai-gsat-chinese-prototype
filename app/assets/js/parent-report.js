const DATA_ROOT = "../../data";
const ANSWER_RECORDS_KEY = "chi_v1_answer_records";
const WRONG_QUESTIONS_KEY = "chi_v1_wrong_questions";
const WEAKNESSES_KEY = "chi_v1_weaknesses";
const REVIEW_SCHEDULE_KEY = "chi_v1_review_schedule";
const ATTEMPT_KEY = "chi_v1_last_attempt";
const LOCAL_PROGRESS_KEYS = [ATTEMPT_KEY, ANSWER_RECORDS_KEY, WRONG_QUESTIONS_KEY, WEAKNESSES_KEY, REVIEW_SCHEDULE_KEY];

function readJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error(`讀取失敗：${path}`);
    return response.json();
  });
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

function formatDateRange(start, end) {
  return `${start} - ${end}`;
}

function percent(value) {
  return Math.round(Number(value || 0) * 100);
}

function formatPercent(value) {
  return `${percent(value)}%`;
}

function statusText(status) {
  const labels = {
    active: "加強中",
    watching: "觀察中",
    scheduled: "已排程",
    completed: "已完成",
    pending: "待複習",
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

function latestDateFromRecords(records) {
  const latest = [...records]
    .map((record) => record.answered_at || record.wrong_date || record.scheduled_date || "")
    .filter(Boolean)
    .sort()
    .at(-1);
  return latest ? latest.slice(0, 10) : new Date().toISOString().slice(0, 10);
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
  return names[code] || weakness?.knowledge_name || code;
}

function topWeaknessNames(weaknesses, limit = 3) {
  return [...weaknesses]
    .sort((a, b) => (Number(b.review_weight) || 0) - (Number(a.review_weight) || 0))
    .slice(0, limit)
    .map((item) => knowledgeDisplayName(item.knowledge_code, item))
    .filter(Boolean);
}

function buildReportFromStoredData(answerRecords, wrongs, weaknesses, schedules) {
  const reportDate = wrongs.length ? latestDateFromRecords(wrongs) : latestDateFromRecords(answerRecords);
  const autoScored = answerRecords.filter((record) => record.ai_scoring_required !== true && record.is_correct !== null);
  const correctCount = autoScored.filter((record) => record.is_correct === true).length;
  const correctRate = autoScored.length ? correctCount / autoScored.length : 0;
  const weaknessCodes = [...weaknesses]
    .sort((a, b) => (Number(b.review_weight) || 0) - (Number(a.review_weight) || 0))
    .map((item) => item.knowledge_code)
    .filter(Boolean);
  const weaknessNames = topWeaknessNames(weaknesses);
  const firstScheduledDate = schedules.map((item) => item.scheduled_date).filter(Boolean).sort()[0];
  const weaknessSummary = weaknessNames.length ? `${weaknessNames.join("、")}需要加強。` : "本次沒有明顯弱點。";
  const reviewSummary = wrongs.length
    ? `${reportDate} 產生 ${wrongs.length} 題錯題，已排入 ${firstScheduledDate || "後續"} 複習。`
    : "本次沒有產生錯題。";
  const nextPlan = weaknessNames.length
    ? `下次練習提高 ${weaknessNames.join("、")} 題目比例，並維持 20-30 分鐘練習量。`
    : "下次維持目前練習節奏，保留基礎短練與題組閱讀。";

  return {
    report_id: `REPORT_LOCAL_${reportDate.replaceAll("-", "")}`,
    student_id: answerRecords[0]?.student_id || "student_001",
    subject: "國文",
    mode: "學測模式",
    week_start: reportDate,
    week_end: reportDate,
    completed_days: 1,
    missed_days: 0,
    total_questions: answerRecords.length,
    correct_rate: correctRate,
    main_weaknesses: weaknessCodes,
    weakness_summary: weaknessSummary,
    review_done_summary: reviewSummary,
    next_week_plan: nextPlan,
    parent_message: `本次國文練習完成 ${answerRecords.length} 題，選擇題答對率 ${formatPercent(correctRate)}。${weaknessSummary}${reviewSummary}`,
    data_source: "generated",
  };
}

function buildStoredReportPayload(sampleReport, sampleWeaknesses, sampleSchedules) {
  const answerRecords = readStoredArray(ANSWER_RECORDS_KEY);
  if (!answerRecords.length) {
    return {
      report: { ...sampleReport, data_source: "sample" },
      weaknesses: sampleWeaknesses,
      schedules: sampleSchedules,
      dataSourceLabel: "範例資料",
    };
  }

  const wrongs = readStoredArray(WRONG_QUESTIONS_KEY);
  const weaknesses = readStoredArray(WEAKNESSES_KEY);
  const schedules = readStoredArray(REVIEW_SCHEDULE_KEY);
  return {
    report: buildReportFromStoredData(answerRecords, wrongs, weaknesses, schedules),
    weaknesses,
    schedules,
    dataSourceLabel: "最新作答",
  };
}

function wireClearProgressButton() {
  const button = document.getElementById("clearProgressButton");
  if (!button) return;
  button.addEventListener("click", () => {
    const confirmed = window.confirm("要清除這台瀏覽器目前保存的作答、錯題、弱點與複習排程嗎？");
    if (!confirmed) return;
    LOCAL_PROGRESS_KEYS.forEach((key) => localStorage.removeItem(storageKey(key)));
    window.location.reload();
  });
}

function renderPerformance(report) {
  const grid = document.getElementById("performanceGrid");
  const missedDays = Number(report.missed_days) || 0;
  const completedDays = Number(report.completed_days) || 0;
  const expectedDays = completedDays + missedDays;
  const statisticNote = report.data_source === "generated" ? "最新作答統計" : "原型資料統計";
  const cards = [
    ["應完成天數", `${expectedDays} 天`, "依本週任務計算"],
    ["實際完成天數", `${completedDays} 天`, missedDays ? `未完成 ${missedDays} 天` : "本週無缺漏"],
    ["總作答題數", `${report.total_questions} 題`, "含基礎短練與題組"],
    ["整體答對率", `${percent(report.correct_rate)}%`, statisticNote],
  ];

  grid.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="report-info-card">
          <p class="label">${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `,
    )
    .join("");
}

function renderWeaknesses(report, weaknessMap) {
  const stack = document.getElementById("parentWeaknessStack");
  const weaknessIds = report.main_weaknesses || [];
  document.getElementById("weaknessCount").textContent = `${weaknessIds.length} 項`;

  if (!weaknessIds.length) {
    stack.innerHTML = `<div class="empty-box">本週沒有主要弱點。</div>`;
    return;
  }

  stack.innerHTML = weaknessIds
    .map((code) => {
      const weakness = weaknessMap.get(code);
      return `
        <article class="parent-weakness-card">
          <div>
            <p class="label">主要弱點</p>
            <h3>${escapeHtml(knowledgeDisplayName(code, weakness))}</h3>
          </div>
          <p>${escapeHtml(parentWeaknessNote(code, weakness))}</p>
          <div class="task-meta">
            <span class="tag">本週錯 ${escapeHtml(weakness?.wrong_count_week ?? "--")} 題</span>
            <span class="tag">權重 ${escapeHtml(weakness?.review_weight ?? "--")}</span>
            <span class="tag">${escapeHtml(statusText(weakness?.status))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function parentWeaknessNote(code, weakness) {
  const notes = {
    K02: "詞語語境與成語辨析要看句中語氣、對象與前後文限制。",
    K03: "文言字詞容易用現代語感理解，需要保留每日暖身題。",
    K05: "文意推論要留意限定語，避免把文本沒有說的內容推太遠。",
    K06: "概念理解需要先抓定義，再回到材料找依據。",
    K08: "跨材料比較要先分清各材料判準，再判斷相同與差異。",
    K09: "推論判斷要避免把文本觀點絕對化。",
    K10: "遇到跨材料或情境轉換時，容易少比較一個角度。",
    K14: "論證判斷要注意證據、因果與結論是否真的能接上。",
    K15: "短答能抓到部分意思，但回答常少理由或統整不完整。",
  };
  return notes[code] || `${weakness?.knowledge_name || code} 需要持續觀察。`;
}

function renderReviewPlan(report, schedules, weaknessMap) {
  const stack = document.getElementById("parentReviewStack");
  document.getElementById("reviewPlanCount").textContent = `${schedules.length} 筆`;

  if (!schedules.length) {
    stack.innerHTML = `<div class="empty-box">本週沒有錯題複習排程。</div>`;
    return;
  }

  stack.innerHTML = `
    <p class="muted-text">${escapeHtml(report.review_done_summary)}</p>
    ${schedules
      .map((item) => {
        const weakness = weaknessMap.get(item.knowledge_code);
        return `
          <article class="parent-review-card">
            <div>
              <p class="label">${escapeHtml(item.scheduled_date)}</p>
              <h3>${escapeHtml(knowledgeDisplayName(item.knowledge_code, weakness))}</h3>
            </div>
            <div class="task-meta">
              <span class="tag">${escapeHtml(strategyText(item.question_strategy))}</span>
              <span class="tag">${escapeHtml(statusText(item.status))}</span>
            </div>
          </article>
        `;
      })
      .join("")}
  `;
}

function renderNextPlan(report) {
  const box = document.getElementById("nextPlanBox");
  box.innerHTML = `
    <p>${escapeHtml(report.next_week_plan)}</p>
    <div class="task-meta">
      <span class="tag">不增加總時間</span>
      <span class="tag">提高弱點題比例</span>
      <span class="tag">保留基礎短練</span>
    </div>
  `;
}

async function main() {
  if (!isLoggedIn()) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>請先登入</h1>
        <p>回首頁使用座號或導師帳號登入後，再查看週報。</p>
        <p><a class="text-link" href="../index.html">回首頁登入</a></p>
      </section>
    `;
    return;
  }

  wireClearProgressButton();
  const [sampleReport, sampleWeaknesses, sampleSchedules] = await Promise.all([
    readJson(`${DATA_ROOT}/parent_weekly_report.sample.json`),
    readJson(`${DATA_ROOT}/weaknesses.sample.json`),
    readJson(`${DATA_ROOT}/review_schedule.sample.json`),
  ]);
  const { report, weaknesses, schedules, dataSourceLabel } = buildStoredReportPayload(
    sampleReport,
    sampleWeaknesses,
    sampleSchedules,
  );

  const weaknessMap = byId(weaknesses, "knowledge_code");

  document.getElementById("reportRange").textContent = formatDateRange(report.week_start, report.week_end);
  document.getElementById("reportTitle").textContent = `${report.subject}週報`;
  document.getElementById("reportMode").textContent = `${report.mode}｜${dataSourceLabel}`;
  document.getElementById("completedDays").textContent = report.completed_days;
  document.getElementById("correctRate").textContent = percent(report.correct_rate);
  document.getElementById("totalQuestions").textContent = report.total_questions;
  document.getElementById("reportStatus").textContent = dataSourceLabel;
  document.getElementById("parentMessage").textContent = report.parent_message;

  renderPerformance(report);
  renderWeaknesses(report, weaknessMap);
  renderReviewPlan(report, schedules, weaknessMap);
  renderNextPlan(report);
}

main().catch((error) => {
  document.querySelector(".app-shell").innerHTML = `
    <section class="error-box">
      <h1>家長週報讀取失敗</h1>
      <p>${escapeHtml(error.message)}</p>
      <p>請用本機伺服器開啟此原型頁面。</p>
    </section>
  `;
});
