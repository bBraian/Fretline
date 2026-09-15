import { useGame } from '../store'
import { characterById } from '../../content/characters'
import { guitarById } from '../../content/guitars'

export function MenuScreen() {
  const setScreen = useGame((s) => s.setScreen)
  const profile = useGame((s) => s.profile)
  const library = useGame((s) => s.library)
  const totalStars = useGame((s) => s.totalStars())
  const difficulty = useGame((s) => s.settings.difficulty)

  const character = characterById(profile.characterId)
  const guitar = guitarById(profile.guitarId)

  return (
    <div className="screen">
      <div className="menu">
        <header>
          <h1 className="wordmark">FRETLINE</h1>
          <p className="tagline">
            Cinco trastes, sem palhetada, e um medidor que não perdoa. Traga sua pasta de músicas.
          </p>
        </header>

        <nav className="menu-actions">
          <button className="menu-item" onClick={() => setScreen('career')}>
            <span>
              <strong>Carreira</strong>
              <span>Os tiers na ordem original, preenchidos pela sua biblioteca</span>
            </span>
            <span aria-hidden>▸</span>
          </button>

          <button className="menu-item" onClick={() => setScreen('songs')}>
            <span>
              <strong>Tocar</strong>
              <span>
                {library.length} música{library.length === 1 ? '' : 's'} na biblioteca ·{' '}
                {difficultyName(difficulty)}
              </span>
            </span>
            <span aria-hidden>▸</span>
          </button>

          <button className="menu-item" onClick={() => setScreen('characters')}>
            <span>
              <strong>Personagem</strong>
              <span>{character.name}</span>
            </span>
            <span aria-hidden>▸</span>
          </button>

          <button className="menu-item" onClick={() => setScreen('guitars')}>
            <span>
              <strong>Guitarra</strong>
              <span>{guitar.name}</span>
            </span>
            <span aria-hidden>▸</span>
          </button>

          <button className="menu-item" onClick={() => setScreen('settings')}>
            <span>
              <strong>Ajustes</strong>
              <span>Dificuldade, velocidade, controles</span>
            </span>
            <span aria-hidden>▸</span>
          </button>

          <button className="menu-item" onClick={() => setScreen('calibration')}>
            <span>
              <strong>Calibrar</strong>
              <span>Alinhe o som e a imagem com o seu equipamento</span>
            </span>
            <span aria-hidden>▸</span>
          </button>
        </nav>

        <footer className="menu-stats">
          <div>
            <b>{totalStars}</b>
            estrelas
          </div>
          <div>
            <b>${profile.money.toLocaleString('pt-BR')}</b>
            no bolso
          </div>
          <div>
            <b>{profile.ownedCharacters.length + profile.ownedGuitars.length}</b>
            itens liberados
          </div>
        </footer>
      </div>
    </div>
  )
}

export function difficultyName(difficulty: string) {
  return { easy: 'Fácil', medium: 'Médio', hard: 'Difícil', expert: 'Expert' }[difficulty] ?? difficulty
}
