import { MAX_CHUNK_SIZE, WINDOW_BYTES, MAX_FILES, IO_BATCH_BYTES } from '../../../../packages/shared/src/protocol';
import type {Device} from '../../../../packages/shared/src/types';
import {Discovery} from '../discovery/client';
import {HashWorker} from './hash';
import {openStore,saveRecord,makeId,writeSegment,discardSegments,recordFile,type ReceivedFile} from './storage';
type FileInfo={name:string;size:number;type:string};
export type Download={name:string;url:string;record:ReceivedFile;blob:Blob;persistent:boolean};
type Callbacks={incoming:(peer:Device,files:FileInfo[])=>void; progress:(file:string,done:number,total:number,speed:number)=>void; saved:(download:Download)=>void; complete:(downloads:Download[])=>void; error:(message:string)=>void; waiting:()=>void; declined:()=>void};
type Sink={write:(b:ArrayBuffer)=>Promise<void>;finish:()=>Promise<{blob:Blob;record:ReceivedFile}>;abort:()=>Promise<void>};
export class Transfer {
 private pc?:RTCPeerConnection;private dc?:RTCDataChannel;private peer?:Device;private pendingIce:RTCIceCandidateInit[]=[];
 private hash=new HashWorker(); private stopped=false;private isSender=false;private files:File[]=[];private incoming:FileInfo[]=[];
 private queue=Promise.resolve(); private acked=-1; private lastAck=Date.now(); private nextSeq=0;private runningBytes=0;private total=0;private started=0;private lastReport=0;private outstanding=new Map<number,number>();private outstandingBytes=0;private wake?:()=>void;private directory?:FileSystemDirectoryHandle;
 private approved=false; private signalHandler:(e:Event)=>void; private sink?:Sink; private downloads:Download[]=[];
 private awaiting=new Map<string,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:number}>();
 constructor(private discovery:Discovery,private cb:Callbacks){this.signalHandler=(e:Event)=>{const m=(e as CustomEvent).detail;void this.onSignal(m.from,m.data).catch(err=>this.fail(err));};discovery.addEventListener('signal',this.signalHandler);}
 private createPC(peer:Device,initiator:boolean){
  this.peer=peer;const iceServers:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'}];
  // TURN credentials are configured at build time; do not place permanent secrets in public bundles.
  if(import.meta.env.VITE_TURN_URL && import.meta.env.VITE_TURN_USERNAME && import.meta.env.VITE_TURN_CREDENTIAL)iceServers.push({urls:import.meta.env.VITE_TURN_URL,username:import.meta.env.VITE_TURN_USERNAME,credential:import.meta.env.VITE_TURN_CREDENTIAL});
  this.pc=new RTCPeerConnection({iceServers});
  this.pc.onicecandidate=e=>{if(e.candidate && this.peer)try{this.discovery.send(this.peer.id,{candidate:e.candidate.toJSON()});}catch{this.fail(new Error('Signaling disconnected'));}};
  this.pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(this.pc?.connectionState||'') && !this.stopped)this.fail(new Error('Peer connection closed. Please start again.'));};
  if(initiator)this.setChannel(this.pc.createDataChannel('agniwar',{ordered:true}));else this.pc.ondatachannel=e=>this.setChannel(e.channel);
 }
 private setChannel(dc:RTCDataChannel){this.dc=dc;dc.binaryType='arraybuffer';dc.bufferedAmountLowThreshold=WINDOW_BYTES/2;dc.onbufferedamountlow=()=>this.wake?.();
  dc.onopen=()=>{if(this.isSender){this.control({type:'offer-files',files:this.files.map(({name,size,type})=>({name,size,type}))});this.cb.waiting();}};
  dc.onmessage=e=>{if(typeof e.data==='string'){let m:any;try{m=JSON.parse(e.data)}catch{this.fail(new Error('Invalid transfer message'));return;}
    if(m.type==='ack'){if(Number.isSafeInteger(m.seq) && m.seq>this.acked && m.seq<this.nextSeq){this.acked=m.seq;this.lastAck=Date.now();for(const [seq,size] of this.outstanding){if(seq>m.seq)break;this.outstandingBytes-=size;this.outstanding.delete(seq);}this.wake?.();}return;}
    if(m.type==='accepted'){this.resolve('accepted',true);return;} if(m.type==='declined'){this.resolve('accepted',false);this.cb.declined();this.stop(false);return;}
    if(m.type==='file-ok'){this.resolve('file-ok',m);return;} if(m.type==='cancel'){this.fail(new Error('Transfer cancelled by the other device.'));return;}
    this.queue=this.queue.then(()=>this.handleControl(m)).catch(err=>this.fail(err));
   } else if(e.data instanceof ArrayBuffer){this.queue=this.queue.then(()=>this.handleChunk(e.data)).catch(err=>this.fail(err));}else this.fail(new Error('Invalid data'));
  };
  dc.onclose=()=>{if(!this.stopped)this.fail(new Error('Connection closed before transfer completed.'));};
  dc.onerror=e=>{const detail=(e as RTCErrorEvent).error;this.fail(new Error(detail?.message?`Data connection error: ${detail.message}`:'Data connection error.'));};
 }
 async send(peer:Device,files:File[]){if(!files.length||files.length>MAX_FILES)throw new Error(`Choose 1–${MAX_FILES} files.`);this.isSender=true;this.files=files;this.total=files.reduce((n,f)=>n+f.size,0);this.createPC(peer,true);const offer=await this.pc!.createOffer();await this.pc!.setLocalDescription(offer);this.discovery.send(peer.id,{description:this.pc!.localDescription});this.cb.waiting();
  const accepted=this.until('accepted',120000); if(!(await accepted))return;this.started=performance.now();this.lastAck=Date.now();
  const negotiated=this.pc?.sctp?.maxMessageSize;const chunkSize=Math.max(1024,Math.min(MAX_CHUNK_SIZE,Number.isFinite(negotiated)&&negotiated!>0?negotiated!-4:65532));
  for(let index=0;index<files.length;index++){if(this.stopped)return;const file=files[index];await this.hash.reset();this.control({type:'file-start',index});let offset=0;
   while(offset<file.size){if(this.stopped)return;
    // Hash a bounded batch once; the DataChannel still gets negotiated-size frames.
    const batch=await file.slice(offset,offset+IO_BATCH_BYTES).arrayBuffer();
    const hashing=this.hash.update(batch.slice(0));void hashing.catch(()=>{});
    for(let position=0;position<batch.byteLength;){
     while(this.outstandingBytes>=WINDOW_BYTES || (this.dc?.bufferedAmount||0)>WINDOW_BYTES){if(this.stopped)return;await this.waitForCapacity();}
     if(this.stopped)return;const size=Math.min(chunkSize,batch.byteLength-position);const frame=new ArrayBuffer(4+size);new DataView(frame).setUint32(0,this.nextSeq);new Uint8Array(frame,4).set(new Uint8Array(batch,position,size));this.outstanding.set(this.nextSeq,size);this.outstandingBytes+=size;this.dc!.send(frame);this.nextSeq++;position+=size;offset+=size;this.runningBytes+=size;this.report(file.name);
    }
    await hashing;
   }
   while(this.acked < this.nextSeq-1){if(this.stopped)return;await this.waitForCapacity();}
   const digest=await this.hash.digest();const verified=this.until('file-ok',120000);this.control({type:'file-end',index,digest});const result=await verified;if(result.index!==index || result.ok!==true)throw new Error(`Integrity check failed for ${file.name}.`);
  }
  this.control({type:'complete'});this.cb.complete([]);this.stop(false);
 }
 async onSignal(from:string,data:any){if(this.stopped)return;const peer=this.discovery.peers.find(p=>p.id===from);if(!peer)return;
  if(!this.pc){if(!data.description || data.description.type!=='offer')return;this.createPC(peer,false);}
  if(this.peer?.id!==from)return;
  if(data.description){await this.pc!.setRemoteDescription(data.description);for(const c of this.pendingIce)await this.pc!.addIceCandidate(c);this.pendingIce=[];if(data.description.type==='offer'){const answer=await this.pc!.createAnswer();await this.pc!.setLocalDescription(answer);this.discovery.send(from,{description:this.pc!.localDescription});}}
  else if(data.candidate){if(this.pc!.remoteDescription)await this.pc!.addIceCandidate(data.candidate);else this.pendingIce.push(data.candidate);}
 }
 private control(m:unknown){if(this.dc?.readyState!=='open')throw new Error('Data connection is not open');this.dc.send(JSON.stringify(m));}
 private async handleControl(m:any){
  if(this.stopped)return;
  if(m.type==='offer-files'){
   if(this.isSender || this.incoming.length || !this.peer || !Array.isArray(m.files) || !m.files.length || m.files.length>MAX_FILES || m.files.some((f:any)=>!f || typeof f.name!=='string' || f.name.length>255 || !Number.isSafeInteger(f.size) || f.size<0 || typeof f.type!=='string' || f.type.length>255))throw new Error('Invalid file offer');
   this.incoming=m.files;this.total=this.incoming.reduce((a,f)=>a+f.size,0);if(!Number.isSafeInteger(this.total))throw new Error('Transfer is too large');this.cb.incoming(this.peer,this.incoming);return;
  }
  if(m.type==='file-start'){if(!this.approved || !this.incoming[m.index] || m.index!==this.downloads.length || this.sink)throw new Error('Unexpected file');await this.hash.reset();this.sink=await this.makeSink(this.incoming[m.index]);return;}
  if(m.type==='file-end'){
   const file=this.incoming[m.index];if(!file||!this.sink||m.index!==this.downloads.length||this.fileBytes!==file.size)throw new Error('Incomplete file');const digest=await this.hash.digest();if(digest!==m.digest){await this.sink.abort();this.sink=undefined;this.control({type:'file-ok',index:m.index,ok:false});throw new Error(`Integrity check failed for ${file.name}.`);}
   const {blob,record}=await this.sink.finish();this.sink=undefined;let persistent=true;try{await saveRecord(record,record.kind==='blob'?blob:undefined);}catch{persistent=false;}const download={name:record.name,url:URL.createObjectURL(blob),record,blob,persistent};this.downloads.push(download);this.cb.saved(download);this.fileBytes=0;this.control({type:'file-ok',index:m.index,ok:true});return;
  }
  if(m.type==='complete'){if(this.downloads.length!==this.incoming.length)throw new Error('Transfer incomplete');this.cb.complete(this.downloads.slice());this.stop(false);}
 }
 private fileBytes=0;private receivedSeq=0;private receiveBuffer?:Uint8Array;private receiveUsed=0;private batchLastSeq=-1;
 private async handleChunk(frame:ArrayBuffer){if(this.stopped)return;if(!this.sink||frame.byteLength<5||frame.byteLength>MAX_CHUNK_SIZE+4)throw new Error('Invalid file chunk');const seq=new DataView(frame).getUint32(0);if(seq!==this.receivedSeq)throw new Error('Missing or out-of-order chunk');const bytes=new Uint8Array(frame,4);const file=this.incoming[this.downloads.length];if(this.fileBytes+bytes.byteLength>file.size)throw new Error('File exceeds declared size');
  if(this.receiveBuffer && this.receiveUsed+bytes.byteLength>this.receiveBuffer.byteLength)await this.flushBatch();
  if(!this.receiveBuffer)this.receiveBuffer=new Uint8Array(Math.min(IO_BATCH_BYTES,file.size-this.fileBytes));
  this.receiveBuffer.set(bytes,this.receiveUsed);this.receiveUsed+=bytes.byteLength;this.fileBytes+=bytes.byteLength;this.receivedSeq++;this.batchLastSeq=seq;
  if(this.receiveUsed===this.receiveBuffer.byteLength||this.fileBytes===file.size)await this.flushBatch();
 }
 private async flushBatch(){if(!this.receiveBuffer||!this.receiveUsed)return;const buffer=this.receiveUsed===this.receiveBuffer.byteLength?this.receiveBuffer.buffer:this.receiveBuffer.buffer.slice(0,this.receiveUsed);const size=this.receiveUsed,seq=this.batchLastSeq;this.receiveBuffer=undefined;this.receiveUsed=0;const bytes=buffer as ArrayBuffer;await Promise.all([this.hash.update(bytes.slice(0)),this.sink!.write(bytes)]);if(this.stopped)return;this.runningBytes+=size;this.control({type:'ack',seq});this.report(this.incoming[this.downloads.length].name);}

 private report(file:string){const now=performance.now();if(now-this.lastReport<150&&this.runningBytes!==this.total)return;this.lastReport=now;const seconds=Math.max((now-this.started)/1000,0.001);this.cb.progress(file,this.runningBytes,this.total,this.runningBytes/seconds);}
 private waitForCapacity():Promise<void>{return new Promise((resolve,reject)=>{const elapsed=Date.now()-this.lastAck;if(elapsed>60000){reject(new Error('Transfer stalled. Please try again.'));return;}const timer=window.setTimeout(()=>{this.wake=undefined;reject(new Error('Transfer stalled. Please try again.'));},Math.max(1,60000-elapsed));this.wake=()=>{clearTimeout(timer);this.wake=undefined;resolve();};});}
 async accept(directory?:FileSystemDirectoryHandle){try{await openStore();this.directory=directory;const estimate=directory?undefined:await navigator.storage?.estimate?.();if(estimate?.quota && estimate.usage!==undefined && this.total>estimate.quota-estimate.usage)throw new Error('Not enough available browser storage.');this.started=performance.now();this.approved=true;this.control({type:'accepted'});}catch(e){this.fail(e);}}
 decline(){try{this.control({type:'declined'});}finally{this.stop(false);}}
 cancel(){try{if(this.dc?.readyState==='open')this.control({type:'cancel'});}catch{}this.stop(true);}
 private async makeSink(file:FileInfo):Promise<Sink>{
  const id=makeId(),created=Date.now();
  if(this.directory){const dir=this.directory;const cleaned=(file.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,180)||'file');const dot=cleaned.lastIndexOf('.');const name=dot>0?`${cleaned.slice(0,dot)}-${id.slice(-8)}${cleaned.slice(dot)}`:`${cleaned}-${id.slice(-8)}`;
   // Random suffix avoids overwriting same-named files; retry if one already exists.
   try{await dir.getFileHandle(name);throw new Error('A file with the generated name already exists; please retry.');}catch(e){if((e as DOMException).name!=='NotFoundError')throw e;}
   const handle=await dir.getFileHandle(name,{create:true});let writable:FileSystemWritableFileStream;try{writable=await handle.createWritable();}catch(e){try{await dir.removeEntry(name)}catch{}throw e;}
   return {write:async b=>{await writable.write(b);},finish:async()=>{await writable.close();return {blob:await handle.getFile(),record:{id,name,size:file.size,created,kind:'directory',handle}};},abort:async()=>{try{await writable.abort()}finally{try{await dir.removeEntry(name)}catch{}}}};
  }
  if(navigator.storage?.getDirectory){let root:FileSystemDirectoryHandle|undefined;try{root=await navigator.storage.getDirectory();const handle=await root.getFileHandle(id,{create:true});const writable=await handle.createWritable();const directory=root;return {write:async b=>{await writable.write(b);},finish:async()=>{await writable.close();return {blob:await handle.getFile(),record:{id,name:file.name,size:file.size,created,kind:'opfs'}};},abort:async()=>{try{await writable.abort()}finally{try{await directory.removeEntry(id)}catch{}}}};}catch{if(root)try{await root.removeEntry(id)}catch{}}}
  // When OPFS is unavailable (including plain HTTP LAN origins), stream bounded
  // segments into IndexedDB instead of retaining the entire file in JS memory.
  const record:ReceivedFile={id,name:file.name,size:file.size,created,kind:'segments',type:file.type};let index=0;
  return {write:async b=>{await writeSegment(id,index++,b);},finish:async()=>({blob:await recordFile(record),record}),abort:async()=>{await discardSegments(id);}};
 }
 private until(key:string,ms:number){return new Promise<any>((resolve,reject)=>{const timer=window.setTimeout(()=>{this.awaiting.delete(key);reject(new Error('Transfer timed out.'));},ms);this.awaiting.set(key,{resolve,reject,timer});});}
 private resolve(key:string,value:any){const p=this.awaiting.get(key);if(p){clearTimeout(p.timer);this.awaiting.delete(key);p.resolve(value);}}
 public reportError(error:unknown){this.fail(error);}
 private fail(error:unknown){if(this.stopped)return;const msg=error instanceof DOMException && error.name==='QuotaExceededError'?'Browser storage is full or its quota was exceeded. Free space or choose another storage method.':error instanceof Error?(error.message||`Browser operation failed (${error.name}).`):String(error);this.cb.error(msg);this.stop(true);}
 private stop(clean:boolean){if(this.stopped)return;this.stopped=true;this.wake?.();this.discovery.removeEventListener('signal',this.signalHandler);for(const p of this.awaiting.values()){clearTimeout(p.timer);p.reject(new Error('Transfer stopped'));}this.awaiting.clear();this.dc?.close();this.pc?.close();this.hash.close();if(clean){const sink=this.sink;if(sink)void this.queue.finally(()=>sink.abort()).catch(()=>{});}}
}
