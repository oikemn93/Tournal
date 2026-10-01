import importlib.util
import unittest

spec = importlib.util.spec_from_file_location('delta', 'scripts/check-access-request-delta.py')
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)


class ExactDeltaTest(unittest.TestCase):
    def test_baseline_and_complete_post_are_allowed(self):
        base = {('functions', 'existing'): 'old'}
        candidate = {**base, ('relations', 'public.access_requests'): 'new'}
        allowed = [('relations', 'public.access_requests')]
        self.assertTrue(delta.check(base, candidate, base, allowed).startswith('pre:'))
        self.assertTrue(delta.check(base, candidate, candidate, allowed, True).startswith('post:'))

    def test_scoped_stage_a_and_reviewed_drift(self):
        base = {('functions', 'existing'): 'old'}
        candidate = {**base, ('relations', 'public.access_requests'): 'new'}
        allowed = [('relations', 'public.access_requests')]
        later = {**candidate, ('functions', 'extra'): 'later'}
        self.assertTrue(delta.check(base, candidate, later, allowed).startswith('post+:'))
        for prod in [{**base, ('relations', 'public.access_requests'): 'changed'}, base, {}]:
            with self.assertRaises(ValueError):
                delta.check(base, candidate, prod, allowed)
        with self.assertRaises(ValueError):
            delta.check(base, candidate, base, allowed, True)
        with self.assertRaises(ValueError):
            delta.check(base, candidate, base, allowed + [('indexes', 'missing')])


if __name__ == '__main__':
    unittest.main()
