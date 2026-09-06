import fs from "node:fs";
import assert from "node:assert/strict";
const app=fs.readFileSync("src/app/App.tsx","utf8");
assert.ok(app.includes("currentUser.isSuperAdmin\n      ? boutiques.map"), "SuperAdmin picker must enumerate every boutique");
assert.ok(app.includes("assignments={pickerAssignments}"), "Boutique picker must use the SuperAdmin-aware assignments");
assert.ok(app.includes("onSelect={currentUser.isSuperAdmin ? (selectedBoutique)=>handleEnterBoutiqueAsAdmin(selectedBoutique) : handleSelectBoutique}"), "SuperAdmin picker must use privileged boutique entry path");
assert.ok(app.includes("onClick={()=>setScreen(\"boutique-select\")}"), "Boutique header switch button must remain available inside a boutique");
console.log("SuperAdmin boutique switcher contract OK");
