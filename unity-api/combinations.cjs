const {createHash}=require('node:crypto');
const signature=inventory=>inventory.map(p=>[p.piece,p.count]).sort((a,b)=>a[0].localeCompare(b[0])).map(p=>p.join(':')).join(',');
function inventoryFor(levels){const counts=new Map();for(const l of levels)for(const p of l.inventory)counts.set(p.piece,(counts.get(p.piece)||0)+p.count);return [...counts].sort().map(([piece,count])=>({piece,count}));}
function uniqueLevels(land){const seen=new Set();return land.levels.filter(l=>{const key=JSON.stringify(l.solution);if(seen.has(key))return false;seen.add(key);return true;});}
// Counts verified combinations of the stored solutions, not all possible tilings.
function evaluate(lands,pieceCount,{inventory=null,budget=100000,witnessLimit=100}={}){
 const options=lands.map(uniqueLevels),groups=new Map();let visited=0,truncated=false;
 const min=Array(lands.length+1).fill(0),max=[...min];
 for(let i=lands.length-1;i>=0;i--){min[i]=min[i+1]+Math.min(...options[i].map(l=>l.tile_count));max[i]=max[i+1]+Math.max(...options[i].map(l=>l.tile_count));}
 const wanted=inventory?signature(inventory):null;
 function visit(i,count,path){if(++visited>budget){truncated=true;return;}if(count+min[i]>pieceCount||count+max[i]<pieceCount)return;
  if(i===lands.length){const inv=inventoryFor(path),key=signature(inv);if(wanted&&key!==wanted)return;let group=groups.get(key);if(!group){if(groups.size>=8000){truncated=true;return;}group={inventory:inv,solution_count:0,solutions:[]};groups.set(key,group);}group.solution_count++;if(group.solutions.length<witnessLimit)group.solutions.push(path.map(l=>l.level));return;}
  for(const level of options[i]){visit(i+1,count+level.tile_count,[...path,level]);if(truncated)return;}
 }
 visit(0,0,[]);return {groups:[...groups.values()],visited,truncated};
}
function search(lands,{layer_count=10,piece_count,min_solutions=1,limit=10,allow_repeated_lands=false}={}){
 for(const [name,value,lo,hi]of [['layer_count',layer_count,1,24],['piece_count',piece_count,1,1176],['min_solutions',min_solutions,1,100],['limit',limit,1,30]])if(!Number.isInteger(value)||value<lo||value>hi)throw Error(`${name} must be an integer from ${lo} to ${hi}.`);
 if(!lands.length||(!allow_repeated_lands&&lands.length<layer_count))return {combinations:[],search_complete:true,message:'Not enough published lands. Add lands or allow repeated lands.'};
 const results=[],seen=new Set();let seed=1729,visited=0,attempts=0,truncated=false;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 while(attempts++<120&&results.length<limit&&visited<600000){
  const chosen=allow_repeated_lands?Array.from({length:layer_count},()=>lands[Math.floor(random()*lands.length)]):lands.map(x=>({x,key:random()})).sort((a,b)=>a.key-b.key).slice(0,layer_count).map(a=>a.x);
  const setKey=chosen.map(l=>l.id).sort().join(',');if(seen.has(setKey))continue;seen.add(setKey);
  const checked=evaluate(chosen,piece_count,{budget:Math.min(100000,600000-visited)});visited+=checked.visited;truncated ||= checked.truncated;
  for(const group of checked.groups)if(group.solution_count>=min_solutions){results.push({land_ids:chosen.map(l=>l.id),layer_count,piece_count,...group,count_is_lower_bound:checked.truncated});if(results.length>=limit)break;}
 }
 return {combinations:results,search_complete:false,visited,attempted_stacks:seen.size,message:'Bounded search of stored land solutions. Counts refer to one identical piece inventory; more solutions and stacks may exist.',truncated};
}
function makeGame(lands,inventory){
 if(!Array.isArray(lands)||!lands.length||lands.length>24)throw Error('Choose 1–24 layers.');
 if(!Array.isArray(inventory)||inventory.some(p=>!/^A([2-9]|[12][0-9]|3[0-6])$/.test(p.piece)||!Number.isInteger(p.count)||p.count<1)||new Set(inventory.map(p=>p.piece)).size!==inventory.length)throw Error('Invalid piece inventory.');
 const piece_count=inventory.reduce((n,p)=>n+p.count,0);if(piece_count>1176)throw Error('Too many pieces.');
 const result=evaluate(lands,piece_count,{inventory,budget:600000});const group=result.groups.find(g=>signature(g.inventory)===signature(inventory));if(!group)throw Error('No verified solution uses this inventory.');
 const payload={schema_version:1,kind:'tower-game',layer_count:lands.length,piece_count,inventory:group.inventory,layers:lands,solution_count:group.solution_count,count_is_lower_bound:result.truncated,solutions:group.solutions,solution_basis:'Verified assignments of stored solutions using exactly the same piece types and counts.'};
 return {id:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),...payload};
}
module.exports={search,evaluate,makeGame,inventoryFor};
