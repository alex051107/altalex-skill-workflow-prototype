"use strict";

// Run with: node tests/test_frontend_bindings.js
// Evaluate the shipped frontend functions; no server, browser, or model is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "static", "app.js");
const source = fs.readFileSync(sourcePath, "utf8");
const sourceWithoutBootstrap = source.replace(/\nbootstrap\(\);\s*$/, "\n");
assert.notEqual(sourceWithoutBootstrap, source, "Only remove the startup call, retaining the real frontend functions");

const errorElements = Object.fromEntries(["workflow", "run"].map(kind => [`#${kind}-errors`, { innerHTML: "", hidden: true, scrollIntoView() {} }]));
let networkCalls = 0;
const context = vm.createContext({
  document: { addEventListener() {}, querySelector: selector => errorElements[selector] || null },
  window: { addEventListener() {} },
  setTimeout, clearTimeout,
  fetch() { networkCalls++; throw new Error("An invalid workflow must not reach the network"); },
});
vm.runInContext(sourceWithoutBootstrap, context, { filename: sourcePath });
const evaluate = script => vm.runInContext(script, context);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;

function reset() {
  networkCalls = 0;
  for (const element of Object.values(errorElements)) { element.innerHTML = ""; element.hidden = true; }
  evaluate(`
    state.skills = [
      { id: 'review', name: '按公司规则审阅', description: '', version: 1, input_fields: [
        { name: 'document', label: '原文', required: true },
        { name: 'rules', label: '公司规则', required: true }
      ] },
      { id: 'request', name: '生成补材料请求', description: '', version: 1, input_fields: [
        { name: 'review', label: '审阅结果', required: true },
        { name: 'audience', label: '收件人及语气', required: true }
      ] }
    ];
    state.workflowDraft = { name: '自建审阅流程', description: '', version: 1,
      input_fields: [{ name: 'document', label: '待审阅文案', required: true }], steps: [] };
    state.workflowDraft.steps.push(makeStep(state.skills[0], state.workflowDraft));
    state.workflowDraft.steps.push(makeStep(state.skills[1], state.workflowDraft));
    state.workflowDraft.steps[0].input_bindings = { document: { source: 'input', key: 'document' }, rules: null };
    state.workflowDraft.steps[1].input_bindings = { review: null, audience: null };
    state.suggested = new Set();
    state.workflows = [];
    state.skillDraft = null;
    state.skillDraftToken = null;
    state.skillTestOrigins = new Map();
    state.errors.workflow = [];
    state.errors.run = [];
  `);
}

async function test(name, task) {
  reset();
  await task();
  passed++;
  console.log(`PASS ${name}`);
}

