// The 3D centerpiece, V3: an abstracted cutaway building with living
// mechanical systems — an engineering drawing rendered in light. Six floor
// slabs + columns (dim structural lines), a mechanical penthouse, a duct
// trunk with per-floor branches (vermilion, air), twin hydronic risers with
// floor rings (lavender), an electrical riser with panel outlines (pale).
// Airflow particles advect along the duct polylines; the cursor injects a
// decaying swirl on fine pointers. STYLE RULES: primitives and polylines
// only, thin additive lines, depth by opacity — never photoreal, no
// textures, no manufacturer geometry. Complexity comes from arrangement
// and motion, not model detail.
//
// Scroll choreography drives the shared `params` ref:
//   cam   0..1.15 — keyframed descent through the floors, then pull-back
//   air / hydro / elec  0..1 — system ignition intensities
//   glow  overall brightness · speed — particle flow multiplier

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type SystemParams = {
  cam: number
  air: number
  hydro: number
  elec: number
  glow: number
  speed: number
}

// A faint idle airflow at load so the hero reads as a living instrument, not
// a dead drawing; beat 1 tweens it to full ignition.
export const INITIAL_SYSTEMS: SystemParams = { cam: 0, air: 0.22, hydro: 0, elec: 0, glow: 0.9, speed: 1 }

const VERMILION = 0xe8432d
const LAVENDER  = 0x7f78cb
const STRUCTURE = 0x5d55af
const PALE      = 0xcfd0e8

// Building envelope: x width 3.2, z depth 2.1, six floors 0.55 apart.
const FLOORS = 6
const FLOOR_H = 0.55
const W = 3.2, D = 2.1
const ROOF_Y = FLOORS * FLOOR_H // 3.3

function boxEdges(w: number, h: number, d: number, x: number, y: number, z: number): number[] {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  const arr = Array.from(g.attributes.position.array as Float32Array)
  g.dispose()
  const out: number[] = []
  for (let i = 0; i < arr.length; i += 3) out.push(arr[i] + x, arr[i + 1] + y, arr[i + 2] + z)
  return out
}

/** Polyline waypoints → line-segment pairs. */
function polySegments(points: THREE.Vector3[]): number[] {
  const out: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    out.push(points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z)
  }
  return out
}

function lineSegs(positions: number[], color: number, opacity: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  return new THREE.LineSegments(geo, mat)
}

/** Duct paths: trunk from the penthouse down + an L-branch per floor, alternating sides. */
function ductPaths(): THREE.Vector3[][] {
  const paths: THREE.Vector3[][] = []
  const trunkX = 0.35, trunkZ = 0
  for (let f = FLOORS - 1; f >= 0; f--) {
    const y = f * FLOOR_H + 0.28
    const side = f % 2 === 0 ? 1 : -1
    paths.push([
      new THREE.Vector3(trunkX, ROOF_Y + 0.45, trunkZ),          // penthouse plenum
      new THREE.Vector3(trunkX, y, trunkZ),                       // down the trunk
      new THREE.Vector3(trunkX + side * 0.55, y, trunkZ),         // out
      new THREE.Vector3(trunkX + side * 0.55, y, side * (D / 2 - 0.15)), // across to the edge
      new THREE.Vector3(side * (W / 2 - 0.2), y, side * (D / 2 - 0.15)), // run the perimeter
    ])
  }
  return paths
}

