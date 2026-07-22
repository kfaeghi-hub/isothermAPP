// The 3D centerpiece, V4 — richer, not busier. An abstracted cutaway building
// with living mechanical systems, still an engineering drawing in light:
// line primitives + additive blending ONLY, no faces, no textures, no
// realistic equipment geometry. V4 enrichments (docs/LANDING-PAGE-PROPOSAL.md):
//   · terminal equipment — AHU block at the trunk origin, VAV outlines at
//     branch ends, pumps + heat exchanger at the hydronic base, switchboard
//     at the electrical riser: the systems land somewhere
//   · two-way physical airflow — supply out, dimmer return back, faster in
//     the trunk than the branches; intensity tracks speed
//   · depth atmosphere — scene fog, faint ground grid + mirrored structural
//     reflection, slow idle camera drift so the scene breathes pre-scroll
//   · cumulative ignition — lit systems dim to a memory-glow while the next
//     verifies; the final beat resolves the whole building alive at once
//     (the commissioning story)
//   · interaction — floor-hover brightens that floor's branch run (fine
//     pointers); the cursor eddy lingers
// Coarse/low-power path: fewer particles, no hover, equipment reduced to the
// trunk-side AHU — reduce, never drop.
//
// Choreography contract (unchanged): the shared `params` ref.
//   cam 0..1.15 · air/hydro/elec 0..1 · glow · speed

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

// A faint idle airflow at load so the hero reads as a living instrument.
export const INITIAL_SYSTEMS: SystemParams = { cam: 0, air: 0.22, hydro: 0, elec: 0, glow: 0.9, speed: 1 }

const VERMILION   = 0xe8432d
const RETURN_AIR  = 0x8f2c1d   // dimmer vermilion — the return path
const LAVENDER    = 0x7f78cb
const STRUCTURE   = 0x5d55af
const PALE        = 0xcfd0e8

const FLOORS = 6
const FLOOR_H = 0.55
const W = 3.2, D = 2.1
const ROOF_Y = FLOORS * FLOOR_H

function boxEdges(w: number, h: number, d: number, x: number, y: number, z: number): number[] {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  const arr = Array.from(g.attributes.position.array as Float32Array)
  g.dispose()
  const out: number[] = []
  for (let i = 0; i < arr.length; i += 3) out.push(arr[i] + x, arr[i + 1] + y, arr[i + 2] + z)
  return out
}

function cylEdges(r: number, h: number, x: number, y: number, z: number, horizontal = false): number[] {
  const g = new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, h, 8), 20)
  if (horizontal) g.rotateZ(Math.PI / 2)
  const arr = Array.from(g.attributes.position.array as Float32Array)
  g.dispose()
  const out: number[] = []
  for (let i = 0; i < arr.length; i += 3) out.push(arr[i] + x, arr[i + 1] + y, arr[i + 2] + z)
  return out
}

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

const TRUNK_X = 0.35

