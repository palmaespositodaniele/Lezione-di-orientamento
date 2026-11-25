/* Il cielo notturno a 41° N: stelle vere intorno al polo (Orsa Maggiore, Orsa Minore, Cassiopea e poche brillanti),
   più un fondo di stelle deboli. Il cielo gira intorno alla Polare e lascia le scie, come in una foto a lunga posa.
   Coordinate approssimate (AR in ore, δ in gradi, magnitudine): bastano per il disegno, non per i calcoli. */
const Cielo = (() => {
  const LAT = 41 * Math.PI / 180, R = 6000;
  const STELLE = {
    Polare: [2.530, 89.26, 2.0], Dubhe: [11.062, 61.75, 1.8], Merak: [11.031, 56.38, 2.4], Phecda: [11.897, 53.69, 2.4],
    Megrez: [12.257, 57.03, 3.3], Alioth: [12.900, 55.96, 1.8], Mizar: [13.399, 54.93, 2.2], Alkaid: [13.792, 49.31, 1.9],
    Caph: [0.153, 59.15, 2.3], Schedar: [0.675, 56.54, 2.2], GammaCas: [0.945, 60.72, 2.4], Ruchbah: [1.430, 60.24, 2.7], Segin: [1.907, 63.67, 3.4],
    Kochab: [14.845, 74.16, 2.1], Pherkad: [15.345, 71.83, 3.0], Yildun: [17.537, 86.59, 4.4], EpsUMi: [16.766, 82.04, 4.2], ZetaUMi: [15.734, 77.79, 4.3], EtaUMi: [16.292, 75.76, 5.0],
    Capella: [5.278, 46.00, 0.1], Vega: [18.616, 38.78, 0.0], Deneb: [20.690, 45.28, 1.3], Arturo: [14.261, 19.18, 0.0],
    Mirfak: [3.405, 49.86, 1.8], Alpheratz: [0.140, 29.09, 2.1], Eltanin: [17.943, 51.49, 2.2], Thuban: [14.073, 64.38, 3.7],
  };
  const FIGURE = [
    ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
    ['Caph', 'Schedar'], ['Schedar', 'GammaCas'], ['GammaCas', 'Ruchbah'], ['Ruchbah', 'Segin'],
    ['Polare', 'Yildun'], ['Yildun', 'EpsUMi'], ['EpsUMi', 'ZetaUMi'], ['ZetaUMi', 'Kochab'], ['Kochab', 'Pherkad'], ['Pherkad', 'EtaUMi'], ['EtaUMi', 'ZetaUMi'],
  ];

  // vettore nella cornice equatoriale del gruppo (asse +Y = polo celeste), a LST = 0
  function vettore(ar, dec, r) {
    const a = ar / 12 * Math.PI, d = dec * Math.PI / 180;
    return new THREE.Vector3(Math.cos(d) * Math.sin(a), Math.sin(d), Math.cos(d) * Math.cos(a)).multiplyScalar(r || R);
  }

  const esterno = new THREE.Group(); esterno.rotation.x = -(Math.PI / 2 - LAT);
  const rotante = new THREE.Group(); esterno.add(rotante);
  Mondo.scena.add(esterno);

  const U = { uOpac: { value: 0 }, uScia: { value: 0 }, uScala: { value: 1 }, uT: Mondo.U.uT, uFigure: { value: 0 } };

  /* ---------- stelle ---------- */
  const pos = [], dim = [], col = [], fase = [];
  const nomi = Object.keys(STELLE);
  for (const n of nomi) {
    const [ar, dec, mag] = STELLE[n]; const v = vettore(ar, dec);
    pos.push(v.x, v.y, v.z); dim.push(Math.max(6, 24 - mag * 4.6)); fase.push(Math.random() * 6.28);
    const c = new THREE.Color(n === 'Arturo' || n === 'Kochab' || n === 'Schedar' ? '#ffd3a1' : n === 'Vega' || n === 'Deneb' ? '#cfe0ff' : '#fff6e8');
    col.push(c.r, c.g, c.b);
  }
  // fondo di stelle deboli, distribuite in modo uniforme (non sono stelle vere)
  for (let i = 0; i < 2600; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.push(s * Math.cos(a) * R, u * R, s * Math.sin(a) * R);
    const m = Math.pow(Math.random(), 3); dim.push(1.6 + m * 5); fase.push(Math.random() * 6.28);
    const c = new THREE.Color().setHSL(0.58 + Math.random() * 0.1, 0.3, 0.75 + Math.random() * 0.2); col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('dim', new THREE.Float32BufferAttribute(dim, 1));
  geo.setAttribute('colore', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('fase', new THREE.Float32BufferAttribute(fase, 1));
  const stelle = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float dim, fase; attribute vec3 colore; uniform float uScala, uT; varying vec3 vC; varying float vA;
      void main(){ vC = colore; vA = 0.75 + 0.25 * sin(uT * 2.3 + fase * 7.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = dim * uScala; }`,
    fragmentShader: `uniform float uOpac; varying vec3 vC; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d); a = a * a * (0.6 + 0.4 * smoothstep(0.18, 0.0, d) * 2.0);
        gl_FragColor = vec4(vC * vA, a * uOpac); }`,
  }));
  stelle.frustumCulled = false; stelle.renderOrder = -5;
  rotante.add(stelle);

  /* ---------- scie ---------- */
  const PASSI = 120, sp = [], ss = [], sa = [];
  const _q = new THREE.Vector3();
  // scie per le stelle con nome e per 500 stelle del fondo
  const sorgenti = nomi.map((n) => { const [ar, dec, mag] = STELLE[n]; return [vettore(ar, dec), mag]; });
  for (let i = 0; i < 500; i++) { const k = (nomi.length + i) * 3; sorgenti.push([new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]), 3.6]); }
  sorgenti.forEach(([v, mag]) => {
    for (let k = 0; k < PASSI; k++) {
      for (const kk of [k, k + 1]) {
        const s = kk / PASSI * Math.PI * 2; // ruota v intorno a Y di +s: posizione nel passato
        _q.set(v.x * Math.cos(s) + v.z * Math.sin(s), v.y, -v.x * Math.sin(s) + v.z * Math.cos(s));
        sp.push(_q.x, _q.y, _q.z); ss.push(s); sa.push(Math.max(0.25, 1.1 - mag * 0.22));
      }
    }
  });
  const geoS = new THREE.BufferGeometry();
  geoS.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  geoS.setAttribute('s', new THREE.Float32BufferAttribute(ss, 1));
  geoS.setAttribute('luce', new THREE.Float32BufferAttribute(sa, 1));
  const scie = new THREE.LineSegments(geoS, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float s, luce; varying float vS, vL; void main(){ vS = s; vL = luce; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uScia, uOpac; varying float vS, vL;
      void main(){ if (vS > uScia) discard; float a = (1.0 - vS / max(uScia, 0.001)) * 0.85 + 0.15; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a * vL * uOpac); }`,
  }));
  scie.frustumCulled = false; scie.renderOrder = -6;
  rotante.add(scie);

  /* ---------- figure e allineamento Merak → Dubhe → Polare ---------- */
  const fp = [];
  for (const [a, b] of FIGURE) { const va = vettore(STELLE[a][0], STELLE[a][1], R * 0.999), vb = vettore(STELLE[b][0], STELLE[b][1], R * 0.999); fp.push(va.x, va.y, va.z, vb.x, vb.y, vb.z); }
  const geoF = new THREE.BufferGeometry(); geoF.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  const matF = new THREE.LineBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const figure = new THREE.LineSegments(geoF, matF); figure.frustumCulled = false; rotante.add(figure);
  // guida: da Merak attraverso Dubhe fino alla Polare, in tratti
  const gp = [], vM = vettore(...STELLE.Merak.slice(0, 2)), vP = vettore(...STELLE.Polare.slice(0, 2));
  for (let i = 0; i < 40; i += 2) {
    const a = new THREE.Vector3().lerpVectors(vM, vP, i / 40).setLength(R * 0.999), b = new THREE.Vector3().lerpVectors(vM, vP, (i + 1) / 40).setLength(R * 0.999);
    gp.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geoG = new THREE.BufferGeometry(); geoG.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  const matG = new THREE.LineBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const guida = new THREE.LineSegments(geoG, matG); guida.frustumCulled = false; rotante.add(guida);

  /* ---------- anello d'oro sulla Polare ---------- */
  function texturaAnello() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = '#E3C878'; x.lineWidth = 7; x.shadowColor = '#E3C878'; x.shadowBlur = 14; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const anello = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaAnello(), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  anello.position.copy(vettore(...STELLE.Polare.slice(0, 2), R * 0.98)); anello.scale.set(420, 420, 1); rotante.add(anello);

  /* ---------- arco della latitudine: dall'orizzonte Nord alla Polare ---------- */
  const punti = [];
  for (let i = 0; i <= 48; i++) { const a = i / 48 * LAT; punti.push(new THREE.Vector3(0, Math.sin(a) * R * 0.97, -Math.cos(a) * R * 0.97)); }
  const curva = new THREE.CatmullRomCurve3(punti);
  const arco = new THREE.Mesh(new THREE.TubeGeometry(curva, 96, 14, 8), new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.95, fog: false, toneMapped: false, depthWrite: false }));
  arco.geometry.setDrawRange(0, 0); arco.frustumCulled = false; arco.renderOrder = 3;
  const gruppoArco = new THREE.Group(); gruppoArco.add(arco); Mondo.scena.add(gruppoArco);

  /* ---------- tempo siderale ---------- */
  let lst = 0, inizioScia = 0, velocita = 0;
  Mondo.ogniFrame.add((dt) => {
    const o = Mondo.occhio(); esterno.position.copy(o); gruppoArco.position.copy(o);
    lst += velocita * dt;
    rotante.rotation.y = -lst;
    U.uScia.value = Math.min(Math.PI * 2, Math.max(0, lst - inizioScia));
    U.uScala.value = Math.max(1, window.innerHeight / 900) * Mondo.renderer.getPixelRatio();
    esterno.visible = U.uOpac.value > 0.005;
    const k = 0.5 + 0.5 * Math.sin(Mondo.tempo * 3);
    anello.scale.setScalar(380 + k * 120);
  });

  function posPolare() { return anello.getWorldPosition(new THREE.Vector3()); }
  function posStella(n) { const v = vettore(STELLE[n][0], STELLE[n][1]); return rotante.localToWorld(v); }

  return {
    U, STELLE, LAT_GRADI: 41, figure: matF, guida: matG, anello: anello.material, arco,
    set lst(v) { lst = v; }, get lst() { return lst; },
    set velocita(v) { velocita = v; }, get velocita() { return velocita; },
    avviaScia() { inizioScia = lst; }, spegniScia() { inizioScia = lst + 1e6; },
    posPolare, posStella, nomi,
    disegnaArco(k) { arco.geometry.setDrawRange(0, Math.floor(k * 96) * 8 * 6); },
  };
})();
