import copy
import json
import queue
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import re

from server import (App, Config, LocalServer, Problem, ROOT, apply_playbook, check_expectations, locate, parse_standard_text,
                    playbook_binding, resolve_playbook, skill_draft)


class FakeModelHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.server.calls.append({'path': self.path, 'payload': payload,
                                  'authorization': self.headers.get('Authorization')})
        try:
            behavior = self.server.behaviors.get_nowait()
        except queue.Empty:
            behavior = 'normal'
        status = 503 if behavior == 'http_error' else 200
        if behavior == 'http_error':
            body = b'{"error":"SENTINEL_PRIVATE_UPSTREAM_DETAIL"}'
        elif behavior == 'bad_envelope':
            body = b'<html>not JSON</html>'
        else:
            user = payload['messages'][-1]['content'].split('\n\nINPUT LABELS', 1)[0].split('\n', 1)[1]
            received = json.loads(user)
            instruction = payload['messages'][0]['content'].split('TASK INSTRUCTIONS:\n', 1)[1].split('\n\nOUTPUT REQUIREMENTS:', 1)[0]
            output = {'received': received, 'task': instruction, 'call_number': len(self.server.calls)}
            content = 'not valid JSON at all' if behavior == 'bad_json' else json.dumps(output)
            if self.path == '/v1/chat/completions':
                envelope = {'choices': [{'message': {'content': content}, 'finish_reason': 'stop'}]}
            else:
                envelope = {'message': {'content': content}, 'done': True, 'done_reason': 'stop'}
            body = json.dumps(envelope).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def draft_skill(name='Any arbitrary user task', instructions='Perform an arbitrary configured task.', field='material'):
    return {'name': name, 'description': 'Test draft', 'instructions': instructions,
            'input_fields': [{'name': field, 'label': field, 'required': True}],
            'output_format': 'json', 'output_requirements': 'Return JSON representing the requested task.',
            'sample_inputs': {field: 'sample'}}


class Fixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / 'test.sqlite3'
        self.fake = ThreadingHTTPServer(('127.0.0.1', 0), FakeModelHandler)
        self.fake.calls = []
        self.fake.behaviors = queue.Queue()
        self.fake_thread = threading.Thread(target=self.fake.serve_forever, daemon=True)
        self.fake_thread.start()
        self.config = Config(model='fake-model-not-a-real-LLM', ollama_url=f'http://127.0.0.1:{self.fake.server_port}', timeout=2)
        self.app = App(self.database, self.config)

    def tearDown(self):
        self.app.close()
        self.fake.shutdown()
        self.fake.server_close()
        self.fake_thread.join(timeout=2)
        self.temp.cleanup()

    def workflow(self, count=2):
        skills = [self.app.save_skill(draft_skill(f'User defined {i}', f'Task number {i}')) for i in range(count)]
        steps = []
        for i, skill in enumerate(skills):
            binding = {'source': 'input', 'key': 'document'} if i == 0 else {'source': 'step', 'step_id': f's{i-1}'}
            steps.append({'id': f's{i}', 'skill_id': skill['id'], 'input_bindings': {'material': binding}})
        workflow = self.app.save_workflow({'name': 'User assembled', 'description': '',
                                          'input_fields': [{'name': 'document', 'label': 'Document', 'required': True}],
                                          'steps': steps})
        return skills, workflow

    def wait(self, run):
        until = time.monotonic() + 5
        while time.monotonic() < until:
            value = self.app.store.get('runs', run['id'])
            if value['status'] not in {'queued', 'running'}:
                return value
            time.sleep(0.01)
        self.fail('Background run did not reach a terminal state')


