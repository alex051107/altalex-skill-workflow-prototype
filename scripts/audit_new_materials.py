#!/usr/bin/env python3
"""Run frozen fixtures against an isolated real-model service; never rewrite expectations."""
import argparse
import collections
import hashlib
import json
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import App, Config, LocalServer


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def request(base, path, body=None):
    req = Request(base + path, data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'),
                  headers={'Content-Type': 'application/json'}, method='GET' if body is None else 'POST')
    try:
        with urlopen(req, timeout=10) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        raise RuntimeError(f'Application API HTTP {exc.code}: {exc.read().decode("utf-8", errors="replace")}') from None


def wait_run(base, run_id, deadline=450):
    until = time.monotonic() + deadline
    last = None
    while time.monotonic() < until:
        last = request(base, '/api/runs/' + run_id)
        if last['status'] not in {'queued', 'running'}:
            return last
        time.sleep(0.5)
    return dict(last or {'id': run_id}, audit_wait_timed_out=True)


def quote_check(items, document):
    failures = []
    count = 0
    for index, item in enumerate(items):
        if not isinstance(item, dict) or not isinstance(item.get('quote'), str):
            failures.append({'index': index, 'reason': 'quote must be a string'})
            continue
        quote = item['quote']
        if quote:
            count += 1
            if quote not in document:
                failures.append({'index': index, 'quote': quote, 'reason': 'not a contiguous document substring'})
    return {'all_quotes_exact': not failures, 'nonempty_quotes_count': count, 'failures': failures,
            'coverage_evaluated': False}


