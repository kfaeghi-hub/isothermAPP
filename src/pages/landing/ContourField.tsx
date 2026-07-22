// The 3D centerpiece: a shader-displaced plane rendered as iso-elevation
// contour lines — vermilion banding into lavender over cover purple, with
// distance fog. Full-bleed fixed canvas persisting behind the whole page;
// every animation is a uniform change, driven from the scroll choreography
// via the shared `params` ref. Landing-chunk-only (three imported nowhere
// else). WebGL failure → the caller-provided CSS fallback renders instead:
// a phone that shows something simple beats a phone that shows nothing.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type FieldParams = {
  amp: number       // noise amplitude — how mountainous the field is
  density: number   // contour line density
  hueMix: number    // 0 = vermilion lines, 1 = lavender at elevation
  drift: number     // time multiplier for the flow
}

export const INITIAL_FIELD: FieldParams = { amp: 0.55, density: 8, hueMix: 0.15, drift: 1 }

const VERT = /* glsl */ `
  // 2D simplex noise — Ashima Arts / Ian McEwan (MIT), the standard implementation.
  vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec2 mod289(vec2 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+10.0)*x);}
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  uniform float uTime;
  uniform float uAmp;
  uniform vec3  uPointer;   // x, y in plane space; z = strength
  varying float vElev;
  varying float vDist;

  void main() {
    vec3 pos = position;
    float t = uTime * 0.055;
    float n = snoise(vec2(pos.x * 0.26 + t,        pos.y * 0.30 - t * 0.7)) * 0.62
            + snoise(vec2(pos.x * 0.72 - t * 0.5,  pos.y * 0.80 + t * 0.3)) * 0.28
            + snoise(vec2(pos.x * 1.85 + t * 0.2,  pos.y * 2.05))           * 0.10;
    float bump = uPointer.z * exp(-(pow(pos.x - uPointer.x, 2.0) + pow(pos.y - uPointer.y, 2.0)) * 0.5);
    float e = n * uAmp + bump;
    pos.z += e;
    vElev = e;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;
  uniform float uHueMix;
  varying float vElev;
  varying float vDist;

  void main() {
    vec3 ground    = vec3(0.051, 0.045, 0.118);  // between cover #181536 and slate-950
    vec3 vermilion = vec3(0.910, 0.263, 0.176);  // #E8432D
    vec3 lavender  = vec3(0.498, 0.471, 0.796);  // #7f78cb (brand-400)

    float g = vElev * uDensity + uTime * 0.03;   // bands drift slowly through the relief
    float f = abs(fract(g) - 0.5);
    float w = fwidth(g);
    float line = 1.0 - smoothstep(w, w * 2.6, f);

    float h = clamp(vElev * 0.55 + 0.5, 0.0, 1.0);
    vec3 lineCol = mix(vermilion, lavender, clamp(h * uHueMix * 1.7, 0.0, 1.0));
    float fog = smoothstep(2.5, 10.5, vDist);
    float glow = line * (0.35 + 0.65 * h);
    vec3 col = ground + lineCol * glow * (1.0 - fog * 0.88);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function ContourField({ params, fallback }: {
  params: React.MutableRefObject<FieldParams>
  fallback: React.ReactNode
}) {
  const mount = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = mount.current
    if (!el) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      if (!renderer.getContext()) throw new Error('no webgl context')
    } catch {
      setFailed(true)
      return
    }

    const coarse = window.matchMedia('(pointer: coarse)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#100e26')
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 40)
    camera.position.set(0, 2.3, 5.4)
    camera.lookAt(0, 0.3, 0)

    const uniforms = {
      uTime:    { value: 0 },
      uAmp:     { value: 0 },              // choreography breathes it in
      uDensity: { value: params.current.density },
      uHueMix:  { value: params.current.hueMix },
      uPointer: { value: new THREE.Vector3(0, 0, 0) },
    }
    const geo = new THREE.PlaneGeometry(17, 11, coarse ? 130 : 230, coarse ? 84 : 150)
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms })
    const plane = new THREE.Mesh(geo, mat)
    plane.rotation.x = -Math.PI / 2.55
    plane.position.y = -0.6
    scene.add(plane)

    // Pointer → eased gaussian bump (fine pointers only)
    const target = new THREE.Vector3(0, 0, 0)
    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      target.set(nx * 6.5, -ny * 3.2 - 1.2, 0.55)
    }
    if (!coarse) window.addEventListener('pointermove', onPointer)

    let raf = 0
    const clock = new THREE.Clock()
    const tick = () => {
      const p = params.current
      uniforms.uTime.value += clock.getDelta() * p.drift
      uniforms.uAmp.value += (p.amp - uniforms.uAmp.value) * 0.06
      uniforms.uDensity.value += (p.density - uniforms.uDensity.value) * 0.06
      uniforms.uHueMix.value += (p.hueMix - uniforms.uHueMix.value) * 0.06
      uniforms.uPointer.value.lerp(target, 0.055)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (!coarse) window.removeEventListener('pointermove', onPointer)
      geo.dispose(); mat.dispose(); renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [params])

  if (failed) return <>{fallback}</>
  return <div ref={mount} className="fixed inset-0 z-0" aria-hidden="true" />
}
