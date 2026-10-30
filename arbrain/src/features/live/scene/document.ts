import type { Artifact } from './model'
const encode=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
/** An opaque iframe owns a disposable worker. Generated HTML never owns executable scripts. */
export function artifactDocument(artifact:Artifact,token:string){
  if(!/^[a-zA-Z0-9-]{16,100}$/.test(token))throw new Error('Invalid frame token')
  const payload=encode({id:artifact.id,html:artifact.html,css:artifact.css||'',program:artifact.program||'',data:artifact.data??null,state:artifact.state??null,token})
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>
  :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9e7f1;background:#14131b}*{box-sizing:border-box}body{margin:0;padding:20px;overflow-wrap:anywhere}h1,h2,h3,p{margin-top:0}svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid #ffffff18}button,input,select{font:inherit;color:inherit;background:#ffffff0a;border:1px solid #ffffff30;border-radius:8px;padding:8px}button{cursor:pointer}#failure{border:1px solid #ff910144;padding:12px;border-radius:10px;color:#ffd7a3}#failure[hidden]{display:none}
  </style><style id="piece-style"></style></head><body><div id="failure" hidden role="status"></div><main id="content"></main><script nonce="${token}">
  const payload=${payload};let worker=null,timer=null,workerUrl=null,state=payload.state,generation=0;
  const content=document.getElementById('content'),failure=document.getElementById('failure');
  const notify=(type,detail)=>parent.postMessage({channel:'arbrain-artifact',token:payload.token,id:payload.id,type,detail},'*');
  function clean(html){
    const doc=new DOMParser().parseFromString(String(html),'text/html');
    doc.querySelectorAll('script,iframe,object,embed,base,meta,link,form,foreignObject,animate,set').forEach(n=>n.remove());
    for(const el of doc.querySelectorAll('*'))for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase(),value=attr.value.trim();
      if(name.startsWith('on')||['srcdoc','nonce','formaction','action','target','ping','autofocus'].includes(name))el.removeAttribute(attr.name);
      if(['src','href','xlink:href','poster','srcset'].includes(name)&&!value.startsWith('#')&&!/^data:image\\/(png|jpeg|webp|gif);base64,/i.test(value))el.removeAttribute(attr.name);
    }
    return doc.body.innerHTML;
  }
  function report(){const smallText=[...content.querySelectorAll('*')].slice(0,1500).filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<12).slice(0,12).map(el=>({text:el.textContent.slice(0,100),fontSize:getComputedStyle(el).fontSize}));notify('rendered',{state,smallText,text:content.innerText.slice(0,12000),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,controls:[...content.querySelectorAll('[data-action]')].slice(0,80).map(el=>({action:el.dataset.action,label:(el.textContent||'').slice(0,100),rect:el.getBoundingClientRect().toJSON()}))});}
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(report,150)});
  function render(html){
    if(typeof html!=='string'||html.length>300000)throw new Error('La visualización excedió su límite.');
    content.innerHTML=clean(html);failure.hidden=true;
    report();
  }
  function stop(){generation++;clearTimeout(timer);if(worker)worker.terminate();worker=null;if(workerUrl)URL.revokeObjectURL(workerUrl);workerUrl=null;}
  function failed(message){stop();failure.textContent=message;failure.hidden=false;notify('error',{message});}
  function run(input){
    stop();if(!payload.program)return;const epoch=generation;
    const code="self.onmessage=async(e)=>{try{const fn=new Function('data','input','state',e.data.program);const result=await fn(e.data.data,e.data.input,e.data.state);self.postMessage({result});}catch(error){self.postMessage({error:String(error.message||error)});}}";
    workerUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));worker=new Worker(workerUrl);
    worker.onmessage=e=>{if(epoch!==generation)return;try{if(e.data.error)throw new Error(e.data.error);const result=e.data.result;if(result&&typeof result==='object'){if(result.state!==undefined){if(JSON.stringify(result.state).length>16000)throw new Error('Estado interactivo demasiado grande.');state=result.state;}render(result.html);}else render(result);stop();}catch(error){failed(String(error.message||error));}};
    worker.onerror=()=>{if(epoch===generation)failed('La visualización no pudo ejecutarse.');};
    timer=setTimeout(()=>failed('La visualización tardó demasiado; conservamos la última vista.'),1200);
    worker.postMessage({program:payload.program,data:payload.data,input,state});
  }
  document.getElementById('piece-style').textContent=payload.css;
  try{render(payload.html);run(null);}catch(error){failed(String(error.message||error));}
  content.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el){event.preventDefault();run({action:el.dataset.action,value:el.dataset.value??null});}notify('selected',{});});
  content.addEventListener('change',event=>{const el=event.target;if(el.dataset.action)run({action:el.dataset.action,value:el.value});});
  window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='arbrain-artifact-state'||event.data.token!==payload.token)return;const next=event.data.state??null;if(JSON.stringify(next)!==JSON.stringify(state)){state=next;run(null);}});
  window.addEventListener('pagehide',stop);
  </script></body></html>`
}
