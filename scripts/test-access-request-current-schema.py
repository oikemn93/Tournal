#!/usr/bin/env python3
"""Regression tests: the current-schema gate must reject every kind of drift."""
import runpy
import tempfile
import unittest
from pathlib import Path

module = runpy.run_path(str(Path(__file__).with_name('check-access-request-current-schema.py')))
check, read = module['check'], module['read']


class CurrentSchemaTests(unittest.TestCase):
    def test_identical(self):
        schema = {('functions', 'private.access'): 'a' * 32}
        self.assertIn('identical', check(schema, dict(schema)))

    def test_missing_extra_and_modified_objects_are_rejected(self):
        current = {('functions', 'private.access'): 'a' * 32,
                   ('policies', 'public.requests.read'): 'b' * 32}
        cases = [{}, {('functions', 'private.access'): 'a' * 32},
                 {**current, ('columns', 'public.extra.id'): 'c' * 32},
                 {**current, ('functions', 'private.access'): 'c' * 32}]
        for production in cases:
            with self.subTest(production=production), self.assertRaises(ValueError):
                check(current, production)

    def test_duplicate_and_empty_manifests_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / 'signatures.txt'
            for text in ['', 'functions|private.access|' + 'a' * 32 + '\n' +
                         'functions|private.access|' + 'b' * 32 + '\n']:
                file.write_text(text)
                with self.assertRaises(ValueError):
                    read(file)


if __name__ == '__main__':
    unittest.main()
