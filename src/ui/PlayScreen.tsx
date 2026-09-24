/**
 * A tela de jogo: onde as três camadas se encontram.
 *
 * A montagem é assíncrona — decodificar ou sintetizar o áudio leva tempo — e
 * pode ser cancelada no meio, porque o React em modo estrito monta e
 * desmonta cada efeito uma vez antes de valer. Por isso tudo o que é criado
 * aqui passa por uma verificação de cancelamento antes de ser guardado, e a
 * limpeza derruba contexto de áudio, renderizador e ouvintes de teclado.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Session, type SessionEvent } from '../engine/gameplay/session'
import type { SessionState } from '../engine/gameplay/session'
import type { Verdict } from '../engine/types'
import { SongPlayer } from '../audio/songPlayer'
import { renderDemoTrack } from '../audio/demoTrack'
import { InputManager } from '../input/inputManager'
import { GameScene } from '../render/gameScene'
import { evaluate } from '../content/progression'
import { useGame } from './store'
import { Hud } from './hud/Hud'
import { YouRock } from './hud/YouRock'
import { mixer } from '../audio/mixer'

const LEAD_IN = 3

type Phase = 'loading' | 'countdown' | 'playing' | 'outro' | 'paused' | 'failed' | 'error'

/** Quanto dura o encerramento, do fim da música até os resultados. */
const OUTRO_SECONDS = 3.2

