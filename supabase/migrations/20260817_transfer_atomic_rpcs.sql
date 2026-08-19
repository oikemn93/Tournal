-- ============================================================
-- Transferts inter-boutiques : RPCs transactionnels atomiques
-- ============================================================
-- Remplace les anciennes fonctions create/accept/reject_stock_transfer
-- par des versions idempotentes, sécurisées et avec mouvement de stock.

-- ─── Tables prérequises (idempotent) ─────────────────────────

CREATE TABLE IF NOT EXISTS stock_transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_boutique_id    text NOT NULL REFERENCES boutiques(id),
  to_boutique_id      text NOT NULL REFERENCES boutiques(id),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','cancelled')),
  relationship_type   text CHECK (relationship_type IN ('same_owner','commercial')),
  total_amount        numeric(14,2) NOT NULL DEFAULT 0,
  invoice_id          text,
  charge_id           integer,
  note                text,
  idempotency_key     uuid UNIQUE,
  accepted_by         uuid REFERENCES platform_users(id),
  accepted_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id           bigserial PRIMARY KEY,
  transfer_id  uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id   integer NOT NULL,
  product_name text NOT NULL,
  unit         text NOT NULL DEFAULT 'unité',
  qty          numeric(14,4) NOT NULL,
  prix_unit    numeric(14,2) NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_st_from  ON stock_transfers(from_boutique_id);
CREATE INDEX IF NOT EXISTS idx_st_to    ON stock_transfers(to_boutique_id);
CREATE INDEX IF NOT EXISTS idx_stl_tid  ON stock_transfer_lines(transfer_id);

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE stock_transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;

