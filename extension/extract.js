(() => {
  const VERSION=120;
  if (globalThis.__leitorGPT?.version===VERSION) return;
  globalThis.__leitorGPT?.clear();
  let session='',ranges=new Map(),lastScrollId=null;
  const clear=()=>{CSS.highlights?.delete('leitor-gpt-current');lastScrollId=null;};
  const normalize=text=>text.replace(/\s+/g,' ').trim();
  function blockOf(element) {
    while(element.parentElement && !/^(block|list-item|table-cell|flex|grid|flow-root)/.test(getComputedStyle(element).display)) element=element.parentElement;
    return element;
  }
  function collect(selectionRange=null, visual=false) {
    const groups=[],byBlock=new Map();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      const element=node.parentElement;
      if(!element || element.closest('script,style,noscript,input,textarea,select,[hidden],[aria-hidden="true"]')) continue;
      if(!selectionRange && element.closest('[contenteditable]:not([contenteditable="false"])')) continue;
      if(element.checkVisibility && !element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
      if(selectionRange && !selectionRange.intersectsNode(node)) continue;
      const from=selectionRange?.startContainer===node ? selectionRange.startOffset : 0;
      const to=selectionRange?.endContainer===node ? selectionRange.endOffset : node.length;
      if(from>=to) continue;
      const r=document.createRange();r.setStart(node,from);r.setEnd(node,to);
      const rect=r.getBoundingClientRect();
      if(!rect.width || !rect.height) continue;
      const block=blockOf(element);
      let group=byBlock.get(block);
      if(!group){group={block,top:rect.top,left:rect.left,nodes:[]};byBlock.set(block,group);groups.push(group);}
      group.nodes.push({node,from,to});
    }
    if(visual) groups.sort((a,b)=>a.top-b.top || a.left-b.left);
    const chars=[],starts=[],ends=[];
    let whitespace=false;
    for(const group of groups) {
      if(chars.length) whitespace=true;
      for(const {node,from,to} of group.nodes) {
        for(let offset=from;offset<to;offset++) {
          const char=node.textContent[offset];
          if(/\s/.test(char)){whitespace=true;continue;}
          if(whitespace && chars.length){chars.push(' ');starts.push({node,offset});ends.push({node,offset});}
          chars.push(char);starts.push({node,offset});ends.push({node,offset:offset+1});whitespace=false;
        }
      }
    }
    return {text:chars.join(''),starts,ends};
  }
  function capture(mode,expected='') {
    clear();session=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');ranges=new Map();
    let source;
    if(mode==='selection') {
      const selection=getSelection();
      if(selection?.rangeCount && !selection.isCollapsed && (!expected || normalize(selection.toString())===normalize(expected))) {
        source=collect(selection.getRangeAt(0));
      }
      if(!source?.text && expected) {
        const all=collect();const text=normalize(expected),start=all.text.indexOf(text);
        if(start>=0) source={text,starts:all.starts.slice(start,start+text.length),ends:all.ends.slice(start,start+text.length)};
      }
      if(!source?.text) return {session,units:[]};
    } else source=collect(null,true);
    const segments=typeof Intl.Segmenter==='function'
      ? [...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(source.text)]
      : [{segment:source.text,index:0}];
    const units=[];
    for(const sentence of segments) {
      let offset=sentence.index,end=sentence.index+sentence.segment.length;
      while(offset<end) {
        while(offset<end && source.text[offset]===' ') offset++;
        if(offset===end) break;
        let stop=Math.min(offset+220,end);
        if(stop<end){const space=source.text.lastIndexOf(' ',stop);if(space>offset+110)stop=space;}
        if(/[\uD800-\uDBFF]/.test(source.text[stop-1])) stop--;
        let trimmed=stop;while(trimmed>offset && source.text[trimmed-1]===' ')trimmed--;
        if(trimmed>offset) {
          const start=source.starts[offset],finish=source.ends[trimmed-1];
          const range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(finish.node,finish.offset);
          const id=String(units.length);ranges.set(id,range);units.push({id,text:source.text.slice(offset,trimmed)});
        }
        offset=stop;
      }
    }
    return {session,units};
  }
  function highlight(id,expectedSession,follow) {
    if(session!==expectedSession) return false;
    const range=ranges.get(id);
    if(!range?.startContainer.isConnected || !range.endContainer.isConnected || !CSS.highlights) return false;
    // A seleção nativa sobrepõe o destaque de leitura.
    const selection=getSelection();
    if(selection?.rangeCount && !selection.isCollapsed) selection.removeAllRanges();
    CSS.highlights.set('leitor-gpt-current',new Highlight(range));
    if(follow && lastScrollId!==id) {
      lastScrollId=id;
      const rect=range.getBoundingClientRect();
      if(rect.top<70 || rect.bottom>innerHeight-90) {
        range.startContainer.parentElement?.scrollIntoView({block:'center',behavior:'instant'});
        const adjusted=range.getBoundingClientRect();
        if(adjusted.top<70 || adjusted.bottom>innerHeight-90) window.scrollBy({top:adjusted.top-innerHeight*.35,behavior:'instant'});
      }
    }
    return true;
  }
  globalThis.__leitorGPT={version:VERSION,capture,highlight,clear};
})();
