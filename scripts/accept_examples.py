"""Real-model acceptance for the two examples: per-item hit table against expectations written before the runs.
Calls the configured REAL model (Ollama by default).
Usage: python3 scripts/accept_examples.py <mvp_dir> <out_json> [repeats]"""
import json
import sys
import time
from pathlib import Path

mvp, out = Path(sys.argv[1]), Path(sys.argv[2])
repeats = int(sys.argv[3]) if len(sys.argv) > 3 else 2
sys.path.insert(0, str(mvp))
from server import App, Config  # noqa: E402

app = App(":memory:", Config.from_env(), root=mvp)
nda_cfg = json.loads((mvp / "examples/nda_playbook.json").read_text())
mk_cfg = json.loads((mvp / "examples/starter.json").read_text())
nda = app.install_examples("nda_playbook")["workflow"]
mk = app.install_examples("starter")["workflow"]
cases = [
    ("nda_discloser", nda, nda["sample_inputs"], nda_cfg["expected"]["我方主要披露信息"]),
    ("nda_recipient", nda, dict(nda["sample_inputs"], role="我方主要接收信息"), nda_cfg["expected"]["我方主要接收信息"]),
    ("marketing", mk, mk["sample_inputs"], mk_cfg["expected"]),
]


def run(workflow, inputs):
    started = time.monotonic()
    record = app.start_run({"workflow_id": workflow["id"], "inputs": inputs, "mode": "configured"})
    while app.store.get("runs", record["id"])["status"] in {"queued", "running"}:
        time.sleep(0.5)
    return app.store.get("runs", record["id"]), round(time.monotonic() - started, 1)


report = {"model": app.config.model, "provider": app.config.provider, "repeats": repeats, "cases": {}}
for name, workflow, inputs, expected in cases:
    rows = []
    for attempt in range(repeats):
        result, seconds = run(workflow, inputs)
        output = result["final_output"] or {}
        statuses = {c.get("rule_id"): c.get("status") for c in output.get("checks", [])}
        hits = {rid: statuses.get(rid) in want.split("|") for rid, want in expected.items() if rid != "uncovered_includes"}
        uncovered = [str(u.get("clause", "")) for u in output.get("uncovered", [])]
        needed = expected.get("uncovered_includes", [])
        rows.append({"attempt": attempt + 1, "status": result["status"], "seconds": seconds, "triage": (output.get("triage") or {}).get("level"),
                     "statuses": statuses, "hits": hits, "hit_rate": f"{sum(hits.values())}/{len(hits)}",
                     "uncovered": uncovered, "uncovered_found": all(n in uncovered for n in needed),
                     "owners_from_code": all("决定" in c.get("decision", "") or c.get("status") in {"no_issue", "not_applicable", "acceptable_fallback", "needs_material", "uncertain_scope"}
                                             for c in output.get("checks", [])),
                     "checks": [{k: c.get(k) for k in ("rule_id", "status", "model_status", "quote_found", "reason", "decision", "proposed_text_source")} for c in output.get("checks", [])]})
        print(name, attempt + 1, rows[-1]["hit_rate"], rows[-1]["triage"], seconds, "s", "uncovered", uncovered, flush=True)
    per_item = {rid: sum(r["hits"][rid] for r in rows) for rid in rows[0]["hits"]}
    report["cases"][name] = {"expected": expected, "runs": rows, "per_item_hits": per_item}
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
app.close()
