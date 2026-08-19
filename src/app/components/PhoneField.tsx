import React from "react";

export const DIAL_CODES = [
  { code: "+221", flag: "🇸🇳", name: "Sénégal" },
  { code: "+225", flag: "🇨🇮", name: "Côte d'Ivoire" },
  { code: "+223", flag: "🇲🇱", name: "Mali" },
  { code: "+224", flag: "🇬🇳", name: "Guinée" },
  { code: "+233", flag: "🇬🇭", name: "Ghana" },
  { code: "+226", flag: "🇧🇫", name: "Burkina Faso" },
  { code: "+228", flag: "🇹🇬", name: "Togo" },
  { code: "+229", flag: "🇧🇯", name: "Bénin" },
  { code: "+227", flag: "🇳🇪", name: "Niger" },
  { code: "+212", flag: "🇲🇦", name: "Maroc" },
  { code: "+213", flag: "🇩🇿", name: "Algérie" },
  { code: "+216", flag: "🇹🇳", name: "Tunisie" },
  { code: "+33",  flag: "🇫🇷", name: "France" },
  { code: "+32",  flag: "🇧🇪", name: "Belgique" },
  { code: "+41",  flag: "🇨🇭", name: "Suisse" },
  { code: "+1",   flag: "🇺🇸", name: "USA/Canada" },
];

export function PhoneField({ label, dialCode, setDialCode, phone, setPhone, inputCls }: {
  label: string; dialCode: string; setDialCode: (v: string) => void;
  phone: string; setPhone: (v: string) => void; inputCls: string
}) {
  return (
    <div>
      <label className="text-sm font-black mb-2 block tracking-wide" style={{ color: "#374151" }}>{label}</label>
      <div className="flex gap-2">
        <select value={dialCode} onChange={e => setDialCode(e.target.value)} className={inputCls} style={{ width: "90px", appearance: "none", flexShrink: 0 }}>
          {DIAL_CODES.map(d => <option key={d.code} value={d.code}>{d.flag} {d.code}</option>)}
        </select>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="77 000 0000" type="tel" className={inputCls + " flex-1"}/>
      </div>
    </div>
  );
}
