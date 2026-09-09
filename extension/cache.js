// Áudios ficam somente neste computador. A chave e o texto não são gravados no banco.
export class AudioStore {
  constructor(name='leitor-gpt-audio-v1'){this.name=name;}
  open(){
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('audio',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return this.opening;
  }
  async execute(mode,operation){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('audio',mode),store=transaction.objectStore('audio');
      let value;
      transaction.oncomplete=()=>resolve(value);
      transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error || new Error('Cache indisponível'));
      operation(store,result=>{value=result;});
    });
  }
  get(id){return this.execute('readonly',(store,done)=>{const request=store.get(id);request.onsuccess=()=>done(request.result);});}
  put(record){return this.execute('readwrite',store=>store.put(record));}
  remove(id){return this.execute('readwrite',store=>store.delete(id));}
  clear(){return this.execute('readwrite',store=>store.clear());}
  list(){return this.execute('readonly',(store,done)=>{
    const rows=[];const request=store.openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(!cursor){done(rows);return;}const {id,bytes,usedAt,expiresAt}=cursor.value;rows.push({id,bytes,usedAt,expiresAt});cursor.continue();};
  });}
}
export class SpeechCache {
  constructor({store=new AudioStore(),maxBytes=64*1024*1024,maxEntries=200,ttl=7*24*60*60*1000,now=()=>Date.now()}={}){
    Object.assign(this,{store,maxBytes,maxEntries,ttl,now});this.pending=new Map();this.serial=Promise.resolve();this.epoch=0;
  }
  async id(parameters){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parameters)));
    return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  mutate(operation){const task=this.serial.catch(()=>{}).then(operation);this.serial=task;return task;}
  async cleanup(){return this.mutate(async()=>{
    const rows=await this.store.list();for(const row of rows)if(row.expiresAt<=this.now())await this.store.remove(row.id);
  }).catch(()=>{});}
  async clear(){
    this.epoch++;this.pending.clear();
    await this.mutate(()=>this.store.clear());
  }
  async get(parameters,produce,signal,onResult=()=>{}){
    if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
    const id=await this.id(parameters),epoch=this.epoch;
    if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
    try {
      const found=await this.store.get(id);
      if(found && found.expiresAt>this.now() && found.audio instanceof Blob && found.audio.size>0){
        const audio=await found.audio.arrayBuffer();
        if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
        if(epoch!==this.epoch)return this.get(parameters,produce,signal,onResult);
        await this.mutate(async()=>{if(epoch===this.epoch)await this.store.put({...found,usedAt:this.now()});}).catch(()=>{});
        onResult('reused');return audio;
      }
    }catch(error){if(error.name==='AbortError')throw error;}
    const existing=this.pending.get(id);
    if(existing && !existing.signal.aborted && existing.epoch===this.epoch){
      const data=await existing.promise;
      if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
      onResult('reused');return data.slice(0);
    }
    if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
    const pending={signal,epoch};
    pending.promise=(async()=>{
      const audio=await produce();
      if(signal.aborted)throw new DOMException('Leitura cancelada','AbortError');
      if(!(audio instanceof ArrayBuffer) || !audio.byteLength)throw new Error('A API retornou áudio vazio.');
      if(audio.byteLength<=this.maxBytes){
        await this.mutate(async()=>{
          if(epoch!==this.epoch)return;
          const rows=(await this.store.list()).filter(row=>row.id!==id).sort((a,b)=>a.usedAt-b.usedAt);
          let bytes=rows.reduce((sum,row)=>sum+row.bytes,0),count=rows.length;
          for(const row of rows){
            if(row.expiresAt<=this.now() || bytes+audio.byteLength>this.maxBytes || count>=this.maxEntries){await this.store.remove(row.id);bytes-=row.bytes;count--;}
          }
          await this.store.put({id,audio:new Blob([audio],{type:'audio/mpeg'}),bytes:audio.byteLength,usedAt:this.now(),expiresAt:this.now()+this.ttl});
        }).catch(()=>{}); // Falha no cache não impede ouvir o áudio já recebido.
      }
      return audio;
    })();
    this.pending.set(id,pending);
    try {const data=await pending.promise;onResult('generated');return data.slice(0);}
    finally {if(this.pending.get(id)===pending)this.pending.delete(id);}
  }
}
