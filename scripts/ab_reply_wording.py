"""A/B the reply task wording on its own sample (the live-demo test): checkpoint hits per run.
Usage: python3 -I scripts/ab_reply_wording.py . evidence/ab_reply_wording_variants_2026-10-24.json <runs_per_variant>
"""
import json, sys, time, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
MVP = Path(sys.argv[1]); N = int(sys.argv[3]); variants = json.loads(Path(sys.argv[2]).read_text())  # {"name": instructions}
sys.path.insert(0, str(MVP))
from server import App, Config, load_env
load_env(MVP / ".env")
base = json.loads((MVP / "examples/review_reply_skill.json").read_text())

def run(name):
    skill = {k: v for k, v in base.items() if k not in {"id", "note"}}
    skill["instructions"] = variants[name]
    with tempfile.TemporaryDirectory() as d:
        app = App(Path(d) / "x.sqlite3", config=Config.from_env(), root=MVP)
        try:
            rec = app.test_skill({"skill": skill, "inputs": base["sample_inputs"], "mode": "configured"})
            while app.store.get("runs", rec["id"])["status"] in {"queued", "running"}:
                time.sleep(0.5)
            r = app.store.get("runs", rec["id"])
        finally:
            app.close()
    exp = r.get("expectations") or []
    missed = [e.get("text") or e.get("expectation") or json.dumps(e, ensure_ascii=False) for e in exp if not e.get("hit", e.get("passed"))]
    return name, r["status"], sum(1 for e in exp if e.get("hit", e.get("passed"))), len(exp), missed

with ThreadPoolExecutor(8) as pool:
    for res in pool.map(run, [n for n in variants for _ in range(N)]):
        print(*res, flush=True)
