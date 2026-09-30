#!/usr/bin/env python3
"""Production writer. Invoked only by the protected manual deployment workflow."""
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path

import psycopg

spec = importlib.util.spec_from_file_location('delta', 'scripts/check-access-request-delta.py')
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)

version = '20260929204856'
name = 'access_requests_stage_a'
path = Path(f'supabase/migrations/{version}_{name}.sql')
raw = path.read_bytes()
if hashlib.sha256(raw).hexdigest() != os.environ['MIGRATION_SHA256']:
    raise SystemExit('Migration SHA-256 mismatch; deployment refused')
sql = raw.decode('utf-8')
baseline = delta.read('baseline-access-signatures.txt')
candidate = delta.read('candidate-access-signatures.txt')
allowed = json.loads(Path('.github/audit/access-request-objects.json').read_text())
signature_sql = '\n'.join(line for line in Path('.github/audit/access-request-signatures.sql').read_text().splitlines()
                          if not line.startswith('\\'))


def signatures(cursor):
    cursor.execute(signature_sql)
    rows = cursor.fetchall()
    if not rows:
        raise ValueError('Empty production signatures')
    return {(row[0], row[1]): row[2] for row in rows}


# The connection is never printed. No prospect rows are read by this runner.
with psycopg.connect(os.environ['PRODUCTION_DB_DSN']) as conn:
    with conn.cursor() as cursor:
        cursor.execute("set local lock_timeout='30s'; set local statement_timeout='120s'")
        cursor.execute("select pg_advisory_xact_lock(hashtextextended('tournal:reviewed-db-deployment',0))")
        current = signatures(cursor)
        cursor.execute('select name, statements from supabase_migrations.schema_migrations where version=%s', (version,))
        history = cursor.fetchone()
        if history:
            if history[0] != name or history[1] != [sql] or current != candidate:
                raise ValueError('Existing migration history or fingerprint differs; refuse retry')
            print('already_applied_identically; production/replay equal')
        else:
            if current != baseline:
                raise ValueError('Baseline changed after preflight; production write refused')
            delta.check(baseline, candidate, current, allowed)
            # Execute the complete, unchanged contents of the reviewed file.
            cursor.execute(sql, prepare=False)
            cursor.execute('insert into supabase_migrations.schema_migrations(version,name,statements) values(%s,%s,%s)',
                           (version, name, [sql]))
            post = signatures(cursor)
            delta.check(baseline, candidate, post, allowed, require_post=True)
            print('transaction_verified; committing exact migration and history')
    # Context manager commits only when every check has succeeded.
print('deployment_committed; production/replay equal')
