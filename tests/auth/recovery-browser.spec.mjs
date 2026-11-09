import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { database } from './fixture.mjs';
import { handleAuth } from '../../lib/auth/gateway.mjs';

test('real browser WebAuthn: signup, download-ready codes, lost-phone replacement and replay rejection',async({page})=>{
  const db=database(),server=createServer();
  server.listen(0);await once(server,'listening');
  const origin='http://localhost:'+server.address().port;
  const env={AUTH_DB:db,BETTER_AUTH_URL:origin,
    BETTER_AUTH_SECRET:'LOCAL-TEST-ONLY-recovery-browser-secret-123456789',
    PASSKEY_LOGIN_ENABLED:'true',PASSKEY_RP_ID:'localhost',PUBLIC_SIGNUP_ENABLED:'true',
    TURNSTILE_SITE_KEY:'test-key',TURNSTILE_SECRET_KEY:'test-secret'};
  server.on('request',async(req,res)=>{
    try{
      if(req.url==='/'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Recovery test</title>');return;
      }
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const headers=new Headers(req.headers);headers.set('CF-Connecting-IP','127.0.0.1');
      const response=await handleAuth({env,request:new Request(origin+req.url,{
        method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})
      })},{fetch:async()=>Response.json({success:true,hostname:'localhost',action:'signup'}),
        onError:error=>console.error('SYNTHETIC RECOVERY TEST ERROR:',error?.message)});
      res.statusCode=response.status;
      for(const [key,value] of response.headers)if(key.toLowerCase()!=='set-cookie')res.setHeader(key,value);
      for(const cookie of response.headers.getSetCookie())res.appendHeader('Set-Cookie',cookie);
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(500);res.end('Server error');}
  });
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('WebAuthn.enable');
    const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
      protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
      isUserVerified:true,automaticPresenceSimulation:true
    }});
    await page.goto(origin+'/');
    const result=await page.evaluate(async()=>{
      const api=async(route,body)=>{
        const response=await fetch('/api/auth/'+route,{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
        });
        return {status:response.status,body:await response.json()};
      };
      const from64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),x=>x.charCodeAt(0));
      const to64=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const create=async options=>{
        const credential=await navigator.credentials.create({publicKey:{
          ...options,challenge:from64(options.challenge),
          user:{...options.user,id:from64(options.user.id)}
        }});
        return {id:credential.id,rawId:to64(credential.rawId),type:credential.type,
          authenticatorAttachment:credential.authenticatorAttachment,
          response:{clientDataJSON:to64(credential.response.clientDataJSON),
            attestationObject:to64(credential.response.attestationObject),
            transports:credential.response.getTransports()},
          clientExtensionResults:credential.getClientExtensionResults()};
      };
      const signup=await api('passkey-signup/options',{username:'recovery_browser',turnstileToken:'test'});
      const initialCredential=await create(signup.body.publicKey);
      const verified=await api('passkey-signup/verify',{
        attemptId:signup.body.attemptId,challenge:signup.body.publicKey.challenge,credential:initialCredential
      });
      const codes=await api('passkey/recovery-codes/rotate',{});
      await api('sign-out',{});
      const recovery=await api('passkey/recovery/options',{username:'recovery_browser',code:codes.body.codes?.[0]});
      const newCredential=recovery.status===200?await create(recovery.body.publicKey):null;
      const payload={attemptId:recovery.body.attemptId,challenge:recovery.body.challenge,credential:newCredential};
      const recovered=await api('passkey/recovery/verify',payload);
      const replay=await api('passkey/recovery/verify',payload);
      const oldCode=await api('passkey/recovery/options',{username:'recovery_browser',code:codes.body.codes?.[1]});
      return {signup:verified.status,codes:codes.status,codeCount:codes.body.codes?.length,
        recovery:recovery.status,recovered:recovered.status,replay:replay.status,oldCode:oldCode.status,
        recoveryError:recovery.status===200?null:recovery.body?.message};
    });
    expect(result).toEqual({signup:201,codes:200,codeCount:8,recovery:200,recovered:200,replay:403,oldCode:403,recoveryError:null});
    expect(db.sqlite.prepare('SELECT COUNT(*) n FROM passkey').get().n).toBe(1);
    expect(db.sqlite.prepare('SELECT COUNT(*) n FROM session').get().n).toBe(0);
    expect(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_recovery_code').get().n).toBe(0);
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
  }finally{
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
  }
});
