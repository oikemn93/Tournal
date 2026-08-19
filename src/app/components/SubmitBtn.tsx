import React from "react";

export function SubmitBtn({ color = "#C9A227", label, onClick, disabled }: { color?: string; label: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="w-full py-5 rounded-2xl text-lg font-black active:scale-95 mt-2"
    style={{ background:disabled?"#c7bfa0":color, color:"#fff", fontFamily:"'Nunito', sans-serif", opacity:disabled?0.5:1 }}>✓ {label}</button>;
}
