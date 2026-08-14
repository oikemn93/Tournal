update auth.users
set
  email = regexp_replace(coalesce(phone, email, ''), '\D', '', 'g') || '@tournal.internal',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where phone is not null
  and length(regexp_replace(phone, '\D', '', 'g')) >= 8
  and (
    email is null
    or email !~ '^[0-9]+@tournal\.internal$'
    or email <> regexp_replace(phone, '\D', '', 'g') || '@tournal.internal'
  );

