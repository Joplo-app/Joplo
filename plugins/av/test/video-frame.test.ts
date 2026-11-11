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
