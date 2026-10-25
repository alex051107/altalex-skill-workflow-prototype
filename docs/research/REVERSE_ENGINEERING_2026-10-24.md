# 逆向还原：金融营销预审工具与法律 Skill 构建器

2026-10-24 版，检索于 2026-10-23（美东时间）。只用公开网页，没有注册、登录或下载文件。已有的 [合同 playbook 竞品](COMPETITOR_PLAYBOOKS_2026-10-23.md)、[workflow 平台与新加坡市场](WORKFLOW_BUILDERS_AND_APAC_2026-10-23.md)、[Harvey/Spellbook](LEGAL_BUILDER_PATTERNS.md) 里列过的功能，这里不再重复。

每条结论后面带一个来源标签：
- 【公开说明】厂商官网、帮助中心、发布说明或监管文件；
- 【公开说明·摘要】官方页面要登录或打不开，内容取自搜索引擎摘要，没有逐字核对；
- 【第三方报道】媒体、目录站、竞争对手的说法；
- 【推论】本文根据上述材料作出的判断。

厂商给出的速度和准确率，一律是厂商自述。

访问受限记录：Harvey 帮助中心的详细文章跳转登录；Legora 帮助中心没找到 Workflow 文章；Saifr、Haast、Luthor、Hadrius 没有公开帮助文档；Red Marker 2019 年 ASIC 活动幻灯片超过抓取上限；Norm Ai 两个招聘页返回 404；CoCounsel 的 skill workflows 帮助页返回 404。Smarsh、Global Relay 的公开材料只涉及存档与通讯监控，没找到发布前的营销审查功能（[Warrant 合作页](https://www.hellowarrant.com/partner/smarsh) 也把 Smarsh 定位为下游存档，属竞争对手说法）；ComplySci 没找到营销审查产品页。

## 先说结论：这份调研支持了三个判断

### 判断一：客户自己建流程，是真缺口

AltaLex 现在的流程都由平台预置。测试账号里，Negotiation Playbook 每次运行都要重新上传团队手册；尽调流程背景只要求查 3 项，首轮生成了 28 项，还写出附带条件的“Transaction can proceed”【测试账号实测，见 [试用记录](../RESEARCH_NOTES.md)】。营销预审的同行也没解决这件事：IntelligenceBank 的客户只能建 prompt 规则，保存前不能测试；Haast、Norm Ai、Red Oak、Warrant 的规则由厂商的法律工程师或实施团队搭【公开说明】。

所以原型做的是：客户团队自己写任务、自己存清单，先用样例试用，再保存。

### 判断二：Skill 这样拆，跟着的是行业通行做法

合同 playbook 工具已经把“团队标准”拆成固定几样：首选立场、几级退让、批准过的措辞、偏离时找谁审批、按情形适用。Spellbook、SpotDraft、Ironclad、LegalOn、Luminance、Wordsmith 都有其中大部分【公开说明，见 [合同 playbook 竞品](COMPETITOR_PLAYBOOKS_2026-10-23.md)】。新加坡律政部 2026 年 3 月的生成式 AI 指南要求使用者核实 AI 输出，责任不转给工具【公开说明】。

所以原型把两件事分开存：任务（Skill）写“怎么审”，团队依据写“我们的标准是什么”。每条结论都要指回原文的行和依据的条目，方便人核实。这个结构不是我发明的，我做的是把它搬进营销预审，并让客户自己编辑。

### 判断三：营销只是第一个场景，骨架在法律审阅里通用

营销预审、合同审阅、尽调，做法其实是同一条线：
1. 受理登记，看材料齐不齐；
2. 先确认前提，前提不成立就不往下审；
3. 拿团队标准逐条对照；
4. 分清“缺证明”和“写错了”；
5. 写给对方或负责人；
6. 人来拍板，并留档。

营销预审特别的地方有三处：规则随发布形式变化，有“能不能公开推广”这个前提，还要看整帖的整体印象。原型把它们做成了通用机制：条目的适用条件、可勾选的前置条件、单独的清单条目，没有写进代码。同一个对照任务换上 NDA 底线，按我方角色选适用条目，也能跑通【实测，见 [验证记录](../VALIDATION.md)】。

选营销做第一个场景，是因为题目点名了它，规则有公开监管文件可依，最能体现“缺证明不等于写错”，还能用虚构和公开材料完整验证【推论】。

边界：通用性只在营销和 NDA 两个场景上跑通过；合同审阅的其他类型和尽调还没测。竞品信息只来自公开网页。

## 主要发现

1. 我原以为的几个差异点，别人已经做了。营销预审领域公开资料最完整的是 IntelligenceBank（2024 年收购澳洲 Red Marker，[公告](https://intelligencebank.com/news/big-news-intelligencebank-acquires-ai-content-compliance-platform-red-marker/)）。它让投稿人选渠道和市场来决定哪些规则适用，固定规则和大模型规则并存，结论能回指原文。这三件事和我们的设计同构，已有现成实现，不能当差异点讲。【推论】
2. 同一套帮助文档也写明了缺口。客户自己只能建 prompt 规则，也就是用一段自然语言描述的检查规则；点 "Save & Apply" 立即生效，保存前不能测试（厂商说在路线图上）。其他类型的规则，要向厂商的规则团队提变更请求。Haast、Norm Ai、Red Oak、Warrant 的规则也由厂商的法律工程师或实施团队一起搭建。法律工程师指懂法律、负责把规则配进系统的人。【公开说明】
3. 公开资料里，没有一家把“缺少证明材料”和“文案本身有问题”分成两种结果。缺披露、缺必备信息，都记成一条风险。最接近的是 Luthor：它用公司已批准的资料核对数字，但不向投稿人索要材料。【推论】
4. 金融营销工具输出的是“触发了哪些风险”的列表，审批挂在整份素材上。逐条列出每条规则通过、未通过、有没有覆盖到，出现在合同工具里（Spellbook、Harvey）。我们把合同工具的逐条覆盖用到营销预审，属于把已有做法组合起来，算不上发明。【推论】
5. MAS 的数字广告指引 2025 年 9 月发布、2026 年 3 月 25 日生效，里面按格式给了披露的例子。现有工具处理视频，主要靠把语音转成文字；IntelligenceBank 写明只分析英文口语，画面检查“即将推出”。最终画面里风险提示是否醒目，文字稿判断不了。我们把它列为待补材料，方向是对的。【公开说明 + 推论】

## 1 金融营销预审工具

### 1.1 IntelligenceBank / Red Marker（澳洲）

对象模型。管理员在 Admin > Risk Rules 看到规则表，右侧是详情面板（[规则导航](https://help.intelligencebank.com/support/solutions/articles/51000515274)、[规则类型](https://help.intelligencebank.com/support/solutions/articles/51000504437-content-risk-review-rule-types)、[风险等级](https://help.intelligencebank.com/support/solutions/articles/51000519965-risk-level-ratings-faq)、[prompt 规则](https://help.intelligencebank.com/support/solutions/articles/51000526472)）。每条规则有下面这些字段。【公开说明】

| 字段 | 作用 |
|---|---|
| Name、唯一 ID、Description | 规则名称与检查内容 |
| Rule type | 确定性规则（传统 ML，无生成式 AI）、混合规则（Source of Truth，对照长篇源文件）、LLM 规则（定制 Advanced AI、开箱即用的 Agentic 规则）、Prompt 规则 |
| Risk Type | Legal & Compliance / Brand / Spelling & Grammar |
| Risk Categories | 组织自定义的过滤值，如 Channel、Market、Region；设为 Any 时总是适用 |
| Feedback | 规则触发时审阅者看到的说明 |
| 词表 | trigger 触发词；proximity 须出现在附近的词；exception 豁免词；absent 文档里一出现就排除这条规则的词 |
| Required disclaimers | 必须出现的免责声明 |
| Risk Level | High / Medium / Low / Advisory，按规则设定，同一规则的所有发现等级相同 |
| Prompt | 只有 prompt 规则有，用自然语言写检查内容 |

谁建、谁用。Main Admin 设风险等级。开通功能后，Admin 可以建 prompt 规则。其余规则只能由 IntelligenceBank 的规则团队修改，客户通过 "Request Change" 表单提出。投稿人在启用了审查的数据库里建记录、填过滤字段、上传文件。【公开说明】

创建与测试。prompt 规则只有名称、描述、风险等级、Prompt 四项，保存即上线，没有审批步骤。文档建议保存后拿真实文件看结果，再回头修改。2019 年，Red Marker 与 Allens 在 ASIC（澳大利亚证券投资委员会）的活动上展示了 13 条规则。这些规则由业务人员不写代码建立，平均每条约 30 分钟，用于 180 份样本。其中有一种条件式的必备信息规则，例如“出现年利率时须同时给出比较利率”（[ASIC 托管的幻灯片](https://download.asic.gov.au/media/5425776/asic-regtech-financial-promotions-2019-08-02-red-marker-and-allens.pdf)）。【公开说明·摘要，数字为厂商自述】

运行与结果。投稿时填的过滤字段决定哪些规则适用，文档提醒 "Be accurate with your filter selections"（[投稿说明](https://help.intelligencebank.com/support/solutions/articles/51000504440-submitting-content-for-marketing-compliance-review)）。风险以批注评论呈现，点一下跳到原文并画框。结果可以按规则分组，显示所在句子并高亮触发词；摘要按类别计数、按规则列出（[结果说明](https://help.intelligencebank.com/support/solutions/articles/51000504441-understanding-risk-types-and-reviewing-results)）。API 对每条风险返回触发词、句子、两者的字符位置、解释、规则名与描述（[API 说明](https://help.intelligencebank.com/support/solutions/articles/51000504450)）。整份文档的总评级还没有提供。【公开说明】

人工处理与留痕。【公开说明】
- 点 Dismiss 后，条目变灰，但仍计入后台报表；文档只建议附上理由。
- 改稿在系统外完成，用 Add Revision 上传后重新扫描。
- "Get Suggestion" 给出替代文字，由用户自己复制。
- 处理完后点 Request Approval，审批人由投稿人自己配置。
- Low 等级的标注也要处理完才能批准。评论会保留，但目前不能出报表。
- 风险等级的修改记入使用日志，只影响之后的审查（[处理风险](https://help.intelligencebank.com/support/solutions/articles/51000504442-working-with-identified-risks)）。
- 厂商声明自动检查是辅助人工，不替代人工（[限制说明](https://help.intelligencebank.com/support/solutions/articles/51000504445-marketing-compliance-risk-reviews-frequently-asked-questions-limitations-and-considerations)）。

它押的赌注：市场团队在素材库里直接收到合规批注，合规只处理剩下的部分。公开资料里看不到这几件事怎么解决：客户自建规则的试跑与版本、证明材料的追索、视频画面和非英文语音。【推论】

对我们的启发。【推论】
- 采用“投稿时填的信息决定哪些条目适用”。还可以借 absent 词表的思路，扩展我们的适用条件（applies_when）：出现某类表述时，规则才适用或不适用。
- 调整 Dismiss：驳回时必须写理由。
- 不采用“投稿人自选审批人”。决定人仍写在清单条目上。

### 1.2 Warrant（美国）

- 披露库按全公司、产品、州牌照三层组织。扫描时检查已批准文本是否原样出现，改写或转述都会被标出。同一条披露可以存完整版和短版，任一版通过即可。披露在库里改一次，系统会对已有素材重新抽取、重新扫描（[披露库](https://www.hellowarrant.com/platform/disclosure-library)）。【公开说明】
- 审批链分阶段顺序执行，阶段内可以设 AND / OR。素材按政策得到 Low / Med / High 三档，Low 可以自动批准发布。审批挂在单个文件上，记录每次批准、时间、版本和路由决定（[审批流](https://www.hellowarrant.com/platform/approval-workflows)）。厂商称可自动处理 80% 以上的队列。【公开说明，数字为厂商自述】
- 预检标注都会引用规则。入驻时由专人配置收件表、路由和披露手册，厂商称多数团队约 60 天上线（[首页](https://www.hellowarrant.com)）。【公开说明】
- 对我们：采用“批准文本逐字核对 + 渠道短版”，R2 的批准文本可以加一个短版。不采用低风险自动发布，因为 MAS 指引第 3.3 段写明，高管可以委派职责，但问责不能委派（[MAS FSG-03](https://www.mas.gov.sg/regulation/guidelines/guidelines-on-standards-of-conduct-for-digital-advertising-activities)）。【推论】

### 1.3 Red Oak（美国）

- Disclosure Intelligence 用规定式规则，按材料类型、受众、地域决定需要哪些披露。披露库带使用说明、旧版归档、多语言和自动审计记录（[披露管理](https://www.redoak.com/admaster/overview/smart-review/)）。【公开说明】
- AI Review 于 2025 年 1 月发布，配置的单位是 prompt。实施团队按公司政策定制，合规人员也可以自己加。客户可以接自己的大模型，不需要训练模型。投稿人在正式送审前先拿到反馈（[产品页](https://www.redoak.com/ai-review)、[发布稿](https://www.redoak.com/red-oak-compliance-launches-ai-review-module-to-accelerate-advertising-review)）。结果格式、prompt 版本、上线前测试都没有公开。【公开说明】
- 对我们：Red Oak 把“该有哪些披露”交给规则引擎，把“措辞有没有问题”交给模型。这印证了我们的分工：代码判断 R0、R3、R5 是否适用，模型逐条判断措辞。【推论】

### 1.4 Saifr（富达旗下，美国）

- 在 Azure 模型目录里拆成四个模型：营销合规（文本分类）、风险解读（生成）、措辞建议（生成）、图像检测（[Azure 目录](https://ai.azure.com/catalog/publishers/saifr)、[Saifr 说明](https://saifr.ai/microsoft-azure)）。【公开说明】由此推断，它是“先分类标出，再解释，再改写”的三段流水线。【推论】
- 风险类别是按监管要求固定下来的分类：承诺或误导性措辞、比较排名评级、业绩宣称、客户见证、免税收入等，对应美国的 FINRA 2210、SEC 482 与 SEC 营销规则（FINRA 是美国证券业自律组织，SEC 是美国证券交易委员会）。产品页没有提到公司自定义规则。视频先转成文字再扫描（[SaifrReview](https://saifr.ai/saifrreview)）。厂商称最多能发现人工审阅者会发现的问题中的 90%。【公开说明，数字为厂商自述】
- 它押的赌注：一个预训练好的监管分类器，对所有公司都够用。它不处理公司自己的标准。对我们：不走通用分类器的路线，但可以借它的类别，作为“依据外条款”（uncovered）的提示范围。【推论】

### 1.5 Norm Ai（美国）

- 用自有的领域语言，把法规和公司政策写成决策树；同一份写法既给人看，也能直接执行。由持律师资格的“法律工程师”用无代码工具搭建（[Norm 说明](https://www.norm.ai/resources/what-is-a-regulatory-ai-agent)）。【公开说明】[SiliconANGLE](https://siliconangle.com/2025/03/11/ai-agent-powered-compliance-automation-startup-norm-ai-raises-48m/) 有相同描述。【第三方报道】
- Prudential 的案例：营销人员送审前先跑一遍，代理逐行审。每条评论绑定具体规则并给出替代措辞，最终判断归人工（[案例](https://www.norm.ai/resources/inside-prudentials-marketing-transformation-with-norm-ai)）。New York Life 的代理由 Norm 的法律工程师调好后交付（[案例](https://www.norm.ai/post/new-york-life-and-norm-ai-partner-to-transform-compliance)）。【公开说明，客户故事由 Norm 发布】
- 竞争对手 Warrant 称，Norm 的营销专用能力有限（[对比文](https://www.hellowarrant.com/blog/warrant-vs-normai)）。【第三方报道，竞争对手说法】
- 对我们：“律师先把标准拆成小判断点，模型只回答每个点”，和我们的分工同源。差别只在谁来拆：Norm 是厂商的律师，我们让客户团队自己拆，并且先试跑。【推论】

### 1.6 Haast、Luthor、Hadrius

- Haast（悉尼，客户包括 Telstra、Zurich 澳新与 Aviva，[IT Brief](https://itbrief.com.au/story/haast-raises-aud-6-million-to-expand-ai-compliance-platform)【第三方报道】）：每个合规任务配一个代理，容忍度按代理设置。规则集可以按产品线、地区、团队、活动区分，由 Haast 的法律工程师结合法规和内部手册一起建。每条标注都能追溯到规则（[平台页](https://www.haast.io/platform)）。官方列出 FCA、ASIC、FINRA、UCITS、Consumer Duty，称能发现“数字对不上”（[AWS 列表](https://aws.amazon.com/marketplace/pp/prodview-n7a6fg4u3q64w)）。【公开说明】
- Luthor：规则类别有触发词、品牌指引、披露、已批准声明、政策备忘、升级条件、风险阈值、禁用语，可以“新增、修改、覆盖”规则（[法务页](https://www.luthor.ai/solutions/legal-compliance)）。它依据公司已批准的知识库（产品规格、价格、历史声明）核对说法，例子是把“500 个集成”改成“42 个”。结果卡片包含风险等级、状态、原文、规则类别、解释与修改建议（[首页](https://www.luthor.ai)）。【公开说明】
- Hadrius：公开页只有“不可变版本历史”“关联审批日志”“自动审批”等短语，不足以还原对象模型（[营销页](https://hadrius.com/solutions/marketing)）。【公开说明】

### 1.7 渠道：视频、轮播与网红

- Theta Lake：ScriptComp 把录制下来的语音和预先批准的脚本做比较，高亮差异；另外用 OCR（从画面里识别文字）检查画面上的文字（[UC Today，2022](https://www.uctoday.com/unified-communications/theta-lake-risk-and-compliance-suite-review/)）。【第三方报道】厂商的规则单称，工作流可以设为缺了强制免责声明就自动拒绝（[规则单](https://pages.thetalake.com/hubfs/VideoPromotions-FiServ-Rules.pdf)）。【公开说明·摘要】
- IntelligenceBank：视频上限 5 分钟，只转写分析英文口语，画面风险检查“即将推出”。【公开说明】
- MAS FSG-03 的要求（[PDF](https://www.mas.gov.sg/-/media/mas/regulations-and-financial-stability/regulations-guidance-and-licensing/financial-advisers/guidelines/guidelines-on-standards-of-conduct-for-digital-advertising-activities.pdf)）：【公开说明】
  - 例 2.1：轮播图要在每一帧或第一帧披露；视频里的文字披露要停留到能读完；网红推广要写明本人是否持牌。
  - 第 5.4 段：每条帖子单独看都不能误导，不能靠别处的信息来平衡。
  - 第 5.5 段：机构要对推广人制作的视频整体审看，不能只对其中片段负责。
- 对我们：保留“文字稿不能证明最终画面可读”，列为待补材料。可以新增两条按渠道触发的条目：轮播图第一帧披露，外部推广人持牌身份披露。【推论】

### 1.8 横向对比

| 问题 | 公开做法 | 标签 |
|---|---|---|
| 公司规则与监管规则怎么放 | IntelligenceBank 在同一张规则表里放现成的监管规则库（澳洲零售银行 74 条，对应 ASIC RG 234 等，[公告](https://intelligencebank.com/news/new-risk-rule-library-australian-retail-banking/)）和客户自定义规则；Saifr 只有监管类别；Haast、Luthor 把法规框架与内部政策并列输入；Norm 用同一种语言表示两者 | 公开说明 |
| 缺证据与违规是否分开 | 未见。缺披露、缺必备信息都记作风险；Luthor 用内部资料核对数字 | 公开说明 + 推论 |
| 渠道 | 投稿时选渠道筛规则（IntelligenceBank）；视频靠转写或脚本比对（IntelligenceBank、Saifr、Theta Lake）；披露存长短两版（Warrant） | 公开说明 |
| 谁批准 | 审批挂在整份素材上：IntelligenceBank 由投稿人配审批人；Warrant 用模板化的 AND/OR 链，并允许低风险自动批准；Saifr 送法务或合规签字 | 公开说明 |
| 谁写规则 | 主要是厂商的规则团队或法律工程师；客户自建只在边缘（IntelligenceBank 的 prompt 规则、Red Oak 自加 prompt、Luthor 增改规则） | 公开说明 |

## 2 法律 Skill 与 Workflow 构建器：测试、输入、输出、步骤传递

这一节看法律 AI 工具里“自己搭任务和流程”的功能：上线前怎么测，输入和输出怎么定义，前一步的结果怎么交给后一步。

| 产品 | 上线前怎么测 | 输入怎么定义 | 输出怎么约束 | 前一步怎么传给后一步 | 标签 |
|---|---|---|---|---|---|
| Harvey Workflow / Agent Builder | 搭建时用 Test Mode；Agent Builder 有 Test 按钮；保存不等于发布，改动先存为草稿（[帮助页，需登录](https://help.harvey.ai/articles/workflow-builder)） | 步骤类型为 User Input、AI Action、Logic、Output，必须以 User Input 开头、以 Output 结尾；文件上传和文本输入可设为可选（2025-12，[发布说明](https://help.harvey.ai/release-notes/category/agents)） | 以 Output 步骤收尾；可产出 Word、PPT、Excel 和 review table；可嵌模板指导格式（[Agent Builder](https://www.harvey.ai/blog/introducing-agent-builder)） | 摘要提到在后续步骤用"@"引用输入，未能核实 | 公开说明·摘要 + 公开说明 |
| Legora Skills（2026-10） | 无正式测试功能，由各业务组的负责人"创建并测试" | 无专门输入字段，代理需要时追问 | 用参考材料和"不该写成什么样"的反例约束 | Skill 可组合、可打包；Workflow 是固定顺序（[博客](https://legora.com/blog/introducing-skills)） | 公开说明 |
| Legora Tabular Review | 未见 | 文档为行、问题为列 | 列类型有文本、列表、是/否、日期、标签、多标签、Verbatim 原文、人工输入（[帮助页](https://support.legora.com/en/articles/270134-tabular-review)） | 未见说明 | 公开说明·摘要 |
| CoCounsel 工作区模板 | 建议先用测试文档跑一次（[帮助页](https://www.thomsonreuters.com/en-us/help/cocounsel/tax-audit-accounting/workspaces/workspace-templates/create-a-workspace-template-from-scratch)） | 问题与指令，可手写、AI 生成或导入，可分节 | 未见 | 技能"叠加"使用前一结果（原帮助页 404） | 公开说明 + 公开说明·摘要 |
| Spellbook | 最佳实践写"依赖前先测试"，无强制门槛 | 创建时说明文档、代表方、法域 | Rules 页逐条通过或未通过；Questions 页单独回答事实问题，答案带编号引用跳到原文（[概览](https://help.spellbook.legal/en/articles/9926250-playbooks-overview)） | 未见 | 公开说明 |
| Harvey 合同 playbook | 未见 | 上传任意格式手册或范本，转为结构化规则 | 每条款标为 acceptable / needs review / unacceptable；能看到哪些条款已被审、哪些未审；有版本历史（[博客，2025-09](https://www.harvey.ai/en-US/blog/harvey-in-practice-build-and-run-playbooks-in-word)） | 不适用 | 公开说明 |

从这张表得出三点判断，都是【推论】。

样例测试已经是基本功。Harvey 把类型化输入、测试模式、草稿与发布分离做成了默认，2026 年 10 月又取消了“自己用也要审批”。所以我们要讲的是测了什么（正常样例、缺材料样例、修改后重跑），光说“有测试”不够。

Legora Skills 走了反方向：没有类型化输入，由代理自己决定什么时候调用。题目要求命名输入、输出要求和样例测试，营销预审又要留档复核，所以我们保留明确的输入和输出约定。

Spellbook 把事实问题和规则判断放在两个标签页，事实答案带引用。我们“模型只回答逐条事实问题”和它相近。不同在于，我们由代码把答案换算成状态、分流和决定人，模型不直接给结论。

## 3 我们还能主张什么

下面这些已经有人做到，不能再当差异点：
- 按渠道或市场筛选适用规则（IntelligenceBank）；
- 确定性规则与大模型规则并存（IntelligenceBank、Warrant 逐字核对、Norm 决策树）；
- 结论回指原文与规则（IntelligenceBank 画框与字符位置、Spellbook 引用编号、Norm、Haast、Warrant 引规则）；
- 批准文本库与版本（Warrant、Red Oak）；
- 按规则设风险等级（IntelligenceBank）；
- 送审前自检（Red Oak、Norm）；
- 保存前样例测试（Harvey、CoCounsel 建议）。

仍可以主张的有四点，每点都有边界：

1. “缺证明材料”单独成为一种状态，并汇总成给投稿人的补件清单。公开资料里没见到；Luthor 的知识库核对最接近。只能说“未见公开实现”。
2. 在营销预审里，客户团队自己编辑完整的结构化条目（适用条件、首选、可接受退让、批准文本、决定人），并在保存前用样例试跑。IntelligenceBank 只开放 prompt 规则，而且不能试跑；其他厂商靠实施团队。合同 playbook 工具已经允许客户自建同类字段，所以新意在营销预审这个领域，不在字段本身。
3. 每条适用条目在结果里恰好返回一次，包括“适用范围待确认”，形成一张覆盖表。营销工具公开呈现的是触发列表；合同工具已有逐条覆盖。
4. 按新加坡 MAS FSG-03 写清单条目。所查厂商的公开材料列的是 FINRA、SEC、FCA、ASIC，没见到 MAS 规则库。这一点最容易被追平，只适合作为演示的本地化。

## 4 汇总

| 产品 | 可复用单位 | 谁建 / 谁用 | 逐条状态 | 原文定位 / 引用 | 人工接受或驳回 | 版本 / 审批 | 我们取什么 |
|---|---|---|---|---|---|---|---|
| IntelligenceBank / Red Marker | 风险规则（含 prompt 规则）与规则库 | 厂商规则团队 + 客户 Admin / 市场投稿 | 只列触发风险，可按规则分组，无通过行 | 画框、句子与字符位置 | Dismiss（灰显、计入报表），无强制理由 | 风险等级变更有日志；prompt 规则无测试、无审批；素材级审批 | 过滤字段定适用；absent terms；Dismiss 强制写理由 |
| Warrant | 披露库条目、品牌规则、审批模板 | 客户运营 + 入驻专员 / 市场 | 未公开 | 引用规则；评论可挂到行或像素 | 评论线程 | 素材版本；AND/OR 链；低风险自动批准 | 批准文本逐字核对与短版；不做自动放行 |
| Red Oak | prompt、披露规则、披露库 | 实施团队 + 合规 / 投稿人 | 未公开 | 未公开 | 未公开 | 披露旧版归档、审计轨迹 | 披露适用交给规则，措辞交给模型 |
| Saifr | 无客户可配单位，固定风险类别 | 厂商训练 / 市场与合规 | 按类别标注 | 高亮与解释 | 未公开 | 审批状态视图 | 类别作为清单外提示 |
| Norm Ai | 决策树形式的法规与政策代理 | 厂商法律工程师 / 市场与合规 | 逐行评论 | 每条评论绑定规则 | 人工最终判断 | 未公开 | 拆小判断点；改由客户自己拆 |
| Haast | 每任务一个代理与规则集 | 厂商法律工程师共建 / 市场与法务 | 未公开 | 追溯到规则 | 审阅者批准或反馈 | 未公开 | 按产品线、地区分规则集 |
| Luthor | 规则类别与已批准知识库 | 客户可增改 / 投稿人 | 风险卡片带等级与状态 | 原文与规则类别 | 未公开 | 审计日志（企业版） | 用公司资料核对数字 |
| Theta Lake | 内置政策、自定义检测器、批准脚本 | 合规 / 内容制作者 | 风险分 | 脚本差异高亮 | 审阅者处理 | 审计轨迹；缺披露可自动拒绝 | 视频以批准脚本为基准 |
| Harvey Builder | 工作流或代理 | Builder / 获授权用户 | 不适用 | 不适用 | 检查点 | 草稿与发布分离；四级访问 | 输入在前、输出在后的结构约束 |
| Harvey 合同 playbook | 结构化规则 | 管理者 / 律师 | 三级标记 | 未公开 | 一键应用或撤回修改 | 版本历史 | 显示哪些条目已审、哪些未审 |
| Legora Skills / Workflows | Markdown 指令 + 参考材料；固定流程 | 律师与知识团队 / 全所 | 不适用 | 不适用 | 未公开 | 组织级共享需权限 | 用反例约束输出 |
| CoCounsel 模板 | 问题与指令模板 | 个人建、公司管理员上架 / 全所 | 不适用 | 不适用 | 未公开 | 个人库与公司库两级 | 上架前先跑测试文档 |
| Spellbook | playbook 规则与问题 | 1 至 2 名作者 / 律师 | 逐条通过或未通过 | 编号引用跳转 | 编辑、重生成、插入 | 草稿与发布 | 事实问题与规则判断分开 |
