/**
 * Direção de câmera do show.
 *
 * O braço da guitarra fica parado na frente da tela; o que se mexe é o
 * fundo. Um diretor escolhe planos do palco e corta entre eles na batida,
 * como numa transmissão de show: plano geral, close no guitarrista, contra-
 * plongée heroico, bateria, plateia vista de trás da banda, travelling
 * lateral.
 *
 * Duas regras que fazem a diferença entre isto e uma câmera passeando:
 *
 * - **o corte cai na batida**, nunca no meio dela. Um corte fora do tempo
 *   lê como falha técnica; no tempo, lê como direção;
 * - **cada plano se move devagar por dentro** — um empurrão, um giro, um
 *   travelling. Plano 3D imóvel parece imagem congelada.
 *
 * As coordenadas são locais ao palco: a câmera é filha do grupo do palco,
 * então mover o palco não exige refazer plano nenhum.
 */

import * as THREE from 'three'

export type ShotMood = 'calm' | 'driving' | 'peak' | 'failing'

export interface ShotContext {
  /** Tempo decorrido dentro do plano, em segundos. */
  elapsed: number
  /** Progresso dentro do plano, de 0 a 1. */
  t: number
  /** Fase da batida atual, de 0 a 1. */
  beatPhase: number
  mood: ShotMood
}

interface Shot {
  id: string
  fov: number
  /** Duração em batidas. */
  beats: number
  /** Momentos em que este plano faz sentido. */
  moods: ShotMood[]
  /** Frequência relativa no sorteio; 1 é o padrão. */
  weight?: number
  place(ctx: ShotContext, position: THREE.Vector3, target: THREE.Vector3): void
}

/** Posições dos integrantes no palco, em coordenadas locais. */
const GUITARIST = new THREE.Vector3(-2.6, 0, -0.6)
const BASSIST = new THREE.Vector3(2.7, 0, -0.9)
const SINGER = new THREE.Vector3(-0.1, 0, 3.4)
const DRUMMER = new THREE.Vector3(0, 0.35, -4.5)

/**
 * O braço da guitarra ocupa o meio e a parte de baixo da tela o tempo todo.
 * Um plano que centraliza o integrante coloca justamente ele atrás da pista.
 * Por isso os planos abaixo miram *ao lado* do sujeito: olhar para a direita
 * dele o joga para a esquerda do quadro, longe das notas.
 */
const FRAME_OFFSET = 1.5

/** Altura do peito de alguém em pé no palco. */
const CHEST = 1.35
const HEAD_HEIGHT = 1.68

const ALL: ShotMood[] = ['calm', 'driving', 'peak', 'failing']

