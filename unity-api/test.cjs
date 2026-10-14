const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {validateSnapshot}=require('./geometry.cjs');const {createHandler}=require('./server.cjs');
const original={board_units:84,units_per_inch:12,source_id:'Shape test',playable:[{piece:'A4',x:0,y:0,w:84,h:48}],blocked:[{piece:'A7',x:0,y:48,w:84,h:36}]};
test('snapshot levels have exact coverage and inventories',()=>{const s=validateSnapshot(original);assert.equal(s.id.length,64);assert.equal(s.levels.length,4);let previous=0;for(const l of s.levels){assert(l.tile_count>previous);previous=l.tile_count;assert.equal(l.inventory.reduce((n,p)=>n+p.count,0),l.tile_count);assert.equal(l.solution.reduce((n,p)=>n+p.w*p.h,0),84*48);}});
test('invalid dimensions, holes and overlaps are rejected',()=>{for(const mutate of [p=>p.blocked[0].y++,p=>p.blocked[0].y--,p=>p.playable[0].piece='A36',p=>p.playable[0].x=.1]){const p=structuredClone(original);mutate(p);assert.throws(()=>validateSnapshot(p));}});
test('browser difficulty levels and published snapshots are valid for edited colors',()=>{const p=structuredClone(original);[p.playable,p.blocked]=[p.blocked,p.playable];const s=validateSnapshot(p);assert.notEqual(s.id,validateSnapshot(original).id);assert.equal(validateSnapshot(p).id,s.id);});
test('HTTP publish, idempotent repeat, get, catalog, CORS and error handling',async()=>{
 const saved=new Map();const store={health:async()=>{},save:async payload=>{const existing=saved.get(payload.id);if(existing)return {created:false,created_at:existing.created_at};const created_at='2026-10-14T00:00:00Z';saved.set(payload.id,{payload,created_at});return {created:true,created_at};},get:async id=>saved.get(id),list:async(limit,after)=>[...saved.values()].filter(r=>r.payload.id>after).map(r=>({id:r.payload.id,source_id:r.payload.source_id,created_at:r.created_at,level_count:r.payload.levels.length})).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit)};
 const server=http.createServer(createHandler(store,{baseUrl:'https://example.test',allowedOrigins:['https://morphotheque.onrender.com']}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;try{
 const headers={'Content-Type':'application/json',Origin:'https://morphotheque.onrender.com'};
 const post=await fetch(base+'/api/v1/lands',{method:'POST',headers,body:JSON.stringify(original)});assert.equal(post.status,201);assert.equal(post.headers.get('Access-Control-Allow-Origin'),headers.Origin);const result=await post.json();assert.equal(result.level_count,4);assert.match(result.url,/\/api\/v1\/lands\/[a-f0-9]{64}$/);
 const repeated=await fetch(base+'/api/v1/lands',{method:'POST',headers,body:JSON.stringify(original)});assert.equal(repeated.status,200);assert.equal((await repeated.json()).created,false);
 const read=await(await fetch(base+'/api/v1/lands/'+result.id)).json();assert.equal(read.levels.length,4);assert.deepEqual(read.playable,original.playable);assert.equal(saved.size,1);
 const catalog=await(await fetch(base+'/api/v1/lands')).json();assert.equal(catalog.lands[0].id,result.id);assert.equal(catalog.next_cursor,null);
 assert.equal((await fetch(base+'/api/v1/lands',{method:'POST',headers:{...headers,Origin:'https://other.test'},body:JSON.stringify(original)})).status,403);
 const bad=structuredClone(original);bad.blocked[0].y=49;assert.equal((await fetch(base+'/api/v1/lands',{method:'POST',headers,body:JSON.stringify(bad)})).status,422);
 assert.equal((await fetch(base+'/api/v1/lands/'+'a'.repeat(64))).status,404);
 assert.equal((await fetch(base+'/api/v1/lands?after=bad')).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
