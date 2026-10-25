# AltaLex 团队流程原型（营销材料预审）

刘振鹏 · AltaLex 实习生实战测试 · 2026-10-25

这个原型让合规团队自己搭审查流程。团队先把审查方法存进系统，市场同事以后每次只交文案，就能拿回要改的句子、要补的材料和拍板人，每条结论都能点回原文那一行。

English summary: [below](#english).

## 先看这里

| 想做什么 | 去哪里 | 大约用时 |
|---|---|---|
| 看产品怎么用 | [演示视频](https://alex051107.github.io/altalex-skill-workflow-prototype/media/Zhenpeng_Liu_prototype.mp4)（浏览器直接播放） | 9 分钟 |
| 不装任何东西，直接上手 | 下面的“在线试用” | 5 分钟 |
| 读题目要求的文档 | [提交说明](docs/SUBMISSION.md)、[验证记录](docs/VALIDATION.md)、[AI 使用说明](docs/AI_USAGE.md) | 20 分钟 |
| 核对每条题目要求做到了没有 | [题目要求逐条对照](docs/REQUIREMENTS.md) | 3 分钟 |

## 三个词

| 词 | 意思 |
|---|---|
| 技能（Skill） | 一段写好的工作说明，告诉 AI 这一步看哪些材料、检查什么、交出什么。同一个技能可以放进多个流程 |
| 团队依据 | 团队那一套审查标准，一条一条存进系统。每条写明最希望怎么写、可以退到哪一步、超出时由谁拍板。改动要填修改说明和批准人 |
| 流程（Workflow） | 把几个技能按顺序接起来，前一步的结果自动交给后一步。界面左边的导航叫“工作流” |

## 在线试用

[![在 GitHub Codespaces 中打开](https://github.com/codespaces/badge.svg)](https://codespaces.new/alex051107/altalex-skill-workflow-prototype?quickstart=1)

1. 点上面的按钮，用 GitHub 账号登录。
2. 等一两分钟，浏览器会自动打开原型。没有自动打开的话，点下方“端口”标签里 8765 那一行的地球图标。
3. 左边点“运行记录”，打开“营销材料预审”或“港股交易公告审阅”。这些是用 DeepSeek 真实跑出来的结果，可以直接看审查意见、点原文里标色的句子跳到对应结论。

在线环境默认是演示模式，新提交的材料不会交给 AI 审，每一步只把收到的内容原样回显，用来检查保存和步骤传值。想让新材料也由 AI 审，在 GitHub 的 Codespaces secrets 里加 `OPENAI_API_KEY`（DeepSeek 密钥），再重启这个 Codespace。

## 自己走一遍（对应题目 D1–D5）

下面每一步的按钮名都和界面一致。

1. **建技能。** 左边点“技能”，再点“＋ 创建技能”，选“自己填写”。编辑页分四段，从上往下填：
   - 这个技能做什么：名字、类型（整理型、对照型、起草型）和具体做法。
   - 每次需要哪些材料：每项标明性质。只有“要审的原文”能被引用。
   - 交出什么结果：结果的格式。
   - 用样例试一下：填一份样例，写下结果里应该出现和不应该出现的内容。

   点“试用技能”，看检查点是否全部命中，再点“保存技能”。

2. **组流程。** 左边点“工作流”，再点“＋ 创建流程”，按页面提示点“下一步 →”，依次填名称和用途、每次提交的材料，然后按顺序添加至少两个技能。系统会预选每项材料的来源，标着“系统预选，请确认”。点“保存流程”。

3. **运行。** 在流程卡片上点“提交材料”，填好材料（示例流程可以点“填入示例”），点“运行流程”。页面会显示进度，完成后看“审查意见”和“处理详情”两个标签，后者列出每一步收到了什么、交出了什么。

4. **修改后重跑。** 在流程卡片上点“编辑依据”或“查看与调整”，改一条依据或换一个技能，保存时填修改说明和批准人。回到提交页点“填入上次材料”，再运行一次，结果页会显示“与上次运行相比”。按 F5 刷新，保存的配置都还在。

5. **异常。** 不填必填项就点“运行流程”，页面会说缺哪一项。模型调用失败的效果见下面“检查原型能不能用”。

示例流程在首页的“示例”里，点“安装示例”就能装好。三个示例共用同一个对照技能：

| 示例 | 材料 | 团队依据 |
|---|---|---|
| 营销材料预审 | 新加坡金融营销文案（自带示例） | 示例公司的营销审查清单，12 条（R0–R11） |
| 对方 NDA 对照我方底线 | 对方发来的 NDA（虚构） | 我方 NDA 底线，11 条 |
| 港股交易公告审阅 | 港股须予披露交易公告（真实公开材料），先答问卷确认交易性质 | 港交所 CF007M 清单中的 15 条 |

## 在自己电脑上运行

只要 Python 3.10 以上。服务端只用 Python 标准库，不用 `pip install`，网页不需要构建。

```sh
git clone https://github.com/alex051107/altalex-skill-workflow-prototype.git
cd altalex-skill-workflow-prototype
MODEL_PROVIDER=mock python3 server.py
```

然后在浏览器打开 http://127.0.0.1:8765/ 。这样启动的是演示模式，不需要密钥，也不联网。端口被占用时换一个，例如 `APP_PORT=8799 MODEL_PROVIDER=mock python3 server.py`。数据存在 `data/clausecraft.sqlite3`。

用真实模型：

```sh
cp .env.example .env      # 在 .env 里填 OPENAI_API_KEY（DeepSeek）
python3 server.py
```

| 方式 | 设置 | 说明 |
|---|---|---|
| DeepSeek（演示用） | `MODEL_PROVIDER=openai`、`OPENAI_BASE_URL=https://api.deepseek.com/v1`、`MODEL_NAME=deepseek-flash` | 材料会发送到 api.deepseek.com，提交页有提示 |
| 本机 Ollama | `MODEL_PROVIDER=ollama`、`MODEL_NAME=qwen3:4b-instruct-2507-q4_K_M` | 材料不离开本机，先用 `ollama pull` 下载模型 |
| 演示模式 | `MODEL_PROVIDER=mock` | 不调用模型，只检查保存、步骤传值和报错 |

密钥只在服务端读取，不进网页、运行记录或导出文件。`.env` 写在 `.gitignore` 里。模型调用失败时直接报错，不会悄悄换成演示模式。

## 检查原型能不能用

下面这些命令我在 2026-10-25 从 GitHub 重新克隆后逐条跑过，结果都通过。

```sh
python3 -m unittest discover -s tests          # 服务端测试，不联网
node tests/test_frontend_bindings.js           # 前端测试，需要 Node
python3 scripts/smoke_d1_d5.py                 # 服务启动后运行，走一遍 D1–D5，每项打印 PASS 或 FAIL
sh scripts/failure_demo.sh                     # 用无效密钥在 8766 端口启动，演示模型调用失败（需要联网）
```

`smoke_d1_d5.py` 会新建两个技能、把它们组成流程、运行、检查第 2 步收到了第 1 步的结果、修改技能后重跑，再提交一份空材料看报错。服务不在 8765 端口时，把地址写在后面，例如 `python3 scripts/smoke_d1_d5.py http://127.0.0.1:8799`。

## 文件在哪

| 位置 | 内容 |
|---|---|
| `docs/SUBMISSION.md` | 提交说明：业务理解、澄清问题与假设、调研、方案与计划、功能位置、验证与复盘 |
| `docs/VALIDATION.md` | 验证记录：一个完整成功案例、六类失败和异常、全部评测数字 |
| `docs/AI_USAGE.md` | AI 使用说明：工具、6 条关键提示词原文、一个被我否定的 AI 建议 |
| `docs/REQUIREMENTS.md` | 题目要求逐条对照 |
| `server.py` | 服务端：存储、运行、逐条对照和代码检查 |
| `static/` | 网页 |
| `tests/`、`scripts/` | 自动测试、验收和复现脚本 |
| `examples/` | 三个示例流程、真实推广文案（已去掉机构名）、港股公告来源 |
| `audit/`、`evidence/` | 测试集、冻结的标准答案和原始运行记录 |
| `docs/research/` | 竞品逆向、资深审阅人方法、AltaLex 设计追踪 |

## 边界

- 没有访谈真实客户，结果也没有请执业律师验收。清单参照 MAS 数字广告指引、ASAS 附件 B、《证券及期货法》及集合投资计划规例写成，具体段落引用还需律师核对。
- 示例清单是虚构的公司政策。真实材料上的结论只按示例清单得出，不代表原广告或公告违规。
- 只处理粘贴的文字，不识别图片、视频和 PDF 版式。单用户本机运行，没有多人权限和发布审批。

## English

A take-home prototype for AltaLex. A compliance team builds its own review workflow. A Skill stores how one step of the review is done: what to read, what to check, and what to hand back. The team standard (团队依据) stores the company's review rules as structured items: preferred wording, acceptable fallback, and who decides. A Workflow chains Skills so each step's output feeds the next. Every finding points back to a line in the submitted text.

- Demo video (about 9 minutes, Chinese narration): [watch in the browser](https://alex051107.github.io/altalex-skill-workflow-prototype/media/Zhenpeng_Liu_prototype.mp4).
- Try it online: click the Codespaces badge above. The three example workflows and finished DeepSeek runs are already loaded. New submissions run in demo mode unless you add an `OPENAI_API_KEY` Codespaces secret.
- Run locally (Python 3.10+, standard library only): `MODEL_PROVIDER=mock python3 server.py`, then open http://127.0.0.1:8765/.
- Real model: `cp .env.example .env`, set `OPENAI_API_KEY` (DeepSeek), run `python3 server.py`.
- Check it works: `python3 -m unittest discover -s tests`, `node tests/test_frontend_bindings.js`, and with the server running `python3 scripts/smoke_d1_d5.py`, which walks D1–D5 and prints PASS or FAIL for each check.
- Docs (in Chinese): [SUBMISSION](docs/SUBMISSION.md), [VALIDATION](docs/VALIDATION.md), [AI_USAGE](docs/AI_USAGE.md), [REQUIREMENTS](docs/REQUIREMENTS.md).

The checklists are fictional company policies written from public regulatory documents. No real client was interviewed and no practising lawyer has signed off on the output.
