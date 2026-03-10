'use strict';
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const url    = require('url');

// Config: Railway env vars OR local config.json
let CFG = {};
const cfgFile = path.join(__dirname, 'config.json');
if (fs.existsSync(cfgFile)) { try { CFG = JSON.parse(fs.readFileSync(cfgFile,'utf8')); } catch(e){} }

const PORT         = process.env.PORT || CFG.port || 3000;
const YA_LOGIN     = process.env.YA_LOGIN  || CFG.yandex_login || '';
const YA_PASS      = process.env.YA_PASS   || CFG.yandex_app_password || '';
const CLOUD_FOLDER = process.env.CLOUD_FOLDER || CFG.cloud_folder || 'AliPlanner';
const HAS_YANDEX   = YA_LOGIN && YA_PASS && !YA_LOGIN.includes('ВАШ');
const HTML_FILE    = path.join(__dirname, 'AliPlanner.html');
const BASIC_AUTH   = HAS_YANDEX ? 'Basic '+Buffer.from(YA_LOGIN+':'+YA_PASS).toString('base64') : '';

// In-memory store
let _users={}, _userData={}, _loaded=false;
const sessions=new Map();

function log(m){ console.log('['+new Date().toISOString()+'] '+m); }

// WebDAV
function yadReq(method,rp,body){
  return new Promise((res,rej)=>{
    const p=encodeURI('/'+CLOUD_FOLDER+'/'+(rp||'').replace(/^\//,''));
    const opts={hostname:'webdav.yandex.ru',port:443,path:rp===''?encodeURI('/'+CLOUD_FOLDER):p,method,headers:{'Authorization':BASIC_AUTH,'Accept':'*/*'}};
    if(body){const b=Buffer.from(body,'utf8');opts.headers['Content-Type']='application/json';opts.headers['Content-Length']=b.length;}
    const req=https.request(opts,r=>{const ch=[];r.on('data',c=>ch.push(c));r.on('end',()=>res({s:r.statusCode,b:Buffer.concat(ch).toString('utf8')}));});
    req.on('error',rej);if(body)req.write(body);req.end();
  });
}
async function yadGet(p){const r=await yadReq('GET',p);return r.s===200?r.b:null;}
async function yadPut(p,c){try{const r=await yadReq('PUT',p,c);return r.s===201||r.s===204;}catch(e){return false;}}
async function yadMkcol(p){
  return new Promise(res=>{
    const ep=p===''?encodeURI('/'+CLOUD_FOLDER):encodeURI('/'+CLOUD_FOLDER+'/'+p);
    const req=https.request({hostname:'webdav.yandex.ru',port:443,path:ep,method:'MKCOL',headers:{'Authorization':BASIC_AUTH}},r=>res(r.statusCode));
    req.on('error',()=>res(0));req.end();
  });
}

async function ensureYandex(){
  if(!HAS_YANDEX)return;
  const s=await yadMkcol('');
  if(s===401){log('ОШИБКА: неверный логин/пароль Яндекс Диска');return;}
  await yadMkcol('users');
  log('Яндекс Диск готов: /'+CLOUD_FOLDER);
}

async function loadAll(){
  if(_loaded)return;
  if(!HAS_YANDEX){_loaded=true;log('Яндекс не настроен — данные в памяти');return;}
  try{
    const raw=await yadGet('users.json');
    if(raw){_users=JSON.parse(raw);log('Пользователей: '+Object.keys(_users).length);}
    for(const uid of Object.keys(_users)){
      const d=await yadGet('users/data-'+uid+'.json');
      if(d)_userData[uid]=d;
    }
    log('Данные загружены с Яндекс Диска');
  }catch(e){log('Ошибка загрузки: '+e.message);}
  _loaded=true;
}

async function saveUsers(){if(!HAS_YANDEX)return;await yadPut('users.json',JSON.stringify(_users,null,2));}
function saveUserData(uid){if(HAS_YANDEX&&_userData[uid])yadPut('users/data-'+uid+'.json',_userData[uid]);}

// Auth
function hashPwd(p,s){return crypto.createHmac('sha256',s).update(p).digest('hex');}
function genToken(){return crypto.randomBytes(32).toString('hex');}
function genId(){return crypto.randomBytes(8).toString('hex');}
function getCookie(req,n){const h=req.headers.cookie||'';const m=h.split(';').map(c=>c.trim()).find(c=>c.startsWith(n+'='));return m?m.slice(n.length+1):null;}
function getSess(req){const t=getCookie(req,'ali_session');if(!t)return null;const s=sessions.get(t);if(!s||Date.now()>s.expires){sessions.delete(t);return null;}return{...s,token:t};}
function readBody(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6)rej(new Error('too large'));});req.on('end',()=>res(b));req.on('error',rej);});}
function jRes(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function cookie(token,age){const secure=process.env.NODE_ENV==='production'?'; Secure':'';return 'ali_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+secure;}

const server=http.createServer(async(req,res)=>{
  if(!_loaded)await loadAll();
  const pn=url.parse(req.url).pathname;
  try{
    if(req.method==='GET'&&(pn==='/'||pn==='/index.html')){
      const html=fs.readFileSync(HTML_FILE,'utf8');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
      return res.end(html);
    }
    if(req.method==='POST'&&pn==='/auth/register'){
      const{username,email,password}=JSON.parse(await readBody(req));
      if(!username||!email||!password)return jRes(res,400,{error:'Заполни все поля'});
      if(username.length<2)return jRes(res,400,{error:'Имя минимум 2 символа'});
      if(password.length<6)return jRes(res,400,{error:'Пароль минимум 6 символов'});
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return jRes(res,400,{error:'Неверный email'});
      const users=Object.values(_users);
      if(users.find(u=>u.email.toLowerCase()===email.toLowerCase()))return jRes(res,409,{error:'Email уже занят'});
      if(users.find(u=>u.username.toLowerCase()===username.toLowerCase()))return jRes(res,409,{error:'Имя уже занято'});
      const salt=crypto.randomBytes(16).toString('hex');
      const uid=genId();
      _users[uid]={id:uid,username,email:email.toLowerCase(),passwordHash:hashPwd(password,salt),salt,createdAt:new Date().toISOString()};
      await saveUsers();log('Registered: '+username);
      const token=genToken();sessions.set(token,{userId:uid,username,expires:Date.now()+30*24*3600*1000});
      res.setHeader('Set-Cookie',cookie(token,30*24*3600));
      return jRes(res,200,{ok:true,username,userId:uid});
    }
    if(req.method==='POST'&&pn==='/auth/login'){
      const{email,password}=JSON.parse(await readBody(req));
      const user=Object.values(_users).find(u=>u.email.toLowerCase()===(email||'').toLowerCase());
      if(!user||hashPwd(password,user.salt)!==user.passwordHash)return jRes(res,401,{error:'Неверный email или пароль'});
      const token=genToken();sessions.set(token,{userId:user.id,username:user.username,expires:Date.now()+30*24*3600*1000});
      log('Login: '+user.username);
      res.setHeader('Set-Cookie',cookie(token,30*24*3600));
      return jRes(res,200,{ok:true,username:user.username,userId:user.id});
    }
    if(req.method==='POST'&&pn==='/auth/logout'){
      const s=getSess(req);if(s)sessions.delete(s.token);
      res.setHeader('Set-Cookie','ali_session=; Path=/; Max-Age=0');
      return jRes(res,200,{ok:true});
    }
    if(req.method==='GET'&&pn==='/auth/me'){
      const s=getSess(req);if(!s)return jRes(res,401,{error:'Не авторизован'});
      return jRes(res,200,{ok:true,username:s.username,userId:s.userId});
    }
    if(req.method==='GET'&&pn==='/data'){
      const s=getSess(req);if(!s)return jRes(res,401,{error:'Не авторизован'});
      const raw=_userData[s.userId];
      if(raw){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(raw);}
      res.writeHead(404);return res.end('{}');
    }
    if(req.method==='POST'&&pn==='/save'){
      const s=getSess(req);if(!s)return jRes(res,401,{error:'Не авторизован'});
      const body=await readBody(req);JSON.parse(body);
      _userData[s.userId]=body;saveUserData(s.userId);
      return jRes(res,200,{ok:true});
    }
    if(req.method==='GET'&&pn==='/health'){
      return jRes(res,200,{ok:true,users:Object.keys(_users).length,yandex:HAS_YANDEX});
    }
    res.writeHead(404);res.end('Not found');
  }catch(e){log('Error: '+e.message);res.writeHead(500);res.end('Error: '+e.message);}
});

(async()=>{
  if(HAS_YANDEX){log('Подключаюсь к Яндекс Диску...');await ensureYandex();}
  else log('⚠  Задай YA_LOGIN и YA_PASS в Environment Variables');
  await loadAll();
  server.listen(PORT,()=>{
    log('✅ AliPlanner запущен на порту '+PORT);
    if(process.env.RAILWAY_PUBLIC_DOMAIN)log('🌐 https://'+process.env.RAILWAY_PUBLIC_DOMAIN);
  });
})();

server.on('error',e=>{log('Fatal: '+e.message);process.exit(1);});
process.on('SIGINT',()=>{server.close();process.exit();});
process.on('SIGTERM',()=>{server.close();process.exit();});
