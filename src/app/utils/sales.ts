import type { Boutique, Invoice, Product } from "../types";

function normalizedUnit(value?: string): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "piece" || raw === "pièce" || raw === "pieces" || raw === "pièces") return "piece";
  if (raw === "metre" || raw === "mètre" || raw === "metres" || raw === "mètres") return "metres";
  return raw;
}

/**
 * Conditioning options shared by every selling surface.
 * Unit/piece is deliberately first: a new sale must always start in unit mode,
 * while lot and length-based modes remain explicit user choices.
 */
export function getSaleUnitOptions(product: Product, boutique: Boutique): string[] {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  if (!category || category.nbPiecesParLot <= 0) return [product.unit];

  const baseUnit = category.unitVente || product.unit;
  const options = ["Pièce", "Lot"];
  if (normalizedUnit(baseUnit) !== "piece") options.push(baseUnit);
  return Array.from(new Set(options));
}

export function getDefaultSaleUnit(product: Product, boutique: Boutique): string {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  const baseUnit = category?.unitVente ?? product.unit;
  const options = getSaleUnitOptions(product, boutique);

  // The business default is always the smallest sellable unit when a product
  // has conditioning metadata. A lot is never selected implicitly.
  if (category?.nbPiecesParLot && options.includes("Pièce")) return "Pièce";
  return options.includes(baseUnit) ? baseUnit : (options[0] ?? product.unit);
}

export function toBaseSaleQty(sellQty: number, sellUnit: string, product: Product, boutique: Boutique): number {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  if (!category || category.nbPiecesParLot <= 0) return sellQty;

  const baseUnit = category.unitVente ?? product.unit;
  if (sellUnit === "Lot") {
    return normalizedUnit(baseUnit) === "piece"
      ? sellQty * category.nbPiecesParLot
      : sellQty * category.nbPiecesParLot * (category.longueurParPiece || 1);
  }
  if (sellUnit === "Pièce") {
    return normalizedUnit(baseUnit) === "piece"
      ? sellQty
      : sellQty * (category.longueurParPiece || 1);
  }
  return sellQty;
}

export function getSaleUnitLabel(product: Product, boutique: Boutique, sellUnit: string): string {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  if (!category) return sellUnit;
  if (sellUnit === "Lot") {
    const length = category.longueurParPiece > 0 ? ` × ${category.longueurParPiece} ${category.unitVente}` : "";
    return `Lot (${category.nbPiecesParLot} pièces${length})`;
  }
  if (sellUnit === "Pièce" && category.longueurParPiece > 0 && normalizedUnit(category.unitVente) !== "piece") {
    return `Pièce (${category.longueurParPiece} ${category.unitVente})`;
  }
  return sellUnit;
}

export function getLastSalePrice(productId: number, invoices: Invoice[], sellUnit: string): number | null {
  const targetUnit = normalizedUnit(sellUnit);
  const sorted = [...invoices]
    .filter(inv => inv.type.toLowerCase() !== "retour")
    .sort((a, b) => (b.dateRaw ?? b.date).localeCompare(a.dateRaw ?? a.date));

  for (const invoice of sorted) {
    const line = invoice.lines?.find(item => {
      if (item.productId !== productId || Number(item.prixUnit) <= 0) return false;
      return normalizedUnit(item.sellUnit ?? item.unit) === targetUnit;
    });
    if (line) return Number(line.prixUnit);
  }
  return null;
}
