/**
 * Roteador de telas.
 *
 * A tela de jogo é desmontada de verdade ao sair, e não escondida: ela
 * segura um contexto de áudio e um renderizador WebGL, e deixá-los vivos em
 * segundo plano é o caminho mais curto para vazar memória de GPU.
 */

import { useEffect, useRef } from 'react'
import { useGame, type Screen } from './ui/store'
import { mixer } from './audio/mixer'
import { menuTracks } from './songs/library'
import { MenuScreen } from './ui/screens/MenuScreen'
import { CareerScreen } from './ui/screens/CareerScreen'
import { SongsScreen } from './ui/screens/SongsScreen'
import { CharactersScreen } from './ui/screens/CharactersScreen'
import { GuitarsScreen } from './ui/screens/GuitarsScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { CalibrationScreen } from './ui/screens/CalibrationScreen'
import { ResultsScreen } from './ui/screens/ResultsScreen'
import { PlayScreen } from './ui/PlayScreen'
import { FullscreenButton } from './ui/FullscreenButton'
import { GamepadToast } from './ui/GamepadToast'
import { BootScreen } from './ui/screens/BootScreen'
import { useBackgroundPreviews } from './ui/useBackgroundPreviews'

export function App() {
  const screen = useGame((s) => s.screen)
  const library = useGame((s) => s.library)
  const volume = useGame((s) => s.settings.volume)
  const menuMusic = useGame((s) => s.settings.menuMusic)

  // A biblioteca e os efeitos descem na abertura (`ui/boot.ts`); os
  // previews, depois dela, um por vez.
  useBackgroundPreviews()

  /**
   * A música de fundo dos menus são as próprias músicas da biblioteca.
   *
   * A mesa não conhece `songs/` — se conhecesse, as camadas se enlaçariam —
   * então é aqui que a biblioteca vira uma lista de endereços. Qual trecho
   * de cada pacote é decisão de `menuTracks`.
   */
  useEffect(() => {
    mixer.setMenuTracks(menuTracks(library))
  }, [library])

  // A mesa de som nasce com o que estava salvo.
  useEffect(() => {
    mixer.setVolume(volume)
    mixer.setMenuMusicEnabled(menuMusic)
  }, [volume, menuMusic])

  /**
   * A música de fundo acompanha a navegação, não a tela.
   *
   * Ligar e desligar por tela faria a música recomeçar a cada passo entre
   * menus. Aqui ela só para de verdade ao entrar no palco, e volta ao sair
   * — o que mantém uma instância só no ar o tempo todo.
   */
  useEffect(() => {
    // Na abertura ainda não houve gesto: tocar agora só faria a trilha ter
    // o `play()` recusado faixa por faixa. Quem a liga é a saída dela.
    if (screen === 'boot') return
    if (screen === 'play') mixer.stopMenuMusic()
    else mixer.startMenuMusic()
  }, [screen])

  /**
   * O som de abrir um menu, num lugar só.
   *
   * Toda navegação passa por `setScreen`, então este efeito cobre botão,
   * teclado e o que vier depois sem que nenhuma tela precise lembrar de
   * tocar nada — e sem risco de duas telas tocarem o mesmo som.
   *
   * Três silêncios de propósito: a primeira tela — a abertura — não
   * *abriu*, ela já estava lá (sair dela toca, e é o primeiro som que o
   * gesto libera); o palco tem a própria entrada; e sair do palco já é
   * anunciado pelo fim da música, ganhou ou perdeu. O quarto caso, o de
   * voltar, é a própria mesa que resolve — `play('back')` cala o `enter`
   * seguinte.
   */
  const previousScreen = useRef<Screen | null>(null)
  useEffect(() => {
    const anterior = previousScreen.current
    previousScreen.current = screen
    if (anterior === null || anterior === screen) return
    if (screen === 'play' || anterior === 'play') return
    mixer.play('enter')
  }, [screen])

  return (
    <>
      {renderScreen(screen)}
      {/* O canto inferior direito do palco é do HUD, e um controle de
          janela por cima da pista se clica sem querer. */}
      {screen !== 'play' && <FullscreenButton />}
      <GamepadToast />
    </>
  )
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'boot':
      return <BootScreen />
    case 'career':
      return <CareerScreen />
    case 'songs':
      return <SongsScreen />
    case 'characters':
      return <CharactersScreen />
    case 'guitars':
      return <GuitarsScreen />
    case 'settings':
      return <SettingsScreen />
    case 'calibration':
      return <CalibrationScreen />
    case 'play':
      return <PlayScreen />
    case 'results':
      return <ResultsScreen />
    default:
      return <MenuScreen />
  }
}
