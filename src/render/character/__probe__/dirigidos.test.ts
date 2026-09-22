import { describe, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'
import { retarget, retargetMapped } from '../animationClips'

globalThis.self = globalThis as never
if (!globalThis.createImageBitmap)
  (globalThis as never as Record<string, unknown>).createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const loader = new GLTFLoader()
const load = (p: string) => {
  const b = readFileSync(p)
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  return new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((ok, e) => loader.parse(ab, '', ok as never, e))
}
const CAST = [
  ['Vermelhao*', 'dead_pool'], ['Kairos   *', 'kratos'],
  ['Douglas   ', 'douxie_tales_of_arcadia'], ['Dartes    ', 'fortnite_darth_vader_advanced_rig'],
  ['Teixeira  ', 'spiderman_brand_new_day_from_fortnite'], ['Lara      ', 'lara_croft_-_shorts_style'],
  ['Bene      ', 'soldier_boy'], ['Goke      ', 'goku'],
] as const

describe('o que e dirigido', () => {
  it('conta faixas por parte do corpo', async () => {
    const g = await load('public/models/animations/guitar-playing.glb')
    const clip = g.animations.find((a) => a.tracks.length > 0)!
    for (const [label, file] of CAST) {
      const gltf = await load(`public/models/characters/${file}.glb`)
      const root = gltf.scene
      root.updateMatrixWorld(true)
      let pele: THREE.SkinnedMesh | null = null
      root.traverse((n) => { if (!pele && (n as THREE.SkinnedMesh).isSkinnedMesh) pele = n as THREE.SkinnedMesh })
      const direto = retarget(clip, root)
      const fitted = direto ?? (pele ? retargetMapped(clip, g.scene, pele) : null)
      if (!fitted) { console.log(`${label} SEM CLIPE`); continue }
      const nomes = fitted.tracks.map((t) => t.name.replace(/\.quaternion$/, ''))
      const conta = (re: RegExp) => nomes.filter((n) => re.test(n)).length
      const perna = conta(/thigh|upleg|calf|shin|_leg_|leg_(hip|knee)|foot|ankle/i)
      const tronco = conta(/spine|neck|head|stomach|chest/i)
      const dedo = conta(/thumb|index|middle|ring|pinky|finger/i)
      const braco = nomes.length - perna - tronco - dedo
      console.log(`${label} via=${direto ? 'direto' : 'mapeado'}  total=${String(nomes.length).padStart(3)}  braco=${braco}  tronco=${tronco}  perna=${perna}  dedo=${dedo}`)
    }
  }, 300000)
})
