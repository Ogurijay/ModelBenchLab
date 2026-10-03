export function createMinimap(track,size=150,padding=12){
  const points=track.samples.filter(p=>p.s<=track.length);points.push(track.at(track.length));
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const scale=(size-padding*2)/Math.max(maxX-minX,maxZ-minZ,1),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  // Camera-compatible orientation: +Z goes up, driver-left (+X) goes left.
  const project=p=>({x:size/2-(p.x-cx)*scale,y:size/2-(p.z-cz)*scale});
  const route=points.filter((_,i)=>i%5===0||i===points.length-1).map((p,i)=>{const v=project(p);return `${i?'L':'M'}${v.x.toFixed(2)} ${v.y.toFixed(2)}`;}).join('');
  return {project,route,start:project(points[0]),finish:project(points.at(-1)),scale};
}
