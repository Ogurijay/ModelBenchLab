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
