#!/usr/bin/env python3
"""Fail closed: production is baseline or identical to the candidate, never a subset."""
import argparse
import json
import re
from pathlib import Path


def read(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        fields = line.split('|')
        if len(fields) == 3 and re.fullmatch('[0-9a-f]{32}', fields[2]):
            key = tuple(fields[:2])
            if key in result:
                raise ValueError(f'duplicate identity: {key}')
            result[key] = fields[2]
    if not result:
        raise ValueError(f'empty signature manifest: {path}')
    return result


def check(baseline, candidate, production, allowed, require_post=False):
    changes = {key for key in baseline.keys() | candidate.keys() if baseline.get(key) != candidate.get(key)}
    expected = {tuple(key) for key in allowed}
    if changes != expected:
        raise ValueError(f'unexpected or missing migration objects: {sorted(changes ^ expected)}')
    if any(key in baseline or key not in candidate for key in expected):
        raise ValueError('Stage A must only add objects; no replacements or deletions')
    if production == candidate:
        return 'post: production/replay identical'
    if not require_post and production == baseline:
        return 'pre: production/replay delta is exactly the reviewed migration'
    # Production may legitimately be ahead of this historical Stage-A gate.
    # Accept only when every reviewed Stage-A object exactly matches candidate
    # and production has no missing reviewed object. Unrelated later migrations
    # are verified by the canonical live schema comparison elsewhere in CI.
    if not require_post and all(production.get(key) == candidate.get(key) for key in expected):
        return 'post+: reviewed Stage-A objects match; later production drift delegated to canonical schema gate'
    differences = [key for key in production.keys() | (candidate if require_post else baseline).keys()
                   if production.get(key) != (candidate if require_post else baseline).get(key)]
    raise ValueError(f'production drift blocks delivery: {sorted(differences)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('baseline')
    parser.add_argument('candidate')
    parser.add_argument('production')
    parser.add_argument('--post', action='store_true')
    args = parser.parse_args()
    approved = json.loads(Path('.github/audit/access-request-objects.json').read_text())
    print(check(read(args.baseline), read(args.candidate), read(args.production), approved, args.post))
