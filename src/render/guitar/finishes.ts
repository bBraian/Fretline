/**
 * Acabamentos de corpo desenhados em memória.
 *
 * Um sunburst não é uma cor: é um degradê radial do miolo claro para a borda
 * escura, e um tampo flamejado são faixas onduladas que atravessam esse
 * degradê. Nenhum dos dois se resolve com um material de cor única, e os
 * dois são baratos de desenhar num canvas.
 *
 * As UVs da extrusão vêm das próprias coordenadas do contorno — o gerador
 * padrão do Three usa (x, y) direto —, então elas cobrem mais ou menos
 * -0,6 a 0,6. O ajuste de `repeat` e `offset` abaixo leva essa faixa para
 * 0 a 1 sem precisar de um gerador de UV próprio.
 */

import * as THREE from 'three'

const SIZE = 512

/** Metade da largura que o contorno de um corpo ocupa, em unidades locais. */
const SHAPE_EXTENT = 0.62

function applyShapeMapping(texture: THREE.Texture) {
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.repeat.set(1 / (SHAPE_EXTENT * 2), 1 / (SHAPE_EXTENT * 2))
  texture.offset.set(0.5, 0.5)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Faixas onduladas do tampo flamejado. */
function drawFlame(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'

  for (let x = 0; x < SIZE; x += 3) {
    // A ondulação varia ao longo da altura, senão as faixas viram listras
    // retas e o tampo parece plástico.
    const strength = 0.72 + 0.28 * Math.sin(x * 0.19) * Math.sin(x * 0.041)
    ctx.strokeStyle = `rgba(90, 45, 20, ${(1 - strength) * 0.8})`
    ctx.lineWidth = 3

    ctx.beginPath()
    for (let y = 0; y <= SIZE; y += 16) {
      const wobble = Math.sin(y * 0.012 + x * 0.05) * 9 + Math.sin(y * 0.031) * 4
      if (y === 0) ctx.moveTo(x + wobble, y)
      else ctx.lineTo(x + wobble, y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

export interface SunburstColors {
  center: string
  middle: string
  edge: string
}

export function createSunburst(colors: SunburstColors, flame: boolean): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(
    SIZE / 2,
    SIZE * 0.46,
    SIZE * 0.06,
    SIZE / 2,
    SIZE * 0.46,
    SIZE * 0.58,
  )
  gradient.addColorStop(0, colors.center)
  gradient.addColorStop(0.45, colors.center)
  gradient.addColorStop(0.72, colors.middle)
  gradient.addColorStop(1, colors.edge)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)

  if (flame) drawFlame(ctx)

  return applyShapeMapping(new THREE.CanvasTexture(canvas))
}
