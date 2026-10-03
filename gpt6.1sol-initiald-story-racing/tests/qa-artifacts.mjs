import fs from 'node:fs';
import path from 'node:path';

// Hold captures until the browser closes. New evidence files must not trigger
// the shared development server's watcher halfway through an acceptance run.
export function artifactsAt(directory){
  const files=new Map();
  return {
    screenshot:async(page,name)=>{files.set(name,await page.screenshot());},
    json:(name,value)=>files.set(name,JSON.stringify(value,null,2)+'\n'),
    flush:()=>{fs.mkdirSync(directory,{recursive:true});for(const [name,value] of files)fs.writeFileSync(path.join(directory,name),value);}
  };
}
