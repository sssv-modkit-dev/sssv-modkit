/* Actual bytes from the Python fetches; module imports themselves use the browser loader. */
const originalFetch=self.fetch.bind(self),waiting=[];
let job=null,initialError=null;
self.onmessage=event=>{if(initialError)replyError(event.data.id);else waiting.push(event);};
self.addEventListener('message',event=>{job=event.data.id;});
function replyError(id){self.postMessage({type:'error',id,message:'The Python worker could not start. Update your browser or reload to try again.'});}
self.fetch=async(...args)=>{
 const response=await originalFetch(...args),url=response.url;
 if(!url.includes('/vendor/pyodide/')||!response.body?.getReader||typeof ReadableStream!=='function'||!response.ok)return response;
 const reader=response.body.getReader(),total=Number(response.headers.get('Content-Length'))||0;
 let bytes=0,last=0;
 const report=()=>self.postMessage({type:'progress',id:job,stage:'runtime',detail:`Loading Python: ${url.split('/').pop()} · ${(bytes/1e6).toFixed(1)} MB${total?' / '+(total/1e6).toFixed(1)+' MB':''} received`});
 const body=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();if(done){report();controller.close();return;}bytes+=value.byteLength;const now=Date.now();if(now-last>200){last=now;report();}controller.enqueue(value);}catch(error){controller.error(error);}},cancel:reason=>reader.cancel(reason)});
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
};
try{await import('./builder-worker.js');for(const event of waiting)self.onmessage(event);waiting.length=0;}
catch(error){initialError=error;for(const event of waiting)replyError(event.data.id);waiting.length=0;}
