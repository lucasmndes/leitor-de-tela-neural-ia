import assert from 'node:assert/strict';
import {SpeechCache} from '../extension/cache.js';
class Store {
  rows=new Map();async get(id){return this.rows.get(id)}async put(record){this.rows.set(record.id,record)}async remove(id){this.rows.delete(id)}async clear(){this.rows.clear()}async list(){return [...this.rows.values()]}
}
const store=new Store(),controller=new AbortController(),signal=controller.signal;
let time=100,calls=0;
const make=()=>{calls++;return Promise.resolve(new Uint8Array([1,2,3,4]).buffer)};
const cache=new SpeechCache({store,now:()=>time,ttl:10,maxBytes:12,maxEntries:3});
const key=['not-a-real-key','model','voice','instructions','texto'];
let results=[];
const a=await cache.get(key,make,signal,r=>results.push(r));
new Uint8Array(a)[0]=99;
const b=await cache.get(key,make,signal,r=>results.push(r));
assert.equal(new Uint8Array(b)[0],1,'Retornar cópia: Web Audio pode consumir/desanexar buffers');assert.equal(calls,1);assert.deepEqual(results,['generated','reused']);
const reopened=new SpeechCache({store,now:()=>time,ttl:10,maxBytes:12,maxEntries:3});
await reopened.get(key,make,signal);assert.equal(calls,1,'Cache continua ao reabrir painel');
await cache.get([...key,'outra voz'],make,signal);assert.equal(calls,2);
time=111;await cache.get(key,make,signal);assert.equal(calls,3,'Áudio expirado deve ser renovado');
await cache.get(['outro texto'],make,signal);await cache.get(['terceiro texto'],make,signal);await cache.get(['quarto texto'],make,signal);
assert.ok([...store.rows.values()].reduce((n,r)=>n+r.bytes,0)<=12);assert.ok(store.rows.size<=3);
await cache.clear();assert.equal(store.rows.size,0);
let release;const waiting=()=>{calls++;return new Promise(r=>release=()=>r(new Uint8Array([5]).buffer))};
const before=calls;const x=cache.get(['duplicado'],waiting,signal);await new Promise(r=>setImmediate(r));const y=cache.get(['duplicado'],waiting,signal);await new Promise(r=>setImmediate(r));release();await Promise.all([x,y]);assert.equal(calls,before+1,'Requisições simultâneas iguais compartilham geração');
await cache.clear();
await assert.rejects(cache.get(['falha'],()=>Promise.reject(new Error('API 403')),signal),/API 403/);assert.equal(store.rows.size,0);
const aborted=new AbortController();aborted.abort();const beforeAbort=calls;await assert.rejects(cache.get(['cancelado'],make,aborted.signal),{name:'AbortError'});assert.equal(calls,beforeAbort);
assert.ok([...store.rows.keys()].every(k=>/^[a-f0-9]{64}$/.test(k)));
const unavailable=new SpeechCache({store:{get:async()=>{throw Error('storage')},list:async()=>{throw Error('storage')}}});assert.equal((await unavailable.get(key,make,signal)).byteLength,4,'Cache indisponível não impede reprodução');
console.log('PASS: repetição sem API, reabertura, cópias independentes, voz separada, expiração, limite, limpeza, deduplicação em andamento, falhas e cancelamento.');
