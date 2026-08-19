-- ============================================================
-- Fix RLS : visibilité des utilisateurs et droits SuperAdmin
-- ============================================================

-- ── 1. boutique_assignments : SELECT ──────────────────────────
-- Permettre à un membre d'une boutique de voir TOUS les assignments
-- de cette même boutique (pour afficher la liste d'équipe complète).

-- Supprimer les anciennes politiques SELECT trop restrictives si elles existent
DROP POLICY IF EXISTS "boutique_assignments_select" ON boutique_assignments;
DROP POLICY IF EXISTS "ba_select" ON boutique_assignments;

-- Politique SELECT : un utilisateur peut voir tous les assignments
-- des boutiques auxquelles il appartient lui-même.
CREATE POLICY "ba_select_team" ON boutique_assignments FOR SELECT
  USING (
    boutique_id IN (
      SELECT boutique_id FROM boutique_assignments
      WHERE user_id = auth.uid()
    )
  );

-- ── 2. platform_users : SELECT ────────────────────────────────
-- Un utilisateur doit pouvoir voir le profil de tous les membres
-- de ses boutiques (pour afficher noms, initiales, couleurs).

DROP POLICY IF EXISTS "platform_users_select" ON platform_users;
DROP POLICY IF EXISTS "pu_select" ON platform_users;

CREATE POLICY "pu_select_coworkers" ON platform_users FOR SELECT
  USING (
    -- Se voir soi-même
    id = auth.uid()
    OR
    -- Voir les collègues des mêmes boutiques
    id IN (
      SELECT DISTINCT ba2.user_id
      FROM boutique_assignments ba1
      JOIN boutique_assignments ba2 ON ba1.boutique_id = ba2.boutique_id
      WHERE ba1.user_id = auth.uid()
    )
  );

-- ── 3. SuperAdmin : accès complet via is_super_admin ──────────
-- Le SuperAdmin (is_super_admin = true) doit pouvoir lire et modifier
-- n'importe quelle boutique et assignment.

-- boutiques : SuperAdmin peut tout voir
DROP POLICY IF EXISTS "boutiques_superadmin" ON boutiques;
CREATE POLICY "boutiques_superadmin_select" ON boutiques FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
    OR
    id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
  );

-- boutique_assignments : SuperAdmin peut tout voir et modifier
DROP POLICY IF EXISTS "ba_superadmin" ON boutique_assignments;
CREATE POLICY "ba_superadmin_all" ON boutique_assignments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  );

-- platform_users : SuperAdmin peut tout voir
DROP POLICY IF EXISTS "pu_superadmin" ON platform_users;
CREATE POLICY "pu_superadmin_select" ON platform_users FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  );

-- ── 4. Propriétaire : UPDATE/DELETE sur ses assignements ──────
-- Assurer que le propriétaire peut modifier les droits des membres
-- de ses propres boutiques.

DROP POLICY IF EXISTS "boutique_assignments_owner_update" ON boutique_assignments;
DROP POLICY IF EXISTS "boutique_assignments_owner_delete" ON boutique_assignments;
DROP POLICY IF EXISTS "ba_owner_update" ON boutique_assignments;
DROP POLICY IF EXISTS "ba_owner_delete" ON boutique_assignments;

CREATE POLICY "ba_owner_update" ON boutique_assignments FOR UPDATE
  USING (
    boutique_id IN (
      SELECT ba.boutique_id FROM boutique_assignments ba
      WHERE ba.user_id = auth.uid() AND ba.role = 'Propriétaire'
    )
    OR EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "ba_owner_delete" ON boutique_assignments FOR DELETE
  USING (
    boutique_id IN (
      SELECT ba.boutique_id FROM boutique_assignments ba
      WHERE ba.user_id = auth.uid() AND ba.role = 'Propriétaire'
    )
    OR EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "ba_owner_insert" ON boutique_assignments FOR INSERT
  WITH CHECK (
    boutique_id IN (
      SELECT ba.boutique_id FROM boutique_assignments ba
      WHERE ba.user_id = auth.uid() AND ba.role = 'Propriétaire'
    )
    OR EXISTS (SELECT 1 FROM platform_users WHERE id = auth.uid() AND is_super_admin = true)
  );