const SHOTS: Shot[] = [
  {
    id: 'wide',
    fov: 48,
    beats: 16,
    moods: ALL,
    weight: 2.5,
    place(ctx, position, target) {
      // Plano geral com um empurrão lento: estabelece o palco inteiro.
      position.set(Math.sin(ctx.elapsed * 0.12) * 1.2, 3.6, 13.5 - ctx.t * 2.2)
      target.set(0, 2.6, -1)
    },
  },
  {
    id: 'guitar-hero',
    fov: 42,
    beats: 8,
    moods: ['driving', 'peak'],
    weight: 3,
    place(ctx, position, target) {
      // Contra-plongée: a câmera olha de baixo para cima, que é o plano que
      // transforma qualquer pessoa com uma guitarra num monumento.
      const swing = Math.sin(ctx.t * Math.PI) * 0.7
      position.set(GUITARIST.x - 2.0 + swing, 0.7, GUITARIST.z + 4.0)
      target.set(GUITARIST.x + FRAME_OFFSET, CHEST + 0.5, GUITARIST.z)
    },
  },
  {
    id: 'guitar-hands',
    fov: 34,
    beats: 8,
    moods: ['driving', 'peak', 'calm'],
    weight: 2,
    place(ctx, position, target) {
      // Close nas mãos, com a câmera derivando junto com o corpo.
      const drift = Math.sin(ctx.elapsed * 0.5) * 0.2
      position.set(GUITARIST.x - 1.6 + drift, CHEST + 0.4, GUITARIST.z + 2.2)
      target.set(GUITARIST.x + FRAME_OFFSET * 0.8, CHEST, GUITARIST.z - 0.1)
    },
  },
  {
    id: 'guitar-orbit',
    fov: 44,
    beats: 16,
    moods: ['peak'],
    place(ctx, position, target) {
      // Órbita fechada: guardada para o star power, quando o plano precisa
      // dizer que algo saiu do normal.
      const angle = -0.9 + ctx.t * 1.6
      position.set(
        GUITARIST.x + Math.sin(angle) * 4.2,
        1.8 + Math.sin(ctx.t * Math.PI) * 0.7,
        GUITARIST.z + Math.cos(angle) * 4.2,
      )
      target.set(GUITARIST.x + FRAME_OFFSET * 0.7, CHEST + 0.2, GUITARIST.z)
    },
  },
  {
    id: 'drummer',
    fov: 46,
    beats: 8,
    moods: ['driving', 'peak'],
    place(ctx, position, target) {
      // O baque da batida sacode um pouco a câmera da bateria.
      const kick = Math.max(0, Math.cos(ctx.beatPhase * Math.PI * 2)) * 0.06
      position.set(3.4 - ctx.t * 1.0, 2.8 + kick, DRUMMER.z + 5.4)
      target.set(DRUMMER.x - FRAME_OFFSET, CHEST + 0.4, DRUMMER.z)
    },
  },
  {
    id: 'bassist',
    fov: 42,
    beats: 8,
    moods: ['calm', 'driving'],
    place(ctx, position, target) {
      position.set(BASSIST.x + 3.2, CHEST + 0.7, BASSIST.z + 3.6 - ctx.t * 0.8)
      target.set(BASSIST.x - FRAME_OFFSET, CHEST + 0.2, BASSIST.z)
    },
  },
  {
    id: 'singer',
    fov: 40,
    beats: 8,
    moods: ['calm', 'driving', 'peak'],
    place(ctx, position, target) {
      position.set(SINGER.x - 2.6 + ctx.t * 0.6, HEAD_HEIGHT + 0.3, SINGER.z + 3.2)
      target.set(SINGER.x + FRAME_OFFSET, HEAD_HEIGHT - 0.1, SINGER.z)
    },
  },
  {
    id: 'crowd',
    fov: 56,
    beats: 8,
    moods: ['driving', 'peak'],
    weight: 0.7,
    place(ctx, position, target) {
      // De trás da banda para a plateia: o plano que mostra para quem se toca.
      position.set(Math.sin(ctx.elapsed * 0.3) * 2, 3.4, -2.5)
      target.set(0, 1.4, 11)
    },
  },
  {
    id: 'truss',
    fov: 52,
    beats: 8,
    moods: ['calm', 'driving'],
    weight: 0.8,
    place(ctx, position, target) {
      // Plongée da treliça, girando devagar.
      const angle = ctx.t * 0.5 - 0.25
      position.set(Math.sin(angle) * 6 - 3, 7.4, Math.cos(angle) * 6 + 2)
      target.set(1.5, 1.6, -1)
    },
  },
  {
    id: 'dolly',
    fov: 46,
    beats: 16,
    moods: ['calm', 'driving', 'peak'],
    place(ctx, position, target) {
      // Travelling lateral atravessando o palco inteiro.
      position.set(-9 + ctx.t * 18, 2.4, 7.0)
      target.set(-3 + ctx.t * 6, 2.0, -1.5)
    },
  },
  {
    id: 'slump',
    fov: 46,
    beats: 8,
    moods: ['failing'],
    place(ctx, position, target) {
      // Quando o medidor está zerando, a câmera recua e sobe: o plano se
      // afasta da banda, como a plateia.
      position.set(-3, 3.2 + ctx.t * 1.5, 10 + ctx.t * 4)
      target.set(GUITARIST.x + FRAME_OFFSET, CHEST, GUITARIST.z)
    },
  },
]

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera

  private shot: Shot = SHOTS[0]
  private shotStart = 0
  private shotEnd = 0
  private recent: string[] = []
  private mood: ShotMood = 'calm'

  private position = new THREE.Vector3()
  private target = new THREE.Vector3()
  private smoothPosition = new THREE.Vector3()
  private smoothTarget = new THREE.Vector3()
  private worldTarget = new THREE.Vector3()
  private initialized = false

  /** Plano travado, para conferência visual: `?shot=guitar-hero` na URL. */
  private forced: Shot | null = null

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 160)

    const requested = new URLSearchParams(location.search).get('shot')
    if (requested) this.forced = SHOTS.find((shot) => shot.id === requested) ?? null
  }

  /** Nomes dos planos, para quem quiser percorrê-los. */
  static shotIds() {
    return SHOTS.map((shot) => shot.id)
  }

  /**
   * Trava um plano, ou solta a direção quando recebe `null`.
   *
   * É o mesmo efeito de `?shot=` na URL, mas em tempo de execução — o painel
   * de encaixes precisa disso, porque não dá para ajustar a posição de um
   * instrumento enquanto a câmera corta sozinha a cada poucos compassos.
   */
  lockShot(id: string | null) {
    this.forced = id ? (SHOTS.find((shot) => shot.id === id) ?? null) : null
    // Força o próximo quadro a reavaliar em vez de terminar o plano atual.
    this.initialized = false
  }

  /** Qual plano está travado agora, se algum. */
  get lockedShot() {
    return this.forced?.id ?? null
  }

  setMood(mood: ShotMood) {
    this.mood = mood
  }

  /**
   * Avança a direção. `beats` são os tempos de batida do chart e `songTime` a
   * posição na música, para que o corte caia na batida.
   */
  update(dt: number, songTime: number, beats: number[], beatPhase: number) {
    if (!this.initialized) {
      this.beginShot(songTime, beats)
      this.initialized = true
    }

    if (songTime >= this.shotEnd) this.beginShot(songTime, beats)

    const elapsed = songTime - this.shotStart
    const span = Math.max(0.001, this.shotEnd - this.shotStart)
    const ctx: ShotContext = {
      elapsed,
      t: Math.min(1, Math.max(0, elapsed / span)),
      beatPhase,
      mood: this.mood,
    }

    this.shot.place(ctx, this.position, this.target)

    // Suavização leve: tira o tranco numérico de dentro do plano sem
    // borrar o corte, que é instantâneo porque acontece no `beginShot`.
    const k = 1 - Math.exp(-dt * 9)
    this.smoothPosition.lerp(this.position, k)
    this.smoothTarget.lerp(this.target, k)

    this.camera.position.copy(this.smoothPosition)
    this.camera.lookAt(this.toWorld(this.smoothTarget))

    if (this.camera.fov !== this.shot.fov) {
      this.camera.fov += (this.shot.fov - this.camera.fov) * k
      this.camera.updateProjectionMatrix()
    }
  }

  /**
   * Converte um alvo de plano para coordenadas de mundo.
   *
   * `Object3D.lookAt` sempre interpreta o alvo em espaço de mundo, mesmo
   * quando o objeto tem pai. Como a câmera é filha do palco e os planos são
   * escritos em coordenadas do palco, entregar o alvo direto faz a câmera
   * olhar para um ponto deslocado pela posição do palco — no caso, para
   * fora dele.
   */
  private toWorld(local: THREE.Vector3) {
    this.worldTarget.copy(local)
    const parent = this.camera.parent
    if (parent) {
      parent.updateWorldMatrix(true, false)
      this.worldTarget.applyMatrix4(parent.matrixWorld)
    }
    return this.worldTarget
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  private beginShot(songTime: number, beats: number[]) {
    if (this.forced) {
      this.shot = this.forced
      this.shotStart = songTime
      this.shotEnd = songTime + 1e9
      this.applyShot()
      return
    }

    const candidates = SHOTS.filter(
      (shot) => shot.moods.includes(this.mood) && !this.recent.includes(shot.id),
    )
    const pool = candidates.length > 0 ? candidates : SHOTS.filter((s) => s.moods.includes(this.mood))

    this.shot = pickWeighted(pool) ?? SHOTS[0]

    // Memória curta de planos recentes: sem ela o sorteio repete o mesmo
    // ângulo duas ou três vezes seguidas, o que parece travamento.
    this.recent.push(this.shot.id)
    if (this.recent.length > 3) this.recent.shift()

    this.shotStart = songTime
    this.shotEnd = this.beatAfter(songTime, beats, this.shot.beats)
    this.applyShot()
  }

  /** Corte seco: o plano novo é assumido de uma vez, sem interpolar. */
  private applyShot() {
    const ctx: ShotContext = { elapsed: 0, t: 0, beatPhase: 0, mood: this.mood }
    this.shot.place(ctx, this.position, this.target)
    this.smoothPosition.copy(this.position)
    this.smoothTarget.copy(this.target)
    this.camera.fov = this.shot.fov
    this.camera.updateProjectionMatrix()
  }

  /** Instante da batida que fica `count` batidas depois de `songTime`. */
  private beatAfter(songTime: number, beats: number[], count: number): number {
    if (beats.length < 2) return songTime + count * 0.5

    let index = 0
    let lo = 0
    let hi = beats.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (beats[mid] <= songTime) {
        index = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const nextIndex = Math.min(beats.length - 1, index + count)
    const next = beats[nextIndex]
    // Perto do fim da grade de batidas, cai no tempo estimado.
    return next > songTime ? next : songTime + count * 0.5
  }
}

/** Sorteio proporcional ao peso de cada plano. */
function pickWeighted(pool: Shot[]): Shot | undefined {
  const total = pool.reduce((sum, shot) => sum + (shot.weight ?? 1), 0)
  let roll = Math.random() * total
  for (const shot of pool) {
    roll -= shot.weight ?? 1
    if (roll <= 0) return shot
  }
  return pool.at(-1)
}
