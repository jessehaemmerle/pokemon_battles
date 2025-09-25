import fs from 'fs'; import path from 'path';
const dir = process.env.CACHE_DIR || './data/cache';
if(!fs.existsSync(dir)){ fs.mkdirSync(dir, { recursive: true }); }
export async function cachedFetchJson(fetch, url, ttlMs=86400000){
  const key = Buffer.from(url).toString('base64').replace(/[/+=]/g,'_');
  const file = path.join(dir, key + '.json');
  try{
    const st = fs.statSync(file);
    if(Date.now() - st.mtimeMs < ttlMs){
      return JSON.parse(fs.readFileSync(file,'utf-8'));
    }
  }catch{}
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  const data = await r.json();
  try{ fs.writeFileSync(file, JSON.stringify(data)); }catch{}
  return data;
}