async function main() {
  await test("Suggestions follow business labels, never internal names alone, and are flagged", () => {
    context.labelSkill = { id: 'x', input_fields: [{ name: 'document', label: '原文', required: true }, { name: 'material', label: '待审阅文案', required: true }, { name: 'rules', label: '公司规则', required: true }] };
    const result = plain(evaluate("suggestBindings(labelSkill, state.workflowDraft, 0)"));
    assert.equal(result.bindings.document, null, "Same internal name but different business label is not guessed");
    assert.deepEqual(result.bindings.material, { source: "input", key: "document" });
    assert.equal(result.bindings.rules.source, "playbook");
    assert.deepEqual(result.guessed, ["material", "rules"]);
  });

  await test("rules is never silently bound to the submitted document", () => {
    assert.equal(evaluate("state.workflowDraft.steps[0].input_bindings.rules"), null);
  });

  await test("audience and review do not silently bind to an earlier output", () => {
    assert.equal(evaluate("state.workflowDraft.steps[1].input_bindings.audience"), null);
    assert.equal(evaluate("state.workflowDraft.steps[1].input_bindings.review"), null);
  });

  await test("The unbound field visibly asks the user to choose a source", () => {
    const html = evaluate("renderStep(state.workflowDraft.steps[0], 0, state.workflowDraft)");
    const select = html.match(/data-binding-field="rules"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(select, "The rules source selector is rendered");
    assert.match(select[1], /<option value="" selected>请选择输入来源<\/option>/);
    assert.doesNotMatch(select[1], /<option value="input:document" selected>/);
  });

  await test("Required unbound inputs are reported with step and field labels", () => {
    const errors = plain(evaluate("validateWorkflow(state.workflowDraft)"));
    assert.ok(errors.some(error => error.includes('第 1 步“公司规则”尚未选择输入来源')));
    assert.ok(errors.some(error => error.includes('第 2 步“收件人及语气”尚未选择输入来源')));
  });

  await test("An optional input may remain unbound under the API contract", () => {
    evaluate("state.skills[1].input_fields[1].required = false");
    const errors = plain(evaluate("validateWorkflow(state.workflowDraft)"));
    assert.ok(!errors.some(error => error.includes("收件人及语气")));
    assert.equal(evaluate("state.workflowDraft.steps[1].input_bindings.audience"), null);
  });

  await test("Explicit saved bindings are not rewritten by validation or rendering", () => {
    evaluate(`
      state.workflowDraft.steps[0].input_bindings.rules = {source:'input',key:'document'};
      state.workflowDraft.steps[1].input_bindings.review = {source:'step',step_id:state.workflowDraft.steps[0].id};
      state.workflowDraft.steps[1].input_bindings.audience = {source:'literal',value:'市场部同事'};
    `);
    const before = evaluate("JSON.stringify(state.workflowDraft.steps)");
    assert.deepEqual(plain(evaluate("validateWorkflow(state.workflowDraft)")), []);
    evaluate("renderWorkflowEditor(state.workflowDraft)");
    assert.equal(evaluate("JSON.stringify(state.workflowDraft.steps)"), before);
    assert.deepEqual(plain(evaluate("state.workflowDraft.steps[0].input_bindings.rules")), { source: "input", key: "document" });
  });

  await test("Saving an unbound draft stops before any API request", async () => {
    await evaluate("saveWorkflow()");
    assert.equal(networkCalls, 0);
    assert.match(errorElements["#workflow-errors"].innerHTML, /第 1 步“公司规则”尚未选择输入来源/);
    assert.equal(errorElements["#workflow-errors"].hidden, false);
  });

  await test("Executing a saved workflow with missing required bindings stops before any API request", async () => {
    evaluate("state.workflowDraft.id='saved'; state.workflows=[state.workflowDraft]; state.runComposerId='saved'; state.runInputs={document:'材料已填写'}");
    await evaluate("runWorkflow()");
    assert.equal(networkCalls, 0);
    assert.match(errorElements["#run-errors"].innerHTML, /流程配置需要修正：第 2 步“收件人及语气”尚未选择输入来源/);
    assert.equal(errorElements["#run-errors"].hidden, false);
  });

  await test("Explicitly configured rules, prior output and audience satisfy validation", () => {
    evaluate(`
      state.workflowDraft.steps[0].input_bindings.rules = {source:'literal',value:'公司已确认的规则清单'};
      state.workflowDraft.steps[1].input_bindings.review = {source:'step',step_id:state.workflowDraft.steps[0].id};
      state.workflowDraft.steps[1].input_bindings.audience = {source:'literal',value:'市场部同事；只生成草稿'};
    `);
    assert.deepEqual(plain(evaluate("validateWorkflow(state.workflowDraft)")), []);
  });

  await test("A draft test records its own origin and clearly says it does not save", async () => {
    context.originalFunctions = evaluate("({api, perform, navigate, schedulePoll, notify})");
    context.testApiCalls = [];
    context.testRun = { id: "draft-test", kind: "skill_test", status: "completed" };
    evaluate(`
      state.skillDraftToken = 'this-draft';
      state.skillDraft = { name:'我的未保存能力', description:'', instructions:'从document总结事实',
        input_fields:[{name:'document',label:'材料',required:true}],output_format:'text',output_requirements:'简短',sample_inputs:{document:'模拟材料'} };
      api = async (endpoint, options) => {testApiCalls.push({endpoint, options}); return testRun;};
      perform = async (_key, task) => task();
      navigate = view => {state.view=view;};
      schedulePoll = () => {};
      notify = () => {};
    `);
    try {
      await evaluate("testSkill()");
      assert.equal(evaluate("state.skillTestOrigins.get('draft-test')"), "this-draft");
      assert.equal(evaluate("canReturnToSkillDraft('draft-test')"), true);
      assert.equal(evaluate("state.skillDraft.name"), "我的未保存能力");
      const notice = evaluate("renderSkillTestNotice(testRun)");
      assert.match(notice, /本次试用尚未保存/);
      assert.match(notice, /试用完成后，请返回技能页面保存/);
      assert.match(notice, /返回技能并保存/);
      assert.equal(context.testApiCalls.length, 1);
      assert.equal(context.testApiCalls[0].endpoint, "/skills/test", "Testing does not call the save endpoint");
    } finally {
      evaluate("({api, perform, navigate, schedulePoll, notify} = originalFunctions)");
    }
  });

  await test("The return action opens the same draft without saving or replacing it", async () => {
    context.originalFunctions = evaluate("({navigate, notify})");
    evaluate(`
      state.skillDraft = {name:'仍在修改的同一草稿'};
      state.skillDraftToken='same-draft';
      state.skillTestOrigins.set('draft-test','same-draft');
      state.view='runs';
      navigate = view => {state.view=view;};
      notify = () => {};
    `);
    const draft = evaluate("state.skillDraft");
    try {
      await evaluate("handleAction('return-skill-draft', {dataset:{id:'draft-test'}})");
      assert.equal(evaluate("state.view"), "skills");
      assert.equal(evaluate("state.skillDraft"), draft);
      assert.equal(evaluate("state.skillDraft.name"), "仍在修改的同一草稿");
      assert.equal(networkCalls, 0);
    } finally {
      evaluate("({navigate, notify} = originalFunctions)");
    }
  });

  await test("Starting a different draft disables an old test's return action", () => {
    context.originalFunctions = evaluate("({navigate})");
    evaluate("state.skillDraft={name:'旧草稿'}; state.skillDraftToken='old'; state.skillTestOrigins.set('old-test','old'); navigate=()=>{};");
    try {
      evaluate("newSkill()");
      assert.equal(evaluate("canReturnToSkillDraft('old-test')"), false);
      const notice = evaluate("renderSkillTestNotice({id:'old-test',kind:'skill_test'})");
      assert.doesNotMatch(notice, /data-action="return-skill-draft"/);
      assert.match(notice, /这份草稿没有保存/);
    } finally {
      evaluate("({navigate} = originalFunctions)");
    }
  });

  await test("A historical test after reload cannot point at another loaded draft", () => {
    evaluate("state.skillDraft={name:'刷新后加载的其他能力'}; state.skillDraftToken='loaded'; state.skillTestOrigins=new Map();");
    assert.equal(evaluate("canReturnToSkillDraft('historical-test')"), false);
    const notice = evaluate("renderSkillTestNotice({id:'historical-test',kind:'skill_test'})");
    assert.doesNotMatch(notice, /data-action="return-skill-draft"/);
    assert.match(notice, /找回本次试用的设置/);
  });

  await test("Workflow runs do not get a misleading draft-test notice", () => {
    assert.equal(evaluate("renderSkillTestNotice({id:'workflow-run',kind:'workflow'})"), "");
  });

  await test("A later draft does not displace the review as the default result", () => {
    evaluate(`state.resultTab='report'; state.sourceQuote='';`);
    context.reviewRun = {id:'ui-review',kind:'workflow',mode:'ollama',status:'completed',inputs:{document:'原文'},
      steps:[{name:'审阅',inputs:{document:'原文'},output:{checks:[],summary:'审阅依据'}},{name:'补材料请求',output:'待发送草稿'}],final_output:'待发送草稿'};
    const html = evaluate('renderRunResult(reviewRun)');
    assert.match(html, /aria-selected="true"[^>]*data-tab="report"/);
    assert.match(html, /审阅依据/);
    assert.doesNotMatch(html, /待发送草稿/);
    evaluate("state.resultTab='draft'");
    assert.match(evaluate('renderRunResult(reviewRun)'), /待发送草稿/);
  });

  await test("Arbitrary later results are not mislabeled as material requests", () => {
    context.reviewRun.steps[1].name='内部简报';
    evaluate("state.resultTab='draft'");
    const html = evaluate('renderRunResult(reviewRun)');
    assert.match(html, /data-tab="draft"[^>]*>内部简报</, "The later tab is named after the step that produced it");
    assert.match(html, /<h2>内部简报<\/h2>/);
    assert.doesNotMatch(html, /补件草稿/);
  });

  await test("Source highlighting escapes markup while preserving exact quoted text", () => {
    evaluate(`state.sourceQuote='<img src=x onerror=alert(1)>';`);
    context.sourceRun={inputs:{document:'前文 <img src=x onerror=alert(1)> 后文'}};
    const html=evaluate('renderSource(sourceRun)');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /<mark id="source-selection"[^>]*>&lt;img src=x onerror=alert\(1\)&gt;<\/mark>/);
    assert.match(html, /前文/); assert.match(html, /后文/);
  });

  await test("A missing quote produces a warning without a false highlight", () => {
    evaluate("state.sourceQuote='原文不存在的内容'");
    const html=evaluate('renderSource(sourceRun)');
    assert.match(html, /未在原文中找到/);
    assert.doesNotMatch(html, /<mark/);
  });

  await test("Mock default view explains the flow instead of presenting echoed JSON as advice", () => {
    context.mockRun={id:'mock-view',mode:'mock',kind:'workflow',status:'completed',steps:[{name:'整理',status:'completed'}],inputs:{document:'测试'},final_output:{mock_echo:'raw payload'}};
    evaluate("state.resultTab='report';state.sourceQuote=''");
    const html=evaluate('renderRunResult(mockRun)');
    assert.match(html, /不生成审查意见/);
    assert.doesNotMatch(html, /raw payload/);
    assert.match(html, /处理详情/);
  });

  await test("Collapsed material source labels escape user-authored markup", () => {
    evaluate(`state.workflowDraft.input_fields[0].label='<img src=x onerror=alert(1)>';`);
    const html=evaluate('renderStep(state.workflowDraft.steps[0],0,state.workflowDraft)');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /本次提交：&lt;img/);
  });

  await test("The home exposes reusable workflows and creation rather than a fixed marketing form", () => {
    context.homeWorkflow={id:'home-flow',name:'采购订单核对',description:'为采购同事整理待确认事项',input_fields:[{name:'document',label:'采购订单',required:true}],steps:[]};
    evaluate("state.workflows=[homeWorkflow]");
    const html=evaluate('renderOverview()');
    assert.match(html,/采购订单核对/);assert.match(html,/data-action="new-workflow"/);assert.match(html,/0 步/);assert.match(html,/提交材料/);assert.doesNotMatch(html,/每次提交/);
    assert.doesNotMatch(html,/<form id="run-form"/);
    evaluate('state.workflows=[]');
    const empty=evaluate('renderOverview()');assert.match(empty,/创建第一套流程/);assert.match(empty,/data-example="starter"/);assert.match(empty,/data-example="nda_playbook"/);
    assert.doesNotMatch(empty,/合规或法务里维护清单的人/);assert.doesNotMatch(empty,/本原型/);assert.match(empty,/data-example="hk_announcement"/);
  });

  await test("Markdown model text renders as lists and tables without raw escapes or HTML injection", () => {
    context.mdText='清单：\n- 条款：期限\n  - 原句：\\"two years\\"\n- <script>x</script>\n\n| 条款 | 判断 |\n|---|---|\n| B1 | 偏离 |';
    const html=evaluate('readableText(mdText)');
    assert.match(html,/<ul><li>条款：期限<ul><li>原句：&quot;two years&quot;/);
    assert.match(html,/<table class="md-table">/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/\\&quot;/);
  });

  await test("New steps pre-select likely sources and flag each guess for confirmation", () => {
    context.sugSkill={id:'s2',name:'对照底线',input_fields:[{name:'document',label:'上一步摘出的条款',required:true},{name:'input_2',label:'我方 NDA 底线',required:true},{name:'context',label:'我方角色',required:true}]};
    context.sugFlow={input_fields:[{name:'document',label:'对方 NDA',required:true},{name:'context',label:'我方角色',required:true}],steps:[{id:'step_a',skill_id:'s1',input_bindings:{}}]};
    const result=JSON.parse(evaluate('JSON.stringify(suggestBindings(sugSkill,sugFlow,1))'));
    assert.deepEqual(result.bindings.document,{source:'step',step_id:'step_a'});
    assert.equal(result.bindings.input_2.source,'playbook');
    assert.equal(result.bindings.input_2.title,'我方 NDA 底线');
    assert.deepEqual(result.bindings.context,{source:'input',key:'context'});
    assert.equal(result.guessed.length,3);
  });

  await test("Rule titles are read from the actual rules, including unknown policies", () => {
    context.policy='R1 量化收益依据。请核对依据。\nCUSTOM-2 自定义采购要求。核对供应商。';
    const entries=evaluate('ruleEntries(policy)');
    assert.equal(entries[0].title,'量化收益依据');assert.equal(entries[1].title,'自定义采购要求');assert.equal(entries[1].id,'CUSTOM-2');
  });

  await test("Internal input names in explanations become this run's labels, never inside quotes", () => {
    context.labelReview={checks:[{rule_id:'R1',status:'issue',quote:'document contains context',reason:'document 与 context 不一致',needed_material:'extraction 的依据'}]};
    const html=evaluate("reviewOutput(labelReview,'',{document:'对方 NDA',context:'交易背景',extraction:'上一步整理的条款'})");
    assert.match(html,/<blockquote>document contains context<\/blockquote>/);
    assert.match(html,/对方 NDA 与 交易背景 不一致/);assert.match(html,/上一步整理的条款 的依据/);
    assert.doesNotMatch(evaluate("reviewOutput(labelReview)"),/文案原文|发布背景/);
    assert.equal(context.labelReview.checks[0].reason,'document 与 context 不一致');
  });

  await test("Readable drafts hide rule metadata without changing stored output", () => {
    context.draftRun={final_output:'请补充依据（rule_id: R1），用于核对 context。',snapshot:{workflow:{input_fields:[{name:'context',label:'交易背景'}]}},steps:[]};
    assert.equal(evaluate('readableDraft(draftRun)'),'请补充依据，用于核对 交易背景。');
    assert.equal(context.draftRun.final_output,'请补充依据（rule_id: R1），用于核对 context。');
  });

  await test("Copied review keeps status, evidence and readable explanations", () => {
    context.copyRun={workflow_name:'营销材料审查',steps:[{inputs:{rules:'R1 量化收益依据。核对。'},output:{summary:'核对 context',checks:[{rule_id:'R1',status:'needs_material',quote:'最高8%',reason:'缺少 document 依据',needed_material:'计算依据'},{rule_id:'R2',status:'not_applicable',reason:'本次为静态图文'}]}}]};
    const text=evaluate('reviewText(copyRun)');
    assert.match(text,/R1 .* — 需要补充材料/);assert.match(text,/原文：最高8%/);assert.match(text,/请补充：计算依据/);assert.match(text,/本次不适用/);
  });

  await test("Workflow business summary distinguishes per-run material from fixed policy", () => {
    evaluate("state.workflowDraft.steps[0].input_bindings.rules={source:'literal',value:'公司采购清单'}");
    const facts=evaluate('workflowFacts(state.workflowDraft)');
    assert.equal(facts.fixed.length,1);assert.equal(facts.fixed[0].label,'公司规则');assert.equal(facts.fixed[0].value,'公司采购清单');
    const html=evaluate('renderWorkflowSummary(state.workflowDraft)');
    assert.match(html,/每次提交/);assert.match(html,/待审阅文案/);assert.match(html,/团队依据/);assert.match(html,/公司规则/);
  });

  await test("Saving a newly created task can return to the exact unsaved workflow", () => {
    context.originalFunctions=evaluate('({navigate})');
    evaluate("navigate=view=>{state.view=view};state.workflowReturn={id:'saved-flow-id',draft:clone(state.workflowDraft)};");
    context.newTask={id:'new-custom-task',name:'给采购的补件清单',input_fields:[{name:'review',label:'前面的检查意见',required:true},{name:'document',label:'上一步的核对结果',required:true}]};
    const original=evaluate('clone(state.workflowReturn.draft)');
    try {
      evaluate('returnToWorkflow(newTask)');
      assert.equal(evaluate('state.workflowId'),'saved-flow-id');assert.equal(evaluate('state.workflowDraft.name'),original.name);
      assert.equal(evaluate('state.workflowDraft.steps.length'),original.steps.length+1);
      assert.equal(evaluate('state.workflowDraft.steps.at(-1).input_bindings.review'),null);
      assert.equal(evaluate('state.workflowDraft.steps.at(-1).input_bindings.document.source'),'step');
      assert.equal(evaluate('state.suggested.has(`${state.workflowDraft.steps.at(-1).id}:document`)'),true);
      assert.equal(evaluate('state.suggested.has(`${state.workflowDraft.steps.at(-1).id}:review`)'),false);
      assert.equal(evaluate('state.workflowStage'),2);assert.equal(evaluate('state.workflowReturn'),null);
    } finally {evaluate('({navigate}=originalFunctions)');}
  });

  await test("AI authoring fills the real editable configuration and does not save it", async () => {
    context.originalFunctions=evaluate('({captureSkillBrief,api,perform,notify})');
    context.generatedTask={name:'提取订单空白',instructions:'列出未填字段',input_fields:[{name:'document',label:'订单表',required:true}],output_format:'text',output_requirements:'原文与待填内容',sample_inputs:{}};
    evaluate("captureSkillBrief=()=>{};state.skillBrief={goal:'核对订单空白',scope:'采购订单',basis:'表内占位符',outcome:'待确认清单'};state.skillEntry=true;state.mode='configured';notify=()=>{};perform=async(k,fn)=>fn();api=async(path,options)=>{if(path!=='/skills/draft')throw Error('must not save');return {skill:generatedTask,questions:['依据待确认']}};");
    try {
      await evaluate('generateSkillDraft()');
      assert.equal(evaluate('state.skillDraft'),context.generatedTask);assert.equal(evaluate('state.skillEntry'),false);
      assert.equal(evaluate('state.draftQuestions[0]'),'依据待确认');assert.equal(evaluate('state.skillStage'),0);
    } finally {evaluate('({captureSkillBrief,api,perform,notify}=originalFunctions)');}
  });

  await test("Draft clarification questions are escaped and stay visible for review", () => {
    evaluate("state.skillStage=0;state.skillDraft={name:'草稿',description:'',instructions:'要求',input_fields:[],output_format:'text',output_requirements:'结果'};state.draftQuestions=['<img src=x onerror=alert(1)>'];");
    const html=evaluate('renderSkillEditor(state.skillDraft)');assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/核对问题/);
  });

  await test("Result source shows all business inputs with their saved labels", () => {
    context.materialRun={inputs:{document:'原文 <script>',file_list:'附件1已收到'},snapshot:{workflow:{input_fields:[{name:'document',label:'合同文本'},{name:'file_list',label:'已提供文件清单'}]}},steps:[]};
    const html=evaluate('renderSource(materialRun)');
    assert.match(html,/已提供文件清单/);assert.match(html,/附件1已收到/);assert.match(html,/原文 &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  });

  await test("Readable text formatting escapes HTML and leaves the raw output untouched", () => {
    context.rawText='## 核对结果\n**主协议** <img src=x onerror=alert(1)>';
    const html=evaluate('structuredOutput(rawText)');
    assert.match(html,/<h4>核对结果<\/h4>/);assert.match(html,/<strong>主协议<\/strong>/);
    assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(context.rawText,/\*\*主协议\*\*/);
  });

  await test("Markdown edge cases from model output render safely", () => {
    assert.doesNotThrow(() => evaluate("readableText('|---|---|')"));
    assert.match(evaluate("readableText('| 条款 | 结论 |\\n|---|---|\\n| -- | 无 |')"), /<td>--<\/td>/);
    assert.match(evaluate("readableText('1. 一\\n2. 二\\n说明\\n3. 三')"), /<li value="3">三/);
    assert.doesNotMatch(evaluate("readableText('2024. 年度报告')"), /<li/);
    assert.match(evaluate("readableText('- 甲\\n1. 乙')"), /<\/ul><ol><li value="1">乙/);
  });

  await test("Binding suggestions are cleared when another workflow is opened", () => {
    evaluate("state.suggested.add('extract:document'); state.workflows=[{id:'w2',name:'另一个',description:'',input_fields:[{name:'document',label:'合同',required:true}],steps:[]}]; navigate=()=>{}");
    evaluate("editWorkflow('w2')");
    assert.equal(evaluate("state.suggested.size"), 0);
  });

  await test("Playbook results show triage, positions, approved wording and clauses outside the standard", () => {
    context.pbReview={triage:{level:'red',label:'需要负责人决定',reasons:['B1 期限']},playbook:{title:'NDA 底线',version:2},summary:'1 项与依据不一致',
      checks:[{rule_id:'B1',title:'期限',severity:'高',status:'issue',quote:'two (2) years',reason:'短于 3 年',basis:{preferred:'3 年',fallback:''},proposed_text:'three (3) years',proposed_text_source:'团队批准文本',decision:'接受对方文本需法务负责人决定'},
              {rule_id:'B9',title:'仅接收',status:'not_applicable',reason:'角色不符',decided_by:'适用条件'}],
      uncovered:[{clause:'8',quote:'without limitation',note:'无上限赔偿'}]};
    const html=evaluate("reviewOutput(pbReview)");
    assert.match(html,/triage-red/);assert.match(html,/需要负责人决定/);assert.match(html,/NDA 底线 · 第 2 版/);
    assert.match(html,/<b>首选<\/b>3 年/);assert.match(html,/团队批准文本/);assert.match(html,/接受对方文本需法务负责人决定/);
    assert.match(html,/由适用条件判定/);assert.match(html,/依据外条款 · 需要人看/);assert.match(html,/无上限赔偿/);
    context.pbRun={workflow_name:'NDA',created_at:'2026-10-23T00:00:00Z',steps:[{output:context.pbReview}]};
    assert.match(evaluate("counterpartyText(pbRun)"),/Proposed:\nthree \(3\) years/);
    assert.match(evaluate("wordExport(pbRun)"),/<table>/);
  });

  await test("A playbook condition pointing to a renamed input or removed option blocks saving", () => {
    evaluate(`state.workflowDraft.input_fields.push({name:'role',label:'我方角色',required:true,options:['我方披露','我方接收']});
      state.workflowDraft.steps[0].input_bindings.rules={source:'playbook',title:'底线',reply_to:'对方',items:[
        {id:'B1',title:'期限',severity:'高',preferred:'3 年',fallback:'',escalate_to:'法务负责人',applies_when:{input:'our_role',values:['我方披露']}},
        {id:'B2',title:'例外',severity:'中',preferred:'四项',fallback:'',escalate_to:'合规负责人',applies_when:{input:'role',values:['我方主要披露信息']}}]};
      state.workflowDraft.steps[1].input_bindings={review:{source:'step',step_id:state.workflowDraft.steps[0].id},audience:{source:'literal',value:'对方'}};`);
    const errors = plain(evaluate("validateWorkflow(state.workflowDraft)"));
    assert.ok(errors.some(e => e.includes("第 1 条的适用条件引用的材料或选项已不存在")));
    assert.ok(errors.some(e => e.includes("第 2 条的适用条件引用的材料或选项已不存在")));
    const html = evaluate("renderStep(state.workflowDraft.steps[0],0,state.workflowDraft)");
    assert.match(html, /已失效的条件，请重新选择/);assert.match(html, /选项已不存在/);assert.match(html, /合规负责人/);
  });

  await test("Material roles drive source suggestions; the original never binds to a choice", () => {
    context.roleSkill = { id: 'cmp', input_fields: [
      { name: 'document', label: '原文', role: 'original', required: true },
      { name: 'situation', label: '适用情形', role: 'context', required: false },
      { name: 'context', label: '背景与已有材料', role: 'context', required: false },
      { name: 'standard', label: '团队依据', role: 'standard', required: true },
      { name: 'extraction', label: '上一步整理结果', role: 'previous', required: false },
      { name: 'requirements', label: '写作要求', role: 'context', required: false }] };
    evaluate(`state.workflowDraft.input_fields=[{name:'document',label:'营销文案正文',required:true},{name:'input_2',label:'推广关系与已有材料',required:true},{name:'channel',label:'发布形式',required:true,options:['静态图文','尚未确认']}]`);
    const result = plain(evaluate("suggestBindings(roleSkill, state.workflowDraft, 1)"));
    assert.deepEqual(result.bindings.document, { source: "input", key: "document" });
    assert.deepEqual(result.bindings.situation, { source: "input", key: "channel" });
    assert.deepEqual(result.bindings.context, { source: "input", key: "input_2" });
    assert.equal(result.bindings.standard.source, "playbook");
    assert.equal(result.bindings.extraction.source, "step");
    assert.equal(result.bindings.requirements, null, "Writing requirements are never guessed from submitted material");
  });

  await test("Expectations, location chips and the colleague reply speak the reviewer's language", () => {
    context.expRun = { id: 't', kind: 'skill_test', status: 'completed', expectations: [{ text: 'R2 = 不一致', hit: true, actual: '不一致' }, { text: '不应包含：视频', hit: false, actual: '结果中出现了' }] };
    const exp = evaluate("renderExpectations(expRun)");
    assert.match(exp, /命中 1\/2/); assert.match(exp, /未命中/);
    assert.equal(evaluate("locationText({input:'document',label:'文案',line:2,clause:'2',clause_kind:'段'})"), "第 2 段 · 第 2 行");
    context.mkRun = { id: 'm', status: 'completed', mode: 'openai', steps: [{ skill_snapshot: { input_fields: [{ name: 'document', role: 'original' }] }, playbook: { reply_to: '市场同事' },
      output: { playbook: { title: '清单' }, checks: [
        { rule_id: 'R2', title: '推广关系', status: 'issue', quote: '这不是广告', proposed_text: '【合作推广】…', proposed_text_source: '团队批准文本（首选立场）', location: { input: 'document', line: 2 } },
        { rule_id: 'R3', title: '最终画面', status: 'needs_material', needed_material: '最终图片或截图' }] } }] };
    const reply = evaluate("counterpartyText(mkRun)");
    assert.match(reply, /市场同事你好/); assert.match(reply, /原句：这不是广告/); assert.match(reply, /二、需要补充的材料/);
    assert.doesNotMatch(reply, /AI 起草/, "Approved text is not flagged as an AI draft");
    assert.doesNotMatch(reply, /Clause/);
  });

  console.log(`\n${passed}/${passed} frontend binding checks passed. No browser, database, or network was used.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
