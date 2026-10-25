# 法律业务如何变成可复用的 AI 做法

调研日期：2026-10-21。对象：Harvey Workflow Builder / Agent Builder、Spellbook Playbooks。证据来自公开官方文章和帮助文档；未登录这两款产品，未进行账号内试用。这里区分文档描述、未查到的行为和对本项目的设计推论。

## 先校准题目目的

原始测试要求客户可以按自己的业务与合规需求，创建、测试、保存 Skill，再组合至少两个 Skill，把前一步结果交给后一步，执行、修改并再次运行。营销材料审查只是一个可选验证场景。评审者必须能创建一个新 Skill 并加入 Workflow，不能只运行写死的营销提示词。

因此应展示两条相接的链路：**业务负责人把已有做法变成可编辑、可试验的任务；使用者提交新材料，取得可以复核的工作产物。** 这属于对题目要求的产品解释，并非竞品功能结论。

原始依据：[实习生实战测试原文](../../audit/assessment_source.txt)。

## Harvey：把团队做法设计成可运行流程

### 谁创建，谁使用

官方把创新与知识团队列为自助创建者；他们将律所经验、语气、先例与流程写入工作流，发布后交由团队使用。2026 年的 Agent Builder 进一步面向不同团队、业务领域和内部流程创建可复用代理。[2025 创建说明](https://www.harvey.ai/blog/introducing-workflow-builder)、[2026 Agent Builder](https://www.harvey.ai/blog/introducing-agent-builder)。

### 从业务目标到输入、任务和产物

| 已读到的动作或字段 | 解决的业务问题 | 官方依据 |
| --- | --- | --- |
| 自然语言描述想做的工作，也可手工连接模块 | 创建者可以先说明业务目的，再调整执行方式 | [创建说明](https://www.harvey.ai/blog/introducing-workflow-builder) |
| 加入输入、先例和分支 | 团队已有标准进入系统，任务可以依具体情况改变 | [创建说明](https://www.harvey.ai/blog/introducing-workflow-builder) |
| DPA 示例分别接收偏好版本、待谈判版本和公司背景，再输出对照分析 | “按本公司立场审查”需要比较基准与事实背景，不能只上传一份文件 | [官方五例，例 3](https://www.harvey.ai/blog/getting-started-with-workflow-builder-5-workflows-we-recommend) |
| 采购协议示例询问买方议价能力，选择不同建议路径 | 同一法律条款的可接受方案也受业务谈判条件影响 | [官方五例，例 5](https://www.harvey.ai/blog/getting-started-with-workflow-builder-5-workflows-we-recommend) |
| 诉讼保全示例先识别材料类别，再用这些类别和收发件人起草通知 | 中间分析服务最终工作产物，使用者不必逐步搬运结果 | [官方五例，例 4](https://www.harvey.ai/blog/getting-started-with-workflow-builder-5-workflows-we-recommend) |

上表保留了输入、分步分析与产物的关系。无需为了像竞品而复刻完整节点画布。

### 测试、确认、发布与复用

2025 创建说明的顺序是描述/设计、加入团队经验、测试、设权限并分享，然后继续迭代和管理版本。官方帮助目录也将创建、运行、权限和知识源列为不同主题。[创建说明](https://www.harvey.ai/blog/introducing-workflow-builder)、[官方帮助目录](https://help.harvey.ai/topics/workflows)。

名称已经变化：2026 年官方说明从 Workflow Builder 演进为 Agent Builder，已有工作流继续支持。新设计强调给出目标、补问上下文、按任务调整路径，以及在关键决策处让人确认；例如识别公司政策与监管更新的偏差后，先请人确认分析方法，再决定是否直接改文档。原文关键短语：`human-in-the-loop checkpoints`。这证明“业务流程”不等于固定串行调用；也不意味着本次 MVP 应照搬完整自主代理。[2026 Agent Builder](https://www.harvey.ai/blog/introducing-agent-builder)。

### 缺资料、例外与人的判断

可确认：业务上下文可以通过询问获得；分支可以反映谈判条件；关键决策和改文档动作有人工检查点。**未查到**公开文档是否会对所有缺件一律暂停、具体如何存储例外审批，以及每次保存是否强制先通过业务测试。因此不能声称已验证这些行为。

访问边界：官方帮助目录可读，但其中详细 Builder、权限、知识源文章在本次直接读取时跳转登录。研究没有绕过登录；也未将搜索引擎发现的 `help-harvey.vercel.app` 镜像当作已核实的当前产品行为。

## Spellbook：把审阅立场变成有边界的规则

### 谁创建，谁使用

官方建议一至两人负责创建、维护和协调法务、运营、合规意见。编辑权属于创建者，其他人需要复制后修改。使用者在正在处理的 Word 文档里选择 Playbook 运行审阅。[最佳实践](https://help.spellbook.legal/en/articles/11327960-playbooks-best-practices)、[管理](https://help.spellbook.legal/en/articles/11328093-manage-playbooks)、[使用](https://help.spellbook.legal/en/articles/9926250-playbooks-overview)。

### 实际创建流程

四个入口是专家模板、已有范本/Playbook、自然语言描述、逐条手工创建。描述入口明确要求交代文档、代表哪一方和法域；文档入口可上传 Word/PDF，并补充有利立场等上下文。系统生成规则后，用户逐条查看修改，再发布。草稿自动保存，已发布后的未发布改动单独呈现。[创建文档](https://help.spellbook.legal/en/articles/11327030-create-playbooks)。

| 规则中的业务字段 | 字段实际承担的工作 | 官方依据 |
| --- | --- | --- |
| 首选立场与备选立场 | 区分希望争取的条款和可以接受的退让 | [自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks) |
| 风险级别 | 提示哪些偏差需要关注或升级 | [自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks) |
| 内部说明 | 给审阅者参考；文档明确它不会直接触发修改 | [自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks) |
| 推荐表述和评论 | 将团队立场落实成可用的改文或沟通内容 | [自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks) |
| 指定批准人 | 某条款被接受或定稿前由指定人确认 | [自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks) |

少量原文字段用于对照：`Fallback Position`、`Requires approval from`、`Preferred Language`。[自定义规则](https://help.spellbook.legal/en/articles/11525082-customize-playbooks)。

### 测试与使用时的复核

发布前测试是官方最佳实践：在样本文档上检查关键问题是否漏掉、建议和退让是否可用，并请实际审阅者反馈；公开文档没有将它描述成系统强制发布门槛。运行时可选全文审阅或只审修改痕迹；规则结果提供理由与来源定位，建议可以编辑、重新生成或插入文档，也可以导出摘要。[最佳实践](https://help.spellbook.legal/en/articles/11327960-playbooks-best-practices)、[使用](https://help.spellbook.legal/en/articles/9926250-playbooks-overview)。

**未查到**其公开说明如何处理本次材料未覆盖的每一种事实缺失，或如何自动证明新生成规则没有误读范本。不能把“从范本自动生成规则”当作“规则已经得到法务确认”。

## 对本次 MVP 最关键的三个影响

以下是依据上述资料作出的设计推论，未声称经过客户访谈验证。

1. **入口应让创建者说明一项业务做法，并得到可编辑的起点。** 先问“你反复做什么、为谁做、依据什么、最后交什么”，再呈现输入、任务要求和输出。可以从零填写，也可以用示例辅助；首页必须能直接看见“创建自己的任务/流程”。营销模板是启动材料，不能遮蔽自助创建这项被考察的能力。

2. **把公司标准、案件/送审事实、待确认判断分开。** 公司政策或人工确认规则是长期依据；本次材料、用途与背景是每次输入；未提供证据、规则不适用和批准例外需要不同反馈。不能把一个历史批注自动变成通用公司政策，也不能将未找到事实写成确定违规。可以先用任务说明承载这些要求；只有真实实现的字段才进入产品承诺。

3. **试跑页要帮助创建者判断“这套做法是否值得复用”。** 同时看样例材料、每步收到什么、产出什么和依据在哪里；修改任务后重跑。最有说服力的演示是评审者新增一个从未预置的 Skill，接入至少两步流程，看到真实结果传递。至少另用一份缺少关键材料的样例，检查是否明确待补事实，并避免把模型调用成功误写成审阅正确。草稿/共享/审批可以作为后续范围，别用假的发布按钮冒充企业治理。

## 可执行的演示判断标准

本次建议用模拟营销送审作为完整业务故事：创建者已有一份虚构公司清单，想让同事按同样方法收件、审查并整理补件。演示要让人看见“把做法保存下来”的过程，而不只是打开已有营销表单。

- 创建者解释适用材料、每次要收的背景、什么属于待确认，并保存一个自定义 Skill。
- 将其接入至少两 Skill 的流程，明确后一步引用的是前一步的哪项产物。
- 先跑正常样例，再跑缺关键事实的样例；检查输出是否支持继续处理或清楚指出缺口。
- 修改一个真实业务要求再重跑，确认新规则生效；刷新后配置仍在，旧运行结果仍能解释。

这组标准只检验题目规定的自助创建与业务闭环。法律正确性仍要另有明确标准和专业复核。
