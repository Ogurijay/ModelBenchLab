# 调用 Codex CLI(image_generation 工具)批量生成角色美术,替代 Grok 版本。
#   python tools/gen_codex.py full [id,id]            全身立绘(文生图)
#   python tools/gen_codex.py portrait [id,id]        头像(附全身立绘作参考图 -i)
#   python tools/gen_codex.py cutin [id,id]           奥义 cut-in(附全身立绘作参考图)
#   python tools/gen_codex.py sprite [id,id] [帧,帧]  战斗精灵帧(附全身立绘作参考图)
# 输出到 assets/raw_codex/<kind>_<id>[_<帧>].png;已存在则跳过。环境变量 CODEX_PAR 控制并发(默认 6)。
import json, subprocess, sys, os, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'raw_codex')
os.makedirs(RAW, exist_ok=True)
CHARS = json.load(open(os.path.join(ROOT, 'tools', 'art_prompts.json'), encoding='utf8'))

ORIGINAL = ('ORIGINAL character design that must NOT resemble any existing anime, manga or game character '
            '(no Naruto, Bleach or other franchise likeness, no village symbols, no spiral emblems, no logos, no text). ')
STYLE = ('Clean bold black line art, flat cel shading with one shadow tone, vivid saturated colors, '
         'polished modern 2D Japanese anime fighting-game art. ')
BG = 'Perfectly flat solid pure green (#00ff00) background, no shadow, no floor, no ground line, no text. '
SAVE = ('Use your image generation tool to create exactly ONE image, then copy the resulting PNG file into the current working '
        'directory as {fn} using a shell command (it is stored under ~/.codex/generated_images). Reply only with the saved path. ')

# 直接用 npm 版 Codex 的 node 入口(PATH 上可能还有旧版 WinGet codex.exe)
CODEX_JS = os.environ.get('CODEX_JS', os.path.join(os.environ.get('APPDATA', ''), 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'))

FRAMES = json.load(open(os.path.join(ROOT, 'tools', 'sprite_frames.json'), encoding='utf8'))

def build(kind, cid, frame=None):
    c = CHARS[cid]; d = c['desc']
    ref = os.path.join(RAW, f'full_{cid}.png')
    if kind == 'full':
        fn = f'full_{cid}.png'
        p = (f'Image: full-body character art for a 2D anime fighting game. {ORIGINAL}Character: {d}. '
             f'Pose: {c.get("pose", "standing in a confident ready fighting stance")}, body turned to face RIGHT in three-quarter view, '
             f'the entire body visible from the top of the hair to the soles of the feet with a small margin, centered, portrait orientation. {STYLE}{BG}')
        return fn, SAVE.format(fn=fn) + p, []
    if kind == 'portrait':
        fn = f'portrait_{cid}.png'
        p = (f'The attached image is the character reference sheet. Draw the SAME character (same face, hair, eye color, outfit, colors): {d}. '
             f'Framing: head-and-shoulders portrait bust, face toward the viewer in slight three-quarter view, confident expression, '
             f'face filling most of the square frame, square 1:1 composition. {STYLE}{BG}')
        return fn, SAVE.format(fn=fn) + p, [ref]
    if kind == 'cutin':
        fn = f'cutin_{cid}.png'
        p = (f'The attached image is the character reference sheet. Draw the SAME character (same face, hair, eye color, outfit, colors): {d}. '
             f'Scene: dramatic upper-body close-up as the character unleashes a special technique: {c["cutin"]}. Intense fierce expression, '
             f'dynamic diagonal composition, wide 16:9 landscape image, character on the left half facing RIGHT. '
             f'{STYLE}Plain very dark background (#101018) behind the character with only the technique effects, no text.')
        return fn, SAVE.format(fn=fn) + p, [ref]
    if kind == 'sprite':
        fn = f'sprite_{cid}_{frame}.png'
        pose = FRAMES[frame][c.get('fight', 'fist')].replace('WEAPON', c.get('weapon', 'the sword'))
        p = (f'The attached image shows the character design ONLY (identity, outfit, colors); do NOT copy its pose. '
             f'Draw the SAME character: {d}. NEW POSE: {pose}. The character faces RIGHT (toward the right edge), side / three-quarter view, '
             f'the entire body visible with a small margin. This is a single sprite frame for a 2D fighting game: no effects unless described, '
             f'no motion lines, no shadow. {STYLE}{BG}')
        return fn, SAVE.format(fn=fn) + p, [ref]

def run(job):
    kind, cid, frame = job
    fn, prompt, imgs = build(kind, cid, frame)
    out = os.path.join(RAW, fn)
    if os.path.exists(out): return fn, 'skip'
    cmd = ['node', CODEX_JS, 'exec', '--skip-git-repo-check', '-s', 'workspace-write', '-c', 'model_reasoning_effort=low']
    for im in imgs: cmd.append(f'--image={im}')
    cmd += ['--', prompt]   # --image 可接多个值,用 -- 隔开提示词
    for attempt in range(3):
        r = subprocess.run(cmd, cwd=RAW, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf8', errors='replace', timeout=900)
        if os.path.exists(out): return fn, 'ok'
    return fn, 'FAIL ' + r.stdout[-300:].replace(chr(10), ' ')

if __name__ == '__main__':
    kind = sys.argv[1]
    ids = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else [k for k in CHARS if kind != 'sprite' and kind != 'cutin' or CHARS[k].get('main')]
    if kind == 'sprite':
        frames = sys.argv[3].split(',') if len(sys.argv) > 3 else list(FRAMES)
        jobs = [(kind, i, f) for i in ids for f in frames]
    else:
        jobs = [(kind, i, None) for i in ids]
    with cf.ThreadPoolExecutor(max_workers=int(os.environ.get('CODEX_PAR', '6'))) as ex:
        for fn, st in ex.map(run, jobs): print(kind, fn, st, flush=True)
