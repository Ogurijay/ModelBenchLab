"""Register this independent implementation; never alter the earlier versions."""
import json, pathlib, shutil, hashlib
root=pathlib.Path(__file__).resolve().parents[2]
name='gpt6astra-mini4wd-aerial-racing'
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
reg=read(root/'benchmark/registry.json')
if not any(p['dir']==name for p in reg['projects']):
    original=next(p for p in reg['projects'] if p['dir']=='gpt6-mini4wd-room-racing')
    p=dict(original)
    p.update(dir=name,model='GPT 6 ASTRA',variant='aerial-racing',port=3059,
             name='ASTRA · 四驱实验室',title='ASTRA · 四驱实验室',
             description='经典八车参考重建、立体双环赛道、近距离随车镜头与可拆解改装',
             desc='经典八车参考重建、立体双环赛道、近距离随车镜头与可拆解改装',
             docs={'readme':True,'handover':True,'changelog':True},
             docPaths={'readme':'README.md','handover':'HANDOVER.md','changelog':'CHANGELOG.md'})
    p.pop('aliases',None)
    reg['projects'].append(p)
    reg['updatedAt']='2026-10-07'
    write(root/'benchmark/registry.json',reg)
pkg=read(root/'package.json')
if name not in pkg['workspaces']:
    pkg['workspaces'].append(name);write(root/'package.json',pkg)
assets=root/'shared/assets/mini4wd-astra/references'
assets.mkdir(parents=True,exist_ok=True)
refs=[('cyclone','a','19412-classic-0.png','19412'),('hurricane','a','19415-classic-0.png','19415'),('dagger','a','19409-official-main.png','19409'),('evolution','a','95568-classic-0.png','95568'),('cobra','b','19301-classic-0.png','19301'),('spider','b','19408-classic-0.png','19408'),('gigant','b','19411-classic-0.png','19411'),('stinger','b','19413-classic-0.png','19413')]
manifest=read(root/'shared/assets/manifest.json')
for id,batch,file,sku in refs:
    dest=assets/f'{id}.png';shutil.copy2(root/f'tmp/astra-reference-{batch}'/file,dest)
    path=dest.relative_to(root).as_posix()
    if not any(a['path']==path for a in manifest['assets']):
        manifest['assets'].append({'path':path,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'consumers':[f'{name}/src/references.ts'],'source':f'Tamiya original product reference screenshot; https://www.tamiya.com/japan/products/{sku}/index.html ; local visual comparison only, not a game texture or claim of redistribution rights.'})
write(root/'shared/assets/manifest.json',manifest)
