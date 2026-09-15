/**
 * Áudio da faixa de demonstração, sintetizado na hora.
 *
 * Renderizar o som a partir da mesma partitura que gera o chart resolve, por
 * construção, o problema que mais atrapalha um jogo de ritmo: o áudio e as
 * notas não podem sair de sincronia porque são a mesma fonte. Também evita
 * embarcar qualquer arquivo de música no projeto.
 *
 * A renderização acontece num `OfflineAudioContext`, que processa mais
 * rápido que tempo real e devolve um `AudioBuffer` pronto para tocar como
 * qualquer faixa importada.
 */

import { DEMO_BEAT, DEMO_SCORE } from '../content/demoSong'

function frequencyOf(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Curva de saturação: é o que separa uma guitarra de um apito. */
function distortionCurve(amount: number) {
  const samples = 1024
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

function pluck(
  ctx: OfflineAudioContext,
  destination: AudioNode,
  time: number,
  frequency: number,
  duration: number,
  gain: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator()
  const sub = ctx.createOscillator()
  const envelope = ctx.createGain()

  osc.type = type
  osc.frequency.value = frequency
  // Uma segunda voz uma oitava abaixo engrossa sem precisar de mais notas.
  sub.type = 'triangle'
  sub.frequency.value = frequency / 2

  const attack = 0.004
  const release = Math.max(0.08, duration * 0.5)
  envelope.gain.setValueAtTime(0, time)
  envelope.gain.linearRampToValueAtTime(gain, time + attack)
  envelope.gain.exponentialRampToValueAtTime(gain * 0.45, time + attack + 0.06)
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + attack + duration + release)

  osc.connect(envelope)
  sub.connect(envelope)
  envelope.connect(destination)

  osc.start(time)
  sub.start(time)
  osc.stop(time + duration + release + 0.05)
  sub.stop(time + duration + release + 0.05)
}

function drumHit(
  ctx: OfflineAudioContext,
  destination: AudioNode,
  time: number,
  kind: 'kick' | 'snare' | 'hat',
) {
  const envelope = ctx.createGain()
  envelope.connect(destination)

  if (kind === 'kick') {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, time)
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.11)
    envelope.gain.setValueAtTime(0.9, time)
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.24)
    osc.connect(envelope)
    osc.start(time)
    osc.stop(time + 0.26)
    return
  }

  // Caixa e chimbal saem de ruído branco filtrado.
  const length = kind === 'snare' ? 0.18 : 0.05
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = kind === 'snare' ? 'bandpass' : 'highpass'
  filter.frequency.value = kind === 'snare' ? 1800 : 7000
  filter.Q.value = kind === 'snare' ? 0.8 : 1

  envelope.gain.setValueAtTime(kind === 'snare' ? 0.5 : 0.16, time)
  envelope.gain.exponentialRampToValueAtTime(0.001, time + length)

  source.connect(filter)
  filter.connect(envelope)
  source.start(time)
}

export async function renderDemoTrack(sampleRate = 44100): Promise<AudioBuffer> {
  const lastBeat = Math.max(...DEMO_SCORE.map((n) => n.beat + n.length)) + 4
  const duration = lastBeat * DEMO_BEAT + 2
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)

  const master = ctx.createGain()
  master.gain.value = 0.7
  master.connect(ctx.destination)

  // Cadeia da guitarra: saturação, depois um corte de agudos para tirar a
  // aspereza que a distorção digital acrescenta.
  const shaper = ctx.createWaveShaper()
  shaper.curve = distortionCurve(12)
  shaper.oversample = '4x'

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 3400

  const guitarGain = ctx.createGain()
  guitarGain.gain.value = 0.16

  guitarGain.connect(shaper)
  shaper.connect(tone)
  tone.connect(master)

  const bassGain = ctx.createGain()
  bassGain.gain.value = 0.22
  const bassTone = ctx.createBiquadFilter()
  bassTone.type = 'lowpass'
  bassTone.frequency.value = 400
  bassGain.connect(bassTone)
  bassTone.connect(master)

  const drumGain = ctx.createGain()
  drumGain.gain.value = 0.5
  drumGain.connect(master)

  for (const note of DEMO_SCORE) {
    const time = note.beat * DEMO_BEAT
    const length = Math.max(0.12, note.length * DEMO_BEAT)
    pluck(ctx, guitarGain, time, frequencyOf(note.pitch), length, 0.8, 'sawtooth')
    if (note.with) {
      // Os trastes extras de um acorde soam como terças acima da fundamental.
      note.with.forEach((_, i) => {
        pluck(ctx, guitarGain, time, frequencyOf(note.pitch + 4 + i * 3), length, 0.45, 'sawtooth')
      })
    }
  }

  // Baixo e bateria seguem a grade, não a partitura da guitarra.
  for (let beat = 0; beat < lastBeat; beat += 1) {
    const time = beat * DEMO_BEAT
    const root = 28 + [0, 0, 3, 5][Math.floor(beat / 4) % 4]
    pluck(ctx, bassGain, time, frequencyOf(root), DEMO_BEAT * 0.8, 0.9, 'square')

    if (beat >= 4) {
      if (beat % 4 === 0 || beat % 4 === 2) drumHit(ctx, drumGain, time, 'kick')
      if (beat % 4 === 1 || beat % 4 === 3) drumHit(ctx, drumGain, time, 'snare')
      drumHit(ctx, drumGain, time, 'hat')
      drumHit(ctx, drumGain, time + DEMO_BEAT / 2, 'hat')
    }
  }

  return ctx.startRendering()
}
