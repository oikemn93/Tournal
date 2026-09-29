"""Validate manual workflow inputs without interpolating them into shell code."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path


def gh(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


commit = os.environ['DEPLOY_COMMIT']
pr_number = os.environ['DB_PR']
checksum = os.environ['MIGRATION_SHA256']
if not re.fullmatch('[0-9a-f]{40}', commit) or not re.fullmatch('[0-9]+', pr_number) or not re.fullmatch('[0-9a-f]{64}', checksum):
    raise SystemExit('Invalid deployment input')
repo = os.environ['GITHUB_REPOSITORY']
subprocess.run(['git', 'fetch', 'origin', 'main'], check=True)
subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'origin/main'], check=True)
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() != commit:
    raise SystemExit('Checkout differs from requested main commit')
pr = gh(f'repos/{repo}/pulls/{pr_number}')
if not pr['merged'] or pr['base']['ref'] != 'main' or not pr['head']['ref'].startswith('chore/db-migrations/'):
    raise SystemExit('DB PR must be merged into main before deployment')
if pr['merge_commit_sha'] != commit:
    raise SystemExit('Deploy precisely the DB PR merge commit')
checks = gh(f'repos/{repo}/commits/{pr["head"]["sha"]}/check-runs?per_page=100')
if checks['total_count'] > 100:
    raise SystemExit('Check pagination required; refuse incomplete CI review')
if not checks['check_runs'] or not any(c['name']=='replay' and c['conclusion']=='success' for c in checks['check_runs']):
    raise SystemExit('Canonical replay must be green on the final reviewed PR commit')
if not any(c['name']=='build-and-security' and c['conclusion']=='success' for c in checks['check_runs']):
    raise SystemExit('Build and security CI must be green')
if any(c['status']!='completed' or (c['conclusion']!='success' and not (c['name']=='Supabase Preview' and c['conclusion']=='skipped')) for c in checks['check_runs']):
    raise SystemExit('Complete GitHub CI must be green')
environment = gh(f'repos/{repo}/environments/production-db')
if not any(rule['type']=='required_reviewers' and rule.get('reviewers') for rule in environment['protection_rules']):
    raise SystemExit('production-db needs required reviewers; refuse an unprotected deployment')
path = 'supabase/migrations/20260929204856_access_requests_stage_a.sql'
merged = Path(path).read_bytes()
subprocess.run(['git', 'fetch', 'origin', 'refs/pull/'+pr_number+'/head'], check=True)
if subprocess.check_output(['git', 'rev-parse', 'FETCH_HEAD'], text=True).strip()!=pr['head']['sha']:
    raise SystemExit('Reviewed PR ref differs from final head')
reviewed = subprocess.check_output(['git', 'show', pr['head']['sha']+':'+path])
if hashlib.sha256(merged).hexdigest()!=checksum or merged!=reviewed:
    raise SystemExit('Migration differs from exact reviewed bytes')
print('merged_commit_exact_bytes_complete_ci_and_required_reviewers_verified')
