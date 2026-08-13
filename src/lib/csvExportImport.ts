import { strFromU8, strToU8, zipSync, unzipSync } from "fflate";
import { supabase } from "./supabaseClient";

// ─── Types partagés ───────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 2;
export const APP_VERSION    = "2.0.0";

export interface ExportManifest {
  schema_version:      number;
  application_version: string;
  created_at:          string;
  boutique_id:         string;
  boutique_nom:        string;
  tables:              Record<string, number>;
  checksum:            string;
}

export interface ImportReport {
  success: boolean;
  tables:  Record<string, { imported: number; skipped: number; errors: string[] }>;
  errors:  string[];
  duration_ms: number;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r"))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(",")];
  for (const row of rows)
    lines.push(headers.map(h => escapeCell(row[h])).join(","));
  return lines.join("\n");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines  = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// Checksum SHA-256 d'un objet (déterministe via JSON.stringify trié)
async function sha256(data: string): Promise<string> {
  const buf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  return "sha256:" + hex;
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export async function exportBoutique(boutiqueId: string, boutiqueNom: string): Promise<Blob> {
  const t0 = Date.now();

  // Fetcher toutes les tables pour cette boutique
  const [
    { data: categories },
    { data: products },
    { data: stock_entries },
    { data: suppliers },
    { data: clients },
    { data: invoices },
    { data: invoice_lines },
    { data: charges },
    { data: caisse_sessions },
    { data: audit_log },
  ] = await Promise.all([
    supabase.from("categories").select("*").eq("boutique_id", boutiqueId),
    supabase.from("products").select("*").eq("boutique_id", boutiqueId),
    supabase.from("stock_entries").select("*").eq("boutique_id", boutiqueId),
    supabase.from("suppliers").select("*").eq("boutique_id", boutiqueId),
    supabase.from("clients").select("*").eq("boutique_id", boutiqueId),
    supabase.from("invoices").select("*").eq("boutique_id", boutiqueId),
    supabase.from("invoice_lines").select("*").eq("boutique_id", boutiqueId),
    supabase.from("charges").select("*").eq("boutique_id", boutiqueId),
    supabase.from("caisse_sessions").select("*").eq("boutique_id", boutiqueId),
    supabase.from("audit_log").select("*").eq("boutique_id", boutiqueId),
  ]);

  const files: Record<string, string> = {
    "categories.csv":    toCsv(categories    ?? []),
    "products.csv":      toCsv(products      ?? []),
    "stock_entries.csv": toCsv(stock_entries ?? []),
    "suppliers.csv":     toCsv(suppliers     ?? []),
    "clients.csv":       toCsv(clients       ?? []),
    "invoices.csv":      toCsv(invoices      ?? []),
    "invoice_lines.csv": toCsv(invoice_lines ?? []),
    "charges.csv":       toCsv(charges       ?? []),
    "caisse_sessions.csv": toCsv(caisse_sessions ?? []),
    "audit_log.csv":     toCsv(audit_log     ?? []),
  };

  const tableCounts: Record<string, number> = {
    categories:    (categories    ?? []).length,
    products:      (products      ?? []).length,
    stock_entries: (stock_entries ?? []).length,
    suppliers:     (suppliers     ?? []).length,
    clients:       (clients       ?? []).length,
    invoices:      (invoices      ?? []).length,
    invoice_lines: (invoice_lines ?? []).length,
    charges:       (charges       ?? []).length,
    caisse_sessions: (caisse_sessions ?? []).length,
    audit_log:     (audit_log     ?? []).length,
  };

  // Checksum = hash de la concaténation de tous les CSV
  const allContent   = Object.values(files).join("\n");
  const checksum     = await sha256(allContent);
  const created_at   = new Date().toISOString();

  const manifest: ExportManifest = {
    schema_version:      SCHEMA_VERSION,
    application_version: APP_VERSION,
    created_at,
    boutique_id:  boutiqueId,
    boutique_nom: boutiqueNom,
    tables:       tableCounts,
    checksum,
  };

  files["manifest.json"] = JSON.stringify(manifest, null, 2);

  // Créer le ZIP
  const zipInput: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files))
    zipInput[name] = strToU8(content);

  const zipped = zipSync(zipInput, { level: 6 });

  // Journaliser l'export dans Supabase
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("export_import_log").insert({
    boutique_id:    boutiqueId,
    user_id:        user?.id ?? null,
    operation:      "export",
    status:         "success",
    file_name:      `export-${boutiqueId}-${created_at.slice(0,10)}.zip`,
    schema_version: SCHEMA_VERSION,
    manifest:       manifest as unknown as Record<string, unknown>,
    duration_ms:    Date.now() - t0,
  });

