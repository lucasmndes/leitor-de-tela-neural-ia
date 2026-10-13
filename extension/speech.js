export const SPEECH_PROFILE=Object.freeze({
  schema:2,
  provider:'openai-realtime',
  model:'gpt-realtime-2.1-mini',
  clientSecretUrl:'https://api.openai.com/v1/realtime/client_secrets',
  realtimeUrl:'wss://api.openai.com/v1/realtime',
  format:'pcm16-24000-mono',
  instructions:"You are a text-to-speech engine. Read the complete user message verbatim, preserving its language and order. Do not answer, summarize, translate, omit, or add words. Speak calmly; use Brazilian Portuguese pronunciation when the text is Portuguese.",
});

export const SUPPORTED_VOICES=Object.freeze(['cedar','marin','alloy','ash','ballad','coral','echo','sage','shimmer','verse']);

const abortError=()=>new DOMException('Operação cancelada.','AbortError');

function sanitizedDetail(body,key='') {
  const raw=String(body?.error?.message || body?.message || '');
  const withoutKnownKey=key ? raw.split(key).join('[chave ocultada]') : raw;
  return withoutKnownKey.replace(/sk-[A-Za-z0-9_-]+/g,'[chave ocultada]').slice(0,700);
}

export function apiError(status,body,key='') {
  const code=String(body?.error?.code || body?.error?.type || '').toLowerCase();
  const detail=sanitizedDetail(body,key);
  let message={
    400:'A API recusou a configuração de voz.',
    401:'Chave inválida ou revogada.',
    403:'Acesso negado. Confira o acesso pago à API e as permissões da chave e do projeto.',
    404:'O modelo de voz configurado não está disponível para este projeto.',
    410:'O modelo de voz configurado foi descontinuado.',
    429:'Limite da API atingido ou saldo indisponível.',
  }[status] || 'Falha ao gerar áudio.';
  if(/deprecated|deprecat|model_not_found|model.*retir|sunset/.test(`${code} ${detail}`.toLowerCase())){
    message='A OpenAI retirou ou substituiu o modelo de voz. Atualize a extensão para a versão mais recente.';
  }
  return new Error(`${message} HTTP ${status}.${detail ? ` Detalhe: ${detail}` : ''}`);
}

export function speechCacheKey(apiKey,voice,text,profile=SPEECH_PROFILE) {
  return [profile.schema,apiKey,profile.provider,profile.model,voice,profile.instructions,profile.format,text];
}

export function pcm16ToWav(parts,sampleRate=24000) {
  const size=parts.reduce((total,part)=>total+part.byteLength,0);
  const buffer=new ArrayBuffer(44+size),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  const ascii=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,36+size,true);ascii(8,'WAVE');ascii(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  ascii(36,'data');view.setUint32(40,size,true);
  let offset=44;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return buffer;
}

function decodeBase64(value,atobFn=globalThis.atob) {
  const binary=atobFn(value),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function responseBody(response) {
  try{return await response.json();}catch{return {};}
}

export async function createSpeech(text,apiKey,voice,signal,{
  profile=SPEECH_PROFILE,
  fetchFn=globalThis.fetch,
  WebSocketClass=globalThis.WebSocket,
  atobFn=globalThis.atob,
  timeoutMs=90000,
}={}) {
  if(signal?.aborted)throw abortError();
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(cancel,timeoutMs);
  let socket;
  try{
    const response=await fetchFn(profile.clientSecretUrl,{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({
        expires_after:{anchor:'created_at',seconds:120},
        session:{
          type:'realtime',model:profile.model,output_modalities:['audio'],instructions:profile.instructions,
          tools:[],tool_choice:'none',
          audio:{input:{turn_detection:null},output:{format:{type:'audio/pcm',rate:24000},voice}},
        },
      }),
    });
    const body=await responseBody(response);
    if(!response.ok)throw apiError(response.status,body,apiKey);
    if(!body.value)throw new Error('A API não retornou a credencial temporária de áudio.');

    const url=`${profile.realtimeUrl}?model=${encodeURIComponent(profile.model)}`;
    const chunks=[];
    return await new Promise((resolve,reject)=>{
      let settled=false,started=false;
      const finish=(error,value)=>{
        if(settled)return;settled=true;
        controller.signal.removeEventListener('abort',onAbort);
        if(socket?.readyState===0 || socket?.readyState===1)socket.close(1000);
        error?reject(error):resolve(value);
      };
      const onAbort=()=>finish(abortError());
      controller.signal.addEventListener('abort',onAbort,{once:true});
      try{socket=new WebSocketClass(url,['realtime',`openai-insecure-api-key.${body.value}`]);}
      catch(error){finish(error);return;}
      socket.addEventListener('error',()=>finish(new Error('Não foi possível abrir a conexão de áudio em tempo real.')));
      socket.addEventListener('close',event=>{if(!settled)finish(new Error(`A conexão de áudio foi encerrada antes de concluir${event?.code ? ` (código ${event.code})` : ''}.`));});
      socket.addEventListener('message',event=>{
        let data;try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='session.created' && !started){
          started=true;
          socket.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}}));
          socket.send(JSON.stringify({type:'response.create',response:{output_modalities:['audio']}}));
        }else if(data.type==='response.output_audio.delta' && data.delta){
          chunks.push(decodeBase64(data.delta,atobFn));
        }else if(data.type==='error'){
          finish(apiError(400,{error:data.error},apiKey));
        }else if(data.type==='response.done'){
          const status=data.response?.status;
          if(status!=='completed'){
            const error=data.response?.status_details?.error || {message:`Resposta de áudio encerrada com estado ${status || 'desconhecido'}.`};
            finish(apiError(400,{error},apiKey));
          }else if(!chunks.length)finish(new Error('A API concluiu a resposta sem retornar áudio.'));
          else finish(null,pcm16ToWav(chunks));
        }
      });
    });
  }catch(error){
    if(controller.signal.aborted && error?.name!=='AbortError')throw abortError();
    throw error;
  }finally{
    clearTimeout(timeout);signal?.removeEventListener('abort',cancel);
    if(socket?.readyState===0 || socket?.readyState===1)socket.close(1000);
  }
}
