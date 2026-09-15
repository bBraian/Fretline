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

const LEAD_IN = 3

type Phase = 'loading' | 'countdown' | 'playing' | 'paused' | 'failed' | 'error'

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
  const finishSong = useGame((s) => s.finishSong)

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(LEAD_IN)
  const [hudState, setHudState] = useState<SessionState | null>(null)
  const [verdict, setVerdict] = useState<{ verdict: Verdict; delta: number } | null>(null)

  const entry = library.find((e) => e.song.meta.id === selectedSongId)
  const chart = entry?.song.charts[settings.difficulty]

  const finish = useCallback(() => {
    const session = sessionRef.current
    if (!session || finishedRef.current) return
    finishedRef.current = true

    playerRef.current?.pause()
    sceneRef.current?.stop()
    finishSong(evaluate(session.getState(), settings.difficulty))
  }, [finishSong, settings.difficulty])

  // Montagem: áudio, sessão, input e cena. Roda uma vez por entrada na tela.
  useEffect(() => {
    if (!entry || !chart || !canvasRef.current) {
      setError('Essa música não tem chart para a dificuldade escolhida.')
      setPhase('error')
      return
    }

    let cancelled = false
    const canvas = canvasRef.current
    finishedRef.current = false

    const onEvent = (event: SessionEvent) => {
      if (event.kind === 'hit') setVerdict({ verdict: event.verdict, delta: event.delta })
      if (event.kind === 'miss' || event.kind === 'ghostTap') setVerdict(null)
      if (event.kind === 'failed') {
        playerRef.current?.pause()
        setPhase('failed')
      }
      if (event.kind === 'finished') finish()
    }

    const boot = async () => {
      const player = new SongPlayer({
        leadIn: LEAD_IN,
        chartOffset: entry.song.meta.offset,
      })

      try {
        if (entry.synthesized) {
          player.useBuffers([await renderDemoTrack(player.context.sampleRate)])
        } else if (entry.audioUrls.length > 0) {
          await player.load(entry.audioUrls)
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

      player.setVolume(settings.volume)

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
        ;(window as unknown as { __fretline?: unknown }).__fretline = { session, player, chart }
      }

      scene.start()
      await player.start()
      if (!cancelled) setPhase('countdown')
    }

    void boot()

    return () => {
      cancelled = true
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
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // O painel atualiza a quinze quadros por segundo; ver acima.
  useEffect(() => {
    const id = window.setInterval(() => {
      const session = sessionRef.current
      const player = playerRef.current
      if (!session || !player) return

      setHudState({ ...session.getState() })

      const songTime = player.now()
      if (songTime < 0) setCountdown(Math.max(1, Math.ceil(-songTime)))
      else if (phase === 'countdown') setPhase('playing')
    }, 1000 / 15)

    return () => window.clearInterval(id)
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
    setScreen('songs')
  }

  const restart = () => {
    // Remontar a tela é mais simples e mais seguro que reiniciar a sessão no
    // lugar: o caminho de montagem já é o único que sabe construir tudo.
    setScreen('songs')
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

      {phase === 'loading' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Afinando</h2>
            <p className="screen-subtitle">
              {entry?.synthesized
                ? 'Sintetizando a faixa de demonstração…'
                : 'Decodificando o áudio…'}
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
