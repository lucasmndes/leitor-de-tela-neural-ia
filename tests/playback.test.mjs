import assert from 'node:assert/strict';
import {ContinuousReader} from '../extension/playback.js';
import {buildChunks,splitText} from '../extension/text.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Context {
  currentTime=0;state='running';sources=[];destination={};
  async decodeAudioData(){return {duration:10};}
  createBufferSource(){
    const s={playbackRate:{value:1},connect(){},stop(){this.stopped=true;},start(at,offset){this.at=at;this.offset=offset;}};
    this.sources.push(s);return s;
  }
  async suspend(){this.state='suspended';}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
}
const original='Primeira frase com uma palavra em destaque. Segunda frase que deve continuar. '.repeat(160);
const units=splitText(original).map((text,index)=>({id:String(index),text}));
assert.ok(units.every(unit=>unit.text.length<=220));
const chunks=buildChunks(units);
assert.ok(chunks.every(chunk=>chunk.text.length<=1400));
assert.equal(chunks.map(chunk=>chunk.text).join(' '),original.trim());
assert.ok(chunks.length<units.length/5,'Frases devem ser agrupadas em poucos áudios');
const ctx=new Context(),requests=[],cues=[];
const engine=new ContinuousReader({context:ctx,chunks,fetchAudio:async(text,signal)=>{assert.equal(signal.aborted,false);requests.push(text);return new ArrayBuffer(1);},onCue:cue=>cues.push(cue.index)});
const playing=engine.start();await flush();
assert.equal(requests.length,1,'No início, gerar somente o áudio atual');
assert.equal(engine.entries.length,1);
ctx.currentTime=3;engine.tick();await flush();assert.equal(requests.length,1,'Evitar geração antecipada desnecessária');
ctx.currentTime=5;engine.tick();await flush();
assert.equal(requests.length,2,'Preparar automaticamente o próximo quando a transição se aproxima');
assert.equal(engine.entries.length,2);
assert.equal(engine.entries[1].start,engine.entries[0].end,'Próximo áudio agendado sem espera de rede');
ctx.currentTime=.025;engine.tick();assert.equal(cues.at(-1),0);
ctx.currentTime=8;engine.tick();assert.ok(cues.at(-1)>0,'Destaque avança dentro do mesmo áudio');
await engine.pause();assert.equal(ctx.state,'suspended');await engine.resume();assert.equal(ctx.state,'running');
engine.setRate(1.5);assert.equal(engine.entries[0].offset,7.975);assert.equal(engine.entries[1].start,engine.entries[0].end);
let complete=0;
while(engine.entries.length){const entry=engine.entries[0];ctx.currentTime=entry.end;entry.source.onended();complete++;await flush();assert.ok(engine.entries.length<=2);}
await playing;assert.equal(complete,chunks.length);assert.equal(requests.length,chunks.length);engine.stop();
const c2=new Context();let abortObserved=false;
const e2=new ContinuousReader({context:c2,chunks,fetchAudio:(_text,signal)=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>{abortObserved=true;reject(new DOMException('Abortado','AbortError'));},{once:true}))});
const pending=e2.start().catch(error=>assert.equal(error.name,'AbortError'));await flush();e2.stop();await pending;assert.equal(abortObserved,true);assert.equal(c2.state,'closed');
console.log('PASS: agrupamento sem perda; fila limitada; transições contínuas; destaque dentro do áudio; pausa/retomada; velocidade; cancelamento de rede; término completo.');
