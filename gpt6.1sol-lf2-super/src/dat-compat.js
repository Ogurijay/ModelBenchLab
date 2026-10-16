// Runtime-only syntax adaptation. Source package chunks and their hashes are immutable.
import {decodeKateDat} from './kate-patches.js';
const key=new TextEncoder().encode('SiuHungIsAGoodBearBecauseHeIsVeryGood');
const blocks=/<frame>([\s\S]*?)<frame_end>/g;
function byteString(bytes) {
  let result='';
  for(let start=0;start<bytes.length;start+=8192)result+=String.fromCharCode(...bytes.subarray(start,start+8192));
  return result;
}
function numericFrames(text) {
  return [...text.matchAll(blocks)].filter(m=>/^\s*-?\d+\b/.test(m[1])).map(m=>({
    frame:Number(m[1].match(/^\s*(-?\d+)/)[1]),
    fields:[...m[1].matchAll(/([a-zA-Z_]+):\s*(-?\d+(?:\.\d+)?)/g)].map(m=>[m[1],m[2]])
  }));
}
function encryptCopy(original,text) {
  const result=new Uint8Array(123+text.length);result.set(original.subarray(0,123));
  for(let i=0;i<text.length;i++)result[i+123]=(text.charCodeAt(i)+key[(i+123)%key.length])&255;
  return result;
}
export function normalizeKateFiles(files) {
  const diagnostics=[];
  const output=files.map(file=> {
    if(!file.path.toLowerCase().endsWith('.dat'))return file;
    const bytes=file.bytes instanceof Uint8Array?file.bytes:new Uint8Array(file.bytes);
    const original=byteString(decodeKateDat(bytes));
    const before=numericFrames(original);const defined=new Set(before.map(f=>f.frame));
    const unresolved=[];
    for(const frame of before)for(const [field,text] of frame.fields) {
      if(field==='next'||field.startsWith('hit_')) {
        const target=Math.abs(Number(text));
        if(target>0&&target<=399&&!defined.has(target))unresolved.push({frame:frame.frame,field,target});
      }
    }
    let previous=null;
    const normalized=original.replace(blocks,(whole,body,offset)=> {
      // scanf-style integer scanning permits an adjacent nonnumeric label (305--3).
      const header=body.match(/^(\s*)(-?\d+)(\s*)(\S+)/);
      if(!header) {
        const following=original.slice(offset+whole.length).match(/<frame>\s*(-?\d+)\b/);
        diagnostics.push({path:file.path,kind:'quarantined-unnumbered-frame',header:body.trimStart().split(/[\r\n]/)[0],previousFrame:previous,nextFrame:following?+following[1]:null,
          unresolvedReferences:unresolved,reason:'OpenLF2 rejects a frame lacking an integer index. No frame number is invented; all defined frames remain unchanged. Original executable recovery semantics are unverified.'});
        return '';
      }
      previous=+header[2];const label=header[4];
      const safe=label.replace(/[^\x21-\x7e]/g,'?').slice(0,19);
      if(label===safe)return whole;
      diagnostics.push({path:file.path,kind:'frame-label',frame:previous,originalLabel:label,runtimeLabel:safe,reason:'OpenLF2 frame.name read_word(section,20) requires at most19 bytes. Label is descriptive; frame number and all numeric fields are unchanged.'});
      return '<frame>'+body.replace(header[0],header[1]+header[2]+header[3]+safe)+'<frame_end>';
    });
    if(normalized===original)return file;
    if(JSON.stringify(before)!==JSON.stringify(numericFrames(normalized)))throw Error(`DAT compatibility altered valid frame values: ${file.path}`);
    return {...file,bytes:encryptCopy(bytes,normalized)};
  });
  return {files:output,diagnostics};
}
