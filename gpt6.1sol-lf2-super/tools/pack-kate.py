"""Pack author Kate LF2 bytes without executing the SFX or any bundled program.
Run with bundled Python/Pillow: python tools/pack-kate.py [extracted-root].
"""
from pathlib import Path
import re, json, hashlib, gzip, sys
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else REPO/'tmp/lf2-super-research/extracted-bgm/lf2_KateV1.00'
OUT = REPO/'shared/assets/lf2-super'
KEY = b'SiuHungIsAGoodBearBecauseHeIsVeryGood'
CHUNK_LIMIT = 16*1024*1024
PATHS = re.compile(r'([\w./\\-]+\.(?:bmp|wav|dat|txt|mp3|ogg|mid))',re.I)

def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(s): return s.replace('\\','/').lower()
def decode(raw):
    if raw.startswith(b'MZ'): raise ValueError('Executable PE excluded')
    return bytes((raw[i]-KEY[i%len(KEY)])&255 for i in range(123,len(raw))).decode('cp950',errors='replace')
def text(path):
    raw=path.read_bytes()
    return decode(raw) if path.suffix.lower()=='.dat' else raw.decode('cp950',errors='replace')
def named(src):
    match=re.search(r'\bname:\s*(\S+)',src)
    return match[1] if match else None

OUT.mkdir(parents=True,exist_ok=True)
(OUT/'chunks').mkdir(exist_ok=True)
(OUT/'previews').mkdir(exist_ok=True)
manifest={'schema_version':1,'format':'gzip-concatenated-original-bytes','source':{
    'author':'Kate / Keaton','package':'lf2_Kate(小朋友齊打交_凱特大改版)V1.00.exe',
    'local_archive':'tmp/lf2-super-research/LF2_Kate_V1.00_bgm.exe',
    'sha256':'4fcc20fc58064acb9050fcdabe914de55922ea2f180c8f9eb71c91012ddde244',
    'size':142783666,'url':'https://drive.google.com/file/d/1trBAQdI3EgXHCag5-Jone5fmQF5utIqC/view',
    'author_url':'https://hcyang1227.blogspot.com/2019/11/lf2-kate.html',
    'license':'Original content rights remain with original authors; no blanket redistribution license found.'},
    'chunks':[],'versions':[], 'previews':[],
    'notes':['Runtime bytes remain exact; path keys alone are lowercased.',
    'No EXE, DLL, PE disguised as DAT/WAV, scripts or unrelated bundled games included.',
    'Previews convert original BMP pixels to PNG; map thumbnails use a main source layer rather than a reconstructed scene.',
    'Object type 0 does not assert selectable status; id99 Pkmnt is a stage auxiliary object.',
    'LF2 executable-embedded menu bitmaps are excluded; the browser shell supplies its own UI.']}
blobs={}; version_work=[]; rejected=[]; preview_cache={}

def preview(p,kind,label):
    raw=p.read_bytes(); identity=sha(raw)+kind
    if identity in preview_cache:return preview_cache[identity]
    name=kind+'-'+sha(raw)[:20]+'.png'; relative='previews/'+name
    with Image.open(p) as im:
        im.convert('RGB').save(OUT/relative,optimize=True)
        width,height=im.size
    manifest['previews'].append({'path':relative,'kind':kind,'label':label,'width':width,'height':height,
        'source_sha256':sha(raw),'sha256':sha((OUT/relative).read_bytes()),'conversion':'Lossless BMP pixels to RGB PNG; no rescaling or redrawing.'})
    preview_cache[identity]=relative
    return relative

# Hardcoded stock sound paths/controls are read by OpenLF2 outside DAT references.
fixed=['data/control.txt','data/001.wav','data/002.wav','data/006.wav','data/010.wav','data/011.wav','data/004.wav',
       'data/016.wav','data/017.wav','data/020.wav','data/021.wav','data/025.wav','data/032.wav','data/033.wav',
       'data/039.wav','data/065.wav','data/066.wav','data/068.wav','data/085.wav',
       'data/m_join.wav','data/m_ok.wav','data/m_cancel.wav','data/m_pass.wav','data/m_end.wav']
