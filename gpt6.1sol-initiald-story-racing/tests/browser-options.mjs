export const browserOptions={
  ...(process.env.BENCH_BROWSER_EXECUTABLE?{executablePath:process.env.BENCH_BROWSER_EXECUTABLE}:{channel:process.env.BENCH_BROWSER_CHANNEL||'chrome'}),
  headless:true,args:['--enable-webgl','--ignore-gpu-blocklist',...(process.env.BENCH_BROWSER_ANGLE?['--use-gl=angle','--use-angle='+process.env.BENCH_BROWSER_ANGLE]:[])]
};

export async function graphicsInfo(page){
  return page.evaluate(()=>{
    const gl=document.querySelector('canvas')?.getContext('webgl2');if(!gl)return null;
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(debug?debug.UNMASKED_VENDOR_WEBGL:gl.VENDOR)};
  });
}

// Other workspace projects share Vite. Freeze only its reload/update commands
// during a QA run; application traffic and server errors still pass through.
export async function isolateLiveReload(page){
  await page.routeWebSocket(/.*/,socket=>{
    const server=socket.connectToServer();
    if(!socket.protocols().includes('vite-hmr'))return;
    server.onMessage(message=>{
      let payload;try{payload=JSON.parse(String(message));}catch{}
      if(['update','full-reload'].includes(payload?.type))return;
      socket.send(message);
    });
  });
}
