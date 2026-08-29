from pathlib import Path
p=Path('src/lib/api.ts')
s=p.read_text()
s=s.replace('}>("rpc/refund_client_advance", {','}>("rpc/refund_client_credit_fifo", {')
s=s.replace('      p_idempotency_key:crypto.randomUUID(),\n    }),\n  });\n}\n\nexport async function recordStockMovement', '      p_idempotency_key:crypto.randomUUID(),\n      p_note:"Remboursement avoir client",\n    }),\n  });\n}\n\nexport async function recordStockMovement', 1)
p.write_text(s)
