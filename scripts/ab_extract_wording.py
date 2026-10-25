"""A/B: old vs new extract-task wording on the marketing example; record R11 and the step-1 claim types.
Usage: python3 -I scripts/ab_extract_wording.py . audit/pre_rewrite_starter_2026-10-24.json <out.json> <runs_per_variant>
"""
import json, sys, time, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
MVP = Path(sys.argv[1]); OLD = Path(sys.argv[2]); OUT = Path(sys.argv[3]); N = int(sys.argv[4])
sys.path.insert(0, str(MVP))
from server import App, Config, load_env
load_env(MVP / ".env")
old_ins = next(s for s in json.loads(OLD.read_text())["skills"] if s["id"] == "starter-extract")["instructions"]

def run(variant):
    with tempfile.TemporaryDirectory() as d:
        app = App(Path(d) / "x.sqlite3", config=Config.from_env(), root=MVP)
        try:
            wf = app.install_examples("starter")["workflow"]
            if variant == "old":
                cur = app.store.get("skills", "starter-extract")
                app.store.put("skills", dict(cur, instructions=old_ins))
            rec = app.start_run({"workflow_id": wf["id"], "inputs": json.loads((MVP / "examples/starter.json").read_text())["workflow"]["sample_inputs"], "mode": "configured"})
            while app.store.get("runs", rec["id"])["status"] in {"queued", "running"}:
                time.sleep(0.5)
            r = app.store.get("runs", rec["id"])
        finally:
            app.close()
    items = (r["steps"][0].get("output") or {}).get("items", [])
    checks = (r["steps"][1].get("output") or {}).get("checks", [])
    r11 = next((c for c in checks if c.get("rule_id") == "R11"), {})
    return {"variant": variant, "status": r["status"], "R11": r11.get("status"), "R11_reason": r11.get("reason"),
            "types": [(i.get("type"), i.get("quote")) for i in items], "used_ins_head": (r["steps"][0].get("output") or {}).get("task", "")[:20]}

with ThreadPoolExecutor(6) as pool:
    res = list(pool.map(run, ["old"] * N + ["new"] * N))
OUT.write_text(json.dumps(res, ensure_ascii=False, indent=2))
for x in res:
    print(x["variant"], x["status"], x["R11"], [t for t, q in x["types"] if "8" in (q or "")])
