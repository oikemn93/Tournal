// One-shot branch patcher; removed before merge.
import fs from "node:fs";

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return text.replace(from, to);
}

const stockPath = "src/app/screens/StockView.tsx";
let stock = fs.readFileSync(stockPath, "utf8");
stock = replaceRequired(stock,'export function StockView({ boutique, onUpdate, logAction, initialFilter, initialSupplierId, initialEntryId, onInitialRoutePrepared, onReceiptSaved }: {','export function StockView({ boutique, onUpdate, logAction, canSeeMargin, initialFilter, initialSupplierId, initialEntryId, onInitialRoutePrepared, onReceiptSaved }: {',"StockView signature");
stock = replaceRequired(stock,'  logAction: (action: string, detail: string, icon: string) => void;\n  initialFilter?: string;','  logAction: (action: string, detail: string, icon: string) => void;\n  canSeeMargin: boolean;\n  initialFilter?: string;',"StockView prop type");
stock = replaceRequired(stock,'  async function saveProductEdit() {\n    const purchasePrice = Number(editPrixAchat);\n    if (!detail || !editNom.trim() || !Number.isFinite(purchasePrice) || purchasePrice < 0 || savingProduct) return;','  async function saveProductEdit() {\n    const purchasePrice = canSeeMargin ? Number(editPrixAchat) : undefined;\n    if (!detail || !editNom.trim() || (canSeeMargin && (!Number.isFinite(purchasePrice) || Number(purchasePrice) < 0)) || savingProduct) return;',"save product validation");
stock = replaceRequired(stock,'        categoryId:editCat ? category?.id : null,\n        purchasePrice,\n      });\n      const updated = { ...detail, nom:editNom.trim(), categorie:editCat || undefined, prixAchat:purchasePrice };','        categoryId:editCat ? category?.id : null,\n        ...(canSeeMargin ? { purchasePrice: Number(purchasePrice) } : {}),\n      });\n      const updated = { ...detail, nom:editNom.trim(), categorie:editCat || undefined, ...(canSeeMargin ? { prixAchat:Number(purchasePrice) } : {}) };',"save product payload");
stock = replaceRequired(stock,'setEditPrixAchat(String(detail.prixAchat ?? 0));','setEditPrixAchat(canSeeMargin ? String(detail.prixAchat ?? 0) : "");',"edit product opener");
stock = replaceRequired(stock,'              <Field label="PRIX D\'ACHAT UNITAIRE">\n                <input value={editPrixAchat} onChange={e => setEditPrixAchat(e.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" className={inputCls}/>\n              </Field>\n              <p className="text-xs text-muted-foreground">Ce prix sera utilisé pour les prochains mouvements ; les mouvements déjà enregistrés restent inchangés.</p>\n              <SubmitBtn color={boutique.color} label={savingProduct ? "Enregistrement…" : "Enregistrer les modifications"} onClick={saveProductEdit} disabled={!editNom.trim() || !Number.isFinite(Number(editPrixAchat)) || Number(editPrixAchat) < 0 || savingProduct}/>','              {canSeeMargin && <>\n                <Field label="PRIX D\'ACHAT UNITAIRE">\n                  <input value={editPrixAchat} onChange={e => setEditPrixAchat(e.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" className={inputCls}/>\n                </Field>\n                <p className="text-xs text-muted-foreground">Ce prix sera utilisé pour les prochains mouvements ; les mouvements déjà enregistrés restent inchangés.</p>\n              </>}\n              <SubmitBtn color={boutique.color} label={savingProduct ? "Enregistrement…" : "Enregistrer les modifications"} onClick={saveProductEdit} disabled={!editNom.trim() || (canSeeMargin && (!Number.isFinite(Number(editPrixAchat)) || Number(editPrixAchat) < 0)) || savingProduct}/>',"edit purchase price field");
fs.writeFileSync(stockPath, stock);

const apiPath = "src/lib/api.ts";
let api = fs.readFileSync(apiPath, "utf8");
api = replaceRequired(api,'export async function updateProduct(params:{ boutiqueId:string; productId:number; name:string; categoryId?:string|null; purchasePrice:number }) {\n  const body: Record<string, unknown> = { nom:params.name, prix_achat:params.purchasePrice };\n  if (params.categoryId !== undefined) body.category_id = params.categoryId;','export async function updateProduct(params:{ boutiqueId:string; productId:number; name:string; categoryId?:string|null; purchasePrice?:number }) {\n  const body: Record<string, unknown> = { nom:params.name };\n  if (params.purchasePrice !== undefined) body.prix_achat = params.purchasePrice;\n  if (params.categoryId !== undefined) body.category_id = params.categoryId;',"updateProduct optional purchase price");
fs.writeFileSync(apiPath, api);

const appPath = "src/app/App.tsx";
let app = fs.readFileSync(appPath, "utf8");
app = replaceRequired(app,'<RelationalStockView boutique={boutique} onUpdate={updateBoutique}','<RelationalStockView boutique={boutique} canSeeMargin={canSeeMargin} onUpdate={updateBoutique}',"App StockView prop");
fs.writeFileSync(appPath, app);
