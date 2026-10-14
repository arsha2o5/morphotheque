const crypto = require('node:crypto');
const sizes = [12,16,21,28,36,48,60,84];
const pieceSizes = new Map(); let number=36;
for(let i=0;i<sizes.length;i++)for(let j=i;j<sizes.length;j++){if(number>1)pieceSizes.set('A'+number,[sizes[i],sizes[j]]);number--;}
const names = new Map([...pieceSizes].map(([name,dimensions])=>[dimensions.join(','),name]));
function makeTile(x,y,w,h){const piece=names.get([Math.min(w,h),Math.max(w,h)].join(','));return piece?{piece,x,y,w,h}:null;}
function zone(input){
 if(!Array.isArray(input)||!input.length||input.length>49)throw new Error('Each color must contain 1–49 tiles.');
 const cells=new Uint8Array(7056);
 const tiles=input.map(p=>{
  if(!p||!['x','y','w','h'].every(k=>Number.isInteger(p[k]))||p.x<0||p.y<0||p.w<1||p.h<1||p.x+p.w>84||p.y+p.h>84)throw new Error('Invalid integer coordinates or board bounds.');
  const dimensions=pieceSizes.get(p.piece);if(!dimensions||[Math.min(p.w,p.h),Math.max(p.w,p.h)].join(',')!==dimensions.join(','))throw new Error('Tile size does not match its A2–A36 code.');
  for(let y=p.y;y<p.y+p.h;y++)for(let x=p.x;x<p.x+p.w;x++){if(cells[y*84+x])throw new Error('Overlapping tiles.');cells[y*84+x]=1;}
  return {piece:p.piece,x:p.x,y:p.y,w:p.w,h:p.h};
 }).sort((a,b)=>a.y-b.y||a.x-b.x||a.w-b.w||a.h-b.h);
 return {tiles,cells};
}
function difficultyLevels(s){
 const merged=s.solution.map(p=>({...p}));
 while(true){let best=null;for(let i=0;i<merged.length;i++)for(let j=i+1;j<merged.length;j++){const a=merged[i],b=merged[j];let p=null;if(a.y===b.y&&a.h===b.h&&(a.x+a.w===b.x||b.x+b.w===a.x))p=makeTile(Math.min(a.x,b.x),a.y,a.w+b.w,a.h);else if(a.x===b.x&&a.w===b.w&&(a.y+a.h===b.y||b.y+b.h===a.y))p=makeTile(a.x,Math.min(a.y,b.y),a.w,a.h+b.h);if(p&&(!best||p.w*p.h>best.p.w*best.p.h))best={i,j,p};}if(!best)break;merged.splice(best.j,1);merged.splice(best.i,1,best.p);}
 const states=[merged.map(p=>({...p}))];let tilesNow=merged;
 while(true){let best=null;for(let i=0;i<tilesNow.length;i++){const p=tilesNow[i];for(const axis of ['w','h']){const length=p[axis];for(const cut of sizes){if(cut>=length||!sizes.includes(length-cut))continue;const a=axis==='w'?makeTile(p.x,p.y,cut,p.h):makeTile(p.x,p.y,p.w,cut);const b=axis==='w'?makeTile(p.x+cut,p.y,p.w-cut,p.h):makeTile(p.x,p.y+cut,p.w,p.h-cut);if(a&&b){const score=p.w*p.h-Math.abs(cut-length/2);if(!best||score>best.score)best={i,a,b,score};}}}}if(!best)break;tilesNow=tilesNow.map(p=>({...p}));tilesNow.splice(best.i,1,best.a,best.b);states.push(tilesNow);}
 const n=Math.min(4,states.length);return Array.from({length:n},(_,i)=>{const solution=states[n===1?0:Math.round(i*(states.length-1)/(n-1))];const inventory={};solution.forEach(p=>inventory[p.piece]=(inventory[p.piece]||0)+1);return {level:i+1,tile_count:solution.length,mean_area_in2:s.area_in2/solution.length,solution,inventory:Object.entries(inventory).map(([piece,count])=>({piece,count}))};});
}
function validateSnapshot(input){
 if(!input||typeof input!=='object'||input.board_units!==84||input.units_per_inch!==12)throw new Error('Expected an 84-unit board and 12 units per inch.');
 const white=zone(input.playable),black=zone(input.blocked);
 for(let i=0;i<7056;i++)if(white.cells[i]+black.cells[i]!==1)throw new Error('Black and white must cover all of A1 exactly once.');
 const area=white.tiles.reduce((n,p)=>n+p.w*p.h,0)/144;
 const options=input.levels===undefined?difficultyLevels({solution:white.tiles,area_in2:area}):input.levels;
 if(!Array.isArray(options)||options.length<1||options.length>4)throw Error('Expected 1–4 difficulty solutions.');
 let previous=0;
 const levels=options.map((option,index)=>{
  const check=zone(option.solution);for(let i=0;i<7056;i++)if(check.cells[i]!==white.cells[i])throw Error('Difficulty solution changes the outline.');
  if(check.tiles.length<=previous)throw Error('Difficulty levels must have increasing tile counts.');previous=check.tiles.length;
  const counts={};check.tiles.forEach(p=>counts[p.piece]=(counts[p.piece]||0)+1);
  return {level:index+1,tile_count:check.tiles.length,mean_area_in2:area/check.tiles.length,solution:check.tiles,inventory:Object.entries(counts).sort().map(([piece,count])=>({piece,count}))};
 });
 const source_id=String(input.source_id||'custom').slice(0,100);
 const payload={schema_version:1,board_units:84,units_per_inch:12,origin:'top-left',x_axis:'right',y_axis:'down',source_id,area_in2:area,coverage:area/49,playable:white.tiles,blocked:black.tiles,levels,difficulty_basis:'Exact merges and subdivisions; estimated difficulty, not a human-validated rating.'};
 const id=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {id,...payload};
}
module.exports={validateSnapshot,zone,difficultyLevels};
