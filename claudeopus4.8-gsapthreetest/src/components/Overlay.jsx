import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * 滚动内容层（纯 DOM）。它撑出页面滚动高度，是所有 ScrollTrigger 的源头。
 * 同时演示 ScrollTrigger 也能驱动普通 DOM：顶部进度条 + 卡片入场。
 */
export default function Overlay() {
  const root = useRef(null)

  useGSAP(
    () => {
      // 顶部进度条：scaleX 跟随滚动
      gsap.fromTo(
        '#progress',
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: true },
        },
      )

      // 首屏 hero 卡片：页面加载就入场（不挂 ScrollTrigger）——
      // 否则 gsap.from + ScrollTrigger 会把首屏元素 immediateRender 成隐藏态而 onEnter 不触发，导致顶部看不到文字。
      gsap.from('.hero', { opacity: 0, y: 30, duration: 1, ease: 'power3.out', delay: 0.15 })

      // 其余卡片：进入视口时淡入上浮
      gsap.utils.toArray('.card:not(.hero)').forEach((el) => {
        gsap.from(el, {
          y: 50,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
        })
      })
    },
    { scope: root },
  )

  return (
    <div ref={root}>
      <div id="progress" className="progress" />

      <main id="scroll">
        <section className="section center">
          <div className="card hero">
            <span className="tag">01 — 启程</span>
            <h1>{'GSAP ScrollTrigger\n× Three.js'}</h1>
            <p>
              向下滚动,相机会沿一条平滑曲线穿越光环隧道——
              每一帧镜头都由滚动进度驱动。
            </p>
            <span className="hint">
              <span className="dot" />
              向下滚动开始飞行
            </span>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <span className="tag">02 — 原理</span>
            <h1>滚动即时间轴</h1>
            <p>
              <code>ScrollTrigger</code> 把页面滚动归一化为 0→1 的进度;相机的位置与朝向都由这一进度从中心线取样
              (<code>centerline(z)</code>),于是滚动多少、镜头就飞到哪。
            </p>
          </div>
        </section>

        <section className="section right">
          <div className="card">
            <span className="tag">03 — 平滑</span>
            <h1>解耦 + lerp</h1>
            <p>
              ScrollTrigger 只把进度写进一个代理值,<code>useFrame</code> 每帧用 <code>lerp</code> 平滑追赶并写入相机。
              滚动与渲染解耦,顺滑且不抖,也避免两处抢同一属性。
            </p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <span className="tag">04 — R3F 集成</span>
            <h1>useGSAP 托管生命周期</h1>
            <p>
              用 <code>@gsap/react</code> 的 <code>useGSAP()</code> 创建动画,组件卸载 / HMR / 依赖变化时自动
              <code>revert()</code>——彻底告别 ScrollTrigger 泄漏与重复绑定,连 StrictMode 双调用都安全。
            </p>
          </div>
        </section>

        <section className="section center">
          <div className="card">
            <span className="tag">05 — 抵达</span>
            <h1>各管各的</h1>
            <p>
              GSAP/ScrollTrigger 管镜头、drei <code>&lt;Float&gt;</code> 管漂浮、<code>useFrame</code> 管平滑落位——
              每个属性只有一个数据源,互不打架。这就是 R3F 里用 GSAP 的正确姿势。
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
