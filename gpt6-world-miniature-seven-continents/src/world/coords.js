import layout from '../../layout.json' with { type: 'json' };
export { layout };
export const GROUND_Y = 1.2;
export const ROAD_Y = 1.35;
export const WATER_Y = 0;
export const landmarks = layout.zones.flatMap(z => z.landmarks.map(v => ({ id:v[0], name:v[1], x:v[2], z:v[3], width:v[4], depth:v[5], height:v[6], zone:z.id, zoneName:z.name, color:z.accent })));
export const byId = Object.fromEntries(landmarks.map(v=>[v.id,v]));
export const extraObstacles=[];
export const viewpoints=[{x:-65,z:100,radius:5},{x:53,z:-43,radius:5},{x:181,z:111,radius:5.5},{x:-42,z:-49,radius:5}];
export function onPlaza(x,z){return viewpoints.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius-.3);}
export function addObstacles(items){extraObstacles.push(...items);}
export const paths = [{points:layout.mainRoute,width:5}, ...layout.shortcuts.map(points=>({points,width:4})), ...layout.branches.map(points=>({points,width:3}))];
export function inPolygon(x,z,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [ax,az]=polygon[i], [bx,bz]=polygon[j];
    if((az>z)!==(bz>z) && x < (bx-ax)*(z-az)/(bz-az)+ax) inside=!inside;
  }
  return inside;
}
export function segmentDistance(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1], t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function onPath(x,z,margin=0) {
  return paths.some(p=>p.points.slice(1).some((b,i)=>segmentDistance(x,z,p.points[i],b)<=p.width/2+margin));
}
export function zoneAt(x,z) { return layout.zones.find(q=>inPolygon(x,z,q.polygon)); }
export function bridgeHeight(x,z) {
  const gg=byId['02'],tb=byId['09'];
  if(Math.abs(x-gg.x)<2.1&&Math.abs(z-gg.z)<=gg.depth/2+8) return ROAD_Y+(GROUND_Y+2.8-ROAD_Y)*Math.min(1,(gg.depth/2+8-Math.abs(z-gg.z))/8);
  if(Math.abs(z-tb.z)<1.65&&Math.abs(x-tb.x)<=tb.width/2+7) return ROAD_Y+(GROUND_Y+2.325-ROAD_Y)*Math.min(1,(tb.width/2+7-Math.abs(x-tb.x))/7);
  return null;
}
export function blocked(x,z,radius=.45) {
  return landmarks.some(l=>l.id!=='C' && !(['02','09'].includes(l.id)&&bridgeHeight(x,z)!==null) && Math.abs(x-l.x)<l.width/2+radius && Math.abs(z-l.z)<l.depth/2+radius)
    ||extraObstacles.some(l=>Math.abs(x-l.x)<l.width/2+radius&&Math.abs(z-l.z)<l.depth/2+radius);
}
export function walkable(x,z) {
  return Math.abs(x)<=211 && Math.abs(z)<=161 && !blocked(x,z) && (Boolean(zoneAt(x,z)) || onPath(x,z) ||onPlaza(x,z)||bridgeHeight(x,z)!==null);
}
export function groundHeight(x,z) { return bridgeHeight(x,z)??(onPath(x,z)||onPlaza(x,z)?ROAD_Y:zoneAt(x,z)?GROUND_Y:WATER_Y); }
export function moveWalker(position,dx,dz) {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.35));
  let x=position.x,z=position.z;
  for(let i=0;i<steps;i++) {
    if(walkable(x+dx/steps,z)) x+=dx/steps;
    if(walkable(x,z+dz/steps)) z+=dz/steps;
  }
  return {x,z,y:groundHeight(x,z)+1.7};
}
export function nearestWalkable(x,z) {
  // Spawn on the connected path network rather than an isolated shore pocket
  // behind a monument's collision envelope.
  const connected=(px,pz)=>onPath(px,pz)||onPlaza(px,pz)||bridgeHeight(px,pz)!==null;
  if(walkable(x,z)&&connected(x,z)) return {x,z,y:groundHeight(x,z)+1.7};
  for(let r=1;r<80;r+=1) for(let i=0;i<32;i++) {
    const px=x+Math.cos(i*Math.PI/16)*r,pz=z+Math.sin(i*Math.PI/16)*r;
    if(walkable(px,pz)&&connected(px,pz)) return {x:px,z:pz,y:groundHeight(px,pz)+1.7};
  }
  return {x:layout.entrance[0],z:layout.entrance[1],y:ROAD_Y+1.7};
}
