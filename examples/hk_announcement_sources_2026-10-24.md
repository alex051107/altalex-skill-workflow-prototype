# 港股公告审阅示例的真实材料（来源记录）

这份记录写给想核对港股示例材料来源的人。原型里有一个“港股交易公告审阅”流程，它用到三份真实文件。第一份是港交所的公告核对清单 CF007M。另外两份是港股上市公司刊发的交易公告。下面记下每份文件从哪里下载、什么时候下载、文件指纹是多少，以及我怎样把它们转成纯文本。

文件指纹是 SHA-256 值。你自己下载同一个网址，算出的 SHA-256 和这里一致，就说明拿到的是同一份文件。

## 下载和读取方式

- 下载时间是 2026-10-24（美东时间上午），工具是 curl。
- 全部文件都按不可信资料处理。我只用 `python3 -I` 脚本和系统 `pdftotext` 读取，没有打开或执行文件内容。
- 抽取脚本放在本文件夹之外，在会话临时目录 `scratchpad/hk/docx2txt.py`、`pdf2txt.py`。

## 1. 港交所清单 CF007M

CF007M 是港交所的一份核对清单，对象是主板公司的须予公布交易和关连交易公告。清单逐条列出这类公告要写的内容，每页表头有“是否遵守”一栏。原型的港股示例从里面挑了 15 条。

| 项目 | 内容 |
|---|---|
| 文件 | `cf007m.docx` |
| 标题 | Checklist: Announcement for Notifiable Transaction and Connected Transaction (Main Board) |
| URL | https://www.hkex.com.hk/-/media/HKEX-Market/Listing/Rules-and-Guidance/Forms/Equity-Securities-Issuers/cf007m.docx |
| 版本 | 页脚印 “Jun 2024”；文档属性最后修改 2024-06-05 |
| 大小 | 126637 字节 |
| SHA-256 | `ba0db1eee67771d1d83e90602e0929b143d734f755cd171469b4c1ac3afde48c` |
| 纯文本 | `cf007m.txt`，11630 字节，SHA-256 `1584c606c043844564a5616f4c89b4e347bf47b39f2dc2a00d2bd51134170cd8` |

现行版本核对。港交所 Main Board Issuers 清单页面（https://www.hkex.com.hk/Listing/Rules-and-Resources/Checklist-forms-and-templates/Forms/Equity-Securities-Issuers/Main-Board-Issuers?sc_lang=en ）标注 “Last updated in October 2026”。页面在 “1.1 Checklists and Forms relating to Announcements and Trading Arrangements” 下列出 “CF007M Notifiable Transaction and Connected Transaction Announcement”。它的链接正是上面的 URL，旁边没有更新日期标记。2026-10-24 从该链接下载到的就是 2024 年 6 月版。

抽取方式如下。

1. 用 zipfile 读 `word/document.xml`，按文档顺序输出段落和表格。
2. Word 自动编号按 `numbering.xml` 还原为 (1)、(2)……，每条规则下重新计数。带分节符的空段落不计号。
3. 每页重复的表头 “Page | Complied With? (Y/N/NA) | Comment” 已删去。

## 2. 主样例（须予披露交易，非关连交易）

须予披露交易按交易规模的比例来划分。这份公告写明，适用百分比率超过 5% 但低于 25%，所以属于须予披露交易。关连交易是和关连人士做的交易，下一节 AEON 公告的买方就是关连人士。这份 BFB 公告只属于须予披露交易。

| 项目 | 内容 |
|---|---|
| 文件 | `00205_BFB_Health_2026-09-28_discloseable.pdf` |
| 发行人 | BFB Health Limited（主板，股份代号 00205） |
| 标题 | DISCLOSEABLE TRANSACTION DISPOSAL OF A SUBSIDIARY |
| 刊发 | 2026-09-28 22:34（披露易时间） |
| 披露易分类 | Announcements and Notices - [Discloseable Transaction] |
| URL | https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0928/2026092802025.pdf |
| 页数 | 5 |
| 大小 | 71766 字节（披露易列表标 70KB） |
| SHA-256 | `a3058887a307ab49d375e18ec33bd9fdafd77d14adc1fd8677945cfe2b7508ec` |
| 纯文本 | `00205_BFB_Health_2026-09-28_discloseable.txt`，8890 字节，SHA-256 `30ca4a9a93c93dcce4ebb489f9ec3c6ccb0c843ffc25851853e82b333179544b` |

公告自己写明了问卷要问的三件事。

- 买方为独立第三方，不是关连人士。
- 适用百分比率超过 5% 但低于 25%，属须予披露交易。
- 公司只须遵守申报及公告规定，公告没有提到股东批准或通函。

## 3. 对照样例（须予披露交易兼关连交易，豁免股东批准和通函）

| 项目 | 内容 |
|---|---|
| 文件 | `00984_AEON_Stores_2026-08-12_discloseable_connected.pdf` |
| 发行人 | AEON Stores (Hong Kong) Co., Limited（主板，股份代号 00984） |
| 标题 | DISCLOSEABLE TRANSACTION AND CONNECTED TRANSACTION IN RELATION TO THE DISPOSAL OF LISTED SECURITIES |
| 刊发 | 2026-08-12 17:22（披露易时间） |
| 披露易分类 | Announcements and Notices - [Discloseable Transaction / Connected Transaction] |
| URL | https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0812/2026081200750.pdf |
| 页数 | 6 |
| 大小 | 82322 字节（披露易列表标 80KB） |
| SHA-256 | `9d9632aa20af52b34179365ef58a190844476ccbe6e0f8ef549afae11ce9fb1c` |
| 纯文本 | `00984_AEON_Stores_2026-08-12_discloseable_connected.txt`，13428 字节，SHA-256 `ba97cd8f85c7a7b90e922329d586ed0be6450dc3374f021e059bb8a41628e161` |

公告自己写明了问卷要问的三件事。

- 买方是控股股东 AEON Co 的 30% 受控公司，属关连人士。
- 这是须予披露交易。
- 依据第 14A.76(2)(b) 条，交易豁免通函及股东批准。

## 公告纯文本的处理

两份公告都没有段落编号。纯文本保留原有小标题和 (1)(2)、(i)(ii) 等条目编号。处理规则如下。

- 用 `pdftotext -layout` 读取，删去页码行（“1”“–2–”）。
- 同一段落内的换行合并为单个空格。每段一行，段与段之间空一行，方便逐字引用。
- “Date:”“Consideration:” 这类左右两栏的条款和释义，合并成 “标签 内容” 一行。
- 财务数字表每行保留，栏与栏之间用 “ | ” 分隔。
- 公司名称、股份代号、签署人等居中或靠右的行保持分行。

抽取后，我把结果和不排版的 `pdftotext` 输出逐词比对。抽取结果只少了页码，没有增加或丢失其他词。原文中的弯引号和多余空格（例如 “Directors ’ knowledge”）照原样保留。