def evaluate(case, run):
    output = run.get('final_output')
    raw_checks = output.get('checks') if isinstance(output, dict) else None
    array_present = isinstance(raw_checks, list)
    checks = raw_checks if array_present else []
    invalid_items = [index for index, item in enumerate(checks)
                     if not isinstance(item, dict) or not isinstance(item.get('rule_id'), str)]
    valid_items = [item for index, item in enumerate(checks) if index not in invalid_items]
    counts = collections.Counter(item['rule_id'] for item in valid_items)
    expected = case['expected']['rule_statuses']
    coverage = array_present and not invalid_items and set(counts) == set(expected) and all(count == 1 for count in counts.values())
    actual = {item['rule_id']: item.get('status') for item in valid_items}
    by_rule = {rule: {'expected': status, 'actual': actual.get(rule),
                      'match': counts.get(rule) == 1 and actual.get(rule) == status} for rule, status in expected.items()}
    review_quotes = quote_check(checks, case['inputs']['document']) if array_present else {'all_quotes_exact': False, 'failures': ['no checks array']}
    extraction = None
    if run.get('kind') == 'workflow' and run.get('steps'):
        first = run['steps'][0].get('output')
        items = first.get('items') if isinstance(first, dict) else None
        extraction = quote_check(items, case['inputs']['document']) if isinstance(items, list) else {'all_quotes_exact': False, 'failures': ['no items array']}
    summary = output.get('summary', '') if isinstance(output, dict) else ''
    phrase_flags = [phrase for phrase in ['允许发布', '通过审核', '已获批准', '可以发布', '即可发布', '审核通过']
                    if isinstance(summary, str) and phrase in summary]
    return {'run_status': run.get('status'), 'output_has_checks_array': array_present,
            'invalid_check_item_indices': invalid_items,
            'exact_rule_coverage': bool(coverage), 'missing_rule_ids': sorted(set(expected) - set(counts)),
            'unexpected_rule_ids': sorted(set(counts) - set(expected)),
            'duplicate_rule_ids': sorted(rule for rule, count in counts.items() if count > 1),
            'status_by_rule': by_rule, 'statuses_matched': sum(row['match'] for row in by_rule.values()),
            'statuses_expected': len(expected), 'all_statuses_match': all(row['match'] for row in by_rule.values()),
            'review_quote_integrity': review_quotes, 'extraction_quote_integrity': extraction,
            'machine_checks_pass': bool(run.get('status') == 'completed' and coverage and all(row['match'] for row in by_rule.values())
                                        and review_quotes['all_quotes_exact'] and (extraction is None or extraction['all_quotes_exact'])),
            'approval_phrase_heuristic_flags': phrase_flags,
            'manual_review': {'performed': False, 'no_automatic_approval': None, 'material_specificity': None,
                              'notes': 'Pending actual human/agent reading of every case; phrase flags are not verdicts.'}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='audit/heldout_eval_v1')
    args = parser.parse_args()
    out = ROOT / args.output
    if not out.resolve().is_relative_to((ROOT / 'audit').resolve()):
        raise SystemExit('Output must be inside audit/.')
    out.mkdir(parents=True, exist_ok=False)
    starter_path = ROOT / 'audit/pre_role_fix_starter.json'
    fixture_path = ROOT / 'audit/heldout_cases.json'
    starter = json.loads(starter_path.read_text())
    fixture = json.loads(fixture_path.read_text())
    if not fixture.get('frozen') or len(fixture['cases']) != 6:
        raise SystemExit('Expected six frozen cases.')
    for recorded, skill in zip(fixture['instruction_snapshot'], starter['skills']):
        for key in ('id', 'instructions', 'output_requirements'):
            if recorded[key] != skill[key]:
                raise SystemExit(f'Frozen instruction snapshot mismatch: {key}')
    config = Config(provider='ollama', model='qwen3:4b-instruct-2507-q4_K_M',
                    ollama_url='http://127.0.0.1:11434', timeout=180)
    report = {'started_at_utc': utc(), 'finished_at_utc': None,
              'design': '6 precommitted cases; one two-step workflow and one direct review per case; no retries or prompt tuning.',
              'comparison': 'Direct review receives the same document/context/rules and extraction={items:[]}. Same review instructions and provider parameters.',
              'ordering': 'Alternating by case: workflow then direct, direct then workflow; each case evaluated once per arm.',
              'model': config.model, 'provider': 'ollama',
              'parameters': {'temperature': 0.1, 'num_ctx': 8192, 'num_predict': 2048, 'timeout_seconds': 180},
              'fixture_sha256': hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
              'starter_snapshot_sha256': hashlib.sha256(starter_path.read_bytes()).hexdigest(),
              'server_source_sha256': hashlib.sha256((ROOT / 'server.py').read_bytes()).hexdigest(),
              'limitations': ['Single run per case and arm; small synthetic sample, no statistical superiority claim.',
                             'Local model sampling is not guaranteed deterministic; order is controlled but not randomized.',
                             'No automatic legal or publishing approval; semantic/material checks require separate reading.'],
              'cases': []}
    write_json(out / 'results.json', report)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='clausecraft-heldout-') as temporary:
        app = App(Path(temporary) / 'audit.sqlite3', config=config, root=ROOT)
        http = LocalServer(('127.0.0.1', 0), app)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{http.server_port}'
        print(f'ISOLATED_SERVICE {base}; temporary SQLite; real model {config.model}', flush=True)
        try:
            skill_ids = {}
            for draft in starter['skills']:
                saved = request(base, '/api/skills', draft)
                skill_ids[draft['id']] = saved['id']
            workflow = json.loads(json.dumps(starter['workflow']))
            for step in workflow['steps']:
                step['skill_id'] = skill_ids[step['skill_id']]
            saved_workflow = request(base, '/api/workflows', workflow)
            review = next(skill for skill in starter['skills'] if skill['id'] == 'starter-review')
            for index, case in enumerate(fixture['cases']):
                row = {'id': case['id'], 'title': case['title'], 'arms': {}}
                report['cases'].append(row)
                order = ['workflow', 'direct_review'] if index % 2 == 0 else ['direct_review', 'workflow']
                row['order'] = order
                for arm in order:
                    print(f'BEGIN {case["id"]} {arm}', flush=True)
                    arm_start = time.monotonic()
                    try:
                        if arm == 'workflow':
                            run = request(base, '/api/runs', {'workflow_id': saved_workflow['id'], 'inputs': case['inputs'], 'mode': 'configured'})
                        else:
                            inputs = dict(case['inputs'], extraction={'items': []})
                            run = request(base, '/api/skills/test', {'skill': review, 'inputs': inputs, 'mode': 'configured'})
                        run = wait_run(base, run['id'])
                        file = out / f'{case["id"]}__{arm}.json'
                        write_json(file, run)
                        evaluation = evaluate(case, run)
                        evaluation.update(run_id=run['id'], raw_run_file=str(file.relative_to(ROOT)),
                                          elapsed_seconds=round(time.monotonic() - arm_start, 3))
                        row['arms'][arm] = evaluation
                        print(f'END {case["id"]} {arm} status={run["status"]} matched={evaluation["statuses_matched"]}/{evaluation["statuses_expected"]} exact_rules={evaluation["exact_rule_coverage"]} quotes={evaluation["review_quote_integrity"]["all_quotes_exact"]}', flush=True)
                    except Exception as exc:
                        row['arms'][arm] = {'transport_or_audit_error': str(exc), 'elapsed_seconds': round(time.monotonic() - arm_start, 3)}
                        print(f'AUDIT_ERROR {case["id"]} {arm}: {exc}', flush=True)
                    write_json(out / 'results.json', report)
        finally:
            http.shutdown()
            http.server_close()
            thread.join(timeout=5)
            app.close()
            print('ISOLATED_SERVICE_CLEANED_UP', flush=True)
    report['finished_at_utc'] = utc()
    report['elapsed_seconds'] = round(time.monotonic() - started, 3)
    report['temporary_service_cleaned_up'] = True
    write_json(out / 'results.json', report)
    print(f'COMPLETE {out / "results.json"}', flush=True)


if __name__ == '__main__':
    main()
