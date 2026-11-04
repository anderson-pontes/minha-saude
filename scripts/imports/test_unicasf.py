import json
import unittest
from pathlib import Path
from unicasf import valid_cnpj, professional, parse_document, build_bundle


def source(pages):
    return {"file": "fixture.pdf", "sha256": "a" * 64, "pages": [
        {"number": i + 1, "text": text, "lines": [{"text": line, "bold": True, "bbox": [0, 0, 0, 0]}
                                                  for line in text.splitlines()]} for i, text in enumerate(pages)]}


class ParserTests(unittest.TestCase):
    def test_cnpj(self):
        self.assertTrue(valid_cnpj('02.600.250/0001-98'))
        self.assertFalse(valid_cnpj('02.600.250/0001-99'))
        self.assertFalse(valid_cnpj('00.000.000/0000-00'))

    def test_councils_and_incomplete(self):
        for council in ['CRM', 'CRP', 'CRN', 'CREFITO', 'CREFONO']:
            self.assertEqual(professional(f'- Maria Silva ({council}-PA 123)')['key'], f'{council}:PA:123')
        self.assertIsNone(professional('- Maria Silva (CRM- 123)')['key'])
        self.assertIsNone(professional('- Maria Silva (CRM- )')['registration_number'])
        p = professional('- Maria Silva (a Partir de 06 Anos) (CRM-PA 123) - RQE nº 10')
        self.assertEqual(p['name'], 'Maria Silva')
        self.assertIn('06 Anos', p['attendance_notes'])
        self.assertIn('RQE', p['attendance_notes'])

    def test_continuation_scopes_multiple_units_and_services(self):
        doc = parse_document(source([
            'BRASMEDE LTDA ( CNPJ: 02.600.250/0001-98) - Clínica\nBRASMEDE\nCARDIOLOGIA\n- Maria Silva (a Partir de 06 Anos) (CRM-PA 123)\nPage 1/2',
            '- Joao Santos (CRM-PA 456)\nCLINICA MEDICA\n- Maria Silva (CRM-PA 123)\nDERMATOLOGIA\nULTRA-SONOGRAFIA\nTel: (91)3333-4444 / (91)98888-7777\nRUA A, 20 - SALA 1\nCENTRO - BELEM - PA - CEP: 66000-000\nTel: (91)3333-4444\nRUA B, 30\nCENTRO - BELEM - PA - CEP: 66000-001\nPage 2/2']))
        r = doc['records'][0]
        self.assertEqual((r['page_start'], r['page_end']), (1, 2))
        self.assertEqual(r['professionals'][1]['specialty'], 'CARDIOLOGIA')
        self.assertEqual(len(r['addresses']), 2)
        self.assertEqual(r['addresses'][0]['number'], '20')
        self.assertEqual(r['addresses'][0]['complement'], 'SALA 1')
        bundle = build_bundle([doc])
        self.assertEqual(bundle['summary']['doctors'], 2)
        self.assertEqual(len(next(e for e in bundle['entities'] if e['category'] == 'establishments')['data']['contacts']), 2)
        self.assertEqual(bundle['summary']['specialties'], 3)
        self.assertEqual(sum(l['table'] == 'doctor_specialties' for l in bundle['links']), 3)
        self.assertEqual(sum(l['table'] == 'doctor_establishment_specialties' for l in bundle['links']), 3)
        maria = next(e for e in bundle['entities'] if e['key'] == 'doctors:CRM:PA:123')
        self.assertEqual(maria['data']['notes'], '')
        self.assertTrue(any('06 Anos' in l['notes'] for l in bundle['links'] if l['table'] == 'doctor_establishments'))

    def test_real_documents_and_regressions(self):
        b = json.loads(Path('data/unicasf-review/import.json').read_text(encoding='utf8'))
        self.assertEqual([d['pages_processed'] for d in b['documents']], [69, 6])
        self.assertIn('printed_page_count_mismatch', b['documents'][1]['warnings'])
        records = [r for d in b['documents'] for r in d['records']]
        brasmede = next(r for r in records if r.get('trade_name') == 'BRASMEDE')
        self.assertEqual(len(brasmede['professionals']), 38)
        self.assertEqual((brasmede['page_start'], brasmede['page_end']), (7, 8))
        self.assertEqual(next(p['specialty'] for p in brasmede['professionals'] if 'Tayanne' in p['name']), 'NUTRIÇÃO')
        bianca = [e for e in b['entities'] if e['category'] == 'doctors' and e['data'].get('key') == 'CRM:PA:10096']
        self.assertEqual(len(bianca), 1)
        self.assertGreaterEqual(len(bianca[0]['sources']), 2)
        self.assertTrue(any(l['table'] == 'doctor_establishments' and l['left'] == bianca[0]['key'] for l in b['links']))
        conflict = next(e for e in b['entities'] if e['key'] == 'doctors:CRM:PA:15361')
        self.assertEqual(conflict['status'], 'review')
        self.assertIn('registration_name_conflict', conflict['warnings'])
        self.assertTrue(any(e['status'] == 'review' and 'incomplete_registration' in e['warnings'] for e in b['entities']))
        self.assertFalse(any(r['unparsed'] and 'unclassified_line' in r['warnings'] for r in records))
        # A doctor in many establishments retains ONE strong identity.
        maria = next(e for e in b['entities'] if e['key'] == 'doctors:CRM:PA:4824')
        self.assertGreater(sum(l['table'] == 'doctor_establishments' and l['left'] == maria['key'] for l in b['links']), 1)


if __name__ == '__main__':
    unittest.main()