fixed += ['bgm/'+name+'.wma' for name in ['main','stage1','stage2','stage3','stage4','stage5','boss1','boss2']]

for number in range(1,4):
    root=SOURCE/f'LF2_Kate_Ver{number}'
    available={canonical(p.relative_to(root).as_posix()):p for p in root.rglob('*') if p.is_file()}
    for key,p in available.items():
        if p.suffix.lower()=='.dat':
            with p.open('rb') as source_file:signature=source_file.read(2)
            if signature==b'MZ':rejected.append({'version':number,'path':key,'size':p.stat().st_size,'sha256':sha(p.read_bytes()),'reason':'Unregistered PE disguised as DAT'})
    listing=text(root/'data/data.txt')
    objects=[{'id':int(m[1]),'type':int(m[2]),'path':canonical(m[3])} for m in re.finditer(r'id:\s*(-?\d+)\s+type:\s*(-?\d+)\s+file:\s*(\S+)',listing)]
    backgrounds=[{'id':int(m[1]),'path':canonical(m[2])} for m in re.finditer(r'id:\s*(-?\d+)\s+file:\s*(bg[\\/]\S+)',listing)]
    queue=['data/data.txt','data/stage.dat']+[o['path'] for o in objects]+[b['path'] for b in backgrounds]+fixed
    files={}; missing=[]; cursor=0
    while cursor<len(queue):
        key=canonical(queue[cursor]);cursor+=1
        if key in files:continue
        if key not in available:
            if key not in missing:missing.append(key)
            continue
        p=available[key];raw=p.read_bytes()
        if p.suffix.lower() in {'.exe','.dll','.bat','.cmd','.ps1','.js','.py'} or raw.startswith(b'MZ'):
            rejected.append({'version':number,'path':key,'size':len(raw),'sha256':sha(raw)});continue
        digest=sha(raw);files[key]=digest;blobs.setdefault(digest,raw)
        if p.suffix.lower() in {'.dat','.txt'}:
            content=text(p)
            if key=='data/data.txt':content=re.sub(r'<file_editing>.*?<file_editing_end>','',content,flags=re.S)
            queue.extend(canonical(m[1]) for m in PATHS.finditer(re.sub(r'#[^\r\n]*','',content)))
    characters=[]
    for obj in objects:
        if obj['type']!=0:continue
        content=text(available[obj['path']]);name=named(content)
        faces={}
        for field in ['head','small']:
            m=re.search(r'\b'+field+r':\s*(\S+)',content)
            if m and canonical(m[1]) in available:
                source_path=canonical(m[1]);faces[field+'_source']=source_path
                faces[field+'_preview']=preview(available[source_path],'face',name or str(obj['id']))
        characters.append({**obj,'name':name,**faces,'role':'stage_auxiliary' if obj['id']==99 else 'fighter_object','selectability':'requires runtime verification'})
    for bg in backgrounds:
        content=text(available[bg['path']]);bg['name']=named(content)
        bg['purpose']='move_reference' if bg['name']=='Training_Room' else 'music_box' if 'music' in (bg['name'] or '').lower() else 'background'
        layers=[canonical(m[1]) for m in PATHS.finditer(content) if m[1].lower().endswith('.bmp') and canonical(m[1]) in available]
        layers=[x for x in layers if not re.search(r'/(?:s|shadow)\.bmp$',x)]
        if layers:
            sizes=[]
            for layer in dict.fromkeys(layers):
                with Image.open(available[layer]) as im:sizes.append((im.width*im.height,layer))
            bg['preview_errors']=[]
            for _,layer in sorted(sizes,reverse=True):
                try:
                    result=preview(available[layer],'map',bg['name'])
                    bg['preview_source']=layer;bg['preview']=result;break
                except (ValueError,OSError) as error:
                    bg['preview_errors'].append({'source':layer,'error':str(error)})
    # Complete original instruction wall, not a fabricated skill chart.
    if number==3:
        wall='bg/sys/5_tr/wall.bmp'
        manifest['move_reference']={'source':wall,'version':'ver3','preview':preview(available[wall],'move-reference','Complete original Training_Room move reference')}
    if len(files)>1024:raise ValueError(f'Version {number}: {len(files)} exceeds OpenLF2 resource map capacity')
    version_work.append((files,{'id':f'ver{number}','label':['Original','Stage Plus','2xplus Game'][number-1],
        'characters':characters,'backgrounds':backgrounds,'resource_count':len(files),'missing':missing,
        'unused_source_references':['data/nothing.txt in file_editing section'],'objects':objects}))