/** One duct path per floor: penthouse plenum → trunk → out → across → perimeter. */
function ductPath(f: number): THREE.Vector3[] {
  const y = f * FLOOR_H + 0.28
  const side = f % 2 === 0 ? 1 : -1
  return [
    new THREE.Vector3(TRUNK_X, ROOF_Y + 0.45, 0),
    new THREE.Vector3(TRUNK_X, y, 0),
    new THREE.Vector3(TRUNK_X + side * 0.55, y, 0),
    new THREE.Vector3(TRUNK_X + side * 0.55, y, side * (D / 2 - 0.15)),
    new THREE.Vector3(side * (W / 2 - 0.2), y, side * (D / 2 - 0.15)),
  ]
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
    scene.fog = new THREE.Fog('#100e26', 6.5, 14.5)   // depth atmosphere: far floors recede
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60)
    const group = new THREE.Group()
    group.position.y = -ROOF_Y / 2
    scene.add(group)

    // ── Structure ─────────────────────────────────────────────────────────────
    const structural: number[] = []
    for (let f = 0; f <= FLOORS; f++) structural.push(...boxEdges(W, 0.03, D, 0, f * FLOOR_H, 0))
    for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      structural.push(cx, 0, cz, cx, ROOF_Y, cz)
    }
    structural.push(...boxEdges(1.9, 0.75, 1.3, -0.35, ROOF_Y + 0.38, 0))
    const structureLines = lineSegs(structural, STRUCTURE, 0.28)
    group.add(structureLines)

    // Ground grid + mirrored structural reflection (depth atmosphere)
    const grid: number[] = []
    for (let x = -5; x <= 5; x += 1) grid.push(x, 0, -3.5, x, 0, 3.5)
    for (let z = -3.5; z <= 3.5; z += 1) grid.push(-5, 0, z, 5, 0, z)
    const gridLines = lineSegs(grid, STRUCTURE, 0.07)
    group.add(gridLines)
    const mirror = lineSegs(structural, STRUCTURE, 0.055)
    mirror.scale.y = -1
    group.add(mirror)

    // ── Terminal equipment + systems ──────────────────────────────────────────
    // Air: AHU block (with a diagonal-cross coil mark) feeding the trunk.
    const airFixed: number[] = []
    airFixed.push(...boxEdges(0.62, 0.4, 0.46, TRUNK_X, ROOF_Y + 0.5, 0))
    airFixed.push(TRUNK_X - 0.31, ROOF_Y + 0.3, 0.23, TRUNK_X + 0.31, ROOF_Y + 0.7, 0.23) // coil mark
    for (let y = 0.3; y < ROOF_Y; y += 0.45) airFixed.push(...boxEdges(0.34, 0.001, 0.34, TRUNK_X, y, 0))
    const airTrunk = lineSegs(airFixed, VERMILION, 0.05)
    group.add(airTrunk)

    // Per-floor branch runs + VAV outline at the branch end (hover targets).
    const paths: THREE.Vector3[][] = []
    const floorAir: THREE.LineSegments[] = []
    for (let f = 0; f < FLOORS; f++) {
      const p = ductPath(f)
      paths.push(p)
      const segs = polySegments(p.slice(1)) // branch only — trunk drawn once above
      if (!coarse) {
        const end = p[p.length - 1]
        segs.push(...boxEdges(0.2, 0.13, 0.15, end.x, end.y, end.z))  // VAV box
      }
      const lines = lineSegs(segs, VERMILION, 0.05)
      group.add(lines)
      floorAir.push(lines)
    }

    // Hydronic: twin risers, floor rings, base pumps + a horizontal heat exchanger.
    const hySegs: number[] = []
    for (const z of [0.55, -0.55]) {
      // supply/return pair — the twin verticals give the system real presence
      hySegs.push(-1.2, 0.12, z, -1.2, ROOF_Y + 0.3, z)
      hySegs.push(-1.26, 0.12, z, -1.26, ROOF_Y + 0.3, z)
      for (let f = 1; f <= FLOORS; f++) hySegs.push(...boxEdges(0.14, 0.001, 0.14, -1.2, f * FLOOR_H, z))
      if (!coarse) hySegs.push(...cylEdges(0.09, 0.16, -1.2, 0.1, z))          // pump
    }
    if (!coarse) hySegs.push(...cylEdges(0.09, 0.8, -1.2, 0.32, 0, true))      // heat exchanger between risers
    const hydroLines = lineSegs(hySegs, LAVENDER, 0.05)
    group.add(hydroLines)

    // Electrical: riser, per-floor panels, switchboard at the base.
    const elSegs: number[] = []
    elSegs.push(1.35, 0, -0.8, 1.35, ROOF_Y, -0.8)
    for (let f = 0; f < FLOORS; f++) elSegs.push(...boxEdges(0.001, 0.22, 0.16, 1.35, f * FLOOR_H + 0.28, -0.8))
    if (!coarse) elSegs.push(...boxEdges(0.34, 0.4, 0.2, 1.35, 0.2, -0.8))     // main switchboard
    const elecLines = lineSegs(elSegs, PALE, 0.04)
    group.add(elecLines)

    // ── Two-way airflow particles ─────────────────────────────────────────────
    const cum = paths.map(pts => {
      const lens = [0]
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]))
      return { pts, lens, total: lens[lens.length - 1], trunkFrac: lens[1] / lens[lens.length - 1] }
    })
    const mkFlow = (count: number, color: number, reverse: boolean) => {
      const path = new Uint8Array(count), t = new Float32Array(count), sp = new Float32Array(count)
      const off = new Float32Array(count * 3), pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        path[i] = i % cum.length
        t[i] = Math.random()
        sp[i] = 0.05 + Math.random() * 0.07
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({
        color, size: reverse ? 0.028 : 0.035, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      })
      const points = new THREE.Points(geo, mat)
      group.add(points)
      return { path, t, sp, off, pos, geo, mat, reverse, zShift: reverse ? 0.06 : 0 }
    }
    const supply = mkFlow(coarse ? 220 : 520, VERMILION, false)
    const ret    = mkFlow(coarse ? 110 : 300, RETURN_AIR, true)
    const flows = [supply, ret]
    const v = new THREE.Vector3()
    const sample = (c: typeof cum[0], t: number, out: THREE.Vector3) => {
      const target = t * c.total
      let i = 1
      while (i < c.lens.length - 1 && c.lens[i] < target) i++
      out.lerpVectors(c.pts[i - 1], c.pts[i], (target - c.lens[i - 1]) / (c.lens[i] - c.lens[i - 1] || 1))
    }

    // ── Camera keyframes + idle drift ─────────────────────────────────────────
    const CAM_POS = [
      new THREE.Vector3(5.0, 2.4, 6.2),
      new THREE.Vector3(4.0, 1.6, 4.9),
      new THREE.Vector3(3.7, 0.4, 4.4),
      new THREE.Vector3(3.9, -0.7, 4.6),
      new THREE.Vector3(5.4, 0.6, 6.6),
      new THREE.Vector3(6.4, 1.1, 7.8),
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

    // ── Pointer: eddy + floor hover (fine pointers) ───────────────────────────
    const swirl = new THREE.Vector3(); let swirlPow = 0
    let ptrNX = 0, ptrNY = 0, havePtr = false
    const onPointer = (e: PointerEvent) => {
      ptrNX = (e.clientX / window.innerWidth) * 2 - 1
      ptrNY = -((e.clientY / window.innerHeight) * 2 - 1)
      havePtr = true
      swirl.set(ptrNX * 2.4, ptrNY * 2.2, 0.4)
      swirlPow = 1
    }
    if (!coarse) window.addEventListener('pointermove', onPointer)
    const hov = new Float32Array(FLOORS)
    const proj = new THREE.Vector3()

    let raf = 0
    const clock = new THREE.Clock()
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const p = params.current
      const t = performance.now() * 0.001

      // idle drift: slow orbit + gentle bob — the scene breathes before scroll
      lerpKeys(CAM_POS, p.cam, camPos)
      lerpKeys(CAM_TGT, p.cam, camTgt)
      const ang = Math.sin(t * 0.13) * 0.07
      camera.position.set(
        camPos.x * Math.cos(ang) - camPos.z * Math.sin(ang),
        camPos.y + Math.sin(t * 0.09) * 0.08,
        camPos.x * Math.sin(ang) + camPos.z * Math.cos(ang),
      )
      camera.lookAt(camTgt)

      // floor hover: project each floor's branch level; nearest to pointer brightens
      let hovFloor = -1
      if (!coarse && havePtr) {
        let best = 0.09
        for (let f = 0; f < FLOORS; f++) {
          proj.set(0, f * FLOOR_H + 0.28 - ROOF_Y / 2, 0).project(camera)
          const dy = Math.abs(proj.y - ptrNY)
          if (dy < best && Math.abs(ptrNX) < 0.75) { best = dy; hovFloor = f }
        }
      }
      for (let f = 0; f < FLOORS; f++) hov[f] += ((f === hovFloor ? 1 : 0) - hov[f]) * 0.12

      // opacities: cumulative ignition arrives via the choreography's params
      ;(structureLines.material as THREE.LineBasicMaterial).opacity = 0.22 + 0.12 * p.glow
      ;(airTrunk.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.7 * p.air * p.glow
      for (let f = 0; f < FLOORS; f++) {
        ;(floorAir[f].material as THREE.LineBasicMaterial).opacity =
          (0.05 + 0.65 * p.air * p.glow) * (1 + hov[f] * 0.9)
      }
      ;(hydroLines.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.95 * p.hydro * p.glow
      ;(elecLines.material as THREE.LineBasicMaterial).opacity =
        (0.04 + 0.6 * p.elec * p.glow) * (0.75 + 0.25 * Math.sin(performance.now() * 0.003))

      // two-way flow: supply out, return back; trunk fast, branches slow;
      // intensity tracks speed
      const speedGlow = 0.7 + 0.3 * Math.min(p.speed / 2.2, 1)
      supply.mat.opacity = 0.85 * p.air * p.glow * speedGlow
      ret.mat.opacity    = 0.38 * p.air * p.glow * speedGlow
      swirlPow = Math.max(0, swirlPow - dt * 0.7)   // the eddy lingers
      for (const fl of flows) {
        for (let i = 0; i < fl.path.length; i++) {
          const c = cum[fl.path[i]]
          const inTrunk = fl.t[i] < c.trunkFrac
          const rate = fl.sp[i] * p.speed * (0.25 + p.air) * (inTrunk ? 1.7 : 0.75)
          fl.t[i] += dt * rate * (fl.reverse ? 0.85 : 1)
          if (fl.t[i] > 1) fl.t[i] -= 1
          sample(c, fl.reverse ? 1 - fl.t[i] : fl.t[i], v)
          if (swirlPow > 0.01) {
            const dx = v.x - swirl.x, dy = (v.y - ROOF_Y / 2) - swirl.y
            const d2 = dx * dx + dy * dy
            if (d2 < 1.1) {
              const s = swirlPow * 0.22 * (1 - d2 / 1.1)
              fl.off[i * 3] += -dy * s; fl.off[i * 3 + 1] += dx * s
            }
          }
          fl.off[i * 3] *= 0.9; fl.off[i * 3 + 1] *= 0.9; fl.off[i * 3 + 2] *= 0.9
          fl.pos[i * 3] = v.x + fl.off[i * 3]
          fl.pos[i * 3 + 1] = v.y + fl.off[i * 3 + 1]
          fl.pos[i * 3 + 2] = v.z + fl.zShift + fl.off[i * 3 + 2]
        }
        fl.geo.attributes.position.needsUpdate = true
      }

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