-- A user can see transfers involving boutiques they have access to
CREATE POLICY IF NOT EXISTS "st_select" ON stock_transfers FOR SELECT
  USING (
    from_boutique_id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
    OR
    to_boutique_id   IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "stl_select" ON stock_transfer_lines FOR SELECT
  USING (
    transfer_id IN (
      SELECT id FROM stock_transfers
      WHERE from_boutique_id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
         OR to_boutique_id   IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
    )
  );

-- Only members of the sending boutique can insert transfers
CREATE POLICY IF NOT EXISTS "st_insert" ON stock_transfers FOR INSERT
  WITH CHECK (
    from_boutique_id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "stl_insert" ON stock_transfer_lines FOR INSERT
  WITH CHECK (
    transfer_id IN (
      SELECT id FROM stock_transfers
      WHERE from_boutique_id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
    )
  );

-- Only accepting boutique members or RPCs (via security definer) update transfers
CREATE POLICY IF NOT EXISTS "st_update" ON stock_transfers FOR UPDATE
  USING (
    to_boutique_id   IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
    OR
    from_boutique_id IN (SELECT boutique_id FROM boutique_assignments WHERE user_id = auth.uid())
  );

-- ─── Helper: resolve owner of a boutique ─────────────────────

CREATE OR REPLACE FUNCTION _transfer_boutique_owner(p_boutique_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT user_id FROM boutique_assignments
  WHERE boutique_id = p_boutique_id AND role = 'Propriétaire'
  LIMIT 1;
$$;

-- ─── RPC: create_stock_transfer ───────────────────────────────

CREATE OR REPLACE FUNCTION create_stock_transfer(
  p_from_boutique_id  text,
  p_to_boutique_id    text,
  p_idempotency_key   uuid,
  p_lines             jsonb,  -- [{product_id, qty, unit_price, discount_percent}]
  p_note              text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer_id       uuid;
  v_relationship_type text;
  v_total             numeric(14,2) := 0;
  v_owner_from        uuid;
  v_owner_to          uuid;
  v_line              jsonb;
  v_prod_id           integer;
  v_prod_name         text;
  v_prod_unit         text;
  v_qty               numeric(14,4);
  v_unit_price        numeric(14,2);
  v_discount          numeric(5,2);
  v_line_amount       numeric(14,2);
  v_caller            uuid := auth.uid();
BEGIN
  -- Caller must be member of from_boutique
  IF NOT EXISTS (
    SELECT 1 FROM boutique_assignments
    WHERE boutique_id = p_from_boutique_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Non autorisé : vous ne faites pas partie de la boutique émettrice';
  END IF;

  -- Idempotency: return existing if already created
  SELECT id INTO v_transfer_id FROM stock_transfers WHERE idempotency_key = p_idempotency_key;
  IF v_transfer_id IS NOT NULL THEN
    SELECT row_to_json(r)::jsonb INTO v_transfer_id
    FROM (SELECT id AS transfer_id, status, relationship_type, total_amount FROM stock_transfers WHERE id = v_transfer_id) r;
    RETURN v_transfer_id;
  END IF;

  -- Determine relationship type
  v_owner_from := _transfer_boutique_owner(p_from_boutique_id);
  v_owner_to   := _transfer_boutique_owner(p_to_boutique_id);
  IF v_owner_from IS NOT NULL AND v_owner_from = v_owner_to THEN
    v_relationship_type := 'same_owner';
  ELSE
    v_relationship_type := 'commercial';
  END IF;

  -- Compute total
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_discount   := COALESCE((v_line->>'discount_percent')::numeric, 0);
    v_total      := v_total + v_qty * v_unit_price * (1 - v_discount / 100.0);
  END LOOP;

  -- Insert transfer header
  INSERT INTO stock_transfers (
    from_boutique_id, to_boutique_id, status, relationship_type,
    total_amount, note, idempotency_key
  )
  VALUES (
    p_from_boutique_id, p_to_boutique_id, 'pending', v_relationship_type,
    v_total, p_note, p_idempotency_key
  )
  RETURNING id INTO v_transfer_id;

  -- Insert lines with product info
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_prod_id    := (v_line->>'product_id')::integer;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_discount   := COALESCE((v_line->>'discount_percent')::numeric, 0);

    -- Resolve product name + unit from the from_boutique
    SELECT nom, unit INTO v_prod_name, v_prod_unit
    FROM products
    WHERE id = v_prod_id AND boutique_id = p_from_boutique_id
    LIMIT 1;

    IF v_prod_name IS NULL THEN
      v_prod_name := 'Produit #' || v_prod_id;
      v_prod_unit := 'unité';
    END IF;

    INSERT INTO stock_transfer_lines (transfer_id, product_id, product_name, unit, qty, prix_unit, discount_percent)
    VALUES (v_transfer_id, v_prod_id, v_prod_name, v_prod_unit, v_qty, v_unit_price, v_discount);
  END LOOP;

  RETURN jsonb_build_object(
    'transfer_id',       v_transfer_id,
    'status',            'pending',
    'relationship_type', v_relationship_type,
    'total_amount',      v_total
  );
END;
$$;

-- ─── RPC: accept_stock_transfer ──────────────────────────────

CREATE OR REPLACE FUNCTION accept_stock_transfer(
  p_transfer_id       uuid,
  p_idempotency_key   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer          stock_transfers%ROWTYPE;
  v_caller            uuid := auth.uid();
  v_line              stock_transfer_lines%ROWTYPE;
  v_stock_before_from numeric(14,4);
  v_stock_before_to   numeric(14,4);
  v_invoice_id        text;
  v_charge_id         integer;
  v_line_amount       numeric(14,2);
  v_seq               integer;
  v_today             text;
BEGIN
  -- Lock the transfer row to prevent concurrent accepts
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable';
  END IF;

  -- Idempotency: already accepted
  IF v_transfer.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'transfer_id',       v_transfer.id,
      'status',            'accepted',
      'relationship_type', v_transfer.relationship_type,
      'total_amount',      v_transfer.total_amount,
      'invoice_id',        v_transfer.invoice_id,
      'charge_id',         v_transfer.charge_id
    );
  END IF;

  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Ce transfert ne peut plus être accepté (statut: %)', v_transfer.status;
  END IF;

  -- Caller must be member of the destination boutique
  IF NOT EXISTS (
    SELECT 1 FROM boutique_assignments
    WHERE boutique_id = v_transfer.to_boutique_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Non autorisé : vous ne faites pas partie de la boutique destinataire';
  END IF;

  -- Process each line atomically
  FOR v_line IN
    SELECT * FROM stock_transfer_lines WHERE transfer_id = p_transfer_id
  LOOP
    -- ── Stock deduction from sender ──────────────────────────
    -- Compute current stock of sender
    SELECT COALESCE(SUM(qty), 0) INTO v_stock_before_from
    FROM stock_entries
    WHERE boutique_id = v_transfer.from_boutique_id
      AND product_id  = v_line.product_id;

    IF v_stock_before_from < v_line.qty THEN
      RAISE EXCEPTION 'Stock insuffisant chez l''émetteur pour le produit % (disponible: %, demandé: %)',
        v_line.product_name, v_stock_before_from, v_line.qty;
    END IF;

    -- Insert negative stock entry (outgoing) at sender
    INSERT INTO stock_entries (
      boutique_id, product_id, qty, montant_du, fournisseur_id,
      note, source
    ) VALUES (
      v_transfer.from_boutique_id,
      v_line.product_id,
      -v_line.qty,
      0,
      NULL,
      'Sortie — Transfert vers boutique ' || v_transfer.to_boutique_id
        || ' (transfer_id:' || p_transfer_id || ')',
      'transfer_out'
    );

    -- ── Stock credit to recipient ─────────────────────────────
    SELECT COALESCE(SUM(qty), 0) INTO v_stock_before_to
    FROM stock_entries
    WHERE boutique_id = v_transfer.to_boutique_id
      AND product_id  = v_line.product_id;

    -- Ensure product exists in destination boutique (mirror it if not)
    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE boutique_id = v_transfer.to_boutique_id AND id = v_line.product_id
    ) THEN
      INSERT INTO products (id, boutique_id, nom, unit, prix_vente)
      SELECT v_line.product_id, v_transfer.to_boutique_id, v_line.product_name, v_line.unit, v_line.prix_unit
      ON CONFLICT DO NOTHING;
    END IF;

    -- Insert positive stock entry (incoming) at recipient
    INSERT INTO stock_entries (
      boutique_id, product_id, qty, montant_du, fournisseur_id,
      note, source
    ) VALUES (
      v_transfer.to_boutique_id,
      v_line.product_id,
      v_line.qty,
      ROUND(v_line.qty * v_line.prix_unit * (1 - v_line.discount_percent / 100.0), 2),
      NULL,
      'Entrée — Transfert reçu de boutique ' || v_transfer.from_boutique_id
        || ' (transfer_id:' || p_transfer_id || ')',
      'transfer_in'
    );
  END LOOP;

  -- ── Commercial: create invoice + charge ──────────────────────
  IF v_transfer.relationship_type = 'commercial' THEN
    v_today := to_char(now(), 'DDMMYY');

    -- Generate invoice ID
    SELECT COALESCE(MAX(SUBSTRING(id FROM 10)::integer), 0) + 1
    INTO v_seq
    FROM invoices
    WHERE boutique_id = v_transfer.from_boutique_id
      AND id LIKE 'F' || v_today || '-%';

    v_invoice_id := 'F' || v_today || '-' || LPAD(v_seq::text, 6, '0');

    -- Create invoice at sender
    INSERT INTO invoices (
      id, boutique_id, client, client_tel, montant, statut, type,
      date, note, acompte
    ) VALUES (
      v_invoice_id,
      v_transfer.from_boutique_id,
      'Transfert B2B → ' || v_transfer.to_boutique_id,
      NULL,
      v_transfer.total_amount,
      'Encaissé',
      'Vente',
      now()::date,
      'Transfert inter-boutiques #' || p_transfer_id,
      v_transfer.total_amount
    );

    -- Create invoice lines at sender
    INSERT INTO invoice_lines (invoice_id, boutique_id, product_id, nom, qty, unit, prix_unit, prix_achat, discount_percent)
    SELECT
      v_invoice_id,
      v_transfer.from_boutique_id,
      stl.product_id,
      stl.product_name,
      stl.qty,
      stl.unit,
      stl.prix_unit,
      (SELECT prix_achat FROM products WHERE boutique_id = v_transfer.from_boutique_id AND id = stl.product_id LIMIT 1),
      stl.discount_percent
    FROM stock_transfer_lines stl
    WHERE stl.transfer_id = p_transfer_id;

    -- Create pending charge at recipient
    INSERT INTO charges (
      boutique_id, label, montant, statut, note, source_transfer_id
    ) VALUES (
      v_transfer.to_boutique_id,
      'Achat B2B — ' || v_transfer.from_boutique_id,
      v_transfer.total_amount,
      'En attente',
      'Facture ' || v_invoice_id || ' — transfert #' || p_transfer_id,
      p_transfer_id
    )
    RETURNING id INTO v_charge_id;
  END IF;

  -- ── Mark transfer accepted ────────────────────────────────────
  UPDATE stock_transfers SET
    status       = 'accepted',
    invoice_id   = v_invoice_id,
    charge_id    = v_charge_id,
    accepted_by  = v_caller,
    accepted_at  = now(),
    updated_at   = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id',       p_transfer_id,
    'status',            'accepted',
    'relationship_type', v_transfer.relationship_type,
    'total_amount',      v_transfer.total_amount,
    'invoice_id',        v_invoice_id,
    'charge_id',         v_charge_id
  );
END;
$$;

-- ─── RPC: reject_stock_transfer ──────────────────────────────

CREATE OR REPLACE FUNCTION reject_stock_transfer(
  p_transfer_id     uuid,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer  stock_transfers%ROWTYPE;
  v_caller    uuid := auth.uid();
BEGIN
  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable';
  END IF;

  -- Idempotency: already rejected
  IF v_transfer.status IN ('rejected','cancelled') THEN
    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', v_transfer.status);
  END IF;

  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Ce transfert ne peut plus être refusé (statut: %)', v_transfer.status;
  END IF;

  -- Caller must be member of to_boutique OR from_boutique (sender can cancel)
  IF NOT EXISTS (
    SELECT 1 FROM boutique_assignments
    WHERE boutique_id IN (v_transfer.to_boutique_id, v_transfer.from_boutique_id)
      AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- No stock was moved yet (only moves on accept) — just mark rejected
  UPDATE stock_transfers SET
    status     = 'rejected',
    updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'rejected');
END;
$$;

-- ─── Ensure charges table has source_transfer_id column ──────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'charges' AND column_name = 'source_transfer_id'
  ) THEN
    ALTER TABLE charges ADD COLUMN source_transfer_id uuid REFERENCES stock_transfers(id);
  END IF;
END;
$$;

-- ─── Ensure stock_entries has source column ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entries' AND column_name = 'source'
  ) THEN
    ALTER TABLE stock_entries ADD COLUMN source text;
  END IF;
END;
$$;
