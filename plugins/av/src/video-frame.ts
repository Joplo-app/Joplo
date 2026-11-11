/** Copy the decoder image synchronously; native <video> compositor presentation may lag seeked. */
export function presentDecodedFrame(video:HTMLVideoElement,canvas:HTMLCanvasElement,target:number):boolean {
  if(video.seeking||video.readyState<2||!video.videoWidth||!video.videoHeight||Math.abs(video.currentTime-target)>.001)return false;
  const context=canvas.getContext('2d');if(!context)return false;
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  context.drawImage(video,0,0,canvas.width,canvas.height);
  return true;
}

/** A cancellable decoder transaction. Its Promise settles only after the canvas owns target pixels. */
export function seekVideoFrame(video:HTMLVideoElement,canvas:HTMLCanvasElement,target:number,signal:AbortSignal,committed:()=>void):Promise<void> {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{video.removeEventListener('loadedmetadata',seek);video.removeEventListener('loadeddata',loaded);video.removeEventListener('seeked',ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);};
    const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error);};
    const ready=()=>{
      if(settled||signal.aborted)return;
      try{if(!presentDecodedFrame(video,canvas,target))return;committed();settled=true;cleanup();resolve();}catch(error){fail(error);}
    };
    const seek=()=>{if(signal.aborted)return;try{if(video.readyState>=1)video.currentTime=target;}catch(error){fail(error);}};
    const loaded=()=>{if(target===0)ready();};
    const failed=()=>fail(new Error(`Video decode failed${video.error?` (code ${video.error.code}): ${video.error.message}`:''}`));
    const aborted=()=>fail(new DOMException('Frame presentation cancelled','AbortError'));
    if(signal.aborted){aborted();return;}
    video.pause();
    // A changed src must not reuse pixels left over from the previous resource.
    if(video.currentSrc===video.src&&!video.seeking&&Math.abs(video.currentTime-target)<=.001){ready();if(settled)return;}
    video.addEventListener('loadedmetadata',seek);video.addEventListener('loadeddata',loaded);video.addEventListener('seeked',ready);video.addEventListener('error',failed);signal.addEventListener('abort',aborted,{once:true});
    if(video.error){failed();return;}seek();
  });
}
