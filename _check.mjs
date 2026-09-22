import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readdirSync, statSync } from 'node:fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

const slotKey = (n) => (n ?? '').replace(/_\d+$/, '').replace(/[:\s.]/g, '').toLowerCase()
const PERFIS = {
  mixamo: ['mixamorig:LeftArm','mixamorig:LeftForeArm','mixamorig:LeftHand','mixamorig:RightArm','mixamorig:RightForeArm','mixamorig:RightHand'],
  'maya-shjnt': ['l_Arm_Shoulder','l_Arm_Elbow','l_Arm_Wrist','r_Arm_Shoulder','r_Arm_Elbow','r_Arm_Wrist'],
  'bone-bicep': ['Bone_Bicep_L','Bone_Forearm_L','Bone_Palm_L','Bone_Bicep_R','Bone_Forearm_R','Bone_Palm_R'],
}

const dir = process.argv[2]
for (const f of readdirSync(dir).filter((x) => /\.glb$/i.test(x))) {
  const doc = await io.read(`${dir}/${f}`)
  const root = doc.getRoot()
  const skins = root.listSkins()
  const juntas = [...new Set(skins.flatMap((s) => s.listJoints()).map((j) => j.getName()))]
  const chaves = juntas.map(slotKey)
  const acha = (p) => { const w = slotKey(p); return chaves.includes(w) || chaves.some((n) => n.startsWith(w)) }
  const perfil = Object.entries(PERFIS).find(([, ps]) => ps.every(acha))?.[0]

  let verts = 0, tris = 0
  for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) {
    verts += pr.getAttribute('POSITION')?.getCount() ?? 0
    const i = pr.getIndices(); tris += i ? i.getCount()/3 : (pr.getAttribute('POSITION')?.getCount() ?? 0)/3
  }
  const texBytes = root.listTextures().reduce((n, t) => n + (t.getImage()?.byteLength ?? 0), 0)
  const exts = root.listExtensionsUsed().map((e) => e.extensionName)
  const legado = exts.includes('KHR_materials_pbrSpecularGlossiness')

  const mb = (statSync(`${dir}/${f}`).size / 1e6).toFixed(1)
  console.log(`\n── ${f}  (${mb} MB)`)
  console.log(`   esqueleto: ${juntas.length ? `${juntas.length} juntas` : '❌ NENHUM (estátua)'}`)
  console.log(`   perfil de braço: ${perfil ?? (juntas.length ? '⚠️ não reconhecido' : '—')}`)
  console.log(`   geometria: ${verts} vért / ${Math.round(tris)} tri   texturas: ${(texBytes/1e6).toFixed(1)} MB`)
  if (legado) console.log(`   ⚠️ pbrSpecularGlossiness — vai aparecer BRANCO sem otimizar`)
  if (juntas.length && !perfil) {
    const br = juntas.filter((n) => /arm|hand|shoulder|bicep|forearm|wrist|clavicle|elbow/i.test(n))
    console.log(`   nomes de braço: ${br.slice(0,6).join(', ') || '(nenhum)'}`)
  }
}
