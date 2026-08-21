begin;

-- Cover foreign-key lookups and the session-context access pattern used by
-- notification and push authorization helpers.
create index if not exists notification_session_context_user_boutique_idx
  on private.notification_session_context(user_id, boutique_id);
create index if not exists notification_session_context_boutique_idx
  on private.notification_session_context(boutique_id);
create index if not exists notification_preferences_updated_by_idx
  on public.notification_preferences(updated_by);
create index if not exists push_subscriptions_boutique_idx
  on public.push_subscriptions(boutique_id);

-- Evaluate auth.uid() once per request instead of once per candidate row.
drop policy if exists "audit_log: insert" on public.audit_log;
create policy "audit_log: insert" on public.audit_log
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      private.auth_is_super_admin()
      or (private.auth_has_active_app_session(boutique_id) and private.auth_is_assigned_to(boutique_id))
    )
  );

drop policy if exists "boutique_assignments_owner_insert" on public.boutique_assignments;
create policy "boutique_assignments_owner_insert" on public.boutique_assignments
  for insert to authenticated
  with check (
    role <> 'owner'
    and private.auth_has_active_app_session(boutique_id)
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_assignments.boutique_id
        and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists "boutique_assignments_owner_update" on public.boutique_assignments;
create policy "boutique_assignments_owner_update" on public.boutique_assignments
  for update to authenticated
  using (
    role <> 'owner'
    and private.auth_has_active_app_session(boutique_id)
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_assignments.boutique_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    role <> 'owner'
    and private.auth_has_active_app_session(boutique_id)
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_assignments.boutique_id
        and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists "boutique_assignments_owner_delete" on public.boutique_assignments;
create policy "boutique_assignments_owner_delete" on public.boutique_assignments
  for delete to authenticated
  using (
    role <> 'owner'
    and private.auth_has_active_app_session(boutique_id)
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_assignments.boutique_id
        and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists notification_preferences_read on public.notification_preferences;
create policy notification_preferences_read on public.notification_preferences
  for select to authenticated
  using (
    private.auth_is_super_admin()
    or (
      private.auth_is_active_user()
      and exists (
        select 1 from public.boutique_assignments ba
        where ba.boutique_id = notification_preferences.boutique_id
          and ba.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "notifications: active boutique select" on public.notifications;
create policy "notifications: active boutique select" on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and boutique_id is not null
    and private.auth_notification_context_matches(boutique_id)
  );

drop policy if exists "push subscriptions: own select" on public.push_subscriptions;
create policy "push subscriptions: own select" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

commit;
