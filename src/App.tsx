/**
 * Roteador de telas.
 *
 * A tela de jogo é desmontada de verdade ao sair, e não escondida: ela
 * segura um contexto de áudio e um renderizador WebGL, e deixá-los vivos em
 * segundo plano é o caminho mais curto para vazar memória de GPU.
 */

import { useEffect } from 'react'
import { useGame } from './ui/store'
import { mixer } from './audio/mixer'
import { MenuScreen } from './ui/screens/MenuScreen'
import { CareerScreen } from './ui/screens/CareerScreen'
import { SongsScreen } from './ui/screens/SongsScreen'
import { CharactersScreen } from './ui/screens/CharactersScreen'
import { GuitarsScreen } from './ui/screens/GuitarsScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { CalibrationScreen } from './ui/screens/CalibrationScreen'
import { ResultsScreen } from './ui/screens/ResultsScreen'
import { PlayScreen } from './ui/PlayScreen'

export function App() {
  const screen = useGame((s) => s.screen)
  const refreshLocalLibrary = useGame((s) => s.refreshLocalLibrary)
  const volume = useGame((s) => s.settings.volume)
  const menuMusic = useGame((s) => s.settings.menuMusic)

  // A pasta `songs/` é lida uma vez ao abrir. Falhar aqui não é erro: num
  // build estático, sem o servidor local, simplesmente não há pasta.
  useEffect(() => {
    void refreshLocalLibrary()
  }, [refreshLocalLibrary])

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
    if (screen === 'play') mixer.stopMenuMusic()
    else mixer.startMenuMusic()
  }, [screen])

  // O navegador só deixa tocar som depois de um gesto. O primeiro clique ou
  // tecla é o que acorda a mesa.
  useEffect(() => {
    const acordar = () => mixer.startMenuMusic()
    window.addEventListener('pointerdown', acordar, { once: true })
    window.addEventListener('keydown', acordar, { once: true })
    return () => {
      window.removeEventListener('pointerdown', acordar)
      window.removeEventListener('keydown', acordar)
    }
  }, [])

  switch (screen) {
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