  return new Blob([zipped], { type: "application/zip" });
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────
// Colonnes attendues par table (validation structure)
const REQUIRED_COLS: Record<string, string[]> = {
  categories:    ["id","boutique_id","nom"],
  products:      ["id","boutique_id","nom","prix_achat","prix_vente","stock","unit"],
  stock_entries: ["id","boutique_id","product_id","type","qty"],
  suppliers:     ["id","boutique_id","nom"],
  clients:       ["id","boutique_id","nom","type"],
  invoices:      ["id","boutique_id","montant","acompte","status","type"],
  invoice_lines: ["boutique_id","invoice_id","qty","prix_unit"],
  charges:       ["id","boutique_id","label","montant"],
  caisse_sessions: ["id","boutique_id","opened_at","fond_ouverture"],
  audit_log:     ["boutique_id","action"],
};

// Ordre d'import respectant les FKs
const IMPORT_ORDER = [
  "categories","products","stock_entries",
  "suppliers","clients","invoices","invoice_lines",
  "charges","caisse_sessions","audit_log",
] as const;

function coerceRow(table: string, row: Record<string, string>, targetBoutiqueId: string): Record<string, unknown> {
  const r: Record<string, unknown> = { ...row };

  // Forcer boutique_id vers la boutique cible (sécurité)
  r.boutique_id = targetBoutiqueId;

  // Conversions de types selon la table
  const numericCols: Record<string, string[]> = {
    products:      ["id","prix_achat","prix_vente","stock","sell_qty","low_stock_threshold"],
    stock_entries: ["id","product_id","qty","prix_unit"],
    clients:       ["id","total"],
    suppliers:     ["id"],
    invoices:      ["montant","acompte","client_id"],
    invoice_lines: ["product_id","qty","prix_unit","sell_qty"],
    charges:       ["id","montant"],
  };
  const boolCols: Record<string, string[]> = {
    products: ["actif"],
  };

  for (const col of (numericCols[table] ?? [])) {
    if (r[col] !== "" && r[col] !== undefined) r[col] = Number(r[col]);
    else r[col] = null;
  }
  for (const col of (boolCols[table] ?? [])) {
    r[col] = r[col] === "true" || r[col] === "1";
  }

  // Nettoyer les chaînes vides → null sauf pour les colonnes NOT NULL requises
  for (const [k, v] of Object.entries(r)) {
    if (v === "") r[k] = null;
  }

  // Retirer l'id auto-généré pour invoice_lines (generated always as identity)
  if (table === "invoice_lines") delete r.id;

  return r;
}

export async function importBoutique(
  zipBlob: Blob,
  targetBoutiqueId: string,
  onDuplicate: "skip" | "update"
): Promise<ImportReport> {
  const t0 = Date.now();
  const report: ImportReport = { success: true, tables: {}, errors: [], duration_ms: 0 };

  // Lire le ZIP
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
  } catch (e) {
    return { ...report, success: false, errors: ["ZIP invalide : " + String(e)], duration_ms: Date.now() - t0 };
  }

  // Valider le manifest
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) return { ...report, success: false, errors: ["manifest.json absent du ZIP"], duration_ms: Date.now() - t0 };

  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as ExportManifest;
  } catch (e) {
    return { ...report, success: false, errors: ["manifest.json illisible : " + String(e)], duration_ms: Date.now() - t0 };
  }

  if (manifest.schema_version > SCHEMA_VERSION) {
    return { ...report, success: false, errors: [`Version de schéma ${manifest.schema_version} non supportée (max: ${SCHEMA_VERSION})`], duration_ms: Date.now() - t0 };
  }

  // Vérifier le checksum
  const csvFiles = Object.entries(files)
    .filter(([n]) => n.endsWith(".csv"))
    .map(([, v]) => strFromU8(v));
  const computedChecksum = await sha256(csvFiles.join("\n"));
  if (computedChecksum !== manifest.checksum) {
    report.errors.push("⚠️ Checksum invalide — l'archive est peut-être corrompue. Import continué.");
  }

  // Importer dans l'ordre FK
  for (const table of IMPORT_ORDER) {
    const csvBytes = files[`${table}.csv`];
    if (!csvBytes) { report.tables[table] = { imported:0, skipped:0, errors:["Fichier absent"] }; continue; }

    const rows = parseCsv(strFromU8(csvBytes));
    const tableReport = { imported:0, skipped:0, errors:[] as string[] };
    report.tables[table] = tableReport;

    if (!rows.length) continue;

    // Valider les colonnes requises
    const headers = Object.keys(rows[0]);
    const missing = (REQUIRED_COLS[table] ?? []).filter(c => !headers.includes(c));
    if (missing.length) {
      tableReport.errors.push(`Colonnes manquantes : ${missing.join(", ")}`);
      report.success = false;
      continue;
    }

    // Coercer et insérer par lots de 100
    const coerced = rows.map(r => coerceRow(table, r, targetBoutiqueId));
    const BATCH = 100;

    for (let i = 0; i < coerced.length; i += BATCH) {
      const batch = coerced.slice(i, i + BATCH);
      let q;
      if (onDuplicate === "update") {
        q = supabase.from(table).upsert(batch, { ignoreDuplicates: false });
      } else {
        q = supabase.from(table).upsert(batch, { ignoreDuplicates: true });
      }
      const { error, count } = await q.select();
      if (error) {
        tableReport.errors.push(`Batch [${i}..${i+BATCH}] : ${error.message}`);
        tableReport.skipped += batch.length;
        report.success = false;
      } else {
        const inserted = count ?? batch.length;
        tableReport.imported += inserted;
        tableReport.skipped  += batch.length - inserted;
      }
    }
  }

  report.duration_ms = Date.now() - t0;

  // Journaliser l'import
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("export_import_log").insert({
    boutique_id:    targetBoutiqueId,
    user_id:        user?.id ?? null,
    operation:      "import",
    status:         report.success ? (report.errors.length ? "partial" : "success") : "failed",
    file_name:      manifest.boutique_nom + "-import.zip",
    schema_version: manifest.schema_version,
    manifest:       manifest as unknown as Record<string, unknown>,
    duration_ms:    report.duration_ms,
    error_detail:   report.errors.length ? report.errors.join(" | ") : null,
  });

  return report;
}
