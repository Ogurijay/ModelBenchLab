import { wrap } from './track.js';
const fields=['x','y','z','vx','vz','speed','steering','grip','s','lateralAccel','longitudinalAccel','driftIntensity'];
export function interpolateVehicle(previous,current,alpha){
  if(!previous)return current;
  const t=Math.max(0,Math.min(1,alpha)),pose={...current};
  for(const key of fields)pose[key]=previous[key]+(current[key]-previous[key])*t;
  pose.yaw=wrap(previous.yaw+wrap(current.yaw-previous.yaw)*t);
  pose.angle=wrap(previous.angle+wrap(current.angle-previous.angle)*t);
  return pose;
}
export function interpolateOpponents(previous,current,alpha){
  if(!previous)return current;
  return current.map((o,i)=>previous[i]?.id===o.id?{...o,s:previous[i].s+(o.s-previous[i].s)*alpha,
    offset:previous[i].offset+(o.offset-previous[i].offset)*alpha}:o);
}
