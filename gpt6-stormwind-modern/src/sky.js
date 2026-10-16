import * as THREE from 'three';
// Seamless, deterministic multi-scale cloud field. No image assets are loaded.
export function makeSky(){
 const c=document.createElement('canvas');c.width=2048;c.height=1024;const a=c.getContext('2d'),pixels=a.createImageData(c.width,c.height),d=pixels.data;
 const hash=(x,y,period)=>{let n=Math.imul((x%period+period)%period,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x,y,period)=>{const ix=Math.floor(x),iy=Math.floor(y),xx=x-ix,yy=y-iy,u=xx*xx*(3-2*xx),v=yy*yy*(3-2*yy);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy,period),hash(ix+1,iy,period),u),THREE.MathUtils.lerp(hash(ix,iy+1,period),hash(ix+1,iy+1,period),u),v);};
 const stops=[[0,[45,85,175]],[.28,[82,130,210]],[.47,[198,215,231]],[.51,[156,174,163]],[1,[69,87,76]]];
 for(let y=0;y<c.height;y++){
  const lat=y/c.height;let k=0;while(k<stops.length-2&&lat>stops[k+1][0])k++;const t=(lat-stops[k][0])/(stops[k+1][0]-stops[k][0]);const base=stops[k][1].map((v,i)=>THREE.MathUtils.lerp(v,stops[k+1][1][i],t));
  for(let x=0;x<c.width;x++){
   let density=0,shade=1;if(lat>.035&&lat<.485){let amp=.55,scale=1,total=0;for(let o=0;o<5;o++){total+=amp*noise(x/c.width*16*scale,lat*19*scale+31,16*scale);scale*=2;amp*=.5;}density=THREE.MathUtils.smoothstep(total,.49,.7)*Math.min(1,(.485-lat)*35);shade=.84+.16*noise(x/c.width*16,lat*19+30.7,16);}
   const i=(y*c.width+x)*4,cloud=[255,250,232];for(let q=0;q<3;q++)d[i+q]=THREE.MathUtils.lerp(base[q],cloud[q]*shade,density);d[i+3]=255;
  }
 }
 a.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;return texture;
}
