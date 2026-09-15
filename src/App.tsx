/**
 * Roteador de telas.
 *
 * A tela de jogo é desmontada de verdade ao sair, e não escondida: ela
 * segura um contexto de áudio e um renderizador WebGL, e deixá-los vivos em
 * segundo plano é o caminho mais curto para vazar memória de GPU.
 */

import { useGame } from './ui/store'
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
