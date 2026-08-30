from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected block: {label}")
    return text.replace(old, new, 1)

# StockView
p = Path("src/app/screens/StockView.tsx")
s = p.read_text()
s = replace_once(
    s,
    'export function StockView({ boutique, onUpdate, logAction, initialFilter, initialSupplierId, initialEntryId, onInitialRoutePrepared }: {',
    'export function StockView({ boutique, onUpdate, logAction, initialFilter, initialSupplierId, initialEntryId, onInitialRoutePrepared, onReceiptSaved }: {',
    "StockView signature",
)
s = replace_once(
    s,
    '  onInitialRoutePrepared?: () => void;\n}) {',
    '  onInitialRoutePrepared?: () => void;\n  onReceiptSaved?: (supplierId: number) => void;\n}) {',
    "StockView callback prop",
)
s = replace_once(
    s,
    '    setReceiptSupplierId(null);\n  }',
    '    setReceiptSupplierId(null);\n    onReceiptSaved?.(supplier.id);\n  }',
    "StockView receipt completion",
)
p.write_text(s)

# FournisseursView
p = Path("src/app/screens/FournisseursView.tsx")
s = p.read_text()
s = replace_once(s, 'import React, { useState } from "react";', 'import React, { useEffect, useState } from "react";', "Fournisseurs import")
s = replace_once(
    s,
    'export function FournisseursView({ boutique, onUpdate, logAction, canPaySupplier, canManageReceipts, onStartReceipt, onCorrectReceipt, defaultPaymentTermsDays = 30 }: {',
    'export function FournisseursView({ boutique, onUpdate, logAction, canPaySupplier, canManageReceipts, onStartReceipt, onCorrectReceipt, initialSupplierId, onInitialSupplierOpened, defaultPaymentTermsDays = 30 }: {',
    "Fournisseurs signature",
)
s = replace_once(
    s,
    '  onCorrectReceipt: (entry: StockEntry, supplierId: number) => void;\n  defaultPaymentTermsDays?: number;',
    '  onCorrectReceipt: (entry: StockEntry, supplierId: number) => void;\n  initialSupplierId?: number;\n  onInitialSupplierOpened?: () => void;\n  defaultPaymentTermsDays?: number;',
    "Fournisseurs route props",
)
marker = '  const selectedSupplier = suppliers.find(supplier => supplier.id === selectedSupplierId) ?? null;\n'
insert = '''  useEffect(() => {\n    if (initialSupplierId == null || !suppliers.some(supplier => supplier.id === initialSupplierId)) return;\n    setSelectedSupplierId(initialSupplierId);\n    onInitialSupplierOpened?.();\n  }, [initialSupplierId, suppliers, onInitialSupplierOpened]);\n\n'''
s = replace_once(s, marker, insert + marker, "Fournisseurs initial route effect")
p.write_text(s)

# POSView
p = Path("src/app/screens/POSView.tsx")
s = p.read_text()
s = replace_once(
    s,
    '    setCart(prev => { const ex = prev.find(i => i.productId === addModal.id); if (ex) return prev.map(i => i.productId === addModal.id ? item : i); return [...prev, item]; });',
    '    setCart(prev => [...prev, item]);',
    "POS duplicate add",
)
s = replace_once(
    s,
    '  function removeFromCart(productId: number) { setCart(prev => prev.filter(i => i.productId !== productId)); }',
    '  function removeFromCart(lineIndex: number) { setCart(prev => prev.filter((_, index) => index !== lineIndex)); }',
    "POS remove line",
)
s = replace_once(s, '  function updateCartQty(productId: number, newDispQty: number) {', '  function updateCartQty(lineIndex: number, newDispQty: number) {', "POS update signature")
s = replace_once(s, '    if (newDispQty <= 0) { removeFromCart(productId); return; }', '    if (newDispQty <= 0) { removeFromCart(lineIndex); return; }', "POS remove zero")
s = replace_once(s, '    setCart(prev => prev.map(item => {\n      if (item.productId !== productId) return item;', '    setCart(prev => prev.map((item, index) => {\n      if (index !== lineIndex) return item;', "POS index update")
s = replace_once(s, '        const p = products.find(pr => pr.id === productId);', '        const p = products.find(pr => pr.id === item.productId);', "POS product lookup")
s = replace_once(s, '{cart.map(item => {', '{cart.map((item, lineIndex) => {', "POS cart map")
s = replace_once(s, '<div key={item.productId} className="flex items-center gap-3 bg-muted rounded-2xl p-3">', '<div key={`${item.productId}-${item.prixUnit}-${lineIndex}`} className="flex items-center gap-3 bg-muted rounded-2xl p-3">', "POS line key")
s = replace_once(s, 'onClick={()=>updateCartQty(item.productId, dQty-1)}', 'onClick={()=>updateCartQty(lineIndex, dQty-1)}', "POS decrement")
s = replace_once(s, 'onClick={()=>updateCartQty(item.productId, dQty+1)}', 'onClick={()=>updateCartQty(lineIndex, dQty+1)}', "POS increment")
s = replace_once(s, 'onClick={()=>removeFromCart(item.productId)}', 'onClick={()=>removeFromCart(lineIndex)}', "POS remove button")
s = replace_once(s, '                  const inCart=cart.find(i=>i.productId===p.id);', '                  const matchingLines=cart.filter(i=>i.productId===p.id);\n                  const inCart=matchingLines[0];', "POS inline summary")
s = replace_once(s, '{inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>× {inCart.qty} ✓</p>}', '{inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>{matchingLines.length} ligne{matchingLines.length>1?"s":""} ✓</p>}', "POS inline count")
p.write_text(s)

# App wiring
p = Path("src/app/App.tsx")
s = p.read_text()
s = replace_once(
    s,
    'initialEntryId={navFilter.stockEntryId?Number(navFilter.stockEntryId):undefined} onInitialRoutePrepared={()=>setNavFilter({})}/>',
    'initialEntryId={navFilter.stockEntryId?Number(navFilter.stockEntryId):undefined} onInitialRoutePrepared={()=>setNavFilter({})} onReceiptSaved={(supplierId)=>{setNavFilter({supplierDetailId:String(supplierId)});setTab("fournisseurs");}}/>',
    "App stock callback",
)
s = replace_once(
    s,
    'onCorrectReceipt={(entry,supplierId)=>{setNavFilter({supplierId:String(supplierId),stockEntryId:String(entry.id)});setTab("stock");}} defaultPaymentTermsDays={supplierPaymentTermsDays}/>',
    'onCorrectReceipt={(entry,supplierId)=>{setNavFilter({supplierId:String(supplierId),stockEntryId:String(entry.id)});setTab("stock");}} initialSupplierId={navFilter.supplierDetailId?Number(navFilter.supplierDetailId):undefined} onInitialSupplierOpened={()=>setNavFilter({})} defaultPaymentTermsDays={supplierPaymentTermsDays}/>',
    "App supplier reopen",
)
p.write_text(s)
