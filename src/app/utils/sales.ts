import type { Boutique, Invoice, Product } from "../types";

function normalizedUnit(value?: string): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "piece" || raw === "pièce" || raw === "pieces" || raw === "pièces") return "piece";
  if (raw === "metre" || raw === "mètre" || raw === "metres" || raw === "mètres") return "metres";
  return raw;
}

function getProductSaleConfig(product: Product, boutique: Boutique) {
  const productParam = (boutique.productParams ?? []).find(param => param.productId === product.id);
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  return {
    unitVente: productParam?.unitVente?.trim() || category?.unitVente || product.unit,
    nbPiecesParLot: productParam?.nbPiecesParLot ?? category?.nbPiecesParLot ?? 0,
    longueurParPiece: productParam?.longueurParPiece ?? category?.longueurParPiece ?? 0,
  };
}

/**
 * Conditioning options shared by every selling surface.
 * Product-level sale settings take priority over category defaults.
 */
export function getSaleUnitOptions(product: Product, boutique: Boutique): string[] {
  const config = getProductSaleConfig(product, boutique);
  if (config.nbPiecesParLot <= 0) return [config.unitVente || product.unit];

  const baseUnit = config.unitVente || product.unit;
  const options = ["Pièce", "Lot"];
  if (normalizedUnit(baseUnit) !== "piece" && normalizedUnit(baseUnit) !== "lot") options.push(baseUnit);
  return Array.from(new Set(options));
}

export function getDefaultSaleUnit(product: Product, boutique: Boutique): string {
  const config = getProductSaleConfig(product, boutique);
  const options = getSaleUnitOptions(product, boutique);
  const preferredUnit = config.unitVente || product.unit;

  const exact = options.find(option => normalizedUnit(option) === normalizedUnit(preferredUnit));
  if (exact) return exact;
  return options[0] ?? product.unit;
}

export function toBaseSaleQty(sellQty: number, sellUnit: string, product: Product, boutique: Boutique): number {
  const config = getProductSaleConfig(product, boutique);
  if (config.nbPiecesParLot <= 0) return sellQty;

  const baseUnit = config.unitVente || product.unit;
  if (sellUnit === "Lot") {
    return normalizedUnit(baseUnit) === "piece"
      ? sellQty * config.nbPiecesParLot
      : sellQty * config.nbPiecesParLot * (config.longueurParPiece || 1);
  }
  if (sellUnit === "Pièce") {
    return normalizedUnit(baseUnit) === "piece"
      ? sellQty
      : sellQty * (config.longueurParPiece || 1);
  }
  return sellQty;
}

export function getSaleUnitLabel(product: Product, boutique: Boutique, sellUnit: string): string {
  const config = getProductSaleConfig(product, boutique);
  if (sellUnit === "Lot") {
    const length = config.longueurParPiece > 0 ? ` × ${config.longueurParPiece} ${config.unitVente}` : "";
    return `Lot (${config.nbPiecesParLot} pièces${length})`;
  }
  if (sellUnit === "Pièce" && config.longueurParPiece > 0 && normalizedUnit(config.unitVente) !== "piece") {
    return `Pièce (${config.longueurParPiece} ${config.unitVente})`;
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
