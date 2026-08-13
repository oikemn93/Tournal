import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

/** Convertit un numéro de téléphone en email technique Supabase Auth */
export function phoneToEmail(phone: string): string {
  return phone.replace(/\D/g, "") + "@tournal.internal";
}
