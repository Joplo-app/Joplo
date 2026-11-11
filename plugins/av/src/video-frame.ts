/** Copy the decoder image synchronously; native <video> compositor presentation may lag seeked. */
export function presentDecodedFrame(video:HTMLVideoElement,canvas:HTMLCanvasElement,target:number):boolean {
  if(video.seeking||video.readyState<2||!video.videoWidth||!video.videoHeight||Math.abs(video.currentTime-target)>.001)return false;
  const context=canvas.getContext('2d');if(!context)return false;
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  context.drawImage(video,0,0,canvas.width,canvas.height);
  return true;
}