class AppTests(Fixture, unittest.TestCase):
    def test_new_third_skill_uses_generic_prompt_and_real_bindings(self):
        skills, workflow = self.workflow(3)
        run = self.wait(self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'independent input'}, 'mode': 'configured'}))
        self.assertEqual(run['status'], 'completed')
        self.assertEqual(run['mode'], 'ollama')
        self.assertEqual(len(self.fake.calls), 3)
        self.assertEqual(run['steps'][1]['inputs']['material'], run['steps'][0]['output'])
        self.assertEqual(run['steps'][2]['inputs']['material'], run['steps'][1]['output'])
        self.assertEqual(run['steps'][2]['output']['task'], skills[2]['instructions'])
        self.assertEqual(run['final_output'], run['steps'][2]['output'])
        self.assertEqual(self.fake.calls[0]['payload']['options']['num_ctx'], 16384)

    def test_modification_changes_new_run_and_keeps_old_snapshot(self):
        skills, workflow = self.workflow()
        old = self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'same material'}})
        changed = dict(skills[0], instructions='Different instructions saved by the user')
        updated = self.app.save_skill(changed, skills[0]['id'])
        revised_workflow = self.app.save_workflow(dict(workflow, name='Changed workflow title'), workflow['id'])
        old = self.wait(old)
        new = self.wait(self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'same material'}}))
        self.assertEqual(updated['version'], 2)
        self.assertEqual(revised_workflow['version'], 2)
        self.assertEqual(old['snapshot']['workflow']['name'], 'User assembled')
        self.assertEqual(old['snapshot']['workflow']['version'], 1)
        self.assertEqual(old['steps'][0]['skill_snapshot']['version'], 1)
        self.assertEqual(old['steps'][0]['output']['task'], 'Task number 0')
        self.assertEqual(new['steps'][0]['output']['task'], changed['instructions'])
        self.assertEqual(new['steps'][0]['skill_snapshot']['version'], 2)

    def test_persistence_and_restart_interruption(self):
        skills, workflow = self.workflow()
        completed = self.wait(self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'persist me'}}))
        unfinished = copy.deepcopy(completed)
        unfinished.update(id='unfinished', status='running', finished_at=None)
        unfinished['steps'][0]['status'] = 'running'
        unfinished['steps'][1]['status'] = 'pending'
        self.app.store.put('runs', unfinished)
        self.app.close()
        self.app = App(self.database, self.config)
        self.assertEqual(self.app.store.get('skills', skills[0]['id']), skills[0])
        self.assertEqual(self.app.store.get('workflows', workflow['id']), workflow)
        self.assertEqual(self.app.store.get('runs', completed['id']), completed)
        interrupted = self.app.store.get('runs', 'unfinished')
        self.assertEqual(interrupted['status'], 'interrupted')
        self.assertEqual([step['status'] for step in interrupted['steps']], ['failed', 'skipped'])
        self.assertIn('重启', interrupted['error'])

    def test_missing_input_rejected_before_any_model_call(self):
        _, workflow = self.workflow()
        for inputs in ({}, {'document': ''}, {'document': '   '}, {'document': None}):
            with self.subTest(inputs=inputs), self.assertRaises(Problem) as error:
                self.app.start_run({'workflow_id': workflow['id'], 'inputs': inputs})
            self.assertEqual(error.exception.status, 400)
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(self.app.store.all('runs'), [])

    def test_required_skill_input_bound_to_optional_workflow_input_is_checked(self):
        _, workflow = self.workflow()
        draft = dict(workflow, input_fields=[{'name': 'document', 'label': 'Optional at workflow level', 'required': False}])
        workflow = self.app.save_workflow(draft, workflow['id'])
        with self.assertRaisesRegex(Problem, 'material'):
            self.app.start_run({'workflow_id': workflow['id'], 'inputs': {}})
        self.assertEqual(self.fake.calls, [])

    def test_forward_reference_and_missing_binding_are_rejected(self):
        _, workflow = self.workflow()
        bad = copy.deepcopy(workflow)
        bad['steps'][0]['input_bindings']['material'] = {'source': 'step', 'step_id': 's1'}
        with self.assertRaisesRegex(Problem, '绑定无效'):
            self.app.save_workflow(bad)
        bad['steps'][0]['input_bindings'] = {}
        with self.assertRaisesRegex(Problem, '未绑定'):
            self.app.save_workflow(bad)

    def test_model_http_failure_is_visible_and_does_not_leak_upstream_body(self):
        _, workflow = self.workflow()
        self.fake.behaviors.put('http_error')
        run = self.wait(self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'material'}}))
        self.assertEqual(run['status'], 'failed')
        self.assertEqual([s['status'] for s in run['steps']], ['failed', 'skipped'])
        self.assertIn('HTTP 503', run['error'])
        self.assertNotIn('SENTINEL_PRIVATE_UPSTREAM_DETAIL', json.dumps(run))
        self.assertEqual(len(self.fake.calls), 1)

    def test_non_json_skill_output_keeps_raw_output_and_skips_remaining(self):
        _, workflow = self.workflow()
        self.fake.behaviors.put('bad_json')
        run = self.wait(self.app.start_run({'workflow_id': workflow['id'], 'inputs': {'document': 'material'}}))
        self.assertEqual(run['status'], 'failed')
        self.assertIn('JSON', run['steps'][0]['error'])
        self.assertEqual(run['steps'][0]['output_text'], 'not valid JSON at all')
        self.assertEqual(run['steps'][1]['status'], 'skipped')

    def test_non_json_provider_envelope_reports_compatible_format_error(self):
        self.fake.behaviors.put('bad_envelope')
        run = self.wait(self.app.test_skill({'skill': draft_skill(), 'inputs': {'material': 'test'}}))
        self.assertEqual(run['status'], 'failed')
        self.assertIn('JSON/消息格式', run['error'])

    def test_unsaved_draft_can_be_tested_and_mock_is_explicit(self):
        run = self.wait(self.app.test_skill({'skill': draft_skill(), 'inputs': {'material': 'test'}, 'mode': 'mock'}))
        self.assertEqual(run['status'], 'completed')
        self.assertEqual(run['mode'], 'mock')
        self.assertEqual(run['model'], 'explicit-mock')
        self.assertTrue(run['final_output']['mock'])
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(self.app.store.all('skills'), [])

    def test_text_output_mode_does_not_require_json(self):
        self.fake.behaviors.put('bad_json')
        draft = dict(draft_skill(), output_format='text')
        run = self.wait(self.app.test_skill({'skill': draft, 'inputs': {'material': 'test'}}))
        self.assertEqual(run['status'], 'completed')
        self.assertEqual(run['final_output'], 'not valid JSON at all')

    def test_openai_compatible_adapter_uses_server_side_key_and_same_prompt(self):
        self.app.close()
        key = 'FAKE-SECRET-NOT-A-REAL-KEY'
        config = Config(provider='openai', model='fake-compatible', api_key=key,
                        openai_url=f'http://127.0.0.1:{self.fake.server_port}/v1', timeout=2)
        self.app = App(self.database, config)
        run = self.wait(self.app.test_skill({'skill': draft_skill(), 'inputs': {'material': 'test'}}))
        self.assertEqual(run['status'], 'completed')
        self.assertEqual(run['mode'], 'openai')
        self.assertEqual(self.fake.calls[-1]['path'], '/v1/chat/completions')
        self.assertEqual(self.fake.calls[-1]['authorization'], 'Bearer ' + key)
        self.assertNotIn(key, json.dumps(run))
        self.assertNotIn(key, json.dumps(self.app.status()))

    def test_examples_install_is_idempotent_and_preserves_user_changes(self):
        initial = self.app.install_examples()
        skill = initial['skills'][0]
        changed = self.app.save_skill(dict(skill, description='user edited'), skill['id'])
        result = self.app.install_examples()
        self.assertEqual(result['skills'][0]['description'], 'user edited')
        self.assertEqual(result['skills'][0]['version'], changed['version'])
        self.assertEqual(len(self.app.store.all('skills')), len(initial['skills']))
        self.assertEqual(len(self.app.store.all('workflows')), 1)


