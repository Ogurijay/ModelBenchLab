// Animation follows combat frames / distance, never an unrelated wall-clock timer.
export function spritePose(f,motion=true,awakened=false){
  const useMotion=motion&&!awakened,pose=(frame,sheet='base')=>({frame,sheet});
  if(f.state==='down')return useMotion?pose(15,'motion'):pose(12);
  if(['airhurt','tech'].includes(f.state))return useMotion?pose(14,'motion'):pose(12);
  if(['hurt','guardbreak','wakeup'].includes(f.state))return useMotion?pose(12,'motion'):pose(12);
  if(['block','blockstun'].includes(f.state))return useMotion?pose(13,'motion'):pose(7);
  const a=f.attack;
  if(a){
    const startup=a.frame<a.move.startup,active=a.frame<a.move.startup+a.move.active;
    if(a.kind==='normal'){
      if(startup)return useMotion?pose(8,'motion'):pose(1);
      if(active){if(a.dir==='up')return pose(11);if(a.dir==='down'||a.chain===3)return pose(10);return useMotion?pose(9,'motion'):pose(8+(a.chain-1)%4);}
      if(useMotion)return pose(a.frame<a.move.startup+a.move.active+Math.ceil(a.move.recovery*.45)?10:11,'motion');
      return pose(a.frame<a.move.total-4?8+(a.chain-1)%4:0);
    }
    if(startup)return pose(a.frame<a.move.startup*.5?1:13);
    if(!active&&a.frame>a.move.total-7)return pose(0);
    return pose(a.kind==='ultimate'?15:['shuriken','kunai','fire'].includes(a.move.type)?13:14);
  }
  if(['dash','escape'].includes(f.state))return pose(4);
  if(f.y>1&&!f.grounded)return pose(f.vy>0?5:6);
  if(f.state==='run')return useMotion?pose(Math.floor((f.runDistance||0)/14)%8,'motion'):pose(2+Math.floor((f.runDistance||0)/28)%2);
  return pose(Math.floor((f.time||0)*3)%2);
}
