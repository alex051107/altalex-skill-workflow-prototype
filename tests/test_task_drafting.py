import copy
import json
import tempfile
import unittest
from pathlib import Path
from server import App, Config, Problem


class DraftAdapter:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def generate(self, skill, inputs, mode):
        self.calls.append((copy.deepcopy(skill), copy.deepcopy(inputs), mode))
        return json.dumps(self.result, ensure_ascii=False)


class TaskDraftingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.result = {'skill': {'name': '核对订单空白', 'description': '检查订单表待填信息',
                      'instructions': '只核对占位符和明确的未填项，不替用户填写事实。',
                      'input_fields': [{'name': 'document', 'label': '订单表', 'required': True}],
                      'output_format': 'text', 'output_requirements': '待填项和对应原句。',
                      'sample_inputs': {'document': 'model fabricated sample'}},
                      'questions': ['公司是否另有必填清单？']}
        self.adapter = DraftAdapter(self.result)
        self.app = App(Path(self.temp.name)/'test.sqlite3', Config(), model_adapter=self.adapter)

    def tearDown(self):
        self.app.close()
        self.temp.cleanup()

    def test_generated_configuration_is_editable_but_not_saved(self):
        response = self.app.draft_skill({'goal': '列出订单表待填项', 'basis': '只按表内占位符', 'mode': 'configured'})
        self.assertEqual(response['skill']['name'], '核对订单空白')
        self.assertEqual(response['questions'], ['公司是否另有必填清单？'])
        self.assertEqual(response['skill']['sample_inputs'], {})
        self.assertEqual(self.app.store.all('skills'), [])
        self.assertEqual(self.adapter.calls[0][1]['basis'], '只按表内占位符')
        self.assertIn('Do not invent laws', self.adapter.calls[0][0]['instructions'])
        response['skill']['instructions'] = '创建者修改后的真实要求'
        saved = self.app.save_skill(response['skill'])
        self.assertEqual(saved['instructions'], '创建者修改后的真实要求')
        self.assertEqual(self.app.store.get('skills', saved['id']), saved)

    def test_missing_goal_and_mock_never_call_model(self):
        for payload in ({'goal': ''}, {'goal': '检查文件', 'mode': 'mock'}):
            with self.assertRaises(Problem):
                self.app.draft_skill(payload)
        self.assertEqual(self.adapter.calls, [])

    def test_invalid_generated_input_does_not_become_saved_task(self):
        self.result['skill']['input_fields'][0]['name'] = '__proto__'
        with self.assertRaises(Problem) as caught:
            self.app.draft_skill({'goal': '检查文件'})
        self.assertEqual(caught.exception.status, 502)
        self.assertEqual(self.app.store.all('skills'), [])

    def test_bad_question_shape_is_an_error_without_partial_save(self):
        self.result['questions'] = 'AI invented a string instead of a list'
        with self.assertRaises(Problem):
            self.app.draft_skill({'goal': '检查文件'})
        self.assertEqual(self.app.store.all('skills'), [])
