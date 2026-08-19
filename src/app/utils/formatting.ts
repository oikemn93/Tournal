export const fmt   = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " F";
// Times include seconds so every logged action carries a precise timestamp.
export const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const ini   = (n: string) => n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
export const nowStr = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const cleanPhone = (s: string) => s.replace(/[\s\-().]/g, "");

const GENERIC_IMGS = [
  "photo-1523275335684-37898b6baf30", // montre / produit générique
  "photo-1542291026-7eec264c27ff", // sneaker / article
  "photo-1585386959984-a4155224a1ad", // parfum / cosmétique
  "photo-1560472354-b33ff0c44a43", // boîte / colis produit
  "photo-1491553895911-0055eca6402d", // chaussure sport
  "photo-1441986300917-64674bd600d8", // vêtement boutique
  "photo-1606041008023-472dfb5e530f", // tissu / textil
  "photo-1547481887-a26e2cacb5b2", // sac à main
];
export function imgSrc(img: string | undefined | null, w = 400, h = 300, seed?: number): string {
  if (!img) {
    const idx = seed != null ? seed % GENERIC_IMGS.length : 0;
    return `https://images.unsplash.com/${GENERIC_IMGS[idx]}?w=${w}&h=${h}&fit=crop&auto=format`;
  }
  if (img.startsWith("data:") || img.startsWith("http")) return img;
  return `https://images.unsplash.com/${img}?w=${w}&h=${h}&fit=crop&auto=format`;
}

export function resizeImage(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.5));
    };
    img.src = url;
  });
}
