import {expect,it,vi} from 'vitest';
import {presentDecodedFrame} from '../src/video-frame.ts';
it('copies decoded static video pixels before releasing presentation, rejecting stale seek events',()=>{
 const drawImage=vi.fn(),canvas:any={getContext:()=>({drawImage})};
 const video:any={seeking:true,readyState:2,videoWidth:320,videoHeight:180,currentTime:1};
 expect(presentDecodedFrame(video,canvas,1)).toBe(false);
 video.seeking=false;video.currentTime=.5;expect(presentDecodedFrame(video,canvas,1)).toBe(false);
 expect(drawImage).not.toHaveBeenCalled();
 video.currentTime=1;expect(presentDecodedFrame(video,canvas,1)).toBe(true);expect(drawImage).toHaveBeenCalledWith(video,0,0,320,180);
 expect([canvas.width,canvas.height]).toEqual([320,180]);
 video.readyState=1;expect(presentDecodedFrame(video,canvas,1)).toBe(false);
});

import {seekVideoFrame} from '../src/video-frame.ts';
function decoder(){
 const video=Object.assign(new EventTarget(),{seeking:false,readyState:2,videoWidth:128,videoHeight:32,currentTime:0,currentSrc:'clip',src:'clip',pause:vi.fn(),error:null as null|{code:number;message:string}});
 const drawImage=vi.fn(),canvas={getContext:()=>({drawImage})} as unknown as HTMLCanvasElement;
 return {video,canvas,drawImage};
}
it('waits target seek before committing and removes listeners on cancellation',async()=>{
 const {video,canvas,drawImage}=decoder(),controller=new AbortController(),commit=vi.fn();
 const promise=seekVideoFrame(video as unknown as HTMLVideoElement,canvas,1,controller.signal,commit);
 expect(drawImage).not.toHaveBeenCalled();video.dispatchEvent(new Event('seeked'));await promise;expect(commit).toHaveBeenCalledOnce();
 const second=new AbortController(),pending=seekVideoFrame(video as unknown as HTMLVideoElement,canvas,2,second.signal,commit);
 second.abort();await expect(pending).rejects.toThrow('cancelled');video.dispatchEvent(new Event('seeked'));expect(commit).toHaveBeenCalledOnce();
});
it('reports decoder failure and never commits late pixels after rejection',async()=>{
 const {video,canvas,drawImage}=decoder(),controller=new AbortController();
 const promise=seekVideoFrame(video as unknown as HTMLVideoElement,canvas,1,controller.signal,vi.fn());
 video.error={code:3,message:'corrupt packet'};video.dispatchEvent(new Event('error'));await expect(promise).rejects.toThrow('corrupt packet');video.dispatchEvent(new Event('seeked'));expect(drawImage).not.toHaveBeenCalled();
});
