// No máximo o áudio atual e o seguinte. Preparação próxima da transição, sem regenerar áudio.
export class ContinuousReader {
  constructor({context,chunks,fetchAudio,onCue=()=>{},onState=()=>{},rate=1}) {
    Object.assign(this,{context,chunks,fetchAudio,onCue,onState,rate});
    this.entries=[];this.waiters=[];this.cancelled=false;this.paused=false;this.lastCue=-1;
    this.abort=new AbortController();this.latency=0;
  }
  wake(){for(const resolve of this.waiters.splice(0))resolve();}
  async wait(){if(!this.cancelled)await new Promise(resolve=>this.waiters.push(resolve));}
  async ready(){while(this.paused && !this.cancelled)await this.wait();return !this.cancelled;}
  async decode(index) {
    const started=performance.now();
    const data=await this.fetchAudio(this.chunks[index].text,this.abort.signal);
    const elapsed=(performance.now()-started)/1000;
    this.latency=Math.max(elapsed,this.latency*.8);
    if(this.cancelled)return null;
    return this.context.decodeAudioData(data);
  }
  schedule(entry,start) {
    const source=this.context.createBufferSource();
    source.buffer=entry.buffer;source.playbackRate.value=this.rate;source.connect(this.context.destination);
    entry.source=source;entry.start=start;entry.end=start+(entry.buffer.duration-entry.offset)/this.rate;
    source.onended=()=>{
      if(entry.source!==source || this.cancelled)return;
      this.entries=this.entries.filter(item=>item!==entry);if(!this.entries.length && !this.allLoaded)this.onState('buffering');this.wake();
    };
    source.start(start,entry.offset);
  }
  append(buffer,index) {
    if(this.cancelled)return;
    const start=Math.max(this.context.currentTime+.025,this.entries.at(-1)?.end || 0);
    const entry={buffer,index,offset:0};this.entries.push(entry);this.schedule(entry,start);
  }
  canPrepare(){
    if(!this.entries.length)return true;
    if(this.entries.length>=2)return false;
    const remaining=this.entries[0].end-this.context.currentTime;
    return remaining<=Math.max(6,this.latency*2+2);
  }
  tick() {
    if(this.cancelled || this.paused)return;
    if(this.canPrepare())this.wake();
    const now=this.context.currentTime;
    const entry=this.entries.find(item=>now>=item.start && now<item.end);
    if(!entry)return;
    const chunk=this.chunks[entry.index];
    const fraction=Math.min(1,(entry.offset+(now-entry.start)*this.rate)/entry.buffer.duration);
    const position=fraction*chunk.text.length;
    const cue=chunk.cues.find(item=>position<item.end) || chunk.cues.at(-1);
    if(cue && cue.index!==this.lastCue){this.lastCue=cue.index;this.onCue(cue,entry.index);}
  }
  async start() {
    this.onState('preparing');
    const first=[];
    for(let i=0;i<Math.min(1,this.chunks.length);i++){
      if(!await this.ready())return;
      const buffer=await this.decode(i);if(this.cancelled)return;first.push(buffer);
    }
    if(!await this.ready())return;
    this.allLoaded=first.length===this.chunks.length;
    first.forEach((buffer,index)=>this.append(buffer,index));
    this.onState('reading');
    this.timer=setInterval(()=>this.tick(),100);
    try {
      for(let i=first.length;i<this.chunks.length;i++) {
        while((this.paused || !this.canPrepare()) && !this.cancelled)await this.wait();
        if(!await this.ready())return;
        const buffer=await this.decode(i);if(this.cancelled)return;
        if(i===this.chunks.length-1)this.allLoaded=true;
        this.append(buffer,i);if(!this.paused)this.onState('reading');
      }
      while(this.entries.length && !this.cancelled)await this.wait();
    } finally {clearInterval(this.timer);}
  }
  async pause(){this.paused=true;await this.context.suspend();}
  async resume(){await this.context.resume();this.paused=false;this.wake();}
  setRate(rate) {
    const now=this.context.currentTime,oldRate=this.rate;
    this.rate=rate;let start=now+.025;
    const kept=[];
    for(const entry of this.entries) {
      entry.source.onended=null;entry.source.stop();
      if(entry.end<=now)continue;
      if(now>entry.start)entry.offset+=(now-entry.start)*oldRate;
      this.schedule(entry,start);start=entry.end;kept.push(entry);
    }
    this.entries=kept;this.wake();
  }
  stop() {
    this.cancelled=true;this.abort.abort();clearInterval(this.timer);
    for(const entry of this.entries){entry.source.onended=null;entry.source.stop();}
    this.entries=[];this.wake();
    if(this.context.state!=='closed')void this.context.close().catch(()=>{});
  }
}