export function BuildingSection({ params, fallback }: {
  params: React.MutableRefObject<SystemParams>
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
      if (!renderer.getContext()) throw new Error('no webgl')
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
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60)
    const group = new THREE.Group()
    group.position.y = -ROOF_Y / 2 // center the building vertically around origin
    scene.add(group)

    // ── Structure: floor slabs, columns, penthouse ────────────────────────────
    const structural: number[] = []
    for (let f = 0; f <= FLOORS; f++) structural.push(...boxEdges(W, 0.03, D, 0, f * FLOOR_H, 0))
    for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      structural.push(cx, 0, cz, cx, ROOF_Y, cz)
    }
    structural.push(...boxEdges(1.9, 0.75, 1.3, -0.35, ROOF_Y + 0.38, 0))   // penthouse
    structural.push(...boxEdges(0.8, 0.45, 0.6, 0.35, ROOF_Y + 0.23, 0))    // the unit on the roof
    const structureLines = lineSegs(structural, STRUCTURE, 0.28)
    group.add(structureLines)

    // ── Air-side: duct trunk rings + branch runs ─────────────────────────────
    const paths = ductPaths()
    const airSegs: number[] = []
    for (const p of paths) airSegs.push(...polySegments(p))
    for (let y = 0.3; y < ROOF_Y; y += 0.45) airSegs.push(...boxEdges(0.34, 0.001, 0.34, 0.35, y, 0)) // trunk rings
    const airLines = lineSegs(airSegs, VERMILION, 0.05)
    group.add(airLines)

    // ── Hydronic: twin risers + floor-crossing rings ─────────────────────────
    const hySegs: number[] = []
    for (const z of [0.55, -0.55]) {
      hySegs.push(-1.2, 0, z, -1.2, ROOF_Y + 0.3, z)
      for (let f = 1; f <= FLOORS; f++) hySegs.push(...boxEdges(0.14, 0.001, 0.14, -1.2, f * FLOOR_H, z))
    }
    const hydroLines = lineSegs(hySegs, LAVENDER, 0.05)
    group.add(hydroLines)

    // ── Electrical: riser + panel outline per floor ──────────────────────────
    const elSegs: number[] = []
    elSegs.push(1.35, 0, -0.8, 1.35, ROOF_Y, -0.8)
    for (let f = 0; f < FLOORS; f++) elSegs.push(...boxEdges(0.001, 0.22, 0.16, 1.35, f * FLOOR_H + 0.28, -0.8))
    const elecLines = lineSegs(elSegs, PALE, 0.04)
    group.add(elecLines)

    // ── Airflow particles along the duct paths ───────────────────────────────
    const COUNT = coarse ? 260 : 640
    const cum: { pts: THREE.Vector3[]; lens: number[]; total: number }[] = paths.map(pts => {
      const lens = [0]
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]))
      return { pts, lens, total: lens[lens.length - 1] }
    })
    const pPath = new Uint8Array(COUNT), pT = new Float32Array(COUNT), pSpeed = new Float32Array(COUNT)
    const pOff = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      pPath[i] = i % cum.length
      pT[i] = Math.random()
      pSpeed[i] = 0.05 + Math.random() * 0.07
    }
    const pGeo = new THREE.BufferGeometry()
    const pPos = new Float32Array(COUNT * 3)
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const pMat = new THREE.PointsMaterial({
      color: VERMILION, size: 0.035, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
    const points = new THREE.Points(pGeo, pMat)
    group.add(points)
    const sample = (c: typeof cum[0], t: number, out: THREE.Vector3) => {
      const target = t * c.total
      let i = 1
      while (i < c.lens.length - 1 && c.lens[i] < target) i++
      const seg = (target - c.lens[i - 1]) / (c.lens[i] - c.lens[i - 1] || 1)
      out.lerpVectors(c.pts[i - 1], c.pts[i], seg)
    }

    // ── Camera keyframes: hero orbit height → descent → pull-back ────────────
    const CAM_POS = [
      new THREE.Vector3(5.0, 2.4, 6.2),   // hero: full tower composed, penthouse crowning
      new THREE.Vector3(4.0, 1.6, 4.9),   // upper floors
      new THREE.Vector3(3.7, 0.4, 4.4),   // mid floors
      new THREE.Vector3(3.9, -0.7, 4.6),  // lower floors
      new THREE.Vector3(5.4, 0.6, 6.6),   // full section
      new THREE.Vector3(6.4, 1.1, 7.8),   // crescendo pull
    ]
    const CAM_TGT = [
      new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, 0),
    ]
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3()
    const lerpKeys = (keys: THREE.Vector3[], t: number, out: THREE.Vector3) => {
      const scaled = Math.min(Math.max(t, 0), 1.15) / 1.15 * (keys.length - 1)
      const i = Math.min(Math.floor(scaled), keys.length - 2)
      out.lerpVectors(keys[i], keys[i + 1], scaled - i)
    }

    // Pointer swirl impulse (fine pointers): world-space target + strength decay.
    const swirl = new THREE.Vector3(); let swirlPow = 0
    const onPointer = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      swirl.set(nx * 2.4, -ny * 2.2, 0.4)
      swirlPow = 1
    }
    if (!coarse) window.addEventListener('pointermove', onPointer)

    let raf = 0
    const clock = new THREE.Clock()
    const v = new THREE.Vector3()
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const p = params.current

      // gentle idle orbit layered on the keyframed camera
      const t = performance.now() * 0.0001
      lerpKeys(CAM_POS, p.cam, camPos)
      lerpKeys(CAM_TGT, p.cam, camTgt)
      camera.position.set(camPos.x * Math.cos(t * 0.6) - camPos.z * Math.sin(t * 0.6) * 0.12, camPos.y, camPos.z)
      camera.lookAt(camTgt)

      // system ignition → line opacity
      ;(structureLines.material as THREE.LineBasicMaterial).opacity = (0.22 + 0.12 * p.glow)
      ;(airLines.material as THREE.LineBasicMaterial).opacity   = 0.05 + 0.75 * p.air * p.glow
      ;(hydroLines.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.7  * p.hydro * p.glow
      ;(elecLines.material as THREE.LineBasicMaterial).opacity  = 0.04 + 0.6  * p.elec * p.glow
      // electrical pulse rides a slow sine so the panels read as alive
      ;(elecLines.material as THREE.LineBasicMaterial).opacity *= 0.75 + 0.25 * Math.sin(performance.now() * 0.003)

      // particles: advect along paths; visible with the air system
      pMat.opacity = 0.85 * p.air * p.glow
      swirlPow = Math.max(0, swirlPow - dt * 1.4)
      for (let i = 0; i < COUNT; i++) {
        pT[i] += dt * pSpeed[i] * p.speed * (0.25 + p.air)
        if (pT[i] > 1) pT[i] -= 1
        const c = cum[pPath[i]]
        sample(c, pT[i], v)
        // swirl: particles near the pointer get a decaying tangential push
        if (swirlPow > 0.01) {
          const dx = v.x - swirl.x, dy = (v.y - ROOF_Y / 2) - swirl.y
          const d2 = dx * dx + dy * dy
          if (d2 < 1.1) {
            const s = swirlPow * 0.22 * (1 - d2 / 1.1)
            pOff[i * 3] += -dy * s; pOff[i * 3 + 1] += dx * s
          }
        }
        pOff[i * 3] *= 0.9; pOff[i * 3 + 1] *= 0.9; pOff[i * 3 + 2] *= 0.9
        pPos[i * 3] = v.x + pOff[i * 3]
        pPos[i * 3 + 1] = v.y + pOff[i * 3 + 1]
        pPos[i * 3 + 2] = v.z + pOff[i * 3 + 2]
      }
      pGeo.attributes.position.needsUpdate = true

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
      scene.traverse(o => {
        if (o instanceof THREE.LineSegments || o instanceof THREE.Points) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [params])

  if (failed) return <>{fallback}</>
  return <div ref={mount} className="fixed inset-0 z-0" aria-hidden="true" />
}
