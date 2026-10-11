// Reproducible UI verification fixture. This is explicitly a stocked demo, not survival progression evidence.
import {Game} from '../src/game.js';
import {ITEMS} from '../src/data.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const g=new Game({name:'建造验收',race:'human',classId:'mage',outfit:'#687caf'});
g.enemies=[];g.player.level=6;g.player.points=8;g.player.mana=100;
for(const id of Object.keys(ITEMS))g.inventory[id]=100;
for(let x=-16;x<=17;x++)for(let y=14;y<34;y++)g.world.set(x,y,0);
const put=(id,x,y)=>{g.player.x=x-2;g.player.y=y-1.8;g.equip(id);if(!g.place(x,y))throw Error(`${id}@${x},${y}: ${g.messages.at(-1)}`);};
// Main cabin, 14 x 8, with a glass-backed window and a walkable door.
for(let x=-12;x<=3;x++){g.world.set(x,25,9);g.world.set(x,34,9);for(let y=26;y<34;y++)g.world.walls.set(`${x},${y}`,x>=-7&&x<=-4&&y>=27&&y<=29?4:1);}
for(let y=26;y<34;y++){g.world.set(-12,y,9);g.world.set(3,y,y<31?9:0);}
for(let x=-13;x<=4;x++){g.world.set(x,24,47);if(x>=-10&&x<=1)g.world.set(x,23,47);if(x>=-7&&x<=-2)g.world.set(x,22,47);}
put('door',3,33);put('bed',-11,33);put('chair',-7,33);put('table',-5,33);put('chest',0,33);put('lantern',-9,28);put('bookcase',-2,33);
// Outdoor crafting courtyard: reachable functioning stations.
put('bench',6,33);put('furnace',9,33);put('anvil',12,33);put('campfire',15,33);
g.world.objects.get('0,33').items={wood:50,ingot:12};
g.world.set(5,33,12);g.player.x=-5;g.player.y=31.3;g.equip('ironPick');g.slot=0;g.hotbar=['ironPick','ironSword','plank','woodWall','door','torch','hammer','woodBow','manaPotion','platform'];g.wear('silverArmor');g.wear('silverGreaves');g.wear('silverHelm');g.world.time=720*.36;g.messages=[];g.events=[];
if(!g.room(-5,31).valid)throw Error(JSON.stringify(g.room(-5,31)));
const output=process.argv[2]||'tmp/azeroth-sol-qa/v2-building-demo.json';mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});writeFileSync(output,JSON.stringify(g.serialize(),null,2));console.log(output);
