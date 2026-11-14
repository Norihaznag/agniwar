import type {Device, ServerMessage} from '../../../../packages/shared/src/types';
export class Discovery extends EventTarget {
  private ws?: WebSocket; private delay=1000; private timer?:number; private stopped=false;
  device?:Device; peers:Device[]=[];
  connect(){
    const env=import.meta.env.VITE_SIGNAL_URL;
    const url=env || `${location.protocol==='https:'?'wss:':'ws:'}//${location.hostname}:8787/signal`;
    this.ws=new WebSocket(url);
    this.ws.onopen=()=>{this.delay=1000;this.emit('status','online');};
    this.ws.onmessage=e=>{let m:ServerMessage;try{m=JSON.parse(e.data)}catch{return;}
      if(m.type==='hello'){this.device=m.device;this.emit('hello',m);}
      if(m.type==='peers'){this.peers=m.peers;this.emit('peers',m.peers);}
      if(m.type==='signal')this.emit('signal',m);
      if(m.type==='error')this.emit('error',m.message);
    };
    this.ws.onclose=()=>{this.peers=[];this.emit('peers',[]);this.emit('status','offline');if(!this.stopped){this.timer=window.setTimeout(()=>this.connect(),this.delay);this.delay=Math.min(30000,this.delay*2);}};
    this.ws.onerror=()=>this.ws?.close();
  }
  private emit(type:string,detail:any){this.dispatchEvent(new CustomEvent(type,{detail}));}
  send(to:string,data:unknown){if(this.ws?.readyState!==WebSocket.OPEN)throw new Error('Signaling is disconnected');this.ws.send(JSON.stringify({type:'signal',to,data}));}
  close(){this.stopped=true;clearTimeout(this.timer);this.ws?.close();}
}
