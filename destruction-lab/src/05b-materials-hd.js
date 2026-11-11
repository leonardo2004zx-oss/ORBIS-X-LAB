/* ------------------------------------------------------------------ HD materials ("después") */
// Facade shader additions (per block, from a hash of the block center):
//  - glass tint varies from block to block, some windows have blinds
//  - windows light up at night only on some blocks
//  - fake ambient occlusion darkens the lower meters of every facade
function facadeShader(mat, share, blindsOn = true) {
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 0.75;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCenter; varying float vWY; attribute float iDmg; varying float vDmg;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y; vDmg = iDmg;
#else
vDmg = 0.0;
vCenter = vec3(0.0); vWY = (modelMatrix * vec4(transformed, 1.0)).y;
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCenter; varying float vWY; varying float vDmg; uniform float uNight;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float hsh = fract(sin(dot(floor(vCenter * 1.37), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float hsh2 = fract(hsh * 17.31 + 0.13), hsh3 = fract(hsh * 7.71 + 0.31);
        vec4 ormS = texture2D(roughnessMap, vRoughnessMapUv);
        float glassM = 1.0 - smoothstep(0.12, 0.25, ormS.g);
        vec3 tint = mix(vec3(0.88, 0.96, 1.05), vec3(1.06, 0.99, 0.9), hsh2);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tint, glassM);
        float blinds = ${blindsOn ? '1.0' : '0.0'} * glassM * step(0.7, hsh) * step(1.0 - (0.15 + 0.4 * hsh2), vMapUv.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.58, 0.52), blinds * 0.85);
        diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 5.0, vWY));
        // damage: broken glass (dark holes, no reflection) and soot, growing with how close the blast was
        float cellH = fract(sin(dot(floor(vMapUv * vec2(2.0, 3.0)) + hsh * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
        float broken = glassM * step(cellH * 0.85 + 0.1, vDmg);
        float soot = vDmg * (0.55 + 0.45 * cellH);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.022, 0.02), broken * 0.92);
        diffuseColor.rgb *= 1.0 - 0.7 * soot;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.75, blinds); roughnessFactor = mix(roughnessFactor, 0.95, max(broken, soot * 0.8));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.0, max(blinds, max(broken, soot)));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= uNight * step(${(1 - share).toFixed(2)}, hsh3) * (0.55 + 0.9 * hsh2) * (1.0 - blinds * 0.55) * (1.0 - broken) * (1.0 - soot);`);
  };
  mat.customProgramCacheKey = () => 'facade' + share + blindsOn;
  return mat;
}
function hdFacade(tex, share, extra = {}, blindsOn = true) {
  return facadeShader(new THREE.MeshStandardMaterial(Object.assign({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.orm, metalnessMap: tex.orm, emissiveMap: tex.glow, roughness: 1, metalness: 1 }, extra)), share, blindsOn);
}
function hdSurface(tex, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.orm, metalnessMap: tex.orm, roughness: 1, metalness: 1 }, extra));
}
const HD = {};
function buildHDMaterials() {
  const roofT = roofHD();
  const roof = hdSurface(roofT);
  const six = (side) => [side, side, roof, roof, side, side];
  HD.concrete = six(hdFacade(facadeConcrete(), 0.55));
  HD.glass = six(hdFacade(facadeGlass(), 0.3, {}, false));
  HD.glass[0].emissiveIntensity = 0.35;
  HD.brick = six(hdFacade(facadeBrick(), 0.5));
  HD.metal = six(hdFacade(facadeMetal(), 0.5));
  HD.stone = six(hdFacade(facadeStone(), 0.5));
  const dt = debrisHD();
  HD.debris = hdSurface(dt);
  HD.plain = hdSurface(dt, { color: 0xdedad2 });
  HD.rubble = hdSurface(dt);
}
// classic ("antes") materials for the two new facade families reuse the old window texture
const metalBlocks = new Pool([sideMat, sideMat, topMat, topMat, sideMat, sideMat], 1200);
const stoneBlocks = new Pool([sideMat, sideMat, topMat, topMat, sideMat, sideMat], 1400);
BLOCK_POOLS.push(metalBlocks, stoneBlocks);
blocks.classic = blocks.mesh.material; glassBlocks.classic = glassBlocks.mesh.material; brickBlocks.classic = brickBlocks.mesh.material;
plainBlocks.classic = plainBlocks.mesh.material; debris.classic = debris.mesh.material;
metalBlocks.classic = metalBlocks.mesh.material; stoneBlocks.classic = stoneBlocks.mesh.material;
// persistent rubble: settled fragments leave the physics world but stay on screen
const rubble = new THREE.InstancedMesh(BOX, debris.mesh.material, 3000);
rubble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
rubble.setColorAt(0, new THREE.Color(1, 1, 1)); rubble.count = 0; rubble.castShadow = true; rubble.receiveShadow = true; rubble.frustumCulled = false;
rubble.classic = debris.mesh.material;
scene.add(rubble);
let rubbleNext = 0;
function addRubble(it) {
  const b = it.body, t = b.translation(), r = b.rotation();
  tmpV.set(t.x, t.y, t.z); tmpQ.set(r.x, r.y, r.z, r.w); tmpS.set(it.sx, it.sy, it.sz);
  tmpM.compose(tmpV, tmpQ, tmpS);
  const i = rubbleNext; rubbleNext = (rubbleNext + 1) % 3000;
  rubble.setMatrixAt(i, tmpM); rubble.setColorAt(i, it.color);
  rubble.count = Math.max(rubble.count, i + 1);
  rubble.instanceMatrix.needsUpdate = true; rubble.instanceColor.needsUpdate = true;
}
function clearRubble() { rubble.count = 0; rubbleNext = 0; }
function applyGfxMaterials() {
  const e = gfx.enhanced;
  blocks.mesh.material = e ? HD.concrete : blocks.classic;
  glassBlocks.mesh.material = e ? HD.glass : glassBlocks.classic;
  brickBlocks.mesh.material = e ? HD.brick : brickBlocks.classic;
  metalBlocks.mesh.material = e ? HD.metal : metalBlocks.classic;
  stoneBlocks.mesh.material = e ? HD.stone : stoneBlocks.classic;
  plainBlocks.mesh.material = e ? HD.plain : plainBlocks.classic;
  debris.mesh.material = e ? HD.debris : debris.classic;
  rubble.material = e ? HD.rubble : rubble.classic;
}
