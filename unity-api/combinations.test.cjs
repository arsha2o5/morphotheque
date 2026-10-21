const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {validateSnapshot}=require('./geometry.cjs'),{evaluate,search,makeGame,inventoryFor}=require('./combinations.cjs'),{createHandler}=require('./server.cjs');
function fixture(name){return validateSnapshot({board_units:84,units_per_inch:12,source_id:name,playable:[{piece:'A4',x:0,y:0,w:84,h:48}],blocked:[{piece:'A7',x:0,y:48,w:84,h:36}]});}
const lands=['a','b','c'].map(fixture);
test('solutions require identical type counts, not just equal total pieces',()=>{
 const inv=inventoryFor([lands[0].levels[0],lands[1].levels[1],lands[2].levels[1]]),n=inv.reduce((s,p)=>s+p.count,0);
 const result=evaluate(lands,n,{inventory:inv});assert.equal(result.truncated,false);const g=result.groups[0];assert(g.solution_count>=3);
 for(const assignment of g.solutions){const levels=assignment.map((level,i)=>lands[i].levels.find(l=>l.level===level));assert.deepEqual(inventoryFor(levels),inv);assert.equal(levels.reduce((s,l)=>s+l.tile_count,0),n);}
 const game=makeGame(lands,inv);assert.equal(game.piece_count,n);assert.equal(game.layers.length,3);assert.equal(game.id,makeGame(lands,inv).id);
 assert.throws(()=>makeGame(lands,[{piece:'A36',count:n}]));
 const matches=search(lands,{layer_count:3,piece_count:n,min_solutions:3,limit:10});assert(matches.combinations.some(c=>c.solution_count>=3));assert(matches.combinations.every(c=>c.piece_count===n));
 assert.equal(search(lands,{layer_count:4,piece_count:n}).combinations.length,0);
 assert.throws(()=>search(lands,{layer_count:0,piece_count:n}));
 assert.equal(evaluate(lands,n,{budget:1}).truncated,true);
});
test('catalog management, search, publish and active-game round trip',async()=>{
 const rows=new Map(lands.map(payload=>[payload.id,{payload,enabled:true,title:''}])),games=new Map();let active;
 const store={health:async()=>{},get:async id=>rows.get(id),catalog:async()=>[...rows.values()].filter(r=>r.enabled).map(r=>r.payload),update:async(id,p)=>{const r=rows.get(id);if(!r)return;Object.assign(r,p);return {id,enabled:r.enabled,title:r.title};},saveGame:async p=>{games.set(p.id,{payload:p});active=p.id;},getGame:async id=>games.get(id==='active'?active:id),listGames:async()=>[...games.values()].map(r=>({id:r.payload.id,piece_count:r.payload.piece_count,layer_count:r.payload.layer_count}))};
 const server=http.createServer(createHandler(store));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{
  const inv=inventoryFor([lands[0].levels[0],lands[1].levels[1],lands[2].levels[1]]),n=inv.reduce((s,p)=>s+p.count,0);
  const found=await api('/api/v1/combinations/search','POST',{layer_count:3,piece_count:n,min_solutions:3});assert.equal(found.status,200);assert(found.data.combinations.length);
  const c=found.data.combinations[0],saved=await api('/api/v1/games','POST',{land_ids:c.land_ids,inventory:c.inventory});assert.equal(saved.status,201);assert.equal((await api('/api/v1/games/active')).data.id,saved.data.id);
  assert.equal((await api('/api/v1/lands/'+lands[0].id,'PATCH',{title:'Torch',enabled:false})).status,200);assert.equal((await api('/api/v1/combinations/search','POST',{layer_count:3,piece_count:n,min_solutions:3})).data.combinations.length,0);
  assert.equal((await api('/api/v1/games/'+saved.data.id)).data.layers.length,3);
  assert.equal((await api('/api/v1/lands/'+lands[0].id,'PATCH',{enabled:true})).status,200);
  assert.equal((await api('/api/v1/games','POST',{land_ids:c.land_ids,inventory:[{piece:'A36',count:n}]})).status,422);
  assert.equal((await api('/api/v1/lands/'+lands[0].id,'DELETE')).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
