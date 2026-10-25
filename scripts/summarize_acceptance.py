"""Compare acceptance runs: correct, wrong but routed to a person, and silent errors (wrong and not flagged).
Usage: python3 scripts/summarize_acceptance.py <label=evidence.json> ..."""
import json
import sys

ROUTED = {"unverified", "not_returned", "model_error"}
print("| 方案 | 示例 | 判对 | 判错但标红交人工 | 静默错误 | 模型判断的条目数×次数 |")
print("|---|---|---|---|---|---|")
for arg in sys.argv[1:]:
    label, path = arg.split("=", 1)
    data = json.load(open(path))
    for case, value in data["cases"].items():
        # Only items the model judges; items ruled out by applicability are decided in code and always right.
        expected = {k: v.split("|") for k, v in value["expected"].items() if k != "uncovered_includes" and v != "not_applicable"}
        right = routed = silent = 0
        for run in value["runs"]:
            for rid, want in expected.items():
                got = run["statuses"].get(rid)
                if got in want:
                    right += 1
                elif got in ROUTED:
                    routed += 1
                else:
                    silent += 1
        total = right + routed + silent
        print(f"| {label} | {case} | {right} | {routed} | {silent} | {total} |")
