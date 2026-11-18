// The black hole that opens after every 10th stage: a spinning vortex with a dark core and a purple-blue glow.
// Flying into it warps the player to the next world.
import * as THREE from "three";

export function createPortal(scene) {
  const uni = { uT: { value: 0 }, uOpen: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uT; uniform float uOpen; varying vec2 vUv;
      void main(){
        float r = length(vUv); if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float swirl = sin(a * 5.0 + r * 14.0 - uT * 5.0) * 0.5 + 0.5;
        float swirl2 = sin(a * 9.0 - r * 22.0 - uT * 7.5) * 0.5 + 0.5;
        float ring = smoothstep(0.28, 0.42, r) * (1.0 - smoothstep(0.62, 1.0, r));
        vec3 glow = mix(vec3(0.45, 0.2, 1.0), vec3(0.25, 0.85, 1.0), swirl2);
        vec3 col = glow * (0.35 + swirl * 0.9) * ring * 1.6;
        float core = 1.0 - smoothstep(0.22, 0.34, r);            // the black centre swallows the light
        float edge = 1.0 - smoothstep(0.85, 1.0, r);
        float alpha = max(core, ring * (0.4 + swirl * 0.6)) * edge * uOpen;
        col = mix(col, vec3(0.0), core);
        col += vec3(0.9, 0.8, 1.0) * smoothstep(0.30, 0.34, r) * (1.0 - smoothstep(0.34, 0.40, r)) * 1.4;   // bright event-horizon rim
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  disc.renderOrder = 6;
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 64), new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const g = new THREE.Group();
  g.add(disc, halo);
  g.visible = false;
  scene.add(g);
  const P = {
    active: false, pos: g.position, radius: 110, t: 0,
    open(at) { g.position.copy(at); P.active = true; P.t = 0; g.visible = true; uni.uOpen.value = 0; },
    close() { P.active = false; g.visible = false; },
    update(dt, camera) {
      if (!g.visible) return;
      P.t += dt; uni.uT.value = P.t;
      uni.uOpen.value = Math.min(1, P.t / 1.2);
      const s = P.radius * (0.3 + 0.7 * Math.min(1, P.t / 1.2)) * (1 + Math.sin(P.t * 2.2) * 0.03);
      g.scale.setScalar(s);
      g.quaternion.copy(camera.quaternion);                    // always face the camera
      halo.rotation.z += dt * 0.6;
      halo.material.opacity = 0.25 + Math.sin(P.t * 3) * 0.1;
    },
  };
  return P;
}
