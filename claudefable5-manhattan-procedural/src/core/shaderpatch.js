// 全局着色器补丁:积雪 / 树摇 / 立面 UV 实例化重复。
// 所有材质共享这里的 uniform,天气系统直接改 value 即可驱动全城。
export const globalUniforms = {
  uSnow: { value: 0 },   // 积雪覆盖 0..1(按朝上法线混白)
  uWind: { value: 4 },   // 风速 m/s
  uTime: { value: 0 },
};

function chain(mat, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    fn(shader);
  };
}

function cacheKey(mat, tag) {
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + '|' + tag;
}

// 积雪:按世界朝上法线把漫反射混向雪白,uSnow 全局驱动
export function applySnowPatch(mat) {
  chain(mat, (shader) => {
    shader.uniforms.uSnowCover = globalUniforms.uSnow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnowCover;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 _vup = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float _up = smoothstep(0.5, 0.9, dot(normalize(vNormal), _vup));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), uSnowCover * _up);
}`);
  });
  cacheKey(mat, 'snow');
}

// 立面窗格:实例属性 aRep 控制贴图重复次数(不同尺寸楼共用一张窗格图不拉伸)
export function applyFacadeRepPatch(mat) {
  chain(mat, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRep;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv *= aRep;
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv *= aRep;
#endif`);
  });
  cacheKey(mat, 'facadeRep');
}

// 树冠摇曳:按实例世界位置取相位,风越大摆幅越大(只影响离地高的顶点)
export function applySwayPatch(mat) {
  chain(mat, (shader) => {
    shader.uniforms.uWindSway = globalUniforms.uWind;
    shader.uniforms.uSwayTime = globalUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindSway;\nuniform float uSwayTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  float _ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.17;
  float _amp = uWindSway * 0.014 * max(transformed.y + 1.2, 0.0);
  transformed.x += sin(uSwayTime * 1.5 + _ph) * _amp;
  transformed.z += cos(uSwayTime * 1.13 + _ph * 1.31) * _amp;
}
#endif`);
  });
  cacheKey(mat, 'sway');
}
