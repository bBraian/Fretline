/**
 * Animações prontas do Mixamo, aplicadas aos integrantes importados.
 *
 * Substituem a cinemática inversa nos modelos em que dá para usá-las, e o
 * motivo é honesto: a IK calcula onde a mão deveria estar e resolve um
 * triângulo; o que ela não tem é tudo que um animador põe — rotação de
 * pulso, ombro acompanhando, peso do corpo, respiração. Um clipe feito por
 * alguém traz isso pronto.
 *
 * ## Duas coisas que precisam de tradução
 *
 * **Os nomes das faixas.** Um clipe do Mixamo endereça `mixamorig:Hips`,
 * mas o GLTFLoader sanitiza nomes, e cada exportador acrescenta sufixos —
 * no modelo o mesmo osso é `mixamorigHips_01`. O casamento é feito pelo
 * nome reduzido a letras, o mesmo critério que acha os ossos do rig.
 *
 * **As faixas de posição são descartadas.** Elas vêm na escala em que o
 * clipe foi exportado, e o modelo foi reescalado para caber no palco:
 * aplicá-las esticaria o esqueleto ou faria o integrante sair andando para
 * fora do palco. Rotação não tem esse problema — é independente de escala, e
 * é o que carrega a pose.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

/** Um clipe por papel no palco. */
export const CLIPS = {
  guitar: '/models/animations/guitar-playing.glb',
  bass: '/models/animations/bass-playing.glb',
  drums: '/models/animations/playing-drums.glb',
  vocals: '/models/animations/singing.glb',
} as const

export type ClipRole = keyof typeof CLIPS

const cache = new Map<string, Promise<THREE.AnimationClip | null>>()

/**
 * Carrega o clipe de um papel, uma vez só.
 *
 * O palco tem quatro integrantes e pode trocar de personagem no meio da
 * música; recarregar o mesmo arquivo a cada troca seria desperdício.
 */
export function loadClip(role: ClipRole): Promise<THREE.AnimationClip | null> {
  const url = CLIPS[role]
  let pending = cache.get(url)
  if (!pending) {
    pending = loader
      .loadAsync(url)
      .then((gltf) => gltf.animations.find((a) => a.tracks.length > 0) ?? null)
      .catch((erro) => {
        console.error(`não deu para carregar ${url}`, erro)
        return null
      })
    cache.set(url, pending)
  }
  return pending
}

/** Só as letras: o mesmo critério usado para achar ossos no rig. */
function key(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Reescreve um clipe para os ossos de um modelo.
 *
 * Devolve `null` quando quase nada casa — um esqueleto de outra convenção
 * receberia meia dúzia de faixas e ficaria pior do que sem animação
 * nenhuma.
 */
export function retarget(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip | null {
  const byKey = new Map<string, string>()
  root.traverse((node) => {
    if (node.name) byKey.set(key(node.name), node.name)
  })

  const tracks: THREE.KeyframeTrack[] = []
  let wanted = 0

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.')
    if (dot < 0) continue
    const property = track.name.slice(dot + 1)
    // Ver o comentário do topo: posição vem na escala do clipe.
    if (property !== 'quaternion') continue
    wanted++

    const target = byKey.get(key(track.name.slice(0, dot)))
    if (!target) continue

    const copy = track.clone()
    copy.name = `${target}.${property}`
    tracks.push(copy)
  }

  // Metade das faixas é o piso: abaixo disso o esqueleto é de outra
  // família, e aplicar o pouco que casou produz um boneco torto.
  if (!wanted || tracks.length < wanted * 0.5) return null

  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}
