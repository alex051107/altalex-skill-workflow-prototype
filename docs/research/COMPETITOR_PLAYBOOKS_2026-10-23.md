# 合同审阅 playbook：竞品怎样把法务团队的标准写进系统

调研日期：2026-10-23。只用公开来源（帮助中心、厂商博客、新闻稿），没有注册账号，也没有分析任何非公开代码。除非另有标注，功能描述都是厂商自述。Spellbook 和 Harvey 的基础功能见 [LEGAL_BUILDER_PATTERNS.md](LEGAL_BUILDER_PATTERNS.md)，这里不再重复。

playbook 指合同审阅手册：法务团队写下“这类条款我们希望怎么写、最多能让到哪一步、超出时找谁批”。下文的首选立场（preferred position）是团队最希望的写法，退让立场（fallback）是做不到首选时可以接受的次一级写法，修订标记（redline）是直接在合同里改出来的修改痕迹。

访问受限：Ironclad 帮助中心弹出 Cloudflare 验证，下面关于它的说法来自所引文章的搜索摘要；LegalOn 和 Harvey 的 playbook 帮助页要登录；Definely 没有公开的 playbook 功能，它公开发布的是 Enhance、Cascade、Vault（[LegalTechnologyHub](https://www.legaltechnologyhub.com/contents/definely-launches-agentic-ai-powered-contract-review-tool-enhance/)、[LawNext](https://www.lawnext.com/2025/08/de%EF%AC%81nely-launches-%EF%AC%81rst-of-its-kind-solution-leveraging-advanced-ai-models-to-track-knock-on-effects-of-changes-within-a-contract.html)）。

## 主要发现：已经成为标配的十种做法

把下面各家的功能放在一起看，以下十种做法至少有三家在用，属于行业标配：

1. 立场阶梯：先写首选，再写若干个退让（Spellbook 3 个，SpotDraft 2 个，Wordsmith 4 个，LegalOn、Ironclad、Luminance 也有）。Juro 用的是“可接受 / 不可接受”两档。
2. 每个立场附上批准过的措辞（Spellbook、SpotDraft、Ironclad、LegalOn、Luminance）。
3. 偏离标准时，转给指定的审批人（Spellbook、Ironclad、SpotDraft、Luminance、Wordsmith）。
4. AI 根据已有材料起草 playbook，人对照原文检查后再发布（LegalOn、Luminance、Spellbook、Wordsmith、Juro，Ironclad 由领域专家参与）。
5. 编写有门槛、有版本：先存草稿，再发布（Spellbook、Ironclad、Juro、SpotDraft）。
6. 每条规则返回状态、理由和在合同里的位置（LegalOn、Juro、SpotDraft、Wordsmith、Jurist）。
7. AI 给出修订建议，由人接受或拒绝，可以换成退让版本（Ironclad、SpotDraft、Wordsmith、Juro）。
8. 内部指引和发给对方的评论分开（Spellbook、Ironclad、Wordsmith）。
9. 按情形适用：我方立场、地区、合同类型（Ironclad、LegalOn、Spellbook）。
10. 两类使用者：法务写标准，业务人员先过第一轮，拿不准的升级给法务（Ironclad、Wordsmith、Luminance、LegalOn）。

没有找到任何一款 playbook 产品的独立准确率评估。速度数字（"up to 85% faster"、"90% time saving"）都是厂商自述。

## LegalOn（My Playbooks、Playbook Agent）

- 法务团队编写审阅指引，保证审阅口径一致。同一套标准可以给采购、销售和信息安全团队用，审阅仍然 "under legal's control"，即由法务掌控（[My Playbooks，2025 年 1 月](https://us-direct.legalontech.com/post/introducing-my-playbooks)；[Playbook Agent，2025 年 12 月](https://www.legalontech.com/post/meet-playbook-agent-scale-your-legal-expertise-with-ai)）。没有找到公开的权限模型。
- 一条标准包含首选和退让立场、范本措辞，以及 "adaptive risk settings that match your deal context"（按交易情况调整的风险设置）。"Handle both sides" 指它能区分我方是哪一方。可以选法域，MSA、NDA 覆盖 20+ 个法域（[产品页](https://legalontech.com/contract-playbooks)）。
- 创建：有 135+ 个由律师编写的 playbook（较早的一篇文章说 50+），支持 Excel 导入。Playbook Agent 能把清单、Word、表格、邮件和历史修订稿转成 playbook，发布前把每条规则放在来源原文旁边让人检查（[Agent 文章](https://www.legalontech.com/post/meet-playbook-agent-scale-your-legal-expertise-with-ai)）。
- 结果：通过 / 未通过标识，点一下跳到对应条款，按首选措辞生成修订，可同时套用几个 playbook（[My Playbooks](https://us-direct.legalontech.com/post/introducing-my-playbooks)）。2026 年 2 月推出的 Triage 代理会让低风险合同走快速通道（[Artificial Lawyer](https://www.artificiallawyer.com/2026/02/10/legalon-launches-family-of-inhouse-agents/)；[新闻稿](https://www.legalontech.com/press-releases/legalon-launches-five-ai-agents-driving-step-change-productivity-for-in-house-legal-teams)）。
- 定价方式：包含在订阅里（[文章](https://us-direct.legalontech.com/post/introducing-my-playbooks)）。"Up to 85% faster" 是厂商说法。

## Ironclad（AI Playbooks、Jurist）

- 建 playbook 需要管理员身份和 Workflow Designer 权限（[Create AI Playbooks](https://support.ironcladapp.com/hc/en-us/articles/24948981301143-Create-Ironclad-AI-Playbooks-in-Workflow-Designer)）。一份试点指南面向非法务人员做第一轮修订，建议先从一个经常谈判的流程里的 3–5 个条款开始（[指南](https://support.ironcladapp.com/hc/en-us/articles/34164717490327-Recipe-Build-an-AI-Playbook-for-Non-Legal-Users-to-Handle-First-Pass-Redlining)）。精确的修订只显示给条款审批人（[指南](https://support.ironcladapp.com/hc/en-us/articles/34018339425303-Recipe-Build-a-Playbook-to-Help-Legal-Reduce-Negotiation-Time)）。
- 每个条款包含：首选措辞、退让立场、一个审批人（建议设为一个组）、可选的 AI 条款类型、模板化评论。立场可以按条件限定，比如用的是不是对方的合同文本、地区。标为 "required" 的条款，要删掉必须经过审批（[Create AI Playbooks](https://support.ironcladapp.com/hc/en-us/articles/24948981301143-Create-Ironclad-AI-Playbooks-in-Workflow-Designer)）。
- 自定义 AI 条款用一个名称、一段描述和 1–2 个例子训练（同一页面）。Jurist 的做法是：Ironclad 的法律专家团队打磨客户上传的 playbook，再用一套人工修订过的合同作为标准答案集（"golden set"）来验证（[博客，2026 年 4 月](https://ironcladapp.com/resources/articles/jurist-redlining-playbooks)）。能给 Jurist 用的 playbook 需要 Ironclad Services 参与（[Jurist 帮助页](https://support.ironcladapp.com/hc/en-us/articles/34188767294359-Use-Jurist-Redlining-Agent-with-Playbooks-and-Precedents)）。
- 结果：修订按改动从小到大排列，并附解释；可以在首选、退让、不改之间切换；生成 "counterparty-ready comments"，即可以直接发给对方的评论。Jurist 的每处修改都带理由、风险等级和来源。偏离标准要走 "Request an exception"（申请例外），审批没完成时，流程不能进入下一阶段（[Request Exceptions](https://support.ironcladapp.com/hc/en-us/articles/24732207191959-Request-Exceptions-for-Non-Standard-Playbook-Terms)；[Use Playbooks](https://support.ironcladapp.com/hc/en-us/articles/12275585451159-Use-Playbooks-in-Workflows-and-Contract-Reviews)）。

## Juro（AI Review playbooks）

- 只有 Workspace Admin 和 Editor 能使用 AI playbook（[设置说明](https://intercom.help/juro/en/articles/16019964-setting-up-ai-review-playbooks)）。
- 规则字段：名称（用于匹配条款）、优先级低 / 中 / 高（只用于分级）、可接受立场、不可接受立场。该页面没有退让、我方立场或法域字段。
- 创建方式：从起步模板、从零开始，或上传 Word 版 playbook 转成规则。
- 结果分为 Acceptable / Unacceptable。可以 Accept 或 Reject 并写评论（"cannot be undone"，即不能撤销），最后 "Mark review as complete"（[AI Review](https://intercom.help/juro/en/articles/12691465-ai-review-in-juro)）。定价按报价（[Signeasy，第三方](https://signeasy.com/blog/business/juro-pricing)）。

## SpotDraft（VerifAI）

- 指引字段：Title、Guideline（复杂规则拆成几个子检查）、Typical Wording（常用措辞）、最多两个 Fallback（[指南，测试版](https://help.spotdraft.com/hc/en-us/articles/31094359246493)）。
- 结果：一张卡片写明理由，有常用措辞和退让 1 / 2 的标签页，Apply 生成修订，Go To 跳到对应段落。
- 某条指引 "Is Not Met"（未满足）时，可以通过条件库触发审批或复核；每个新版本都会重新跑一遍指引（[测试版](https://help.spotdraft.com/articles/9083925706-using-verifai-guidelines-to-trigger-approvals-and-reviews-beta)）。
- "Instant Check" 可以先拿一条临时指令在文档上试，再存成指引（[LawNext，2023 年 10 月](https://www.lawnext.com/2023/10/clm-company-spotdraft-unveils-generative-ai-contract-review-add-in-for-word-and-for-a-time-its-free.html)，基于演示）。

## Luminance

- 从 playbook 和范本里提取首选立场、退让措辞和审阅标准，转成结构化标准；声称能找出 playbook 的缺口（[谈判功能页](https://www.luminance.com/platform/product/negotiation)）。
- Playbook Agent 给出带来源的引用，标出含糊或不完整的立场，部署前自我验证，可以导出 Excel（[2026 年 10 月更新](https://www.luminance.com/blogs/agentic-contract-workflows-and-negotiation)）。
- 业务团队自己推进常规合同，例外转给法务（[谈判功能页](https://www.luminance.com/platform/product/negotiation)）。Lumi Go 给对方一个 Word 工具；Artificial Lawyer 认为它还算不上完全自动谈判（[AL，2024 年 12 月](https://www.artificiallawyer.com/2024/12/11/luminance-offers-lumi-go-auto-negotiation-capability/)）。
- 上手成本（竞争对手来源，没有试点数据）："Budget for a legal-ops owner"，即要预算一位法务运营负责人；第 2–4 周用来配置 playbook（[Vaquill](https://www.vaquill.ai/blog/luminance-review-honest-assessment)）。

## Wordsmith AI

- 第一份 playbook 可以从上传的范本生成，也可以手动定义规则；每条规则最多 4 个退让立场；用大白话写指令，让销售和采购先审，再升级给法务；审阅途中可以改一条规则并重新运行（[博客，2025 年 8 月](https://www.wordsmith.ai/blog/outsmart-contract-chaos-playbook-powered-legal-review-that-actually-works)）。

## Robin AI（参考价值弱）

- 按合同类型建 playbook，分 "light" 和 "standard" 两种修订力度（[Robin 文章](https://robinai.com/post/latest-custom-playbook-features)，现已 404）；使用 playbook 需要付费账号（[Office Watch](https://office-watch.com/?p=64733)）。有报道称它在 2025 年 12 月出售了资产（[rfp.wiki](https://www.rfp.wiki/vendors/luminance/robin-ai)，未核实）。

## Spellbook 补充

- 支持 "Suggest A Rule from Selected Text"（从选中文字建议一条规则）和 "Suggest Rules from Current Document"（从当前文档建议规则）（[创建说明](https://help.spellbook.legal/en/articles/11327030-how-to-create-playbooks)）；每条规则最多 3 个退让立场（[博客，2025 年 6 月](https://spellbook.com/blog/faster-smarter-playbooks)）。定价来源互相矛盾（[Bind](https://bindlegal.com/resources/comparisons/spellbook-pricing-2026/)）。