export function PlayScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<GameScene | null>(null)
  const playerRef = useRef<SongPlayer | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const inputRef = useRef<InputManager | null>(null)
  const finishedRef = useRef(false)

  const settings = useGame((s) => s.settings)
  const profile = useGame((s) => s.profile)
  const library = useGame((s) => s.library)
  const selectedSongId = useGame((s) => s.selectedSongId)
  const setScreen = useGame((s) => s.setScreen)
  const playedFrom = useGame((s) => s.playedFrom)
  const finishSong = useGame((s) => s.finishSong)

  const [phase, setPhase] = useState<Phase>('loading')
  const [assets, setAssets] = useState<{
    itens: Array<{ label: string; done: boolean }>
    done: number
    total: number
  }>({ itens: [], done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(LEAD_IN)
  const [hudState, setHudState] = useState<SessionState | null>(null)
  const [verdict, setVerdict] = useState<{ verdict: Verdict; delta: number } | null>(null)
  /** Terminou a música — e não só chegou ao encerramento, que quem falhou também alcança. */
  const [won, setWon] = useState(false)

  const entry = library.find((e) => e.song.meta.id === selectedSongId)
  const chart = entry?.song.charts[settings.difficulty]

  /**
   * Encerramento da apresentação.
   *
   * Antes a última nota e a tela de resultados aconteciam no mesmo quadro, o
   * que lia como travamento. Agora a banda fica no palco tocando o fim, a
   * câmera abre, o som desce e só então os resultados entram — e o som não é
   * cortado, é baixado.
   */
  const finish = useCallback(() => {
    const session = sessionRef.current
    if (!session || finishedRef.current) return
    finishedRef.current = true

    setPhase('outro')
    sceneRef.current?.beginOutro()
    playerRef.current?.fadeOut(OUTRO_SECONDS * 0.8)

    const resultado = evaluate(session.getState(), settings.difficulty)
    window.setTimeout(() => {
      playerRef.current?.pause()
      sceneRef.current?.stop()
      finishSong(resultado)
    }, OUTRO_SECONDS * 1000)
  }, [finishSong, settings.difficulty])

  // Montagem: áudio, sessão, input e cena. Roda uma vez por entrada na tela.
  useEffect(() => {
    if (!entry || !chart || !canvasRef.current) {
      setError('Essa música não tem chart para a dificuldade escolhida.')
      setPhase('error')
      return
    }

    let cancelled = false
    let unsubscribeVolume: (() => void) | undefined
    const canvas = canvasRef.current
    finishedRef.current = false

    // Nada de menu nem de preview sobre a partida. O roteador já manda
    // parar ao trocar de tela; isto é a garantia de quem vai tocar, e não
    // depende de a ordem das montagens sair certa.
    mixer.silenceMenu()

    const onEvent = (event: SessionEvent) => {
      if (event.kind === 'hit') {
        setVerdict({ verdict: event.verdict, delta: event.delta })
        playerRef.current?.setMissedFeedback(false)
      }
      if (event.kind === 'miss' || event.kind === 'ghostTap') {
        setVerdict(null)
        // Corta a faixa da guitarra: o buraco na música é o retorno mais
        // direto que existe sobre um erro, e não precisa de texto na tela.
        playerRef.current?.setMissedFeedback(true)
        // E toca o ruído de corda abafada por cima. Só o corte não basta:
        // num trecho em que a guitarra já estava calada, o erro não produz
        // diferença nenhuma e passa despercebido.
        playerRef.current?.playMissNoise()
      }
      if (event.kind === 'starPowerStart') {
        // O boost é o único gesto do jogo que não resolve uma nota, e sem
        // som ele passava só como mudança de cor na pista.
        mixer.playCue('boost')
      }
      if (event.kind === 'failed') {
        playerRef.current?.pause()
        mixer.playCue('fail')
        setPhase('failed')
      }
      if (event.kind === 'finished') {
        // A vitória é anunciada aqui, e não no `finish`, porque `finish`
        // também é o caminho do botão "ver o resultado" de quem falhou — e
        // quem falhou não venceu.
        mixer.playCue('win')
        setWon(true)
        finish()
      }
    }

    const boot = async () => {
      const player = new SongPlayer({
        leadIn: LEAD_IN,
        chartOffset: entry.song.meta.offset,
      })

      try {
        if (entry.synthesized) {
          player.useBuffers([await renderDemoTrack(player.context.sampleRate)])
        } else if (entry.tracks.length > 0) {
          await player.load(entry.tracks)
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error(loadError)
          setError('Não consegui decodificar o áudio dessa música.')
          setPhase('error')
        }
        await player.dispose()
        return
      }

      if (cancelled) {
        await player.dispose()
        return
      }

      player.setVolume(mixer.getVolume())
      // O controle da tela de ajustes vale durante a partida, não só no
      // início dela: a mesa avisa e o tocador acompanha.
      unsubscribeVolume = mixer.onVolumeChange((v) => player.setVolume(v))

      const session = new Session(chart, settings.difficulty, {
        inputOffset: settings.audioOffset,
        noFail: settings.noFail,
      })

      const input = new InputManager(player, (event) => session.handleInput(event))
      input.setBindings(settings.keyboard, settings.gamepad)
      input.attach()

      const scene = new GameScene({
        canvas,
        session,
        clock: player,
        characterId: profile.characterId,
        guitarId: profile.guitarId,
        noteSpeed: settings.noteSpeed,
        videoOffset: settings.videoOffset,
        // `?lowfx` força a qualidade baixa, para conferência e para os testes.
        quality: new URLSearchParams(location.search).has('lowfx') ? 'baixa' : settings.quality,
        onEvent,
      })

      playerRef.current = player
      sessionRef.current = session
      inputRef.current = input
      sceneRef.current = scene

      // Gancho de depuração: com `?debug` na URL, a sessão e o relógio ficam
      // acessíveis do console e do teste de fumaça, que precisa tocar a
      // música corretamente para provar que a corrente inteira funciona.
      if (new URLSearchParams(location.search).has('debug')) {
        ;(window as unknown as { __fretline?: unknown }).__fretline = {
          session,
          player,
          chart,
          scene,
        }
      }

      // O palco só entra em cena depois de o que se vê estar carregado.
      // Antes o jogo começava e os personagens apareciam sem textura,
      // trocando de modelo no meio da primeira frase da música.
      setAssets(scene.loadingProgress)
      const relatorio = window.setInterval(() => setAssets(scene.loadingProgress), 120)
      await scene.ready()
      window.clearInterval(relatorio)
      setAssets(scene.loadingProgress)
      if (cancelled) return

      // A abertura: a pista sobe, o arpejo das notas sobe atrás, a plateia
      // grita — e a música entra por cima do fim do grito. Cabe na
      // aproximação de três segundos, e toca no contexto da mesa, que
      // sobrevive à montagem e ao descarte desta tela.
      mixer.playSongIntro(LEAD_IN)

      scene.start()
      await player.start()
      if (!cancelled) setPhase('countdown')
    }

    void boot()

    return () => {
      cancelled = true
      unsubscribeVolume?.()
      inputRef.current?.detach()
      sceneRef.current?.dispose()
      void playerRef.current?.dispose()
      inputRef.current = null
      sceneRef.current = null
      playerRef.current = null
      sessionRef.current = null
    }
    // A cena é montada uma vez por entrada na tela; mudar um ajuste no meio
    // da música exigiria reiniciar, então as dependências ficam de fora de
    // propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Laço leve fora do render do Three: lê o controle e espelha os trastes.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const input = inputRef.current
      const scene = sceneRef.current
      if (input && scene) {
        input.pollGamepad()
        scene.setPressed(input.fretMask)
        scene.setWhammy(input.whammyValue)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  /**
   * O painel.
   *
   * O que muda de forma contínua — pontuação, medidor, star power — não é
   * legível acima de uns dez quadros por segundo, e reconciliar o React a
   * sessenta em troca disso rouba tempo do laço que importa. Mas o
   * multiplicador e a corrente não são contínuos: eles *saltam*, e o salto é
   * a recompensa. Chegar até 66ms depois do acerto que o causou desliga o
   * salto do gesto que o produziu.
   *
   * Então são duas cadências na mesma leitura: o que salta atualiza no
   * quadro em que saltou, o resto espera a vez.
   */
  useEffect(() => {
    let frame = 0
    let lastPush = 0
    // O que, ao mudar, merece um quadro só para si.
    let previous = ''

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const session = sessionRef.current
      const player = playerRef.current
      if (!session || !player) return

      const state = session.getState()
      const now = performance.now()
      const marcos = `${state.multiplier}:${state.streak}:${state.starPowerActive}:${state.failed}`

      if (marcos !== previous || now - lastPush >= 1000 / 12) {
        previous = marcos
        lastPush = now
        setHudState({ ...state })
      }

      const songTime = player.now()
      if (songTime < 0) setCountdown(Math.max(1, Math.ceil(-songTime)))
      else if (phase === 'countdown') setPhase('playing')
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  // O veredito some sozinho, senão a última palavra fica parada na tela.
  useEffect(() => {
    if (!verdict) return
    const id = window.setTimeout(() => setVerdict(null), 420)
    return () => window.clearTimeout(id)
  }, [verdict])

  const pause = useCallback(() => {
    if (phase !== 'playing' && phase !== 'countdown') return
    playerRef.current?.pause()
    sceneRef.current?.stop()
    inputRef.current?.reset()
    setPhase('paused')
  }, [phase])

  const resume = useCallback(() => {
    if (phase !== 'paused') return
    sceneRef.current?.start()
    void playerRef.current?.resume()
    setPhase('playing')
  }, [phase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.preventDefault()
      if (phase === 'paused') resume()
      else pause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, pause, resume])

  const quit = () => {
    finishedRef.current = true
    setScreen(playedFrom)
  }

  const restart = () => {
    // Remontar a tela é mais simples e mais seguro que reiniciar a sessão no
    // lugar: o caminho de montagem já é o único que sabe construir tudo. O
    // desvio é pela tela de origem, para que ela continue sendo a origem.
    setScreen(playedFrom)
    requestAnimationFrame(() => setScreen('play'))
  }

  return (
    <div className="play">
      <canvas ref={canvasRef} />

      {hudState && entry && (
        <Hud
          state={hudState}
          verdict={verdict}
          songName={entry.song.meta.name}
          artist={entry.song.meta.artist}
        />
      )}

      {phase === 'countdown' && <div className="countdown">{countdown}</div>}

      {/* Véu do encerramento: escurece devagar até os resultados entrarem,
          para a troca de tela não aparecer como um corte. */}
      {phase === 'outro' && <div className="outro-veil" />}
      {phase === 'outro' && won && <YouRock seconds={OUTRO_SECONDS} />}

      {phase === 'loading' && (
        <div className="overlay">
          <div className="overlay-panel loading-panel">
            <h2>Afinando</h2>
            <p className="screen-subtitle">
              {entry?.synthesized
                ? 'Sintetizando a faixa de demonstração…'
                : 'Decodificando o áudio…'}
            </p>

            {/* Progresso de verdade: cada linha é um arquivo que o palco
                está esperando, e some da lista só quando chega. */}
            {assets.total > 0 && (
              <ul className="loading-list">
                {assets.itens.map((item) => (
                  <li key={item.label} data-done={item.done}>
                    <span>{item.label}</span>
                    <b>{item.done ? '✓' : '…'}</b>
                  </li>
                ))}
              </ul>
            )}

            <div className="loading-bar">
              <i style={{ width: `${assets.total ? (assets.done / assets.total) * 100 : 8}%` }} />
            </div>
            <p className="screen-subtitle">
              {assets.total && assets.done >= assets.total
                ? 'Preparando o palco…'
                : `Carregando o palco (${assets.done}/${assets.total || '…'})`}
            </p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Não deu</h2>
            <p className="screen-subtitle">{error}</p>
            <button className="btn btn-primary" onClick={quit}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {phase === 'paused' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Pausado</h2>
            <p className="screen-subtitle">Esc volta ao jogo.</p>
            <button className="btn btn-primary" onClick={resume}>
              Continuar
            </button>
            <button className="btn" onClick={restart}>
              Recomeçar
            </button>
            <button className="btn btn-ghost" onClick={quit}>
              Sair da música
            </button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Você foi vaiado</h2>
            <p className="screen-subtitle">
              O medidor zerou. Dá para tentar de novo, baixar a dificuldade, ou ligar o modo sem
              falha nos ajustes.
            </p>
            <button className="btn btn-primary" onClick={restart}>
              De novo
            </button>
            <button className="btn btn-ghost" onClick={finish}>
              Ver o resultado
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
