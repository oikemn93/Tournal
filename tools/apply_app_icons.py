from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
SOURCE = PUBLIC / 'brand' / 'tournal-mark-gold.jpg'

img = Image.open(SOURCE).convert('RGB')
side = min(img.size)
left = (img.width - side) // 2
top = (img.height - side) // 2
square = img.crop((left, top, left + side, top + side))

for size, name in [(16,'favicon-16.png'),(32,'favicon-32.png'),(48,'favicon-48.png'),(180,'apple-touch-icon.png'),(192,'icon-192.png'),(512,'icon-512.png')]:
    square.resize((size,size), Image.Resampling.LANCZOS).save(PUBLIC / name, 'PNG', optimize=True)

for size, name in [(192,'icon-maskable-192.png'),(512,'icon-maskable-512.png')]:
    bg = square.resize((size,size), Image.Resampling.LANCZOS)
    inner_size = round(size * 0.72)
    inner = square.resize((inner_size,inner_size), Image.Resampling.LANCZOS)
    bg.paste(inner, ((size-inner_size)//2, (size-inner_size)//2))
    bg.save(PUBLIC / name, 'PNG', optimize=True)

square.resize((48,48), Image.Resampling.LANCZOS).save(PUBLIC / 'favicon.ico', 'ICO', sizes=[(16,16),(32,32),(48,48)])

index = ROOT / 'index.html'
text = index.read_text()
if '<link rel="shortcut icon" href="/favicon.ico" />' not in text:
    text = text.replace('<link rel="manifest" href="/manifest.webmanifest" />','<link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="shortcut icon" href="/favicon.ico" />')
if 'sizes="48x48"' not in text:
    text = text.replace('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />','<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />\n    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />')
text = text.replace('<title><!-- figma:title --></title>', '<title>Tournal</title>')
index.write_text(text)
