import assert from 'node:assert/strict';
import {apiError,createSpeech,pcm16ToWav,speechCacheKey,SPEECH_PROFILE,SUPPORTED_VOICES} from '../extension/speech.js';

class FakeSocket {
  static instances=[];
  constructor(url,protocols){
    this.url=url;this.protocols=protocols;this.readyState=0;this.listeners={};this.sent=[];FakeSocket.instances.push(this);
    queueMicrotask(()=>{this.readyState=1;this.emit('message',{data:JSON.stringify({type:'session.created'})});});
  }
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  emit(type,event){for(const listener of this.listeners[type]||[])listener(event);}
  send(value){
    this.sent.push(JSON.parse(value));
    if(this.sent.at(-1).type==='response.create')queueMicrotask(()=>{
      this.emit('message',{data:JSON.stringify({type:'response.output_audio.delta',delta:'AQACAAMABAA='})});
      this.emit('message',{data:JSON.stringify({type:'response.done',response:{status:'completed'}})});
    });
  }
  close(code){this.readyState=3;this.closeCode=code;}
}

let request;
const audio=await createSpeech('Texto integral.','sk-test-secret','cedar',new AbortController().signal,{
  fetchFn:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({value:'ek-temporary'})};},
  WebSocketClass:FakeSocket,atobFn:value=>Buffer.from(value,'base64').toString('binary'),timeoutMs:1000,
});
assert.equal(request.url,SPEECH_PROFILE.clientSecretUrl);
assert.equal(request.options.headers.Authorization,'Bearer sk-test-secret');
const session=JSON.parse(request.options.body).session;
assert.equal(session.model,'gpt-realtime-2.1-mini');assert.deepEqual(session.output_modalities,['audio']);assert.equal(session.audio.output.voice,'cedar');
assert.match(FakeSocket.instances[0].url,/gpt-realtime-2.1-mini/);assert.ok(FakeSocket.instances[0].protocols[1].endsWith('ek-temporary'));
assert.equal(FakeSocket.instances[0].sent[0].item.content[0].text,'Texto integral.');
assert.deepEqual(FakeSocket.instances[0].sent[1],{type:'response.create',response:{output_modalities:['audio']}});
const view=new DataView(audio);assert.equal(String.fromCharCode(...new Uint8Array(audio,0,4)),'RIFF');assert.equal(view.getUint32(40,true),8);

const wav=pcm16ToWav([new Uint8Array([1,2]),new Uint8Array([3,4])]);assert.equal(new DataView(wav).getUint32(40,true),4);
assert.equal(SUPPORTED_VOICES.includes('ember'),false);assert.equal(SUPPORTED_VOICES.includes('nova'),false);
assert.deepEqual(speechCacheKey('key','cedar','texto').slice(0,5),[2,'key','openai-realtime','gpt-realtime-2.1-mini','cedar']);
assert.match(apiError(410,{error:{message:'model deprecated'}}).message,/Atualize a extensão/);
assert.doesNotMatch(apiError(403,{error:{message:'denied for sk-secret-value'}},'sk-secret-value').message,/sk-secret-value/);

const aborted=new AbortController();aborted.abort();
await assert.rejects(createSpeech('x','sk-test','cedar',aborted.signal,{fetchFn:async()=>assert.fail()}),{name:'AbortError'});
await assert.rejects(createSpeech('x','sk-hidden-value','cedar',new AbortController().signal,{
  fetchFn:async()=>({ok:false,status:404,json:async()=>({error:{code:'model_not_found',message:'Missing sk-hidden-value'}})})
}),error=>/Atualize a extensão/.test(error.message)&&!/sk-hidden-value/.test(error.message));

console.log('PASS: perfil Realtime, credencial efêmera, eventos, PCM/WAV, cache versionado, erros de depreciação e cancelamento.');
