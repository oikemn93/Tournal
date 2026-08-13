import React from "react";

export function Field({ label, color = "#374151", children }: { label: string; color?: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-black mb-2 block tracking-wide" style={{ color }}>{label}</label>{children}</div>;
}
