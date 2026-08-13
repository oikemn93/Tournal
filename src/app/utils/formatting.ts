export const fmt   = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " F";
export const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const ini   = (n: string) => n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
export const nowStr = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const cleanPhone = (s: string) => s.replace(/[\s\-().]/g, "");

export function imgSrc(img: string, w = 400, h = 300): string {
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
