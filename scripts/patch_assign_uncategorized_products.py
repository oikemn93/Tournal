from pathlib import Path

p=Path('src/lib/api.ts')
s=p.read_text()
marker='export async function updateProduct(params:{ boutiqueId:string; productId:number; name:string; categoryId?:string|null; purchasePrice:number }) {'
insert='''export async function updateProductCategory(params:{ boutiqueId:string; productId:number; categoryId:string|null }) {\n  const updated = await dataRequest<Array<{ id:number }>>(`products?id=eq.${params.productId}&boutique_id=eq.${encodeURIComponent(params.boutiqueId)}&select=id`, {\n    method:"PATCH", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ category_id:params.categoryId }),\n  });\n  if (updated.length !== 1) throw new Error("Catégorie du produit non modifiée");\n}\n\n'''
if marker not in s: raise SystemExit('updateProduct marker not found')
s=s.replace(marker,insert+marker,1)
p.write_text(s)

p=Path('src/app/App.tsx')
s=p.read_text()
old='createCategory, updateCategory, deleteCategory, type BoutiqueSyncEvent'
new='createCategory, updateCategory, deleteCategory, updateProductCategory, type BoutiqueSyncEvent'
if old not in s: raise SystemExit('import marker not found')
s=s.replace(old,new,1)
marker='  const productsWithoutCat = products.filter(p => !p.categorie);\n'
insert='''  async function assignProductToCategory(product: Product, categoryId: string) {\n    const category = cats.find(cat => cat.id === categoryId);\n    if (!category) return;\n    try {\n      await updateProductCategory({ boutiqueId:boutique.id, productId:product.id, categoryId:category.id });\n      onUpdate({ products: products.map(item => item.id === product.id ? { ...item, categorie:category.nom } : item) });\n      logAction("Produit catégorisé", `${product.nom} → ${category.nom}`, "📂");\n      toast.success(`${product.nom} ajouté à ${category.nom}`);\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : "Affectation à la catégorie impossible");\n    }\n  }\n\n'''
if marker not in s: raise SystemExit('productsWithoutCat marker not found')
s=s.replace(marker,insert+marker,1)
old='''                  <p className="text-sm font-semibold flex-1">{p.nom}</p>\n                  <span className="text-xs text-muted-foreground">{p.unit}</span>\n                </div>'''
new='''                  <div className="flex-1 min-w-0">\n                    <p className="text-sm font-semibold truncate">{p.nom}</p>\n                    <p className="text-xs text-muted-foreground">{p.unit}</p>\n                  </div>\n                  <select defaultValue="" onChange={(event) => { const categoryId = event.target.value; if (categoryId) void assignProductToCategory(p, categoryId); }} className="max-w-[180px] rounded-xl border border-border bg-background px-2 py-2 text-xs font-bold" aria-label={`Ajouter ${p.nom} à une catégorie`}>\n                    <option value="" disabled>Ajouter à…</option>\n                    {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.nom}</option>)}\n                  </select>\n                </div>'''
start=s.index('{productsWithoutCat.map(p => (')
idx=s.find(old,start)
if idx<0: raise SystemExit('uncategorized row not found')
s=s[:idx]+new+s[idx+len(old):]
p.write_text(s)
