"use strict";

const state = {
  skillEntry: false, skillBrief: {goal:"",scope:"",basis:"",outcome:""}, draftQuestions: [], workflowReturn: null, view: "overview", savedSkillNotice: null, skillEditing: false, workflowEditing: false, skillStage: 0, workflowStage: 0, runScreen: "history", resultTab: "report", sourceQuote: "", bindingOpen: new Set(), status: null, skills: [], workflows: [], runs: [], examples: null,
  skillDraft: null, workflowDraft: null, skillId: null, workflowId: null,
  skillDraftToken: null, skillTestOrigins: new Map(),
  runComposerId: null, runInputs: {}, selectedRun: null, mode: "mock", suggested: new Set(),
  errors: { skill: [], workflow: [], run: [] }, busy: new Set(), poll: null, toastTimer: null,
};
const views = { overview: "工作流", workflows: "流程设置", skills: "技能", runs: "运行记录" };
const kindInfo = {
  organize: { label: "整理型", body: "从材料里摘出、归类或改写内容，例如列出文案里的收益声明，或逐条整理合同条款。", output: "整理结果" },
  compare: { label: "对照型", body: "按团队依据逐条核对，每条结论都附原文出处。", output: "逐条对照结果（结论、原文、理由）" },
  draft: { label: "起草型", body: "根据前面步骤的结果起草给具体对象的文字，例如给市场同事的修改清单。", output: "文字草稿" },
};
const ROLE_SHORT = { original: "要审的原文", context: "背景信息", standard: "团队清单或底线", previous: "上一步的结果" };
const roleNames = { original: "原文", context: "背景", standard: "依据", previous: "上一步结果" };
const roleHints = { original: "被审阅的材料，只有它可以被引用", context: "帮助理解情况，不能当作原文引用", standard: "团队保存的审查清单或谈判底线", previous: "前一个技能交出的结果" };
const METHOD_FRAME = "适用范围：这个技能处理哪类材料，结果交给谁。\n先判断：哪些前提不满足时要先停下，并写明还缺什么。\n逐项做法：按资深同事的做事顺序，写出每一步检查什么。\n证据不足或拿不准时：写“需补材料”或“待确认”，不要猜。\n不由 AI 决定：签署、发布和接受偏离，都由负责人决定。";
const COMPARE_OUTPUT = "对照型技能的逐条输出格式由平台固定：每条依据返回结论、原文引用、理由、需补材料、修改文字和内部备注；编号、结论范围和引文由系统核对。";
const finalStates = new Set(["completed", "failed", "interrupted"]);
const statusNames = { queued: "排队中", running: "运行中", completed: "已完成", failed: "失败", interrupted: "已中断", pending: "等待执行", skipped: "已跳过" };
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  skills: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
  workflows: '<rect x="2" y="8" width="6" height="8" rx="1"/><rect x="16" y="8" width="6" height="8" rx="1"/><path d="M8 12h8m-3-3 3 3-3 3"/>',
  runs: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
};
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => `step_${globalThis.crypto?.randomUUID ? crypto.randomUUID().replaceAll("-", "").slice(0, 12) : Math.random().toString(36).slice(2, 14)}`;
const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
const busyAttr = key => state.busy.has(key) ? ' disabled aria-busy="true"' : "";
const actionButton = (label, action, extra = "", className = "secondary", busyKey = "") => `<button type="button" class="button ${className}" data-action="${action}" ${extra}${busyKey ? busyAttr(busyKey) : ""}>${esc(label)}</button>`;
const formatTime = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};
const badge = status => `<span class="badge ${status === "completed" ? "success" : status === "failed" || status === "interrupted" ? "error" : status === "running" || status === "queued" ? "running" : ""}">${status === "running" ? '<span class="spinner" aria-hidden="true"></span>' : ""}${esc(statusNames[status] || status || "未知状态")}</span>`;

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET", cache: "no-store",
      headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error("暂时连不上服务，请点“重新连接”再试。");
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`服务返回的内容无法读取（HTTP ${response.status}）。请稍后重试，仍不行请联系管理员。`); }
  if (!response.ok) {
    // Structured details (e.g. missing field names) are for programs; the message already names them in business terms.
    const details = typeof result.details === "string" ? result.details : "";
    throw new Error(`${result.error || `请求失败（HTTP ${response.status}）`}${details ? `：${details}` : ""}`);
  }
  return result;
}

