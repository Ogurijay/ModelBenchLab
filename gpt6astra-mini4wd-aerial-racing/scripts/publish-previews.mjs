import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CARS} from '../src/catalog.js';
const project=path.resolve(import.meta.dirname,'..'),root=path.dirname(project);
const manifestPath=path.join(root,'shared/assets/manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const target=path.join(root,'shared/assets/mini4wd-astra/previews');fs.mkdirSync(target,{recursive:true});
for(const car of CARS){
 const from=path.join(project,'reconstruction',car.id,'final-review/reference.png'),to=path.join(target,car.id+'.png');
 if(fs.existsSync(from)){
  fs.copyFileSync(from,to);
  if(!fs.readFileSync(from).equals(fs.readFileSync(to)))throw Error('Preview copy verification failed: '+car.id);
  fs.unlinkSync(from);
 }
 const assetPath=path.relative(root,to).replaceAll('\\','/');
 const data={path:assetPath,sha256:createHash('sha256').update(fs.readFileSync(to)).digest('hex'),consumers:['gpt6astra-mini4wd-aerial-racing/src/main.ts'],source:'Rendered from this project’s procedural model in review.html; capture-models.mjs final-review. Classic shape reference sources are documented separately.'};
 const index=manifest.assets.findIndex(a=>a.path===assetPath);if(index>=0)manifest.assets[index]=data;else manifest.assets.push(data);
 const reportPath=path.join(project,'reconstruction',car.id,'final-review/reference.json');
 if(fs.existsSync(reportPath)){const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));report.imagePath=assetPath;fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log('Published 8 model previews with SHA-256; each image is stored once in shared assets.');
