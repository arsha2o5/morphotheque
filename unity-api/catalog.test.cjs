const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createCatalog}=require('./catalog.cjs'),{createHandler}=require('./server.cjs');
test('full website catalog can search, preview, publish and reactivate without individually published lands',async()=>{
 const catalog=createCatalog(),games=new Map();let active;
 const store={catalog:async()=>[],get:async()=>undefined,saveGame:async payload=>{active=payload.id;games.set(payload.id,{payload});},getGame:async id=>games.get(id==='active'?active:id),listGames:async()=>[]};
 const server=http.createServer(createHandler(store,{catalog}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{
  const info=await api('/api/v1/combinations/catalog');assert.equal(info.data.website_lands,11354);assert.equal(info.data.published_lands,0);
  const result=await api('/api/v1/combinations/search','POST',{layer_count:10,piece_count:100,min_solutions:3,limit:3});assert.equal(result.status,200);assert.equal(result.data.eligible_land_count,11354);assert(result.data.combinations.length>0);
  const combination=result.data.combinations[0];assert.equal(new Set(combination.land_ids).size,10);assert(combination.land_ids.every(id=>/^catalog:\d+$/.test(id)));
  const preview=await api('/api/v1/catalog/lands/'+combination.land_ids[0].slice(8));assert.equal(preview.status,200);assert.equal(preview.data.reference_id,combination.land_ids[0]);assert.equal(preview.data.id.length,64);
  assert.equal(catalog.merge([preview.data]).length,11354,'Already published website geometry must not duplicate a catalog land');
  const saved=await api('/api/v1/games','POST',{land_ids:combination.land_ids,inventory:combination.inventory});assert.equal(saved.status,201);assert.equal(saved.data.layers.length,10);assert.equal(saved.data.piece_count,100);assert(saved.data.solution_count>=3);assert(saved.data.layers.every(l=>/^[a-f0-9]{64}$/.test(l.id)));
  assert.equal((await api('/api/v1/games/active')).data.id,saved.data.id);
  assert.equal((await api('/api/v1/games/'+saved.data.id+'/activate','POST',{})).status,200);
  assert.equal((await api('/api/v1/catalog/lands/999999999')).status,404);
  assert.equal((await api('/api/v1/games','POST',{land_ids:['catalog:999999999'],inventory:combination.inventory})).status,422);
 }finally{await new Promise(r=>server.close(r));}
});