# Deduplicate identical original bytes across all versions; chunks concatenate raw payloads.
locations={}; chunk_parts=[];chunk_bytes=0
def flush():
    global chunk_parts,chunk_bytes
    if not chunk_parts:return
    raw=b''.join(data for _,data in chunk_parts);packed=gzip.compress(raw,compresslevel=6,mtime=0)
    if len(packed)>=20*1024*1024:raise ValueError('Compressed chunk limit exceeded')
    path=f'chunks/chunk-{len(manifest["chunks"]):03d}.bin.gz';(OUT/path).write_bytes(packed)
    offset=0
    for digest,data in chunk_parts:
        locations[digest]={'chunk':path,'offset':offset,'length':len(data),'sha256':digest};offset+=len(data)
    manifest['chunks'].append({'path':path,'compressed_length':len(packed),'length':len(raw),'sha256':sha(packed),'decoded_sha256':sha(raw),'unique_files':len(chunk_parts)})
    chunk_parts=[];chunk_bytes=0
for digest,data in sorted(blobs.items()):
    if len(data)>CHUNK_LIMIT:raise ValueError('Single original asset exceeds chunk size')
    if chunk_bytes+len(data)>CHUNK_LIMIT:flush()
    chunk_parts.append((digest,data));chunk_bytes+=len(data)
flush()
for files,version in version_work:
    version['files']=[{'path':path,**locations[digest]} for path,digest in sorted(files.items())]
    version['chunk_paths']=sorted({f['chunk'] for f in version['files']});manifest['versions'].append(version)
manifest['excluded_pe']=rejected
manifest['stats']={'unique_files':len(blobs),'unique_raw_bytes':sum(map(len,blobs.values())),
    'compressed_bytes':sum(c['compressed_length'] for c in manifest['chunks']),'chunks':len(manifest['chunks']),
    'max_compressed_chunk':max(c['compressed_length'] for c in manifest['chunks']),
    'max_raw_chunk':max(c['length'] for c in manifest['chunks'])}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
# Delete only obsolete chunks generated by this packer, after resolving workspace bounds.
chunk_root=(OUT/'chunks').resolve()
referenced={Path(c['path']).name for c in manifest['chunks']}
for old in chunk_root.glob('chunk-*.bin.gz'):
    resolved=old.resolve()
    if resolved.parent!=chunk_root or not re.fullmatch(r'chunk-\d{3}\.bin\.gz',old.name):raise ValueError('Unsafe stale chunk boundary')
    if old.name not in referenced:old.unlink()
# Validate every range, hash, capacity and compression round trip.
for chunk in manifest['chunks']:
    packed=(OUT/chunk['path']).read_bytes();decoded=gzip.decompress(packed)
    assert sha(packed)==chunk['sha256'] and sha(decoded)==chunk['decoded_sha256']
    for version in manifest['versions']:
        for file in version['files']:
            if file['chunk']==chunk['path']:assert sha(decoded[file['offset']:file['offset']+file['length']])==file['sha256']
print(json.dumps({'stats':manifest['stats'],'versions':[{'id':v['id'],'resources':v['resource_count'],'missing':v['missing']} for v in manifest['versions']]},indent=2))
