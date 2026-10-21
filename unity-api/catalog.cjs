const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {validateSnapshot}=require('./geometry.cjs');
const ordered=tiles=>tiles.map(t=>({piece:t.piece,x:t.x,y:t.y,w:t.w,h:t.h})).sort((a,b)=>a.y-b.y||a.x-b.x||a.w-b.w||a.h-b.h);
function geometryKey(land){return createHash('sha256').update(JSON.stringify({playable:ordered(land.playable),blocked:ordered(land.blocked),levels:land.levels.map(l=>ordered(l.solution))})).digest('hex');}
function createCatalog(root=path.resolve(__dirname,'..')){
 let index,models;const shards=new Map(),snapshots=new Map();
 function getIndex(){if(!index){index=JSON.parse(fs.readFileSync(path.join(root,'api-index.json'),'utf8'));if(index.count!==index.lands.length)throw Error('Catalog index count mismatch.');}return index;}
 function getShard(file){if(!/^api-lands-\d{3}\.json$/.test(file))throw Error('Invalid catalog shard.');if(!shards.has(file)){if(shards.size>=2)shards.delete(shards.keys().next().value);const chunk=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));shards.set(file,new Map(chunk.lands.map(l=>[l.id,l])));}return shards.get(file);}
 function all(){if(!models){models=[];for(const file of new Set(getIndex().lands.map(l=>l.file))){for(const land of getShard(file).values())models.push({id:'catalog:'+land.id,source_id:'Shape '+land.id,geometry_key:geometryKey(land),levels:land.levels.map(l=>({level:l.level,tile_count:l.tile_count,inventory:l.inventory}))});}if(models.length!==getIndex().count)throw Error('Catalog shard count mismatch.');}return models;}
 function get(ref){const match=/^catalog:([1-9]\d*)$/.exec(ref);if(!match)return null;if(snapshots.has(ref))return snapshots.get(ref);const entry=getIndex().lands.find(l=>l.id===Number(match[1]));if(!entry)return null;const raw=getShard(entry.file).get(entry.id);if(!raw)return null;const snapshot=validateSnapshot({...raw,source_id:'Shape '+raw.id,board_units:84,units_per_inch:12});if(snapshots.size>=100)snapshots.delete(snapshots.keys().next().value);snapshots.set(ref,snapshot);return snapshot;}
 function merge(published){const base=all(),keys=new Set(base.map(l=>l.geometry_key));return [...base,...published.filter(l=>!keys.has(geometryKey(l)))];}
 return {all,get,merge,count:()=>getIndex().count};
}
module.exports={createCatalog,geometryKey};
