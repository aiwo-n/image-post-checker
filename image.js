// Original parser reused from acceptedv0.2. Browser module only.
export const LIMIT={bytes:10485760,pixels:16000000,edge:8192};
const MAX_PIXELS=LIMIT.pixels,MAX_EDGE=LIMIT.edge;
const fail=message=>{throw Error(message);};
function exif(view,start,end){if(start+8>end)fail('回転情報が破損しています。');const order=view.getUint16(start),le=order===0x4949;if(!le&&order!==0x4d4d||view.getUint16(start+2,le)!==42)fail('回転情報を確認できません。');const off=view.getUint32(start+4,le),at=start+off;if(off<8||at+2>end)fail('回転情報の範囲が不正です。');const count=view.getUint16(at,le);if(count>128||at+2+count*12>end)fail('回転情報の範囲が不正です。');let value=1,seen=false;for(let i=0;i<count;i++){const p=at+2+i*12;if(view.getUint16(p,le)===0x112){if(seen||view.getUint16(p+2,le)!==3||view.getUint32(p+4,le)!==1)fail('回転情報が不正です。');value=view.getUint16(p+8,le);if(value<1||value>8)fail('回転情報が未対応です。');seen=true;}}return value;}
export function metadata(buffer){const b=new Uint8Array(buffer),v=new DataView(buffer);let w,h,orientation=1,format;
if(b.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)){
 format='PNG';if(v.getUint32(8)!==13||String.fromCharCode(...b.slice(12,16))!=='IHDR'||b.length<33)fail('画像情報が破損しています。');w=v.getUint32(16);h=v.getUint32(20);let at=8,ended=false,n=0;
 while(at+12<=b.length){if(++n>4096)fail('画像情報が多すぎます。');const size=v.getUint32(at);if(size>b.length-at-12)fail('画像情報が途中で切れています。');const type=String.fromCharCode(...b.slice(at+4,at+8));if(type==='acTL')fail('アニメーションPNGは未対応です。');at+=12+size;if(type==='IEND'){ended=true;break;}}
 if(!ended)fail('画像情報が途中で切れています。');
}else if(b.length>=4&&b[0]===255&&b[1]===216){
 format='JPEG';let at=2,n=0,seenExif=false;
 while(at<b.length){if(++n>4096||b[at++]!==255)fail('画像情報が破損しています。');while(at<b.length&&b[at]===255)at++;if(at>=b.length)break;const marker=b[at++];if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;if(at+2>b.length)fail('画像情報が途中で切れています。');const size=v.getUint16(at);if(size<2||at+size>b.length)fail('画像情報が途中で切れています。');const start=at+2,end=at+size;
 if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(size<8||w)fail('画像情報の寸法が不正です。');h=v.getUint16(start+1);w=v.getUint16(start+3);}
 if(marker===0xe1&&size>=8&&String.fromCharCode(...b.slice(start,start+6))==='Exif\0\0'){if(seenExif)fail('回転情報が重複しています。');orientation=exif(v,start+6,end);seenExif=true;}
 at=end;}
 if(!w||!h)fail('画像情報を確認できません。');
}else fail('PNG/JPEGの静止画だけに対応しています。拡張子ではなく内容で確認しています。');
if(!w||!h||w>MAX_EDGE||h>MAX_EDGE||w*h>MAX_PIXELS)fail('画像の辺または画素数が上限を超えています（1辺8192 px・1600万画素まで）。');
return{w,h,orientation,format,dw:orientation>=5?h:w,dh:orientation>=5?w:h};}
export const gcd=(a,b)=>b?gcd(b,a%b):a;
export async function readImage(file,live=()=>true){if(!file.size)throw Error('空のファイルです。');if(file.size>LIMIT.bytes)throw Error('10 MiBの読取上限を超えています。');let timed=false;const timer=setTimeout(()=>{timed=true;},5000);let bitmap;try{const data=await file.arrayBuffer();if(!live())return null;const meta=metadata(data);try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('画像を読み取れません。破損または未対応です。');}if(timed)throw Error('画像の処理が5秒を超えました。');if(!live()){bitmap.close();bitmap=null;return null;}if(bitmap.width!==meta.dw||bitmap.height!==meta.dh)throw Error('画像情報の寸法が一致しません。');return{file,meta,bitmap,alpha:meta.format==='PNG'&&(new Uint8Array(data)[25]===6||new Uint8Array(data)[25]===4||containsTransparency(data))};}catch(e){bitmap?.close();throw e;}finally{clearTimeout(timer);}}
function containsTransparency(buffer){const b=new Uint8Array(buffer),v=new DataView(buffer);let count=0;for(let p=8;p+12<=b.length;){if(++count>4096)return true;const n=v.getUint32(p),type=String.fromCharCode(...b.slice(p+4,p+8));if(n>b.length-p-12)return true;if(type==='tRNS')return true;if(type==='IEND')break;p+=n+12;}return false;}
export function paint(canvas,bitmap){const s=Math.min(1,512/bitmap.width,512/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*s));canvas.height=Math.max(1,Math.round(bitmap.height*s));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);}
export function resizePlan(meta,text){if(!/^\d+$/.test(text))throw Error('幅は整数で指定してください。');const n=Number(text);if(n<1||n>8192)throw Error('寸法の上限は1辺8192pxです。');const g=gcd(meta.dw,meta.dh),a=meta.dw/g,b=meta.dh/g,k=Math.max(1,Math.round(n/a)),w=a*k,h=b*k;if(w>8192||h>8192||w*h>16000000)throw Error('生成画像の上限は1辺8192px・1600万画素です。');return{w,h,ratio:a+':'+b,adjusted:w!==n};}
export async function encode(bitmap,spec){const c=document.createElement('canvas');c.width=spec.w;c.height=spec.h;const ctx=c.getContext('2d');if(spec.format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);}ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();try{const blob=await new Promise((r,j)=>c.toBlob(b=>b?r(b):j(Error('画像を生成できませんでした。')),'image/'+spec.format,spec.quality));if(blob.type!=='image/'+spec.format)throw Error('指定形式で生成できませんでした。');if(blob.size>33554432)throw Error('生成容量の32 MiB上限を超えました。');return blob;}finally{c.width=1;c.height=1;}}
export function outputName(name,op,w,h,format){return 'image'+(op==='compress'?'-compressed':'-resized-'+w+'x'+h)+(format==='jpeg'?'.jpg':'.png');}
