from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
SOURCE = PUBLIC / 'brand' / 'tournal-mark-gold.jpg'

if not SOURCE.exists():
    raise SystemExit(f'Missing source logo: {SOURCE}')

img = Image.open(SOURCE).convert('RGB')
# Use a centered square crop so every browser/PWA surface gets the same mark.
side = min(img.size)
left = (img.width - side) // 2
top = (img.height - side) // 2
square = img.crop((left, top, left + side, top + side))

# Standard non-maskable icons.
for size, name in [
    (16, 'favicon-16.png'),
    (32, 'favicon-32.png'),
    (48, 'favicon-48.png'),
    (180, 'apple-touch-icon.png'),
    (192, 'icon-192.png'),
    (512, 'icon-512.png'),
]:
    icon = square.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(PUBLIC / name, format='PNG', optimize=True)

# Maskable icons: keep the logo inside the central safe zone and extend the
# edge/background from the source artwork, preventing Android launchers from
# clipping the mark into circles/squircles.
for size, name in [(192, 'icon-maskable-192.png'), (512, 'icon-maskable-512.png')]:
    bg = square.resize((size, size), Image.Resampling.LANCZOS)
    inner_size = round(size * 0.72)
    inner = square.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    x = (size - inner_size) // 2
    y = (size - inner_size) // 2
    bg.paste(inner, (x, y))
    bg.save(PUBLIC / name, format='PNG', optimize=True)

# Classic Windows/browser favicon bundle.
ico_sizes = [16, 32, 48]
ico = square.resize((48, 48), Image.Resampling.LANCZOS)
ico.save(PUBLIC / 'favicon.ico', format='ICO', sizes=[(s, s) for s in ico_sizes])

# Harden HTML metadata and provide compatibility fallbacks.
index = ROOT / 'index.html'
text = index.read_text()
text = text.replace(
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="shortcut icon" href="/favicon.ico" />'
)
text = text.replace(
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />\n    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />'
)
text = text.replace('<title><!-- figma:title --></title>', '<title>Tournal</title>')
index.write_text(text)

print('Generated production favicon/PWA icon set from', SOURCE)
