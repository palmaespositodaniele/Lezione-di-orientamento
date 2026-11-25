/* Oggetti di scena: pontile, piattaforma panoramica, ruota del timone sul ponte, chiesuola, mirino del sestante.
   Misure solo grafiche. */
const Scenari = (() => {
  const L = Nave.L, B = Nave.B, D = Nave.D;
  // il tetto della plancia: ci si sta in piedi (plancia scoperta). Coordinate nel sistema di Nave.esterno
  const X0 = -L / 2 + 9, TETTO = D + 18.4;
  const PONTE = { pos: [X0 + 6.5, TETTO, 0], yaw: -Math.PI / 2, area: { x0: X0 + 5, x1: X0 + 13.2, z0: -12, z1: 12 } };

  /* ---------- pontile galleggiante ---------- */
  function pontile(larg, lung) {
    const g = new THREE.Group();
    const legno = new THREE.MeshLambertMaterial({ color: '#8a6440' });
    const piano = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.3, lung), legno); piano.position.y = 0.45; g.add(piano);
    const ferro = new THREE.MeshLambertMaterial({ color: '#e8e6df' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 12), new THREE.MeshLambertMaterial({ color: '#c9a227' })); f.position.set(s * (larg / 2 - 0.6), 0.1, t * (lung / 2 - 0.6)); g.add(f);
    }
    // ringhiera su tre lati
    const r = (x, z, l, rot) => { const b = new THREE.Mesh(new THREE.BoxGeometry(l, 0.06, 0.06), ferro); b.position.set(x, 1.6, z); b.rotation.y = rot; g.add(b); };
    r(0, -lung / 2, larg, 0); r(-larg / 2, 0, lung, Math.PI / 2); r(larg / 2, 0, lung, Math.PI / 2);
    for (let i = 0; i <= 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), ferro); p.position.set(-larg / 2 + larg * i / 6, 1.1, -lung / 2); g.add(p); }
    g.userData.area = { x0: -larg / 2 + 0.5, x1: larg / 2 - 0.5, z0: -lung / 2 + 0.5, z1: lung / 2 - 0.5 };
    return g;
  }

  /* ---------- piattaforma panoramica: un disco di vetro ---------- */
  function piattaforma(raggio) {
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.CylinderGeometry(raggio, raggio, 0.08, 48), new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.18, depthWrite: false }));
    g.add(d);
    const bordo = new THREE.Mesh(new THREE.TorusGeometry(raggio, 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: '#E3C878', toneMapped: false }));
    bordo.rotation.x = Math.PI / 2; bordo.position.y = 1.05; g.add(bordo);
    const r = raggio * 0.72;
    g.userData.area = { x0: -r, x1: r, z0: -r, z1: r };
    return g;
  }

  /* ---------- ruota del timone sul tetto della plancia ---------- */
  const ruota = new THREE.Group();
  let cerchio;
  {
    const legno = new THREE.MeshLambertMaterial({ color: '#8a5a2b' }), oro = new THREE.MeshLambertMaterial({ color: '#C9A227' });
    cerchio = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 48), legno); ruota.add(cerchio);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const raggio = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 8), legno); raggio.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0); raggio.rotation.z = a - Math.PI / 2; ruota.add(raggio);
      const man = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.14, 8), legno); man.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0); man.rotation.z = a - Math.PI / 2; ruota.add(man);
    }
    const mozzo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16), oro); mozzo.rotation.x = Math.PI / 2; ruota.add(mozzo);
    const segno = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#E3C878' })); segno.position.set(0, 0.68, 0); ruota.add(segno);
    // presa più facile per il raggio: un disco quasi invisibile
    const presa = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ruota.add(presa); ruota.userData.presa = presa;
  }
  const colonna = new THREE.Group();
  const fusto = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.05, 12), new THREE.MeshLambertMaterial({ color: '#13315c' })); fusto.position.y = 0.52; colonna.add(fusto);
  const supportoRuota = new THREE.Group(); supportoRuota.position.set(0, 1.18, -0.08); colonna.add(supportoRuota);
  const giroRuota = new THREE.Group(); supportoRuota.add(giroRuota); giroRuota.add(ruota);
  colonna.position.set(X0 + 11.2, TETTO, 0); colonna.rotation.y = -Math.PI / 2; // la ruota guarda verso poppa, cioè verso chi sta al timone
  colonna.visible = false;
  Nave.esterno.add(colonna);

  // stato della ruota: angolo (rad) da −1,5π a +1,5π; il verso è quello di chi la guarda da poppa
  const timone = { angolo: 0, attiva: false, presa: null };
  const _pl = new THREE.Plane(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3();
  function angoloSulPiano(fonte) { // col raggio: dove il raggio buca il piano della ruota
    const r = fonte.raggioMondo();
    supportoRuota.getWorldPosition(_c); _n.set(0, 0, 1).applyQuaternion(supportoRuota.getWorldQuaternion(new THREE.Quaternion()));
    _pl.setFromNormalAndCoplanarPoint(_n, _c);
    const ry = new THREE.Ray(r.origine, r.dir);
    if (!ry.intersectPlane(_pl, _h)) return null;
    const loc = supportoRuota.worldToLocal(_h.clone());
    return Math.atan2(loc.y, loc.x);
  }
  function angoloMano(mano) { // con la mano: la posizione della mano proiettata sulla ruota
    const loc = supportoRuota.worldToLocal(new THREE.Vector3().setFromMatrixPosition(mano));
    return Math.hypot(loc.x, loc.y) < 0.05 ? null : Math.atan2(loc.y, loc.x);
  }
  const angoloDi = (f, mano) => (f.tiene && f.tiene.dist == null ? angoloMano(mano) : angoloSulPiano(f));
  const prese = new Map(); // una presa per mano: si può girare con due mani
  // la ruota si prende con le mani sulle caviglie o sul cerchio (o col raggio, da lontano)
  VR.afferrabile(ruota.userData.presa, {
    puo: () => timone.attiva,
    vicinoA(pos) {
      const l = supportoRuota.worldToLocal(pos.clone()), r = Math.hypot(l.x, l.y);
      return Math.hypot(Math.max(0, Math.abs(r - 0.5) - 0.22), Math.max(0, Math.abs(l.z) - 0.06));
    },
    prendi(f, mano) { const a = angoloDi(f, mano); prese.set(f, a); timone.presa = true; Suono.clic(); },
    muovi(M, f, mano) {
      const a = angoloDi(f, mano), a0 = prese.get(f); if (a === null || a0 == null) { prese.set(f, a); return; }
      let d = a - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      // girare in senso orario (visto da poppa) porta la barra a dritta
      const prima = timone.angolo;
      timone.angolo = Math.max(-Math.PI * 1.5, Math.min(Math.PI * 1.5, timone.angolo - d)); prese.set(f, a);
      if (Math.floor(prima / 0.4) !== Math.floor(timone.angolo / 0.4)) VR.vibra(f, 0.15, 12); // scatti sotto la mano
    },
    lascia(f) { prese.delete(f); timone.presa = prese.size > 0; },
    evidenzia(si) { cerchio.material.emissive.set(si ? '#5a4208' : '#000000'); },
  });
  Mondo.ogniFrame.add(() => { giroRuota.rotation.z = -timone.angolo; });

  /* ---------- chiesuola: la bussola davanti al timone ---------- */
  const chiesuola = new THREE.Group();
  const piede = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.12, 16), new THREE.MeshLambertMaterial({ color: '#e8e6df' })); piede.position.y = 0.56; chiesuola.add(piede);
  const testaChiesuola = new THREE.Object3D(); testaChiesuola.position.y = 1.15; chiesuola.add(testaChiesuola);
  // davanti a destra di chi sta al timone, appena fuori dal cerchio della ruota: si legge abbassando lo sguardo
  chiesuola.position.set(X0 + 11.3, TETTO, 0.78); chiesuola.visible = false;
  Nave.esterno.add(chiesuola);

  /* ---------- mirino del sestante: la vista nel cannocchiale, disegnata su tela ---------- */
  const mirino = document.createElement('canvas'); mirino.width = mirino.height = 512;
  /* Come nel libro di astronomia (esperienza 7): a sinistra la metà trasparente, con l'orizzonte visto direttamente;
     a destra la metà riflettente, con il cielo all'altezza letta. Il mare a destra compare solo per letture vicine a 0°.
     Con i vetrini colorati abbassati il Sole è un disco arancione su fondo verde; senza, abbaglia.
     o: { lettura (gradi), h: altezza del centro del Sole (gradi), sd: semidiametro (gradi), vetrini, t, testo } → true se abbaglia */
  const mixC = (a, b, f) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
  function disegnaMirino(o) {
    const x = mirino.getContext('2d'), S = 512, cx = S / 2, cy = S / 2, RAG = 246, K = 4; // K: pixel per primo (ingrandimento del cannocchiale)
    const cielo = mixC([10, 19, 34], [141, 184, 222], 1), mare = mixC([6, 16, 26], [44, 95, 134], 1);
    // nave e mano si muovono: tutto il campo sale e scende insieme (l'allineamento non cambia)
    const bob = 7 * Math.sin(o.t * 0.8) + 3 * Math.sin(o.t * 2.1 + 1);
    const rho = 0.32 * Math.sin(o.t * 1.25); // il sestante oscilla attorno all'asse del cannocchiale
    const Y = (a) => cy - (a - bob) * K; // a in primi sopra l'orizzonte
    const letta = o.lettura * 60;
    x.clearRect(0, 0, S, S);
    x.save(); x.beginPath(); x.arc(cx, cy, RAG, 0, Math.PI * 2); x.clip();
    // metà trasparente: l'orizzonte vero
    x.fillStyle = cielo; x.fillRect(cx - RAG, 0, RAG, S);
    x.fillStyle = mare; x.fillRect(cx - RAG, Y(0), RAG, S);
    // metà riflettente: il cielo all'altezza letta, un po' più scuro
    x.save(); x.beginPath(); x.rect(cx, 0, RAG, S); x.clip();
    x.fillStyle = cielo; x.fillRect(cx, 0, RAG, S);
    const yMare = Y(0 - letta);
    if (yMare < S) { x.fillStyle = mare; x.fillRect(cx, yMare, RAG, S); }
    const centro = o.h * 60, sd = o.sd * 60;
    const xs = cx + 100 + 40 * K * Math.sin(rho), ys = Y(centro - letta + 40 * (1 - Math.cos(rho)));
    let abbaglio = false;
    if (o.vetrini) {
      x.fillStyle = 'rgba(20,70,40,0.5)'; x.fillRect(cx, 0, RAG, S);
      x.fillStyle = '#F08A3C'; x.beginPath(); x.arc(xs, ys, sd * K, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#C0571E'; x.lineWidth = 3; x.stroke();
    } else {
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(cx, 0, RAG, S);
      if (Math.abs(ys - cy) < RAG + 260) {
        abbaglio = true;
        const gr = x.createRadialGradient(xs, ys, sd * K * 0.8, xs, ys, 420);
        gr.addColorStop(0, 'rgba(255,255,250,1)'); gr.addColorStop(1, 'rgba(255,250,230,0)');
        x.fillStyle = gr; x.fillRect(cx, 0, RAG, S);
        x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(xs, ys, sd * K, 0, Math.PI * 2); x.fill();
      }
    }
    x.restore();
    if (abbaglio) { x.fillStyle = 'rgba(255,252,240,0.55)'; x.fillRect(cx - RAG, 0, RAG, S); }
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(cx - 2, 0, 4, S); // bordo dell'argentatura
    x.font = '600 26px Atkinson, sans-serif'; x.fillStyle = 'rgba(230,236,242,0.85)'; x.textAlign = 'center';
    x.shadowColor = '#000'; x.shadowBlur = 6;
    x.fillText('trasparente', cx - RAG / 2 + 6, S - 100); x.fillText('riflettente', cx + RAG / 2 - 6, S - 100); x.shadowBlur = 0;
    if (o.testo) { x.font = '700 34px Bitter, serif'; x.fillStyle = '#ffffff'; x.shadowColor = '#000'; x.shadowBlur = 8; x.fillText(o.testo, cx, 62); x.shadowBlur = 0; }
    x.restore();
    x.strokeStyle = '#1B1F26'; x.lineWidth = 14; x.beginPath(); x.arc(cx, cy, RAG, 0, Math.PI * 2); x.stroke();
    texMirino.needsUpdate = true;
    return abbaglio;
  }
  const texMirino = new THREE.CanvasTexture(mirino); texMirino.colorSpace = THREE.SRGBColorSpace;
  const pianoMirino = new THREE.Mesh(new THREE.CircleGeometry(0.17, 48), new THREE.MeshBasicMaterial({ map: texMirino, transparent: true, depthTest: false, toneMapped: false, fog: false }));
  pianoMirino.renderOrder = 9400; pianoMirino.visible = false;

  return { PONTE, X0, TETTO, pontile, piattaforma, colonna, timone, chiesuola, testaChiesuola, mirino, disegnaMirino, texMirino, pianoMirino };
})();
