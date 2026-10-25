#!/usr/bin/env python3
"""Render the submission Markdown documents as standalone, readable HTML pages (no build step for reviewers).

Usage: python3 scripts/build_docs.py [out_dir]
"""
import re
import sys
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

ROOT = Path(__file__).resolve().parents[1]
# The reviewer-facing documents, in the order the page switcher lists them.
DOCS = [("SUBMISSION.md", "提交说明"), ("VALIDATION.md", "验证记录"), ("OUTPUT_BY_TYPE.md", "不同材料的输出"),
        ("AI_USAGE.md", "AI 使用说明"), ("DEMO_SCRIPT.md", "演示脚本")]
# Built when present but left out of the switcher: not part of the submission package.
EXTRA_DOCS = [("DEEP_DIVE.md", "完整思路与决策")]

STYLE = """
:root{--bg:#fff;--ink:#1f1f1f;--muted:#5f5f5f;--line:#e6e6e6;--soft:#f6f6f4;--accent:#1f1f1f;--link:#0b57d0}
@media (prefers-color-scheme: dark){:root{--bg:#181816;--ink:#e8e8e6;--muted:#a8a8a4;--line:#34342f;--soft:#22221f;--accent:#e8e8e6;--link:#8ab4f8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:48px;max-width:1240px;margin:0 auto;padding:40px 32px 80px}
nav.toc{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;font-size:13px;line-height:1.7;border-right:1px solid var(--line);padding-right:20px}
nav.toc .doc-switch{display:flex;flex-direction:column;gap:2px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--line)}
nav.toc .doc-switch a{color:var(--muted)}nav.toc .doc-switch a.current{color:var(--ink);font-weight:600}
nav.toc ul{list-style:none;margin:0;padding:0}nav.toc ul ul{padding-left:12px}
nav.toc a{color:var(--muted);text-decoration:none;display:block;padding:2px 0}nav.toc a:hover{color:var(--ink)}
main{min-width:0;max-width:860px}
h1{font-size:30px;line-height:1.35;font-weight:700;margin:0 0 12px}
h2{font-size:22px;font-weight:650;margin:52px 0 14px;padding-top:12px;border-top:1px solid var(--line)}
h3{font-size:18px;font-weight:600;margin:32px 0 10px}h4{font-size:16px;margin:24px 0 8px}
p,li{color:var(--ink)}a{color:var(--link)}
blockquote{margin:16px 0;padding:10px 18px;border-left:3px solid var(--accent);background:var(--soft);color:var(--ink)}
table{border-collapse:collapse;width:100%;margin:16px 0 24px;font-size:14.5px;line-height:1.65;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:8px 12px;vertical-align:top;text-align:left}
th{background:var(--soft);font-weight:600;white-space:nowrap}
code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.88em;background:var(--soft);padding:1px 5px;border-radius:4px}
pre{background:var(--soft);padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:13.5px;line-height:1.6;white-space:pre-wrap}
pre code{background:none;padding:0}
hr{border:0;border-top:1px solid var(--line);margin:36px 0}
.flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin:18px 0 24px;font-size:14px}
.flow div{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--soft);flex:1 1 140px}
.flow b{display:block;font-size:13px;color:var(--muted);font-weight:500}
.flow i{align-self:center;font-style:normal;color:var(--muted)}
.meta{color:var(--muted);font-size:13px;margin-bottom:28px}
@media(max-width:900px){.layout{grid-template-columns:1fr;padding:20px 16px 60px;gap:16px}nav.toc{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line);padding:0 0 12px}h1{font-size:25px}}
@media print{nav.toc{display:none}.layout{display:block}}
"""

FLOW = ('<div class="flow"><div><b>提交</b>文案 · 发布形式 · 背景</div><i>→</i><div><b>第 1 步 · 整理型</b>受理与声明清单</div><i>→</i>'
        '<div><b>第 2 步 · 对照型</b>逐条对照团队依据<br><small>团队依据由合规保存、带版本</small></div><i>→</i>'
        '<div><b>第 3 步 · 起草型</b>回复与内部备注</div><i>→</i><div><b>结果页</b>分流 · 原文行号 · 决定人</div></div>')


def render(source, title, current, out_dir):
    text = (ROOT / "docs" / source).read_text(encoding="utf-8")
    text = re.sub(r"```mermaid.*?```", "\n\n[[FLOW]]\n\n", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # Python-Markdown needs a blank line before a list and four-space indents for nested items.
    text = re.sub(r"(?m)^ {2,3}(?=[-*] |\d+\. )", "    ", text)
    text = re.sub(r"(?m)^(?![ \t]*(?:[-*] |\d+\. |\||$))(.+)\n(?=[-*] |\d+\. )", r"\1\n\n", text)
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"], extension_configs={"toc": {"toc_depth": "2-3", "slugify": slugify_unicode}})
    body = md.convert(text).replace("<p>[[FLOW]]</p>", FLOW)
    # Links between the documents point at the HTML siblings; other relative links point back into the repository.
    for name, _ in DOCS:
        body = body.replace(f'href="{name}', f'href="{name[:-3]}.html')
    switch = "".join(f'<a href="{name[:-3]}.html" class="{"current" if name == current else ""}">{label}</a>' for name, label in DOCS)
    page = (f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{title}</title><style>{STYLE}</style></head><body><div class="layout"><nav class="toc"><div class="doc-switch">{switch}</div>{md.toc}</nav>'
            f'<main>{body}</main></div></body></html>')
    (out_dir / (source[:-3] + ".html")).write_text(page, encoding="utf-8")


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, label in DOCS + EXTRA_DOCS:
        if (ROOT / "docs" / name).is_file():
            render(name, label, name, out_dir)
            print("built", out_dir / (name[:-3] + ".html"))


if __name__ == "__main__":
    main()