function notify(message) {
  clearTimeout(state.toastTimer);
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  state.toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

function banner(message = "") {
  const element = $("#global-banner");
  element.hidden = !message;
  element.innerHTML = message ? `${esc(message)} ${actionButton("重新连接", "refresh", "", "secondary small")}` : "";
}

function errorBox(errors, id = "") {
  return `<div ${id ? `id="${id}" ` : ""}class="form-error" role="alert"${errors.length ? "" : " hidden"}><ul>${errors.map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>`;
}

function setFormErrors(kind, errors) {
  state.errors[kind] = errors;
  const element = $(`#${kind}-errors`);
  if (element) {
    element.innerHTML = `<ul>${errors.map(error => `<li>${esc(error)}</li>`).join("")}</ul>`;
    element.hidden = !errors.length;
    if (errors.length) element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function emptyState(title, description, action = "", label = "", extra = "") {
  return `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">⌑</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? actionButton(label, action, extra, "accent") : ""}</div>`;
}

function modeSelect() {
  const provider = state.status?.provider || {};
  const realAvailable = Boolean(provider.configured && provider.mode !== "mock");
  const label = realAvailable ? `AI 处理 · ${provider.model || provider.label || provider.mode}` : "AI 服务尚未配置";
  return `<label class="mode-field"><span>执行方式</span><select data-mode aria-label="执行方式"><option value="configured"${state.mode === "configured" ? " selected" : ""}${realAvailable ? "" : " disabled"}>${esc(label)}</option>${option("mock", "演示模式 · 不调用 AI", state.mode === "mock")}</select></label>`;
}

function renderChrome() {
  $("#navigation").innerHTML = Object.entries(views).filter(([view])=>view!=="workflows").map(([view, label]) => `<a href="#${view}" data-view="${view}" class="nav-item${(state.view === view && !(view === "runs" && state.runScreen === "compose") || view === "overview" && (state.view === "workflows" || state.view === "runs" && state.runScreen === "compose")) ? " active" : ""}"${state.view === view ? ' aria-current="page"' : ""}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[view]}</svg><span>${label}</span></a>`).join("");
  $("#page-title").textContent = state.view === "runs" ? ({history:"运行记录",compose:"提交材料",detail:"处理结果"}[state.runScreen]) : views[state.view];
  document.title = `${$("#page-title").textContent} · AltaLex`;
  const provider = state.status?.provider;
  $("#provider-status").innerHTML = provider && (provider.mode === "mock" || !provider.configured) ? '<span class="mode-indicator">演示模式</span>' : provider?.model ? `<span class="model-indicator">${esc(provider.model)}</span>` : '';
  const lists = $("#sidebar-lists");
  if (lists) lists.innerHTML = sidebarGroup("团队流程", state.workflows.slice(0, 6).map(w => `<button type="button" class="side-item${state.view === "runs" && state.runScreen === "compose" && state.runComposerId === w.id ? " active" : ""}" data-action="compose-run" data-id="${esc(w.id)}">${esc(w.name)}</button>`))
    + sidebarGroup("最近处理", state.runs.filter(r => r.kind === "workflow").slice(0, 6).map(r => `<button type="button" class="side-item${state.view === "runs" && state.runScreen === "detail" && state.selectedRun?.id === r.id ? " active" : ""}" data-action="open-run" data-id="${esc(r.id)}">${esc(r.workflow_name)}<small>${esc(formatTime(r.created_at))}${r.status === "failed" ? " · 失败" : ""}</small></button>`));

}

const BODY_MARK = "<!--page-body-->";

function pageHead({ crumbs = [], title = "", subtitle = "", actions = "", glyph = "workflows" }) {
  // AltaLex page head: breadcrumb, a 30px medium title, one muted line, actions on the right.
  const trail = crumbs.map((crumb, i) => i < crumbs.length - 1
    ? `<button type="button" class="crumb-link" ${crumb.view ? `data-view="${crumb.view}"` : `data-action="${crumb.action}"`}>${esc(crumb.label)}</button>`
    : `<span>${esc(crumb.label)}</span>`).join('<i aria-hidden="true">/</i>');
  return `<div class="page-head"><nav class="crumbs" aria-label="位置">${icon(glyph)}${trail}</nav><div class="page-head-row"><div class="page-head-copy"><h1>${esc(title)}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${actions ? `<div class="page-head-actions">${actions}</div>` : ""}</div></div>${BODY_MARK}`;
}

function sidebarGroup(title, items) {
  return `<section class="side-group"><h3>${esc(title)}</h3>${items.length ? items.join("") : '<p class="side-empty">暂无</p>'}</section>`;
}

function render() {
  renderChrome();
  const main = $("#main");
  const html = state.view === "overview" ? renderOverview() : state.view === "skills" ? renderSkills() : state.view === "workflows" ? renderWorkflows() : renderRuns();
  const [head, body] = html.includes(BODY_MARK) ? html.split(BODY_MARK) : ["", html];
  const wide = state.view === "runs" && state.runScreen === "detail";
  main.innerHTML = `${head}<div class="page-body"><div class="page-col${wide ? " wide" : ""}">${body}</div></div>`;
}

function navigate(view) {
  clearTimeout(state.poll);
  state.view = view;
  history.replaceState(null, "", `#${view}`);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (view === "runs" && state.selectedRun && !finalStates.has(state.selectedRun.status)) schedulePoll();
}

function workflowListRows(workflows, limit = 3) {
  return workflows.slice(0, limit).map(workflow => `<div class="list-row"><div class="list-copy"><h3>${esc(workflow.name)}<span class="version">第 ${esc(workflow.version || 1)} 版</span></h3><p>${workflow.steps.length} 个步骤 · ${workflow.input_fields.length} 项提交材料</p></div><div class="actions">${actionButton("编辑", "edit-workflow", `data-id="${esc(workflow.id)}"`, "quiet small")}${actionButton("运行 →", "compose-run", `data-id="${esc(workflow.id)}"`, "secondary small")}</div></div>`).join("");
}

function workflowFacts(workflow) {
  const fixed = [];
  for (const step of workflow.steps || []) {
    const task = state.skills.find(s => s.id === step.skill_id);
    for (const [key, binding] of Object.entries(step.input_bindings || {})) {
      if (binding?.source === "playbook") fixed.push({ label: binding.title || "团队依据", items: binding.items || [] });
      else if (binding?.source === "literal") {
        const label = task?.input_fields.find(f => f.name === key)?.label || key;
        if (!fixed.some(f => f.label === label)) fixed.push({ label, value: binding.value });
      }
    }
  }
  const tasks = (workflow.steps || []).map(step => state.skills.find(s => s.id === step.skill_id));
  return { fixed, tasks };
}

function workflowPlaybook(workflow) {
  for (const step of workflow?.steps || []) {
    for (const binding of Object.values(step.input_bindings || {})) if (binding?.source === "playbook") return binding;
  }
  return null;
}

function fieldLabel(workflow, name) {
  return workflow?.input_fields?.find(f => f.name === name)?.label || name;
}

const exampleCatalog = [
  { name: "starter", id: "starter-marketing-review", title: "营销材料预审", body: "发布前检查推广文案，标出要改的句子和要补的证明。", tag: "营销审查" },
  { name: "nda_playbook", id: "starter-nda-playbook", title: "对方 NDA 对照我方底线", body: "按我方底线逐条审阅对方 NDA，给出建议修改的条款。", tag: "合同审阅" },
  { name: "hk_announcement", id: "starter-hk-announcement", title: "港股交易公告审阅", body: "按港交所 CF007M 清单检查公告草稿，列出遗漏的披露项。", tag: "上市合规" },
];
const builtInWorkflows = ["HK Listed Company Announcement Review", "Draft from Template & Term Sheet", "Negotiation Playbook", "Contract Compare", "Due Diligence – Document Summary", "Scheduled Task"];

function renderWorkflowCard(workflow) {
  const { fixed, tasks } = workflowFacts(workflow);
  const items = fixed.reduce((n, f) => n + (f.items ? f.items.length : 0), 0);
  const meta = [`${tasks.length} 步`, items ? `清单 ${items} 条` : "", workflow.version > 1 ? `第 ${workflow.version} 版` : ""].filter(Boolean);
  const summary = (workflow.description || "按团队保存的步骤处理新材料。").split(/(?<=。)/)[0];
  return `<article class="business-workflow"><div class="workflow-card-copy"><h2>${esc(workflow.name)}</h2><p>${esc(summary)}</p>`
    + `<p class="card-meta">${meta.map(esc).join(" · ")}</p></div>`
    + `<div class="workflow-card-actions">${actionButton("提交材料", "compose-run", `data-id="${esc(workflow.id)}"`, "accent")}`
    + `${items ? actionButton("编辑依据", "edit-standard", `data-id="${esc(workflow.id)}"`, "quiet") : ""}${actionButton("查看与调整", "edit-workflow", `data-id="${esc(workflow.id)}"`, "quiet")}</div></article>`;
}

function renderOverview() {
  const examples=exampleCatalog.filter(example=>!state.workflows.some(workflow=>workflow.id===example.id));
  return `${pageHead({ crumbs: [{ label: "工作流" }], title: "工作流", subtitle: "选一个流程，提交材料，获取审查意见。", actions: actionButton('＋ 创建流程','new-workflow','','accent') })}
  ${state.workflows.length?`<div class="section-title"><h2>团队流程</h2><span>${state.workflows.length} 套</span></div><div class="workflow-catalog">${state.workflows.map(renderWorkflowCard).join('')}</div>`:`<section class="first-task"><div><h2>还没有团队流程</h2><p>创建一套流程，或先安装下面的示例。</p>${actionButton('创建第一套流程','new-workflow','','accent')}</div></section>`}
  ${examples.length?`<div class="section-title"><h2>示例</h2><span>安装后可以按团队需要修改</span></div><div class="example-grid">${examples.map(example=>`<article class="example-card"><span class="card-kicker">${esc(example.tag)}</span><h3>${esc(example.title)}</h3><p>${esc(example.body)}</p><div class="example-actions">${actionButton('安装示例','start-demo',`data-example="${esc(example.name)}"`,'secondary small','install')}</div></article>`).join('')}</div>`:''}`;
}

function ruleEntries(text) {
  // Legacy free-text standards: "R1 标题。正文" lines. Structured playbooks carry their own titles.
  return typeof text === "string" ? text.split("\n").map(line => line.match(/^\s*([A-Za-z]+[\w-]*)\s+([^。\n]+)[。]?(.*)$/)).filter(Boolean).map(m => ({ id: m[1], title: m[2], body: m[3] })) : [];
}

function renderRunField(field) {
  const value = state.runInputs[field.name] || "";
  const control = field.options?.length
    ? `<select id="run-${esc(field.name)}" data-run-field="${esc(field.name)}">${option("", "请选择", !value)}${field.options.map(o => option(o, o, o === value)).join("")}</select>`
    : `<textarea id="run-${esc(field.name)}" class="${field.name === "document" ? "document-input" : ""}" data-run-field="${esc(field.name)}" placeholder="${esc(field.hint || "填写这项材料。")}">${esc(value)}</textarea>`;
  return `<div class="q-row"><label class="q-label" for="run-${esc(field.name)}"><span class="q-name">${field.required ? '<i class="req">*</i>' : ""}${esc(field.label || field.name)}${!field.required ? '<span class="optional">选填</span>' : ""}</span>${field.hint ? `<small>${esc(field.hint)}</small>` : ""}</label><div class="q-control">${control}</div></div>`;
}

function renderSubmission(workflow, home = false) {
  // Mirrors AltaLex's workflow questionnaire: an intro card, numbered step cards, and a run bar.
  const playbook = workflowPlaybook(workflow);
  const fill = [lastRunInputs(workflow) && state.runs.some(run => run.workflow_id === workflow.id) ? actionButton("填入上次材料", "fill-last-run", "", "secondary small") : "",
    (workflow.sample_inputs && Object.keys(workflow.sample_inputs).length) || state.workflows.some(w => w.sample_inputs) ? actionButton("填入示例", "fill-examples", "", "secondary small") : ""].filter(Boolean).join("");
  const chooser = state.workflows.length > 1
    ? `<label class="inline-choice"><span>使用的流程</span><select data-composer-workflow aria-label="使用的流程">${state.workflows.map(w => option(w.id, w.name, w.id === workflow.id)).join("")}</select></label>` : "";
  const filled = workflow.input_fields.filter(f => String(state.runInputs[f.name] || "").trim()).length;
  const tasks = workflow.steps.map(step => state.skills.find(x => x.id === step.skill_id)?.name || "处理材料");
  const basis = playbook
    ? `<section class="flow-card"><div class="flow-card-head"><span class="step-pill">第 2 步</span><h2>团队依据（已保存，无需每次提交）</h2></div><p class="flow-card-note">${esc(playbook.title)} · ${playbook.items.length} 条 · 由合规团队维护，修改时须填写修改说明和批准人</p><details class="basis-list"><summary>查看全部条目</summary><ul class="scope-list">${playbook.items.map(i => `<li><span class="rule-id">${esc(i.id)}</span>${esc(i.title)}${i.gate ? '<span class="gate-tag">前置条件</span>' : ""}${i.applies_when ? `<small>仅当${esc(fieldLabel(workflow, i.applies_when.input))}为${esc(i.applies_when.values.join("、"))}</small>` : ""}</li>`).join("")}</ul></details></section>`
    : "";
  const submit = `<button type="submit" class="button accent"${busyAttr("run")}><span aria-hidden="true">▶</span> ${state.busy.has("run") ? "正在提交…" : state.mode === "mock" ? "演示运行流程" : "运行流程"}</button>`;
  const head = pageHead({ crumbs: [{ label: "工作流", action: "go-home" }, { label: workflow.name }], title: workflow.name,
    subtitle: `${tasks.length} 个步骤${playbook ? ` · 团队依据 ${playbook.items.length} 条` : ""}`, actions: actionButton("调整流程", "edit-workflow", `data-id="${esc(workflow.id)}"`, "secondary") });
  return head
    + `<section class="flow-card intro-card"><p>${esc(workflow.description || "提交本次材料，系统会按保存的步骤处理。")}</p><ol class="task-chain">${tasks.map((t, i) => `<li><span class="step-pill">第 ${i + 1} 步</span>${esc(t)}</li>`).join("")}</ol>${chooser}</section>`
    + `<form id="run-form" novalidate>${errorBox(state.errors.run, "run-errors")}`
    + `<section class="flow-card"><div class="flow-card-head"><span class="step-pill">第 1 步</span><h2>本次材料</h2><div class="flow-card-tools">${fill}</div></div><div class="q-table">${workflow.input_fields.map(renderRunField).join("")}</div></section>`
    + basis
    + `<section class="flow-card run-bar"><div><strong>已填写 ${filled}/${workflow.input_fields.length} 项</strong>${state.mode === "mock" ? '<p class="demo-note">演示模式只走一遍步骤，不生成审查意见。</p>' : privacyNote()}</div><div class="run-bar-actions"><details class="model-options"><summary>更多设置</summary>${modeSelect()}</details>${submit}</div></section></form>`;
}

function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.skills}</svg>`; }
function arrow() { return '<span aria-hidden="true">↗</span>'; }
function wizardRail(kind,labels,stage) {
  return `<aside class="wizard-rail"><span class="aside-label">${kind==='skill'?(state.skillId?'编辑技能':'新建技能'):(state.workflowId?'编辑流程':'新建流程')}</span><ol>${labels.map((label,n)=>`<li><button type="button" data-action="wizard-stage" data-kind="${kind}" data-stage="${n}" class="${n===stage?'active':''}"${n===stage?' aria-current="step"':''}><span>${n<stage?'✓':n+1}</span><strong>${label}</strong></button></li>`).join('')}</ol><p>${kind==='skill'?'写好技能后，用样例试一下结果。':'按办事顺序排好技能，再为每一步选好材料。'}</p></aside>`;
}
function reviewStep(run) { return [...(run.steps||[])].reverse().find(step=>step.output && typeof step.output==='object' && Array.isArray(step.output.checks)); }
function originalName(step) { return step?.skill_snapshot?.input_fields?.find(f=>f.role==='original')?.name || 'document'; }
function sourceDocument(run) {
  const review=reviewStep(run), step=review||run.steps?.[0];
  const name=originalName(step);
  if(typeof step?.inputs?.[name]==='string') return step.inputs[name];
  return typeof run.inputs?.document==='string'?run.inputs.document:run.steps?.find(item=>typeof item.inputs?.document==='string')?.inputs.document||'';
}
function numberedSource(doc, quote, hits = []) {
  // Every flagged sentence stays underlined and clickable; the quote picked from a card is highlighted on top.
  const start = quote ? doc.indexOf(quote) : -1, end = start + (quote || "").length;
  const owner = new Array(doc.length).fill(null);
  hits.forEach(hit => { const at = hit.quote ? doc.indexOf(hit.quote) : -1; if (at < 0) return; for (let i = at; i < at + hit.quote.length; i++) if (!owner[i]) owner[i] = hit; });
  let offset = 0, marked = false;
  return doc.split("\n").map((line, index) => {
    const from = offset; offset += line.length + 1;
    let html = "", i = 0;
    while (i < line.length) {
      const pos = from + i, hit = owner[pos], sel = start >= 0 && pos >= start && pos < end;
      let j = i + 1;
      while (j < line.length && owner[from + j] === hit && (start >= 0 && from + j >= start && from + j < end) === sel) j++;
      let piece = esc(line.slice(i, j));
      if (sel) { piece = `<mark${marked ? "" : ' id="source-selection" tabindex="-1"'}>${piece}</mark>`; marked = true; }
      if (hit) piece = `<span class="src-hit ${esc(hit.tone)}" data-action="goto-card" data-rule="${esc(hit.rule)}" title="${esc(hit.rule)} ${esc(hit.title)}，点击查看这一条">${piece}</span>`;
      html += piece; i = j;
    }
    return `<div class="src-line"><span class="src-no">${index + 1}</span><span class="src-text">${html || "&nbsp;"}</span></div>`;
  }).join("");
}
function sourceHits(run) {
  const tones = { issue: "issue", needs_material: "material", unverified: "check" };
  return (reviewStep(run)?.output?.checks || []).filter(c => c && tones[c.status] && typeof c.quote === "string" && c.quote.trim() && c.rule_id)
    .map(c => ({ quote: c.quote, rule: c.rule_id, title: c.title || "", tone: tones[c.status] }));
}
function renderSource(run) {
  const doc=sourceDocument(run),q=state.sourceQuote;
  const inputs=run.inputs||{};
  const fields=run.snapshot?.workflow?.input_fields||run.snapshot?.skill?.input_fields||run.steps?.[0]?.skill_snapshot?.input_fields||[];
  const extra=Object.entries(inputs).filter(([key,value])=>value!==doc&&value!==null&&value!==undefined&&value!=='');
  const found=Boolean(q&&doc.includes(q));
  const contextHit=q&&!found?extra.find(([,value])=>typeof value==='string'&&value.includes(q)):null;
  return `<aside class="source-panel"><div class="source-heading"><h2>原文</h2><span class="caption">左侧为行号</span></div>${doc?`<div class="document-paper numbered">${numberedSource(doc,found?q:'',sourceHits(run))}</div>${q&&!found?`<p class="quote-audit-warning">${contextHit?`这段文字出自“${esc(fields.find(f=>f.name===contextHit[0])?.label||contextHit[0])}”，不在原文里。`:'这段引用未在原文中找到，请核对来源。'}</p>`:''}`:'<div class="empty-recent"><p>这次的材料分别交给了各个步骤。</p><span>可在“处理详情”里查看。</span></div>'}${extra.map(([key,value])=>`<details class="source-context"><summary>${esc(fields.find(f=>f.name===key)?.label||key)}</summary><div class="result-text">${esc(typeof value==='string'?value:JSON.stringify(value,null,2))}</div></details>`).join('')}</aside>`;
}

function runActions(run) {
  // Like AltaLex's Download / Full Screen, the run's actions sit on the right of the status bar.
  return `${run.kind!=='skill_test'?actionButton(reviewStep(run)?'再审一份':'处理新材料','compose-run',`data-id="${esc(run.workflow_id||run.snapshot?.workflow?.id||'')}"`,'secondary small'):''}${run.status==='completed'&&run.mode!=='mock'&&reviewStep(run)?actionButton(`复制给${replyTo(run)}的修改`,'copy-counterparty','','secondary small')+actionButton('下载内部审阅表（Word）','download-word','','secondary small'):''}${run.status==='completed'&&run.mode!=='mock'?actionButton(reviewStep(run)?'复制审查意见':'复制结果',reviewStep(run)?'copy-review':'copy-result','','accent small'):''}`;
}

function renderRunResult(run) {
  const review=reviewStep(run),complete=run.status==='completed',mock=run.mode==='mock';
  const lastStep=run.steps?.at(-1),isRequest=/补.*(?:材料|资料)/.test(lastStep?.name||'');
  const laterLabel=isRequest?'补件草稿':(lastStep?.name||'后续结果').slice(0,16);
  const hasDraft=review && run.final_output!==null && JSON.stringify(run.final_output)!==JSON.stringify(review.output);
  const tab=state.resultTab==='draft'&&!hasDraft?'report':state.resultTab;
  const tabs=[['report',review?'审查意见':'处理结果'],...(hasDraft?[['draft',laterLabel]]:[]),['process','处理详情']];
  const currentStep=(run.steps||[]).find(s=>s.status==='running');
  let body;
  if(tab==='process') body=renderExecutionDetails(run);
  else if(tab==='draft') body=`<div class="draft-sheet"><div class="section-heading"><h2>${isRequest?"给业务同事的补件草稿":esc(lastStep?.name||laterLabel)}</h2>${actionButton("复制草稿","copy-draft","","secondary small")}</div><p class="caption">请对照审查意见核对后再使用。</p><div class="draft-copy">${structuredOutput(readableDraft(run))}</div></div>`;
  else if(mock && complete) body=`<div class="general-result"><span class="eyebrow">演示已完成</span><h2>已完成 ${run.steps?.length||0} 个步骤</h2><p>演示模式只走一遍步骤，不生成审查意见。</p><ol class="method-timeline">${(run.steps||[]).map((s,n)=>`<li><span>${n+1}</span><div><strong>${esc(s.name)}</strong><small>${esc(statusNames[s.status]||s.status)}</small></div></li>`).join('')}</ol><p class="caption">在提交页的“更多设置”里改用 AI 处理，用同一份材料再运行一次，就能得到审查意见。每一步收到和交出的内容可在“处理详情”查看。</p></div>`;
  else if(review) body=`${checkDocumentQuotes(review.output,review.inputs?.document)?.missing.length?renderStepQuoteCheck(review):""}${reviewOutput(review.output,review.inputs?.rules||review.inputs?.standard,labelsFor(run),run)}`;
  else if(complete) body=`<div class="general-result">${structuredOutput(run.final_output)}</div>`;
  else if(run.status==='failed'||run.status==='interrupted') body=`<div class="run-failed" role="alert"><strong>${run.status==='failed'?'本次处理没有完成':'本次处理已中断'}</strong><p>${esc(run.error||'原因未知')}</p><p class="field-hint">已完成的步骤结果保留在“处理详情”里。处理好上面的问题后，点“${reviewStep(run)?'再审一份':'处理新材料'}”重新运行。AI 服务设置的问题请联系管理员。这次没有生成审查意见，不能当作“没有问题”。</p></div>`;
  else body=`<div class="processing-state">${run.status==='running'||run.status==='queued'?'<span class="spinner"></span>':icon('skills')}<span class="step-progress">已完成 ${(run.steps||[]).filter(x=>x.status==='completed').length}/${(run.steps||[]).length} 步${currentStep?.progress?` · 正在逐条核对团队依据 ${currentStep.progress.done}/${currentStep.progress.total}`:''}</span><h2>${currentStep?esc(currentStep.name):run.status==='failed'?'本次处理未完成':run.status==='interrupted'?'本次处理已中断':'正在准备材料'}</h2><p>${run.error?esc(run.error):'正在按流程处理，完成后结果会显示在这里。'}</p></div>`;
  const statusLine = complete ? (mock ? '演示已完成' : run.kind === 'skill_test' ? '试用完成' : '处理完成') : run.status === 'failed' ? '处理没有完成' : run.status === 'interrupted' ? '处理已中断' : '正在处理';
  const statusHint = complete ? (mock ? '未调用 AI' : review ? '请逐条核对原文、依据和由谁决定' : '请核对处理结果') : run.status === 'running' || run.status === 'queued' ? `已完成 ${(run.steps||[]).filter(x=>x.status==='completed').length}/${(run.steps||[]).length} 步` : '';
  return `<div class="status-bar status-${esc(run.status)}">${run.status === 'running' || run.status === 'queued' ? '<span class="spinner" aria-hidden="true"></span>' : `<span class="status-glyph" aria-hidden="true">${complete ? '✓' : '!'}</span>`}<strong>${statusLine}</strong>${statusHint ? `<span>${esc(statusHint)}</span>` : ''}<div class="status-actions">${runActions(run)}</div></div>${renderSkillTestNotice(run)}${renderExpectations(run)}${complete && review && tab === 'report' ? runDiff(run) : ''}${mock?'<div class="model-notice mock">这是演示运行，下面没有真实的审查意见。</div>':''}${run.error&&review?`<div class="form-error">${esc(run.error)} 前面步骤的结果已保留，后续步骤没有完成。</div>`:''}<div class="result-tabs" role="tablist" aria-label="结果视图">${tabs.map(([id,label])=>`<button role="tab" type="button" aria-selected="${tab===id}" data-action="result-tab" data-tab="${id}" class="${tab===id?'active':''}">${label}</button>`).join('')}</div>${tab==='process'?`<div class="process-view">${body}</div>`:`<div class="review-desk">${renderSource(run)}<section class="opinion-panel" aria-label="${tab==='draft'?laterLabel:review?'审查意见':'处理结果'}">${body}<div class="verification-note">${review?'这份意见只覆盖所选的团队依据，请结合完整材料复核。':'请结合完整材料核对处理结果。'}</div></section></div>`}`;
}

function newSkill(fromWorkflow = false) {
  if(!fromWorkflow) state.workflowReturn=null;
  state.skillEntry=true; state.draftQuestions=[]; state.skillBrief={goal:"",scope:"",basis:"",outcome:""};
  state.skillEditing = true; state.skillStage = 0; state.savedSkillNotice = null;
  state.skillId = null;
  state.skillDraftToken = uid();
  state.skillDraft = { name: "", description: "", kind: "organize", instructions: "", input_fields: [{ name: "document", label: "待处理材料", required: true, role: "original" }], output_format: "text", output_requirements: "", sample_inputs: {}, expected: [] };
  state.errors.skill = [];
  navigate("skills");
}

function renderInputFields(fields, kind) {
  return `<div class="material-fields">${fields.map((field,index)=>`<div class="input-row" data-input-row="${kind}"><span class="input-order">${index+1}</span><label class="field input-label"><span class="field-label">材料名称</span><input data-field-label value="${esc(field.label)}" aria-label="第 ${index+1} 个输入项的名称" placeholder="例如：推广文案正文" maxlength="120"></label>${kind==='skill'?`<label class="field input-role"><span class="field-label">材料性质</span><select data-field-role aria-label="第 ${index+1} 项材料的性质">${option('', '请选择', !field.role)}${Object.entries(ROLE_SHORT).map(([value,label])=>option(value,label,field.role===value)).join('')}</select></label>`:''}<label class="check-field"><input type="checkbox" data-field-required${field.required!==false?' checked':''} aria-label="输入 ${index+1} 是否必填"><span>必填</span></label><button type="button" class="button quiet icon-button destructive" data-action="remove-${kind}-input" data-index="${index}" aria-label="删除输入 ${index+1}">×</button><details class="field-key"${kind==='workflow'&&(field.options?.length||field.hint)?' open':''}><summary>更多设置</summary>${kind==='workflow'?`<input data-field-options value="${esc((field.options||[]).join('、'))}" aria-label="输入 ${index+1} 的可选项" placeholder="可选项，用顿号分隔，填了就变成下拉选择，例如：静态图文、短视频或直播、尚未确认" maxlength="400"><input data-field-hint value="${esc(field.hint||'')}" aria-label="输入 ${index+1} 的填写提示" placeholder="填写提示，显示在提交页" maxlength="300">`:''}<input data-field-key value="${esc(field.name)}" aria-label="输入 ${index+1} 的字段名称" placeholder="如 document" spellcheck="false" maxlength="64"><p class="field-hint">字段名称供系统连接各步骤，一般不用改。设了可选项，就能用作团队依据的适用条件。</p></details></div>`).join('')}</div>`;
}

function renderSkills() {
  if(state.skillEditing && state.skillDraft && state.skillEntry) return renderSkillBrief();
  if(state.skillEditing && state.skillDraft) return `${pageHead({ glyph: "skills", crumbs: [{ label: "技能库", action: "close-skill" }, { label: state.skillId ? "编辑技能" : "新建技能" }], title: state.skillDraft.name || "新建技能", subtitle: `${kindInfo[state.skillDraft.kind || "organize"].label} · ${state.skillDraft.input_fields.length} 项材料${state.skillId ? ` · 第 ${state.skills.find(x => x.id === state.skillId)?.version || 1} 版` : " · 尚未保存"}`, actions: state.workflowReturn ? actionButton('← 返回流程','return-workflow','','secondary') : '' })}${renderSkillEditor(state.skillDraft)}`;
  return `${pageHead({ glyph: "skills", crumbs: [{ label: "技能库" }], title: "技能库", subtitle: `${state.skills.length} 个技能 · 每个技能写明一项工作怎么做，可以反复使用`, actions: actionButton('＋ 创建技能','new-skill','','accent') })}${state.savedSkillNotice?`<div class="save-confirmation"><div><strong>技能已保存</strong><p>${state.skills.length<2?'流程至少需要两个技能。再创建一个，就可以组成流程。':'把它加入流程，就能和其他技能配合使用。'}</p></div>${actionButton('创建流程 →','new-workflow','','secondary')}</div>`:''}<div class="library-grid">${state.skills.map(skill=>`<article class="library-card"><div class="method-top"><span class="kind-badge kind-${esc(skill.kind||'organize')}">${esc(kindInfo[skill.kind||'organize'].label)}</span><span class="caption">第 ${esc(skill.version||1)} 版${usedBy(skill.id)}</span></div><h2>${esc(skill.name)}</h2><p>${esc(skill.description || '按保存的做法处理材料。')}</p><div class="skill-materials">${skill.input_fields.map(f=>`<span>${f.role?`<b>${esc(roleNames[f.role])}</b>`:''}${esc(f.label||f.name)}</span>`).join('')}</div><div class="method-bottom"><span class="caption">${(skill.expected||[]).length?`${skill.expected.length} 个预期检查点`:'还没有预期检查点'}</span>${actionButton('编辑技能','edit-skill',`data-id="${esc(skill.id)}"`,'secondary small')}</div></article>`).join('')}</div>${!state.skills.length?emptyState('从一个具体技能开始','例如：提取收益声明、核对公司政策、整理补材料清单。','new-skill','创建第一个技能'):''}${state.workflows.some(w=>w.id.startsWith('starter-'))?'':`<div class="library-foot"><p>不知道从哪里开始？首页的示例里有现成的技能，可以直接修改。</p>${actionButton('回到首页','go-home','','quiet')}</div>`}`;
}

function usedBy(id) {
  const names = state.workflows.filter(workflow => workflow.steps?.some(step => step.skill_id === id)).map(workflow => workflow.name);
  return names.length ? ` · 用于 ${names.length} 个流程` : "";
}

function renderSkillBrief() {
  return `${pageHead({ glyph: "skills", crumbs: [{ label: "技能库", action: "close-skill" }, { label: "新建技能" }], title: "新建技能", subtitle: "AI 起草技能，你来修改", actions: state.workflowReturn ? actionButton('← 返回流程','return-workflow','','secondary') : '' })}<form id="skill-brief-form" class="business-brief" novalidate><div class="editor-title"><h1>新建技能</h1><p>说说你们平时怎样处理这项工作，AI 会据此起草技能，你再修改。不想让 AI 起草，就点“自己填写”。</p></div>${errorBox(state.errors.skill,'skill-errors')}<label class="field"><span class="field-label">这个技能要反复做什么工作？</span><textarea name="goal" placeholder="例如：检查推广文案里的收益和风险表述，列出要请市场同事修改或补证明的地方。">${esc(state.skillBrief.goal)}</textarea></label><div class="brief-columns"><label class="field"><span class="field-label">适用范围 <span class="optional">选填</span></span><textarea name="scope" placeholder="材料类型、谁来用、我方代表哪一方。不确定的可以留空。">${esc(state.skillBrief.scope)}</textarea></label><label class="field"><span class="field-label">检查依据与处理方式 <span class="optional">选填</span></span><textarea name="basis" placeholder="已有的清单、公司要求或范本。缺材料时怎么办？哪些事要交给负责人决定？">${esc(state.skillBrief.basis)}</textarea></label></div><label class="field"><span class="field-label">最后交给同事什么结果？ <span class="optional">选填</span></span><textarea name="outcome" placeholder="例如：待确认事项、对应的原句、缺少的信息。没确认的事实不要替业务同事填上。">${esc(state.skillBrief.outcome)}</textarea></label><div class="brief-footer"><details class="model-options"><summary>生成方式</summary>${modeSelect()}</details><div class="actions">${actionButton('自己填写','manual-skill','','secondary')}<button type="submit" class="button accent"${busyAttr('draft-skill')}>${state.busy.has('draft-skill')?'正在起草技能…':'生成技能草稿'}</button></div></div><p class="field-hint">草稿不会自动保存，请核对并试用后再保存。系统不会替你确认法律依据。</p></form>`;
}

function captureSkillBrief() {
  const form=$('#skill-brief-form'); if(!form) return;
  for(const key of ['goal','scope','basis','outcome']) state.skillBrief[key]=form.elements[key].value.trim();
}

async function generateSkillDraft() {
  captureSkillBrief();
  if(!state.skillBrief.goal) {setFormErrors('skill',['请说明这个技能要做什么工作。']);return;}
  await perform('draft-skill',async()=>{
    const result=await api('/skills/draft',{method:'POST',body:{...state.skillBrief,mode:state.mode}});
    state.skillDraft=result.skill; state.draftQuestions=result.questions; state.skillEntry=false;
    state.errors.skill=[];state.skillStage=0;notify('技能草稿已生成。请核对做法，再用样例试用。');
  },'skill');
}

function returnToWorkflow(skill = null) {
  const origin=state.workflowReturn; if(!origin) return;
  state.workflowDraft=clone(origin.draft);state.workflowId=origin.id;state.workflowEditing=true;state.workflowStage=2;
  if(skill) {
    state.workflowDraft.steps.push(makeStep(skill,state.workflowDraft));
  }
  state.workflowReturn=null;state.skillEditing=false;state.errors.workflow=[];navigate('workflows');
}

function renderSkillEditor(draft) {
  const draftNote=state.draftQuestions.length?`<details class="draft-questions"><summary>AI 起草时提出的核对问题</summary><ul>${state.draftQuestions.map(q=>`<li>${esc(q)}</li>`).join('')}</ul><p>回答时分开两类。一类是现在就要写进技能的规则，另一类是每次处理材料时才核对的事实。</p></details>`:'';
  const exp=draft.expected||[]; const hasRe=/^(应包含|包含)[：:]\s*/, notRe=/^(不应包含|不包含)[：:]\s*/;
  const has=exp.filter(l=>hasRe.test(l)).map(l=>l.replace(hasRe,'')), not=exp.filter(l=>notRe.test(l)).map(l=>l.replace(notRe,'')), status=exp.filter(l=>!hasRe.test(l)&&!notRe.test(l));
  const section=(n,title,lead,body)=>`<section class="skill-section"><div class="section-number">${n}</div><div class="section-body"><h2>${title}</h2><p class="section-lead">${lead}</p>${body}</div></section>`;
  const s1=`<label class="field"><span class="field-label">技能名称</span><input name="name" value="${esc((draft.name))}" placeholder="例如：核对推广文案与公司政策" maxlength="120"></label><fieldset class="kind-choice"><legend class="field-label">技能类型</legend><div class="kind-options">${Object.entries(kindInfo).map(([value,info])=>`<label class="kind-option${(draft.kind||'organize')===value?' selected':''}"><input type="radio" name="kind" value="${value}"${(draft.kind||'organize')===value?' checked':''}><strong>${info.label}</strong><span>${info.body}</span></label>`).join('')}</div></fieldset><label class="field"><span class="field-label">具体做法 ${actionButton('插入审查模板','insert-method','','text-link')}</span><span class="input-guidance">像交代新同事那样写清楚。先确认哪些前提，再逐项查什么，拿不准时怎么办，哪些事不由 AI 决定。</span><textarea name="instructions" class="large" placeholder="${esc(METHOD_FRAME)}">${esc(draft.instructions)}</textarea></label><label class="field"><span class="field-label">一句话用途 <span class="optional">选填</span></span><input name="description" value="${esc(draft.description)}" placeholder="例如：发布前检查推广文案" maxlength="600"></label>`;
  const s2=`${renderInputFields(draft.input_fields,'skill')}<div class="section-actions">${actionButton('＋ 添加材料','add-skill-input','','secondary small')}</div>`;
  const s3=`${draft.kind==='compare'?`<div class="platform-contract"><strong>对照型的结果格式由系统固定</strong><p>每条依据都会给出结论、原文引用、理由、需要补充的材料、建议修改文字和内部备注。编号、结论和引文由系统核对。</p></div>`:''}<label class="field"><span class="field-label">${draft.kind==='compare'?'额外要求 <span class="optional">选填</span>':'结果里要有什么'}</span><textarea name="output_requirements" placeholder="${draft.kind==='compare'?'例如：修改文字简短，可以直接替换原句。':'例如：逐项列出问题、对应原句、原因和需要补充的材料。'}">${esc(draft.kind==='compare'&&draft.output_requirements===COMPARE_OUTPUT?'':draft.output_requirements)}</textarea></label><details class="format-options"><summary>结果格式：${draft.output_format==='json'?'结构化数据':'文字'}</summary><label class="field"><span class="field-label">结果格式</span><select name="output_format">${option('text','文字',draft.output_format==='text')}${option('json','结构化数据（供下一步读取）',draft.output_format==='json')}</select></label></details>`;
  const samples=draft.input_fields.map((field,index)=>`<label class="field"><span class="field-label">${esc(field.label||field.name||`材料 ${index+1}`)}${field.role?`<span class="role-chip">${esc(ROLE_SHORT[field.role]||roleNames[field.role])}</span>`:''}<span class="optional">${field.required?'必填':'选填'}</span></span><textarea data-sample-index="${index}" placeholder="${field.role==='standard'?'按编号分条，例如：R1 收益表述：须附计算依据。':'粘贴一段样例'}">${esc(draft.sample_inputs?.[field.name]||'')}</textarea></label>`).join('');
  const checks=`<div class="check-columns"><label class="field"><span class="field-label">结果里应该出现</span><textarea name="expected_has" class="compact-text" placeholder="每行一条，例如：最高可达8%">${esc(has.join('\n'))}</textarea></label><label class="field"><span class="field-label">结果里不应该出现</span><textarea name="expected_not" class="compact-text" placeholder="每行一条，例如：口播稿">${esc(not.join('\n'))}</textarea></label></div>${draft.kind==='compare'?`<label class="field"><span class="field-label">某条依据应得的结论 <span class="optional">选填</span></span><textarea name="expected_status" class="compact-text" placeholder="每行一条，例如：R2 = 不一致">${esc(status.join('\n'))}</textarea></label>`:''}`;
  const s4=`${samples}${checks}<div class="test-actions">${modeSelect()}${actionButton('试用技能','test-skill','','secondary','test-skill')}</div>${privacyNote()}<p class="field-hint">试用不会保存技能。看完结果回到这里修改，满意后再保存。</p>`;
  return `<form id="skill-form" class="builder single" novalidate><div class="builder-main">${errorBox(state.errors.skill,'skill-errors')}${draftNote}
    ${section(1,'这个技能做什么','给它起个名字，选一种类型，写清具体做法。',s1)}
    ${section(2,'每次需要哪些材料','每项材料都会出现在提交页上，由使用者粘贴进来。只有“要审的原文”可以被引用。',s2)}
    ${section(3,'交出什么结果','写清结果里要有哪些内容。下一步或使用者会直接使用它。',s3)}
    ${section(4,'用样例试一下','先试用再保存。填一份样例，写下结果里应该出现和不应该出现的内容，再点“试用技能”，系统会逐条告诉你是否做到。',s4)}
    <div class="wizard-footer">${state.workflowReturn?actionButton('← 返回流程','return-workflow','','quiet'):'<span class="caption"></span>'}<button type="submit" class="button accent"${busyAttr('save-skill')}>${state.busy.has('save-skill')?'保存中…':state.workflowReturn?'保存并加入流程':'保存技能'}</button></div>${jsonDetails('查看完整设置',draft)}</div></form>`;
}

function collectInputFields(form, kind) {
  return $$(`[data-input-row="${kind}"]`, form).map(row => {
    const field = { name: $("[data-field-key]", row).value.trim(), label: $("[data-field-label]", row).value.trim(), required: $("[data-field-required]", row).checked };
    const options = ($("[data-field-options]", row)?.value || "").split(/[、,，\n]/).map(o => o.trim()).filter(Boolean);
    const hint = ($("[data-field-hint]", row)?.value || "").trim();
    const role = $("[data-field-role]", row)?.value || "";
    if (role) field.role = role;
    if (options.length) field.options = [...new Set(options)];
    if (hint) field.hint = hint;
    return field;
  });
}

function captureSkillForm() {
  const form = $("#skill-form");
  if (!form || !state.skillDraft) return;
  const fields = collectInputFields(form, "skill");
  const samples = {};
  fields.forEach((field, index) => { samples[field.name] = $(`[data-sample-index="${index}"]`, form)?.value || ""; });
  const kind = form.elements.kind?.value || state.skillDraft.kind || "organize";
  const lines = name => (form.elements[name]?.value || "").split("\n").map(line => line.trim()).filter(Boolean);
  const expected = form.elements.expected_has ? [...lines("expected_has").map(x => "应包含：" + x), ...lines("expected_not").map(x => "不应包含：" + x), ...lines("expected_status")] : lines("expected");
  state.skillDraft = { ...state.skillDraft, name: form.elements.name.value.trim(), description: form.elements.description.value.trim(), kind, instructions: form.elements.instructions.value.trim(), input_fields: fields, output_format: kind === "compare" ? "json" : form.elements.output_format.value, output_requirements: form.elements.output_requirements.value.trim(), sample_inputs: samples, expected };
}

function validateFields(fields, subject) {
  const errors = [];
  if (!fields.length) errors.push(`${subject}至少需要一项有名称的材料。`);
  const keys = new Set();
  fields.forEach((field, index) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name)) errors.push(`第 ${index + 1} 项材料的字段名称（在“更多设置”里）须以英文字母或下划线开头，只能含英文字母、数字和下划线。`);
    if (keys.has(field.name)) errors.push(`字段名称“${field.name}”重复了，每项材料要用不同的字段名称。`);
    if (!field.label) errors.push(`请给第 ${index + 1} 项材料起一个名称。`);
    keys.add(field.name);
  });
  return errors;
}

function validateSkill(draft, test = false) {
  const errors = [];
  if (!draft.name) errors.push("请填写技能名称。");
  if (!draft.instructions) errors.push("请填写“具体做法”，说明这个技能怎么做。");
  errors.push(...validateFields(draft.input_fields, "技能"));
  if (draft.kind === "compare" && !draft.input_fields.some(field => field.role === "standard")) errors.push("对照型技能需要一项性质为“团队清单或底线”的材料。");
  (draft.expected || []).forEach(line => { if (!expectationPattern.test(line)) errors.push(`无法识别预期结论“${line}”。请按“R2 = 不一致”的格式写，每行一条。`); });
  if (test) draft.input_fields.forEach(field => { if (field.required && !String(draft.sample_inputs[field.name] || "").trim()) errors.push(`试用前，请填写“${field.label || field.name}”的样例材料。`); });
  return errors;
}

const expectationPattern = /^(?:(?:不应包含|不包含|应包含|包含)[：:]\s*.+|[A-Za-z][A-Za-z0-9_-]{0,19}\s*[=＝：:]\s*(?:不一致|需补材料|需要补充材料|符合|符合依据|退让内|在可接受退让内|不适用|待确认|需人工)(?:\s*[|｜或/]\s*(?:不一致|需补材料|需要补充材料|符合|符合依据|退让内|在可接受退让内|不适用|待确认|需人工))*)$/;

function skillPayload(draft) {
  const kind = draft.kind || "organize";
  const requirements = kind === "compare" && !draft.output_requirements ? COMPARE_OUTPUT : (draft.output_requirements || "").trim() || "按具体要求完成，用中文分条列出结果；引用材料时照抄原句。";
  return { name: draft.name, description: draft.description, kind, instructions: draft.instructions, input_fields: draft.input_fields, output_format: kind === "compare" ? "json" : draft.output_format, output_requirements: requirements, sample_inputs: draft.sample_inputs, expected: draft.expected || [] };
}

function privacyNote() {
  const provider = state.status?.provider || {};
  if (state.mode === "mock") return "";
  return provider.remote
    ? `<p class="privacy-note">材料会发送到 ${esc(provider.host || "外部 AI 服务")}，由 ${esc(provider.model || "AI")} 处理。请只提交允许发给这项服务的材料。</p>`
    : '<p class="privacy-note">材料只交给这台电脑上的 AI 处理，不会离开本机。</p>';
}

function defaultBinding(field, workflow) {
  const matching = workflow.input_fields.find(input => input.name === field.name);
  if (matching) return { source: "input", key: matching.name };
  return null;
}

const standardPattern = /底线|清单|政策|规则|标准|手册|范本|playbook|policy|rules|standard/i;
const previousPattern = /^(上一步|前一步)|提取的|摘出的|整理的条款|上一步/;

function suggestBindings(skill, workflow, index) {
  // Suggest sources from business labels; every guess is flagged and must be confirmed by the creator.
  const previous = index > 0 ? workflow.steps[index - 1]?.id : null;
  const bindings = {}, guessed = [];
  let previousUsed = false;
  const used = new Set();
  const choices = workflow.input_fields.filter(input => input.options?.length);
  const texts = workflow.input_fields.filter(input => !input.options?.length);
  for (const field of skill.input_fields) {
    const label = (field.label || "").trim();
    const sameLabel = workflow.input_fields.find(input => (input.label || "").trim() === label && label);
    const sameName = field.role === "original" ? workflow.input_fields.find(input => input.name === field.name) : null;
    let binding = null;
    if (sameLabel) binding = { source: "input", key: sameLabel.name };
    else if (field.role === "original" && (sameName || texts[0])) binding = { source: "input", key: (sameName || texts[0]).name };
    else if (previous && !previousUsed && (field.role === "previous" || previousPattern.test(label))) { binding = { source: "step", step_id: previous }; previousUsed = true; }
    else if (field.role === "standard" || standardPattern.test(label)) binding = { source: "playbook", title: label, items: [blankPlaybookItem(1)] };
    else if ((field.name === "situation" || /情形|角色|发布形式|渠道/.test(label)) && choices.length) binding = { source: "input", key: (choices.find(c => !used.has(c.name)) || choices[0]).name };
    else if (field.role === "context" && /背景|已有材料/.test(label)) { const rest = texts.find(input => !used.has(input.name) && input !== texts[0]); if (rest) binding = { source: "input", key: rest.name }; }
    if (binding?.source === "input") used.add(binding.key);
    bindings[field.name] = binding;
    if (binding) guessed.push(field.name);
  }
  return { bindings, guessed };
}

function blankPlaybookItem(n) {
  return { id: `R${n}`, title: "", severity: "中", preferred: "", fallback: "", escalate_to: "法务负责人", approved_text: "", fallback_text: "", source_ref: "" };
}

function makeStep(skill, workflow) {
  const step = { id: uid(), skill_id: skill?.id || "", input_bindings: {} };
  if (skill) {
    const { bindings, guessed } = suggestBindings(skill, workflow, workflow.steps.length);
    step.input_bindings = bindings;
    guessed.forEach(name => state.suggested.add(`${step.id}:${name}`));
  }
  return step;
}

function newWorkflow() {
  state.workflowReturn=null;
  state.workflowEditing = true; state.workflowStage = 0;
  state.workflowId = null;
  state.suggested = new Set();
  state.workflowDraft = { name: "", description: "", input_fields: [{ name: "document", label: "要审的文字", required: true }], steps: [] };
  state.errors.workflow = [];
  navigate("workflows");
}

function renderWorkflows() {
  if(state.workflowEditing && state.workflowDraft) return `${pageHead({ crumbs: [{ label: "工作流", action: "go-home" }, { label: state.workflowId ? "编辑流程" : "新建流程" }], title: state.workflowDraft.name || "新建流程", subtitle: `${state.workflowDraft.steps.length} 个步骤 · ${state.workflowDraft.input_fields.length} 项提交材料${state.workflowId ? ` · 第 ${state.workflows.find(w => w.id === state.workflowId)?.version || 1} 版` : " · 尚未保存"}` })}${renderWorkflowEditor(state.workflowDraft)}`;
  return `${pageHead({ crumbs: [{ label: "工作流" }], title: "我的流程", subtitle: "保存一项工作的做法，以后提交新材料就按同样的步骤处理", actions: actionButton('＋ 创建流程','new-workflow','','accent') })}<div class="library-grid methods-grid">${state.workflows.map(wf=>`<article class="method-card"><div class="method-top"><span class="method-icon">${icon('workflows')}</span></div><h2>${esc(wf.name)}</h2><p>${esc(wf.description||"提交材料，按保存的步骤完成这项工作。")}</p><div class="method-chain">${wf.steps.map((step,n)=>`<span><b>${n+1}</b>${esc(state.skills.find(x=>x.id===step.skill_id)?.name||'处理步骤')}</span>`).join('<i aria-hidden="true">↓</i>')}</div><div class="method-bottom">${actionButton('编辑流程','edit-workflow',`data-id="${esc(wf.id)}"`,'quiet')}${actionButton('使用流程 →','compose-run',`data-id="${esc(wf.id)}"`,'accent')}</div></article>`).join('')}</div>${!state.workflows.length?emptyState('还没有流程','可以先安装一个示例看看，也可以用技能库里的技能组成自己的流程。','install-examples','安装示例流程'):''}`;
}

function bindingValue(binding) {
  if (!binding) return "";
  return binding.source === "literal" ? "literal" : binding.source === "playbook" ? "playbook" : binding.source === "step" ? `step:${binding.step_id}` : `input:${binding.key}`;
}

function renderPlaybookItem(item, index, choices) {
  const when = item.applies_when;
  const chosen = choices.find(f => f.name === when?.input);
  const stale = when && !chosen;
  const staleValues = chosen ? (when.values || []).filter(v => !chosen.options.includes(v)) : [];
  return `<div class="pb-item" data-pb-index="${index}"><div class="pb-row">`
    + `<input data-pb="id" class="pb-id" value="${esc(item.id || "")}" aria-label="编号" placeholder="编号" maxlength="20">`
    + `<input data-pb="title" value="${esc(item.title || "")}" aria-label="条目名称" placeholder="条目名称，例如：保密期限" maxlength="120">`
    + `<select data-pb="severity" aria-label="严重度">${["高", "中", "低"].map(v => option(v, `严重度：${v}`, v === (item.severity || "中"))).join("")}</select>`
    + `<input data-pb="escalate_to" list="owner-options" aria-label="超出退让时谁决定" title="超出退让时谁决定，可以写团队自己的角色，例如公司秘书" value="${esc(item.escalate_to || "法务负责人")}" maxlength="20"><datalist id="owner-options">${["法务负责人", "合规负责人", "业务负责人", "经办人", "公司秘书", "法律顾问"].map(v => `<option value="${v}"></option>`).join("")}</datalist>`
    + `<label class="gate-field" title="勾选后，这一条不满足时结果标红，回复里只问这一件事，其余条目照常检查"><input type="checkbox" data-pb-gate${item.gate ? " checked" : ""}>前置条件</label>`
    + `<button type="button" class="button quiet icon-button destructive" data-action="remove-pb-item" data-index="${index}" aria-label="删除这一条">×</button></div>`
    + `<label class="pb-label">首选立场<textarea data-pb="preferred" aria-label="首选立场" placeholder="团队最希望看到的写法">${esc(item.preferred || "")}</textarea></label>`
    + `<label class="pb-label">可接受退让<span class="field-hint">多个选项写“以下任一：A；B”，多个条件写“须同时满足：①A；②B”。没有就留空。</span><textarea data-pb="fallback" aria-label="可接受退让" placeholder="做不到首选时，经办人可以接受的写法">${esc(item.fallback || "")}</textarea></label>`
    + `<details class="pb-more"${item.approved_text || when || item.source_ref ? " open" : ""}><summary>批准文本、适用条件和参考来源</summary>`
    + `<label class="pb-label">首选立场的批准文本<textarea data-pb="approved_text" aria-label="首选立场的批准文本" placeholder="判为不一致时，直接用作建议文字">${esc(item.approved_text || "")}</textarea></label>`
    + `<label class="pb-label">可接受退让的文本（内部）<textarea data-pb="fallback_text" aria-label="可接受退让的文本" placeholder="对方坚持时才拿出来，仅供内部使用">${esc(item.fallback_text || "")}</textarea></label>`
    + `<div class="pb-row"><select data-pb="when_input" aria-label="适用条件">${option("", "适用于所有情况", !when)}${stale ? option(when.input, "已失效的条件，请重新选择", true) : ""}${choices.map(f => option(f.name, `仅当「${f.label}」为…`, when?.input === f.name)).join("")}</select>`
    + `${chosen ? `<span class="pb-values">${chosen.options.map(o => `<label><input type="checkbox" data-pb-value value="${esc(o)}"${when.values?.includes(o) ? " checked" : ""}>${esc(o)}</label>`).join("")}${staleValues.map(o => `<label class="stale"><input type="checkbox" data-pb-value value="${esc(o)}" checked>${esc(o)}（选项已不存在）</label>`).join("")}</span>` : ""}</div>`
    + `${stale || staleValues.length ? '<p class="chain-hint">这条的适用条件引用的材料或选项已被修改。请重新选择，否则不能保存。</p>' : ""}`
    + `<input data-pb="source_ref" value="${esc(item.source_ref || "")}" aria-label="参考来源" placeholder="参考来源，例如：团队 NDA 底线 v3 / 监管指引名称" maxlength="500"></details></div>`;
}

function renderPlaybookEditor(step, field, binding, draft) {
  const choices = draft.input_fields.filter(f => f.options?.length);
  return `<div class="playbook-editor" data-playbook-step="${esc(step.id)}" data-playbook-field="${esc(field.name)}">`
    + `<p class="field-hint">每条写清首选立场和可接受退让。哪些条目适用、每条是否都有结论、结果交给谁处理，都由系统按这里的设置决定，不交给 AI 判断。</p>`
    + `${savedStandards(step.id).length ? `<label class="field compact pb-load"><span class="field-label">载入已保存的依据</span><select data-pb-load data-step="${esc(step.id)}" data-field="${esc(field.name)}">${option("", "选择一份，复制到这一步…", true)}${savedStandards(step.id).map((item, i) => option(String(i), `${item.binding.title}（${item.binding.items.length} 条 · 来自“${item.workflow.name}”第 ${item.workflow.version || 1} 版）`, false)).join("")}</select></label>` : ""}`
    + `<div class="pb-row"><label class="field compact"><span class="field-label">依据名称</span><input data-pb-title value="${esc(binding.title || "")}" placeholder="例如：营销审查清单 v1" maxlength="120"></label><label class="field compact"><span class="field-label">回复对象</span><input data-pb-reply value="${esc(binding.reply_to || "对方")}" placeholder="对方 / 市场同事" maxlength="20"></label></div>`
    + `${(binding.items || []).map((item, i) => renderPlaybookItem(item, i, choices)).join("")}`
    + `${actionButton("＋ 添加一条", "add-pb-item", `data-step="${esc(step.id)}" data-field="${esc(field.name)}"`, "secondary small")}</div>`;
}

function savedStandards(stepId) {
  const list = [];
  for (const workflow of state.workflows) for (const step of workflow.steps || []) for (const binding of Object.values(step.input_bindings || {}))
    if (binding?.source === "playbook" && !(workflow.id === state.workflowId && step.id === stepId)) list.push({ workflow, step, binding });
  return list;
}

function loadStandard(element) {
  captureWorkflowForm();
  const item = savedStandards(element.dataset.step)[Number(element.value)];
  const step = state.workflowDraft.steps.find(entry => entry.id === element.dataset.step);
  if (!item || !step) return;
  step.input_bindings[element.dataset.field] = clone(item.binding);
  const added = [], copied = [];
  if (item.step.skill_id === step.skill_id) {
    // Same task in the source flow: its saved fixed text (e.g. 写作要求) travels with the standard.
    const skill = state.skills.find(x => x.id === step.skill_id);
    for (const [name, binding] of Object.entries(item.step.input_bindings || {}))
      if (binding?.source === "literal" && !step.input_bindings[name]) { step.input_bindings[name] = clone(binding); copied.push(skill?.input_fields.find(f => f.name === name)?.label || name); }
  }
  for (const entry of item.binding.items) {
    const name = entry.applies_when?.input;
    if (name && !state.workflowDraft.input_fields.some(field => field.name === name)) {
      const source = item.workflow.input_fields.find(field => field.name === name);
      if (source) { state.workflowDraft.input_fields.push(clone(source)); added.push(source.label || name); }
    }
  }
  // New submission fields can fill sources that were still empty, e.g. 适用情形 ← 发布形式; each guess stays flagged.
  state.workflowDraft.steps.forEach((entry, index) => {
    const skill = state.skills.find(x => x.id === entry.skill_id);
    if (!skill) return;
    const { bindings } = suggestBindings(skill, state.workflowDraft, index);
    for (const field of skill.input_fields) if (!entry.input_bindings[field.name] && bindings[field.name]?.source === "input") {
      entry.input_bindings[field.name] = bindings[field.name]; state.suggested.add(`${entry.id}:${field.name}`);
    }
  });
  state.bindingOpen.add(step.id);
  render();
  notify(`已复制“${item.binding.title}”${copied.length ? `和${copied.join("、")}` : ""}。${added.length ? `依据的适用条件需要“${added.join("、")}”，已加入每次提交的材料。` : ""}`);
}

function capturePlaybook(editor, previous = null) {
  const items = $$(".pb-item", editor).map((row, index) => {
    const get = key => $(`[data-pb="${key}"]`, row)?.value ?? "";
    const input = get("when_input");
    const values = $$("[data-pb-value]", row).filter(box => box.checked).map(box => box.value);
    const item = { id: get("id").trim(), title: get("title").trim(), severity: get("severity"), escalate_to: get("escalate_to"),
      preferred: get("preferred").trim(), fallback: get("fallback").trim(), approved_text: get("approved_text").trim(), fallback_text: get("fallback_text").trim(), source_ref: get("source_ref").trim(),
      gate: Boolean($("[data-pb-gate]", row)?.checked) };
    if (input) item.applies_when = { input, values };
    const old = previous?.items?.[Number(row.dataset.pbIndex)] || {};
    return { ...Object.fromEntries(Object.entries(old).filter(([key]) => key !== "applies_when")), ...item };
  });
  return { source: "playbook", title: $("[data-pb-title]", editor)?.value.trim() || "", reply_to: $("[data-pb-reply]", editor)?.value.trim() || "对方", items };
}

function refreshBindingOptions() {
  const draft = state.workflowDraft;
  if (!draft) return;
  $$("[data-binding-step]").forEach(select => {
    const index = draft.steps.findIndex(step => step.id === select.dataset.bindingStep);
    if (index < 0) return;
    const selected = bindingValue(draft.steps[index].input_bindings[select.dataset.bindingField]);
    const available = draft.input_fields.map(field => [`input:${field.name}`, `本次提交 · ${field.label || field.name}`]);
    draft.steps.slice(0, index).forEach((step, previousIndex) => available.push([`step:${step.id}`, `第 ${previousIndex + 1} 步的结果 · ${state.skills.find(skill => skill.id === step.skill_id)?.name || "未选择技能"}`]));
    available.push(["playbook", "团队依据清单"], ["literal", "固定文字"]);
    select.innerHTML = `${available.some(([value]) => value === selected) ? "" : option(selected, selected ? "来源已不可用，请重新选择" : "请选择输入来源", true)}${available.map(([value, label]) => option(value, label, value === selected)).join("")}`;
  });
}

function renderStep(step,index,draft) {
  const skill=state.skills.find(item=>item.id===step.skill_id);
  const available=draft.input_fields.map(f=>[`input:${f.name}`,`本次提交 · ${f.label||f.name}`]);
  draft.steps.slice(0,index).forEach((previous,n)=>available.push([`step:${previous.id}`,`第 ${n+1} 步的结果 · ${state.skills.find(x=>x.id===previous.skill_id)?.name||'未选择技能'}`]));
  available.push(['playbook','团队依据清单'],['literal','固定文字']);
  const missing=skill?.input_fields.some(f=>f.required&&!step.input_bindings[f.name]);
  return `${index?'<div class="step-connector" aria-hidden="true">↓</div>':''}<article class="step-card"><div class="step-header"><span class="step-number">${index+1}</span><label class="step-picker"><span class="sr-only">第 ${index+1} 步使用的技能</span><select data-step-skill="${esc(step.id)}" aria-label="第 ${index+1} 步使用的技能">${option('','选择一个技能…',!skill)}${state.skills.map(item=>option(item.id,item.name,item.id===step.skill_id)).join('')}</select></label><div class="step-controls"><button type="button" class="button quiet icon-button" data-action="move-step-up" data-index="${index}" aria-label="将第 ${index+1} 步上移"${index===0?' disabled':''}>↑</button><button type="button" class="button quiet icon-button" data-action="move-step-down" data-index="${index}" aria-label="将第 ${index+1} 步下移"${index===draft.steps.length-1?' disabled':''}>↓</button><button type="button" class="button quiet icon-button destructive" data-action="remove-step" data-index="${index}" aria-label="删除第 ${index+1} 步">×</button></div></div>${skill?`<p class="step-description"><span class="kind-badge kind-${esc(skill.kind||'organize')}">${esc(kindInfo[skill.kind||'organize'].label)}</span>${esc(skill.description||'确认这一步的材料从哪里来。')}</p><p class="step-io"><span>接收</span>${skill.input_fields.filter(f=>step.input_bindings[f.name]).map(f=>esc(f.label||f.name)).join('、')||'尚未选择'}<span>交出</span>${esc(kindInfo[skill.kind||'organize'].output)}${index<draft.steps.length-1?` → 交给第 ${index+2} 步`:' · 最终结果'}</p><details class="binding-details" data-step-config="${esc(step.id)}"${missing||state.bindingOpen.has(step.id)||[...state.suggested].some(key=>key.startsWith(`${step.id}:`))?' open':''}><summary><span>${missing?'请选择材料来源':'使用的材料'}</span><span>${esc(skill.input_fields.map(f=>{const b=step.input_bindings[f.name];return !b?'待选择':b.source==='step'?`来自第 ${draft.steps.findIndex(s=>s.id===b.step_id)+1} 步`:b.source==='literal'?'固定文字':b.source==='playbook'?`团队依据：${b.title||'未命名'}（${(b.items||[]).length} 条）`:`本次提交：${draft.input_fields.find(x=>x.name===b.key)?.label||b.key}`}).join(' · '))}</span></summary><div class="step-body">${skill.input_fields.map(field=>{
    const binding=step.input_bindings?.[field.name],selected=bindingValue(binding),valid=available.some(([v])=>v===selected);
    return `<div class="binding-row"><label class="binding-label" for="binding-${esc(step.id)}-${esc(field.name)}">${esc(field.label||field.name)}${field.required?'<span class="optional">必填</span>':''}${state.suggested.has(`${step.id}:${field.name}`)?'<span class="suggest-tag">系统预选，请确认</span>':''}</label><select id="binding-${esc(step.id)}-${esc(field.name)}" data-binding-step="${esc(step.id)}" data-binding-field="${esc(field.name)}" aria-label="第 ${index+1} 步 ${esc(field.label||field.name)} 的来源">${!valid?option(selected,selected?'来源已不可用，请重新选择':'请选择输入来源',true):''}${available.map(([v,l])=>option(v,l,v===selected)).join('')}</select>${selected==='literal'?`<textarea data-literal-step="${esc(step.id)}" data-literal-field="${esc(field.name)}" aria-label="${esc(field.label||field.name)} 的固定文字" placeholder="固定文字，例如沟通对象和语气。清单或底线请改选“团队依据清单”。">${esc(binding?.value||'')}</textarea>`:''}${selected==='playbook'?renderPlaybookEditor(step,field,binding,draft):''}</div>`;
  }).join('')}${index>0&&!Object.values(step.input_bindings||{}).some(b=>b?.source==='step')?`<p class="chain-hint">这一步还没有使用前面步骤的结果。若要接着上一步处理，请把其中一项材料改为“第 ${index} 步的结果”。</p>`:''}</div></details>`:'<p class="caption step-description">选好技能后，再为它指定材料。</p>'}</article>`;
}

function renderWorkflowSummary(draft) {
  const { fixed, tasks } = workflowFacts(draft);
  const last = tasks.at(-1);
  const history = draft.history?.length ? `<details class="history-list"><summary>修改记录（${draft.history.length}）</summary><ol>${draft.history.map(h => `<li>第 ${esc(h.version)} 版 · ${esc(formatTime(h.at))} · ${esc(h.change_note || "未写修改说明")}${h.approved_by ? ` · ${esc(h.approved_by)} 批准` : ""}</li>`).join("")}</ol></details>` : "";
  const change = state.workflowId ? `<div class="change-note"><label class="field"><span class="field-label">修改说明</span><input name="change_note" value="${esc(draft.change_note || "")}" placeholder="例如：法务负责人同意接受英格兰法院管辖" maxlength="500"></label><label class="field"><span class="field-label">批准人</span><input name="approved_by" value="${esc(draft.approved_by || "")}" placeholder="例如：法务负责人" maxlength="80"></label></div>` : "";
  return `<section class="method-summary"><h2>保存前确认</h2><dl><div><dt>每次提交</dt><dd>${draft.input_fields.map(f => esc(f.label || "未命名材料") + (f.options?.length ? `（选项：${esc(f.options.join("、"))}）` : "")).join("、")}</dd></div>`
    + `<div><dt>团队依据</dt><dd>${fixed.length ? fixed.map(f => esc(f.label) + (f.items ? `（${f.items.length} 条）` : "")).join("、") : "还没有团队依据。如需清单或底线，在对应步骤的材料来源里选“团队依据清单”。"}</dd></div>`
    + `<div><dt>最后交出</dt><dd>${esc(last?.description || last?.name || "选择技能后显示")}</dd></div></dl>${change}${history}<p>保存后先用样例运行一次，核对结果和依据，再处理新材料。</p></section>`;
}

function renderWorkflowEditor(draft) {
  const stage=state.workflowStage;
  return `<form id="workflow-form" class="builder" novalidate>${wizardRail('workflow',['名称和用途','每次提交的材料','按顺序添加技能'],stage)}<div class="builder-main">${errorBox(state.errors.workflow,'workflow-errors')}<section class="wizard-page"${stage!==0?' hidden':''}><div class="editor-title"><h1>流程信息</h1><p>使用者提交材料前，会先看到这里的名称和用途。</p></div><label class="field"><span class="field-label">流程名称</span><input name="name" value="${esc(draft.name)}" placeholder="例如：营销材料预审" maxlength="120"></label><label class="field"><span class="field-label">用途与适用范围 <span class="optional">选填</span></span><textarea name="description" placeholder="谁使用？检查什么？得到什么意见？">${esc(draft.description)}</textarea></label><div class="builder-tip">团队依据（清单或底线）在第 3 步保存一次，使用者以后不必每次提交。</div></section><section class="wizard-page"${stage!==1?' hidden':''}><div class="editor-title"><h1>每次提交的材料</h1><p>列出每次都会变的内容，例如文案正文、发布形式和推广背景。使用者提交时按这些名称粘贴文字或做选择。如果某项信息决定哪些依据条目适用（例如发布形式），请在“更多设置”里把它设成下拉选项。</p></div>${renderInputFields(draft.input_fields,'workflow')}${actionButton('＋ 添加一项材料','add-workflow-input','','secondary small')}</section><section class="wizard-page"${stage!==2?' hidden':''}><div class="editor-title"><h1>按顺序添加技能</h1><p>每一步用一个技能。每一步的材料可以来自使用者提交的内容、前面步骤的结果或团队依据。</p></div>${draft.steps.map((step,index)=>renderStep(step,index,draft)).join('')}${!draft.steps.length?'<div class="builder-tip">例如先列出文案里需要证明的声明，再按团队依据逐条核对，最后起草给市场同事的回复。流程至少要两步。</div>':''}<div class="step-adders">${state.skills.length?`<button type="button" class="step-add" data-action="add-step"${draft.steps.length>=10?' disabled':''}>＋ 从技能库添加一步</button>`:''}${actionButton('＋ 新建一个技能','new-flow-skill','','secondary small')}</div><p class="field-hint">共 ${draft.steps.length} 步，至少需要 2 步。调整顺序后，请检查每一步的材料来源。</p>${renderWorkflowSummary(draft)}${jsonDetails('查看完整设置',draft)}</section><div class="wizard-footer">${stage>0?actionButton('← 上一步','wizard-stage',`data-kind="workflow" data-stage="${stage-1}"`,'quiet'):'<span class="caption"></span>'}${stage<2?actionButton('下一步 →','wizard-next','data-kind="workflow"','accent'):`<button type="submit" class="button accent"${busyAttr('save-workflow')}>${state.busy.has('save-workflow')?'保存中…':'保存流程'}</button>`}</div>${state.workflowId&&stage===2?`<div class="saved-next">${actionButton('使用这套流程 →','compose-run',`data-id="${esc(state.workflowId)}"`,'quiet')}</div>`:''}</div></form>`;
}

function captureWorkflowForm() {
  const form = $("#workflow-form");
  if (!form || !state.workflowDraft) return;
  const draft = state.workflowDraft;
  draft.name = form.elements.name.value.trim();
  draft.description = form.elements.description.value.trim();
  draft.input_fields = collectInputFields(form, "workflow");
  draft.change_note = form.elements.change_note?.value.trim() || "";
  draft.approved_by = form.elements.approved_by?.value.trim() || "";
  draft.steps.forEach(step => {
    const skillSelect = $$('[data-step-skill]', form).find(element => element.dataset.stepSkill === step.id);
    if (skillSelect) step.skill_id = skillSelect.value;
    const bindings = {};
    $$('[data-binding-step]', form).filter(element => element.dataset.bindingStep === step.id).forEach(element => {
      const key = element.dataset.bindingField;
      if (element.value === "playbook") {
        const editor = $$('[data-playbook-step]', form).find(item => item.dataset.playbookStep === step.id && item.dataset.playbookField === key);
        const previous = step.input_bindings?.[key];
        bindings[key] = editor ? capturePlaybook(editor, previous?.source === "playbook" ? previous : null) : previous?.source === "playbook" ? previous : { source: "playbook", title: "", items: [blankPlaybookItem(1)] };
      } else if (element.value === "literal") {
        const literal = $$('[data-literal-step]', form).find(item => item.dataset.literalStep === step.id && item.dataset.literalField === key);
        bindings[key] = { source: "literal", value: literal ? literal.value : step.input_bindings?.[key]?.value || "" };
      } else if (element.value.startsWith("input:")) bindings[key] = { source: "input", key: element.value.slice(6) };
      else if (element.value.startsWith("step:")) bindings[key] = { source: "step", step_id: element.value.slice(5) };
    });
    step.input_bindings = bindings;
  });
}

function validateWorkflow(draft) {
  const errors = [];
  if (!draft.name) errors.push("请给流程起一个名称。");
  errors.push(...validateFields(draft.input_fields, "流程"));
  if (draft.steps.length < 2) errors.push("请至少添加两个步骤，再保存流程。");
  if (draft.steps.length > 10) errors.push("每个流程最多 10 个步骤。");
  draft.steps.forEach((step, index) => {
    const skill = state.skills.find(item => item.id === step.skill_id);
    if (!skill) { errors.push(`请为第 ${index + 1} 步选择一项已保存的技能。`); return; }
    skill.input_fields.forEach(field => {
      const binding = step.input_bindings[field.name];
      const label = `第 ${index + 1} 步“${field.label || field.name}”`;
      if (!binding) { if (field.required) errors.push(`${label}尚未选择输入来源。`); return; }
      if (binding.source === "input" && !draft.input_fields.some(input => input.name === binding.key)) errors.push(`${label}用到的提交材料已删除，请重新选择来源。`);
      if (binding.source === "step" && !draft.steps.slice(0, index).some(previous => previous.id === binding.step_id)) errors.push(`${label}只能使用前面步骤的结果，请调整来源或顺序。`);
      if (binding.source === "literal" && field.required && !String(binding.value || "").trim()) errors.push(`${label}需要填写固定文字。`);
      if (binding.source === "playbook") {
        if (!binding.title) errors.push(`${label}的团队依据需要一个名称。`);
        if (!binding.items?.length) errors.push(`${label}的团队依据至少需要一条。`);
        const ids = new Set();
        (binding.items || []).forEach((item, n) => {
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(item.id || "") || ids.has(item.id)) errors.push(`${label}第 ${n + 1} 条的编号须唯一，以字母开头，例如 B1。`);
          ids.add(item.id);
          if (!item.title || !item.preferred) errors.push(`${label}第 ${n + 1} 条需要条目名称和首选立场。`);
          if (item.applies_when && !item.applies_when.values?.length) errors.push(`${label}第 ${n + 1} 条选了适用条件，但还没勾选适用的选项。`);
          const choice = draft.input_fields.find(f => f.name === item.applies_when?.input && f.options?.length);
          if (item.applies_when && (!choice || item.applies_when.values.some(v => !choice.options.includes(v)))) errors.push(`${label}第 ${n + 1} 条的适用条件引用的材料或选项已不存在，请重新选择。`);
        });
      }
    });
  });
  return errors;
}

function workflowPayload(draft) {
  const sample = Object.fromEntries(Object.entries(draft.sample_inputs || {}).filter(([key]) => draft.input_fields.some(field => field.name === key)));
  return { name: draft.name, description: draft.description, input_fields: draft.input_fields, steps: draft.steps, change_note: draft.change_note || "", approved_by: draft.approved_by || "", ...(Object.keys(sample).length ? { sample_inputs: sample } : {}) };
}

function captureRunForm() {
  const form = $("#run-form");
  if (!form) return;
  state.runInputs = Object.fromEntries($$("[data-run-field]", form).map(element => [element.dataset.runField, element.value]));
}

function captureCurrentForm() {
  captureSkillBrief();
  captureSkillForm();
  captureWorkflowForm();
  captureRunForm();
}

function renderRuns() {
  if(state.runScreen==='detail'&&state.selectedRun) {
    const run=state.selectedRun;
    return `${pageHead({ glyph: "runs", crumbs: [{ label: "运行记录", action: "show-history" }, { label: run.kind === "skill_test" ? "技能试用" : "处理结果" }], title: run.workflow_name || "处理结果", subtitle: `${esc(formatTime(run.created_at))} · ${run.mode === "mock" ? "演示运行，未调用 AI" : `${run.mode === "ollama" ? "本机 AI" : "DeepSeek"} ${esc(run.model || "")}`}${run.snapshot?.workflow?.version ? ` · 流程第 ${run.snapshot.workflow.version} 版` : ""}` })}<section id="run-output" aria-live="polite">${renderRunResult(run)}</section>`;
  }
  const workflow=state.workflows.find(x=>x.id===state.runComposerId);
  if(state.runScreen==='compose') return workflow?renderSubmission(workflow):emptyState('选择一套流程开始','流程决定检查哪些内容，以及最后交付什么结果。','go-home','返回工作流');
  return `${pageHead({ glyph: "runs", crumbs: [{ label: "运行记录" }], title: "运行记录", subtitle: `${state.runs.length} 条记录 · 每条都保存了当次的材料、所用设置和结果`, actions: actionButton('刷新','refresh-runs','','secondary','refresh-runs') })}<section class="history-panel"><div id="run-history-list">${renderHistory()}</div></section>`;
}

function renderHistory() {
  return state.runs.length?`<div class="history-labels"><span>名称</span><span>处理方式</span><span>状态</span></div>${state.runs.map(run=>`<button class="history-row" data-action="open-run" data-id="${esc(run.id)}"><span class="history-copy"><strong>${esc((run.workflow_name)||'未命名记录')}</strong><small>${esc(formatTime(run.created_at))} · ${run.kind==='skill_test'?'技能试用':'流程'}</small></span><span class="history-mode">${run.mode==='mock'?'演示':'AI 处理'}</span>${badge(run.status)}<span class="history-arrow">${arrow()}</span></button>`).join('')}`:emptyState('还没有运行记录','运行一次流程后，可以在这里查看当次的材料、结果和所用设置。','go-home','选择流程');
}

const reviewTypes = [
  { status: "issue", label: "与依据不一致", tone: "issue", action: true },
  { status: "not_returned", label: "AI 未给出结论，需人工检查", tone: "issue", action: true },
  { status: "unverified", label: "引文与原文不符，需人工检查", tone: "issue", action: true },
  { status: "model_error", label: "AI 调用失败", tone: "issue", action: true },
  { status: "needs_material", label: "需要补充材料", tone: "material", action: true },
  { status: "uncertain_scope", label: "适用范围待确认", tone: "scope", action: true },
  { status: "acceptable_fallback", label: "在可接受退让内", tone: "fallback", action: true },
  { status: "no_issue", label: "符合依据", tone: "clear", action: false },
  { status: "not_applicable", label: "本次不适用", tone: "neutral", action: false },
];

function labelsFor(run) {
  const fields = [...(run?.snapshot?.workflow?.input_fields || []), ...((run?.steps || []).flatMap(step => step.skill_snapshot?.input_fields || []))];
  return Object.fromEntries(fields.filter(f => f.label && f.label !== f.name).map(f => [f.name, f.label]));
}

function labelText(value, labels = {}) {
  // Replace internal input names the model sometimes echoes with the business labels of this run only.
  if (typeof value !== "string") return value;
  // Skip names that sit inside an English phrase, e.g. "this document", so quoted English is never altered.
  return Object.entries(labels).reduce((text, [name, label]) => text.replace(new RegExp(`(?<![A-Za-z][ \\t])\\b${name}\\b(?![ \\t]+[A-Za-z])`, "g"), label), value);
}

function locationText(location) {
  if (!location) return "";
  const where = location.clause ? `第 ${location.clause} ${location.clause_kind || "条"} · 第 ${location.line} 行` : `第 ${location.line} 行`;
  return location.input === "document" || !location.label ? where : `${location.label} · ${where}`;
}

function locationChip(check, run) {
  const location = check.location;
  if (!location) return "";
  const step = run ? reviewStep(run) : null;
  const original = step ? originalName(step) : "document";
  const outside = location.input !== original;
  return `<span class="location-chip${outside ? " outside" : ""}">${esc(locationText(location))}${outside ? "（不是原文）" : ""}</span>`;
}

function triageBanner(triage) {
  if (!triage) return "";
  return `<div class="triage triage-${esc(triage.level)}"><strong>${esc(triage.label)}</strong>${triage.reasons?.length ? `<span>${triage.reasons.map(reason => { const id = String(reason).match(/\b([A-Z]{1,3}\d+[A-Z]?)\b/)?.[1]; return id ? `<button type="button" class="triage-link" data-action="goto-card" data-rule="${esc(id)}">${esc(reason)}</button>` : esc(reason); }).join(" · ")}</span>` : ""}<small>分流按团队依据计算。前置条件未满足、高严重度条目不一致或缺材料、AI 漏答、适用范围待确认或需人工检查时，显示“需要负责人决定”。其余偏离、缺材料、退让和依据外条款，显示“经办人按依据处理”。</small></div>`;
}

function reviewOutput(value, rulesText = "", labels = {}, run = null) {
  const ruleTitles = new Map(ruleEntries(rulesText).map(rule => [rule.id, rule.title]));
  const checks = Array.isArray(value.checks) ? value.checks : [];
  const known = new Set(reviewTypes.map(type => type.status));
  const groups = reviewTypes.map(type => ({ ...type, checks: checks.filter(check => check && typeof check === "object" && check.status === type.status) }));
  const unrecognized = checks.filter(check => !check || typeof check !== "object" || !known.has(check.status));
  const actionable = groups.filter(group => group.action).reduce((total, group) => total + group.checks.length, 0);
  const has = item => item !== null && item !== undefined && (typeof item !== "string" || Boolean(item.trim())) && (!Array.isArray(item) || item.length > 0);
  const text = item => structuredOutput(labelText(item, labels), 1);
  function field(label, body, extra = "") { return `<div class="review-card-field${extra}"><div class="review-field-label">${label}</div>${body}</div>`; }
  function card(check, group) {
    if (!check || typeof check !== "object" || Array.isArray(check)) return `<article class="review-card neutral"><div class="review-card-head"><strong>未识别的检查项</strong></div><div class="review-card-body">${structuredOutput(check, 1)}</div></article>`;
    const title = check.title || ruleTitles.get(check.rule_id) || check.rule_id || "待核对事项";
    const parts = [];
    if (check.quote_found === false) parts.push('<p class="quote-audit-warning">这段引文在提交的材料中找不到，请人工核对。</p>');
    if (check.no_quote) parts.push('<p class="quote-audit-warning">AI 没有引用原文，这条“符合依据”需要人工核对。</p>');
    if (has(check.quote) && typeof check.quote === "string") parts.push(field(`原文 ${locationChip(check, run)}`, `<blockquote>${esc(check.quote)}</blockquote><button class="quote-locate" type="button" data-action="locate-quote" data-quote="${esc(check.quote)}">在原文中定位</button>`));
    if (check.quote_corrected) parts.push(`<p class="field-hint">AI 的引文和原文有出入，已按原文校正（AI 原来写的是“${esc(check.model_quote)}”）。</p>`);
    if (has(check.reason)) parts.push(field(check.decided_by ? "判断（由适用条件判定）" : check.model_reason !== undefined ? "系统判断" : "判断理由", text(check.reason)));
    if (has(check.model_reason)) parts.push(field("AI 原来的理由", text(check.model_reason)));
    if (Array.isArray(check.fallback_answers) && check.fallback_answers.length && check.status !== "no_issue") parts.push(field("可接受退让逐项核对", `<ul class="fallback-answers">${check.fallback_answers.map(a => `<li class="${a.met ? "met" : "unmet"}">${a.met ? "满足" : "不满足"} · ${esc(a.condition)}</li>`).join("")}</ul>`));
    if (group.action && check.basis && (has(check.basis.preferred) || has(check.basis.fallback))) parts.push(field("依据", `<div class="basis"><p><b>首选</b>${esc(check.basis.preferred || "—")}</p><p><b>可接受退让</b>${esc(check.basis.fallback || "无")}</p></div>`));
    if (has(check.needed_material)) parts.push(field("请补充", text(check.needed_material)));
    if (has(check.proposed_text)) parts.push(field(`建议回复的文字 <span class="source-tag${String(check.proposed_text_source || "").startsWith("团队批准文本") ? " approved" : ""}">${esc(check.proposed_text_source || "AI 起草，律师核对后才能发出")}</span>`, `<div class="proposed-text">${esc(check.proposed_text)}</div>`));
    if (has(check.fallback_text)) parts.push(field('可接受退让的文本 <span class="source-tag">内部，勿直接发出</span>', `<div class="proposed-text">${esc(check.fallback_text)}</div>`));
    if (has(check.internal_note)) parts.push(field("内部备注", text(check.internal_note)));
    if (has(check.decision)) parts.push(field("下一步", `<p class="decision">${esc(check.decision)}</p>`));
    if (has(check.source_ref)) parts.push(`<p class="source-ref">${esc(check.source_ref)}</p>`);
    const human = run?.human_review?.[check.rule_id];
    if (human) parts.push(`<p class="human-review">人工核对：${esc(human.label)}${human.note ? `（${esc(human.note)}）` : ""} · ${esc(human.by)} · ${esc(formatTime(human.at))}</p>`);
    if (run && run.status === "completed" && run.mode !== "mock" && check.rule_id && group.status !== "not_applicable") parts.push(`<div class="review-actions"><input data-review-note="${esc(check.rule_id)}" placeholder="核对备注（选填）" maxlength="500">${[["accepted", "采纳"], ["issue", "改判为与依据不一致"], ["no_issue", "改判为符合依据"]].map(([d, l]) => `<button type="button" class="button secondary small" data-action="human-review" data-rule="${esc(check.rule_id)}" data-decision="${d}">${l}</button>`).join("")}</div>`);
    const extra = Object.fromEntries(Object.entries(check).filter(([key]) => !["rule_id", "status", "quote", "location", "reason", "needed_material", "suggested_action", "decision_owner", "title", "severity", "escalate_to", "basis", "decision", "proposed_text", "proposed_text_source", "internal_note", "source_ref", "decided_by", "unknown_rule", "quote_found", "model_status", "fallback_text", "no_quote", "fallback_answers", "model_reason", "model_quote", "quote_corrected", "challenge_gaps", "challenge", "gate", "quote_outside_original"].includes(key)));
    return `<article class="review-card ${group.tone}"${check.rule_id ? ` id="card-${esc(check.rule_id)}" data-quote="${esc(typeof check.quote === "string" ? check.quote : "")}"` : ""}><div class="review-card-head"><strong>${check.rule_id ? `<span class="rule-id">${esc(check.rule_id)}</span>` : ""}${esc(title)}</strong><span class="review-tags">${check.gate ? '<span class="gate-tag">前置条件</span>' : ""}${check.severity ? `<span class="severity sev-${esc(check.severity)}">${esc(check.severity)}</span>` : ""}<span class="review-status ${group.tone}">${esc(group.label)}</span></span></div>`
      + `<div class="review-card-body">${parts.join("")}${check.unknown_rule ? '<p class="field-hint">这一项的编号不在依据清单中，请人工核对。</p>' : ""}${Object.keys(extra).length ? `<details class="review-extra"><summary>本条其他信息</summary>${structuredOutput(extra, 1)}</details>` : ""}</div></article>`;
  }
  const uncovered = Array.isArray(value.uncovered) ? value.uncovered.filter(item => item && typeof item === "object") : [];
  const uncoveredHtml = uncovered.length ? `<section class="review-group uncovered"><div class="review-group-title"><h4>依据外条款 · 需要人看</h4><span>${uncovered.length} 处</span></div><p class="field-hint">团队依据没有覆盖这些内容。这里由 AI 列出，可能不全，系统不对它们下结论。</p>${uncovered.map(item => `<article class="review-card neutral"><div class="review-card-head"><strong>${esc(item.clause || "依据外表述")}</strong></div><div class="review-card-body">${has(item.quote) ? field(`原文 ${locationChip(item, run)}`, `<blockquote>${esc(item.quote)}</blockquote><button class="quote-locate" type="button" data-action="locate-quote" data-quote="${esc(item.quote)}">在原文中定位</button>`) : ""}${has(item.note) ? field("提示", text(item.note)) : ""}</div></article>`).join("")}</section>` : "";
  const other = Object.fromEntries(Object.entries(value).filter(([key]) => !["checks", "summary", "scope", "uncovered", "triage", "playbook"].includes(key)));
  const coverage = value.coverage ? `<div class="coverage"><strong>原文共 ${value.coverage.total} 条编号条款 · 已检查或列出 ${value.coverage.covered.length} 条</strong>${value.coverage.unmentioned.length ? `<span>${value.coverage.unmentioned.map(c => `第 ${esc(c.clause)} 条`).join("、")}没有被任何依据条目或依据外扫描提到，请人工过目，确认没有遗漏风险。</span>` : "<span>每一条编号条款都已检查或列出。</span>"}</div>` : "";
  const scanFailed = value.uncovered_failed ? '<div class="quote-audit-warning">依据外条款的扫描没有完成。请人工通读全文，查看是否有依据未覆盖的风险。</div>' : "";
  return `<div class="review-report">${triageBanner(value.triage)}${coverage}${scanFailed}<div class="review-summary"><div class="review-summary-heading"><div><h3>${checks.length ? `<strong>${actionable}</strong> 项需要处理` : "本次没有生成检查项"}</h3></div><span class="review-total">${value.playbook ? `${esc(value.playbook.title)} · 第 ${esc(value.playbook.version)} 版 · ` : ""}共 ${checks.length} 项</span></div>`
    + `${has(value.summary) ? `<div class="review-summary-text">${text(value.summary)}</div>` : ""}`
    + `<div class="review-counts">${groups.filter(group => group.checks.length).map(group => `<span class="review-count ${group.tone}">${group.label}<strong>${group.checks.length}</strong></span>`).join("")}${uncovered.length ? `<span class="review-count neutral">依据外条款<strong>${uncovered.length}</strong></span>` : ""}</div></div>`
    + `${groups.filter(group => group.checks.length).map(group => group.action ? `<section class="review-group"><div class="review-group-title"><h4>${group.label}</h4><span>${group.checks.length} 项</span></div>${group.checks.map(check => card(check, group)).join("")}</section>` : `<details class="review-group review-collapsed"><summary>${group.label}<span>${group.checks.length} 项</span></summary>${group.checks.map(check => card(check, group)).join("")}</details>`).join("")}`
    + `${uncoveredHtml}${unrecognized.length ? `<section class="review-group"><div class="review-group-title"><h4>状态待确认</h4><span>${unrecognized.length} 项</span></div>${unrecognized.map(check => card(check, { tone: "neutral", label: "状态待确认" })).join("")}</section>` : ""}`
    + `${Object.keys(other).length ? `<details class="review-extra"><summary>其他信息</summary>${structuredOutput(other, 1)}</details>` : ""}</div>`;
}

function previousRun(run) {
  if (!run?.workflow_id) return null;
  const time = new Date(run.created_at).getTime();
  // Only a rerun of the same material is comparable; a different material would make every change look meaningful.
  const sameMaterial = item => JSON.stringify(item.inputs) === JSON.stringify(run.inputs);
  return state.runs.filter(item => item.id !== run.id && item.workflow_id === run.workflow_id && item.status === "completed" && item.mode !== "mock" && new Date(item.created_at).getTime() < time && sameMaterial(item))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function runDiff(run) {
  const before = previousRun(run), now = reviewStep(run), then = before && reviewStep(before);
  if (!now || !then) return "";
  const old = new Map((then.output.checks || []).map(check => [check.rule_id, check]));
  const versions = [before.snapshot?.workflow?.version, run.snapshot?.workflow?.version];
  // Items edited between the two versions explain their own change; any other change is the model varying on the same input.
  const edited = new Set((run.snapshot?.workflow?.history || []).filter(h => h.version > (versions[0] || 0)).flatMap(h => h.changes || []).map(c => c.match(/[A-Za-z][A-Za-z0-9_-]*/)?.[0]));
  const sameInputs = JSON.stringify(before.inputs) === JSON.stringify(run.inputs);
  const changes = [];
  for (const check of now.output.checks || []) {
    const prior = old.get(check.rule_id);
    const why = edited.has(check.rule_id) ? "本次修改的条目" : sameInputs ? "依据未改，变化来自 AI 前后判断不一致，请人工核对" : "材料有变化";
    if (!prior) { changes.push([`${check.rule_id} 新增：${statusText[check.status] || check.status}`, why]); continue; }
    if (prior.status !== check.status) changes.push([`${check.rule_id}：${statusText[prior.status] || prior.status} → ${statusText[check.status] || check.status}`, why]);
    else if ((prior.proposed_text_source || "") !== (check.proposed_text_source || "") && check.proposed_text_source) changes.push([`${check.rule_id}：建议文字的来源改为${check.proposed_text_source}`, why]);
  }
  const note = run.snapshot?.workflow?.history?.at(-1);
  return `<div class="run-diff"><strong>与上次运行相比</strong><span>${formatTime(before.created_at)} · 流程第 ${esc(versions[0] || "—")} 版 → 第 ${esc(versions[1] || "—")} 版${sameInputs ? " · 材料相同" : " · 材料有变化"}${versions[0] !== versions[1] && note?.change_note ? ` · 修改说明：${esc(note.change_note)}${note.approved_by ? `（${esc(note.approved_by)} 批准）` : ""}` : ""}</span>${changes.length ? `<ul>${changes.map(([change, why]) => `<li>${esc(change)}<small class="${why.startsWith("依据未改") ? "drift" : ""}">${esc(why)}</small></li>`).join("")}</ul>` : "<p>逐条结论没有变化。</p>"}</div>`;
}

function renderExpectations(run) {
  const list = run.expectations;
  if (!Array.isArray(list) || !list.length) return run.kind === "skill_test" && run.status === "completed" ? '<div class="expectations empty"><strong>还没有预期检查点</strong><span>在技能的试用部分写下结果里应该出现和不应该出现的内容，下次试用就会自动对照。</span></div>' : "";
  const hits = list.filter(item => item.hit).length;
  return `<div class="expectations${hits === list.length ? " all" : ""}"><strong>预期检查点 · 命中 ${hits}/${list.length}</strong><ul>${list.map(item => `<li class="${item.hit ? "hit" : "miss"}"><span>${item.hit ? "命中" : "未命中"}</span>${esc(item.text)}<small>${esc(item.actual)}</small></li>`).join("")}</ul>${hits === list.length ? "" : "<p>有检查点未命中，请调整具体做法或材料性质，再试用一次。</p>"}</div>`;
}

function readableDraft(run) {
  const value = run.final_output;
  return typeof value === "string" ? labelText(value, labelsFor(run)).replace(/[（(]\s*rule_id\s*[:：]\s*[A-Za-z0-9_-]+\s*[）)]/g, "") : value;
}

const statusText = Object.fromEntries(reviewTypes.map(type => [type.status, type.label]));

function reviewText(run) {
  const step = reviewStep(run); if (!step) return "";
  const labels = labelsFor(run), out = step.output;
  return [run.workflow_name, out.triage ? `分流：${out.triage.label}` : "", labelText(out.summary, labels) || "",
    ...(out.checks || []).map((c, i) => [`${i + 1}. ${c.rule_id || ""} ${c.title || ""} — ${statusText[c.status] || "状态待确认"}`,
      c.quote ? `原文：${c.quote}` : "", c.reason ? `理由：${labelText(c.reason, labels)}` : "", c.needed_material ? `请补充：${labelText(c.needed_material, labels)}` : "",
      c.proposed_text ? `建议给对方的文字（${c.proposed_text_source || "AI 起草"}）：${c.proposed_text}` : "", c.internal_note ? `内部备注：${c.internal_note}` : "", c.decision ? `下一步：${c.decision}` : ""].filter(Boolean).join("\n")),
    ...((out.uncovered || []).length ? ["依据外条款：", ...out.uncovered.map(u => `- ${u.clause || ""} ${u.quote || ""} ${u.note || ""}`)] : []),
    "本意见只覆盖团队依据中的条目，请结合完整材料复核。"].filter(Boolean).join("\n\n");
}

function clauseNumber(run, quote) {
  const document = typeof run.inputs?.document === "string" ? run.inputs.document : "";
  const line = document.split("\n").find(row => quote && row.includes(quote));
  return line?.match(/^\s*(\d{1,3})[.)、]/)?.[1] || "";
}

function replyTo(run) { return reviewStep(run)?.playbook?.reply_to || "对方"; }

function counterpartyText(run) {
  // Counterparty version: proposed wording only, grouped by clause; no internal notes, positions or reasons.
  const step = reviewStep(run); if (!step) return "";
  if (replyTo(run) !== "对方") {
    // Internal colleague (e.g. 市场同事): Chinese, sentence by sentence, plus the evidence still needed.
    const fixes = (step.output.checks || []).filter(c => c.status === "issue");
    const needs = (step.output.checks || []).filter(c => c.status === "needs_material");
    return [`${replyTo(run)}你好，预审意见如下（${step.output.playbook?.title || "团队清单"}）：`,
      fixes.length ? "一、需要修改" : "", ...fixes.map((c, i) => `${i + 1}. ${c.title}${c.location ? `（${locationText(c.location)}）` : ""}\n原句：${c.quote || "（原文没有相关表述，需要补上）"}\n建议：${c.proposed_text || c.reason}${c.proposed_text && !String(c.proposed_text_source || "").startsWith("团队批准文本") ? "\n[AI 起草，发出前请合规核对]" : ""}`),
      needs.length ? "二、需要补充的材料" : "", ...needs.map((c, i) => `${i + 1}. ${c.title}：${c.needed_material || c.reason}`),
      "补齐后请重新提交预审。是否发布由合规负责人决定。"].filter(Boolean).join("\n\n");
  }
  const items = (step.output.checks || []).filter(c => c.status === "issue" && c.proposed_text);
  const groups = new Map();
  for (const c of items) {
    const verified = c.quote && c.quote_found !== false;
    const key = verified ? (clauseNumber(run, c.quote) || c.quote) : `item:${c.rule_id}`;
    if (!groups.has(key)) groups.set(key, { clause: verified ? clauseNumber(run, c.quote) : "", quote: verified ? c.quote : "", texts: [] });
    const approved = String(c.proposed_text_source || "").startsWith("团队批准文本");
    groups.get(key).texts.push(`${c.proposed_text}${approved ? "" : "\n[AI 起草，发出前须律师核对]"}`);
  }
  return [...groups.values()].map((g, i) => `${g.clause ? `Clause ${g.clause}` : `Item ${i + 1}`}${g.quote ? `\nCurrent: ${g.quote}` : ""}\nProposed:\n${g.texts.join("\n")}`).join("\n\n");
}

function wordExport(run) {
  const step = reviewStep(run); if (!step) return "";
  const out = step.output, labels = labelsFor(run);
  const human = run.human_review || {};
  const rows = (out.checks || []).map(c => `<tr><td>${esc(c.rule_id || "")} ${esc(c.title || "")}</td><td>${esc(statusText[c.status] || c.status || "")}${human[c.rule_id] ? `<br><i>人工：${esc(human[c.rule_id].label)}</i>` : ""}</td><td>${esc(c.quote || "")}</td><td>${esc(labelText(c.reason || "", labels))}</td><td>${esc(c.proposed_text || "")}${c.proposed_text ? `<br><i>${esc(c.proposed_text_source || "")}</i>` : ""}${c.fallback_text ? `<br><b>可接受退让的文本（内部）：</b>${esc(c.fallback_text)}` : ""}</td><td>${esc(c.internal_note || "")}</td><td>${esc(c.decision || "")}</td></tr>`).join("");
  const uncovered = (out.uncovered || []).map(u => `<li>${esc(u.clause || "")} ${esc(u.quote || "")} — ${esc(u.note || "")}</li>`).join("");
  const scope = `本表只覆盖《${esc(out.playbook?.title || "团队依据")}》第 ${esc(out.playbook?.version || "—")} 版中的条目。依据外条款由 AI 列举，不保证完整${out.uncovered_failed ? "，本次扫描未完成" : ""}。`;
  return `<html><head><meta charset="utf-8"><title>${esc(run.workflow_name)}</title><style>body{font-family:Arial,"PingFang SC",sans-serif;font-size:10.5pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;vertical-align:top}th{background:#eee}.banner{font-weight:bold;color:#a8071a}</style></head><body>`
    + `<p class="banner">PRIVILEGED &amp; CONFIDENTIAL · 内部审阅表，含我方底线，请勿转发给对方</p><h1>${esc(run.workflow_name)}</h1>`
    + `<p>运行 ${esc(run.id)} · ${esc(formatTime(run.created_at))} · AI ${esc(run.model || "")} · ${out.triage ? esc(out.triage.label) : ""}</p><p>${scope}</p><p>${esc(labelText(out.summary || "", labels))}</p>`
    + `<table><tr><th>条目</th><th>结论</th><th>原文</th><th>理由</th><th>建议回复的文字</th><th>内部备注</th><th>下一步</th></tr>${rows}</table>`
    + `${uncovered ? `<h2>依据外条款（AI 列举，不保证完整）</h2><ul>${uncovered}</ul>` : ""}<p>这是 AI 生成的审阅草稿，须由负责律师核对后使用。标为 AI 起草的文字，核对后才能发出。</p></body></html>`;
}

const keyLabels = { reply_to_marketing: "给市场同事的回复", internal_note: "给负责人的内部备注", recommended_outcome: "建议结论（由负责人决定）", needs_owner_decision: "需要负责人决定的条目",
  intake: "受理登记", product_type: "产品类型", audience: "面向的投资者", market: "拟发布市场", promotion_relationship: "推广关系", publisher_identity: "发布者身份", confirmed_entity_name: "已确认发布主体", materials_provided: "已提供材料", materials_missing: "未提供材料", evidence_needed: "需要的证明", evidence_status: "证明是否已提供",
  announcement: "公告", issuer: "发行人", stock_code: "股份代号", title: "标题", date: "日期", facts: "公告里的关键事实", category: "类别", fact: "事实", section: "所在小标题", not_found: "公告里没找到的项目",
  clauses: "条款", number: "条款号", type: "类型", quote: "原文", found: "是否找到", location: "位置", items: "条目", id: "编号", summary: "概要", scope: "范围", note: "提示", clause: "条款" };

function inlineText(text) {
  return esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function readableText(value) {
  // Small Markdown subset for model text: escape first, then headings, lists, tables and bold only.
  let source = String(value ?? "").replace(/\r\n?/g, "\n");
  if (/\\"/.test(source) && !/[{}[\]]/.test(source)) source = source.replace(/\\"/g, '"');
  const lines = source.split("\n");
  const out = [], stack = [];
  let paragraph = [], table = [];
  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(inlineText).join("<br>")}</p>`); paragraph = []; } };
  const closeLists = (depth = 0) => { while (stack.length > depth) out.push(`</li></${stack.pop()}>`); };
  const flushTable = () => {
    if (!table.length) return;
    const separator = /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/;
    const body = table.length > 1 && separator.test(table[1].trim()) ? [table[0], ...table.slice(2)] : table;
    const rows = body.filter(row => !separator.test(row.trim())).map(row => row.trim().replace(/^\||\|$/g, "").split("|").map(cell => inlineText(cell.trim())));
    if (rows.length) out.push(`<table class="md-table"><thead><tr>${rows[0].map(cell => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    table = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*\|.*\|\s*$/.test(line)) { flushParagraph(); closeLists(); table.push(line); continue; }
    flushTable();
    const heading = line.match(/^\s*#{1,4}\s+(.+)$/);
    const item = line.match(/^(\s*)(?:([-*•])|(\d{1,3})[.)、])\s+(.+)$/);
    if (!line.trim()) { flushParagraph(); continue; }
    if (/^\s*-{3,}\s*$/.test(line)) { flushParagraph(); closeLists(); out.push("<hr>"); continue; }
    if (heading) { flushParagraph(); closeLists(); out.push(`<h4>${inlineText(heading[1])}</h4>`); continue; }
    if (item) {
      flushParagraph();
      const depth = Math.min(3, Math.floor(item[1].replace(/\t/g, "  ").length / 2) + 1);
      const tag = item[3] ? "ol" : "ul";
      if (stack.length >= depth && stack[depth - 1] !== tag) closeLists(depth - 1);
      const value = item[3] ? ` value="${Number(item[3])}"` : "";
      if (stack.length >= depth) { closeLists(depth); out.push(`</li><li${value}>`); }
      while (stack.length < depth) { stack.push(tag); out.push(`<${tag}><li${stack.length === depth ? value : ""}>`); }
      out.push(inlineText(item[4]));
      continue;
    }
    if (stack.length && /^\s{2,}/.test(raw)) { out.push(`<br>${inlineText(line.trim())}`); continue; }
    closeLists();
    paragraph.push(line.trim());
  }
  flushTable(); flushParagraph(); closeLists();
  return out.join("").replace(/<li><\/li>/g, "");
}

function structuredOutput(value, depth = 0) {
  if (value === null || value === undefined) return '<span class="result-null">无</span>';
  if (depth === 0 && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.checks)) return reviewOutput(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value !== "object") return `<div class="result-text md">${readableText(value)}</div>`;
  if (depth > 5) return `<pre class="result-text">${esc(JSON.stringify(value, null, 2))}</pre>`;
  if (Array.isArray(value)) return value.length ? `<ol class="result-array">${value.map(item => `<li>${structuredOutput(item, depth + 1)}</li>`).join("")}</ol>` : '<span class="result-null">无</span>';
  const entries = Object.entries(value);
  return entries.length ? `<dl class="result-fields">${entries.map(([key, item]) => `<div class="result-field"><dt>${esc(keyLabels[key] || key)}</dt><dd>${structuredOutput(item, depth + 1)}</dd></div>`).join("")}</dl>` : '<span class="result-null">无</span>';
}

function reviewBrief(out) {
  // The full item-by-item review lives in the review tab; the details tab only summarises it.
  const counts = new Map();
  (out.checks || []).forEach(check => { const name = statusText[check.status] || check.status; counts.set(name, (counts.get(name) || 0) + 1); });
  const parts = [...counts].map(([name, n]) => `${name} ${n} 条`).join("，");
  return `<div class="review-brief"><p><strong>${esc(out.triage?.label || "")}</strong></p><p>${esc(parts)}。</p><p class="caption">逐条意见在“审查意见”标签里，这里不再重复。</p></div>`;
}

function jsonDetails(label, value) {
  return `<details class="json-details"><summary>${esc(label)}</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details>`;
}

function checkDocumentQuotes(output, documentText) {
  if (typeof documentText !== "string") return null;
  const result = { total: 0, missing: [] };
  function visit(value, path) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}[${index}]`)); return; }
    Object.entries(value).forEach(([key, item]) => {
      const itemPath = path ? `${path}.${key}` : key;
      if (key === "quote" && typeof item === "string" && item.trim()) {
        result.total++;
        if (!documentText.includes(item)) result.missing.push({ path: itemPath, quote: item });
      } else if (item && typeof item === "object") visit(item, itemPath);
    });
  }
  visit(output, "");
  return result.total ? result : null;
}

function renderStepQuoteCheck(step) {
  const result = checkDocumentQuotes(step.output, step.inputs?.document);
  if (!result) return "";
  if (!result.missing.length) return `<div class="quote-audit-note">${result.total} 处引文都能在原文中找到。引文准确不代表判断正确。</div>`;
  const unique = new Map();
  result.missing.forEach(item => {
    if (!unique.has(item.quote)) unique.set(item.quote, []);
    unique.get(item.quote).push(item.path);
  });
  return `<div class="quote-audit-warning"><strong>${result.total} 处引用中，有 ${result.missing.length} 处需要核对来源</strong><p>这些引文在提交的原文里找不到，请人工核对出处。AI 的原始结果已保留。</p><details${unique.size <= 2 ? " open" : ""}><summary>查看找不到的引文（${unique.size} 段）</summary><ol>${Array.from(unique, ([quote, paths]) => `<li><blockquote>${esc(quote)}</blockquote></li>`).join("")}</ol></details></div>`;
}

function renderRunQuoteSummary(run) {
  const checked = (run.steps || []).map((step, index) => ({ step, index, result: checkDocumentQuotes(step.output, step.inputs?.document) })).filter(item => item.result);
  if (!checked.length) return "";
  const warnings = checked.filter(item => item.result.missing.length);
  if (!warnings.length) return '<div class="quote-audit-note">各步引文都能在原文中找到。引文准确不代表判断正确。</div>';
  return `<div class="quote-audit-warning compact"><strong>有引文需要核对出处</strong><p>${warnings.map(item => `第 ${item.index + 1} 步“${esc(item.step.name || item.step.skill_snapshot?.name || "未命名技能")}”有 ${item.result.missing.length} 处引文在这一步的原文里找不到。`).join(" ")}请展开对应步骤核对出处，再使用结果。</p></div>`;
}

function canReturnToSkillDraft(runId) {
  return Boolean(state.skillDraft && state.skillDraftToken && state.skillTestOrigins.get(runId) === state.skillDraftToken);
}

function renderSkillTestNotice(run) {
  if (run.kind !== "skill_test") return "";
  const available = canReturnToSkillDraft(run.id);
  return `<div class="intro-note"><div><strong>本次试用尚未保存</strong><br>试用完成后，请返回技能页面保存。${available ? `<div class="actions spaced-top">${actionButton("返回技能并保存", "return-skill-draft", `data-id="${esc(run.id)}"`, "secondary small")}</div>` : '<div class="field-hint">这份草稿没有保存。请在技能库重新创建，或从处理详情找回本次试用的设置。</div>'}</div></div>`;
}

function passthrough(run, step) {
  const rows = Object.entries(step.input_bindings || {}).map(([name, binding]) => {
    const label = step.skill_snapshot?.input_fields?.find(f => f.name === name)?.label || name;
    if (binding.source === "step") {
      const index = (run.steps || []).findIndex(item => item.id === binding.step_id);
      const same = index >= 0 && step.inputs && JSON.stringify(step.inputs[name]) === JSON.stringify(run.steps[index].output);
      return `<li>${esc(label)} ← 第 ${index + 1} 步的输出${step.inputs ? (same ? '<b class="ok">已核对：内容完全一致</b>' : '<b class="bad">与第 ' + (index + 1) + ' 步输出不一致</b>') : ""}</li>`;
    }
    if (binding.source === "playbook") return `<li>${esc(label)} ← 团队依据《${esc(binding.title)}》${step.playbook ? `：适用 ${step.playbook.applicable.length} 条，${step.playbook.excluded.length} 条由适用条件排除` : ""}</li>`;
    if (binding.source === "literal") return `<li>${esc(label)} ← 流程保存的固定文字</li>`;
    const field = run.snapshot?.workflow?.input_fields?.find(f => f.name === binding.key);
    return `<li>${esc(label)} ← 本次提交 · ${esc(field?.label || binding.key)}</li>`;
  });
  return rows.length && run.kind !== "skill_test" ? `<ul class="passthrough">${rows.join("")}</ul>` : "";
}

function renderExecutionDetails(run) {
  const mock = run.mode === "mock";
  const snapshot = run.snapshot || {};
  const workflowSnapshot = snapshot.workflow || snapshot;
  const version = workflowSnapshot.version || "—";
  const steps = run.steps || [];
  const duration = run.created_at && run.finished_at ? Math.max(0, (new Date(run.finished_at) - new Date(run.created_at)) / 1000).toFixed(1) : null;
  return `<div class="run-heading"><div class="run-heading-top"><div><h2>${esc(run.workflow_name || (run.kind === "skill_test" ? "技能试用" : "流程运行"))}</h2></div>${badge(run.status)}</div><div class="run-meta"><span>${run.kind === "skill_test" ? "本次试用尚未保存" : `第 ${esc(version)} 版`}</span><span>${esc(formatTime(run.created_at))}</span>${duration !== null ? `<span>${esc(duration)} 秒</span>` : ""}<a class="text-link" href="/api/runs/${encodeURIComponent(run.id)}/export" download>下载 JSON ↗</a></div><div class="model-notice${mock ? " mock" : ""}">${mock ? "演示运行，未调用 AI。这里的输出只用来检查界面、保存和步骤之间的传递。" : `真实模型调用 · ${esc(run.mode === "ollama" ? "Ollama" : run.mode === "openai" ? "OpenAI-compatible" : run.mode)} · ${esc(run.model || "模型名称未返回")}`} ${!finalStates.has(run.status) ? "正在执行，状态会自动更新。" : ""}</div></div><div class="run-content">${renderSkillTestNotice(run)}${run.error ? `<div class="form-error run-error" role="alert">${esc(run.error)}${run.status === "interrupted" ? " 已保存的流程仍可使用，重新运行即可生成新记录。" : " 请查看失败步骤的输入和错误信息，处理后重新运行。"}</div>` : ""}${steps.map((step, index) => `<details class="execution-step" data-run-step="${esc(step.id)}"${step.status === "failed" || step.status === "running" ? " open" : ""}><summary><span class="step-number">${String(index + 1).padStart(2, "0")}</span><strong>${esc(step.name || step.skill_snapshot?.name || `步骤 ${index + 1}`)}</strong>${badge(step.status)}</summary><div class="step-result-body"><div class="run-meta"><span>技能第 ${esc(step.skill_snapshot?.version || "—")} 版</span>${step.duration_ms != null ? `<span>${(step.duration_ms / 1000).toFixed(1)} 秒</span>` : ""}</div>${passthrough(run, step)}${step.inputs !== undefined && step.inputs !== null ? jsonDetails("查看本步骤实际输入", step.inputs) : ""}${step.input_bindings ? jsonDetails("查看输入来源绑定", step.input_bindings) : ""}${step.error ? `<div class="form-error spaced-top">${esc(step.error)}</div>` : ""}${step.output !== null && step.output !== undefined ? `${renderStepQuoteCheck(step)}<div class="spaced-top"><p class="result-label">本步骤输出</p><div class="structured-output">${step.output?.checks ? reviewBrief(step.output) : structuredOutput(step.output)}</div></div>${jsonDetails("查看原始输出 JSON", step.output)}` : step.output_text ? `<div class="spaced-top"><p class="result-label">模型原始输出</p><pre class="result-text">${esc(step.output_text)}</pre></div>` : `<p class="caption spaced-top">${step.status === "running" ? "正在处理这一步…" : step.status === "skipped" ? "前面步骤未成功，本步骤没有执行。" : step.status === "failed" ? "本步骤未生成可用结果。" : "等待前面步骤完成。"}</p>`}</div></details>`).join("")}${run.status === "completed" ? `<section class="final-result"><h3>最终结果</h3>${renderRunQuoteSummary(run)}<div class="structured-output">${run.final_output?.checks ? reviewBrief(run.final_output) : structuredOutput(run.final_output)}</div>${jsonDetails("查看最终结果原始 JSON", run.final_output)}<div class="verification-note">请逐项对照原文引用、所用依据和适用条件。材料里无法确认的内容，留作人工复核事项。${mock ? " 这是演示运行，不能用来评价审查质量。" : "AI 处理完成不代表审查结论已经确认。"}</div></section>` : ""}${jsonDetails("查看本次运行的配置快照", snapshot)}<p class="field-hint">运行编号：${esc(run.id)}</p></div>`;
}

function upsert(collection, item) {
  const index = collection.findIndex(existing => existing.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
}

async function perform(key, task, errorKind = "") {
  if (state.busy.has(key)) return;
  state.busy.add(key);
  render();
  try { await task(); }
  catch (error) {
    if (errorKind) { state.errors[errorKind] = [error.message]; }
    else banner(error.message);
  } finally {
    state.busy.delete(key);
    render();
  }
}

async function saveSkill() {
  captureSkillForm();
  const errors = validateSkill(state.skillDraft);
  setFormErrors("skill", errors);
  if (errors.length) return;
  const payload = skillPayload(state.skillDraft);
  const id = state.skillId;
  await perform("save-skill", async () => {
    const saved = await api(id ? `/skills/${encodeURIComponent(id)}` : "/skills", { method: id ? "PUT" : "POST", body: payload });
    upsert(state.skills, saved);
    state.skillId = saved.id;
    state.skillDraft = clone(saved);
    state.errors.skill = [];
    state.skillEditing = false; state.savedSkillNotice = saved.id;
    if(state.workflowReturn) {returnToWorkflow(saved);notify("技能已保存，并加入了原来的流程。请确认它的材料来源。");}
    else notify("技能已保存，可以加入流程。");
  }, "skill");
}

async function testSkill() {
  captureSkillForm();
  const errors = validateSkill(state.skillDraft, true);
  setFormErrors("skill", errors);
  if (errors.length) return;
  if (!state.skillDraftToken) state.skillDraftToken = uid();
  const draftToken = state.skillDraftToken;
  const payload = { skill: skillPayload(state.skillDraft), inputs: state.skillDraft.sample_inputs, mode: state.mode };
  await perform("test-skill", async () => {
    const run = await api("/skills/test", { method: "POST", body: payload });
    state.skillTestOrigins.set(run.id, draftToken);
    state.selectedRun = run;
    state.runScreen = "detail"; state.resultTab = "report"; state.sourceQuote = "";
    upsert(state.runs, run);
    state.runComposerId = null;
    navigate("runs");
    schedulePoll();
    notify("试用已开始。试用不会自动保存技能。");
  }, "skill");
}

async function saveWorkflow() {
  captureWorkflowForm();
  const errors = validateWorkflow(state.workflowDraft);
  setFormErrors("workflow", errors);
  if (errors.length) { notify(`还不能保存。${errors[0]}`); return; }
  const payload = workflowPayload(state.workflowDraft);
  const id = state.workflowId;
  await perform("save-workflow", async () => {
    const saved = await api(id ? `/workflows/${encodeURIComponent(id)}` : "/workflows", { method: id ? "PUT" : "POST", body: payload });
    upsert(state.workflows, saved);
    state.workflowId = saved.id;
    state.workflowDraft = clone(saved);
    state.errors.workflow = [];
    state.workflowEditing = false;
    state.suggested = new Set();
    notify(`流程已保存（第 ${saved.version} 版），可以开始使用。`);
    navigate("overview");
  }, "workflow");
}

async function runWorkflow() {
  captureRunForm();
  const workflow = state.workflows.find(item => item.id === state.runComposerId);
  if (!workflow) return;
  const errors = [
    ...validateWorkflow(workflow).map(error => `流程配置需要修正：${error}`),
    ...workflow.input_fields.filter(field => field.required && !String(state.runInputs[field.name] || "").trim()).map(field => `请填写“${field.label||field.name}”。`),
  ];
  setFormErrors("run", errors);
  if (errors.length) return;
  const payload = { workflow_id: workflow.id, inputs: clone(state.runInputs), mode: state.mode };
  await perform("run", async () => {
    const run = await api("/runs", { method: "POST", body: payload });
    state.selectedRun = run;
    state.runScreen = "detail"; state.resultTab = "report"; state.sourceQuote = "";
    upsert(state.runs, run);
    state.errors.run = [];
    navigate("runs");
    schedulePoll();
    notify("正在处理材料。");
  }, "run");
}

function schedulePoll() {
  clearTimeout(state.poll);
  if (!state.selectedRun || finalStates.has(state.selectedRun.status) || state.view !== "runs") return;
  const id = state.selectedRun.id;
  state.poll = setTimeout(async () => {
    try {
      const run = await api(`/runs/${encodeURIComponent(id)}`);
      if (state.selectedRun?.id !== id || state.view !== "runs") return;
      state.selectedRun = run;
      upsert(state.runs, run);
      updateRunPanel();
      if (finalStates.has(run.status)) {
        render();
        notify(run.status === "completed" ? (run.kind === "skill_test" ? "试用完成。核对结果后，回到技能页面保存。" : reviewStep(run) ? "审查意见已生成，请逐条核对。" : "处理完成，请核对结果。") : "处理没有完成，请在“处理详情”查看失败的步骤。");
      } else schedulePoll();
    } catch (error) {
      banner(`${error.message} 这次运行的状态还不确定。重新连接后，可以在“运行记录”里继续查看。`);
    }
  }, 1800);
}

function updateRunPanel() {
  const output = $("#run-output");
  if (output && state.selectedRun) {
    const closed = new Set($$("details[data-run-step]", output).filter(element => !element.open).map(element => element.dataset.runStep));
    const openJson = new Set($$(".json-details[open]", output).map(element => $("summary", element)?.textContent));
    output.innerHTML = renderRunResult(state.selectedRun);
    $$("details[data-run-step]", output).forEach(element => { if (closed.has(element.dataset.runStep)) element.open = false; });
    $$(".json-details", output).forEach(element => { if (openJson.has($("summary", element)?.textContent)) element.open = true; });
  }
  const historyList = $("#run-history-list");
  if (historyList) historyList.innerHTML = renderHistory();
}

async function openRun(id) {
  captureCurrentForm();
  clearTimeout(state.poll);
  await perform("open-run", async () => {
    state.selectedRun = await api(`/runs/${encodeURIComponent(id)}`);
    state.runScreen = "detail"; state.resultTab = "report"; state.sourceQuote = "";
    upsert(state.runs, state.selectedRun);
    navigate("runs");
    schedulePoll();
  });
}

async function installExamples(start = false, example = "starter") {
  captureCurrentForm();
  await perform("install", async () => {
    const result = await api("/examples/install", { method: "POST", body: { example } });
    result.skills.forEach(skill => upsert(state.skills, skill));
    upsert(state.workflows, result.workflow);
    state.workflowId = result.workflow.id;
    state.workflowDraft = clone(result.workflow);
    state.runComposerId = result.workflow.id;
    state.runInputs = {};
    state.errors.workflow = [];
    state.workflowEditing = false;
    if(start) { state.runScreen="compose"; navigate("runs"); } else navigate("workflows");
    notify("示例流程已安装，请提交本次材料。");
  });
}

async function refreshAll() {
  captureCurrentForm();
  await perform("refresh", async () => {
    const [status, skills, workflows, runs, examples] = await Promise.all([api("/status"), api("/skills"), api("/workflows"), api("/runs"), api("/examples")]);
    Object.assign(state, { status, skills, workflows, runs, examples });
    if (!(status.provider?.configured && status.provider.mode !== "mock")) state.mode = "mock";
    banner();
    if (state.selectedRun) {
      state.selectedRun = await api(`/runs/${encodeURIComponent(state.selectedRun.id)}`);
      schedulePoll();
    }
    notify("已刷新流程、技能和运行记录。");
  });
}

function editSkill(id) {
  state.skillEntry=false;state.draftQuestions=[];state.workflowReturn=null;
  state.skillEditing = true; state.skillStage = 0;
  captureCurrentForm();
  const skill = state.skills.find(item => item.id === id);
  if (!skill) return;
  state.skillId = id;
  state.skillDraftToken = uid();
  state.skillDraft = clone(skill);
  state.errors.skill = [];
  navigate("skills");
}

function editWorkflow(id) {
  state.workflowEditing = true; state.workflowStage = 0;
  captureCurrentForm();
  const workflow = state.workflows.find(item => item.id === id);
  if (!workflow) return;
  state.workflowId = id;
  state.suggested = new Set();
  state.workflowDraft = clone(workflow);
  state.errors.workflow = [];
  navigate("workflows");
}

function lastRunInputs(workflow) {
  if (!workflow) return null;
  const run = state.runs.find(item => item.workflow_id === workflow.id && item.inputs && Object.keys(item.inputs).length);
  if (run) return run.inputs;
  const first = state.skills.find(skill => skill.id === workflow.steps?.[0]?.skill_id);
  const sample = first?.sample_inputs || {};
  const mapped = {};
  for (const [field, binding] of Object.entries(workflow.steps?.[0]?.input_bindings || {})) if (binding?.source === "input" && sample[field]) mapped[binding.key] = sample[field];
  return Object.keys(mapped).length ? mapped : null;
}

function composeRun(id) {
  state.runScreen = "compose";
  captureCurrentForm();
  if (state.runComposerId !== id) state.runInputs = {};
  state.runComposerId = id;
  state.errors.run = [];
  navigate("runs");
}

async function handleAction(action, element) {
  const index = Number(element.dataset.index);
  if (action === "add-pb-item" || action === "remove-pb-item") {
    captureWorkflowForm();
    const editor = element.closest("[data-playbook-step]");
    const step = state.workflowDraft.steps.find(item => item.id === editor.dataset.playbookStep);
    const binding = step.input_bindings[editor.dataset.playbookField];
    if (action === "add-pb-item") {
      let n = binding.items.length + 1;
      while (binding.items.some(item => item.id === `R${n}`)) n++;
      binding.items.push(blankPlaybookItem(n));
    }
    else binding.items.splice(index, 1);
    render(); return;
  }
  if (action === "edit-standard") {
    editWorkflow(element.dataset.id);
    state.workflowStage = 2;
    state.workflowDraft.steps.forEach(step => { if (Object.values(step.input_bindings || {}).some(b => b?.source === "playbook")) state.bindingOpen.add(step.id); });
    render(); return;
  }
  if (action === "human-review") {
    const run = state.selectedRun, rule = element.dataset.rule;
    const note = $$("[data-review-note]").find(input => input.dataset.reviewNote === rule)?.value || "";
    await perform("human-review", async () => {
      state.selectedRun = await api(`/runs/${encodeURIComponent(run.id)}/review`, { method: "POST", body: { rule_id: rule, decision: element.dataset.decision, note } });
      upsert(state.runs, state.selectedRun);
      notify("人工核对已记录，AI 原来的结果仍然保留。");
    });
    return;
  }
  if (action === "copy-counterparty") {
    const value = counterpartyText(state.selectedRun);
    if (!value) { notify("没有需要发出的修改文字。"); return; }
    try { await navigator.clipboard.writeText(value); notify(`给${replyTo(state.selectedRun)}的修改已复制，请核对后发送。`); } catch { banner("自动复制没有成功，请手动选中文字复制。"); }
    return;
  }
  if (action === "download-word") {
    const run = state.selectedRun;
    const blob = new Blob(["\ufeff" + wordExport(run)], { type: "application/msword" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const local = new Date(run.created_at || Date.now());
    link.download = `${run.workflow_name || "审阅结果"}-内部审阅表-${local.getFullYear()}${String(local.getMonth() + 1).padStart(2, "0")}${String(local.getDate()).padStart(2, "0")}.doc`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return;
  }
  if (action === "copy-review" || action === "copy-draft" || action === "copy-result") {
    const run=state.selectedRun;
    const output=action==='copy-result'?run.final_output:readableDraft(run);
    // A drafted reply object is copied as the text the colleague will read, not as JSON.
    const value=action==='copy-review'?reviewText(run):typeof output==='string'?output:typeof output?.reply_to_marketing==='string'?output.reply_to_marketing:JSON.stringify(output,null,2);
    try { await navigator.clipboard.writeText(value); notify(action==='copy-review'?'审查意见已复制。':action==='copy-result'?'结果已复制，请核对后使用。':'草稿已复制，请核对后使用。'); } catch { banner('未能复制。请选中结果文字后复制。'); }
    return;
  }
  if (action === "insert-method") {
    captureSkillForm();
    if (!state.skillDraft.instructions.includes("先判断")) state.skillDraft.instructions = [state.skillDraft.instructions, METHOD_FRAME].filter(Boolean).join("\n\n");
    render(); notify("已插入审查模板，请逐行改成你们团队的做法。"); return;
  }
  if (action === "open-help") { $("#help-dialog").showModal(); return; }
  if (action === "close-help") { $("#help-dialog").close(); return; }
  if (action === "go-home") { captureCurrentForm(); navigate("overview"); return; }
  if (action === "show-history") { state.runScreen="history"; navigate("runs"); return; }
  if (action === "close-skill" || action === "close-workflow") { captureCurrentForm(); state[action==='close-skill'?'skillEditing':'workflowEditing']=false; render(); return; }
  if (action === "start-demo") { await installExamples(true, element.dataset.example || "starter"); return; }
  if (action === "result-tab") { state.resultTab=element.dataset.tab; updateRunPanel(); return; }
  if (action === "goto-card") {
    const rule = element.dataset.rule; state.resultTab = "report";
    const cardBefore = document.getElementById(`card-${rule}`);
    state.sourceQuote = cardBefore?.dataset.quote || state.sourceQuote; updateRunPanel();
    const card = document.getElementById(`card-${rule}`);
    const mark = $("#source-selection"), paper = mark?.closest(".document-paper");
    if (mark && paper) paper.scrollTop += mark.getBoundingClientRect().top - paper.getBoundingClientRect().top - paper.clientHeight / 2;
    if (card) { card.closest("details")?.setAttribute("open", ""); card.scrollIntoView({ block: "start" }); window.scrollBy(0, -24); card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
    return;
  }
  if (action === "locate-quote") { state.sourceQuote=element.dataset.quote; updateRunPanel(); const mark=$("#source-selection"); if(mark) {mark.scrollIntoView({block:"center",behavior:"smooth"});mark.focus({preventScroll:true});} return; }
  if (action === "wizard-stage" || action === "wizard-next") {
    captureCurrentForm(); const kind=element.dataset.kind, key=kind==='skill'?'skillStage':'workflowStage';
    const draft=kind==='skill'?state.skillDraft:state.workflowDraft;
    if(action==='wizard-next') {
      const errors=state[key]===0 ? [!draft.name?'请先填写名称。':null,kind==='skill'&&!draft.instructions?'请先说明这一步要完成什么。':null].filter(Boolean) : validateFields(draft.input_fields,'流程');
      setFormErrors(kind,errors);if(errors.length)return;
    }
    state[key]=action==='wizard-next'?Math.min(2,state[key]+1):Number(element.dataset.stage);state.errors[kind]=[];render();window.scrollTo({top:0,behavior:'instant'});return;
  }
  if(action==='new-flow-skill') {
    captureWorkflowForm();const origin={id:state.workflowId,draft:clone(state.workflowDraft)};
    newSkill(true);state.workflowReturn=origin;render();return;
  }
  if(action==='return-workflow') {returnToWorkflow();return;}
  if(action==='manual-skill') {
    captureSkillBrief();
    if(!state.skillDraft.instructions) state.skillDraft.instructions=[state.skillBrief.goal,state.skillBrief.basis].filter(Boolean).join('\n');
    if(!state.skillDraft.description) state.skillDraft.description=state.skillBrief.scope;
    if(!state.skillDraft.output_requirements) state.skillDraft.output_requirements=state.skillBrief.outcome;
    state.skillEntry=false;state.errors.skill=[];render();return;
  }
  if (action === "new-skill") { captureCurrentForm(); newSkill(); }
  else if (action === "edit-skill") editSkill(element.dataset.id);
  else if (action === "new-workflow") { captureCurrentForm(); newWorkflow(); }
  else if (action === "edit-workflow") editWorkflow(element.dataset.id);
  else if (action === "install-examples") await installExamples();
  else if (action === "refresh") await refreshAll();
  else if (action === "test-skill") await testSkill();
  else if (action === "return-skill-draft") {
    captureCurrentForm();
    if (canReturnToSkillDraft(element.dataset.id)) {
      state.errors.skill = []; state.skillEntry=false;state.skillEditing = true; state.skillStage = 2;
      navigate("skills");
      notify(state.workflowReturn ? "已回到刚才试用的草稿。检查无误后，点“保存并加入流程”。" : "已回到刚才试用的草稿。检查无误后，点“保存技能”。");
    } else notify("这份未保存的草稿已不在当前页面里。可以到“处理详情”查看当时试用的设置。");
  }
  else if (action === "compose-run") composeRun(element.dataset.id);
  else if (action === "open-run") await openRun(element.dataset.id);
  else if (action === "refresh-runs") {
    captureCurrentForm();
    await perform("refresh-runs", async () => {
      state.runs = await api("/runs");
      if (state.selectedRun) state.selectedRun = await api(`/runs/${encodeURIComponent(state.selectedRun.id)}`);
      schedulePoll();
    });
  } else if (action === "fill-examples") {
    captureRunForm();
    const workflow = state.workflows.find(item => item.id === state.runComposerId);
    let filled = 0;
    const source = workflow?.sample_inputs && Object.keys(workflow.sample_inputs).length ? workflow.sample_inputs : state.examples?.inputs;
    const byLabel = {};
    for (const other of state.workflows) for (const f of other.input_fields || []) if (other.sample_inputs?.[f.name] !== undefined && f.label && byLabel[f.label] === undefined) byLabel[f.label] = other.sample_inputs[f.name];
    workflow?.input_fields.forEach(field => {
      if (source?.[field.name] === undefined && byLabel[field.label] !== undefined) {
        if (field.options?.length && !field.options.includes(String(byLabel[field.label]))) return;
        state.runInputs[field.name] = String(byLabel[field.label]); filled++; return;
      }
      if (source?.[field.name] !== undefined) {
        if (field.options?.length && !field.options.includes(String(source[field.name]))) return;
        state.runInputs[field.name] = String(source[field.name]); filled++; return;
      }
      if (state.examples?.inputs?.[field.name] !== undefined) { state.runInputs[field.name] = typeof state.examples.inputs[field.name] === "string" ? state.examples.inputs[field.name] : JSON.stringify(state.examples.inputs[field.name], null, 2); filled++; }
    });
    render();
    notify(filled ? `已填入 ${filled} 项示例材料，运行前还可以修改。` : "这个流程需要的材料和示例对不上，请手动填写。");
  } else if (action === "fill-last-run") {
    const workflow = state.workflows.find(item => item.id === state.runComposerId);
    const inputs = lastRunInputs(workflow);
    if (inputs) { state.runInputs = { ...state.runInputs, ...inputs }; render(); notify("已填入上次提交的材料，运行前可以修改。"); }
  } else if (action === "add-skill-input" || action === "remove-skill-input") {
    captureSkillForm();
    if (action === "add-skill-input") {
      let next = state.skillDraft.input_fields.length + 1;
      while (state.skillDraft.input_fields.some(field => field.name === `input_${next}`)) next++;
      state.skillDraft.input_fields.push({ name: `input_${next}`, label: "", required: true });
    } else state.skillDraft.input_fields.splice(index, 1);
    render();
  } else if (action === "add-workflow-input" || action === "remove-workflow-input") {
    captureWorkflowForm();
    if (action === "add-workflow-input") {
      let next = state.workflowDraft.input_fields.length + 1;
      while (state.workflowDraft.input_fields.some(field => field.name === `input_${next}`)) next++;
      state.workflowDraft.input_fields.push({ name: `input_${next}`, label: "", required: true });
    } else state.workflowDraft.input_fields.splice(index, 1);
    render();
  } else if (["add-step", "remove-step", "move-step-up", "move-step-down"].includes(action)) {
    captureWorkflowForm();
    const draft = state.workflowDraft;
    state.errors.workflow = [];
    if (action === "add-step" && draft.steps.length < 10 && state.skills.length) draft.steps.push(makeStep(null, draft));
    else if (action === "remove-step") draft.steps.splice(index, 1);
    else if (action === "move-step-up" && index > 0) [draft.steps[index], draft.steps[index - 1]] = [draft.steps[index - 1], draft.steps[index]];
    else if (action === "move-step-down" && index < draft.steps.length - 1) [draft.steps[index], draft.steps[index + 1]] = [draft.steps[index + 1], draft.steps[index]];
    render();
  }
}

document.addEventListener("click", event => {
  const viewElement = event.target.closest("[data-view]");
  if (viewElement && views[viewElement.dataset.view]) {
    event.preventDefault();
    captureCurrentForm();
    if(viewElement.dataset.view==='runs') state.runScreen='history';
    navigate(viewElement.dataset.view);
    return;
  }
  const element = event.target.closest("[data-action]");
  if (!element || element.disabled) return;
  event.preventDefault();
  handleAction(element.dataset.action, element).catch(error => banner(error.message));
});

document.addEventListener("submit", event => {
  if (!["skill-brief-form", "skill-form", "workflow-form", "run-form"].includes(event.target.id)) return;
  event.preventDefault();
  const task = event.target.id === "skill-brief-form" ? generateSkillDraft() : event.target.id === "skill-form" ? saveSkill() : event.target.id === "workflow-form" ? saveWorkflow() : runWorkflow();
  task.catch(error => banner(error.message));
});

document.addEventListener("change", event => {
  const element = event.target;
  if (element.matches("[data-mode]")) { state.mode = element.value; return; }
  if (element.matches("[data-composer-workflow]")) { captureRunForm(); state.runComposerId=element.value; state.runInputs={}; state.errors.run=[]; render(); return; }
  if (element.matches("[data-step-skill]")) {
    captureWorkflowForm();
    const draft = state.workflowDraft;
    const index = draft.steps.findIndex(step => step.id === element.dataset.stepSkill);
    const step = draft.steps[index];
    const skill = state.skills.find(item => item.id === step.skill_id);
    const oldBindings = step.input_bindings;
    const suggestion = skill ? suggestBindings(skill, draft, index) : { bindings: {}, guessed: [] };
    step.input_bindings = Object.fromEntries((skill?.input_fields || []).map(field => [field.name, oldBindings[field.name] || suggestion.bindings[field.name] || null]));
    suggestion.guessed.filter(name => !oldBindings[name]).forEach(name => state.suggested.add(`${step.id}:${name}`));
    render();
    return;
  }
  if (element.matches('[data-pb="when_input"]')) { captureWorkflowForm(); render(); return; }
  if (element.matches("[data-pb-load]")) { loadStandard(element); return; }
  if (element.matches('#skill-form input[name="kind"]')) {
    captureSkillForm();
    if (state.skillDraft.kind === "compare" && !state.skillDraft.input_fields.some(field => field.role === "standard")) {
      state.skillDraft.input_fields.push({ name: "standard", label: "团队依据", required: true, role: "standard" });
      notify("对照型技能需要一份依据，已添加“团队依据”材料。");
    }
    render(); return;
  }
  if (element.matches("[data-binding-step]")) { state.suggested.delete(`${element.dataset.bindingStep}:${element.dataset.bindingField}`); captureWorkflowForm(); if(state.errors.workflow.length) state.errors.workflow = validateWorkflow(state.workflowDraft); render(); return; }
  if (element.matches('[data-input-row="skill"] [data-field-key], [data-input-row="skill"] [data-field-label]')) {
    captureSkillForm();
    state.skillDraft.input_fields.forEach((field, index) => {
      const sample = $(`[data-sample-index="${index}"]`);
      const label = sample?.closest("label")?.querySelector(".field-label");
      if (label) label.innerHTML = `${esc(field.label || field.name || `材料 ${index + 1}`)}<span class="optional">${field.required?"必填":"选填"}</span>`;
    });
  }
  else if (element.matches('[data-input-row="workflow"] [data-field-key], [data-input-row="workflow"] [data-field-label]')) { captureWorkflowForm(); refreshBindingOptions(); }
});

document.addEventListener("toggle", event => {
  const details = event.target;
  if(details.matches?.('[data-step-config]')) { if(details.open) state.bindingOpen.add(details.dataset.stepConfig); else state.bindingOpen.delete(details.dataset.stepConfig); return; }
  if (!details.matches?.(".json-details") || !details.open) return;
  const form = details.closest("form");
  if (form?.id === "skill-form") { captureSkillForm(); $("pre", details).textContent = JSON.stringify(state.skillDraft, null, 2); }
  else if (form?.id === "workflow-form") { captureWorkflowForm(); $("pre", details).textContent = JSON.stringify(state.workflowDraft, null, 2); }
}, true);

window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (!views[view] || view === state.view) return;
  captureCurrentForm();
  if (view === "runs") state.runScreen = "history";
  navigate(view);
});

document.addEventListener("input", event => {
  // Keep the run bar's "已填写 x/y 项" in step with what the user types, without re-rendering the form.
  if (!event.target.matches?.("[data-run-field]")) return;
  const form = $("#run-form"), bar = $(".run-bar strong");
  if (!form || !bar) return;
  const fields = $$("[data-run-field]", form);
  bar.textContent = `已填写 ${fields.filter(el => el.value.trim()).length}/${fields.length} 项`;
});

window.addEventListener("pagehide", () => { clearTimeout(state.poll); clearTimeout(state.toastTimer); });

async function bootstrap() {
  const requestedView = location.hash.slice(1);
  state.view = views[requestedView] ? requestedView : "overview";
  try {
    const [status, skills, workflows, runs, examples] = await Promise.all([api("/status"), api("/skills"), api("/workflows"), api("/runs"), api("/examples")]);
    Object.assign(state, { status, skills, workflows, runs, examples });
    state.mode = status.provider?.configured && status.provider.mode !== "mock" ? "configured" : "mock";
    if (skills.length) { state.skillId = skills[0].id; state.skillDraft = clone(skills[0]); state.skillDraftToken = uid(); }
    if (workflows.length) { state.workflowId = workflows[0].id; state.workflowDraft = clone(workflows[0]); state.runComposerId = workflows[0].id; }
    render();
  } catch (error) {
    renderChrome();
    $("#main").innerHTML = `<section class="panel">${emptyState("暂时无法连接", error.message, "refresh", "重新连接")}</section>`;
    banner(error.message);
  }
}

bootstrap();
