// Read atlas alpha only; keep source PNGs unchanged. The source rectangle excludes
// disconnected fragments from a neighbouring cell in generated animation atlases.
export function spriteBounds(data,width,ox,oy,cw,ch){
  const mask=new Uint8Array(cw*ch),queue=new Int32Array(cw*ch);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)mask[y*cw+x]=data[((oy+y)*width+ox+x)*4+3]>32?1:0;
  let best={count:0,left:0,top:0,right:cw-1,bottom:ch-1};
  for(let start=0;start<mask.length;start++){
    if(mask[start]!==1)continue;let head=0,tail=1;queue[0]=start;mask[start]=2;
    let left=cw,top=ch,right=0,bottom=0;
    while(head<tail){const p=queue[head++],x=p%cw,y=Math.floor(p/cw);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=cw||ny<0||ny>=ch)continue;const q=ny*cw+nx;if(mask[q]===1){mask[q]=2;queue[tail++]=q;}}
    }
    if(tail>best.count)best={count:tail,left,top,right,bottom};
  }
  return {left:Math.max(0,best.left-1),top:Math.max(0,best.top-1),right:Math.min(cw,best.right+2),bottom:Math.min(ch,best.bottom+2)};
}
