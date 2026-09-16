/**
 * Textura ornamentada do braço, desenhada em memória.
 *
 * No original a pista não é uma superfície lisa: tem um padrão de papel de
 * parede escuro que rola junto com as notas. É ele que dá a sensação de
 * movimento nos trechos em que nenhuma nota está na tela, e sem ele o braço
 * parece um plano de cor chapada deslizando.
 *
 * O padrão é desenhado num canvas e não escrito em GLSL porque um motivo
 * ornamental é feito de curvas e traços — coisas que uma API de desenho 2D
 * resolve em vinte linhas e um shader procedural custaria muito mais, tanto
 * em código quanto por pixel.
 */

import * as THREE from 'three'

const SIZE = 256

/** Um losango com volutas, repetido em grade. */
function motif(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, alpha: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.strokeStyle = `rgba(190, 205, 255, ${alpha})`
  ctx.lineWidth = 2.2

  // Losango externo.
  ctx.beginPath()
  ctx.moveTo(0, -30)
  ctx.lineTo(22, 0)
  ctx.lineTo(0, 30)
  ctx.lineTo(-22, 0)
  ctx.closePath()
  ctx.stroke()

  // Volutas: quatro curvas saindo das pontas laterais.
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * 22, 0)
    ctx.bezierCurveTo(side * 38, -12, side * 34, -26, side * 16, -24)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(side * 22, 0)
    ctx.bezierCurveTo(side * 38, 12, side * 34, 26, side * 16, 24)
    ctx.stroke()
  }

  // Miolo.
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

export function createHighwayTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0d101a'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Duas camadas deslocadas: a grade encaixada é o que faz o padrão parecer
  // um tecido em vez de uma fileira de carimbos.
  motif(ctx, SIZE * 0.25, SIZE * 0.25, 1, 0.16)
  motif(ctx, SIZE * 0.75, SIZE * 0.25, 1, 0.16)
  motif(ctx, SIZE * 0.25, SIZE * 0.75, 1, 0.16)
  motif(ctx, SIZE * 0.75, SIZE * 0.75, 1, 0.16)
  motif(ctx, SIZE * 0.5, SIZE * 0.5, 0.7, 0.1)
  motif(ctx, 0, SIZE * 0.5, 0.7, 0.1)
  motif(ctx, SIZE, SIZE * 0.5, 0.7, 0.1)
  motif(ctx, SIZE * 0.5, 0, 0.7, 0.1)
  motif(ctx, SIZE * 0.5, SIZE, 0.7, 0.1)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  // Sem anisotropia o padrão vira ruído no fundo da pista, onde a
  // superfície fica quase de perfil em relação à câmera.
  texture.anisotropy = 8
  return texture
}
