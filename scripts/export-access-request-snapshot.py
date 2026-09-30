#!/usr/bin/env python3
"""Export reviewed connector signatures; never label a snapshot as a live CI read."""
import json
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT = 'cnxtylngddwmhugxkzju'
MAX_AGE = timedelta(hours=48)

def validate(snapshot, now):
    if snapshot['project_id'] != PROJECT:
        raise ValueError('wrong Supabase project')
    captured = datetime.fromisoformat(snapshot['captured_at'].replace('Z', '+00:00'))
    if captured.tzinfo is None or captured > now + timedelta(minutes=5) or now - captured > MAX_AGE:
        raise ValueError('snapshot stale or invalid timestamp; refresh through connector')
    base = snapshot['baseline_main_sha']
    if not re.fullmatch('[0-9a-f]{40}', base):
        raise ValueError('invalid baseline main SHA')
    signatures = {}
    for row in snapshot['signatures']:
        key = (row['category'], row['identity'])
        if key in signatures or not re.fullmatch('[0-9a-f]{32}', row['md5']):
            raise ValueError('duplicate identity or invalid signature')
        if any('|' in value or chr(10) in value for value in key):
            raise ValueError('invalid identity')
        signatures[key] = row['md5']
    if not signatures:
        raise ValueError('empty snapshot')
    return base, signatures

if __name__ == '__main__':
    snapshot = json.loads(Path('.github/audit/access-request-production-snapshot.json').read_text())
    base, signatures = validate(snapshot, datetime.now(timezone.utc))
    subprocess.run(['git', 'merge-base', '--is-ancestor', base, 'HEAD'], check=True)
    lines = ['|'.join((*key, value)) for key, value in sorted(signatures.items())]
    Path('production-access-signatures.txt').write_text('\n'.join(lines) + '\n')
    Path('production-schema-signatures.txt').write_text(
        '\n'.join(line for line in lines if not line.startswith('cron_jobs|')) + '\n')
    print(f'CONNECTOR SNAPSHOT (not a live CI read): {len(signatures)} objects; '
          f'captured={snapshot["captured_at"]}; baseline={base}')
