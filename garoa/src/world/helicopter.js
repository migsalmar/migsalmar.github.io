import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A private-security helicopter (Bandeira Segurança livery: black with a red band) flying
// an elongated patrol loop over the valley, sweeping a searchlight across the floor and
// façades. The light is a real SpotLight (shadowed on high quality); its visible beam is
// computed analytically in the fog pass.

// Loop clears the Bandeira shaft by ~12 m and front-row roofs (capped at 172 m) by ~7 m.
const PATH = { cx: 14, cz: -15, ax: 44, az: 165, y: 192, period: 78 };
const BEAM_ANGLE = 0.075;
const NEG_Z = new THREE.Vector3(0, 0, -1);

function rotorDiscMaterial(blades, tint) {
  return new THREE.ShaderMaterial({
    uniforms: { uAngle: { value: 0 }, uTint: { value: new THREE.Color(tint) } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAngle; uniform vec3 uTint; varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = atan(vP.y, vP.x) - uAngle;
        float b = pow(0.5 + 0.5 * cos(a * ${blades}.0), 18.0);
        float alpha = (0.05 + 0.32 * b) * smoothstep(1.0, 0.92, r) * smoothstep(0.05, 0.12, r);
        gl_FragColor = vec4(uTint, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function buildAirframe() {
  const g = new THREE.Group();
  // faint emissive stands in for the city's sodium glow lighting the belly from below
  const black = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.5, emissive: 0x2a1408, emissiveIntensity: 1.0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.05, metalness: 0.9 });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.06, 0.04).multiplyScalar(6) });

  // fuselage: stretched sphere + tail boom, nose toward -z
  const body = new THREE.SphereGeometry(1, 24, 16).scale(1.15, 1.25, 3.6);
  const boom = new THREE.CylinderGeometry(0.22, 0.42, 6.5, 10).rotateX(Math.PI / 2).translate(0, 0.35, 5.9);
  const fin = new THREE.BoxGeometry(0.12, 1.9, 1.3).translate(0, 1.1, 8.9);
  const stab = new THREE.BoxGeometry(2.4, 0.08, 0.7).translate(0, 0.45, 8.0);
  const mast = new THREE.CylinderGeometry(0.16, 0.22, 0.7, 8).translate(0, 1.45, -0.2);
  const skidL = new THREE.CylinderGeometry(0.06, 0.06, 4.8, 6).rotateX(Math.PI / 2).translate(-1.05, -1.65, -0.2);
  const skidR = skidL.clone().translate(2.1, 0, 0);
  const struts = [];
  for (const x of [-1, 1]) for (const z of [-1.4, 1.0]) struts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5).rotateZ(x * 0.35).translate(x * 0.85, -1.25, z));
  const hull = new THREE.Mesh(mergeGeometries([body, boom, fin, stab, mast, skidL, skidR, ...struts]), black);
  hull.castShadow = true;
  g.add(hull);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.05, 1.05, 1.7).rotateX(-Math.PI / 2.4).translate(0, 0.25, -2.0), glass);
  g.add(canopy);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.18, 24, 1, true).rotateX(Math.PI / 2).scale(1, 1.07, 1).translate(0, -0.15, 0.6), red);
  g.add(band);

  // rotors: blurred discs
  const main = new THREE.Mesh(new THREE.CircleGeometry(5.8, 48).rotateX(-Math.PI / 2), rotorDiscMaterial(4, 0x3a2a22));
  main.position.set(0, 1.85, -0.2);
  main.rotation.order = 'YXZ';
  g.add(main);
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24).rotateY(Math.PI / 2), rotorDiscMaterial(2, 0x1a1a1c));
  tail.position.set(0.2, 1.1, 9.0);
  g.add(tail);

  // lights: nav red (port) / green (starboard), white tail, red beacon, white strobes
  const dot = (c, s, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c) }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const navL = dot(0xff0000, 0.12, -1.2, -0.1, -0.6);
  navL.material.color.multiplyScalar(20);
  const navR = dot(0x00ff30, 0.12, 1.2, -0.1, -0.6);
  navR.material.color.multiplyScalar(20);
  const beacon = dot(0xff0000, 0.16, 0, 1.3, 0.8);
  const strobe = dot(0xffffff, 0.14, 0, -1.3, 1.8);
  // searchlight housing under the nose, aimed by the update loop
  const lamp = new THREE.Group();
  lamp.position.set(0, -1.15, -2.6);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(60), side: THREE.DoubleSide }));
  lens.position.z = -0.21;
  lens.rotation.y = Math.PI;
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.42, 16, 1, true).rotateX(Math.PI / 2), black);
  lamp.add(can, lens);
  g.add(lamp);
  return { group: g, main, tail, beacon, strobe, lamp };
}

