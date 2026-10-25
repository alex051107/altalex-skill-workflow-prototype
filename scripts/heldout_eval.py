#!/usr/bin/env python3
"""Run the six frozen marketing cases through the shared compare Skill; never rewrite expectations.

Each expected rule status lands in one of three buckets:
  correct   - the final status equals the expectation written on 2026-10-21, before any of these runs;
  routed    - wrong, but the product sends it to a person (unverified, uncertain scope, missing item, model error);
  silent    - wrong and shown as an ordinary conclusion. This is the number that matters most.

Usage: MODEL_PROVIDER=openai MODEL_NAME=deepseek-flash ... python3 -I scripts/heldout_eval.py <out_dir> [repeats]
"""
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import App, Config, load_env  # noqa: E402

ROUTED = {"unverified", "uncertain_scope", "not_returned", "model_error"}
APPROVAL = ["允许发布", "通过审核", "已获批准", "可以发布", "即可发布", "审核通过"]


def main():
    out = Path(sys.argv[1])
    repeats = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    if not out.resolve().is_relative_to((ROOT / "audit").resolve()):
        raise SystemExit("Output must be inside audit/.")
    out.mkdir(parents=True, exist_ok=False)
    fixture_path = ROOT / "audit/heldout_cases.json"
    fixture = json.loads(fixture_path.read_text())
    if not fixture.get("frozen") or len(fixture["cases"]) != 6:
        raise SystemExit("Expected six frozen cases.")
    starter = json.loads((ROOT / "examples/starter.json").read_text())
    skill = next(s for s in starter["skills"] if s["id"] == "standard-compare")
    load_env()
    config = Config.from_env()
    app = App(out / "eval.sqlite3", config=config, root=ROOT)
    report = {"started_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": config.model, "provider": config.provider,
              "design": "6 cases frozen on 2026-10-21; expectations unchanged; shared compare Skill run item by item with cross-check and challenge.",
              "fixture_sha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
              "skill_instructions_sha256": hashlib.sha256(skill["instructions"].encode()).hexdigest(), "skill_instructions": skill["instructions"],
              "server_sha256": hashlib.sha256((ROOT / "server.py").read_bytes()).hexdigest(), "repeats": repeats, "cases": []}
    totals = {"correct": 0, "routed": 0, "silent": 0, "expected": 0}
    for case in fixture["cases"]:
        for attempt in range(repeats):
            inputs = {"document": case["inputs"]["document"], "context": case["inputs"]["context"], "standard": case["inputs"]["rules"]}
            started = time.monotonic()
            record = app.test_skill({"skill": dict(skill, expected=[]), "inputs": inputs, "mode": "configured"})
            while app.store.get("runs", record["id"])["status"] in {"queued", "running"}:
                time.sleep(0.5)
            run = app.store.get("runs", record["id"])
            output = run.get("final_output") or {}
            actual = {c.get("rule_id"): c for c in output.get("checks", []) if isinstance(c, dict)}
            rows = {}
            for rule, want in case["expected"]["rule_statuses"].items():
                got = (actual.get(rule) or {}).get("status")
                bucket = "correct" if got == want else "routed" if got in ROUTED else "silent"
                totals[bucket] += 1
                totals["expected"] += 1
                rows[rule] = {"expected": want, "actual": got, "bucket": bucket, "model_status": (actual.get(rule) or {}).get("model_status"),
                              "reason": (actual.get(rule) or {}).get("reason"), "quote": (actual.get(rule) or {}).get("quote"),
                              "location": (actual.get(rule) or {}).get("location")}
            quotes = [c.get("quote") for c in actual.values() if c.get("quote")]
            summary = str(output.get("summary", ""))
            report["cases"].append({"id": case["id"], "attempt": attempt + 1, "run_status": run["status"], "error": run.get("error"),
                                    "seconds": round(time.monotonic() - started, 1), "triage": (output.get("triage") or {}).get("level"),
                                    "rules": rows, "extra_rule_ids": sorted(set(actual) - set(case["expected"]["rule_statuses"])),
                                    "quotes_from_document": sum(q in case["inputs"]["document"] for q in quotes), "quotes_total": len(quotes),
                                    "approval_phrases": [p for p in APPROVAL if p in summary], "manual_checks_not_scored": case["expected"].get("checks", [])})
            print(case["id"], attempt + 1, run["status"], {r: v["bucket"] for r, v in rows.items()}, flush=True)
    report["totals"] = totals
    report["finished_at_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (out / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False))
    app.close()


if __name__ == "__main__":
    main()
