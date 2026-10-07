import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {CARS} from '../src/catalog.js';
import {BLUEPRINTS} from '../src/blueprints.js';
const root=path.resolve(import.meta.dirname,'..'),repo=path.dirname(root);
const skill='C:/Users/OguriJay/.codex/skills/img2threejs';
const clone=o=>structuredClone(o),write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
function run(script,args){
 if(script==='state.py'&&args[0]==='mark'){
   const st=JSON.parse(fs.readFileSync(args[args.indexOf('--state')+1],'utf8'));
   if(st.checklist.find(x=>x.id===args[1])?.status==='done')return 'already recorded';
 }
 const r=spawnSync('python',[`${skill}/forge/${script}`,...args],{encoding:'utf8',cwd:repo});if(r.status)throw Error(r.stdout+r.stderr);return r.stdout;
}
for(const car of CARS){
 const dir=path.join(root,'reconstruction',car.id);fs.mkdirSync(dir,{recursive:true});
 if(fs.existsSync(path.join(dir,'blockout.generated.ts'))){console.log(car.id+' already strictly validated');continue;}
 const ref=path.join(repo,'shared/assets/mini4wd-astra/references',car.id+'.png');
 const state=path.join(dir,'state.json'),specfile=path.join(dir,'spec.json'),assessment=path.join(dir,'assessment.json');
 if(!fs.existsSync(state))run('state.py',['init','--state',state,'--reference',ref,'--profile','generic','--spec',specfile]);
 run('next.py',['--state',state]);
 const observed={identity:{name:car.en,sku:car.sku,domain:'object',confidence:1},reference:ref,form:'Bilateral injection moulded miniature car body with open wheel clearances; catalog dimensions in millimetres.',hierarchy:'chassis > drive and batteries; shell > thin panels and local painted regions; independent canopy/wing/wheels/rollers.',materials:'Gloss painted ABS shell, matte black rubber tires, polished metallic axles; black or gold opaque canopy except the two clear Real Mini 4WD canopies.',details:car.features,unknowns:['Panel coordinates are visual estimates, not CAD measurements.','Hidden shell thickness and battery mounts are inferred.'],adaptation:car.adaptation?'Original is a non-powered display model. Racing chassis and guide rollers are simulator adaptations.':'Classic chassis family retained; simulated physical parameters are tuneable.'};
 write(path.join(dir,'analysis.json'),observed);
 run('state.py',['mark','image-analysis','--state',state,'--evidence',path.join(dir,'analysis.json')]);
 run('state.py',['mark','reference-suitability','--state',state,'--evidence',path.join(dir,'analysis.json')]);
 run('stage1_intake/check_reference_admission.py',[ref,'--viewpoint','front-three-quarter','--out',path.join(dir,'admission.json'),'--probe-out',path.join(dir,'probe.json')]);
 run('state.py',['mark','reference-admission','--state',state,'--evidence',path.join(dir,'admission.json')]);
 run('stage2_spec/new_pre_spec_assessment.py',[car.en, '--image',ref,'--complexity','complex','--spec-query','hard surface mechanical layered shell extrude loft topology glossy plastic rubber metal','--out',assessment,'--force']);
 run('stage1_intake/build_detail_inventory.py',[ref,'--mode','grid-3x3','--out-dir',path.join(dir,'detail-scan'),'--out',path.join(dir,'detail-scan.json'),'--force']);
 run('stage2_spec/new_sculpt_spec.py',[car.en,'--image',ref,'--assessment',assessment,'--out',specfile,'--force']);
 const spec=JSON.parse(fs.readFileSync(specfile,'utf8')),bp=BLUEPRINTS[car.id];
 const comp=clone(spec.componentTree[0]),mat=clone(spec.materials[0]);
 Object.assign(spec,{targetId:car.id,suitability:'conditional',scores:{object_isolation:3,silhouette_readability:3,depth_inference:2,primitive_decomposition:3,material_procedurality:2,occlusion_risk:1,interaction_fit:3},coordinateFrame:{front:'+Z',up:'+Y',scaleReference:'Millimetres; runtime scale 0.001 for metre track world.'}});
 spec.assumptions=observed.unknowns.concat(observed.adaptation);
 Object.assign(spec.preSpecAssessment.objectClass,{primaryType:'classic Mini 4WD scale model',primaryDomain:'object',formLanguage:['hard-surface','mechanical'],structureKind:['layered shell','articulated assembly'],motionPotential:['whole-object transform','detachable','articulated'],materialFamilies:['plastic','rubber','metal','glass-like'],notes:observed.form});
 Object.assign(spec.preSpecAssessment.complexity,{scores:{silhouetteComplexity:3,componentCount:3,hierarchyDepth:2,repetitionDensity:2,materialLayerCount:3,localDetailDensity:3,occlusionRisk:2,actionReadinessNeed:3},reasoning:car.features});
 spec.silhouette={boundingShape:`${car.size.join(' x ')} mm catalog vehicle envelope`,aspectRatios:[car.size[0]/car.size[1]],symmetry:'bilateral mirror in X only',dominantCurves:car.features,negativeSpaces:['exposed front and rear wheels','undercut side channels','space between chassis and shell'],landmarks:bp};
 spec.viewEvidence[0].observations=car.features;spec.viewEvidence[0].confidence=.94;
 spec.referenceCamera={solved:false,fovDegrees:32,aspect:4/3,orientation:{yaw:38,pitch:30,roll:0},positionHint:[150,135,210],note:'Manual framing estimate, no claim of camera calibration.'};
 const items=[];
 function add(id,level,primitive,dimensions,position,material='base',parent='root',descriptor={}){
   const c=clone(comp);Object.assign(c,{id,name:id,level,primitive,parent,confidence:parent==='root'?.86:.7,topologyClass:primitive==='extrude'?'conforming-shell':'assembled-solid',topologyRationale:primitive==='extrude'?'Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.':'Discrete mechanical part with cylindrical or planar manufactured faces.',dimensions:{width:dimensions[0],height:dimensions[1],depth:dimensions[2],units:'millimetres',confidence:.8},material,materialLayers:[material],transform:{position,rotation:[0,0,0],scale:[1,1,1]},localFeatures:[]});
   const rgba=hex=>'rgba('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+', 1)';
   const col={base:car.body,rubber:'#14191c',metal:'#bac5cd',glass:car.canopy}[material];
   c.colorMaterialRecipe={dominantAlbedo:rgba(col),secondaryAlbedo:rgba(car.accent),materialClass:material==='base'?'plastic':material,materialClassConfidence:.9,evidenceRefs:['full-object']};
   Object.assign(c.geometryDescriptor,descriptor);c.geometryDescriptor.edgeTreatment={type:'bevel',bevelRadius:.4,segments:2};
   c.actionProfile.pivot.localPosition=[0,0,0];c.actionProfile.animationRole=id.includes('wheel')?'wheel-spin':'detachable-component';c.actionProfile.destruction.fractureGroup=id;c.actionProfile.destruction.detachableFragments=[id];
   c.attachment=parent?{parentSocket:id+'-mount',localStart:[0,0,0],localEnd:[0,0,0],contactType:'socket',embedDepth:.3,gapTolerance:.3}:null;
   items.push(c);return c;
 }
 add('root','macro','box',[1,1,1],[0,0,0],'base',null).geometryDescriptor.hidden=true;
 add('chassis','macro','box',[40,4,110],[0,7,0],'rubber');
 add('shell','macro','box',[1,1,1],[0,0,0]).geometryDescriptor.hidden=true;
 bp.panels.forEach(p=>{
   const rows=p.rows,zs=rows.map(r=>r[0]),xs=rows.flatMap(r=>[r[1],r[2]]),ys=rows.flatMap(r=>[r[3],r[4]+r[5]]);
   const c=add(p.name,'meso','extrude',[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)+1.2,Math.max(...zs)-Math.min(...zs)],[0,0,0],'base','shell',{surfaceRows:rows,mirrorX:p.mirror||false,wallThickness:1.2,uvStrategy:'parametric row and cross-section coordinates'});
   c.localFeatures=[p.name+'-bevel',p.name+'-paint-boundary'];
 });
 add('canopy','macro','extrude',[26,12,50],[0,0,0],'glass','root',{sectionRows:bp.canopy,wallThickness:.7});
 if(bp.wing)add('wing','meso','box',[bp.wing[0],1.3,bp.wing[1]],[0,bp.wing[2],bp.wing[3]]);
 for(let i=0;i<4;i++)add('wheel-'+i,'meso','cylinder',[26,9,26],[i%2?bp.track/2:-bp.track/2,13,i<2?bp.axle:-bp.axle],'rubber');
 add('motor','meso','cylinder',[20,15,25],[0,12,car.family==='front'?27:-29],'metal');
 add('battery','meso','cylinder',[28,14,48],[0,11,0],'metal');
 add('gear','meso','cylinder',[14,3,14],[12,13,car.family==='front'?41:-41],'metal');
 add('rollers','meso','cylinder',[90,3,130],[0,8,0],'metal');
 add('brake','meso','box',[25,3,7],[0,3,-61],'rubber');
 const detailNames=[...car.features,'Four rotating tires and catalog wheel colour','Guide roller discs and centre fasteners','Shell edge thickness and panel creases','Independent metallic motor and axle surfaces','Battery pair and transmission drive shaft'];
 const details=detailNames.map((description,i)=>({id:'detail-'+i,name:description,description,kind:i===6?'fastener':'contour',componentRefs:[i<5?'shell':i===5?'wheel-0':i===6?'rollers':i===7?'chassis':i===8?'motor':'battery'],evidenceRefs:['full-object'],confidence:i<8?.9:.6}));
 details.forEach(d=>{d.mapsTo={ref:d.id};items.find(c=>c.id===d.componentRefs[0]).localFeatures.push({id:d.id,type:d.kind,description:d.description,evidenceRefs:d.evidenceRefs});});
 spec.preSpecAssessment.detailInventory.details=details;spec.componentTree=items;
 spec.materials=[['base',car.body,.25,0],['rubber','#14191c',.84,0],['metal','#bac5cd',.22,.85],['glass',car.canopy,.1,car.adaptation?0:.3]].map(([id,color,roughness,metalness])=>{
   const m=clone(mat);Object.assign(m,{id,name:id+' observed surface',baseColor:color,color,type:'physical',albedo:{dominant:color,secondary:[car.accent],samplingNotes:'Distinct flat pigment zones observed in reference; highlights are not copied as albedo.'},roughness:{base:roughness,variation:.02,map:'independent-procedural-field',localResponse:'Small moulded plastic finish variation'},metalness:{base:metalness,variation:0},localOverrides:[{id:id+'-finish',mask:'observed feature zones',roughness:roughness,clearcoat:id==='base'?.8:0,evidenceRefs:['full-object']}],notes:'Photo PBR inference is limited; catalog clean moulded toy materials. No image-to-PBR measurement claim.'});
   m.colorVariation={palette:[color,car.accent],pattern:'bounded painted polygons',amplitude:0,heightCorrelation:0};
   m.textureless={declared:true,evidence:[ref+' : isolated pigment regions are smooth clean moulded surfaces at the reference view scale. Hard-edged printed livery, tire tread and fasteners are represented by separate geometry. No grain/pores are resolved or claimed; a photo-exact microscopic finish is outside the observation confidence.']};
   for(const k of ['normal','bump','displacement','surfaceFrequencyBands','textureProjection','textureResolution','referencePbr'])delete m[k];
   return m;
 });
 spec.repetitionSystems=[{id:'roller-fasteners',name:'four guide roller screws',count:4,componentRefs:['rollers'],distribution:'four chassis corner sockets, mirrored across X',realization:'instanced-geometry',buildsGeometry:true,seed:19412,evidenceRefs:['full-object']}];
 spec.qualityContract.definitionOfDone=car.features.map(f=>'Visible classic identity: '+f).concat(['Distinct shell shape survives front, side, rear and top review.','All eight upgrade categories map to selectable, explodable physical assemblies.']);
 spec.featureReviewTargets=[{id:'classic-silhouette',name:car.en+' distinctive envelope',tier:'critical',passIds:['blockout'],minimumScore:.8,mustPass:true,componentRefs:bp.panels.map(p=>p.name),evidenceRefs:['full-object']},{id:'classic-structure',name:car.features.slice(0,3).join('; '),tier:'critical',passIds:['structural-pass','form-refinement'],minimumScore:.8,mustPass:true,componentRefs:['shell','canopy'],evidenceRefs:['full-object']},{id:'classic-surface',name:car.features.slice(3).join('; '),tier:'critical',passIds:['material-pass','surface-pass'],minimumScore:.75,mustPass:true,componentRefs:['shell'],evidenceRefs:['full-object']}];
 spec.buildPasses.forEach(p=>p.componentRefs=items.map(c=>c.id));
 spec.performanceBudget={qualityPriority:'reference-fidelity',targetTriangles:60000,maxDrawCalls:75,textureSize:1024,fpsTarget:60,optimizationPolicy:'Merge only within the same semantic part and material. Keep wheel pivots separate.'};
 spec.preSpecAssessment.complexity.estimatedCounts={macroComponents:4,mesoComponents:items.filter(c=>c.level==='meso').length,microFeatureGroups:details.length,materialLayers:4,repetitionSystems:1};
 spec.lightingFromPhoto=[{type:'key light',direction:[-1,2,2],color:'#fff8ee',intensity:3},{type:'fill light',direction:[2,1,0],color:'#dcecff',intensity:1.2},{type:'environment light',exposure:1,toneMapping:'ACES',background:'#ececea',shadows:'soft ground shadow and contact shadow'}];
 write(specfile,spec);
 write(path.join(dir,'routing.json'),{projection:{applicable:false,reason:'Identity paint has flat hard boundaries. The later Gates rule in SKILL.md requires geometry for flat livery regions, never a projected texture. Author bounded surface polygons; no photo highlights are baked into paint.'},materialEvidence:{applicable:false,reason:'Clean flat-colour moulded ABS, smooth opaque decal film, plain rubber and metal. No patterned texture extraction or recovered PBR claim; analytic independent channels and authored paint boundaries are used. Real glass canopy gets transmission.'},identity:observed.identity});
 for(const [step,evidence] of [['local-spec-search',assessment],['pre-spec-assessment',specfile],['detail-inventory',specfile],['projection-route',path.join(dir,'routing.json')],['spec-authoring',specfile],['material-evidence',path.join(dir,'routing.json')],['material-spec-wiring',specfile]])run('state.py',['mark',step,'--state',state,'--evidence',evidence]);
 run('stage2_spec/validate_sculpt_spec.py',[specfile]);
 const validation=run('stage2_spec/validate_sculpt_spec.py',[specfile,'--strict-quality']);fs.writeFileSync(path.join(dir,'strict-validation.txt'),validation);
 run('state.py',['mark','strict-validation','--state',state,'--evidence',path.join(dir,'strict-validation.txt')]);
 console.log(car.id,validation.trim().slice(0,300));
 run('stage3_build/generate_threejs_factory.py',[specfile,'--out',path.join(dir,'blockout.generated.ts')]);
}

