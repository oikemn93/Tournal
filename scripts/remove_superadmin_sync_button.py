from pathlib import Path

p = Path('src/app/App.tsx')
s = p.read_text()

s = s.replace(', onResetBackend, onLogout, backendOk, saveState', ', onLogout, backendOk, saveState', 1)
s = s.replace('  onResetBackend: () => Promise<void>;\n', '', 1)

button = '''          <button onClick={onResetBackend}\n            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"\n            style={{ background: saveState==="saving"?"#fef9c3":saveState==="saved"?"#dcfce7":saveState==="error"||backendOk===false?"#fee2e2":"#f0fdf4", color: saveState==="saving"?"#854d0e":saveState==="saved"?"#166534":saveState==="error"||backendOk===false?"#991b1b":"#166534" }}>\n            {saveState==="saving"?"⟳ Sync…":saveState==="saved"?"✓ Synced":saveState==="error"?"✗ Réessayer":backendOk===false?"✗ Sync":"● Backend"}\n          </button>\n'''
if button not in s:
    raise SystemExit('superadmin sync button anchor not found')
s = s.replace(button, '', 1)

s = s.replace('      onResetBackend={handleResetBackend}\n', '', 1)

p.write_text(s)
print('removed superadmin sync backend button and prop wiring')
