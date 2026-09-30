#!/usr/bin/env python3
"""Real independent PostgreSQL transactions, fictitious data only."""
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

url = os.environ.get('TEST_DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')


def query(sql):
    return subprocess.run(['psql', url, '-X', '-At', '-v', 'ON_ERROR_STOP=1'],
                          input=sql, text=True, check=True, capture_output=True).stdout.strip()


def submit(_):
    result = query("begin; set local role service_role; select public.submit_access_request('Race fictive',null,'700009066','Commerce',null); commit;")
    assert '{"received": true}' in result


def flood(action):
    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(action, range(24)))


phone = '+221700009066'
actor = 'a2000000-0000-4000-8000-000000000001'
request_ids = []
try:
    query(f"""insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values('{actor}','authenticated','authenticated','access-race@example.invalid',
      '{{"provider":"email","providers":["email"]}}','{{"full_name":"Race fictive","phone":"+221700009065"}}',now(),now());
      update public.platform_users set is_super_admin=true,is_suspended=false,must_change_password=false where id='{actor}';""")
    for expected in range(1, 4):
        flood(submit)
        count = int(query(f"select count(*) from public.access_requests where telephone='{phone}';"))
        assert count == expected, (expected, count)
        query(f"update public.access_requests set created_at=created_at-interval '2 days' where telephone='{phone}';")
    flood(submit)
    assert int(query(f"select count(*) from public.access_requests where telephone='{phone}';")) == 3
    request_ids = query(f"select id from public.access_requests where telephone='{phone}' order by id;").splitlines()
    request = request_ids[0]

    def accept(_):
        claims = '{"sub":"' + actor + '","role":"authenticated"}'
        query(f"""begin; select set_config('request.jwt.claims','{claims}',true);
          set local role authenticated; select public.decide_access_request('{request}','acceptee'); commit;""")

    flood(accept)
    assert int(query(f"select count(*) from public.ops_interactions where title='access_request_decision' and detail::jsonb->>'request_id'='{request}' and detail::jsonb->>'action'='acceptee';")) == 1
    print('access_requests_race_ok: 24 simultaneous submissions/decisions, duplicate 24h and quota 3/30d')
finally:
    # Fixtures are dedicated to this test and never refer to real identities.
    query(f"""delete from public.notifications where source_event_key in
      (select 'access_request:'||id::text from public.access_requests where telephone='{phone}');
      delete from public.ops_interactions where actor_id='{actor}';
      delete from public.access_requests where telephone='{phone}';
      delete from public.platform_users where id='{actor}';
      delete from auth.users where id='{actor}';""")
