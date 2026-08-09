const DATA_ROOT = "../../data";
const DATA_VERSION = "20260809-quest-mode";
const ATTEMPT_KEY = "chi_v1_last_attempt";
const DATA_FILES = {
  groups: "question_groups.jsonl",
  drills: "basic_drills.jsonl",
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

const questionTypeLabels = {
  single_choice: "單選",
  multiple_choice: "多選",
  short_answer: "短答",
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

function storageKey(key) {
  return window.ChiAuth?.storageKey(key) || key;
}

function isLoggedIn() {
  return window.ChiAuth ? window.ChiAuth.isLoggedIn() : true;
}

function flattenGroupQuestions(groups) {
  return groups.flatMap((group) =>
    (group.questions || []).map((question) => ({
      ...question,
      group_id: group.group_id,
      group_title: group.title,
    })),
  );
}

function formatAnswer(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "未作答";
  return value || "未作答";
}

function formatKnowledge(code) {
  return knowledgeLabels[code] || "知識點待確認";
}

function formatQuestionType(type) {
  return questionTypeLabels[type] || type || "--";
}

function resultLabel(answer) {
  if (answer.result_status === "needs_ai_review") return "待 AI 評分";
  if (answer.is_correct) return "答對";
  return "進復活關";
}

function resultClass(answer) {
  if (answer.result_status === "needs_ai_review") return "pending";
  if (answer.is_correct) return "correct";
  return "wrong";
}

function renderRubric(question) {
  const rubric = question.rubric || [];
  if (!rubric.length) return "";
  return `
    <div class="rubric-box">
      <strong>短答評分原則</strong>
      <ul>
        ${rubric.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderReviewItem(answer, question) {
  const explanation = question?.explanation || "本題目前沒有解析。";
  const answerBasis = question?.answer_basis || "";
  const displayOrder = answer.order ? `第 ${answer.order} 題` : "作答題目";
  return `
    <article class="review-card ${resultClass(answer)}">
      <div class="question-head">
        <span class="question-number">${escapeHtml(displayOrder)}</span>
        <span class="tag">${escapeHtml(answer.source_section)}</span>
        <span class="tag">${escapeHtml(formatQuestionType(answer.question_type))}</span>
        <span class="tag">${escapeHtml(formatKnowledge(answer.knowledge_code))}</span>
        <span class="tag">${escapeHtml(resultLabel(answer))}</span>
      </div>
      <h3>${escapeHtml(question?.prompt || "題目內容待同步")}</h3>
      <div class="answer-grid">
        <div>
          <p class="label">你的答案</p>
          <strong>${escapeHtml(formatAnswer(answer.student_answer))}</strong>
        </div>
        <div>
          <p class="label">參考答案</p>
          <strong>${escapeHtml(formatAnswer(answer.correct_answer))}</strong>
        </div>
      </div>
      <p>${escapeHtml(explanation)}</p>
      ${answerBasis ? `<p class="muted-text">依據：${escapeHtml(answerBasis)}</p>` : ""}
      ${renderRubric(question)}
    </article>
  `;
}

async function main() {
  if (!isLoggedIn()) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>請先登入</h1>
        <p>回首頁使用座號或導師帳號登入後，再查看通關結算。</p>
        <p><a class="text-link" href="../index.html">回首頁登入</a></p>
      </section>
    `;
    return;
  }

  const rawAttempt = localStorage.getItem(storageKey(ATTEMPT_KEY));
  if (!rawAttempt) {
    document.querySelector(".app-shell").innerHTML = `
      <section class="error-box">
        <h1>尚未有作答結果</h1>
        <p>請先回闖關地圖進入今日挑戰。</p>
        <p><a class="text-link" href="../index.html">回闖關地圖</a></p>
      </section>
    `;
    return;
  }

  const attempt = JSON.parse(rawAttempt);
  const [groups, drills] = await Promise.all([
    readJsonl(`${DATA_ROOT}/${DATA_FILES.groups}`),
    readJsonl(`${DATA_ROOT}/${DATA_FILES.drills}`),
  ]);
  const questionMap = byId([...flattenGroupQuestions(groups), ...drills], "question_id");
  const autoScored = attempt.answers.filter((answer) => answer.result_status !== "needs_ai_review");
  const autoCorrect = autoScored.filter((answer) => answer.is_correct).length;
  const pending = attempt.answers.filter((answer) => answer.result_status === "needs_ai_review").length;
  const wrong = attempt.answers.filter((answer) => answer.result_status === "wrong").length;
  const correctRate = autoScored.length ? autoCorrect / autoScored.length : 0;
  const stars = correctRate >= 0.9 ? 3 : correctRate >= 0.7 ? 2 : 1;
  const starText = "★".repeat(stars) + "☆".repeat(3 - stars);

  document.getElementById("reviewDate").textContent = attempt.task_date;
  document.getElementById("reviewTitle").textContent = attempt.group_title;
  document.getElementById("reviewMeta").textContent = `${attempt.subject}｜${attempt.mode}｜${attempt.answers.length} 題挑戰`;
  document.getElementById("questResultLine").textContent = `自動判分 ${autoCorrect}/${autoScored.length} 題，獲得 ${starText}`;
  document.getElementById("autoScore").textContent = starText;
  document.getElementById("autoScoreLabel").textContent = `${autoCorrect}/${autoScored.length} 題答對`;
  document.getElementById("pendingScore").textContent = pending;
  document.getElementById("wrongCount").textContent = wrong;
  document.getElementById("reviewStatus").textContent = wrong ? "復活關已排程" : "今日通關";
  document.getElementById("reviewStack").innerHTML = attempt.answers
    .map((answer) => renderReviewItem(answer, questionMap.get(answer.question_id)))
    .join("");
}

main().catch((error) => {
  document.querySelector(".app-shell").innerHTML = `
    <section class="error-box">
      <h1>解析頁讀取失敗</h1>
      <p>${escapeHtml(error.message)}</p>
    </section>
  `;
});