export function createHelicopter(scene) {
  const air = buildAirframe();
  const root = new THREE.Group();
  root.name = 'helicopter';
  root.add(air.group);
  air.group.scale.setScalar(1.15);
  scene.add(root);

  const spot = new THREE.SpotLight(0xfff1dc, 2.4e5, 900, BEAM_ANGLE, 0.45, 2);
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 20;
  spot.shadow.camera.far = 800;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.6;
  scene.add(spot);
  scene.add(spot.target);

  const state = {
    pos: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    target: new THREE.Vector3(),
    angle: BEAM_ANGLE * 1.05,
  };
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');

  function pathAt(t, out) {
    const w = (2 * Math.PI) / PATH.period;
    const a = t * w;
    return out.set(PATH.cx + PATH.ax * Math.sin(a), PATH.y + 9 * Math.sin(t * 0.37) + 4 * Math.sin(t * 1.1), PATH.cz + PATH.az * Math.cos(a));
  }

  function update(t) {
    pathAt(t, root.position);
    pathAt(t + 0.5, tmp);
    fwd.subVectors(tmp, root.position);
    const speed = fwd.length() / 0.5;
    fwd.normalize();
    // heading, bank into the turn, nose down for forward flight
    pathAt(t + 1.0, tmp).sub(root.position).normalize();
    const turn = fwd.x * tmp.z - fwd.z * tmp.x;
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    e.set(-0.08 - speed * 0.002, yaw, THREE.MathUtils.clamp(-turn * 6, -0.35, 0.35));
    root.quaternion.setFromEuler(e);

    // searchlight sweep: along the valley floor, now and then climbing a façade
    const sweepZ = -30 + 120 * Math.sin(t * 0.11 + 0.6);
    const sweepX = 22 * Math.sin(t * 0.29);
    const climb = Math.max(0, Math.sin(t * 0.17 - 1.0));
    state.target.set(sweepX + Math.sign(sweepX) * climb * 12, climb * 60, sweepZ + 8 * Math.sin(t * 0.7));
    root.updateMatrixWorld(true);
    air.lamp.getWorldPosition(state.pos);
    state.dir.subVectors(state.target, state.pos).normalize();
    // aim the housing: world direction into the airframe's local space
    air.group.getWorldQuaternion(q);
    tmp.copy(state.dir).applyQuaternion(q.invert());
    air.lamp.quaternion.setFromUnitVectors(NEG_Z, tmp);

    spot.position.copy(state.pos);
    spot.target.position.copy(state.target);
    spot.target.updateMatrixWorld();

    air.main.material.uniforms.uAngle.value = t * 31.0;
    air.tail.material.uniforms.uAngle.value = t * 47.0;
    const beacon = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 6);
    air.beacon.material.color.setRGB(30 * beacon, 0.5 * beacon, 0);
    const strobe = (t * 1.1) % 1 < 0.05 ? 80 : 0;
    air.strobe.material.color.setRGB(strobe, strobe, strobe);
  }

  return {
    root,
    spot,
    state,
    update,
    pathAt,
    setShadows(on) {
      spot.castShadow = on;
    },
  };
}
