/**
 * A porta que o palco e as prévias usam para um integrante da banda.
 *
 * Existem duas implementações: `CharacterModel`, a marionete montada em
 * código, e `ImportedCharacter`, carregado de um arquivo glTF. Quem desenha
 * não precisa saber qual das duas tem em mãos — e é por isso que um
 * integrante importado pôde entrar sem mexer no laço de animação.
 */

import type * as THREE from 'three'
import type { PerformanceState, StageRole } from './characterModel'

export interface StageCharacter {
  readonly group: THREE.Group
  /** Onde a guitarra pendura. */
  readonly instrumentAnchor: THREE.Group
  /**
   * Mão que segura o microfone.
   *
   * Está no contrato porque o palco pendura coisa nela, e um integrante
   * importado precisa oferecer o mesmo ponto que a marionete.
   */
  readonly pickHand: THREE.Object3D
  setRole(role: StageRole): void
  setState(state: PerformanceState): void
  setIntensity(value: number): void
  update(dt: number, beatPhase: number): void
  dispose(): void
}
