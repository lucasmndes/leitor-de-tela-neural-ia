const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert');
fs.mkdirSync('test-results',{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:900,height:650}});
await page.setContent('<p id="a">Primeira frase <b>com destaque</b>. Segunda frase.</p><div hidden>Oculto</div><input value="segredo"><div style="height:1000px"></div><p id="b">Terceira frase no final da página. Quarta frase.</p>');
await page.addStyleTag({content:fs.readFileSync('extension/highlight.css','utf8')});
await page.addScriptTag({content:fs.readFileSync('extension/extract.js','utf8')});
// crypto.randomUUID requires secure context; provide only a test UUID on about:blank.
await page.evaluate(()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>String(Math.random())});
const result=await page.evaluate(()=>globalThis.__leitorGPT.capture('page'));
assert.equal(result.units.map(u=>u.text).join(' '),'Primeira frase com destaque. Segunda frase. Terceira frase no final da página. Quarta frase.');
assert.equal(result.units.length,4);
await page.evaluate(()=>{const r=document.createRange();r.setStart(document.querySelector('#a').firstChild,0);r.setEnd(document.querySelector('#b').lastChild,document.querySelector('#b').lastChild.length);getSelection().removeAllRanges();getSelection().addRange(r);});
const selection=await page.evaluate(()=>globalThis.__leitorGPT.capture('selection',''));
assert.equal(selection.units.length,4);
const ok=await page.evaluate(({session,units})=>globalThis.__leitorGPT.highlight(units[2].id,session,true),selection);
assert.equal(ok,true);assert.ok(await page.evaluate(()=>scrollY>0),'Rolagem deve seguir a frase abaixo da tela');
assert.equal(await page.evaluate(()=>[...CSS.highlights.get('leitor-gpt-current')][0].toString()),'Terceira frase no final da página.');
assert.equal(await page.evaluate(()=>getSelection().toString()),'');
const fallback=await page.evaluate(()=>globalThis.__leitorGPT.capture('selection','Primeira frase com destaque. Segunda frase.'));
assert.equal(fallback.units.length,2,'Texto do menu deve ser relocalizado mesmo sem seleção nativa');
assert.equal(await page.evaluate(()=>globalThis.__leitorGPT.highlight('0','sessão antiga',true)),false);
await page.evaluate(({session})=>globalThis.__leitorGPT.highlight('0',session,true),fallback);
assert.equal(await page.evaluate(()=>[...CSS.highlights.get('leitor-gpt-current')][0].toString()),'Primeira frase com destaque.');
await page.screenshot({path:'test-results/highlight-test.png'});
console.log('PASS: texto completo sem conteúdo oculto; frases entre elementos inline; seleção e fallback do menu; destaque exato da frase; rolagem; rejeição de sessão antiga.');
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
