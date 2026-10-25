#!/usr/bin/env python3
"""Turn showcase runs into docs/OUTPUT_BY_TYPE.md: how the same three Skills answer different kinds of material.
Usage: python3 scripts/render_showcase.py <showcase.json> [<showcase.json> ...]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = {"issue": "不一致", "needs_material": "需补材料", "no_issue": "符合", "acceptable_fallback": "在可接受退让内",
          "not_applicable": "不适用", "uncertain_scope": "适用范围待确认", "unverified": "需人工检查", "not_returned": "模型未返回", "model_error": "调用失败"}
ROUTED = {"unverified", "uncertain_scope", "not_returned", "model_error"}


def ids(case, status):
    return [c["rule_id"] for c in case["checks"] if c["status"] == status]


def mismatch(case):
    wrong = []
    for c in case["checks"]:
        want = c.get("expected")
        if want and c["status"] not in want.split("|") and c["status"] not in ROUTED:
            wrong.append(f"{c['rule_id']}（预期{'或'.join(STATUS.get(w, w) for w in want.split('|'))}，实际{STATUS.get(c['status'], c['status'])}）")
    return wrong


def clip(text, n):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[:n] + "…"


SHORT = {"P1": "理财平台产品页：最高 10% 月派息", "P2": "合作博客文章：ETF 目标股息 6%", "P3": "银行销售的储蓄保险：保证回报、100% 保本",
         "P4": "理财平台首页：获奖、跑赢、最低费率"}


def title(case):
    base = case["id"].split("-")[0]
    if base in SHORT:
        return SHORT[base] + ("（加测试设定）" if case["id"].endswith("-A") else "")
    return case["title"]


def main():
    cases = []
    model = ""
    for path in sys.argv[1:]:
        data = json.loads(Path(path).read_text())
        model = data["model"]
        cases.extend(data["cases"])
    lines = ["# 不同材料，输出有什么不同", "",
             f"同样三个任务、同一份 v3 清单（12 条），换不同类型的材料，用 {model} 完整跑三步。"
             "冻结测试材料的答案由独立代理事先写好。真实公开材料来自公开网页，已去掉机构和人名。清单是虚构的公司政策，所以真实材料的结论不代表原广告违规。", "",
             "## 一眼对比", "",
             "| 材料 | 发布形式 | 第 2 步分流 | 不一致 | 需补材料 | 待确认 / 需人工 | 第 3 步建议结论 |", "|---|---|---|---|---|---|---|"]
    for c in cases:
        triage = c.get("triage") or {}
        reply = c.get("reply") if isinstance(c.get("reply"), dict) else {}
        pending = ids(c, "uncertain_scope") + ids(c, "unverified")
        lines.append(f"| {c['id']} {title(c)} | {c['channel']} | {triage.get('label', c['status'])} | {'、'.join(ids(c, 'issue')) or '无'} | "
                     f"{'、'.join(ids(c, 'needs_material')) or '无'} | {'、'.join(pending) or '无'} | {reply.get('recommended_outcome', '未生成')} |")
    lines += ["", "差别来自三处：", "",
              "1. 清单的适用条件，由代码按发布形式执行。R3（风险提示在最终画面可读）在静态图文时要最终图片，在视频时要成片，纯文字帖不适用。R5（视频内披露）只在视频时检查。发布形式没定时，这几条标为“适用范围待确认”。",
              "2. 前置条件。产品不能公开推广时，结果标红，提示先确认前置条件、暂不看措辞，第 3 步只写这一件事。前置条件只是被反向复核存疑时，标出来交给人确认，其余照常审阅。",
              "3. 背景里的事实，由模型读。是不是付费推广、发布者是不是外部博主、是否持牌、交了哪些材料，决定 R2、R9 和“需补材料”怎么判。", ""]
    for c in cases:
        triage = c.get("triage") or {}
        reply = c.get("reply") if isinstance(c.get("reply"), dict) else {}
        lines += [f"## {c['id']} {title(c)}", ""]
        if c.get("source_url"):
            lines += [f"来源：{c['source_url']}的公开页面。摘录已去掉机构和人名，措辞可能和原页面有出入。", ""]
        lines += [f"发布形式：{c['channel']} · 用时 {c['seconds']} 秒（三步分别 {' / '.join(str(s) for s in c['step_seconds'])} 秒）", ""]
        intake = c.get("intake") or {}
        if intake:
            lines += [f"**第 1 步登记**：推广关系“{clip(intake.get('promotion_relationship'), 40)}”；发布者“{clip(intake.get('publisher_identity'), 40)}”；"
                      f"缺少的材料：{'、'.join(intake.get('materials_missing') or []) or '无'}。从文案里列出需要证据的声明 {len(c.get('claims') or [])} 条。", ""]
        lines += [f"**第 2 步**：{triage.get('label', '')}。{clip(c.get('summary'), 120)}", ""]
        rows = [x for x in c["checks"] if x["status"] in {"issue", "needs_material", "uncertain_scope", "unverified"}]
        if rows:
            lines += ["| 条目 | 结论 | 原文 | 要补什么 |", "|---|---|---|---|"]
            for x in rows:
                lines.append(f"| {x['rule_id']} {x['title']} | {STATUS.get(x['status'], x['status'])} | {clip(x.get('quote'), 40) or '（原文没有相关内容）'} | {clip(x.get('needed_material'), 50) or ''} |")
            lines.append("")
        wrong = mismatch(c)
        if wrong:
            lines += [f"判错且没拦住：{'；'.join(wrong)}", ""]
        if reply:
            lines += [f"**第 3 步**：建议结论“{reply.get('recommended_outcome', '')}”，需要负责人决定：{'、'.join(reply.get('needs_owner_decision') or []) or '无'}。", "",
                      "给市场同事的回复（节选）：", "", "> " + clip(reply.get("reply_to_marketing"), 260), ""]
        elif c.get("error"):
            lines += [f"运行没有完成：{c['error']}", ""]
    notes = ROOT / "docs/OUTPUT_BY_TYPE_NOTES.md"
    if notes.is_file():
        head_end = lines.index("## 一眼对比")
        lines[head_end:head_end] = notes.read_text(encoding="utf-8").rstrip().splitlines() + [""]
    (ROOT / "docs/OUTPUT_BY_TYPE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote docs/OUTPUT_BY_TYPE.md with", len(cases), "cases")


if __name__ == "__main__":
    main()