class HTTPTests(Fixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.http = LocalServer(('127.0.0.1', 0), self.app)
        self.http_thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.http_thread.start()
        self.base = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.http_thread.join(timeout=2)
        super().tearDown()

    def request(self, path, method='GET', data=None, headers=None):
        combined = {'Content-Type': 'application/json'}
        combined.update(headers or {})
        request = Request(self.base + path, method=method, headers=combined,
                          data=None if data is None else json.dumps(data).encode())
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            return response.status, response.headers, json.loads(body)

    def test_business_labels_and_decision_boundary_reach_the_model(self):
        skill = dict(draft_skill(field='standard'), input_fields=[{'name': 'standard', 'label': '我方 NDA 底线', 'required': True}])
        run = self.app.test_skill({'skill': skill, 'inputs': {'standard': 'B1 期限。'}, 'mode': 'configured'})
        self.wait(run)
        call = self.fake.calls[-1]['payload']['messages']
        self.assertIn('"standard": "我方 NDA 底线"', call[1]['content'])
        self.assertIn('Never make the final business or legal decision', call[0]['content'])

    def test_workflow_sample_inputs_persist_and_reject_unknown_fields(self):
        _, definition = self.workflow()
        saved = self.app.save_workflow(dict(definition, sample_inputs={'document': '示例'}), definition['id'])
        self.assertEqual(saved['sample_inputs'], {'document': '示例'})
        with self.assertRaises(Problem):
            self.app.save_workflow(dict(definition, sample_inputs={'unknown': 'x'}))

    def test_second_example_installs_with_fixed_standard_and_samples(self):
        result = self.app.install_examples('nda_playbook')
        workflow = result['workflow']
        self.assertEqual(workflow['id'], 'starter-nda-playbook')
        self.assertEqual(workflow['steps'][1]['input_bindings']['standard']['source'], 'playbook')
        self.assertEqual(set(workflow['sample_inputs']), {'document', 'role', 'context'})
        with self.assertRaises(Problem):
            self.app.install_examples('../starter')

    def test_playbook_items_apply_by_role_in_code(self):
        fields = [{"name": "role", "label": "我方角色", "required": True, "options": ["披露", "接收", "尚未确认"]}]
        binding = playbook_binding({"title": "NDA 底线", "items": [
            {"id": "B1D", "title": "期限（披露）", "preferred": "3 年", "applies_when": {"input": "role", "values": ["披露"]}},
            {"id": "B1R", "title": "期限（接收）", "preferred": "2 年", "applies_when": {"input": "role", "values": ["接收"]}},
            {"id": "B5", "title": "适用法律", "preferred": "新加坡法律", "fallback": "香港法律", "approved_text": "Singapore law."}]}, fields)
        text, book = resolve_playbook(binding, {"role": "接收"}, fields, 2)
        self.assertEqual([i["id"] for i in book["applicable"]], ["B1R", "B5"])
        self.assertIn("第 2 版", text)
        self.assertNotIn("B1D", text)
        _, unknown = resolve_playbook(binding, {"role": "尚未确认"}, fields, 1)
        self.assertEqual({i["id"]: i["status"] for i in unknown["excluded"]}, {"B1D": "uncertain_scope", "B1R": "uncertain_scope"})
        with self.assertRaises(Problem):
            playbook_binding({"title": "x", "items": [{"id": "B1", "title": "t", "preferred": "p", "applies_when": {"input": "role", "values": ["其他"]}}]}, fields)

    def test_playbook_post_check_fills_gaps_and_triages(self):
        fields = [{"name": "role", "label": "我方角色", "required": True, "options": ["披露", "接收"]}]
        binding = playbook_binding({"title": "NDA 底线", "items": [
            {"id": "B1", "title": "期限", "preferred": "3 年", "severity": "高"},
            {"id": "B5", "title": "适用法律", "preferred": "新加坡法律", "approved_text": "Singapore law.", "escalate_to": "经办人"},
            {"id": "B9", "title": "仅接收", "preferred": "x", "applies_when": {"input": "role", "values": ["接收"]}}]}, fields)
        _, book = resolve_playbook(binding, {"role": "披露"}, fields, 1)
        output = apply_playbook({"checks": [{"rule_id": "B5", "status": "issue", "decision_owner": "模型自填"},
                                            {"rule_id": "X1", "status": "issue"}], "uncovered": []}, book)
        by_id = {c["rule_id"]: c for c in output["checks"]}
        self.assertEqual(by_id["B1"]["status"], "not_returned")
        self.assertEqual(by_id["B5"]["proposed_text"], "Singapore law.")
        self.assertEqual(by_id["B5"]["proposed_text_source"], "团队批准文本（首选立场）")
        self.assertNotIn("decision_owner", by_id["B5"])
        self.assertIn("用团队批准文本回复对方", by_id["B5"]["decision"])
        self.assertEqual(by_id["B9"]["status"], "not_applicable")
        self.assertTrue(by_id["X1"]["unknown_rule"])
        self.assertEqual(output["triage"]["level"], "red")

    def test_fallback_judgment_without_a_fallback_is_corrected_in_code(self):
        binding = playbook_binding({"title": "底线", "items": [{"id": "B7", "title": "返还", "preferred": "备份继续保密"}]}, [])
        text, book = resolve_playbook(binding, {}, [], 1)
        self.assertNotIn("批准条款文本", text)
        check = apply_playbook({"checks": [{"rule_id": "B7", "status": "acceptable_fallback", "quote": "copies"}]}, book, ["copies retained"])["checks"][0]
        self.assertEqual((check["status"], check["model_status"]), ("issue", "acceptable_fallback"))

    def test_unverifiable_quote_cannot_support_a_favourable_judgment(self):
        binding = playbook_binding({"title": "底线", "items": [{"id": "B3", "title": "强制披露", "preferred": "通知并只披露必要部分", "fallback": "只披露必要部分"}]}, [])
        _, book = resolve_playbook(binding, {}, [], 1)
        output = apply_playbook({"checks": [{"rule_id": "B3", "status": "acceptable_fallback", "quote": "text the model invented"}]},
                                book, ["The real NDA text."])
        check = output["checks"][0]
        self.assertEqual((check["status"], check["model_status"], check["quote_found"]), ("unverified", "acceptable_fallback", False))
        self.assertEqual(output["triage"]["level"], "red")

    def test_playbook_step_calls_model_once_per_item_plus_uncovered(self):
        skill = self.app.save_skill(dict(draft_skill(field="standard"), input_fields=[
            {"name": "document", "label": "合同", "required": True}, {"name": "standard", "label": "底线", "required": True}]))
        workflow = self.app.save_workflow({"name": "逐条", "description": "", "input_fields": [
            {"name": "document", "label": "合同", "required": True},
            {"name": "role", "label": "我方角色", "required": True, "options": ["披露", "接收"]}],
            "steps": [{"id": "a", "skill_id": skill["id"], "input_bindings": {"document": {"source": "input", "key": "document"},
                       "standard": {"source": "literal", "value": "x"}}},
                      {"id": "b", "skill_id": skill["id"], "input_bindings": {"document": {"source": "input", "key": "document"},
                       "standard": {"source": "playbook", "title": "底线", "items": [
                           {"id": "B1", "title": "期限", "preferred": "3 年"}, {"id": "B2", "title": "例外", "preferred": "四项"},
                           {"id": "B3", "title": "仅接收", "preferred": "x", "applies_when": {"input": "role", "values": ["接收"]}}]}}}]})
        with self.assertRaises(Problem):
            self.app.start_run({"workflow_id": workflow["id"], "inputs": {"document": "NDA", "role": "其他"}, "mode": "configured"})
        run = self.wait(self.app.start_run({"workflow_id": workflow["id"], "inputs": {"document": "NDA", "role": "披露"}, "mode": "configured"}))
        self.assertEqual(run["status"], "completed")
        self.assertEqual(len(self.fake.calls), 1 + 2 + 1)
        standards = [call["payload"]["messages"][0]["content"] for call in self.fake.calls[1:3]]
        self.assertEqual(sorted(("B1 期限" in text) + 2 * ("B2 例外" in text) for text in standards), [1, 2])
        self.assertEqual(run["steps"][1]["progress"], {"done": 3, "total": 3})
        statuses = {c["rule_id"]: c["status"] for c in run["final_output"]["checks"]}
        # The fake model echoes inputs instead of a per-item answer, so the item has no usable status.
        self.assertEqual(statuses, {"B1": "unverified", "B2": "unverified", "B3": "not_applicable"})
        self.assertIn("fallback_met", self.fake.calls[1]["payload"]["messages"][0]["content"])

    def test_workflow_history_records_change_note_and_approver(self):
        _, workflow = self.workflow()
        updated = self.app.save_workflow(dict(workflow, change_note="接受英格兰法院", approved_by="法务负责人"), workflow["id"])
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["history"][-1], {**updated["history"][-1], "version": 2, "change_note": "接受英格兰法院", "approved_by": "法务负责人"})
        self.assertEqual(updated["history"][0]["change_note"], "创建流程")

    def test_human_review_is_logged_without_editing_model_output(self):
        skill = self.app.save_skill(draft_skill())
        run = self.wait(self.app.test_skill({"skill": draft_skill(), "inputs": {"material": "x"}, "mode": "mock"}))
        run["final_output"] = {"checks": [{"rule_id": "B1", "status": "issue"}]}
        run["steps"][-1]["output"] = run["final_output"]
        self.app.store.put("runs", run)
        updated = self.app.record_review(run["id"], {"rule_id": "B1", "decision": "no_issue", "note": "对方已在邮件中确认", "by": "王律师"})
        self.assertEqual(updated["human_review"]["B1"]["label"], "改判为符合依据")
        self.assertEqual(updated["final_output"]["checks"][0]["status"], "issue")
        with self.assertRaises(Problem):
            self.app.record_review(run["id"], {"rule_id": "B1", "decision": "sign"})
        with self.assertRaises(Problem):
            self.app.record_review(run["id"], {"rule_id": "B9", "decision": "accepted"})

    def test_quotes_only_count_when_found_in_submitted_material(self):
        binding = playbook_binding({"title": "底线", "items": [{"id": "B7", "title": "返还", "preferred": "x", "fallback": "y"}]}, [])
        _, book = resolve_playbook(binding, {}, [], 1)
        output = apply_playbook({"checks": [{"rule_id": "B7", "status": "no_issue", "quote": "Reciguous shall return"}]}, book,
                                ["the Recipient shall return"])
        self.assertEqual(output["checks"][0]["status"], "unverified")
        failed = apply_playbook({"checks": [{"rule_id": "B7", "status": "no_issue", "quote": ""}]}, book, ["x"], uncovered_failed=True)
        self.assertNotEqual(failed["triage"]["level"], "green")

    def test_off_list_status_empty_quote_and_nothing_applied_never_turn_green(self):
        fields = [{"name": "role", "label": "我方角色", "required": True, "options": ["披露", "接收"]}]
        binding = playbook_binding({"title": "底线", "items": [
            {"id": "B1", "title": "期限", "preferred": "3 年", "fallback": "2 年"},
            {"id": "B2", "title": "仅接收", "preferred": "x", "applies_when": {"input": "role", "values": ["接收"]}}]}, fields)
        _, book = resolve_playbook(binding, {"role": "披露"}, fields, 1)
        off = apply_playbook({"checks": [{"rule_id": "B1", "status": "violation"}]}, book, ["NDA text"])
        self.assertEqual((off["checks"][0]["status"], off["triage"]["level"]), ("unverified", "red"))
        empty = apply_playbook({"checks": [{"rule_id": "B1", "status": "no_issue", "quote": ""}]}, book, ["NDA text"])
        self.assertEqual(empty["triage"]["level"], "yellow")
        short = apply_playbook({"checks": [{"rule_id": "B1", "status": "no_issue", "quote": "NDA"}]}, book, ["NDA text"])
        self.assertEqual(short["checks"][0]["status"], "unverified")
        _, none = resolve_playbook(binding, {"role": "接收"}, fields, 1)
        none_binding = playbook_binding({"title": "底线", "items": [binding["items"][1]]}, fields)
        _, nothing = resolve_playbook(none_binding, {"role": "披露"}, fields, 1)
        self.assertNotEqual(apply_playbook({"checks": []}, nothing, ["x"])["triage"]["level"], "green")

    def test_playbook_works_for_any_task_but_only_one_per_step(self):
        text_skill = self.app.save_skill(dict(draft_skill(field="standard"), output_format="text"))
        base = {"name": "x", "description": "", "input_fields": [{"name": "document", "label": "合同", "required": True}]}
        pb = {"source": "playbook", "title": "底线", "items": [{"id": "B1", "title": "t", "preferred": "p"}]}
        saved = self.app.save_workflow(dict(base, steps=[{"id": "a", "skill_id": text_skill["id"], "input_bindings": {"standard": pb}},
                                                         {"id": "b", "skill_id": text_skill["id"], "input_bindings": {"standard": pb}}]))
        self.assertEqual(saved["steps"][0]["input_bindings"]["standard"]["source"], "playbook")
        two = self.app.save_skill(dict(draft_skill(field="standard"), input_fields=[{"name": "standard", "label": "底线", "required": True},
                                                                                {"name": "other", "label": "另一份", "required": True}]))
        with self.assertRaises(Problem):
            self.app.save_workflow(dict(base, steps=[{"id": "a", "skill_id": two["id"], "input_bindings": {"standard": pb, "other": pb}},
                                                     {"id": "b", "skill_id": text_skill["id"], "input_bindings": {"standard": pb}}]))
        with self.assertRaises(Problem):
            self.app.save_workflow(dict(base, input_fields=[{"name": "role", "label": "角色", "required": True, "options": [["a"], ["b"]]}],
                                        steps=[]))

    def test_model_outcome_is_cross_checked_against_its_condition_answers(self):
        from server import cross_check, fallback_conditions
        self.assertEqual(fallback_conditions("以下任一：香港法律；英格兰与威尔士法律。"), ("any", ["香港法律", "英格兰与威尔士法律"]))
        self.assertEqual(fallback_conditions("须同时满足：①期限 2 年；②商业秘密持续保密。")[0], "all")
        any_item = {"fallback": "以下任一：香港法律；英格兰与威尔士法律。"}
        all_item = {"fallback": "须同时满足：①期限 2 年；②商业秘密持续保密。"}
        self.assertEqual(cross_check({"status": "issue", "fallback_met": [False, True]}, any_item)[0], "unverified")
        self.assertEqual(cross_check({"status": "acceptable_fallback", "fallback_met": [True, False]}, all_item)[0], "unverified")
        self.assertEqual(cross_check({"status": "acceptable_fallback", "fallback_met": [True, True]}, all_item)[0], "acceptable_fallback")
        self.assertEqual(cross_check({"status": "issue", "fallback_met": [True, False]}, all_item)[0], "issue")
        self.assertEqual(cross_check({"status": "no_issue", "fallback_met": "x"}, all_item)[0], "no_issue")

    def test_garbled_quote_is_corrected_and_unmentioned_clauses_are_listed(self):
        binding = playbook_binding({"title": "底线", "items": [{"id": "B7", "title": "返还", "preferred": "x", "fallback": "y"}]}, [])
        _, book = resolve_playbook(binding, {}, [], 1)
        doc = "1. Purpose. Evaluate a deal.\n2. Return. The Recipient shall return all materials on request.\n3. Residuals. Memory may be used."
        out = apply_playbook({"checks": [{"rule_id": "B7", "status": "issue", "quote": "The Reciguous shall return all materials on request."}]},
                             book, [doc], document=doc)
        self.assertTrue(out["checks"][0]["quote_corrected"])
        self.assertEqual(out["checks"][0]["quote"], "The Recipient shall return all materials on request.")
        self.assertEqual([c["clause"] for c in out["coverage"]["unmentioned"]], ["1", "3"])

    def test_changing_a_standard_requires_note_and_approver_and_records_fields(self):
        workflow = self.app.install_examples("nda_playbook")["workflow"]
        edited = json.loads(json.dumps(workflow))
        item = next(i for i in edited["steps"][1]["input_bindings"]["standard"]["items"] if i["id"] == "B6")
        item["fallback"] += "；英格兰法院"
        with self.assertRaises(Problem):
            self.app.save_workflow(edited, workflow["id"])
        saved = self.app.save_workflow(dict(edited, change_note="接受英格兰法院", approved_by="法务负责人"), workflow["id"])
        self.assertEqual(saved["history"][-1]["changes"], ["B6：可接受退让"])

    def test_crud_run_export_and_http_contract(self):
        status, _, skill = self.request('/api/skills', 'POST', draft_skill())
        self.assertEqual(status, 201)
        status, _, edited = self.request('/api/skills/' + skill['id'], 'PUT', dict(skill, name='Renamed'))
        self.assertEqual(status, 200)
        self.assertEqual(edited['version'], 2)
        _, workflow = self.workflow()
        status, _, run = self.request('/api/runs', 'POST', {'workflow_id': workflow['id'], 'inputs': {'document': 'test'}})
        self.assertEqual(status, 202)
        self.wait(run)
        status, headers, exported = self.request('/api/runs/' + run['id'] + '/export')
        self.assertEqual(status, 200)
        self.assertIn('attachment', headers['Content-Disposition'])
        self.assertEqual(exported['status'], 'completed')
        status, _, stats = self.request('/api/status')
        self.assertEqual(status, 200)
        self.assertEqual(stats['counts']['runs'], 1)

    def test_local_origin_and_host_boundaries(self):
        for headers in ({'Host': 'evil.example'}, {'Origin': 'https://evil.example'}, {'Origin': 'null'}, {'Sec-Fetch-Site': 'cross-site'}):
            with self.subTest(headers=headers):
                status, _, error = self.request('/api/status', headers=headers)
                self.assertEqual(status, 403)
                self.assertIn('error', error)
        status, _, _ = self.request('/api/status', headers={'Origin': self.base})
        self.assertEqual(status, 200)

    def test_cross_site_top_level_entry_can_open_but_not_read_api(self):
        headers = {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document'}
        with urlopen(Request(self.base + '/', headers=headers), timeout=3) as response:
            self.assertEqual(response.status, 200)
            self.assertIn(b'<script defer src="/app.js"></script>', response.read())
        for page in ('/guide.html',):
            with urlopen(Request(self.base + page, headers=headers), timeout=3) as response:
                self.assertEqual(response.status, 200)
        status, _, _ = self.request('/api/status', headers=headers)
        self.assertEqual(status, 403)
        status, _, _ = self.request('/api/examples/install', 'POST', {}, headers=headers)
        self.assertEqual(status, 403)
        self.assertEqual(self.app.store.all('skills'), [])

    def test_static_traversal_and_unknown_api_do_not_expose_files(self):
        for path in ('/../server.py', '/..%2F.env.example', '/api/unknown'):
            with self.subTest(path=path):
                status, _, error = self.request(path)
                self.assertEqual(status, 404)
                self.assertIn('error', error)

    def test_malformed_data_returns_client_error_without_traceback(self):
        cases = [('/api/skills', dict(draft_skill(), output_format=[])),
                 ('/api/runs', {'workflow_id': {}}),
                 ('/api/skills/test', {'skill': draft_skill(), 'inputs': {'material': 'a'}, 'mode': []})]
        for path, data in cases:
            with self.subTest(path=path, data=data):
                status, _, body = self.request(path, 'POST', data)
                self.assertEqual(status, 400)
                self.assertIn('error', body)
                self.assertNotIn('Traceback', str(body))


class StubAdapter:
    """Answers per-item questions from the rule text so compare tasks can run without a model."""
    def __init__(self):
        self.calls = []

    def generate(self, skill, inputs, mode, configured=()):
        self.calls.append({"skill": skill, "inputs": inputs, "configured": set(configured)})
        text = json.dumps(inputs, ensure_ascii=False)
        if "gaps" in skill["output_requirements"]:
            return '{"gaps": []}'
        if "uncovered" in skill["output_requirements"] and "rule_id" not in skill["output_requirements"]:
            return '{"uncovered": []}'
        rule = re.search(r"(R\d+) [^｜]*｜严重度", text)
        rid = rule.group(1) if rule else "R1"
        if rid == "R2":
            return json.dumps({"rule_id": rid, "status": "issue", "quote": "这不是广告", "reason": "未标示推广", "fallback_met": []}, ensure_ascii=False)
        return json.dumps({"rule_id": rid, "status": "no_issue", "quote": "公司已付费委托作者推广", "reason": "", "fallback_met": []}, ensure_ascii=False)


class SkillDefinitionTests(unittest.TestCase):
    def test_kind_roles_and_expectations_are_validated(self):
        draft = skill_draft({"name": "对照", "instructions": "x", "kind": "compare", "output_requirements": "x",
                             "input_fields": [{"name": "document", "label": "原文", "role": "original"},
                                              {"name": "standard", "label": "依据", "role": "standard"}],
                             "expected": ["R2 = 不一致", "应包含：8%", "不应包含：违法"]})
        self.assertEqual(draft["kind"], "compare")
        self.assertEqual([f["role"] for f in draft["input_fields"]], ["original", "standard"])
        with self.assertRaises(Problem):
            skill_draft(dict(draft, kind="anything"))
        with self.assertRaises(Problem):
            skill_draft(dict(draft, input_fields=[{"name": "document", "role": "secret"}]))
        with self.assertRaises(Problem):
            skill_draft(dict(draft, expected=["看起来不错"]))
        self.assertEqual(skill_draft({"name": "旧任务", "instructions": "x", "output_requirements": "x",
                                      "input_fields": [{"name": "document"}]})["kind"], "organize")

    def test_expectations_report_hits_and_misses(self):
        output = {"checks": [{"rule_id": "R2", "status": "issue"}, {"rule_id": "R3", "status": "no_issue"}], "note": "请补最终图片"}
        result = check_expectations(["R2 = 不一致", "R3 = 需补材料|不一致", "应包含：最终图片", "不应包含：视频", "R9 = 符合"], output)
        self.assertEqual([r["hit"] for r in result], [True, False, True, True, False])
        self.assertEqual(result[1]["actual"], "符合")
        self.assertEqual(result[4]["actual"], "没有返回这一条")

    def test_numbered_free_text_standard_becomes_items(self):
        playbook = parse_standard_text("R1 收益表述：须附计算依据。\n可接受退让：以下任一：附链接；注明不保证\n严重度：高\nR2 推广身份：须标示广告。\n决定人：合规负责人")
        items = playbook["applicable"]
        self.assertEqual([i["id"] for i in items], ["R1", "R2"])
        self.assertEqual(items[0]["title"], "收益表述")
        self.assertEqual(items[0]["fallback"], "以下任一：附链接；注明不保证")
        self.assertEqual(items[0]["severity"], "高")
        self.assertEqual(items[1]["escalate_to"], "合规负责人")
        with self.assertRaises(Problem):
            parse_standard_text("没有编号的一段话")

    def test_gate_item_stops_review_before_wording(self):
        playbook = {"title": "清单", "version": 1, "reply_to": "市场同事", "excluded": [],
                    "applicable": [{"id": "R0", "title": "可以公开推广", "severity": "高", "gate": True, "preferred": "背景确认可公开推广", "fallback": "",
                                    "escalate_to": "合规负责人", "approved_text": "", "fallback_text": "", "source_ref": ""},
                                   {"id": "R2", "title": "推广关系", "severity": "中", "preferred": "标示广告", "fallback": "",
                                    "escalate_to": "合规负责人", "approved_text": "", "fallback_text": "", "source_ref": ""}]}
        playbook["all"] = playbook["applicable"]
        out = apply_playbook({"checks": [{"rule_id": "R0", "status": "needs_material", "quote": ""},
                                         {"rule_id": "R2", "status": "issue", "quote": ""}]}, playbook)
        self.assertEqual(out["gate_failed"], ["R0"])
        self.assertEqual(out["triage"]["level"], "red")
        self.assertTrue(out["triage"]["reasons"][0].startswith("前置条件未满足"))
        doubted = apply_playbook({"checks": [{"rule_id": "R0", "status": "unverified", "quote": ""}, {"rule_id": "R2", "status": "issue", "quote": ""}]}, playbook)
        self.assertEqual(doubted["gate_failed"], [], "A doubted precondition goes to a person but does not stop the review")
        self.assertTrue(doubted["triage"]["reasons"][0].startswith("前置条件需人工确认"))
        ok = apply_playbook({"checks": [{"rule_id": "R0", "status": "no_issue", "quote": ""}, {"rule_id": "R2", "status": "issue", "quote": ""}]}, playbook)
        self.assertEqual(ok["gate_failed"], [])
        self.assertEqual(ok["triage"]["level"], "yellow")

    def test_model_may_judge_applicability_only_from_the_item_text(self):
        playbook = parse_standard_text("R1 量化收益依据。适用：文案出现数字收益表述。要求：提供依据。")
        out = apply_playbook({"checks": [{"rule_id": "R1", "status": "not_applicable", "quote": ""}]}, playbook)
        self.assertEqual(playbook["applicable"][0]["title"], "量化收益依据")
        self.assertEqual(out["checks"][0]["status"], "not_applicable")
        self.assertTrue(out["checks"][0]["decided_by"].startswith("模型"))

    def test_locate_reports_material_line_and_clause(self):
        document = "1. Definitions apply.\n2. Term is two years.\nThe parties agree.\n\n第3段：投资有风险。"
        found = locate("The parties agree", [("document", "对方 NDA", document)])
        self.assertEqual((found["line"], found["clause"], found["clause_kind"]), (3, "2", "条"))
        self.assertEqual(locate("投资有风险", [("document", "文案", document)])["clause_kind"], "段")
        background = locate("已付费", [("document", "文案", document), ("context", "背景", "公司已付费委托")])
        self.assertEqual(background["input"], "context")
        self.assertIsNone(locate("不存在", [("document", "文案", document)]))


class CompareKindTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.adapter = StubAdapter()
        self.app = App(Path(self.temp.name) / "t.sqlite3", Config(provider="openai", model="m", openai_url="https://x.test/v1", api_key="k"),
                       root=ROOT, model_adapter=self.adapter)

    def tearDown(self):
        self.app.close()
        self.temp.cleanup()

    def wait(self, run_id):
        for _ in range(200):
            run = self.app.store.get("runs", run_id)
            if run["status"] not in {"queued", "running"}:
                return run
            time.sleep(0.02)
        self.fail("run did not finish")

    def test_compare_skill_test_runs_item_by_item_with_roles(self):
        skill = {"name": "对照", "instructions": "逐条对照", "kind": "compare", "output_format": "json", "output_requirements": "平台固定",
                 "input_fields": [{"name": "document", "label": "原文", "role": "original"},
                                  {"name": "context", "label": "背景", "role": "context"},
                                  {"name": "standard", "label": "依据", "role": "standard"}],
                 "expected": ["R2 = 不一致", "R1 = 符合"]}
        inputs = {"document": "第1段：年化8%。\n第2段：这不是广告。", "context": "公司已付费委托作者推广。",
                  "standard": "R1 收益：须附依据。\nR2 推广：须标示广告。"}
        run = self.wait(self.app.test_skill({"skill": skill, "inputs": inputs, "mode": "configured"})["id"])
        self.assertEqual(run["status"], "completed", run.get("error"))
        checks = {c["rule_id"]: c for c in run["final_output"]["checks"]}
        self.assertEqual(checks["R2"]["location"]["line"], 2)
        # R1 quoted the background as if it were the original: the location says so, and the label tells the model what each input is.
        self.assertEqual(checks["R1"]["location"]["input"], "context")
        self.assertTrue(checks["R1"]["quote_outside_original"])
        self.assertEqual(run["final_output"]["triage"]["level"], "yellow")
        item_call = next(c for c in self.adapter.calls if "rule_id" in c["skill"]["output_requirements"])
        self.assertIn("standard", item_call["configured"])
        self.assertEqual(item_call["skill"]["input_fields"][0]["role"], "original")
        self.assertEqual([e["hit"] for e in run["expectations"]], [True, True])

    def test_compare_skill_without_standard_fails_clearly(self):
        skill = {"name": "对照", "instructions": "x", "kind": "compare", "output_format": "json", "output_requirements": "x",
                 "input_fields": [{"name": "document", "label": "原文", "role": "original"}, {"name": "standard", "label": "依据", "role": "standard", "required": False}]}
        run = self.wait(self.app.test_skill({"skill": skill, "inputs": {"document": "a"}, "mode": "configured"})["id"])
        self.assertEqual(run["status"], "failed")
        self.assertIn("依据", run["error"])

    def test_shared_compare_skill_serves_both_examples_with_workflow_labels(self):
        marketing = self.app.install_examples("starter")["workflow"]
        nda = self.app.install_examples("nda_playbook")["workflow"]
        self.assertEqual(marketing["steps"][1]["skill_id"], nda["steps"][1]["skill_id"])
        run = self.wait(self.app.start_run({"workflow_id": marketing["id"], "inputs": marketing["sample_inputs"], "mode": "configured"})["id"])
        self.assertEqual(run["status"], "completed", run.get("error"))
        item_call = next(c for c in self.adapter.calls if "rule_id" in c["skill"]["output_requirements"])
        labels = {f["name"]: f["label"] for f in item_call["skill"]["input_fields"]}
        self.assertEqual(labels["situation"], "发布形式")
        statuses = {c["rule_id"]: c["status"] for c in run["final_output"]["checks"]}
        self.assertEqual(statuses["R5"], "not_applicable")


if __name__ == '__main__':
    unittest.main()


class SameWordingTest(unittest.TestCase):
    def test_text_that_already_matches_approved_wording(self):
        import server
        approved = "Hong Kong Exchanges and Clearing Limited and The Stock Exchange of Hong Kong Limited take no responsibility for the contents of this announcement."
        self.assertTrue(server.same_wording(approved, "Hong Kong Exchanges and Clearing Limited and The Stock Exchange of Hong Kong Limited take no responsibility for the contents of this announcement."))
        self.assertFalse(server.same_wording(approved.replace("announcement", "document"), approved))
        self.assertFalse(server.same_wording("Earn dividends", approved))
