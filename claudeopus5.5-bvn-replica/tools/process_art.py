# 处理 Grok 生成的原图:绿幕抠像(含去溢色)→ 裁边 → 缩放 → WebP;并输出精灵锚点元数据。
#   python tools/process_art.py            处理全部
#   python tools/process_art.py sheet id   输出某角色精灵对照表到 ../tmp/
import os, sys, glob, json
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'raw_codex')
OUT = os.path.join(ROOT, 'assets', 'art')
os.makedirs(OUT, exist_ok=True)

def key_green(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(r, b)
    # 绿度:g 相对 r/b 的领先程度
    gness = (g - mx) / np.maximum(g, 1)
    alpha = np.clip(1 - (gness - 0.18) / 0.22, 0, 1)
    alpha[(g < 60)] = 1
    # 去溢色:半透明 / 边缘像素的绿色压到不超过 r、b 的较大值
    spill = g > mx
    g2 = np.where(spill, np.minimum(g, mx + (g - mx) * 0.15), g)
    out = np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    # 去掉孤立噪点:alpha 二次收紧
    al = np.asarray(img)[..., 3]
    return img, al

def bbox(al, th=40):
    ys, xs = np.where(al > th)
    if len(xs) == 0: return (0, 0, al.shape[1], al.shape[0])
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

def feet_x(al, bb):
    x0, y0, x1, y1 = bb
    band = al[max(y0, y1 - max(6, (y1 - y0) // 14)):y1, x0:x1] > 40
    cols = np.where(band.any(axis=0))[0]
    return x0 + (cols.min() + cols.max()) / 2 if len(cols) else (x0 + x1) / 2

def process_sprites():
    meta = {}
    for f in sorted(glob.glob(os.path.join(RAW, 'sprite_*.png'))):
        name = os.path.basename(f)[7:-4]          # <id>_<frame>
        cid, frame = name.split('_', 1)
        img, al = key_green(Image.open(f))
        bb = bbox(al)
        fx = feet_x(al, bb)
        pad = 4
        x0, y0, x1, y1 = max(0, bb[0] - pad), max(0, bb[1] - pad), min(img.width, bb[2] + pad), min(img.height, bb[3] + pad)
        crop = img.crop((x0, y0, x1, y1))
        # 统一缩放:原图 1248 高 → 0.4(足够 2 倍屏放大)
        k = 0.4
        crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
        crop.save(os.path.join(OUT, f'sp_{cid}_{frame}.webp'), 'WEBP', quality=90, method=6)
        meta.setdefault(cid, {})[frame] = {
            'w': crop.width, 'h': crop.height,
            'fx': round((fx - x0) * k, 1),            # 脚底中心(相对裁剪图)
            'bh': round((bb[3] - bb[1]) * k, 1),       # 角色包围盒高度
            'area': int((np.asarray(crop)[..., 3] > 128).sum()),  # 不透明像素面积(姿势无关的体型度量)
            'src': [img.width, img.height],
        }
    json.dump(meta, open(os.path.join(OUT, 'sprites.json'), 'w'), indent=1)
    print('sprites', sum(len(v) for v in meta.values()))

def process_art():
    for kind, k, size in [('full', None, 760), ('portrait', None, 256), ('cutin', None, 960)]:
        for f in sorted(glob.glob(os.path.join(RAW, f'{kind}_*.png'))):
            cid = os.path.basename(f)[len(kind) + 1:-4]
            im = Image.open(f)
            if kind == 'cutin':
                im = im.convert('RGB'); im.thumbnail((size, size)); im.save(os.path.join(OUT, f'cutin_{cid}.webp'), 'WEBP', quality=88, method=6); continue
            img, al = key_green(im)
            if kind == 'full':
                bb = bbox(al); img = img.crop((max(0, bb[0] - 6), max(0, bb[1] - 6), min(img.width, bb[2] + 6), min(img.height, bb[3] + 6)))
                img.thumbnail((size, size), Image.LANCZOS)
            else:
                img = img.resize((size, size), Image.LANCZOS)
            img.save(os.path.join(OUT, f'{kind}_{cid}.webp'), 'WEBP', quality=90, method=6)
    print('art done')

# 与 src/art.js 相同的尺寸归一化,用于检查游戏内的相对大小
TARGET = dict(idle=1, walk=1, run=1.02, jump=0.84, fall=1.04, crouch=0.74, guard=0.95, hit=0.98, knock=1.02, down=1.06, attack1=1.0, attack2=1.12, launch=1.22, sweep=1.12, airatk=0.92, cast=1, charge=1.02, lunge=0.86, victory=1.12)
LONG = {'run', 'knock', 'down', 'sweep'}
AIR = {'jump', 'fall', 'knock', 'airatk'}
WEAPON = dict(souga=1.32, hyorin=1.16, hizakura=1.16, kyouken=1.2, genshu=1.14)

def frame_k(meta, cid, fr):
    idle = meta['idle']
    wf = WEAPON.get(cid, 1)
    k0 = wf * 124 / idle['bh']
    if fr == 'idle': return k0
    r = (idle['area'] / max(1, meta[fr]['area'])) ** 0.5
    return k0 * min(1.25, max(0.72, r * ADJ.get(fr, 1)))

ADJ = {}

def sheet(cid):
    meta = json.load(open(os.path.join(OUT, 'sprites.json')))[cid]
    order = ['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'guard', 'hit', 'knock', 'down', 'attack1', 'attack2', 'launch', 'sweep', 'airatk', 'cast', 'charge', 'lunge', 'victory']
    frames = [f for f in order if f in meta]
    PX = 1.5; W = 230; H = 260; GY = H - 30
    s = Image.new('RGBA', (W * 10, H * 2), (60, 70, 90, 255)); d = ImageDraw.Draw(s)
    for i, fr in enumerate(frames):
        m = meta[fr]
        k = frame_k(meta, cid, fr) * PX
        im = Image.open(os.path.join(OUT, f'sp_{cid}_{fr}.webp')).resize((max(1, int(m['w'] * k)), max(1, int(m['h'] * k))))
        x, y = (i % 10) * W, (i // 10) * H
        if fr in AIR: px, py = x + W / 2 - im.width / 2, y + GY - 58 * PX - im.height / 2
        else: px, py = x + W / 2 - m['fx'] * k, y + GY - im.height + 4 * k
        s.alpha_composite(im, (int(px), int(py)))
        d.line([(x, y + GY), (x + W, y + GY)], fill=(255, 0, 0)); d.line([(x, y + GY - 124 * PX), (x + W, y + GY - 124 * PX)], fill=(255, 120, 0))
        d.text((x + 4, y + 4), fr, fill=(255, 255, 0))
    os.makedirs(os.path.join(ROOT, '..', 'tmp'), exist_ok=True)
    p = os.path.join(ROOT, '..', 'tmp', f'bvn_sprites_{cid}.png'); s.save(p); print(p)

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'sheet':
        for c in sys.argv[2:]: sheet(c)
    else:
        process_sprites(); process_art()
