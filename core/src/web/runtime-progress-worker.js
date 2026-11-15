/* Wrap runtime fetch streams to report bytes actually received, preserving the original worker. */
const originalFetch=self.fetch.bind(self),waiting=[];
let job=null;
self.onmessage=event=>waiting.push(event);
self.addEventListener('message',event=>{job=event.data.id;});
self.fetch=async(...args)=>{
 const response=await originalFetch(...args),url=response.url;
 if(!url.includes('/vendor/pyodide/')||!response.body||!response.ok)return response;
 const reader=response.body.getReader(),total=Number(response.headers.get('Content-Length'))||0;
 let bytes=0,last=0;
 const report=()=>self.postMessage({type:'progress',id:job,stage:'runtime',detail:`Loading Python: ${url.split('/').pop()} · ${(bytes/1e6).toFixed(1)} MB${total?' / '+(total/1e6).toFixed(1)+' MB':''} received`});
 const body=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();if(done){report();controller.close();return;}bytes+=value.byteLength;const now=Date.now();if(now-last>200){last=now;report();}controller.enqueue(value);}catch(error){controller.error(error);}},cancel:reason=>reader.cancel(reason)});
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
};
await import('./builder-worker.js');
for(const event of waiting)self.onmessage(event);
