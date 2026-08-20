from pathlib import Path

path = Path('src/app/App.tsx')
s = path.read_text()


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    s = s.replace(old, new, 1)

replace_once(
    'function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {',
    'function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void | Promise<void> }) {',
    'login callback type',
)
replace_once(
    '      onAuthenticated();\n',
    '      await onAuthenticated();\n',
    'await login transition',
)
replace_once(
    'function RequiredPasswordChangeScreen({ onComplete }: { onComplete: () => void }) {',
    'function RequiredPasswordChangeScreen({ onComplete }: { onComplete: () => void | Promise<void> }) {',
    'password change callback type',
)
replace_once(
    '    try { await changeOwnPassword(password); onComplete(); }\n',
    '    try { await changeOwnPassword(password); await onComplete(); }\n',
    'await password transition',
)
replace_once(
    'function PinSetupScreen({ onComplete }: { onComplete: () => void }) {',
    'function PinSetupScreen({ onComplete }: { onComplete: () => void | Promise<void> }) {',
    'pin setup callback type',
)
replace_once(
    '    try { await setQuickPin(pin); onComplete(); }\n',
    '    try { await setQuickPin(pin); await onComplete(); }\n',
    'await pin transition',
)
replace_once(
'''  if (screen==="login") return <LoginScreen onAuthenticated={() => void refreshAuthenticatedFlow()}/>;\n  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={() => void refreshAuthenticatedFlow()}/>;\n  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={() => void refreshAuthenticatedFlow()}/>;\n''',
'''  if (screen==="login") return <LoginScreen onAuthenticated={refreshAuthenticatedFlow}/>;\n  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={refreshAuthenticatedFlow}/>;\n  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={refreshAuthenticatedFlow}/>;\n''',
    'direct async auth callbacks',
)

path.write_text(s)
print('async auth UX follow-up applied')
