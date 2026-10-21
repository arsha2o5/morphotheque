const http=require('node:http');
const {validateSnapshot}=require('./geometry.cjs');
const {search,makeGame}=require('./combinations.cjs');
async function readBody(req,max=131072){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>max)throw Error('Request too large.');}return JSON.parse(text);}
function createHandler(store,{baseUrl='',allowedOrigins=['https://morphotheque.onrender.com'],catalog=null}={}){
 const hits=new Map();
 return async(req,res)=>{
  const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  const origin=req.headers.origin;
  if(origin&&allowedOrigins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin';}
  const send=(code,body,extra={})=>{res.writeHead(code,{...headers,...extra});res.end(JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='OPTIONS'){if(origin&&!allowedOrigins.includes(origin))return send(403,{error:'Origin not allowed'});return send(204,{}, {'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});}
   if(['POST','PATCH','DELETE'].includes(req.method)&&origin&&!allowedOrigins.includes(origin))return send(403,{error:'Origin not allowed'});
   if(url.pathname==='/api/v1/combinations/catalog'&&req.method==='GET'){const published=await store.catalog();return send(200,{website_lands:catalog?catalog.count():0,published_lands:published.length,source:'Full website catalog plus additional active published lands'});}
   const catalogMatch=url.pathname.match(/^\/api\/v1\/catalog\/lands\/([1-9]\d*)$/);
   if(catalogMatch&&req.method==='GET'){const land=catalog?.get('catalog:'+catalogMatch[1]);return land?send(200,{...land,reference_id:'catalog:'+catalogMatch[1]}):send(404,{error:'Catalog land not found'});}
   if(url.pathname==='/api/v1/combinations/search'&&req.method==='POST'){
    try{const input=await readBody(req);const published=await store.catalog();const lands=catalog?catalog.merge(published):published;return send(200,{...search(lands,input),eligible_land_count:lands.length,website_land_count:catalog?catalog.count():0});}catch(error){return send(422,{error:error.message});}
   }
   if(url.pathname==='/api/v1/games'&&req.method==='POST'){
    try{const input=await readBody(req);if(!Array.isArray(input.land_ids)||!input.land_ids.length||input.land_ids.length>24||input.land_ids.some(id=>typeof id!=='string'||!/^([a-f0-9]{64}|catalog:[1-9]\d*)$/.test(id)))throw Error('Invalid layer IDs.');
     const lands=[];for(const id of input.land_ids){if(id.startsWith('catalog:')){const land=catalog?.get(id);if(!land)throw Error('A website land is missing.');lands.push(land);}else{const row=await store.get(id);if(!row||row.enabled===false)throw Error('A layer is missing or unpublished.');lands.push(row.payload);}}
     const game=makeGame(lands,input.inventory);await store.saveGame(game);return send(201,{...game,url:baseUrl+'/api/v1/games/'+game.id});
    }catch(error){return send(422,{error:error.message});}
   }
   if(url.pathname==='/api/v1/games'&&req.method==='GET')return send(200,{games:await store.listGames()});
   const activateMatch=url.pathname.match(/^\/api\/v1\/games\/([a-f0-9]{64})\/activate$/);
   if(activateMatch&&req.method==='POST'){const row=await store.getGame(activateMatch[1]);if(!row)return send(404,{error:'Game not found'});await store.saveGame(row.payload);return send(200,{id:row.payload.id,active:true});}
   const gameMatch=url.pathname.match(/^\/api\/v1\/games\/(active|[a-f0-9]{64})$/);
   if(gameMatch&&req.method==='GET'){const row=await store.getGame(gameMatch[1]);return row?send(200,{...row.payload,created_at:row.created_at}):send(404,{error:'Game not found'});}
   const manageMatch=url.pathname.match(/^\/api\/v1\/lands\/([a-f0-9]{64})$/);
   if(manageMatch&&['PATCH','DELETE'].includes(req.method)){
    try{const input=req.method==='DELETE'?{enabled:false}:await readBody(req);if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw Error('enabled must be boolean.');if(input.title!==undefined&&(typeof input.title!=='string'||input.title.length>100))throw Error('Title must contain at most 100 characters.');const row=await store.update(manageMatch[1],input);return row?send(200,row):send(404,{error:'Land not found'});}catch(error){return send(422,{error:error.message});}
   }
   if(url.pathname==='/health'){await store.health();return send(200,{status:'ok',schema_version:1});}
   if(url.pathname==='/api/v1/lands'&&req.method==='POST'){
    if(origin&&!allowedOrigins.includes(origin))return send(403,{error:'Origin not allowed'});
    if(!/^application\/json\b/i.test(req.headers['content-type']||''))return send(415,{error:'Send application/json'});
    const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();const now=Date.now();let hit=hits.get(ip);if(!hit||now-hit.start>3600000){hit={start:now,count:0};hits.set(ip,hit);}if(++hit.count>60)return send(429,{error:'Publishing limit reached. Try again later.'},{'Retry-After':'3600'});if(hits.size>10000)for(const [key,value]of hits)if(now-value.start>3600000)hits.delete(key);
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>131072)return send(413,{error:'Configuration exceeds 128 KiB'});}
    let snapshot;try{snapshot=validateSnapshot(JSON.parse(text));}catch(error){return send(422,{error:error.message});}
    const result=await store.save(snapshot);return send(result.created?201:200,{id:snapshot.id,url:baseUrl+'/api/v1/lands/'+snapshot.id,created:result.created,created_at:result.created_at,level_count:snapshot.levels.length});
   }
   if(url.pathname==='/api/v1/lands'&&req.method==='GET'){
    const limit=Math.min(100,Math.max(1,Number.parseInt(url.searchParams.get('limit'))||50));const after=url.searchParams.get('after')||'';if(after&&!/^[a-f0-9]{64}$/.test(after))return send(400,{error:'Invalid pagination cursor'});
    const rows=await store.list(limit+1,after,url.searchParams.get('include_unpublished')==='true');const more=rows.length>limit;const selected=rows.slice(0,limit);return send(200,{schema_version:1,lands:selected.map(r=>({...r,url:baseUrl+'/api/v1/lands/'+r.id})),next_cursor:more?selected[selected.length-1].id:null});
   }
   const match=url.pathname.match(/^\/api\/v1\/lands\/([a-f0-9]{64})$/);
   if(match&&req.method==='GET'){const row=await store.get(match[1]);if(!row)return send(404,{error:'Land not found'});return send(200,{...row.payload,created_at:row.created_at});}
   return send(404,{error:'Not found'});
  }catch(error){console.error('API request failed:',error.code||error.name);return send(503,{error:'Storage unavailable. Publishing was not confirmed; try again.'});}
 };
}
function databaseUrl(value){
 let text=String(value||'').trim();
 if((text.startsWith('"')&&text.endsWith('"'))||(text.startsWith("'")&&text.endsWith("'")))text=text.slice(1,-1).trim();
 let parsed;try{parsed=new URL(text);}catch{throw Error('DATABASE_URL must contain the full copied PostgreSQL connection URL.');}
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.pathname.slice(1))throw Error('DATABASE_URL must be the complete PostgreSQL connection URL, not the hostname or dashboard URL.');
 return text;
}
async function main(){
 const {Pool}=require('pg');if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not configured. Add the private internal Render Postgres URL in the service environment.');process.exitCode=1;return;}
 let connectionString;try{connectionString=databaseUrl(process.env.DATABASE_URL);}catch(error){console.error(error.message);process.exitCode=1;return;}
 const hostname=new URL(connectionString).hostname;console.log('Database connection hostname:',hostname);
 const pool=new Pool({connectionString,max:5,connectionTimeoutMillis:10000});
 await pool.query('CREATE TABLE IF NOT EXISTS unity_lands (id text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
 await pool.query("ALTER TABLE unity_lands ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT ''");
 await pool.query('CREATE TABLE IF NOT EXISTS unity_games (id text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz NOT NULL DEFAULT now())');
 const store={health:()=>pool.query('SELECT 1'),save:async p=>{const result=await pool.query('INSERT INTO unity_lands (id,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING created_at',[p.id,p]);if(result.rows.length)return {created:true,created_at:result.rows[0].created_at};const existing=await pool.query('SELECT created_at FROM unity_lands WHERE id=$1',[p.id]);return {created:false,created_at:existing.rows[0].created_at};},get:async id=>(await pool.query('SELECT payload,created_at FROM unity_lands WHERE id=$1',[id])).rows[0],list:async(limit,after)=>(await pool.query("SELECT id, created_at, payload->>'source_id' AS source_id, jsonb_array_length(payload->'levels') AS level_count FROM unity_lands WHERE id>$1 ORDER BY id LIMIT $2",[after,limit])).rows};
 store.list=async(limit,after,include=false)=>(await pool.query("SELECT id, created_at, enabled, title, payload->>'source_id' AS source_id, jsonb_array_length(payload->'levels') AS level_count FROM unity_lands WHERE id>$1 AND ($3 OR enabled) ORDER BY id LIMIT $2",[after,limit,include])).rows;
 store.get=async id=>(await pool.query('SELECT payload,created_at,enabled,title FROM unity_lands WHERE id=$1',[id])).rows[0];
 store.catalog=async()=>(await pool.query('SELECT payload FROM unity_lands WHERE enabled ORDER BY id')).rows.map(r=>r.payload);
 store.update=async(id,p)=>(await pool.query('UPDATE unity_lands SET enabled=COALESCE($2,enabled),title=COALESCE($3,title) WHERE id=$1 RETURNING id,enabled,title',[id,p.enabled??null,p.title??null])).rows[0];
 store.saveGame=async p=>pool.query('INSERT INTO unity_games(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET activated_at=now()',[p.id,p]);
 store.getGame=async id=>(await pool.query(id==='active'?'SELECT payload,created_at FROM unity_games ORDER BY activated_at DESC,id LIMIT 1':'SELECT payload,created_at FROM unity_games WHERE id=$1',id==='active'?[]:[id])).rows[0];
 store.listGames=async()=>(await pool.query("SELECT id,created_at,activated_at,payload->>'layer_count' AS layer_count,payload->>'piece_count' AS piece_count FROM unity_games ORDER BY activated_at DESC LIMIT 100")).rows;
 const {createCatalog}=require('./catalog.cjs');
 const server=http.createServer(createHandler(store,{catalog:createCatalog(),baseUrl:(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,''),allowedOrigins:(process.env.ALLOWED_ORIGINS||'https://morphotheque.onrender.com').split(',')}));
 server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Unity publishing API listening'));
 process.on('SIGTERM',()=>server.close(()=>pool.end().then(()=>process.exit(0))));
}
if(require.main===module)main().catch(e=>{console.error('Startup failed:',e.code||e.name);if(e.code==='ENOTFOUND')console.error('Database hostname could not be resolved:',/^[a-zA-Z0-9.-]+$/.test(e.hostname||'')?e.hostname:'unavailable');process.exitCode=1;});
module.exports={createHandler,databaseUrl};
