chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
chrome.runtime.onInstalled.addListener(()=>{
  chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'read-selection',title:'Ler seleção com Leitor GPT',contexts:['selection']}));
});
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId!=='read-selection' || !info.selectionText?.trim() || !tab?.id)return;
  chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
  const target={tabId:tab.id,frameIds:[info.frameId || 0]};
  (async()=>{
    let capture=null,documentId=null;
    try {
      await chrome.scripting.executeScript({target,files:['extract.js']});
      const [result]=await chrome.scripting.executeScript({target,func:text=>globalThis.__leitorGPT.capture('selection',text),args:[info.selectionText]});
      capture=result.result;documentId=result.documentId;
      await chrome.scripting.insertCSS({target,files:['highlight.css']});
    } catch { capture=null;documentId=null; /* O texto do menu continua disponível, sem prometer destaque. */ }
    await chrome.storage.session.set({pendingSelection:{text:info.selectionText,capture,tabId:tab.id,frameId:info.frameId || 0,documentId,nonce:crypto.randomUUID()}});
  })().catch(console.error);
});
