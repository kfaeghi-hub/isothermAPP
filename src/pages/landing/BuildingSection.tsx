// The 3D centerpiece, V5 — mechanical density + the BAS layer. Still an
// engineering drawing in light: line primitives + additive blending ONLY,
// no faces, no textures, no manufacturer geometry. Guiding rule: richer,
// not busier — the silhouette and the headline must read in the first
// half-second; fog and opacity hierarchy carry the legibility.
//
// V5 additions (docs/LANDING-PAGE-PROPOSAL.md):
//   · penthouse plant: chiller block (tube-bundle marks), boiler cylinder,
//     rooftop cooling tower with a slow-rotating fan ring
//   · per-floor terminal variety: VAVs, fan-coils (fan ring mark), reheat
//     coils (zigzag), one air-handling closet; diffuser fans at outlets,
//     damper ticks at takeoffs, valve bowties on the hydronic rings
//   · shafts: exhaust riser with dim one-way upward flow; stair/elevator
//     core with per-floor diagonals for architectural credibility
//   · THE BAS LAYER — fourth system, its own language: DASHED pale runs
//     from equipment controllers → per-floor DDC panel → penthouse head
//     end; bidirectional signal pulses faster than air on their own
//     rhythm; soft-blinking sensor points. During its beat the web ties
//     the already-lit systems together — the commissioning story.
// Coarse path: trunk-side equipment only, backbone-only web, reduced
// particle/pulse counts — reduce, never drop.
//
// Params contract: cam 0..1.15 · air/hydro/elec/bas 0..1 · glow · speed

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type SystemParams = {
  cam: number
  air: number
  hydro: number
  elec: number
  bas: number
  glow: number
  speed: number
}

export const INITIAL_SYSTEMS: SystemParams = { cam: 0, air: 0.22, hydro: 0, elec: 0, bas: 0, glow: 0.9, speed: 1 }

const VERMILION  = 0xe8432d
const RETURN_AIR = 0x8f2c1d
const LAVENDER   = 0x7f78cb
const STRUCTURE  = 0x5d55af
const PALE       = 0xcfd0e8
const BAS_COL    = 0xb9b6e8

const FLOORS = 6
const FLOOR_H = 0.55
const W = 3.2, D = 2.1
const ROOF_Y = FLOORS * FLOOR_H
const TRUNK_X = 0.35

// ── geometry helpers ─────────────────────────────────────────────────────────
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
/** Ring polygon (octagon) in the XZ plane. */
function ringSegs(r: number, x: number, y: number, z: number, sides = 8): number[] {
  const out: number[] = []
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2
    out.push(x + r * Math.cos(a0), y, z + r * Math.sin(a0), x + r * Math.cos(a1), y, z + r * Math.sin(a1))
  }
  return out
}
/** Valve bowtie in the XY plane (two triangles tip to tip). */
function bowtie(x: number, y: number, z: number, s = 0.05): number[] {
  return [
    x - s, y - s * 0.8, z, x - s, y + s * 0.8, z,
    x - s, y + s * 0.8, z, x + s, y - s * 0.8, z,
    x + s, y - s * 0.8, z, x + s, y + s * 0.8, z,
    x + s, y + s * 0.8, z, x - s, y - s * 0.8, z,
  ]
}
function polySegments(points: THREE.Vector3[]): number[] {
  const out: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    out.push(points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z)
  }
  return out
}
function lineSegs(positions: number[], color: number, opacity: number, dashed = false): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = dashed
    ? new THREE.LineDashedMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
        dashSize: 0.045, gapSize: 0.04,
      })
    : new THREE.LineBasicMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
      })
  const lines = new THREE.LineSegments(geo, mat)
  if (dashed) lines.computeLineDistances()
  return lines
}

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

