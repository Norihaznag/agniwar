export class HashWorker {
  private worker = new Worker(new URL('../workers/hash.ts',import.meta.url),{type:'module'});
  private next=0;
  private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
  constructor(){this.worker.onmessage=e=>{const p=this.pending.get(e.data.id); if(p){this.pending.delete(e.data.id);p.resolve(e.data);}}; this.worker.onerror=()=>{for(const p of this.pending.values())p.reject(new Error('Hash worker failed'));this.pending.clear();};}
  private ask(type:string,data?:ArrayBuffer):Promise<any>{return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.worker.postMessage({type,data,id},data?[data]:[]);});}
  async reset(){await this.ask('reset');}
  async update(data:ArrayBuffer):Promise<ArrayBuffer>{return (await this.ask('update',data)).data;}
  async digest():Promise<string>{return (await this.ask('digest')).digest;}
  close(){this.worker.terminate();for(const p of this.pending.values())p.reject(new Error('Hash worker closed'));this.pending.clear();}
}
