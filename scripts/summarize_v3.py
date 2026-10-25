#!/usr/bin/env python3
"""Summarise 2026-10-24 runs into correct / routed to a person / silent wrong, per model and material set."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTED = {"unverified", "uncertain_scope", "not_returned", "model_error"}


def examples(path):
    data = json.loads(path.read_text())
    rows = []
    for name, case in data["cases"].items():
        tally = {"correct": 0, "routed": 0, "silent": 0}
        for run in case["runs"]:
            for rule, hit in run["hits"].items():
                actual = run["statuses"].get(rule)
                tally["correct" if hit else "routed" if actual in ROUTED else "silent"] += 1
        seconds = [r["seconds"] for r in case["runs"]]
        rows.append((name, len(case["runs"]), tally, round(sum(seconds) / len(seconds), 1)))
    return data["model"], rows


def heldout(path):
    data = json.loads(path.read_text())
    seconds = [c["seconds"] for c in data["cases"]]
    return data["model"], data["totals"], round(sum(seconds) / len(seconds), 1), data.get("repeats", 1)


def main():
    lines = ["| 材料 | 模型 | 运行次数 | 判对 | 判错但交给了人看 | 判错且没有提示 | 平均秒数 |", "|---|---|---|---|---|---|---|"]
    for path in sorted((ROOT / "evidence").glob("acceptance_v3_*_2026-10-24.json")):
        model, rows = examples(path)
        tag = "（技能说明改写后）" if "rewrite" in path.name else ""
        for name, runs, t, sec in rows:
            lines.append(f"| 示例 {name}{tag} | {model} | {runs} | {t['correct']} | {t['routed']} | {t['silent']} | {sec} |")
    for path in sorted((ROOT / "audit").glob("heldout_v3_*_2026-10-24/results.json")):
        model, t, sec, repeats = heldout(path)
        arm = "泛化写法" if "generic" in str(path) else "资深审阅人写法"
        lines.append(f"| 开发期测试集 6 份，旧 5 条规则（{arm}） | {model} | {repeats} | {t['correct']} | {t['routed']} | {t['silent']} | {sec} |")
    for path in sorted((ROOT / "audit").glob("v3cases_*_2026-10-24/results.json")):
        model, t, sec, repeats = heldout(path)
        tag = "，技能说明改写后" if "rewrite" in str(path) else ""
        lines.append(f"| 盲测集 6 份，清单 12 条（完整流程{tag}） | {model} | {repeats} | {t['correct']} | {t['routed']} | {t['silent']} | {sec} |")
    for name, label in (("real_marketing_flash_2026-10-24", "真实营销材料 3 份，清单 12 条（完整流程）"),
                        ("hk_flash_2026-10-24", "港股公告 2 份加改动版 1 份，CF007M 清单 15 条（完整流程）")):
        path = ROOT / "audit" / name / "results.json"
        if path.is_file():
            model, t, sec, repeats = heldout(path)
            lines.append(f"| {label} | {model} | {repeats} | {t['correct']} | {t['routed']} | {t['silent']} | {sec} |")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
