/* ------------------------------------------------------------------ shared helpers for disasters */
function pickDown(x, z) {
  raycaster.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
  const meshes = BLOCK_POOLS.map((p) => p.mesh);
  for (const m of meshes) m.boundingSphere = null;
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length ? hits[0].point : new THREE.Vector3(x, 0, z);
}
const dynItems = () => allBlocks().concat(debris.items, props);

