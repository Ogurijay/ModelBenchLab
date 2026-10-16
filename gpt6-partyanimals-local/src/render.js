import * as T from 'three';
import { ANIMALS, TEAM_COLORS, byId, clamp } from './catalog.js';
import { animalModel, itemModel, kartModel, mat, box, cyl, ball, label, stadiumDetails, mergeDecorations, disposeVisual } from './art.js';
import { mapLayout } from './maps.js';

export class View {
  constructor(canvas,settings){
    this.canvas=canvas;this.settings=settings;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.14;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    this.scene=new T.Scene();this.scene.background=new T.Color('#adc6c5');this.scene.fog=new T.Fog('#adc6c5',36,95);
    this.scene.add(new T.HemisphereLight('#eef5ee','#8f8478',2.7));
    this.sun=new T.DirectionalLight('#fff0d2',3.8);this.sun.position.set(-9,17,10);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-28;this.sun.shadow.camera.right=28;this.sun.shadow.camera.top=28;this.sun.shadow.camera.bottom=-28;this.sun.shadow.camera.far=65;this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.00015;this.scene.add(this.sun);
    const rim=new T.DirectionalLight('#d8e9ef',1.8);rim.position.set(10,7,-10);this.scene.add(rim);
    this.level=new T.Group();this.scene.add(this.level);this.models=new Map();this.itemModels=new Map();this.effects=[];this.cameras=Array.from({length:4},()=>new T.PerspectiveCamera(43,1,.1,180));this.looks=Array.from({length:4},()=>new T.Vector3());this.zoom=1;this.orbit=0;this.shake=0;this.mode='home';this.frames=[];this.fps=60;this.resize();window.addEventListener('resize',()=>this.resize());this.home('corgi','classic');
  }
  resize(){this.width=this.canvas.clientWidth||innerWidth;this.height=this.canvas.clientHeight||innerHeight;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.settings.quality==='high'?1.75:1));this.renderer.setSize(this.width,this.height,false);this.renderer.shadowMap.enabled=this.settings.quality!=='low';}
  clear(){for(const child of [...this.level.children])disposeVisual(child);this.level.clear();this.models.clear();this.itemModels.clear();this.projectileModels=new Map();this.effects=[];this.pieceMeshes=[];}
  home(animal,costume){
    this.clear();this.mode='home';this.scene.background.set('#b5ceca');this.scene.fog.color.set('#b5ceca');
    this.sun.position.set(-9,17,10);
    const stage=new T.Group();this.level.add(stage);
    cyl(stage,'#dfc6a1',[1.8,-.2,0],[5.5,.45,4.3]);cyl(stage,'#f6deb1',[1.8,.04,0],[5.3,.08,4.15]);
    for(let i=0;i<20;i++){const a=i/20*Math.PI*2;box(stage,i%2?'#f2cf92':'#efdbae',[1.8+Math.sin(a)*5.35,.035,Math.cos(a)*4.15],[.26,.09,.15],[0,a,0]);}
    const hero=animalModel(animal,costume,0);hero.root.scale.setScalar(1.75);hero.pose(1.3,1.13,.55,-.25);this.level.add(hero.root);this.hero=hero;
    const friend=animalModel(animal==='duck'?'rabbit':'duck','scarf',1);friend.root.scale.setScalar(1.25);friend.pose(3.5,1.1,-1,-.45);this.level.add(friend.root);this.friend=friend;
    const buddy=animalModel('panda','cap',2);buddy.root.scale.setScalar(1.05);buddy.pose(.2,1.1,-1.4,.5);this.level.add(buddy.root);this.buddy=buddy;
    const trophy=new T.Group();trophy.position.set(4.8,0,2.3);this.level.add(trophy);cyl(trophy,'#876d4f',[0,.1,0],[.5,.2,.5]);cyl(trophy,mat('#e2b45c',false,.5),[0,.55,0],[.14,.9,.14]);ball(trophy,mat('#e8c16b',false,.55),[0,1.2,0],[.45,.55,.45]);meshRing(trophy,.48,.04,'#e8c16b',[0,1.1,0]);
    for(const[x,z]of[[-3,-3],[6,-4],[7,3]]){cyl(stage,'#8ea7a6',[x,1.6,z],[.05,3.2,.05]);box(stage,'#eab975',[x+.5,2.9,z],[1,.55,.06],[0,0,-.12]);}
    const logo=label('PARTY CLUB','#71938f',256);logo.position.set(3.1,.1,2);logo.rotation.x=-Math.PI/2;logo.scale.set(4,2,1);this.level.add(logo);
    this.cameras[0].position.set(8.7,6.3,13.4);this.looks[0].set(0,1,0);this.cameras[0].lookAt(this.looks[0]);
  }
  attach(sim){
    this.clear();this.sim=sim;this.mode='game';const k=sim.map.kind;
    const bg=['station','blackhole'].includes(k)?'#667786':['cold','ice','cabin'].includes(k)?'#bfd4d7':'#acc7c6';this.scene.background.set(bg);this.scene.fog.color.set(bg);
    this.sun.position.set(-10,18,12);
    for(const p of sim.layout.pieces){const m=box(this.level,p.color,[p.x,p.y,p.z],[p.w,p.h,p.d],[0,p.angle||0,0]);m.userData.piece=p;this.pieceMeshes.push(m);}
    const decor=new T.Group();this.level.add(decor);stadiumDetails(decor,sim.layout);mergeDecorations(decor);this.decor=decor;
    const water=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:['cold','ice'].includes(k)?'#85b6bf':'#6ca3ab',roughness:.38,metalness:.15}));water.rotation.x=-Math.PI/2;water.position.y=['sink','ice','shark','wave','pirate'].includes(k)?-.7:-12;water.receiveShadow=true;this.level.add(water);this.water=water;
    if(k==='cabin'){const pond=new T.Mesh(new T.CircleGeometry(4,40),mat('#7caab0',false,.1));pond.rotation.x=-Math.PI/2;pond.position.set(8,-.02,5);this.level.add(pond);}
    this.hazard=new T.Group();this.level.add(this.hazard);
    const torus=new T.Mesh(new T.TorusGeometry(1,.08,8,80),new T.MeshBasicMaterial({color:'#b8dd82',transparent:true,opacity:.75}));torus.rotation.x=-Math.PI/2;torus.position.y=.2;this.hazard.add(torus);this.hazardRing=torus;
    for(const a of sim.actors){const model=sim.options.mode==='kart'?kartModel(a.animal,a.costume,a.team):animalModel(a.animal,a.costume,a.team);model.bubble=label('♥','#de886e',128);model.bubble.scale.set(1,.5,1);model.bubble.visible=false;this.level.add(model.bubble);this.level.add(model.root);this.models.set(a.id,model);}
    this.cameras.forEach((c,i)=>{const a=sim.actors[i]||sim.actors[0],p=sim.options.mode==='kart'?a:a.body.translation();c.position.set(p.x+10,11,p.z+15);this.looks[i].set(p.x,1,p.z);c.lookAt(this.looks[i]);});
    this.telegraph=box(this.hazard,new T.MeshBasicMaterial({color:'#ec795e',transparent:true,opacity:.38,depthWrite:false}),[0,.05,0],[2,.12,sim.map.d]);this.telegraph.visible=false;
    this.aim=new T.Mesh(new T.RingGeometry(.55,.63,32),new T.MeshBasicMaterial({color:'#f8e6ab',side:T.DoubleSide}));this.aim.rotation.x=-Math.PI/2;this.aim.visible=false;this.level.add(this.aim);
    this.orbit=0;this.zoom=1;
  }
  event(event){
    if(['hit','explosion','goal','win','boost','cannon','spectator','escape'].includes(event.type)){
      if(this.settings.shake)this.shake=event.type==='explosion'?.3:.1;
      let pos=event.x===undefined?this.actorPosition(event.actor??0):new T.Vector3(event.x,event.y||1,event.z);
      for(let i=0;i<(event.type==='win'?45:12);i++){
        const mesh=new T.Mesh(new T.BoxGeometry(.08,.10,.06),mat(TEAM_COLORS[i%8]));mesh.position.copy(pos);this.level.add(mesh);this.effects.push({mesh,v:new T.Vector3((Math.random()-.5)*7,2+Math.random()*5,(Math.random()-.5)*7),life:1.4});
      }
    }
  }
  actorPosition(id){const a=this.sim?.actors[id];if(!a)return new T.Vector3();const p=this.sim.options.mode==='kart'?a:a.body.translation();return new T.Vector3(p.x,p.y||1,p.z);}
  update(dt,time){
    if(dt>0&&dt<.2){this.frames.push(dt);if(this.frames.length>60)this.frames.shift();this.fps=Math.round(this.frames.length/this.frames.reduce((s,x)=>s+x,0));}
    if(this.mode==='home'){
      this.hero?.pose(1.3,1.13+Math.sin(time*1.8)*.02,.55,-.25+Math.sin(time*.45)*.1,time);this.friend?.pose(3.5,1.1,-1,-.45,time+.6);this.buddy?.pose(.2,1.1,-1.4,.5,time+2);
      const cam=this.cameras[0];cam.aspect=this.width/this.height;cam.updateProjectionMatrix();if(this.width<700){cam.position.set(8,7,15);cam.lookAt(2,1,0);}else{cam.position.set(8.7,6.3,13.4);cam.lookAt(0,1,0);}this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,this.width,this.height);this.renderer.render(this.scene,cam);return;
    }
    const sim=this.sim,kart=sim.options.mode==='kart';
    for(const a of sim.actors){const m=this.models.get(a.id);if(kart){m.root.position.set(a.x,a.y,a.z);m.root.rotation.y=a.yaw;m.root.rotation.z=-clamp(a.input.x||0,-1,1)*Math.abs(a.speed)*.004;m.wheels.forEach(w=>w.rotation.x+=a.speed*dt*2);m.flames.forEach(f=>{f.visible=a.drifting||a.boost>0;f.material.color.set(a.boost>0?'#f4bd68':'#8ae0f2');f.scale.z=(a.boost?1:.4)+Math.sin(time*40)*.08;});m.shield.visible=a.shield>0;}
      else{
        for(let i=0;i<6;i++){const b=a.bodies[i],p=b.translation(),q=b.rotation();m.parts[i].position.set(p.x,p.y,p.z);m.parts[i].quaternion.set(q.x,q.y,q.z,q.w);}
        m.setExpression(a.stun>0||!a.alive);const p=a.body.translation();m.stars.position.set(p.x,p.y+1.65,p.z);m.stars.rotation.y=time*3;
        m.bubble.visible=a.emote>0&&a.alive;m.bubble.position.set(p.x,p.y+2.05+Math.sin(time*5)*.08,p.z);
        const s=sim.mutator==='giant'?1.25:1;for(const part of m.parts)part.scale.setScalar(s);
        m.root.visible=p.y>-12;
      }
    }
    if(!kart){
      for(const pm of this.pieceMeshes){const p=pm.userData.piece;if(p.body){const pos=p.body.translation(),q=p.body.rotation();pm.position.set(pos.x,pos.y,pos.z);pm.quaternion.set(q.x,q.y,q.z,q.w);}if(p.stress>8)pm.material=mat('#aad0d8');}
      for(const item of sim.items){if(!item.alive){const model=this.itemModels.get(item.id);if(model){disposeVisual(model);this.itemModels.delete(item.id);}continue;}let model=this.itemModels.get(item.id);if(!model){model=itemModel(item);this.itemModels.set(item.id,model);this.level.add(model);}const p=item.body.translation(),q=item.body.rotation();model.position.set(p.x,p.y,p.z);model.quaternion.set(q.x,q.y,q.z,q.w);if(item.fuse>0)model.scale.setScalar(1+Math.sin(time*20)*.08);}
      const radius=Math.max(.4,7-Math.max(0,sim.time-20)*.052-Math.max(0,sim.time-sim.options.roundTime)*.23);this.hazardRing.visible=sim.map.kind==='gas'||sim.time>sim.options.roundTime;this.hazardRing.scale.setScalar(radius);
      this.water.position.y=sim.waterLevel()??-12;
      const k=sim.map.kind,t=sim.time;this.telegraph.visible=k==='shark'&&t%13>9||k==='duel'&&t%12>8||k==='blackhole'&&t%18>9;
      if(k==='shark'){this.telegraph.position.set(Math.sin(Math.floor(t/13)*2.4)*5,.08,0);this.telegraph.scale.set(3,.12,sim.map.d);}
      if(k==='duel'){this.telegraph.position.set(0,t%12>10?1.8:3.5,0);this.telegraph.scale.set(sim.map.w,.22,.45);}
      if(k==='blackhole'){this.telegraph.position.set(0,.08,0);this.telegraph.scale.set(t%18>11?2:3,.12,t%18>11?2:3);this.telegraph.rotation.y=time*3;}
      const dead=sim.actors[0];this.aim.visible=!dead.alive&&['last','smash','mutator','trainDuel'].includes(sim.options.mode);if(this.aim.visible){this.aim.position.set(dead.spectator.x,.09,dead.spectator.z);this.aim.material.color.set(dead.spectator.cooldown>0?'#77959f':'#f8e6ab');}
    }
    for(const p of sim.projectiles){let m=this.projectileModels.get(p);if(!m){const color={freeze:'#84edf4',taser:'#d2a2ff',crossbow:'#f3d8a0',rocket:'#ef8264',banana:'#eed468'}[p.type]||'#f5e4ad';m=new T.Group();ball(m,new T.MeshBasicMaterial({color}),[0,0,0],[.16,.16,.4]);this.level.add(m);this.projectileModels.set(p,m);}m.position.set(p.x,p.y??.6,p.z);m.rotation.y=Math.atan2(p.vx||0,p.vz||1);}
    for(const[p,m]of this.projectileModels)if(!sim.projectiles.includes(p)){disposeVisual(m);this.projectileModels.delete(p);}
    if(kart)this.water.position.y=-.8;
    this.decor?.traverse(o=>{if(o.userData.fan)o.rotation.x=time*12;if(o.userData.spin){o.rotation.y+=dt;o.position.y=1.1+Math.sin(time*2)*.12;}});
    for(const e of this.effects){e.life-=dt;e.v.y-=dt*9;e.mesh.position.addScaledVector(e.v,dt);e.mesh.rotation.x+=dt*5;if(e.life<=0){e.mesh.removeFromParent();e.mesh.geometry.dispose();}}
    this.effects=this.effects.filter(e=>e.life>0);this.shake=Math.max(0,this.shake-dt);
    const split=this.settings.split&&sim.options.localPlayers>1,count=split?sim.options.localPlayers:1;
    this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,this.width,this.height);this.renderer.clear();this.renderer.setScissorTest(true);
    for(let i=0;i<count;i++){
      const col=count===2?i:i%2,row=count>2?Math.floor(i/2):0,w=count===1?this.width:this.width/2,h=count>2?this.height/2:this.height,x=col*w,y=count>2?this.height-(row+1)*h:0;
      const camera=this.cameras[i];camera.aspect=w/h;camera.updateProjectionMatrix();let subject=sim.actors[i];if(subject&&!subject.alive&&sim.options.mode!=='crisis')subject=sim.actors.find(a=>a.alive)||subject;
      const p=this.actorPosition(subject?.id??0),target=new T.Vector3(),eye=new T.Vector3();
      if(kart){target.copy(p).add(new T.Vector3(Math.sin(subject.yaw)*2,1.1,Math.cos(subject.yaw)*2));eye.copy(p).add(new T.Vector3(-Math.sin(subject.yaw)*7.5,4.5,-Math.cos(subject.yaw)*7.5));}
      else if(split||sim.options.localPlayers===1){target.copy(p);target.y=Math.max(.6,p.y*.4);eye.set(target.x+Math.sin(.35+this.orbit)*13*this.zoom,9*this.zoom,target.z+Math.cos(.35+this.orbit)*13*this.zoom);}
      else{target.set(0,.6,0);eye.set(Math.sin(.35+this.orbit)*Math.max(18,sim.map.w)*this.zoom,Math.max(14,sim.map.w*.75)*this.zoom,Math.cos(.35+this.orbit)*Math.max(18,sim.map.w)*this.zoom);}
      const smooth=1-Math.exp(-dt*5);camera.position.lerp(eye,smooth);this.looks[i].lerp(target,smooth);camera.lookAt(this.looks[i]);if(this.shake){camera.position.x+=(Math.random()-.5)*this.shake;camera.position.y+=(Math.random()-.5)*this.shake;}
      this.renderer.setViewport(x,y,w,h);this.renderer.setScissor(x,y,w,h);this.renderer.render(this.scene,camera);
    }
    this.renderer.setScissorTest(false);
  }
  project(id){const p=this.actorPosition(id);p.y+=2.1;p.project(this.cameras[0]);return{x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height,visible:p.z<1};}
  async photo(){this.update(0,performance.now()/1000);return new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'));}
}
function meshRing(parent,r,t,color,pos){const m=new T.Mesh(new T.TorusGeometry(r,t,8,24),mat(color,false,.4));m.position.set(...pos);parent.add(m);return m;}
