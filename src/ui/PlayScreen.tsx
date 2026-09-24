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
import { pausePadButton } from '../input/bindings'
import { GameScene, highwayRailsAt } from '../render/gameScene'
import { stageForShow } from '../render/stage/stageModel'
import { evaluate } from '../content/progression'
import { useGame } from './store'
import { Hud } from './hud/Hud'
import { YouRock } from './hud/YouRock'
import { mixer } from '../audio/mixer'
import { TrackLoadError, type TrackProgress } from '../audio/download'
import { downloadProgress, mb } from './downloadProgress'
import { holdGamepadNav } from './gamepadNav'

const LEAD_IN = 3

type Phase = 'loading' | 'countdown' | 'playing' | 'outro' | 'paused' | 'failed' | 'error'

/** Quanto dura o encerramento, do fim da música até os resultados. */
const OUTRO_SECONDS = 3.2

/**
 * O painel: largura de desenho (a de `--hud-panel`), altura de janela em que
 * ele sai nesse tamanho, e os limites da escala. Abaixo do mínimo ele deixa
 * de caber de qualquer jeito, e ler vale mais que não cobrir o trilho.
 */
const HUD_WIDTH = 196
const HUD_REFERENCE_HEIGHT = 680
const HUD_MIN_SCALE = 0.45
const HUD_MAX_SCALE = 1.35
/** Distância mínima entre o painel e a borda da tela. */
const HUD_MARGIN = 8

/** Espera o navegador pintar `count` quadros. */
function frames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(count)
  })
}

