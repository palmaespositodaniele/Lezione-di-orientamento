/* La nave: portacontainer dipinta come nei libri 3D (carena rossa, bagnasciuga nero, murate blu, coperta verde,
   sovrastrutture bianche). Misure solo grafiche: disegno schematico, nessuna compare come dato. */
const Nave = (() => {
  const L = 130, B = 21, D = 11;        // lunghezza, larghezza, altezza al ponte (grafiche)
  const T_VUOTA = 3.6, T_MARCA = 7.7;   // immersione a nave vuota e alla marca (grafiche)

  const esterno = new THREE.Group();    // posizione e prora
  const corpo = new THREE.Group();      // sussulto, rollio, beccheggio
  esterno.add(corpo);
  Mondo.scena.add(esterno);

  /* ---------- tinte ---------- */
  function bande() { // tessitura verticale: rosso sotto la linea a vuoto, nero fino alla marca, blu sopra
    const c = document.createElement('canvas'); c.width = 4; c.height = 512; const x = c.getContext('2d');
    const H = D + 3.2, y = (m) => 512 - m / H * 512;
    x.fillStyle = '#2d5c9e'; x.fillRect(0, 0, 4, 512);
    x.fillStyle = '#16181c'; x.fillRect(0, y(T_MARCA + 0.05), 4, y(T_VUOTA) - y(T_MARCA + 0.05));
    x.fillStyle = '#9b2b22'; x.fillRect(0, y(T_VUOTA), 4, 512 - y(T_VUOTA));
    x.fillStyle = '#e8e6df'; x.fillRect(0, y(D + 0.15), 4, 3);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
    return { t, H };
  }

  /* ---------- scafo ---------- */
  function mezzaLarghezza(u, yn) { // u da −1 (poppa) a +1 (prua), yn da 0 (chiglia) a 1 (ponte)
    let f = 1;
    if (u > 0.3) { const s = (u - 0.3) / 0.7; f = Math.max(0.012, 1 - Math.pow(s, 1.5 + 1.6 * yn)); }
    if (u < -0.62) { const s = (-0.62 - u) / 0.38; f = 1 - s * s * (1 - (0.12 + 0.68 * yn)); }
    return B / 2 * f;
  }
  function chiglia(u) { return u > 0.82 ? Math.pow((u - 0.82) / 0.18, 2) * 4.5 : (u < -0.8 ? Math.pow((-0.8 - u) / 0.2, 2) * 6 : 0); } // a poppa lo scafo si alza: lì stanno elica e timone
  function cavallino(u) { return u > 0.5 ? Math.pow((u - 0.5) / 0.5, 2) * 2.6 : 0; }

  function scafo() {
    const NS = 64, NL = 18, { t, H } = bande();
    const pos = [], uv = [], idx = [];
    const anelli = [];
    for (let i = 0; i <= NS; i++) {
      const u = -1 + 2 * i / NS, x = u * L / 2, yk = chiglia(u), yt = D + cavallino(u);
      const anello = [];
      for (let k = 0; k <= NL; k++) {
        const s = k / NL, y = yk + (yt - yk) * Math.pow(s, 1.35), yn = (y - yk) / (yt - yk || 1);
        const hb = mezzaLarghezza(u, yn), r = Math.min(2.4, hb * 0.9), yy = y - yk;
        const z = yy < r ? (hb - r) + r * Math.sqrt(Math.max(0, 1 - Math.pow(1 - yy / r, 2))) : hb;
        anello.push([x, y, z]);
      }
      anelli.push(anello);
    }
    // due murate
    for (const lato of [1, -1]) {
      const base = pos.length / 3;
      for (const an of anelli) { pos.push(an[0][0], an[0][1], 0); uv.push(0.5, an[0][1] / H); for (const p of an) { pos.push(p[0], p[1], p[2] * lato); uv.push(0.5, p[1] / H); } }
      const n = NL + 2;
      for (let i = 0; i < NS; i++) for (let k = 0; k < n - 1; k++) {
        const a = base + i * n + k, b = a + 1, c = a + n, d = c + 1;
        if (lato > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
    // specchio di poppa
    {
      const an = anelli[0], base = pos.length / 3;
      for (const p of an) { pos.push(p[0], p[1], p[2]); uv.push(0.5, p[1] / H); pos.push(p[0], p[1], -p[2]); uv.push(0.5, p[1] / H); }
      for (let k = 0; k < NL; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    m.name = 'scafo';
    // coperta
    const forma = new THREE.Shape();
    anelli.forEach((an, i) => { const p = an[NL]; if (i === 0) forma.moveTo(p[0], p[2]); else forma.lineTo(p[0], p[2]); });
    for (let i = anelli.length - 1; i >= 0; i--) { const p = anelli[i][NL]; forma.lineTo(p[0], -p[2]); }
    const gc = new THREE.ShapeGeometry(forma, 1); gc.rotateX(Math.PI / 2);
    const pc = gc.attributes.position;
    for (let i = 0; i < pc.count; i++) { const u = pc.getX(i) / (L / 2); pc.setY(i, D + cavallino(u) - 0.05); }
    gc.computeVertexNormals();
    const coperta = new THREE.Mesh(gc, new THREE.MeshLambertMaterial({ color: '#3d6b45', side: THREE.DoubleSide }));
    return [m, coperta];
  }

  /* ---------- sovrastrutture ---------- */
  function finestre(w, h, file, colori) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = colori[0]; x.fillRect(0, 0, 256, 256);
    x.fillStyle = colori[1];
    for (let r = 0; r < file; r++) { const y = 256 * (r + 0.32) / file; for (let k = 0; k < 10; k++) x.fillRect(10 + k * 24.6, y, 15, 256 / file * 0.34); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(w / 20, 1); t.wrapS = THREE.RepeatWrapping; return t;
  }
  const finestreLuce = []; // si accendono di notte
  function castello() {
    const g = new THREE.Group(), x0 = -L / 2 + 9;
    const bianco = new THREE.MeshLambertMaterial({ color: '#f1f0ea' });
    const conF = (w, h, file) => { const m = new THREE.MeshLambertMaterial({ color: '#ffffff', map: finestre(w, h, file, ['#f1f0ea', '#2a3442']), emissive: '#000000' }); finestreLuce.push(m); return m; };
    const torre = new THREE.Mesh(new THREE.BoxGeometry(13, 15, B - 3), [conF(B - 3, 15, 5), conF(B - 3, 15, 5), bianco, bianco, conF(13, 15, 5), conF(13, 15, 5)]);
    torre.position.set(x0 + 7, D + 7.5, 0); g.add(torre);
    const plancia = new THREE.Mesh(new THREE.BoxGeometry(9, 3, B + 3), [conF(B + 3, 3, 1), bianco, bianco, bianco, conF(9, 3, 1), conF(9, 3, 1)]);
    plancia.position.set(x0 + 9, D + 16.5, 0); g.add(plancia);
    const tetto = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.4, B + 3.6), bianco); tetto.position.set(x0 + 9, D + 18.2, 0); g.add(tetto);
    const albero = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 8, 8), bianco); albero.position.set(x0 + 8, D + 22, 0); g.add(albero);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), new THREE.MeshLambertMaterial({ color: '#2a3442' })); radar.position.set(x0 + 8, D + 24.5, 0); g.add(radar);
    g.userData.radar = radar;
    const fum = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 6), new THREE.MeshLambertMaterial({ color: '#0b2545' })); fum.position.set(x0 - 1.5, D + 16, 0); g.add(fum);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1.6, 6.1), new THREE.MeshLambertMaterial({ color: '#c9a227' })); fascia.position.set(x0 - 1.5, D + 18.2, 0); g.add(fascia);
    // fanali di via: rosso a sinistra, verde a dritta, bianco in testa d'albero
    const fan = (col, z, y) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: col })); s.position.set(x0 + 11, y, z); g.add(s); return s; };
    fan('#ff3b30', -(B / 2 + 1.4), D + 17.2); fan('#2bff7a', B / 2 + 1.4, D + 17.2); fan('#ffffff', 0, D + 26.2);
    // albero di prua
    const ap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9, 8), bianco); ap.position.set(L / 2 - 9, D + 2.6 + 4.5, 0); g.add(ap);
    const fp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); fp.position.set(L / 2 - 9, D + 2.6 + 9.2, 0); g.add(fp);
    return g;
  }

  /* ---------- marca di bordo libero (ingrandita: disegno schematico) ---------- */
  function marca() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 300; const x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = '#E3C878'; x.lineWidth = 12;
    const cx = 150, cy = 150, r = 70;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    x.fillRect(cx - r - 38, cy - 6, 2 * r + 76, 12);                // linea dell'occhio di Plimsoll
    x.fillRect(270, 40, 12, 230);                                    // pettine
    const tacca = (y, verso, lettera) => { x.fillRect(verso > 0 ? 282 : 220, y - 6, verso > 0 ? 76 : 50, 12); x.font = 'bold 30px Atkinson, sans-serif';
      x.textAlign = verso > 0 ? 'left' : 'right'; x.fillText(lettera, verso > 0 ? 366 : 214, y + 11); };
    tacca(110, 1, 'T'); tacca(150, 1, 'S'); tacca(190, 1, 'W'); tacca(230, 1, 'WNA'); tacca(52, -1, 'TF'); tacca(84, -1, 'F');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    // solo sulla murata di dritta, quella che si guarda: prua a destra, pettine verso prua
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 8.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(-2.5, T_MARCA, B / 2 + 0.06);
    g.add(m);
    // la linea sta all'altezza della marca: il centro del disegno (y=150 su 300) coincide con T_MARCA
    return g;
  }

  /* ---------- container ---------- */
  const TINTE_C = ['#b3362b', '#2e7db5', '#2f7a55', '#e8e4d8', '#5b6b7c', '#13315c', '#d9822b', '#8c2f4a', '#3f8f8a'];
  function texturaContainer() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 256; i += 6) { x.fillStyle = i % 12 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.0)'; x.fillRect(i, 0, 3, 64); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 256, 3); x.fillRect(0, 61, 256, 3); x.fillRect(0, 0, 4, 64); x.fillRect(252, 0, 4, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const CL = 12.2, CH = 2.59, CW = 2.44;
  const posti = [];
  (function preparaPosti() {
    const x0 = -L / 2 + 29, nBaie = 7, nFile = 8, nTiri = 3;
    for (let tier = 0; tier < nTiri; tier++) for (let b = 0; b < nBaie; b++) for (let r = 0; r < nFile; r++) {
      const x = x0 + b * (CL + 0.4) + CL / 2, z = (r - (nFile - 1) / 2) * (CW + 0.15);
      const u1 = (x + CL / 2) / (L / 2);
      if (Math.abs(z) + CW / 2 > mezzaLarghezza(Math.min(u1, 0.99), 1) - 0.5) continue;
      posti.push({ x, y: D + cavallino(0) + CH / 2 + tier * CH, z, tier, ordine: tier * 1000 + Math.abs(b - 3) * 100 + Math.abs(r - 3.5) * 10 + Math.random() });
    }
    posti.sort((a, b) => a.ordine - b.ordine);
  })();
  const contenitori = new THREE.InstancedMesh(new THREE.BoxGeometry(CL, CH, CW), new THREE.MeshLambertMaterial({ map: texturaContainer() }), posti.length);
  contenitori.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const _m = new THREE.Matrix4(), _c = new THREE.Color();
  posti.forEach((p, i) => { contenitori.setColorAt(i, _c.set(TINTE_C[Math.floor(Math.random() * TINTE_C.length)])); p.stato = 0; p.quota = 0; });
  contenitori.count = 0;
  contenitori.frustumCulled = false;

  /* ---------- montaggio ---------- */
  const [scafoMesh, copertaMesh] = scafo(); corpo.add(scafoMesh, copertaMesh);
  const sovra = castello(); corpo.add(sovra);
  const marche = marca(); corpo.add(marche);
  corpo.add(contenitori);

  /* ---------- elica e timone (disegno schematico) ---------- */
  const XE = -L / 2 + 2.2, YE = 2.3, RE = 1.9;
  const bronzo = new THREE.MeshLambertMaterial({ color: '#b48a4e' });
  const elica = new THREE.Group(); elica.position.set(XE, YE, 0); corpo.add(elica);
  const mozzo = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 1.1, 16), bronzo); mozzo.rotation.z = Math.PI / 2; elica.add(mozzo);
  const punte = [];
  for (let i = 0; i < 4; i++) {
    const porta = new THREE.Group(); porta.rotation.x = i * Math.PI / 2; elica.add(porta);
    const pala = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), bronzo);
    pala.scale.set(0.1, RE * 0.52, 0.62); pala.position.y = RE * 0.5; pala.rotation.y = 0.55; porta.add(pala);
    const punta = new THREE.Object3D(); punta.position.y = RE * 0.95; porta.add(punta); punte.push(punta);
  }
  const asse = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 10), new THREE.MeshLambertMaterial({ color: '#5b6b7c' }));
  asse.rotation.z = Math.PI / 2; asse.position.set(XE + 3.4, YE, 0); corpo.add(asse);
  const pernoTimone = new THREE.Group(); pernoTimone.position.set(-L / 2 - 0.6, 0, 0); corpo.add(pernoTimone);
  const pala = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 0.45), new THREE.MeshLambertMaterial({ color: '#9b2b22' }));
  pala.position.set(-1.6, 3.7, 0); pernoTimone.add(pala);
  // bolle della cavitazione: nascono sulle punte delle pale
  const NB = 700, pb = new Float32Array(NB * 3), vb = new Float32Array(NB * 3), eb = new Float32Array(NB).fill(9);
  const geoB = new THREE.BufferGeometry(); geoB.setAttribute('position', new THREE.BufferAttribute(pb, 3));
  const bolle = new THREE.Points(geoB, new THREE.PointsMaterial({ color: '#eaffff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
  bolle.frustumCulled = false; corpo.add(bolle);
  let prossimaBolla = 0;
  const _b = new THREE.Vector3();

  /* ---------- compartimenti e paratie (per la falla) ---------- */
  const fantasma = new THREE.Group(); fantasma.visible = false; corpo.add(fantasma);
  const CONFINI = [-L / 2 + 6, -L / 2 + 28, -19, -1, 17, 35, 52, L / 2 - 6];
  const NOMI = ['sala macchine', 'stiva 5', 'stiva 4', 'stiva 3', 'stiva 2', 'stiva 1', 'gavone di prua'];
  const compartimenti = [];
  const matParatia = new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const matVano = new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.06, depthWrite: false });
  const matAcqua = new THREE.MeshLambertMaterial({ color: '#2E7DB5', transparent: true, opacity: 0.8 });
  const Y0 = 1.4; // sopra il doppio fondo
  for (let i = 0; i < NOMI.length; i++) {
    const x0 = CONFINI[i], x1 = CONFINI[i + 1], xc = (x0 + x1) / 2;
    const u = Math.min(0.97, Math.max(-0.97, xc / (L / 2)));
    const hb = Math.max(1.5, mezzaLarghezza(u, 0.55) - 0.6), alto = D - 0.3 - Math.max(Y0, chiglia(u) + 0.6);
    const yb = Math.max(Y0, chiglia(u) + 0.6);
    const vano = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.3, alto, hb * 2), matVano); vano.position.set(xc, yb + alto / 2, 0);
    const bordi = new THREE.LineSegments(new THREE.EdgesGeometry(vano.geometry), new THREE.LineBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.5 }));
    vano.add(bordi);
    const acqua = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.4, 1, hb * 2 - 0.1), matAcqua); acqua.position.set(xc, yb, 0); acqua.visible = false;
    fantasma.add(vano, acqua);
    compartimenti.push({ nome: NOMI[i], vano, acqua, xc, yb, alto, k: 0, falla: false });
  }
  for (let i = 1; i < CONFINI.length - 1; i++) {
    const x = CONFINI[i], u = x / (L / 2), hb = mezzaLarghezza(u, 0.6) - 0.3;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(hb * 2, D - Y0), matParatia); p.rotation.y = Math.PI / 2; p.position.set(x, Y0 + (D - Y0) / 2, 0);
    fantasma.add(p);
  }
  const falla = { stagne: true, tDiffusione: 0, affonda: 0, assetto: 0, aPicco: false };
  function allaga(i) { const c = compartimenti[i]; if (c.falla) return false; c.falla = true; c.acqua.visible = true; return true; }
  function ripara() { for (const c of compartimenti) { c.falla = false; c.k = 0; c.acqua.visible = false; } Object.assign(falla, { tDiffusione: 0, affonda: 0, assetto: 0, aPicco: false }); }
  function aggiornaFalla(dt) {
    let aff = 0, ass = 0;
    for (const c of compartimenti) {
      if (c.falla) c.k = Math.min(1, c.k + dt / 3.5);
      aff += c.k * 1.05; ass += c.k * 1.05 * c.xc;
    }
    // senza paratie stagne l'acqua passa nei compartimenti vicini
    if (!falla.stagne) {
      falla.tDiffusione += dt;
      if (falla.tDiffusione > 1.4) {
        falla.tDiffusione = 0;
        const da = compartimenti.map((c) => c.k > 0.5);
        da.forEach((si, i) => { if (si) { if (compartimenti[i - 1]) allaga(i - 1); if (compartimenti[i + 1]) allaga(i + 1); } });
      }
    }
    if (falla.aPicco) { falla.affonda += dt * 2.2; falla.assetto += dt * 0.025; }
    else { falla.affonda += (aff - falla.affonda) * Math.min(1, dt * 0.8); falla.assetto += (-ass * 0.0009 - falla.assetto) * Math.min(1, dt * 0.8); }
    for (const c of compartimenti) {
      if (!c.acqua.visible) continue;
      const pelo = stato.pescaggio + falla.affonda - c.xc * corpo.rotation.z; // galleggiamento esterno in quel punto
      const h = Math.max(0.05, Math.min(c.alto, (pelo - c.yb) * c.k));
      c.acqua.scale.y = h; c.acqua.position.y = c.yb + h / 2;
    }
  }
  function modoFantasma(si) {
    fantasma.visible = si;
    for (const m of [scafoMesh.material, copertaMesh.material]) { m.transparent = si; m.opacity = si ? 0.22 : 1; m.depthWrite = !si; m.needsUpdate = true; }
    contenitori.visible = !si; marche.visible = !si;
  }

  /* ---------- i sei moti (ampiezze esagerate: disegno schematico) ---------- */
  const MOTI = {
    rollio: (g, f) => { g.rotation.x += f * 0.2; }, beccheggio: (g, f) => { g.rotation.z += f * 0.08; }, imbardata: (g, f) => { g.rotation.y += f * 0.3; },
    avanzo: (g, f) => { g.position.x += f * 12; }, deriva: (g, f) => { g.position.z += f * 9; }, sussulto: (g, f) => { g.position.y += f * 2.2; },
  };

  /* ---------- scia ---------- */
  const NSc = 140, scia = [];
  const geoS = new THREE.BufferGeometry();
  const ps = new Float32Array(NSc * 2 * 3), cs = new Float32Array(NSc * 2 * 4), is = [];
  for (let i = 0; i < NSc - 1; i++) { const a = i * 2; is.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geoS.setAttribute('position', new THREE.BufferAttribute(ps, 3)); geoS.setAttribute('color', new THREE.BufferAttribute(cs, 4)); geoS.setIndex(is);
  const matS = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const meshS = new THREE.Mesh(geoS, matS); meshS.frustumCulled = false; meshS.renderOrder = 2; Mondo.scena.add(meshS);
  let tScia = 0;

  /* ---------- stato e moto ---------- */
  const stato = {
    pescaggio: T_VUOTA, mira: T_VUOTA, velocita: 0, prora: 0, accostata: 0, barra: 0, sbandaExtra: 0, scia: false,
    giri: 0, cavita: 0, assettoExtra: 0, moto: null, tMoto: 0, sommergi: 0, manuale: null,
  };
  const _p = new THREE.Vector3();
  function puntoMondo(x, z) { // punto dello scafo in coordinate del mondo (solo piano orizzontale)
    const c = Math.cos(stato.prora), s = Math.sin(stato.prora);
    return [esterno.position.x + x * c + z * s, esterno.position.z - x * s + z * c];
  }

  function aggiorna(dt, t) {
    // pescaggio che segue il carico
    stato.pescaggio += (stato.mira - stato.pescaggio) * Math.min(1, dt * 3);
    // governo: la barra genera la velocità di accostata, che cresce con la velocità della nave
    const mira = -stato.barra / 35 * 0.16 * Math.min(1, stato.velocita / 9);
    stato.accostata += (mira - stato.accostata) * Math.min(1, dt * 0.9);
    stato.prora += stato.accostata * dt;
    esterno.rotation.y = stato.prora;
    esterno.position.x += Math.cos(stato.prora) * stato.velocita * dt;
    esterno.position.z += -Math.sin(stato.prora) * stato.velocita * dt;
    // onde: sussulto, beccheggio, rollio
    const [xp, zp] = puntoMondo(L * 0.4, 0), [xs, zs] = puntoMondo(-L * 0.4, 0), [xl, zl] = puntoMondo(0, -B / 2), [xr, zr] = puntoMondo(0, B / 2);
    const hp = Mondo.altezza(xp, zp, t), hs = Mondo.altezza(xs, zs, t), hl = Mondo.altezza(xl, zl, t), hr = Mondo.altezza(xr, zr, t);
    const amp = Mondo.U.uAmp.value;
    corpo.position.y = (hp + hs + hl + hr) / 4 * 0.8 - stato.pescaggio;
    corpo.rotation.z = Math.atan2(hp - hs, L * 0.8) * 0.9;
    const sbanda = stato.accostata * stato.velocita * 0.05; // la nave si inclina verso l'esterno dell'accostata
    corpo.rotation.x = Math.atan2(hr - hl, B) * 0.7 + Math.sin(t * 0.7) * 0.012 * amp + sbanda + stato.sbandaExtra;
    corpo.rotation.y = 0; corpo.position.x = 0; corpo.position.z = 0;
    // falla, assetto voluto, sommersione
    aggiornaFalla(dt);
    corpo.position.y -= falla.affonda + stato.sommergi;
    corpo.rotation.z += falla.assetto + stato.assettoExtra;
    // i sei moti, uno alla volta
    if (stato.moto && MOTI[stato.moto]) { stato.tMoto += dt; MOTI[stato.moto](corpo, Math.sin(stato.tMoto * Math.PI * 2 / 5) * Math.min(1, stato.tMoto)); }
    // moti guidati a mano (il modellino nel visore): rotazioni attorno a x, y, z della nave e traslazioni lungo gli stessi assi
    const m = stato.manuale;
    if (m) { corpo.rotation.x += m.rx; corpo.rotation.z += m.ry; corpo.rotation.y += m.rz; corpo.position.x += m.tx; corpo.position.z += m.ty; corpo.position.y += m.tz; }
    // elica, timone e cavitazione
    elica.rotation.x += stato.giri * dt * Math.PI * 2;
    pernoTimone.rotation.y = stato.barra * Math.PI / 180;
    prossimaBolla -= dt;
    const ritmoBolle = stato.cavita * 260;
    while (ritmoBolle > 0 && prossimaBolla < 0) {
      prossimaBolla += 1 / ritmoBolle;
      const k = eb.findIndex((e) => e > 1.6); if (k < 0) break;
      const pu = punte[Math.floor(Math.random() * 4)];
      pu.getWorldPosition(_b); corpo.worldToLocal(_b);
      pb.set([_b.x + (Math.random() - 0.5) * 0.4, _b.y + (Math.random() - 0.5) * 0.4, _b.z + (Math.random() - 0.5) * 0.4], k * 3);
      vb.set([-3 - Math.random() * 3, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5], k * 3); eb[k] = 0;
    }
    for (let k = 0; k < NB; k++) {
      if (eb[k] > 1.6) { pb[k * 3 + 1] = -999; continue; }
      eb[k] += dt; pb[k * 3] += vb[k * 3] * dt; pb[k * 3 + 1] += vb[k * 3 + 1] * dt; pb[k * 3 + 2] += vb[k * 3 + 2] * dt;
    }
    geoB.attributes.position.needsUpdate = true;
    sovra.userData.radar.rotation.y += dt * 2.4;
    // caduta dei container
    let cambiati = false;
    for (let i = 0; i < contenitori.count; i++) {
      const p = posti[i]; let mosso = false;
      if (p.stato === 1) { // sta cadendo
        p.k = Math.min(1, p.k + dt / 0.5);
        p.quota = 38 * (1 - rimbalzo(p.k));
        if (p.k >= 1) { p.stato = 2; p.quota = 0; atterrati++; if (onAtterra) onAtterra(); }
        mosso = true;
      } else if (p.stato === 3) { // risale
        p.k = Math.min(1, p.k + dt / 0.45); p.quota = 45 * p.k * p.k; mosso = true;
      }
      if (mosso) { cambiati = true; _m.makeTranslation(p.x, p.y + p.quota, p.z); contenitori.setMatrixAt(i, _m); }
    }
    while (contenitori.count > 0 && posti[contenitori.count - 1].stato === 3 && posti[contenitori.count - 1].k >= 1) { posti[contenitori.count - 1].stato = 0; contenitori.count--; }
    if (cambiati) contenitori.instanceMatrix.needsUpdate = true;
    aggiornaScia(dt);
  }
  function rimbalzo(x) { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; }

  function aggiornaScia(dt) {
    tScia += dt;
    if (stato.scia && stato.velocita > 0.5 && tScia > 0.12) {
      tScia = 0;
      const [x, z] = puntoMondo(-L / 2 - 2, 0);
      scia.unshift({ x, z, a: stato.prora, eta: 0 });
      if (scia.length > NSc) scia.pop();
    }
    for (const s of scia) s.eta += dt;
    const t = Mondo.tempo;
    for (let i = 0; i < NSc; i++) {
      const s = scia[Math.min(i, scia.length - 1)];
      if (!s) { cs.fill(0); break; }
      const w = 7 + s.eta * 3.2, nx = Math.sin(s.a) * w, nz = Math.cos(s.a) * w;
      const y = Mondo.altezza(s.x, s.z, t) + 0.25;
      ps.set([s.x + nx, y, s.z + nz, s.x - nx, y, s.z - nz], i * 6);
      const al = i < scia.length ? Math.max(0, 0.75 * (1 - s.eta / 14)) * Math.min(1, i / 2) : 0;
      cs.set([0.92, 0.96, 1, al, 0.92, 0.96, 1, al], i * 8);
    }
    geoS.attributes.position.needsUpdate = true; geoS.attributes.color.needsUpdate = true;
  }
  Mondo.ogniFrame.add(aggiorna);

  /* ---------- carico ---------- */
  let atterrati = 0, assegnati = 0, onAtterra = null;
  const K = (T_MARCA - T_VUOTA) / Math.round(posti.length * 0.78); // alla marca con il 78 % dei posti pieni (grafico)
  function aggiornaMira() { stato.mira = T_VUOTA + assegnati * K; } // conta anche i container già agganciati
  function carica() {
    const i = contenitori.count;
    if (i >= posti.length) return false;
    const p = posti[i]; p.stato = 1; p.k = 0; p.quota = 38;
    _m.makeTranslation(p.x, p.y + p.quota, p.z); contenitori.setMatrixAt(i, _m);
    contenitori.count++; assegnati++; aggiornaMira(); contenitori.instanceMatrix.needsUpdate = true;
    if (contenitori.instanceColor) contenitori.instanceColor.needsUpdate = true;
    return true;
  }
  function scarica() {
    for (let i = contenitori.count - 1; i >= 0; i--) {
      const p = posti[i];
      if (p.stato === 2) { p.stato = 3; p.k = 0; atterrati--; assegnati--; aggiornaMira(); return true; }
    }
    return false;
  }
  function svuota() { for (const p of posti) { p.stato = 0; } contenitori.count = 0; atterrati = 0; assegnati = 0; aggiornaMira(); stato.pescaggio = T_VUOTA; }
  function riempiSubito(n) {
    svuota();
    for (let i = 0; i < Math.min(n, posti.length); i++) { const p = posti[i]; p.stato = 2; p.quota = 0; _m.makeTranslation(p.x, p.y, p.z); contenitori.setMatrixAt(i, _m); }
    contenitori.count = Math.min(n, posti.length); atterrati = assegnati = contenitori.count; aggiornaMira(); stato.pescaggio = stato.mira;
    contenitori.instanceMatrix.needsUpdate = true;
  }

  function accendiLuci(v) { for (const m of finestreLuce) m.emissive.set(v ? '#3a2c10' : '#000000'); }
  function azzeraScia() { scia.length = 0; cs.fill(0); geoS.attributes.color.needsUpdate = true; }

  return {
    L, B, D, T_VUOTA, T_MARCA, esterno, corpo, stato, posti, carica, scarica, svuota, riempiSubito, accendiLuci, azzeraScia, puntoMondo,
    get caricati() { return assegnati; }, get atterrati() { return atterrati; },
    get bordoLibero() { return D - stato.pescaggio; }, get bordoLiberoMarca() { return D - T_MARCA; },
    set onAtterra(f) { onAtterra = f; },
    elica, punte, pernoTimone, XE, YE, compartimenti, falla, allaga, ripara, modoFantasma, MOTI, sovra, matParatia,
    posMarca() { return corpo.localToWorld(new THREE.Vector3(-1.5, T_MARCA, B / 2)); },
  };
})();
