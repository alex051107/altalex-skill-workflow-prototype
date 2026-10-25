#!/usr/bin/env python3
"""Run the independently written v3 marketing cases through the full marketing workflow; never rewrite expectations.

Buckets per expected item: correct / routed (sent to a person) / silent (wrong and shown as an ordinary conclusion).
Usage: MODEL_PROVIDER=openai MODEL_NAME=deepseek-flash ... python3 -I scripts/heldout_v3_eval.py <out_dir_in_audit> [repeats]
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


def main():
    out = Path(sys.argv[1])
    repeats = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    if not out.resolve().is_relative_to((ROOT / "audit").resolve()):
        raise SystemExit("Output must be inside audit/.")
    out.mkdir(parents=True, exist_ok=False)
    fixture_path = ROOT / "audit/heldout_v3_cases.json"
    fixture = json.loads(fixture_path.read_text())
    if not fixture.get("frozen"):
        raise SystemExit("Fixture must be frozen.")
    load_env()
    config = Config.from_env()
    app = App(out / "eval.sqlite3", config=config, root=ROOT)
    workflow = app.install_examples("starter")["workflow"]
    report = {"started_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": config.model, "provider": config.provider,
              "fixture_sha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
              "starter_sha256": hashlib.sha256((ROOT / "examples/starter.json").read_bytes()).hexdigest(),
              "server_sha256": hashlib.sha256((ROOT / "server.py").read_bytes()).hexdigest(), "repeats": repeats, "cases": []}
    totals = {"correct": 0, "routed": 0, "silent": 0, "expected": 0}
    for case in fixture["cases"]:
        for attempt in range(repeats):
            started = time.monotonic()
            record = app.start_run({"workflow_id": workflow["id"], "inputs": case["inputs"], "mode": "configured"})
            while app.store.get("runs", record["id"])["status"] in {"queued", "running"}:
                time.sleep(0.5)
            run = app.store.get("runs", record["id"])
            output = run.get("final_output") or {}
            actual = {c.get("rule_id"): c for c in output.get("checks", []) if isinstance(c, dict)}
            rows = {}
            for rule, want in case["expected"].items():
                got = (actual.get(rule) or {}).get("status")
                bucket = "correct" if got in want.split("|") else "routed" if got in ROUTED else "silent"
                totals[bucket] += 1
                totals["expected"] += 1
                rows[rule] = {"expected": want, "actual": got, "bucket": bucket, "model_status": (actual.get(rule) or {}).get("model_status"),
                              "reason": (actual.get(rule) or {}).get("reason"), "quote": (actual.get(rule) or {}).get("quote")}
            extraction = run["steps"][0].get("output") if run.get("steps") else None
            items = extraction.get("items", []) if isinstance(extraction, dict) else []
            report["cases"].append({"id": case["id"], "attempt": attempt + 1, "run_status": run["status"], "error": run.get("error"),
                                    "seconds": round(time.monotonic() - started, 1), "triage": output.get("triage"), "gate_failed": output.get("gate_failed"),
                                    "rules": rows, "extraction_quotes_exact": all(i.get("quote", "") in case["inputs"]["document"] for i in items if isinstance(i, dict)),
                                    "extraction_items": len(items)})
            print(case["id"], attempt + 1, run["status"], (output.get("triage") or {}).get("level"), {r: v["bucket"] for r, v in rows.items() if v["bucket"] != "correct"}, flush=True)
    report["totals"] = totals
    report["finished_at_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (out / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False))
    app.close()


if __name__ == "__main__":
    main()
