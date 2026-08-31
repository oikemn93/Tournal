import fs from 'node:fs';

const path = 'src/app/App.tsx';
let source = fs.readFileSync(path, 'utf8');

const importAnchor = 'import { SuperAdminUserActions } from "./components/SuperAdminUserActions";';
const importLine = 'import { TournalOps } from "./components/TournalOps";';
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('SuperAdminUserActions import anchor not found');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const legacyName = 'function LegacySuperAdminScreen(';
const currentName = 'function SuperAdminScreen(';
if (!source.includes(legacyName)) {
  if (!source.includes(currentName)) throw new Error('SuperAdminScreen declaration not found');
  source = source.replace(currentName, legacyName);
}

const wrapperMarker = 'function SuperAdminScreen(props: React.ComponentProps<typeof LegacySuperAdminScreen>) {';
if (!source.includes(wrapperMarker)) {
  const legacyIndex = source.indexOf(legacyName);
  if (legacyIndex < 0) throw new Error('LegacySuperAdminScreen insertion point not found');
  const wrapper = `function SuperAdminScreen(props: React.ComponentProps<typeof LegacySuperAdminScreen>) {\n  const [showSystemAdmin, setShowSystemAdmin] = useState(false);\n  if (showSystemAdmin) {\n    return <div className="relative">\n      <button type="button" onClick={()=>setShowSystemAdmin(false)} className="fixed right-3 top-3 z-[100] rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-lg">← Tournal Ops</button>\n      <LegacySuperAdminScreen {...props}/>\n    </div>;\n  }\n  return <TournalOps\n    boutiques={props.boutiques}\n    users={props.platformUsers}\n    onOpenBoutique={(boutiqueId)=>{ const boutique = props.boutiques.find(item=>item.id===boutiqueId); if (boutique) props.onEnterBoutique(boutique); }}\n    onSystem={()=>setShowSystemAdmin(true)}\n  />;\n}\n\n`;
  source = source.slice(0, legacyIndex) + wrapper + source.slice(legacyIndex);
}

fs.writeFileSync(path, source);
console.log('Tournal Ops wired into SuperAdminScreen');
