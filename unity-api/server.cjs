const http=require('node:http');
const {validateSnapshot}=require('./geometry.cjs');
function createHandler(store,{baseUrl='',allowedOrigins=['https://morphotheque.onrender.com']}={}){
 const hits=new Map();
 return async(req,res)=>{
  const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  const origin=req.headers.origin;
  if(origin&&allowedOrigins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin';}
  const send=(code,body,extra={})=>{res.writeHead(code,{...headers,...extra});res.end(JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='OPTIONS'){if(origin&&!allowedOrigins.includes(origin))return send(403,{error:'Origin not allowed'});return send(204,{}, {'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});}
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
    const rows=await store.list(limit+1,after);const more=rows.length>limit;const selected=rows.slice(0,limit);return send(200,{schema_version:1,lands:selected.map(r=>({...r,url:baseUrl+'/api/v1/lands/'+r.id})),next_cursor:more?selected[selected.length-1].id:null});
   }
   const match=url.pathname.match(/^\/api\/v1\/lands\/([a-f0-9]{64})$/);
   if(match&&req.method==='GET'){const row=await store.get(match[1]);if(!row)return send(404,{error:'Land not found'});return send(200,{...row.payload,created_at:row.created_at});}
   return send(404,{error:'Not found'});
  }catch(error){console.error('API request failed:',error.code||error.name);return send(503,{error:'Storage unavailable. Publishing was not confirmed; try again.'});}
 };
}
async function main(){
 const {Pool}=require('pg');if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not configured. Add the private internal Render Postgres URL in the service environment.');process.exitCode=1;return;}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
 await pool.query('CREATE TABLE IF NOT EXISTS unity_lands (id text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
 const store={health:()=>pool.query('SELECT 1'),save:async p=>{const result=await pool.query('INSERT INTO unity_lands (id,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING created_at',[p.id,p]);if(result.rows.length)return {created:true,created_at:result.rows[0].created_at};const existing=await pool.query('SELECT created_at FROM unity_lands WHERE id=$1',[p.id]);return {created:false,created_at:existing.rows[0].created_at};},get:async id=>(await pool.query('SELECT payload,created_at FROM unity_lands WHERE id=$1',[id])).rows[0],list:async(limit,after)=>(await pool.query("SELECT id, created_at, payload->>'source_id' AS source_id, jsonb_array_length(payload->'levels') AS level_count FROM unity_lands WHERE id>$1 ORDER BY id LIMIT $2",[after,limit])).rows};
 const server=http.createServer(createHandler(store,{baseUrl:(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,''),allowedOrigins:(process.env.ALLOWED_ORIGINS||'https://morphotheque.onrender.com').split(',')}));
 server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Unity publishing API listening'));
 process.on('SIGTERM',()=>server.close(()=>pool.end().then(()=>process.exit(0))));
}
if(require.main===module)main().catch(e=>{console.error('Startup failed:',e.code||e.name);process.exitCode=1;});
module.exports={createHandler};