// Per-floor terminal type: variety so the branches don't repeat identically.
const TERMINAL: Array<'closet' | 'vav' | 'fancoil' | 'vav_reheat'> =
  ['closet', 'vav', 'fancoil', 'vav_reheat', 'fancoil', 'vav_reheat']

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
    scene.fog = new THREE.Fog('#100e26', 6.0, 13.5)   // fog works harder in V5
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60)
    const group = new THREE.Group()
    group.position.y = -ROOF_Y / 2
    scene.add(group)

    // ── Structure + core + ground ────────────────────────────────────────────
    const structural: number[] = []
    for (let f = 0; f <= FLOORS; f++) structural.push(...boxEdges(W, 0.03, D, 0, f * FLOOR_H, 0))
    for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      structural.push(cx, 0, cz, cx, ROOF_Y, cz)
    }
    structural.push(...boxEdges(1.9, 0.75, 1.3, -0.35, ROOF_Y + 0.38, 0))     // penthouse
    // stair/elevator core with a per-floor diagonal
    structural.push(...boxEdges(0.5, ROOF_Y, 0.45, -1.05, ROOF_Y / 2, -0.55))
    for (let f = 0; f < FLOORS; f++) {
      const y = f * FLOOR_H
      structural.push(-1.3, y, -0.325, -0.8, y + FLOOR_H, -0.325)
    }
    const structureLines = lineSegs(structural, STRUCTURE, 0.28)
    group.add(structureLines)

    const grid: number[] = []
    for (let x = -5; x <= 5; x += 1) grid.push(x, 0, -3.5, x, 0, 3.5)
    for (let z = -3.5; z <= 3.5; z += 1) grid.push(-5, 0, z, 5, 0, z)
    group.add(lineSegs(grid, STRUCTURE, 0.07))
    const mirror = lineSegs(structural, STRUCTURE, 0.055)
    mirror.scale.y = -1
    group.add(mirror)

    // ── Air-side fixed plant: AHU + trunk rings + exhaust riser + penthouse ──
    const airFixed: number[] = []
    airFixed.push(...boxEdges(0.62, 0.4, 0.46, TRUNK_X, ROOF_Y + 0.5, 0))
    airFixed.push(TRUNK_X - 0.31, ROOF_Y + 0.3, 0.23, TRUNK_X + 0.31, ROOF_Y + 0.7, 0.23)
    for (let y = 0.3; y < ROOF_Y; y += 0.45) airFixed.push(...boxEdges(0.34, 0.001, 0.34, TRUNK_X, y, 0))
    // exhaust riser: parallel pair + roof cap, dim one-way up-flow
    airFixed.push(-0.4, 0.2, -0.7, -0.4, ROOF_Y + 0.15, -0.7)
    airFixed.push(-0.5, 0.2, -0.7, -0.5, ROOF_Y + 0.15, -0.7)
    airFixed.push(...boxEdges(0.2, 0.08, 0.14, -0.45, ROOF_Y + 0.19, -0.7))
    const airTrunk = lineSegs(airFixed, VERMILION, 0.05)
    group.add(airTrunk)

    // Penthouse plant + rooftop cooling tower (silhouette from a distance).
    const plant: number[] = []
    if (!coarse) {
      plant.push(...boxEdges(0.55, 0.3, 0.4, -0.8, ROOF_Y + 0.22, 0.28))       // chiller
      plant.push(-1.07, ROOF_Y + 0.22, 0.28, -0.53, ROOF_Y + 0.22, 0.28)       // tube bundle
      plant.push(-1.07, ROOF_Y + 0.3, 0.28, -0.53, ROOF_Y + 0.3, 0.28)
      plant.push(...cylEdges(0.13, 0.34, -0.8, ROOF_Y + 0.24, -0.38))          // boiler
    }
    plant.push(...boxEdges(0.5, 0.42, 0.5, 1.15, ROOF_Y + 0.27, -0.55))        // cooling tower body
    const plantLines = lineSegs(plant, LAVENDER, 0.05)
    group.add(plantLines)
    // tower fan ring — rotates slowly
    const fanRing = lineSegs(
      [...ringSegs(0.19, 0, 0, 0), 0, 0, 0, 0.19, 0, 0, 0, 0, 0, -0.1, 0, 0.16, 0, 0, 0, -0.1, 0, -0.16],
      LAVENDER, 0.05)
    fanRing.position.set(1.15, ROOF_Y + 0.52, -0.55)
    group.add(fanRing)

    // ── Per-floor branches, terminals, dampers, diffusers ────────────────────
    const paths: THREE.Vector3[][] = []
    const floorAir: THREE.LineSegments[] = []
    for (let f = 0; f < FLOORS; f++) {
      const p = ductPath(f)
      paths.push(p)
      const segs = polySegments(p.slice(1))
      const end = p[p.length - 1]
      const side = f % 2 === 0 ? 1 : -1
      if (!coarse) {
        // damper tick at the takeoff: a short hinged pair across the duct
        const take = p[2]
        segs.push(take.x, take.y - 0.05, take.z, take.x + 0.07 * side, take.y + 0.05, take.z)
        segs.push(take.x, take.y - 0.05, take.z + 0.05, take.x, take.y + 0.05, take.z + 0.05)
        // terminal by type
        const kind = TERMINAL[f]
        if (kind === 'closet') {
          segs.push(...boxEdges(0.32, 0.42, 0.26, end.x, end.y + 0.1, end.z))
        } else if (kind === 'fancoil') {
          segs.push(...boxEdges(0.26, 0.1, 0.15, end.x, end.y, end.z))
          segs.push(...ringSegs(0.05, end.x, end.y + 0.06, end.z, 6))
        } else {
          segs.push(...boxEdges(0.2, 0.13, 0.15, end.x, end.y, end.z))
          if (kind === 'vav_reheat') {
            // reheat coil: a 3-peak zigzag just upstream of the box
            const zz = end.z - side * 0.18
            segs.push(end.x - 0.1, end.y, zz, end.x - 0.05, end.y + 0.07, zz)
            segs.push(end.x - 0.05, end.y + 0.07, zz, end.x, end.y - 0.07, zz)
            segs.push(end.x, end.y - 0.07, zz, end.x + 0.05, end.y + 0.07, zz)
            segs.push(end.x + 0.05, end.y + 0.07, zz, end.x + 0.1, end.y, zz)
          }
        }
        // diffuser fan: three short lines spreading from the outlet
        for (const a of [-0.5, 0, 0.5]) {
          segs.push(end.x, end.y - 0.07, end.z, end.x + 0.09 * Math.sin(a), end.y - 0.16, end.z + 0.09 * Math.cos(a) * side)
        }
      }
      const lines = lineSegs(segs, VERMILION, 0.05)
      group.add(lines)
      floorAir.push(lines)
    }

    // ── Hydronic: twin risers, rings, valve bowties, pumps + HX ──────────────
    const hySegs: number[] = []
    for (const z of [0.55, -0.55]) {
      hySegs.push(-1.2, 0.12, z, -1.2, ROOF_Y + 0.3, z)
      hySegs.push(-1.26, 0.12, z, -1.26, ROOF_Y + 0.3, z)
      for (let f = 1; f <= FLOORS; f++) {
        hySegs.push(...boxEdges(0.14, 0.001, 0.14, -1.2, f * FLOOR_H, z))
        if (!coarse) hySegs.push(...bowtie(-1.2, f * FLOOR_H + 0.09, z, 0.04))
      }
      if (!coarse) hySegs.push(...cylEdges(0.09, 0.16, -1.2, 0.1, z))
    }
    if (!coarse) hySegs.push(...cylEdges(0.09, 0.8, -1.2, 0.32, 0, true))
    const hydroLines = lineSegs(hySegs, LAVENDER, 0.05)
    group.add(hydroLines)

    // ── Electrical: riser, panels, switchboard ───────────────────────────────
    const elSegs: number[] = []
    elSegs.push(1.35, 0, -0.8, 1.35, ROOF_Y, -0.8)
    for (let f = 0; f < FLOORS; f++) elSegs.push(...boxEdges(0.001, 0.22, 0.16, 1.35, f * FLOOR_H + 0.28, -0.8))
    if (!coarse) elSegs.push(...boxEdges(0.34, 0.4, 0.2, 1.35, 0.2, -0.8))
    const elecLines = lineSegs(elSegs, PALE, 0.04)
    group.add(elecLines)

    // ── THE BAS LAYER — dashed control web + DDC panels + head end ───────────
    const HEAD = new THREE.Vector3(-0.35, ROOF_Y + 0.34, 0.5)
    const ddc = (f: number) => new THREE.Vector3(-0.72, f * FLOOR_H + 0.3, -0.72)
    const basNodes: number[] = []
    basNodes.push(...boxEdges(0.14, 0.14, 0.02, HEAD.x, HEAD.y, HEAD.z))               // head end
    for (let f = 0; f < FLOORS; f++) basNodes.push(...boxEdges(0.1, 0.14, 0.02, ddc(f).x, ddc(f).y, ddc(f).z))
    const basPaths: THREE.Vector3[][] = []
    // backbone: head end → each DDC (single vertical drop with a jog per floor)
    for (let f = FLOORS - 1; f >= 0; f--) {
      basPaths.push([HEAD.clone(), new THREE.Vector3(-0.72, ROOF_Y + 0.34, -0.72), ddc(f).clone()])
    }
    if (!coarse) {
      // device runs: DDC → that floor's terminal; head end → penthouse plant
      for (let f = 0; f < FLOORS; f++) {
        const end = paths[f][paths[f].length - 1]
        basPaths.push([ddc(f).clone(), new THREE.Vector3(end.x, ddc(f).y, -0.72), end.clone()])
      }
      basPaths.push([HEAD.clone(), new THREE.Vector3(TRUNK_X, ROOF_Y + 0.5, 0.23)])     // AHU
      basPaths.push([HEAD.clone(), new THREE.Vector3(-0.8, ROOF_Y + 0.3, 0.28)])        // chiller
      basPaths.push([HEAD.clone(), new THREE.Vector3(1.15, ROOF_Y + 0.42, -0.55)])      // tower
    }
    const basWeb: number[] = []
    for (const p of basPaths) basWeb.push(...polySegments(p))
    const basLines = lineSegs(basWeb, BAS_COL, 0.05, true)   // DASHED — the web's own language
    group.add(basLines)
    const basNodeLines = lineSegs(basNodes, BAS_COL, 0.06)
    group.add(basNodeLines)

    // sensor blink points (two phase groups) at terminals + plant
    const sensorPos: number[][] = [[], []]
    for (let f = 0; f < FLOORS; f++) {
      const end = paths[f][paths[f].length - 1]
      sensorPos[f % 2].push(end.x, end.y + 0.12, end.z)
      sensorPos[(f + 1) % 2].push(-1.2, f * FLOOR_H + 0.35, f % 2 === 0 ? 0.55 : -0.55)
    }
    sensorPos[0].push(TRUNK_X, ROOF_Y + 0.75, 0)
    sensorPos[1].push(1.15, ROOF_Y + 0.55, -0.55)
    const sensors = sensorPos.map(arr => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      const m = new THREE.PointsMaterial({
        color: BAS_COL, size: 0.05, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const pts = new THREE.Points(g, m)
      group.add(pts)
      return { g, m }
    })

    // signal pulses along the web — bidirectional, faster than air
    const basCum = basPaths.map(pts => {
      const lens = [0]
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]))
      return { pts, lens, total: lens[lens.length - 1] }
    })
    const PULSES = coarse ? 40 : 140
    const puPath = new Uint8Array(PULSES), puT = new Float32Array(PULSES)
    const puSp = new Float32Array(PULSES), puDir = new Float32Array(PULSES)
    for (let i = 0; i < PULSES; i++) {
      puPath[i] = i % basCum.length
      puT[i] = Math.random()
      puSp[i] = 0.25 + Math.random() * 0.3
      puDir[i] = i % 2 === 0 ? 1 : -1
    }
    const puGeo = new THREE.BufferGeometry()
    const puPos = new Float32Array(PULSES * 3)
    puGeo.setAttribute('position', new THREE.BufferAttribute(puPos, 3))
    const puMat = new THREE.PointsMaterial({
      color: 0xe4e2f6, size: 0.028, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    group.add(new THREE.Points(puGeo, puMat))

    // ── Air particles: supply, return, exhaust ───────────────────────────────
    const cum = paths.map(pts => {
      const lens = [0]
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]))
      return { pts, lens, total: lens[lens.length - 1], trunkFrac: lens[1] / lens[lens.length - 1] }
    })
    const exhaustPath = [{ pts: [new THREE.Vector3(-0.45, 0.25, -0.7), new THREE.Vector3(-0.45, ROOF_Y + 0.12, -0.7)],
      lens: [0, ROOF_Y - 0.13], total: ROOF_Y - 0.13, trunkFrac: 1 }]
    const mkFlow = (count: number, color: number, over: typeof cum, reverse: boolean, size: number) => {
      const path = new Uint8Array(count), t = new Float32Array(count), sp = new Float32Array(count)
      const off = new Float32Array(count * 3), pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        path[i] = i % over.length
        t[i] = Math.random()
        sp[i] = 0.05 + Math.random() * 0.07
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({
        color, size, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      })
      group.add(new THREE.Points(geo, mat))
      return { path, t, sp, off, pos, geo, mat, reverse, over, zShift: reverse ? 0.06 : 0 }
    }
    const supply  = mkFlow(coarse ? 220 : 520, VERMILION, cum, false, 0.035)
    const ret     = mkFlow(coarse ? 110 : 300, RETURN_AIR, cum, true, 0.028)
    const exhaust = mkFlow(coarse ? 30 : 70, RETURN_AIR, exhaustPath as typeof cum, false, 0.025)
    const flows = [supply, ret, exhaust]
    const v = new THREE.Vector3()
    const sample = (c: typeof cum[0], t: number, out: THREE.Vector3) => {
      const target = t * c.total
      let i = 1
      while (i < c.lens.length - 1 && c.lens[i] < target) i++
      out.lerpVectors(c.pts[i - 1], c.pts[i], (target - c.lens[i - 1]) / (c.lens[i] - c.lens[i - 1] || 1))
    }

    // ── Camera keyframes (5 beats: BAS beat gets the full-web view) ──────────
    const CAM_POS = [
      new THREE.Vector3(5.0, 2.4, 6.2),
      new THREE.Vector3(4.0, 1.6, 4.9),
      new THREE.Vector3(3.7, 0.4, 4.4),
      new THREE.Vector3(3.9, -0.7, 4.6),
      new THREE.Vector3(5.6, 0.8, 6.8),
      new THREE.Vector3(6.6, 1.2, 8.0),
    ]
    const CAM_TGT = [
      new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, 0.15, 0),
    ]
    const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3()
    const lerpKeys = (keys: THREE.Vector3[], t: number, out: THREE.Vector3) => {
      const scaled = Math.min(Math.max(t, 0), 1.15) / 1.15 * (keys.length - 1)
      const i = Math.min(Math.floor(scaled), keys.length - 2)
      out.lerpVectors(keys[i], keys[i + 1], scaled - i)
    }

    // ── Pointer: eddy + floor hover ──────────────────────────────────────────
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

      lerpKeys(CAM_POS, p.cam, camPos)
      lerpKeys(CAM_TGT, p.cam, camTgt)
      const ang = Math.sin(t * 0.13) * 0.07
      camera.position.set(
        camPos.x * Math.cos(ang) - camPos.z * Math.sin(ang),
        camPos.y + Math.sin(t * 0.09) * 0.08,
        camPos.x * Math.sin(ang) + camPos.z * Math.cos(ang),
      )
      camera.lookAt(camTgt)

      fanRing.rotation.y += dt * (0.6 + p.hydro * 1.2)   // tower fan: slow idle, alive when hydronic runs

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

      ;(structureLines.material as THREE.LineBasicMaterial).opacity = 0.22 + 0.12 * p.glow
      ;(airTrunk.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.7 * p.air * p.glow
      for (let f = 0; f < FLOORS; f++) {
        ;(floorAir[f].material as THREE.LineBasicMaterial).opacity =
          (0.05 + 0.65 * p.air * p.glow) * (1 + hov[f] * 0.9)
      }
      ;(plantLines.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.8 * p.hydro * p.glow
      ;(fanRing.material as THREE.LineBasicMaterial).opacity = 0.06 + 0.8 * p.hydro * p.glow
      ;(hydroLines.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.95 * p.hydro * p.glow
      ;(elecLines.material as THREE.LineBasicMaterial).opacity =
        (0.04 + 0.6 * p.elec * p.glow) * (0.75 + 0.25 * Math.sin(performance.now() * 0.003))

      // BAS web: subordinate until its beat — brightness hierarchy by param
      ;(basLines.material as THREE.LineDashedMaterial).opacity = 0.04 + 0.75 * p.bas * p.glow
      ;(basNodeLines.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.85 * p.bas * p.glow
      puMat.opacity = (0.1 + 0.9 * p.bas) * p.glow * 0.9
      sensors[0].m.opacity = (0.05 + 0.6 * p.bas) * (0.55 + 0.45 * Math.sin(t * 2.1)) * p.glow
      sensors[1].m.opacity = (0.05 + 0.6 * p.bas) * (0.55 + 0.45 * Math.sin(t * 2.1 + Math.PI)) * p.glow

      // signal pulses: bidirectional, faster than air, accelerate on the BAS beat
      const puRate = 1 + p.bas * 1.6
      for (let i = 0; i < PULSES; i++) {
        puT[i] += dt * puSp[i] * puRate * puDir[i]
        if (puT[i] > 1) puT[i] -= 1
        if (puT[i] < 0) puT[i] += 1
        sample(basCum[puPath[i]] as typeof cum[0], puT[i], v)
        puPos[i * 3] = v.x; puPos[i * 3 + 1] = v.y; puPos[i * 3 + 2] = v.z
      }
      puGeo.attributes.position.needsUpdate = true

      const speedGlow = 0.7 + 0.3 * Math.min(p.speed / 2.2, 1)
      supply.mat.opacity  = 0.85 * p.air * p.glow * speedGlow
      ret.mat.opacity     = 0.38 * p.air * p.glow * speedGlow
      exhaust.mat.opacity = 0.3 * p.air * p.glow
      swirlPow = Math.max(0, swirlPow - dt * 0.7)
      for (const fl of flows) {
        for (let i = 0; i < fl.path.length; i++) {
          const c = fl.over[fl.path[i]]
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
