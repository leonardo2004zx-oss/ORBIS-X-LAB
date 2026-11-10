/* ------------------------------------------------------------------ instanced pools */
const BOX = new THREE.BoxGeometry(1, 1, 1);
class Pool {
  constructor(mats, cap) {
    this.mesh = new THREE.InstancedMesh(BOX, mats, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.items = [];
    this.cap = cap;
    scene.add(this.mesh);
  }
  add(item, color) {
    if (this.items.length >= this.cap) return false;
    const i = this.items.length;
    item.idx = i; item.pool = this; item.dirty = true;
    this.items.push(item);
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.items.length;
    return true;
  }
  remove(item) {
    const i = item.idx;
    const last = this.items.pop();
    if (last !== item) {
      this.items[i] = last; last.idx = i; last.dirty = true;
      this.mesh.setColorAt(i, last.color);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.count = this.items.length;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}
// Night lighting: each block lights its windows or not, chosen from a hash of the block's own center.
const nightU = { value: 0 };
function litWindows(mat, share) {
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 1;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCenter;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvCenter = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;\n#else\nvCenter = vec3(0.0);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCenter; uniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hsh = fract(sin(dot(floor(vCenter * 1.37), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        totalEmissiveRadiance *= uNight * step(${(1 - share).toFixed(2)}, hsh) * (0.7 + 0.6 * hsh);`);
  };
  mat.customProgramCacheKey = () => 'lit' + share;
  return mat;
}
const sideMat = litWindows(new THREE.MeshStandardMaterial({ map: windowTex, emissiveMap: windowGlow, roughness: 0.78, metalness: 0.04 }), 0.55);
const topMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.92 });
const blocks = new Pool([sideMat, sideMat, topMat, topMat, sideMat, sideMat], 2600);
const glassSide = litWindows(new THREE.MeshStandardMaterial({ map: glassTex, emissiveMap: glassGlow, roughness: 0.18, metalness: 0.55, envMapIntensity: 1 }), 0.45);
const glassBlocks = new Pool([glassSide, glassSide, topMat, topMat, glassSide, glassSide], 1600);
const brickSide = litWindows(new THREE.MeshStandardMaterial({ map: brickTex, emissiveMap: brickGlow, roughness: 0.9 }), 0.5);
const brickBlocks = new Pool([brickSide, brickSide, topMat, topMat, brickSide, brickSide], 1200);
const plainBlocks = new Pool(new THREE.MeshStandardMaterial({ map: plainTex, roughness: 0.85 }), 900);
const BLOCK_POOLS = [blocks, glassBlocks, brickBlocks, plainBlocks];
function allBlocks() { return blocks.items.concat(glassBlocks.items, brickBlocks.items, plainBlocks.items); }
function blockCount() { let n = 0; for (const p of BLOCK_POOLS) n += p.items.length; return n; }
const debris = new Pool(new THREE.MeshStandardMaterial({ map: debrisTex, roughness: 0.95 }), 700);

