import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert.equal(count, 1, `${label}: expected exactly one anchor, got ${count}`);
  return source.replace(from, to);
}

{
  const path = 'src/app/screens/POSView.tsx';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceOnce(src,
    '    setCart(prev => [...prev, item]);',
    `    setCart(prev => {\n      const matchIndex = prev.findIndex(existing =>\n        existing.productId === item.productId\n        && (existing.sellUnit ?? existing.unit) === (item.sellUnit ?? item.unit)\n        && Math.abs(existing.prixUnit - item.prixUnit) < 0.000001\n      );\n      if (matchIndex < 0) return [...prev, item];\n      return prev.map((existing, index) => {\n        if (index !== matchIndex) return existing;\n        if (existing.sellUnit && existing.sellQty !== undefined && item.sellUnit && item.sellQty !== undefined) {\n          return { ...existing, qty:existing.qty + item.qty, sellQty:existing.sellQty + item.sellQty };\n        }\n        return { ...existing, qty:existing.qty + item.qty };\n      });\n    });`,
    'POS identical-line merge');
  fs.writeFileSync(path, src);
}

{
  const path = 'src/app/screens/ClientsView.tsx';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceOnce(src,
    '              const canCancel = canCancelPendingOrder && (canManageAnyPendingOrder || inv.operatorId === currentUser.id) && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;',
    '              const canCancel = canCancelPendingOrder && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;',
    'Clients cancellation permission');
  src = replaceOnce(src,
    '                  {deliveryPending&&canCreateOrder&&<button type="button" onClick={()=>void confirmDelivery(inv)} disabled={confirmingDeliveryId!==null} className="rounded-lg bg-amber-50 px-2 py-2 text-[11px] font-black text-amber-800 disabled:opacity-50" title="Confirmer la livraison et déduire le stock">{confirmingDeliveryId===inv.id?"Confirmation…":"📦 Livrer"}</button>}\n',
    '', 'obsolete client delivery list action');
  src = replaceOnce(src,
    '          {viewedInvoice.origin==="client_profile"&&viewedInvoice.type.toLowerCase()!=="retour"&&viewedInvoice.status!=="annulée"&&!viewedInvoice.stockDeductedAt&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-black text-amber-900">📦 Livraison non confirmée</p><p className="mt-1 text-xs text-amber-800">Le stock n\'est pas encore déduit. Le paiement reste indépendant de la livraison.</p>{canCreateOrder&&<button type="button" onClick={()=>void confirmDelivery(viewedInvoice)} disabled={confirmingDeliveryId!==null} className="mt-2 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-black text-white disabled:opacity-50">{confirmingDeliveryId===viewedInvoice.id?"Confirmation…":"Confirmer la livraison et déduire le stock"}</button>}</div>}\n',
    '', 'obsolete client delivery detail action');
  src = replaceOnce(src,
    '          {canReturn && viewedInvoice.type.toLowerCase() !== "retour" && viewedInvoice.status !== "annulée" && invoicePaidAmount(viewedInvoice) > 0 && (viewedInvoice.lines?.length ?? 0) > 0 && invoiceHasReturnable(viewedInvoice) && <button type="button" onClick={()=>startClientReturn(viewedInvoice)} className="w-full rounded-xl bg-red-50 py-3 text-sm font-black text-red-700 inline-flex items-center justify-center gap-2"><RotateCcw size={16}/> Retourner des articles</button>}',
    '          {canReturn && viewedInvoice.type.toLowerCase() !== "retour" && viewedInvoice.status !== "annulée" && !!viewedInvoice.stockDeductedAt && invoicePaidAmount(viewedInvoice) > 0 && (viewedInvoice.lines?.length ?? 0) > 0 && invoiceHasReturnable(viewedInvoice) && <button type="button" onClick={()=>startClientReturn(viewedInvoice)} className="w-full rounded-xl bg-red-50 py-3 text-sm font-black text-red-700 inline-flex items-center justify-center gap-2"><RotateCcw size={16}/> Retourner des articles</button>}',
    'Client return predicate');
  assert.ok(!src.includes('confirmDelivery('), 'stale confirmDelivery reference remains');
  assert.ok(!src.includes('deliveryPending&&'), 'stale deliveryPending reference remains');
  fs.writeFileSync(path, src);
}

{
  const path = 'supabase/functions/create-invoice-share/index.ts';
  let src = fs.readFileSync(path, 'utf8');
  const anchor = [
    '    const { data: existing, error: listErr } = await admin.storage.from(BUCKET).list(safeFolder, { limit: 1000 });',
    '    if (listErr) throw listErr;',
    '    const oldPaths = (existing ?? []).filter((entry) => entry.name.startsWith(`${safeRef}-`) && entry.name.endsWith(".pdf")).map((entry) => `${safeFolder}/${entry.name}`);',
    '    if (oldPaths.length) {',
    '      const { error } = await admin.storage.from(BUCKET).remove(oldPaths);',
    '      if (error) throw error;',
    '    }',
    '    await admin.from("document_shares").delete().eq("boutique_id", boutiqueId).eq("document_type", documentType).eq("document_ref", documentRef);',
    '',
    '    const path = `${safeFolder}/${safeRef}-${crypto.randomUUID()}.pdf`;',
  ].join('\n');
  const replacement = [
    '    const { data: existing, error: listErr } = await admin.storage.from(BUCKET).list(safeFolder, { limit: 1000 });',
    '    if (listErr) throw listErr;',
    '    const oldPaths = (existing ?? []).filter((entry) => entry.name.startsWith(`${safeRef}-`) && entry.name.endsWith(".pdf")).map((entry) => `${safeFolder}/${entry.name}`);',
    '',
    '    const path = `${safeFolder}/${safeRef}-${crypto.randomUUID()}.pdf`;',
  ].join('\n');
  src = replaceOnce(src, anchor, replacement, 'share publish-before-revoke');
  src = replaceOnce(src,
    '    if (shareErr) {\n      await admin.storage.from(BUCKET).remove([path]);\n      throw shareErr;\n    }\n\n    return reply({ url: `${PUBLIC_APP_URL}/d/${token}`, expires_at: expiresAt });',
    '    if (shareErr) {\n      await admin.storage.from(BUCKET).remove([path]);\n      throw shareErr;\n    }\n\n    await admin.from("document_shares").delete().eq("boutique_id", boutiqueId).eq("document_type", documentType).eq("document_ref", documentRef).neq("token_hash", tokenHash);\n    if (oldPaths.length) {\n      const { error: cleanupErr } = await admin.storage.from(BUCKET).remove(oldPaths.filter(oldPath => oldPath !== path));\n      if (cleanupErr) console.warn("create-invoice-share old document cleanup", cleanupErr);\n    }\n\n    return reply({ url: `${PUBLIC_APP_URL}/d/${token}`, expires_at: expiresAt });',
    'share cleanup after publish');
  fs.writeFileSync(path, src);
}

console.log('Regression repair patch applied.');
