import * as THREE from 'three';
function texture(type,bg,fg){
 const c=document.createElement('canvas');c.width=c.height=512;const a=c.getContext('2d');a.fillStyle=bg;a.fillRect(0,0,512,512);let seed=123;
 const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 if(['stone','paving','roof'].includes(type)){
  const h=type==='roof'?48:128,w=type==='roof'?64:type==='stone'?256:128;
  for(let y=0;y<512;y+=h)for(let x=-(y/h%2)*w/2;x<512;x+=w){
   a.fillStyle=`rgba(${rand()>.48?'255,248,224':'63,62,47'},${.035+rand()*(type==='roof'?.09:.17)})`;a.fillRect(x+2,y+2,w-4,h-4);
   if(type==='stone'){
    const shade=a.createLinearGradient(x,y,x+w,y+h);shade.addColorStop(0,'rgba(255,249,226,.1)');shade.addColorStop(.6,'rgba(128,113,83,0)');shade.addColorStop(1,'rgba(91,86,64,.12)');a.fillStyle=shade;a.fillRect(x+4,y+4,w-8,h-8);
   }
   // Small mottled patches and edge chips sit inside each individual block.
   for(let j=0;j<18;j++){const px=x+5+rand()*(w-10),py=y+5+rand()*(h-10);a.fillStyle=`rgba(${rand()>.5?'249,236,203':'49,64,65'},${.025+rand()*.055})`;a.beginPath();a.ellipse(px,py,2+rand()*13,1+rand()*5,rand()*3,0,Math.PI*2);a.fill();}
   for(let j=0;j<3;j++){const px=x+rand()*w,py=y+(rand()>.5?h-4:4);a.strokeStyle='rgba(231,223,196,.4)';a.lineWidth=2;a.beginPath();a.moveTo(px,py);a.lineTo(px+2+rand()*7,py+(rand()-.5)*6);a.stroke();}
   a.strokeStyle=fg;a.lineWidth=type==='roof'?2:3;a.strokeRect(x+1,y+1,w-2,h-2);
   a.strokeStyle='rgba(255,255,245,.24)';a.lineWidth=2;a.beginPath();a.moveTo(x+3,y+h-4);a.lineTo(x+3,y+3);a.lineTo(x+w-3,y+3);a.stroke();
  }
 }
 if(type==='wood')for(let i=0;i<170;i++){a.strokeStyle=`rgba(25,17,9,${.03+rand()*.2})`;a.lineWidth=.4+rand()*2;a.beginPath();const x=rand()*512;a.moveTo(x,0);a.bezierCurveTo(x+rand()*12,150,x-rand()*12,360,x,512);a.stroke();}
 if(type==='glass'){
  const g=a.createLinearGradient(0,0,180,512);g.addColorStop(0,'#8fa9af');g.addColorStop(.4,'#52778a');g.addColorStop(.65,'#36515f');g.addColorStop(1,'#b59c70');a.fillStyle=g;a.fillRect(0,0,512,512);
  a.fillStyle='rgba(232,246,245,.2)';a.beginPath();a.moveTo(0,30);a.lineTo(350,0);a.lineTo(0,380);a.fill();
  a.strokeStyle='rgba(26,40,47,.4)';a.lineWidth=3;for(let x=-512;x<1024;x+=90){a.beginPath();a.moveTo(x,0);a.lineTo(x+512,512);a.stroke();a.beginPath();a.moveTo(x,0);a.lineTo(x-512,512);a.stroke();}
 }
 for(let i=0;i<12000;i++){a.fillStyle=`rgba(${rand()>.5?'255,255,255':'20,30,40'},${rand()*.07})`;a.fillRect(rand()*512,rand()*512,1+rand()*4,1+rand()*3);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=16;return t;
}
function masonryRelief(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#404040';c.fillRect(0,0,512,512);
 for(let row=0;row<4;row++)for(let x=-(row%2)*128;x<512;x+=256){
  const y=row*128;const bevel=c.createLinearGradient(0,y,0,y+128);bevel.addColorStop(0,'#505050');bevel.addColorStop(.055,'#a5a5a5');bevel.addColorStop(.12,'#b4b4b4');bevel.addColorStop(.88,'#aeaeae');bevel.addColorStop(.96,'#929292');bevel.addColorStop(1,'#505050');c.fillStyle=bevel;c.fillRect(x+3,y+3,250,122);
  c.strokeStyle='#777777';c.lineWidth=3;c.strokeRect(x+4,y+4,248,120);
 }
 const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=16;return t;
}
export function makeMaterials(){
 const stone=texture('stone','#d8d5c6','#a6a496'),relief=masonryRelief(),tile=texture('roof','#4e79a6','#305a82'),pave=texture('paving','#b9b4a6','#aaa699'),wood=texture('wood','#b79b77','#55432d'),glass=texture('glass','#617b8a','#294658');
 const m=(color,opt={})=>new THREE.MeshStandardMaterial({color,roughness:.83,...opt});
 return {stone:m('#ebe8dd',{map:stone,bumpMap:relief,bumpScale:.16}),trim:m('#eee7d5'),darkStone:m('#787f7e',{map:stone,bumpMap:relief,bumpScale:.16}),paving:m('#d5cdb8',{map:pave}),roof:m('#9eb6d1',{map:tile}),purple:m('#9e8fbc',{map:tile}),redRoof:m('#d8976e',{map:tile}),plaster:m('#e9d9b8'),timber:m('#594637',{map:wood}),wood:m('#ae8a60',{map:wood}),iron:m('#3a4e55',{metalness:.6}),gold:m('#c3a252',{metalness:.55,roughness:.38}),banner:m('#244c8b',{side:THREE.DoubleSide}),glass:m('#a6bcc8',{map:glass,transparent:true,opacity:.82,side:THREE.DoubleSide,emissive:'#b67e35',emissiveMap:glass,emissiveIntensity:.06,metalness:.25,roughness:.24,envMapIntensity:1.1}),glow:m('#ffdb88',{emissive:'#ffbb44',emissiveIntensity:1.2}),grass:m('#6f8850'),leaf:m('#587644'),leafLight:m('#8b9953'),soil:m('#7c7a57'),mountain:m('#74867b'),sand:m('#b5a889'),white:m('#e1d8bd'),water:m('#3d99a1',{metalness:.5,roughness:.22}),sea:m('#438c9d',{metalness:.4,roughness:.3}),rug:m('#234e8b'),flower:m('#e4b4cb'),arcane:m('#a8c9ea',{emissive:'#709fdf',emissiveIntensity:.7})};
}
