#!/usr/bin/env python3
import copy
import importlib.util
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location('snapshot', 'scripts/export-access-request-snapshot.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
valid = json.loads(Path('.github/audit/access-request-production-snapshot.json').read_text())
now = datetime.fromisoformat(valid['captured_at'].replace('Z', '+00:00'))
assert len(module.validate(valid, now)[1]) == len(valid['signatures'])
for kind in ('project', 'stale', 'future', 'naive', 'base', 'duplicate', 'hash', 'empty', 'separator', 'newline'):
    bad = copy.deepcopy(valid)
    if kind == 'project': bad['project_id'] = 'wrong'
    elif kind == 'stale': bad['captured_at'] = (now - timedelta(hours=49)).isoformat()
    elif kind == 'future': bad['captured_at'] = (now + timedelta(minutes=6)).isoformat()
    elif kind == 'naive': bad['captured_at'] = now.replace(tzinfo=None).isoformat()
    elif kind == 'base': bad['baseline_main_sha'] = 'not-a-sha'
    elif kind == 'duplicate': bad['signatures'].append(bad['signatures'][0])
    elif kind == 'hash': bad['signatures'][0]['md5'] = 'invalid'
    elif kind == 'empty': bad['signatures'] = []
    elif kind == 'separator': bad['signatures'][0]['identity'] = 'bad|identity'
    elif kind == 'newline': bad['signatures'][0]['identity'] = 'bad' + chr(10) + 'identity'
    try: module.validate(bad, now)
    except ValueError: pass
    else: raise AssertionError(f'accepted invalid snapshot: {kind}')
print('snapshot validation: valid export and 10 unsafe snapshots rejected')
