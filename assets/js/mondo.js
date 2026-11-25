/* Il mondo: renderer, cielo, mare, nuvole, pioggia, luce e atmosfere che sfumano l'una nell'altra.
   Unità: metri. Il mare e il cielo seguono la camera, così l'orizzonte non finisce mai. */
const Mondo = (() => {
  const tela = document.getElementById('scena');
  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  if (renderer.xr.setFoveation) renderer.xr.setFoveation(1);

  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 30000);
  camera.position.set(0, 40, 200);
  // il «rig» porta la camera: su schermo resta fermo nell'origine, nel visore è il punto dove stanno i piedi
  const rig = new THREE.Group(); rig.name = 'rig'; rig.add(camera); scena.add(rig);
  let modo = 'schermo'; // 'schermo' | 'vr' (visore) | 'prova' (la VR simulata sullo schermo)
  const guardaVerso = new THREE.Vector3(0, 0, 0);

  /* ---------- onde: le stesse in JavaScript e nello shader ---------- */
  const ONDE = [ // direzione x, z, numero d'onda k, ampiezza, pulsazione = sqrt(g k)
    [0.96, 0.28, 0.07, 0.62], [0.55, -0.83, 0.11, 0.38], [0.20, 0.98, 0.19, 0.22], [-0.70, 0.71, 0.33, 0.11],
  ].map(([x, z, k, a]) => { const l = Math.hypot(x, z); return { x: x / l, z: z / l, k, a, w: Math.sqrt(9.81 * k) }; });

  const U = { // uniform condivise
    uT: { value: 0 }, uAmp: { value: 1 },
    uZen: { value: new THREE.Color('#0b2545') }, uOr: { value: new THREE.Color('#13315c') }, uSotto: { value: new THREE.Color('#061427') },
    uSoleDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() }, uSoleCol: { value: new THREE.Color('#ffb070') }, uSole: { value: 0 },
    uProfondo: { value: new THREE.Color('#06223d') }, uSuperficie: { value: new THREE.Color('#1c5a86') },
    uNebbia: { value: new THREE.Color('#13315c') }, uNebbiaVicino: { value: 400 }, uNebbiaLontano: { value: 5000 }, uSchiuma: { value: 0.4 }, uVetro: { value: 0 }, uAcqua: { value: new THREE.Color('#1f6f86') },
  };

  function altezza(x, z, t) {
    let h = 0;
    for (const o of ONDE) h += o.a * Math.sin((o.x * x + o.z * z) * o.k + t * o.w);
    return h * U.uAmp.value;
  }

  const glslOnde = ONDE.map((o, i) => `const vec4 O${i} = vec4(${o.x.toFixed(4)}, ${o.z.toFixed(4)}, ${o.k.toFixed(4)}, ${o.a.toFixed(4)}); const float W${i} = ${o.w.toFixed(4)};`).join('\n');
  const glslSomma = (corpo) => ONDE.map((o, i) => corpo(i)).join('\n');

  /* ---------- cielo ---------- */
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uZen, uOr, uSotto, uSoleDir, uSoleCol; uniform float uSole; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(uOr, uZen, pow(h, 0.42)) : mix(uOr, uSotto, min(-h * 5.0, 1.0));
        float s = max(dot(d, uSoleDir), 0.0);
        c += uSoleCol * (pow(s, 1400.0) * 14.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.28 * (1.0 - abs(h))) * uSole;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  cielo.renderOrder = -10;
  scena.add(cielo);

  /* ---------- mare: griglia polare fitta vicino e rada lontano ---------- */
  function grigliaPolare(nA, nR, r0, base) {
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let i = 0; i < nR; i++) {
      const r = r0 * Math.pow(base, i);
      for (let j = 0; j < nA; j++) { const a = j / nA * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    }
    for (let j = 0; j < nA; j++) idx.push(0, 1 + (j + 1) % nA, 1 + j);
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < nA; j++) {
      const a = 1 + i * nA + j, b = 1 + i * nA + (j + 1) % nA, c = a + nA, d = b + nA;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  }
  const mare = new THREE.Mesh(grigliaPolare(160, 132, 1.5, 1.075), new THREE.ShaderMaterial({
    uniforms: U, fog: false, side: THREE.DoubleSide,
    vertexShader: `${glslOnde}
      uniform float uT, uAmp; varying vec3 vW; varying float vH;
      void main(){ vec3 p = (modelMatrix * vec4(position, 1.0)).xyz; float h = 0.0;
        ${glslSomma((i) => `h += O${i}.w * sin(dot(O${i}.xy, p.xz) * O${i}.z + uT * W${i});`)}
        float lontano = length(position.xz);
        h *= uAmp * (1.0 - smoothstep(250.0, 1400.0, lontano));
        p.y += h; vW = p; vH = h; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `${glslOnde}
      uniform float uT, uAmp, uSole, uNebbiaVicino, uNebbiaLontano, uSchiuma, uVetro;
      uniform vec3 uZen, uOr, uSoleDir, uSoleCol, uProfondo, uSuperficie, uNebbia, uAcqua; varying vec3 vW; varying float vH;
      void main(){ vec2 p = vW.xz; vec2 g = vec2(0.0); float t = uT;
        ${glslSomma((i) => `g += O${i}.w * O${i}.z * O${i}.xy * cos(dot(O${i}.xy, p) * O${i}.z + t * W${i});`)}
        g *= uAmp;
        // increspature fini, solo nella luce
        float dist = length(cameraPosition - vW);
        float vicino = 1.0 - smoothstep(60.0, 420.0, dist); // increspature solo vicino: lontano farebbero un reticolo
        vec2 d1 = vec2(0.83, 0.56), d2 = vec2(-0.37, 0.93), d3 = vec2(0.98, -0.21);
        g += vicino * uAmp * (0.05 * d1 * cos(dot(p, d1) * 0.93 + t * 3.0) + 0.04 * d2 * cos(dot(p, d2) * 1.37 + t * 3.6) + 0.03 * d3 * cos(dot(p, d3) * 1.91 + t * 4.3));
        g *= 1.0 - smoothstep(600.0, 4000.0, dist) * 0.8;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) { // la superficie vista da sott'acqua
          float lu = pow(max(dot(N, -V), 0.0), 3.0);
          vec3 s = mix(uAcqua * 1.8, vec3(0.85, 0.97, 1.0), lu * 0.7);
          s = mix(s, uNebbia, smoothstep(uNebbiaVicino, uNebbiaLontano, dist));
          gl_FragColor = vec4(s, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 cielo = mix(uOr, uZen, pow(R.y, 0.42));
        vec3 base = mix(uProfondo, uSuperficie, clamp(vH * 0.35 + 0.45, 0.0, 1.0));
        vec3 c = mix(base, cielo, fres * 0.9);
        float s = max(dot(R, uSoleDir), 0.0);
        c += uSoleCol * (pow(s, 380.0) * 6.0 + pow(s, 30.0) * 0.25) * uSole;
        float cresta = smoothstep(0.9, 1.35, vH / max(uAmp, 0.01)) * uSchiuma;
        c = mix(c, vec3(0.85, 0.9, 0.95), cresta * 0.4);
        c = mix(c, uNebbia, smoothstep(uNebbiaVicino, uNebbiaLontano, dist));
        // acqua di vetro: si vede la carena sotto il galleggiamento (tappa della falla)
        gl_FragColor = vec4(c, 1.0 - uVetro * 0.72 * (1.0 - smoothstep(150.0, 700.0, dist)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  mare.frustumCulled = false; mare.renderOrder = -1;
  scena.add(mare);

  /* ---------- luci (solo per gli oggetti: nave, boe, container) ---------- */
  const emi = new THREE.HemisphereLight('#bcd8ee', '#0b2545', 0.9);
  const sole = new THREE.DirectionalLight('#fff1d6', 1.6);
  sole.position.set(-300, 400, -500);
  const riempi = new THREE.DirectionalLight('#ffffff', 0.55); riempi.position.set(-200, 300, 600);
  scena.add(emi, sole, sole.target, riempi);
  const nebbiaScena = new THREE.Fog('#13315c', 400, 5000);
  scena.fog = nebbiaScena;

  /* ---------- nuvole ---------- */
  function texturaNuvola() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    for (let i = 0; i < 46; i++) {
      const px = 30 + Math.random() * 196, py = 40 + Math.random() * 60 - Math.abs(px - 128) * 0.15, r = 14 + Math.random() * 34;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const nuvole = new THREE.Group(); scena.add(nuvole);
  const tN = [texturaNuvola(), texturaNuvola(), texturaNuvola()];
  const matNuvole = [];
  for (let i = 0; i < 54; i++) {
    const m = new THREE.SpriteMaterial({ map: tN[i % 3], transparent: true, depthWrite: false, fog: false, color: '#ffffff', opacity: 0.8 });
    matNuvole.push(m);
    const s = new THREE.Sprite(m);
    const a = Math.random() * Math.PI * 2, r = 2500 + Math.random() * 4500;
    s.position.set(Math.cos(a) * r, 250 + Math.random() * 900, Math.sin(a) * r);
    const sc = 1400 + Math.random() * 2400; s.scale.set(sc, sc * 0.42, 1);
    nuvole.add(s);
  }

  /* ---------- pioggia ---------- */
  const NG = 2600, gocce = new Float32Array(NG * 6);
  for (let i = 0; i < NG; i++) { const x = (Math.random() - 0.5) * 260, y = Math.random() * 140, z = (Math.random() - 0.5) * 260;
    gocce.set([x, y, z, x + 0.6, y + 3.2, z], i * 6); }
  const geoP = new THREE.BufferGeometry(); geoP.setAttribute('position', new THREE.BufferAttribute(gocce, 3));
  const matP = new THREE.LineBasicMaterial({ color: '#c7d6e6', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pioggia = new THREE.LineSegments(geoP, matP); pioggia.frustumCulled = false; scena.add(pioggia);

  /* ---------- atmosfere ---------- */
  const ATMOSFERE = {
    notte:    { zen: '#01040b', or: '#0b1d38', sotto: '#020812', sole: [0, -0.2, -1], soleCol: '#8fb0ff', forza: 0.0, prof: '#010a16', sup: '#0a2a4a', nebbia: '#0b1d38', vicino: 800, lontano: 9000, amp: 0.8, schiuma: 0.15, emi: ['#5a78a8', '#020812', 0.35], luce: ['#9fb6ff', 0.35], nuvole: ['#3a4a66', 0.0], pioggia: 0, esp: 1.0 },
    alba:     { zen: '#1f3d72', or: '#f2a46a', sotto: '#2a2b3e', sole: [0.75, 0.06, -0.65], soleCol: '#ffae66', forza: 1.0, prof: '#0a2440', sup: '#2a5a80', nebbia: '#c99278', vicino: 900, lontano: 9000, amp: 0.9, schiuma: 0.3, emi: ['#ffc9a0', '#1b2a44', 0.8], luce: ['#ffb27a', 1.7], nuvole: ['#ffb995', 0.85], pioggia: 0, esp: 1.0 },
    giorno:   { zen: '#2a64ad', or: '#bcd6ec', sotto: '#1d4466', sole: [-0.45, 0.62, -0.65], soleCol: '#fff4dc', forza: 0.85, prof: '#05304f', sup: '#1d6c9c', nebbia: '#bcd6ec', vicino: 1200, lontano: 11000, amp: 1.0, schiuma: 0.45, emi: ['#cfe4f6', '#164064', 1.0], luce: ['#fff2dc', 1.9], nuvole: ['#ffffff', 0.9], pioggia: 0, esp: 0.95 },
    tempesta: { zen: '#252d38', or: '#5d6873', sotto: '#1a2028', sole: [0.3, 0.4, -1], soleCol: '#aab4bf', forza: 0.05, prof: '#0b1a24', sup: '#2c4552', nebbia: '#4f5a65', vicino: 120, lontano: 1500, amp: 2.4, schiuma: 1.0, emi: ['#8996a3', '#1a2028', 0.75], luce: ['#b7c1cc', 0.6], nuvole: ['#4a535d', 0.95], pioggia: 0.55, esp: 1.0 },
    satellite:{ zen: '#0a1a33', or: '#6f8fb0', sotto: '#1a2028', sole: [-0.4, 0.7, -0.6], soleCol: '#ffffff', forza: 0.08, prof: '#06263f', sup: '#123f63', nebbia: '#6f8fb0', vicino: 9000, lontano: 26000, amp: 0.7, schiuma: 0.0, emi: ['#cfe4f6', '#164064', 1.0], luce: ['#ffffff', 1.6], nuvole: ['#9aa6b2', 0.0], pioggia: 0, esp: 1.0 },
    sottacqua:{ zen: '#0d4a5c', or: '#1f6f86', sotto: '#062a36', sole: [0.3, 0.8, -0.4], soleCol: '#bdf2ff', forza: 0.0, prof: '#062a36', sup: '#1f6f86', nebbia: '#0e4f63', vicino: 2, lontano: 80, amp: 0.8, schiuma: 0.0, emi: ['#8fd6e8', '#06303c', 1.1], luce: ['#bdf2ff', 0.8], nuvole: ['#ffffff', 0.0], pioggia: 0, esp: 1.0 },
    pomeriggio:{ zen: '#2f5f9e', or: '#e9d2a8', sotto: '#2a3c55', sole: [0.53, 0.53, -0.66], soleCol: '#fff0cf', forza: 1.0, prof: '#06304f', sup: '#2a6c96', nebbia: '#d9c7a4', vicino: 1200, lontano: 11000, amp: 0.9, schiuma: 0.35, emi: ['#ffe8c8', '#18385c', 1.0], luce: ['#fff0d6', 1.9], nuvole: ['#fff0dc', 0.75], pioggia: 0, esp: 0.95 },
    aurora:   { zen: '#2c4f8a', or: '#ffc07a', sotto: '#3a3040', sole: [1, 0.08, -0.3], soleCol: '#ffc27a', forza: 1.2, prof: '#0b2a48', sup: '#376a90', nebbia: '#e3a983', vicino: 1100, lontano: 10000, amp: 0.8, schiuma: 0.25, emi: ['#ffd2a8', '#1b2a44', 0.9], luce: ['#ffc48a', 1.9], nuvole: ['#ffc4a0', 0.8], pioggia: 0, esp: 1.05 },
  };
  let atmosfera = null; // valori numerici correnti
  let conCamere = false; // camere del visore accese (vedi camere())
  function leggi(a) {
    return {
      zen: new THREE.Color(a.zen), or: new THREE.Color(a.or), sotto: new THREE.Color(a.sotto), sole: new THREE.Vector3(...a.sole).normalize(),
      soleCol: new THREE.Color(a.soleCol), forza: a.forza, prof: new THREE.Color(a.prof), sup: new THREE.Color(a.sup), nebbia: new THREE.Color(a.nebbia),
      vicino: a.vicino, lontano: a.lontano, amp: a.amp, schiuma: a.schiuma,
      emiC: new THREE.Color(a.emi[0]), emiT: new THREE.Color(a.emi[1]), emiI: a.emi[2], luceC: new THREE.Color(a.luce[0]), luceI: a.luce[1],
      nuvC: new THREE.Color(a.nuvole[0]), nuvO: a.nuvole[1], pioggia: a.pioggia, esp: a.esp,
    };
  }
  function applica(v) {
    U.uZen.value.copy(v.zen); U.uOr.value.copy(v.or); U.uSotto.value.copy(v.sotto); U.uSoleDir.value.copy(v.sole);
    U.uSoleCol.value.copy(v.soleCol); U.uSole.value = v.forza; U.uProfondo.value.copy(v.prof); U.uSuperficie.value.copy(v.sup);
    U.uNebbia.value.copy(v.nebbia); U.uNebbiaVicino.value = v.vicino; U.uNebbiaLontano.value = v.lontano; U.uAmp.value = v.amp; U.uSchiuma.value = v.schiuma;
    const fg = scena.fog || nebbiaScena; fg.color.copy(v.nebbia); fg.near = v.vicino * 0.6; fg.far = v.lontano;
    emi.color.copy(v.emiC); emi.groundColor.copy(v.emiT); emi.intensity = v.emiI; riempi.intensity = 0.25 + v.emiI * 0.45; riempi.color.copy(v.emiC); sole.color.copy(v.luceC); sole.intensity = v.luceI;
    sole.position.copy(v.sole).multiplyScalar(800).add(sole.target.position);
    for (const m of matNuvole) { m.color.copy(v.nuvC); m.opacity = v.nuvO; }
    nuvole.visible = v.nuvO > 0.01;
    if (conCamere) nuvole.visible = false;
    matP.opacity = v.pioggia; pioggia.visible = v.pioggia > 0.01;
    renderer.toneMappingExposure = v.esp;
  }
  function mescola(a, b, t) {
    const o = {};
    for (const k in a) {
      if (a[k].isColor) o[k] = a[k].clone().lerp(b[k], t);
      else if (a[k].isVector3) o[k] = a[k].clone().lerp(b[k], t).normalize();
      else o[k] = a[k] + (b[k] - a[k]) * t;
    }
    return o;
  }
  function cambiaAtmosfera(nome, durata) {
    const meta = leggi(ATMOSFERE[nome]);
    if (!atmosfera || !durata) { atmosfera = meta; applica(meta); return Promise.resolve(); }
    const da = atmosfera;
    return anima(durata, (t) => { atmosfera = mescola(da, meta, t); applica(atmosfera); }, dolce);
  }

  /* ---------- animazioni ---------- */
  const dolce = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const esce = (t) => 1 - Math.pow(1 - t, 3);
  const animazioni = new Set();
  function anima(durata, fn, curva) {
    return new Promise((ok) => { animazioni.add({ t0: performance.now(), d: durata * 1000, fn, curva: curva || dolce, ok }); });
  }
  function fermaAnimazioni() { for (const a of animazioni) a.ok(); animazioni.clear(); }

  /* volo di camera: da dove si trova a una nuova posizione, guardando verso un punto.
     «arco» solleva il percorso a metà strada, per un movimento più cinematografico */
  function vola(pos, verso, durata, arco) {
    const p0 = camera.position.clone(), g0 = guardaVerso.clone();
    const p1 = new THREE.Vector3(...pos), g1 = new THREE.Vector3(...verso);
    camera.userData.libera = true;
    return anima(durata, (t) => {
      camera.position.lerpVectors(p0, p1, t); camera.position.y += Math.sin(t * Math.PI) * (arco || 0);
      guardaVerso.lerpVectors(g0, g1, t);
    });
  }
  function inquadra(pos, verso) { camera.position.set(...pos); guardaVerso.set(...verso); }

  /* ---------- ciclo ---------- */
  const ogniFrame = new Set();
  let t = 0, ultimo = performance.now(), passoMax = 0.05; // passo massimo per fotogramma (si alza solo per le prove su schermi lenti)
  function ridimensiona() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 1 ? 70 : 55; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', ridimensiona); ridimensiona();

  const _occ = new THREE.Vector3();
  function occhio() { // posizione degli occhi nel mondo, anche nel visore
    if (renderer.xr.isPresenting) return renderer.xr.getCamera().getWorldPosition(_occ);
    return camera.getWorldPosition(_occ);
  }
  function ciclo(ora) {
    const dt = Math.min((ora - ultimo) / 1000, passoMax); ultimo = ora; t += dt; U.uT.value = t;
    for (const a of [...animazioni]) {
      const k = Math.min((ora - a.t0) / a.d, 1); a.fn(a.curva(k));
      if (k >= 1) { animazioni.delete(a); a.ok(); }
    }
    for (const f of ogniFrame) { try { f(dt, t); } catch (e) { console.error(e); ogniFrame.delete(f); } }
    if (modo === 'schermo') camera.lookAt(guardaVerso);
    const o = occhio();
    cielo.position.copy(o);
    mare.position.set(o.x, 0, o.z);
    nuvole.position.set(o.x * 0.9, 0, o.z * 0.9);
    // la pioggia cade intorno alla camera
    if (pioggia.visible) {
      const a = geoP.attributes.position.array, cx = o.x, cz = o.z;
      for (let i = 0; i < NG; i++) {
        const o = i * 6; let y = a[o + 1] - dt * 70;
        if (y < 0) { y += 140; a[o] = cx + (Math.random() - 0.5) * 260; a[o + 2] = cz + (Math.random() - 0.5) * 260; }
        a[o + 1] = y; a[o + 3] = a[o] + 0.9; a[o + 4] = y + 3.6; a[o + 5] = a[o + 2];
      }
      geoP.attributes.position.needsUpdate = true;
    }
    renderer.render(scena, camera);
  }
  cambiaAtmosfera('notte');
  renderer.setAnimationLoop(ciclo);

  /* da 3D a coordinate di schermo, per le etichette HTML */
  const _v = new THREE.Vector3();
  function aSchermo(p) {
    _v.copy(p).project(camera);
    return { x: (_v.x + 1) / 2 * window.innerWidth, y: (1 - _v.y) / 2 * window.innerHeight, davanti: _v.z < 1 };
  }

  // camere del visore (realtà mista): cielo, nuvole, mare e nebbia spariscono e dietro la scena si vede la stanza vera
  function camere(si) {
    conCamere = !!si;
    cielo.visible = !si; mare.visible = !si; nuvole.visible = !si && matNuvole[0].opacity > 0.01;
    scena.fog = si ? null : nebbiaScena;
    renderer.setClearColor(0x000000, si ? 0 : 1);
  }

  // nel visore: meno nuvole (sono grandi e trasparenti, si disegnano una sull'altra) e niente gocce lontane
  function leggero(si) {
    nuvole.children.forEach((s, i) => { s.visible = !si || i % 3 === 0; });
    geoP.setDrawRange(0, si ? NG * 2 * 0.5 : NG * 2);
  }

  // acqua trasparente vicino alla nave (0 = normale, 1 = di vetro)
  function vetro(k) {
    U.uVetro.value = k; const v = k > 0;
    if (mare.material.transparent !== v) { mare.material.transparent = v; mare.material.depthWrite = !v; mare.material.needsUpdate = true; }
  }
  return { vetro, camere, leggero, get conCamere() { return conCamere; }, set passoMax(v) { passoMax = v; }, renderer, scena, camera, rig, occhio, guardaVerso,
    get modo() { return modo; }, set modo(v) { modo = v; }, get immersivo() { return modo !== 'schermo'; }, U, altezza, cambiaAtmosfera, anima, fermaAnimazioni, vola, inquadra, ogniFrame, aSchermo, dolce, esce,
    get tempo() { return t; }, sole };
})();
