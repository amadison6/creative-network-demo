// Server-only session contract for the Task Manager development boundary.
// No sign-in/issuer route is activated by this module.
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function decode(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function issueWorkOwnerSession({id,audience,secret,now=Date.now()}) {
  if(!id || audience!=='task-manager' || typeof secret!=='string' || secret.length<32)throw new Error('invalid_session_configuration');
  const payload=encode(new TextEncoder().encode(JSON.stringify({id,aud:audience,iat:now,exp:now+3600000})));
  const sig=encode(await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(payload)));
  return payload+'.'+sig;
}
export async function verifyWorkOwnerSession(request,{secret,ownerId,now=Date.now()}) {
  if(typeof secret!=='string' || secret.length<32 || !ownerId)return null;
  try {
    const cookie=request.headers.get('cookie')||'';
    const matches=cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-work-dev='));
    if(matches.length!==1)return null;
    const token=matches[0].slice('__Host-work-dev='.length);
    const parts=token.split('.');if(parts.length!==2)return null;
    if(!await crypto.subtle.verify('HMAC',await key(secret),decode(parts[1]),new TextEncoder().encode(parts[0])))return null;
    const p=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if(p.id!==ownerId || p.aud!=='task-manager' || !Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||p.exp<=now||p.exp-p.iat!==3600000)return null;
    return {id:p.id};
  }catch{return null;}
}
