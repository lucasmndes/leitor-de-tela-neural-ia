import {splitText,buildChunks} from './text.js';
import {ContinuousReader} from './playback.js';
import {SpeechCache} from './cache.js';
const speechCache=new SpeechCache();void speechCache.cleanup();
const MODEL='gpt-4o-mini-tts';
const SPEECH_INSTRUCTIONS='Read verbatim, calmly. Use Brazilian Portuguese for Portuguese text.';
const $=id=>document.getElementById(id);
const voices=['cedar','marin','alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse'];
for(const voice of voices)$('voice').add(new Option(voice[0].toUpperCase()+voice.slice(1),voice));
let units=[],chunks=[],pageRef=null,reader=null,token=0,running=false,paused=false,currentCue=null,loadSerial=0,hasApiKey=false;
let lastSelection,highlightChain=Promise.resolve();
const status=text=>{$('status').textContent=text;};
function controls(){
  $('play').disabled=running || !chunks.length;$('pause').disabled=!running;$('stop').disabled=!running;
  $('pauseLabel').textContent=paused?'Continuar':'Pausar';$('pause').setAttribute('aria-label',paused?'Continuar leitura':'Pausar leitura');$('pause').setAttribute('aria-pressed',String(paused));
  $('play').hidden=running;$('pause').hidden=!running;$('stop').hidden=!running;
  document.body.dataset.readerState=running?(paused?'paused':'playing'):'idle';
  $('settingsOpen').classList.toggle('needs-attention',!hasApiKey);$('setupPrompt').hidden=hasApiKey;
}
function accessState(available){hasApiKey=Boolean(available);$('keyState').textContent=hasApiKey?'Chave guardada nesta sessão':'Configure sua chave para ouvir';controls();}
function queuePage(action,cue=null,ref=pageRef,runToken=token) {
  if(!ref?.session)return;
  highlightChain=highlightChain.catch(()=>{}).then(async()=>{
    if(action==='highlight' && (runToken!==token || !$('follow').checked))return;
    try {
      const target=ref.documentId ? {tabId:ref.tabId,documentIds:[ref.documentId]} : {tabId:ref.tabId,frameIds:[ref.frameId || 0]};
      const [result]=await chrome.scripting.executeScript({target,func:(action,id,session)=>{
        const r=globalThis.__leitorGPT;
        if(action==='clear'){r?.clear();return true;}
        return r?.highlight(id,session,true) || false;
      },args:[action,cue?.id ?? null,ref.session]});
      if(action==='highlight' && result?.result!==true && runToken===token)$('tracking').textContent='O texto mudou ou o acesso à página foi perdido. Carregue a seleção novamente para acompanhar no site.';
    }catch{
      if(action==='highlight' && runToken===token)$('tracking').textContent='A página bloqueou o destaque. O acompanhamento continua no painel.';
    }
  });
}
function stop(message='Leitura parada.') {
  if(message==='Leitura concluída.'){$('progress').value=100;$('progressValue').textContent='100%';}
  token++;reader?.stop();reader=null;running=false;paused=false;currentCue=null;
  document.querySelector('#preview .active')?.classList.remove('active');queuePage('clear');controls();status(message);
}
function render(capturedUnits,ref) {
  units=capturedUnits;pageRef=ref;chunks=buildChunks(units);$('preview').replaceChildren();$('progress').value=0;$('progressValue').textContent='0%';
  units.forEach((unit,i)=>{const p=document.createElement('p');p.id=`unit-${i}`;p.textContent=unit.text;$('preview').append(p);});
  if(!units.length){const empty=document.createElement('div');empty.className='empty';const p=document.createElement('p');p.textContent='Selecione um trecho ou carregue a página para ouvir.';empty.append(p);$('preview').append(empty);}
  const count=units.reduce((n,u)=>n+u.text.length,0);
  $('count').textContent=`${count.toLocaleString('pt-BR')} caracteres`;
  $('tracking').textContent=ref?.session?'Destaque e rolagem na página por frases. O tempo do destaque é aproximado.':'Acompanhamento no painel. Não foi possível localizar o texto na página para destacá-lo.';
  controls();
}
function followCue(cue,runToken) {
  if(runToken!==token)return;
  const progress=Math.round(cue.index / Math.max(1,units.length)*100);$('progress').value=progress;$('progressValue').textContent=`${progress}%`;
  currentCue=cue;document.querySelector('#preview .active')?.classList.remove('active');
  const p=$(`unit-${cue.index}`);p?.classList.add('active');p?.scrollIntoView({block:'nearest'});
  status(`Lendo ${cue.index+1} de ${units.length} frases.`);
  if($('follow').checked && cue.id!==null)queuePage('highlight',cue,pageRef,runToken);
}
$('follow').onchange=()=>{$('follow').checked && currentCue ? queuePage('highlight',currentCue) : queuePage('clear');};
$('stop').onclick=()=>stop();
$('pause').onclick=async()=>{
  const active=reader;if(!active || !running)return;
  try {
    paused=!paused;controls();
    if(paused){status('Pausado.');await active.pause();}
    else{await active.resume();if(reader===active)status('Continuando a leitura…');}
  }catch{if(reader===active)stop('Não foi possível retomar o áudio. Clique em Ler para tentar novamente.');}
};
const openSettings=()=>{$('settingsStatus').textContent='';$('settings').showModal();};
$('settingsOpen').onclick=openSettings;$('setupPrompt').onclick=openSettings;
$('settingsClose').onclick=()=>$('settings').close();
$('save').onclick=async()=>{
  const key=$('key').value.trim();
  if(!key.startsWith('sk-') || key.length<20){$('settingsStatus').textContent='Cole uma chave válida da API OpenAI.';return;}
  await chrome.storage.session.set({apiKey:key});$('key').value='';$('key').placeholder='Chave guardada nesta sessão';accessState(true);$('settings').close();status('Chave guardada. Carregue um texto para ouvir.');
};
$('forget').onclick=async()=>{stop('Chave removida.');await chrome.storage.session.remove('apiKey');await speechCache.clear().catch(()=>{});$('key').value='';$('key').placeholder='sk-…';accessState(false);$('settingsStatus').textContent='Chave removida desta sessão.';};
$('voice').onchange=()=>chrome.storage.local.set({voice:$('voice').value});
$('speed').oninput=()=>{
  const rate=Number($('speed').value);$('speedValue').textContent=`${rate}×`;reader?.setRate(rate);chrome.storage.local.set({speed:rate});
};
async function load(mode) {
  const serial=++loadSerial;stop('Carregando texto…');render([],null);
  $('selection').disabled=$('page').disabled=true;
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw new Error('Abra uma página e clique no ícone da extensão.');
    const target={tabId:tab.id};
    await chrome.scripting.executeScript({target,files:['extract.js']});
    const [result]=await chrome.scripting.executeScript({target,func:mode=>globalThis.__leitorGPT.capture(mode),args:[mode]});
    await chrome.scripting.insertCSS({target,files:['highlight.css']});
    if(serial!==loadSerial)return;
    const captured=result?.result;
    render(captured?.units || [],{tabId:tab.id,frameId:0,documentId:result.documentId,session:captured?.session});
    status(units.length?'Confira a prévia e clique em Ler.':mode==='selection'?'Selecione o texto e use o botão direito → Ler seleção com Leitor GPT.':'Não foi encontrado texto acessível nesta página.');
  }catch(error){if(serial===loadSerial)status(`Não foi possível capturar. Tente o botão direito → Ler seleção com Leitor GPT. Detalhe: ${String(error.message).slice(0,400)}`);}
  finally{if(serial===loadSerial){$('selection').disabled=$('page').disabled=false;controls();}}
}
$('selection').onclick=()=>load('selection');$('page').onclick=()=>load('page');
async function requestSpeech(text,key,voice,signal) {
  const controller=new AbortController();const cancel=()=>controller.abort();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timeout=setTimeout(cancel,90000);
  try {
    const response=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
      body:JSON.stringify({model:MODEL,voice,input:text,response_format:'mp3',instructions:SPEECH_INSTRUCTIONS})
    });
    if(!response.ok){
      const messages={401:'Chave inválida ou revogada.',403:'Acesso negado. Confira o acesso pago à API e as permissões da chave e do projeto.',429:'Limite da API atingido ou saldo indisponível.'};
      let detail='';try{const body=await response.json();detail=String(body.error?.message || '').split(key).join('[chave ocultada]').replace(/sk-[A-Za-z0-9_-]+/g,'[chave ocultada]').slice(0,700);}catch{}
      throw new Error(`${messages[response.status] || 'Falha ao gerar áudio.'} HTTP ${response.status}.${detail ? ` Detalhe: ${detail}` : ''}`);
    }
    return await response.arrayBuffer();
  }finally{clearTimeout(timeout);signal.removeEventListener('abort',cancel);}
}
$('clearAudio').onclick=async()=>{
  stop('Leitura parada para limpar os áudios.');
  try{await speechCache.clear();$('settingsStatus').textContent='Áudios locais removidos.';$('economy').textContent='Novos áudios serão gerados quando necessário.';}catch{$('settingsStatus').textContent='Não foi possível limpar o armazenamento local. Tente novamente.';}
};
$('play').onclick=async()=>{
  if(running || !chunks.length)return;
  // Ativar Web Audio no clique, antes de aguardar armazenamento ou rede.
  const context=new AudioContext();const unlocked=context.resume();
  const runToken=++token;running=true;paused=false;controls();
  try{
    const {apiKey}=await chrome.storage.session.get('apiKey');await unlocked;
    if(runToken!==token){await context.close();return;}
    if(!apiKey){await context.close();accessState(false);stop('Configure sua chave da API antes de iniciar.');openSettings();return;}
    const voice=$('voice').value;let reused=0,generated=0;
    $('economy').textContent='Verificando áudios já salvos…';
    const cachedSpeech=(text,signal)=>speechCache.get(
      [1,apiKey,MODEL,voice,SPEECH_INSTRUCTIONS,'mp3',text],
      ()=>requestSpeech(text,apiKey,voice,signal),signal,kind=>{
        if(runToken!==token)return;
        if(kind==='reused')reused++;else generated++;
        $('economy').textContent=`${reused} reutilizado${reused===1?'':'s'} · ${generated} novo${generated===1?'':'s'} nesta leitura`;
      }
    );
    const active=new ContinuousReader({context,chunks,rate:Number($('speed').value),fetchAudio:cachedSpeech,onCue:cue=>followCue(cue,runToken),onState:state=>{if(runToken===token)status(state==='preparing'?'Preparando a leitura…':state==='buffering'?'Aguardando o próximo áudio da API…':'Lendo…');}});
    reader=active;await active.start();if(runToken===token)stop('Leitura concluída.');
  }catch(error){
    if(context.state!=='closed')void context.close().catch(()=>{});
    if(runToken===token)stop(error.name==='AbortError'?'A geração demorou demais. Tente novamente.':error.message || 'Falha de conexão.');
  }
};
window.addEventListener('pagehide',()=>stop());
function receiveSelection(selection) {
  if(!selection?.text || selection.nonce===lastSelection)return;
  lastSelection=selection.nonce;++loadSerial;stop('Seleção recebida. Confira a prévia e clique em Ler.');
  const captured=selection.capture;
  if(captured?.units?.length)render(captured.units,{tabId:selection.tabId,frameId:selection.frameId,documentId:selection.documentId,session:captured.session});
  else render(splitText(selection.text).map(text=>({id:null,text})),null);
  $('selection').disabled=$('page').disabled=false;
  chrome.storage.session.remove('pendingSelection');
}
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session' && changes.pendingSelection?.newValue)receiveSelection(changes.pendingSelection.newValue);});
const [session,prefs]=await Promise.all([chrome.storage.session.get(['apiKey','pendingSelection']),chrome.storage.local.get(['voice','speed'])]);
if(session.apiKey)$('key').placeholder='Chave guardada nesta sessão';
accessState(session.apiKey);
if(voices.includes(prefs.voice))$('voice').value=prefs.voice;
if(Number.isFinite(prefs.speed))$('speed').value=prefs.speed;
$('speedValue').textContent=`${$('speed').value}×`;receiveSelection(session.pendingSelection);
