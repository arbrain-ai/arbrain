"""Compone el video de evidencia del fantasma desde su traza REAL (fantasma-traza.ts):
fondo = captura de la ventana; cursor = sprite de la app; onda = anillo morado en cada clic.
python3 render-fantasma.py <dir>  →  antes.mp4, despues.mp4, antes-vs-despues.mp4 y metricas.json"""
import json, os, subprocess, sys, math, tempfile
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1]
datos = json.load(open(os.path.join(d, 'traza.json')))
fondo0 = Image.open(os.path.join(d, 'ventana.png')).convert('RGBA')
sprite = Image.open(os.path.join(d, 'sprite.png')).convert('RGBA')
win = datos['ventana']
esc = fondo0.width / win['w']            # píxeles por punto (2 en Retina)
M = 70                                   # margen en puntos
W, H = int((win['w'] + 2 * M) * esc), int((win['h'] + 2 * M) * esc)
W -= W % 2; H -= H % 2
PUNTA = (44, 36)                         # punta del sprite (px, sprite a 2×)
spr = sprite.resize((int(sprite.width * esc / 2), int(sprite.height * esc / 2)))
pk = (PUNTA[0] * esc / 2, PUNTA[1] * esc / 2)
MORADO = (0x8C, 0x27, 0xF1)
FPS = 60

def lienzo():
    c = Image.new('RGBA', (W, H), (24, 22, 30, 255))
    c.alpha_composite(fondo0, (int(M * esc), int(M * esc)))
    return c

def metricas(tr):
    saltos = [math.dist(tr[i][1:3], tr[i - 1][1:3]) for i in range(1, len(tr)) if tr[i][3] > 0.05 and tr[i][0] - tr[i - 1][0] < 0.05]
    vel = [s / max(1e-3, tr[i + 1][0] - tr[i][0]) for i, s in enumerate(saltos)]
    return {'muestras': len(tr), 'salto_max_pt_por_cuadro': round(max(saltos or [0]), 1),
            'teletransportes_>40pt': sum(1 for s in saltos if s > 40), 'clics': sum(1 for x in tr if x[4] == 1)}

def render(tr, salida, titulo):
    if not tr: return
    t0, t1 = tr[0][0] - 0.2, tr[-1][0] + 0.6
    tmp = tempfile.mkdtemp()
    pulsos = [x[0] for x in tr if x[4] == 1]
    n = int((t1 - t0) * FPS)
    i = 0
    fuente = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', int(15 * esc)) if os.path.exists('/System/Library/Fonts/SFNS.ttf') else None
    for k in range(n):
        t = t0 + k / FPS
        while i + 1 < len(tr) and tr[i + 1][0] <= t: i += 1
        c = lienzo(); dr = ImageDraw.Draw(c)
        for tp in pulsos:
            e = t - tp
            if 0 <= e <= 0.45:
                s = tr[min(range(len(tr)), key=lambda j: abs(tr[j][0] - tp))]
                cx, cy = (s[1] - win['x'] + M) * esc, (s[2] - win['y'] + M) * esc
                for anillo in (0, 0.12):
                    ee = e - anillo
                    if ee < 0: continue
                    r = (6 + 34 * (ee / 0.45)) * esc; a = int(200 * (1 - ee / 0.45))
                    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=MORADO + (a,), width=int(3 * esc))
        x = tr[i]
        if tr[0][0] <= t and x[3] > 0.02:
            px, py = (x[1] - win['x'] + M) * esc - pk[0], (x[2] - win['y'] + M) * esc - pk[1]
            s2 = spr.copy(); s2.putalpha(s2.getchannel('A').point(lambda v: int(v * min(1, x[3]))))
            c.alpha_composite(s2, (int(px), int(py)))
        dr.text((16 * esc / 2, 10 * esc / 2), titulo, fill=(235, 230, 245, 255), font=fuente)
        c.convert('RGB').save(os.path.join(tmp, f'{k:05d}.png'))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(tmp, '%05d.png'), '-pix_fmt', 'yuv420p', '-vcodec', 'libx264', '-crf', '22', salida], check=True)

res = {}
for estilo, nombre, titulo in [('antes', 'antes.mp4', 'ANTES: salta en cada lectura y clic (0.16 s, línea recta)'), ('humano', 'despues.mp4', 'DESPUÉS: Bézier + Fitts, hover, reposo, en orden')]:
    tr = datos[estilo]['traza']
    res[estilo] = {**metricas(tr), 'accion_ms': datos[estilo]['acciones_ms']}
    render(tr, os.path.join(d, nombre), titulo)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(d, 'antes.mp4'), '-i', os.path.join(d, 'despues.mp4'), '-filter_complex', '[0:v][1:v]hstack=inputs=2:shortest=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', os.path.join(d, 'antes-vs-despues.mp4')], check=False)
json.dump(res, open(os.path.join(d, 'metricas.json'), 'w'), indent=2)
print(json.dumps(res, indent=2))
