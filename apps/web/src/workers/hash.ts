import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
let hash = sha256.create();
self.onmessage = (event: MessageEvent<{type:string; data?:ArrayBuffer; id:number}>) => {
  const {type,data,id}=event.data;
  if(type==='reset') {hash=sha256.create(); self.postMessage({id});}
  else if(type==='update' && data) {hash.update(new Uint8Array(data)); self.postMessage({id,data},[data]);}
  else if(type==='digest') self.postMessage({id,digest:bytesToHex(hash.digest())});
};
