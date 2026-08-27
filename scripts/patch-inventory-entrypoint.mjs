import fs from "node:fs";

const path = "src/app/App.tsx";
let source = fs.readFileSync(path, "utf8");

const importAnchor = 'import { TransfersView as RelationalTransfersView } from "./screens/TransfersView";';
const inventoryImport = 'import { InventoryView as RelationalInventoryView } from "./screens/InventoryView";';

if (!source.includes(inventoryImport)) {
  if (!source.includes(importAnchor)) throw new Error("Inventory patch: import anchor not found");
  source = source.replace(importAnchor, `${importAnchor}\n${inventoryImport}`);
}

const legacyRender = "            <InventaireView\n";
const occurrences = source.split(legacyRender).length - 1;
if (occurrences !== 1) throw new Error(`Inventory patch: expected one legacy render, found ${occurrences}`);
source = source.replace(legacyRender, "            <RelationalInventoryView\n");

fs.writeFileSync(path, source);
console.log("Inventory entrypoint patched: relational InventoryView is now active.");
