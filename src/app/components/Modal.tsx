import React from "react";
import { X } from "lucide-react";

export function Modal({ title, color, onClose, children }: { title: string; color: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background:"rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-x border-border"
        style={{ boxShadow:`0 -8px 40px ${color}22`, marginBottom:"60px" }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif", color }}>{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"#EEE9D8" }}>
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 overflow-y-auto pb-4" style={{ maxHeight:"65vh", scrollbarWidth:"none" }}>{children}</div>
      </div>
    </div>
  );
}
