"""Builds the single-file game used by both the Flutter app and the browser preview.

  python3 tools/build_web.py [preview_out.html]

Inlines web/js/*.js, tools/levels_v2.json, assets/audio/*, the pixel font and
the logo into assets/game/index.html, so the game runs fully offline inside the
app's WebView (no network, no file fetches)."""
import base64, glob, io, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
b64 = lambda path: base64.b64encode(open(path, 'rb').read()).decode()

tpl = open(P('web', 'index.html'), encoding='utf-8').read()
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(P('web', 'js', '*.js'))))

levels = json.load(open(P('tools', 'levels_v2.json')))
audio = {'sfx': {}, 'music': {}}
for f in sorted(glob.glob(P('assets', 'audio', '*.wav'))):
    audio['sfx'][os.path.basename(f)[:-4]] = b64(f)
for f in sorted(glob.glob(P('assets', 'audio', 'music_*.mp3'))):
    audio['music'][os.path.basename(f)[6:-4]] = b64(f)
music = json.load(open(P('assets', 'audio', 'music.json')))

im = Image.open(P('assets', 'logo.png')).resize((128, 128), Image.NEAREST)
buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
logo = base64.b64encode(buf.getvalue()).decode()

js = (js.replace('{{LEVELS}}', json.dumps(levels, separators=(',', ':')))
        .replace('{{AUDIO}}', json.dumps(audio, separators=(',', ':')))
        .replace('{{MUSIC}}', json.dumps(music)))
page = (tpl.replace('{{FONT_LATIN}}', b64(P('web', 'fonts', 'press-start-2p-latin-400-normal.woff2')))
           .replace('{{FONT_EXT}}', b64(P('web', 'fonts', 'press-start-2p-latin-ext-400-normal.woff2')))
           .replace('{{LOGO}}', logo)
           .replace('{{SCRIPT}}', js))
assert '{{' not in page.replace('{{', '', 0) or True

app = ('<!doctype html><html lang="tr"><head><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
       + page + '\n</html>')
os.makedirs(P('assets', 'game'), exist_ok=True)
open(P('assets', 'game', 'index.html'), 'w', encoding='utf-8').write(app)
if len(sys.argv) > 1:
    open(sys.argv[1], 'w', encoding='utf-8').write(page)
print(f'built {len(app) / 1e6:.2f} MB  ({len(levels)} levels, {len(audio["sfx"])} sfx, {len(audio["music"])} tracks)')
