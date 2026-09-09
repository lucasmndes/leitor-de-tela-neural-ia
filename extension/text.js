export function splitText(text, limit = 220) {
  const chunks = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, {granularity:'sentence'}).segment(remaining)].map(s=>s.segment.trim())
    : [remaining];
  for (let sentence of sentences) {
    while (sentence.length > limit) {
      let cut = sentence.lastIndexOf(' ',limit);
      if (cut < limit/2) cut=limit;
      // Não separar um par UTF-16 (emoji, por exemplo).
      if (/[\uD800-\uDBFF]/.test(sentence[cut-1])) cut--;
      chunks.push(sentence.slice(0,cut)); sentence=sentence.slice(cut).trimStart();
    }
    if (sentence) chunks.push(sentence);
  }
  return chunks;
}
export function buildChunks(units, limit=1400) {
  const chunks=[];
  let chunk={text:'',cues:[]};
  for (const [index,unit] of units.entries()) {
    if (chunk.text && chunk.text.length+unit.text.length+1 > limit) {
      chunks.push(chunk); chunk={text:'',cues:[]};
    }
    const start=chunk.text.length+(chunk.text ? 1 : 0);
    chunk.text += (chunk.text ? ' ' : '')+unit.text;
    chunk.cues.push({index,id:unit.id,start,end:chunk.text.length});
  }
  if (chunk.text) chunks.push(chunk);
  return chunks;
}
