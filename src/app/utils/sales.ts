import type { Boutique, Invoice, Product } from "../types";

function normalizedUnit(value?: string): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "piece" || raw === "pièce" || raw === "pieces" || raw === "pièces") return "piece";
  if (raw === "metre" || raw === "mètre" || raw === "metres" || raw === "mètres") return "metres";
  return raw;
}

export function getSaleUnitOptions(product: Product, boutique: Boutique): string[] {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  if (!category || category.nbPiecesParLot <= 0) return [product.unit];

  const options = ["Lot", "Pièce"];
  const baseUnit = category.unitVente || product.unit;
  if (normalizedUnit(baseUnit) !== "piece") options.push(baseUnit);
  return options;
}

export function getDefaultSaleUnit(product: Product, boutique: Boutique): string {
  const category = (boutique.categories ?? []).find(c => c.nom === product.categorie);
  const baseUnit = category?.unitVente ?? product.unit;
  const options = getSaleUnitOptions(product, boutique);
  const normalizedBase = normalizedUnit(baseUnit);

  if (normalizedBase === "piece" && options.includes("Pièce")) return "Pièce";
  if (["yards", "metres"].includes(normalizedBase) && options.includes(baseUnit)) return baseUnit;
  if (options.includes("Pièce")) return "Pièce";
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
