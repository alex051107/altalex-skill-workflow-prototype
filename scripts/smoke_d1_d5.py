"""Walk the assignment's D1–D5 chain against a running server, through the same API the web page uses.

Usage: python3 scripts/smoke_d1_d5.py [http://127.0.0.1:8765]

It creates and test-runs a Skill, saves two Skills, chains them into a Workflow, runs it, checks that step 2
received step 1's output, edits a Skill and reruns, and submits an empty input to check the error message.
Every check prints PASS or FAIL. In mock mode the outputs are echoes; with a real model they are model answers.
Model failure (D5) is shown separately by scripts/failure_demo.sh.
"""
import json, sys, time, urllib.request
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
MODE = "configured"
def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
def wait(run_id):
    for _ in range(600):
        s, r = call("GET", f"/api/runs/{run_id}")
        if r["status"] in ("completed", "failed", "interrupted"): return r
        time.sleep(1)
ok = lambda c, m: print(("PASS " if c else "FAIL ") + m)
t = str(int(time.time()))
a = {"name": "冒烟-摘要声明"+t, "description": "列出文案里的收益说法", "kind": "organize", "instructions": "读营销文案，列出所有和收益、保本有关的说法，每条原文照抄。",
     "input_fields": [{"name": "document", "label": "营销文案", "required": True, "role": "original"}], "output_format": "json",
     "output_requirements": "返回 JSON：{\"claims\":[{\"quote\":\"原文\",\"type\":\"收益或保本\"}]}", "sample_inputs": {"document": "年度收益最高可达 8%，让闲钱稳稳增值。"}, "expected": ["应包含：8%"]}
s, ta = call("POST", "/api/skills/test", {"skill": a, "inputs": a["sample_inputs"], "mode": MODE}); r = wait(ta["id"])
ok(s == 202 and r["status"] == "completed", f"D1 试用技能 status={r['status']} expectations={r.get('expectations')}")
s, A = call("POST", "/api/skills", a); ok(s == 201, f"D1 保存技能 A id={A.get('id')}")
b = {"name": "冒烟-回复市场同事"+t, "description": "按上一步结果写回复", "kind": "draft", "instructions": "根据上一步列出的说法，给市场同事写一段中文回复，说明每条说法要补什么证明。",
     "input_fields": [{"name": "claims", "label": "上一步的结果", "required": True, "role": "previous"}], "output_format": "text", "output_requirements": "一段中文，不超过 150 字。", "sample_inputs": {"claims": "{\"claims\":[{\"quote\":\"最高可达 8%\"}]}"}}
s, B = call("POST", "/api/skills", b); ok(s == 201, f"D1 保存技能 B id={B.get('id')}")
wf = {"name": "冒烟流程"+t, "description": "两步", "input_fields": [{"name": "document", "label": "营销文案", "required": True}],
      "steps": [{"id": "s1", "skill_id": A["id"], "input_bindings": {"document": {"source": "input", "key": "document"}}},
                {"id": "s2", "skill_id": B["id"], "input_bindings": {"claims": {"source": "step", "step_id": "s1"}}}]}
s, W = call("POST", "/api/workflows", wf); ok(s == 201, f"D2 保存流程 id={W.get('id')} error={W.get('error')}")
s, run = call("POST", "/api/runs", {"workflow_id": W["id"], "inputs": {"document": "本基金年度收益最高可达 8%，保本保息，闲钱稳稳增值。"}, "mode": MODE}); r = wait(run["id"])
st = r["steps"]
ok(r["status"] == "completed" and len(st) == 2, f"D3 运行 status={r['status']} steps={[x['status'] for x in st]} model={r.get('model')}")
ok(json.dumps(st[1]["inputs"].get("claims"), ensure_ascii=False)[:60] != "null", "D2 第 2 步收到第 1 步结果: " + str(st[1]["inputs"].get("claims"))[:80])
print("   final:", str(r.get("final_output"))[:160].replace("\n", " "))
b2 = dict(B); b2["instructions"] = b["instructions"] + "回复开头写“你好”。"
s, B2 = call("PUT", f"/api/skills/{B['id']}", b2); ok(s == 200 and B2.get("version", 0) > B.get("version", 0), f"D4 修改技能 version {B.get('version')}->{B2.get('version')}")
s, run2 = call("POST", "/api/runs", {"workflow_id": W["id"], "inputs": {"document": "本基金年度收益最高可达 8%，保本保息。"}, "mode": MODE}); r2 = wait(run2["id"])
ok(r2["status"] == "completed", f"D4 重跑 status={r2['status']}")
s, e = call("POST", "/api/runs", {"workflow_id": W["id"], "inputs": {"document": ""}, "mode": MODE})
ok(s == 400, f"D5 缺输入 http={s} message={e.get('error')}")
