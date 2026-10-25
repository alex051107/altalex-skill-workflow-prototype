#!/usr/bin/env python3
"""Run the full three-step marketing workflow on materials of different types and keep every step's output.

Materials: the example post, the six typed cases in audit/heldout_v3_cases.json, and optional real public
de-identified materials (examples/real_public_materials_2026-10-24.json). Each case runs in its own App so
cases run in parallel. Usage: python3 -I scripts/showcase_by_type.py <out.json> [workers] [id-prefixes]
"""
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import App, Config, load_env  # noqa: E402


def cases():
    starter = json.loads((ROOT / "examples/starter.json").read_text())
    found = [{"id": "E0-example", "title": "示例帖子：付费博主、静态图文、8% 收益", "kind": "示例", "inputs": starter["workflow"]["sample_inputs"],
              "expected": starter.get("expected")}]
    for case in json.loads((ROOT / "audit/heldout_v3_cases.json").read_text())["cases"]:
        found.append({"id": case["id"], "title": case["title"], "kind": "冻结测试", "inputs": case["inputs"], "expected": case["expected"]})
    real = ROOT / os.environ.get("SHOWCASE_REAL", "examples/real_public_materials_2026-10-24.json")
    if real.is_file():
        for item in json.loads(real.read_text())["materials"]:
            found.append({"id": item["id"], "title": item.get("what_it_tests", ""), "kind": "真实公开材料（去标识）", "source_url": item.get("source"),
                          "inputs": {"document": item["document"], "channel": item["channel"], "context": item["context"]}, "expected": None})
    return found


def run_case(case, config):
    with tempfile.TemporaryDirectory() as folder:
        app = App(Path(folder) / "case.sqlite3", config=config, root=ROOT)
        try:
            workflow = app.install_examples("starter")["workflow"]
            reply = json.loads((ROOT / "examples/review_reply_skill.json").read_text())
            reply_skill = app.save_skill({k: v for k, v in reply.items() if k not in {"id", "note"}})
            definition = {k: workflow[k] for k in ("name", "description", "input_fields", "steps")}
            definition["name"] = "营销材料预审（含回复）"
            definition["steps"] = workflow["steps"] + [{"id": "reply", "skill_id": reply_skill["id"], "input_bindings": {
                "review": {"source": "step", "step_id": "review"}, "channel": {"source": "input", "key": "channel"}}}]
            flow = app.save_workflow(definition)
            started = time.monotonic()
            record = app.start_run({"workflow_id": flow["id"], "inputs": case["inputs"], "mode": "configured"})
            while app.store.get("runs", record["id"])["status"] in {"queued", "running"}:
                time.sleep(0.5)
            run = app.store.get("runs", record["id"])
        finally:
            app.close()
    steps = run["steps"]
    extract = steps[0].get("output") or {}
    review = steps[1].get("output") or {}
    reply = steps[2].get("output") if len(steps) > 2 else None
    checks = review.get("checks", []) if isinstance(review, dict) else []
    expected = case.get("expected") or {}
    return {
        "id": case["id"], "title": case["title"], "kind": case["kind"], "source_url": case.get("source_url"),
        "channel": case["inputs"].get("channel"), "status": run["status"], "error": run.get("error"),
        "seconds": round(time.monotonic() - started, 1), "step_seconds": [round((s.get("duration_ms") or 0) / 1000, 1) for s in steps],
        "intake": extract.get("intake") if isinstance(extract, dict) else None,
        "claims": [{k: i.get(k) for k in ("type", "quote", "evidence_status")} for i in (extract.get("items") or [])] if isinstance(extract, dict) else [],
        "triage": review.get("triage") if isinstance(review, dict) else None, "gate_failed": review.get("gate_failed") if isinstance(review, dict) else None,
        "summary": review.get("summary") if isinstance(review, dict) else None,
        "checks": [{"rule_id": c.get("rule_id"), "title": c.get("title"), "status": c.get("status"), "quote": c.get("quote"),
                    "location": c.get("location"), "needed_material": c.get("needed_material"), "proposed_text_source": c.get("proposed_text_source"),
                    "expected": expected.get(c.get("rule_id")) if isinstance(expected, dict) else None} for c in checks],
        "uncovered": [u.get("quote") for u in (review.get("uncovered") or [])] if isinstance(review, dict) else [],
        "reply": reply,
    }


def main():
    out = Path(sys.argv[1])
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    load_env()
    config = Config.from_env()
    todo = cases()
    if len(sys.argv) > 3:  # optional comma-separated id prefixes, e.g. "P" for the real materials only
        prefixes = tuple(sys.argv[3].split(","))
        todo = [c for c in todo if c["id"].startswith(prefixes)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda c: run_case(c, config), todo))
    for r in results:
        print(r["id"], r["status"], (r["triage"] or {}).get("level"), (r["reply"] or {}).get("recommended_outcome") if isinstance(r["reply"], dict) else "-", r["seconds"], flush=True)
    out.write_text(json.dumps({"model": config.model, "provider": config.provider, "cases": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