export function PlayScreen() {
  const playRef = useRef<HTMLDivElement>(null)
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
  const retry = useGame((s) => s.retry)
  const updateSettings = useGame((s) => s.updateSettings)

  const [phase, setPhase] = useState<Phase>('loading')
  const [assets, setAssets] = useState<{
    itens: Array<{ label: string; done: boolean }>
    done: number
    total: number
  }>({ itens: [], done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  /** O download das faixas, faixa a faixa; vazio na demo. */
  const [download, setDownload] = useState<TrackProgress[]>([])
  /** Em que parte da espera está: o áudio, ou o palco depois dele. */
  const [loadStep, setLoadStep] = useState<'audio' | 'stage'>('audio')
  /** O erro veio de um carregamento, e tentar de novo faz sentido. */
  const [retryable, setRetryable] = useState(false)
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

    // Sair da tela no meio do download cancela o download. Com 31 MB numa
    // conexão lenta, deixar correndo seria gastar a banda do jogador numa
    // música que ele já desistiu de tocar.
    const controller = new AbortController()

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

      // O progresso chega a cada pedaço; a tela lê a cada 120 ms, como
      // faz com os itens do palco logo abaixo.
      let recebido: TrackProgress[] = []
      const relatorioAudio = window.setInterval(() => setDownload(recebido), 120)

      try {
        if (entry.synthesized) {
          player.useBuffers([await renderDemoTrack(player.context.sampleRate)])
        } else if (entry.tracks.length > 0) {
          await player.load(entry.tracks, {
            signal: controller.signal,
            onProgress: (itens) => {
              recebido = itens
            },
          })
        }
      } catch (loadError) {
        // Cancelado é a tela saindo: nada de painel de erro no caminho.
        if (!cancelled) {
          console.error(loadError)
          setError(
            loadError instanceof TrackLoadError && loadError.kind === 'network'
              ? 'Não consegui baixar a música. Confira a conexão e tente de novo.'
              : 'Não consegui decodificar o áudio dessa música.',
          )
          setRetryable(true)
          setPhase('error')
        }
        await player.dispose()
        return
      } finally {
        window.clearInterval(relatorioAudio)
        if (!cancelled) setDownload(recebido)
      }

      if (cancelled) {
        await player.dispose()
        return
      }
      setLoadStep('stage')

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

      // Um palco por apresentação: sorteado quando a música começa de um
      // menu, o mesmo ao recomeçar. Ver `stageForShow`.
      const stageModel = stageForShow(useGame.getState().show)

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
        stageModel,
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
          stage: stageModel?.id ?? 'classic',
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

      // Arquivo chegado ainda não é quadro pronto: o primeiro desenho
      // compila shaders e sobe texturas, e travava a página por segundos
      // com a música já correndo — a contagem e a abertura se passavam
      // inteiras atrás desta tela. Nada toca antes de o palco estar de fato
      // na tela: aquece, desenha com o relógio parado no começo, espera o
      // navegador pintar, e só então dá a partida.
      await scene.warmUp(-LEAD_IN)
      if (cancelled) return
      scene.start()
      await frames(2)
      if (cancelled) return

      // A abertura: a pista sobe, o arpejo das notas sobe atrás, a plateia
      // grita — e a música entra por cima do fim do grito. Cabe na
      // aproximação de três segundos, e toca no contexto da mesa, que
      // sobrevive à montagem e ao descarte desta tela.
      mixer.playSongIntro(LEAD_IN)
      await player.start()
      if (!cancelled) setPhase('countdown')
    }

    void boot()

    return () => {
      controller.abort()
      cancelled = true
      // O que era do palco — o grito da abertura, a plateia do boost — não
      // vem junto para o menu, nem fica pausado esperando uma volta que
      // não vai acontecer.
      mixer.stopStage()
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
    const botaoDePausa = pausePadButton(settings.gamepad)
    let pausaApertada = false
    const tick = () => {
      const input = inputRef.current
      const scene = sceneRef.current

      // A pausa do controle, no aperto — e só no aperto, senão segurar o
      // botão pausaria e retomaria a cada quadro.
      const pad = botaoDePausa < 0 ? null : [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected)
      const pausa = pad?.buttons[botaoDePausa]?.pressed ?? false
      if (pausa && !pausaApertada) alternarPausa.current()
      pausaApertada = pausa

      // Fora da música o controle é dos menus: um A no painel da pausa não
      // pode chegar à sessão como traste.
      if (input && scene && jogando.current) {
        input.pollGamepad()
        scene.setPressed(input.fretMask)
        // A alavanca só faz som e só entorta a cauda com um sustain
        // segurado, como no original; fora dele, só o braço da guitarra do
        // personagem acompanha.
        const sustaining = (sessionRef.current?.getState().activeSustains.length ?? 0) > 0
        scene.setWhammy(input.whammyValue, sustaining)
        playerRef.current?.setWhammy(sustaining ? input.whammyValue : 0)
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

  /**
   * Pausa tudo: música, desenho e os efeitos da mesa.
   *
   * A música da partida e os efeitos vivem em contextos de áudio
   * diferentes, e pausar só a música deixava o grito da abertura e a
   * plateia do boost tocando sobre a tela de pausa.
   */
  const pause = useCallback(() => {
    if (phase !== 'playing' && phase !== 'countdown') return
    playerRef.current?.pause()
    mixer.pauseStage()
    sceneRef.current?.stop()
    // O teclado sai junto: na pausa as teclas são do painel, e um traste
    // apertado ali seria julgado contra o relógio parado.
    inputRef.current?.detach()
    setPhase('paused')
  }, [phase])

  const resume = useCallback(() => {
    if (phase !== 'paused') return
    // Pausou na contagem, volta para a contagem — senão o número some e a
    // música entra sem aviso.
    const inCountdown = (playerRef.current?.now() ?? 0) < 0
    inputRef.current?.syncGamepad()
    inputRef.current?.attach()
    sceneRef.current?.start()
    mixer.resumeStage()
    void playerRef.current?.resume()
    setPhase(inCountdown ? 'countdown' : 'playing')
  }, [phase])

  /**
   * O que o laço do controle lê a cada quadro sem virar dependência dele.
   *
   * `jogando` libera a leitura dos trastes; `alternarPausa` é o botão de
   * pausa, que pausa tocando e retoma pausado.
   */
  const jogando = useRef(false)
  jogando.current = phase === 'playing' || phase === 'countdown'
  const alternarPausa = useRef(() => {})
  alternarPausa.current = () => {
    if (phase === 'paused') resume()
    else pause()
  }

  // Enquanto a música corre, A e B são trastes: a navegação por controle
  // dos menus fica segurada, e volta no painel de pausa ou de vaia.
  const musicaCorrendo = phase === 'countdown' || phase === 'playing' || phase === 'outro'
  useEffect(() => {
    if (!musicaCorrendo) return
    return holdGamepadNav()
  }, [musicaCorrendo])

  // Trocar de aba ou minimizar pausa. Sem isto a música seguia tocando com
  // o desenho parado — o navegador não anima aba escondida —, e na volta
  // todas as notas do intervalo venciam de uma vez, como erro.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  // O painel encosta nas bordas do braço, onde quer que elas caiam nesta
  // janela; ver `highwayRailsAt` e o CSS de `.hud-left`.
  useEffect(() => {
    const el = playRef.current
    if (!el) return
    const place = () => {
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      // O pé dos painéis: 5% da altura, entre 20 e 54px.
      const bottom = Math.round(Math.min(54, Math.max(20, height * 0.05)))
      const gap = Math.round(Math.min(22, Math.max(10, width * 0.014)))
      const rails = highwayRailsAt(height - bottom, width, height)
      // Quanto cabe entre a pista e a borda da tela, do lado mais apertado.
      const room = Math.min(rails.left, width - rails.right) - gap - HUD_MARGIN
      // Cresce com a altura, como a pista; e nunca passa do espaço que há.
      const scale = Math.min(HUD_MAX_SCALE, room / HUD_WIDTH, height / HUD_REFERENCE_HEIGHT)
      el.style.setProperty('--hud-bottom', `${bottom}px`)
      el.style.setProperty('--hud-gap', `${gap}px`)
      el.style.setProperty('--hud-scale', `${Math.max(HUD_MIN_SCALE, scale).toFixed(3)}`)
      el.style.setProperty('--rail-left', `${Math.round(rails.left)}px`)
      el.style.setProperty('--rail-right', `${Math.round(rails.right)}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.preventDefault()
      // Esperando o palco, Esc é desistir: sai, e a desmontagem aborta o
      // download. Não há o que pausar ainda.
      if (phase === 'loading') quit()
      else if (phase === 'paused') resume()
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
    // lugar: o caminho de montagem já é o único que sabe construir tudo. A
    // tentativa nova é a `key` da tela no roteador; a tela de origem e o
    // palco continuam os mesmos.
    retry()
  }

  // A linha de fase e a barra do Afinando. A barra mede o download do
  // áudio, em bytes; depois dele fica cheia, e o que falta do palco aparece
  // na lista, item a item.
  const baixado = downloadProgress(download)
  let barra: number | null
  let fase: string
  if (loadStep === 'stage') {
    barra = 1
    fase =
      assets.total && assets.done >= assets.total
        ? 'Preparando o palco…'
        : `Montando o palco (${assets.done}/${assets.total || '…'})`
  } else if (entry?.synthesized) {
    barra = null
    fase = 'Sintetizando a faixa de demonstração…'
  } else if (baixado.phase === 'connecting') {
    barra = null
    fase = 'Conectando…'
  } else if (baixado.phase === 'downloading') {
    barra = baixado.fraction
    fase =
      baixado.total !== null
        ? `Baixando a música ${mb(baixado.loaded)} / ${mb(baixado.total)} MB`
        : `Baixando a música (${Math.round((baixado.fraction ?? 0) * download.length)}/${download.length} faixas)`
  } else {
    barra = 1
    fase = 'Decodificando o áudio…'
  }

  return (
    <div className="play" ref={playRef}>
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
            {entry && (
              <p className="screen-subtitle">
                <b>{entry.song.meta.name}</b>
                {entry.song.meta.artist ? ` — ${entry.song.meta.artist}` : ''}
              </p>
            )}

            <div className={barra === null ? 'loading-bar is-waiting' : 'loading-bar'}>
              <i style={barra === null ? undefined : { width: `${barra * 100}%` }} />
            </div>
            <p className="screen-subtitle">{fase}</p>

            {/* Progresso de verdade: cada linha é um arquivo que o palco
                está esperando, e some da lista só quando chega. */}
            {loadStep === 'stage' && assets.total > 0 && (
              <ul className="loading-list">
                {assets.itens.map((item) => (
                  <li key={item.label} data-done={item.done}>
                    <span>{item.label}</span>
                    <b>{item.done ? '✓' : '…'}</b>
                  </li>
                ))}
              </ul>
            )}

            <button className="btn btn-ghost" onClick={quit}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Não deu</h2>
            <p className="screen-subtitle">{error}</p>
            {retryable && (
              <button className="btn btn-primary" onClick={restart}>
                Tentar de novo
              </button>
            )}
            <button className={retryable ? 'btn btn-ghost' : 'btn btn-primary'} onClick={quit}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {phase === 'paused' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Pausado</h2>
            <p className="screen-subtitle">Esc volta ao jogo — no controle, B.</p>
            {/* Em foco ao abrir: Enter, ou o A do controle, continua. */}
            <button className="btn btn-primary" data-autofocus autoFocus onClick={resume}>
              Continuar
            </button>
            <button className="btn" onClick={restart}>
              Recomeçar
            </button>
            <button className="btn btn-ghost" onClick={quit}>
              Sair da música
            </button>

            {/* O volume geral, o mesmo dos ajustes: a mesa avisa o tocador,
                e a música obedece assim que a pausa sai. */}
            <label className="pause-volume">
              <span className="field-label">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.volume}
                onChange={(e) => {
                  updateSettings({ volume: Number(e.target.value) })
                  mixer.play('tweak')
                }}
              />
              <span className="field-value">{Math.round(settings.volume * 100)}%</span>
            </label>
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
