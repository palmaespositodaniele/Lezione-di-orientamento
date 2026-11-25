/* Realtà virtuale (WebXR) e puntamento comune a mouse e controller.
   - Il rig porta la camera: nel visore è il punto dove stanno i piedi; si mette su una nave, un pontile o in cielo con VR.posto().
   - Levetta sinistra: si cammina verso dove si guarda; levetta destra di lato: rotazione a scatti di 30°.
   - Grilletto: si preme quello che il raggio tocca (pannello di bordo, stelle, compartimenti, ruota del timone).
   - Prese: grilletto, pulsante laterale o pizzico (mani senza controller) prendono gli oggetti vicini alla mano; si portano e si lasciano.
   - index.html#vr apre la «VR simulata» sullo schermo: trascina per guardarti intorno, WASD per camminare, Q/E per girare. */
const VR = (() => {
  const { renderer, scena, camera, rig } = Mondo;
  const ALTEZZA_PROVA = 1.65;

  /* ---------- dissolvenza: una sfera nera intorno agli occhi ---------- */
  const velo = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }));
  velo.renderOrder = 10000; velo.visible = false; camera.add(velo);
  function dissolvi(a, durata) {
    const a0 = velo.material.opacity; velo.visible = true;
    return Mondo.anima(durata || 0.5, (k) => { velo.material.opacity = a0 + (a - a0) * k; velo.visible = velo.material.opacity > 0.001; });
  }

  /* ---------- posto: dove sta chi guarda ---------- */
  let area = null; // rettangolo calpestabile nel sistema del genitore {x0,x1,z0,z1}
  function posto(genitore, pos, yaw, nuovaArea) {
    (genitore || scena).add(rig);
    rig.position.set(...pos); rig.rotation.set(0, yaw || 0, 0);
    area = nuovaArea || null;
    if (Mondo.modo === 'prova') { camera.position.set(0, ALTEZZA_PROVA, 0); guardo.yaw = 0; guardo.pitch = 0; applicaGuardo(); }
    pannello.ricentra = true;
  }
  async function vai(genitore, pos, yaw, nuovaArea) { await dissolvi(1, 0.45); posto(genitore, pos, yaw, nuovaArea); await dissolvi(0, 0.6); }

  /* ---------- bersagli: oggetti che reagiscono al raggio ---------- */
  const bersagli = new Set();
  function bersaglio(obj, h, presa) { const b = { obj, h, presa }; bersagli.add(b); return () => bersagli.delete(b); }
  const ray = new THREE.Raycaster();
  function visibile(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  function colpisci(origine, dir) {
    ray.set(origine, dir); ray.far = 20000;
    let meglio = null;
    for (const b of bersagli) {
      if (!visibile(b.obj)) continue;
      const hs = ray.intersectObject(b.obj, true);
      if (hs.length && (!meglio || hs[0].distance < meglio.distance)) meglio = { ...hs[0], b };
    }
    return meglio;
  }
  let suVuoto = null; // chi riceve un clic che non tocca niente (per esempio le stelle)

  /* ---------- sorgenti: due controller e il mouse ---------- */
  const fonti = [];
  const geoR = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
  function manopola() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: '#13315c' });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 12), m); c.rotation.x = Math.PI / 2 - 0.5; c.position.set(0, -0.02, 0.04); g.add(c);
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), new THREE.MeshBasicMaterial({ color: '#E3C878' })); a.position.set(0, 0.01, -0.02); a.rotation.x = 0.6; g.add(a);
    return g;
  }
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
    rig.add(ctrl); rig.add(grip); grip.add(manopola());
    const raggio = new THREE.Line(geoR, new THREE.LineBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.85, depthWrite: false }));
    raggio.scale.z = 3; ctrl.add(raggio);
    const punto = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }));
    punto.renderOrder = 9998; punto.visible = false; scena.add(punto);
    // con le mani (senza controller) si vede un pallino d'oro al posto della manopola
    const dito = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), new THREE.MeshBasicMaterial({ color: '#E3C878' })); dito.visible = false; ctrl.add(dito);
    const f = { tipo: 'vr', ctrl, grip, raggio, punto, dito, attivo: false, mano: '', gamepad: null, presa: null, giraPronto: true, conGrip: false, mani: false, tiene: null, vicina: null,
      raggioMondo() { ctrl.getWorldPosition(_o); ctrl.getWorldQuaternion(_q); _d.set(0, 0, -1).applyQuaternion(_q); return { origine: _o.clone(), dir: _d.clone() }; } };
    ctrl.addEventListener('connected', (e) => {
      f.attivo = true; f.mano = e.data.handedness || ''; f.gamepad = e.data.gamepad || null;
      f.mani = !!e.data.hand; f.conGrip = !!e.data.gripSpace;
      grip.children[0].visible = !f.mani; dito.visible = f.mani;
    });
    ctrl.addEventListener('disconnected', () => { molla(f); f.attivo = false; f.gamepad = null; });
    ctrl.addEventListener('selectstart', () => premi(f));
    ctrl.addEventListener('selectend', () => lascia(f));
    ctrl.addEventListener('squeezestart', () => { if (!afferra(f, true) && onStringi) onStringi(f); });
    ctrl.addEventListener('squeezeend', () => { if (f.tiene && f.tiene.daStringi) molla(f); });
    fonti.push(f);
  }
  let onStringi = null;

  const mouse = { tipo: 'mouse', presa: null, tiene: null, x: 0, y: 0, attivo: true,
    raggioMondo() {
      const v = new THREE.Vector2(mouse.x / innerWidth * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
      ray.setFromCamera(v, camera); return { origine: ray.ray.origin.clone(), dir: ray.ray.direction.clone() };
    } };

  function premi(f) {
    if (afferra(f, false)) return true;
    const r = f.raggioMondo(), h = colpisci(r.origine, r.dir);
    if (h) { f.presa = h.b; h.b.h.premi?.(h, f); return true; }
    if (suVuoto) suVuoto(r.origine, r.dir, f);
    return false;
  }
  function lascia(f) { const b = f.presa; f.presa = null; if (b) b.h.lascia?.(f); }

  /* ---------- prese: oggetti da afferrare e portare con le mani ----------
     Si prende da vicino (la mano tocca l'oggetto) o da lontano col raggio, con il grilletto, il pulsante laterale o il pizzico.
     h: { raggio, vicinoA(pos) → distanza, puo(f), prendi(f, mano), muovi(M, f, mano), lascia(f), evidenzia(si), levetta(ax, ay, dt, f) }
     M è la matrice del mondo che l'oggetto avrebbe se seguisse la mano; senza muovi() l'oggetto la segue davvero. */
  const prese = new Set();
  const _M = new THREE.Matrix4(), _uno = new THREE.Vector3(1, 1, 1), _pm = new THREE.Vector3(), _qm = new THREE.Quaternion(), _sm = new THREE.Vector3();
  function afferrabile(obj, h) {
    const p = { obj, h, tenuta: null };
    prese.add(p);
    const togli = bersaglio(obj, { premi: (hit, f) => { if (!f.tiene) prendi(p, f, hit.distance, false); }, lascia: (f) => molla(f) }, p);
    return () => { if (p.tenuta) molla(p.tenuta); prese.delete(p); togli(); if (p.evid) p.h.evidenzia?.(false); };
  }
  function posa(f, dist) { // matrice del mondo della mano (o del punto sul raggio a quella distanza)
    if (f.tipo === 'mouse') {
      const r = f.raggioMondo(); camera.getWorldQuaternion(_qm);
      return new THREE.Matrix4().compose(r.origine.addScaledVector(r.dir, dist || 1), _qm, _uno);
    }
    if (dist == null) { const s = f.conGrip ? f.grip : f.ctrl; s.updateWorldMatrix(true, false); return s.matrixWorld.clone(); }
    f.ctrl.updateWorldMatrix(true, false);
    return f.ctrl.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -dist));
  }
  function piuVicina(f) {
    const pos = new THREE.Vector3().setFromMatrixPosition(posa(f, null));
    let meglio = null, dm = Infinity;
    for (const p of prese) {
      if (p.tenuta || !visibile(p.obj) || (p.h.puo && !p.h.puo(f))) continue;
      const d = p.h.vicinoA ? p.h.vicinoA(pos) : pos.distanceTo(p.obj.getWorldPosition(_pm)) - (p.h.raggio ?? 0.15);
      if (d <= 0.04 && d < dm) { dm = d; meglio = p; }
    }
    return meglio;
  }
  function afferra(f, daStringi) { // da vicino; col pulsante laterale anche col raggio
    if (f.tiene || f.tipo !== 'vr') return false;
    const p = piuVicina(f);
    if (p) { prendi(p, f, null, daStringi); if (!daStringi) f.presa = { h: { lascia: () => molla(f) } }; return true; }
    if (!daStringi) return false;
    const r = f.raggioMondo(), h = colpisci(r.origine, r.dir);
    if (h && h.b.presa && !h.b.presa.tenuta) { prendi(h.b.presa, f, h.distance, true); return true; }
    return false;
  }
  function prendi(p, f, dist, daStringi) {
    if (p.h.puo && !p.h.puo(f)) return;
    if (p.tenuta) molla(p.tenuta); // passa da una mano all'altra
    const mano = posa(f, dist);
    p.obj.updateWorldMatrix(true, false);
    f.tiene = { p, dist, daStringi, offset: mano.clone().invert().multiply(p.obj.matrixWorld) };
    p.tenuta = f;
    p.h.prendi?.(f, mano);
    vibra(f, 0.6, 40);
  }
  function molla(f) {
    const t = f && f.tiene; if (!t) return;
    f.tiene = null; t.p.tenuta = null;
    t.p.h.lascia?.(f); vibra(f, 0.3, 25);
  }
  function porta(f) { // ogni fotogramma: l'oggetto segue la mano
    const t = f.tiene, mano = posa(f, t.dist);
    _M.multiplyMatrices(mano, t.offset);
    if (t.p.h.muovi) { t.p.h.muovi(_M, f, mano); return; }
    const o = t.p.obj; o.parent.updateWorldMatrix(true, false);
    const loc = o.parent.matrixWorld.clone().invert().multiply(_M);
    loc.decompose(o.position, o.quaternion, _sm);
  }
  function vibra(f, forza, ms) { try { f.gamepad?.hapticActuators?.[0]?.pulse?.(forza, ms); } catch (e) { /* niente vibrazione */ } }

  /* ---------- mouse: su schermo i bersagli 3D funzionano lo stesso ---------- */
  const tela = renderer.domElement;
  let trascinoVista = null;
  tela.addEventListener('pointerdown', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (renderer.xr.isPresenting) return;
    const preso = premi(mouse);
    if (!preso && Mondo.modo === 'prova') { trascinoVista = { x: e.clientX, y: e.clientY, yaw: guardo.yaw, pitch: guardo.pitch }; tela.setPointerCapture(e.pointerId); }
  });
  tela.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (trascinoVista) {
      guardo.yaw = trascinoVista.yaw + (e.clientX - trascinoVista.x) * 0.005;
      guardo.pitch = Math.max(-1.4, Math.min(1.4, trascinoVista.pitch + (e.clientY - trascinoVista.y) * 0.005));
      applicaGuardo();
    }
  });
  const fine = () => { trascinoVista = null; lascia(mouse); };
  tela.addEventListener('pointerup', fine); tela.addEventListener('pointercancel', fine);
  // con la rotellina l'oggetto preso col mouse si avvicina o si allontana
  tela.addEventListener('wheel', (e) => { const t = mouse.tiene; if (!t) return; e.preventDefault(); t.dist = Math.max(0.25, Math.min(6, t.dist * (1 + e.deltaY * 0.001))); }, { passive: false });

  /* ---------- VR simulata: la testa si gira col mouse ---------- */
  const guardo = { yaw: 0, pitch: 0 };
  function applicaGuardo() { camera.rotation.set(guardo.pitch, guardo.yaw, 0, 'YXZ'); }
  const tasti = {};
  addEventListener('keydown', (e) => { tasti[e.code] = true; if (Mondo.modo === 'prova' && (e.code === 'KeyQ' || e.code === 'KeyE')) gira(e.code === 'KeyQ' ? 1 : -1); });
  addEventListener('keyup', (e) => { tasti[e.code] = false; });

  /* ---------- locomozione ---------- */
  const _t = new THREE.Vector3(), _p = new THREE.Vector3();
  function testaNelGenitore() { // posizione degli occhi nel sistema del genitore del rig
    const o = Mondo.occhio().clone();
    return rig.parent.worldToLocal(o);
  }
  function direzioneSguardo() { // avanti e destra, orizzontali, nel sistema del genitore
    const q = renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()) : camera.getWorldQuaternion(new THREE.Quaternion());
    const pq = rig.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const av = new THREE.Vector3(0, 0, -1).applyQuaternion(q).applyQuaternion(pq); av.y = 0;
    if (av.lengthSq() < 1e-6) av.set(0, 0, -1); av.normalize();
    return { av, de: new THREE.Vector3(-av.z, 0, av.x) };
  }
  // passo morbido: la velocità sale e scende in fretta ma senza strappi
  const passo = { a: 0, d: 0 };
  function cammina(avanti, destra, dt) {
    const k = Math.min(1, dt * 10);
    passo.a += (avanti - passo.a) * k; passo.d += (destra - passo.d) * k;
    if (Math.abs(passo.a) < 0.01 && !avanti) passo.a = 0;
    if (Math.abs(passo.d) < 0.01 && !destra) passo.d = 0;
    if (!area || (!passo.a && !passo.d)) return;
    const { av, de } = direzioneSguardo();
    const v = 2.4 * dt;
    rig.position.addScaledVector(av, passo.a * v).addScaledVector(de, passo.d * v);
    rig.position.x = Math.min(area.x1, Math.max(area.x0, rig.position.x));
    rig.position.z = Math.min(area.z1, Math.max(area.z0, rig.position.z));
  }
  function gira(segno) { // rotazione a scatti attorno alla testa
    const a = segno * Math.PI / 6, p = testaNelGenitore();
    _t.copy(rig.position).sub(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    rig.position.copy(p).add(_t); rig.position.y = rig.position.y; rig.rotation.y += a;
  }

  /* ---------- pannello di bordo: segue lo sguardo con calma ---------- */
  const pannello = { obj: null, ricentra: true, dist: 0.85, sotto: 0.28, lato: 0 };
  const _asseY = new THREE.Vector3(0, 1, 0);
  function segui(dt) {
    const o = pannello.obj; if (!o || !o.visible) return;
    if (o.parent !== rig) rig.add(o);
    // testa nel sistema del rig
    const q = camera.quaternion, p = camera.position;
    const av = new THREE.Vector3(0, 0, -1).applyQuaternion(q); av.y = 0; if (av.lengthSq() < 1e-6) av.set(0, 0, -1); av.normalize();
    if (pannello.lato) av.applyAxisAngle(_asseY, pannello.lato); // pannello spostato di lato (positivo = a sinistra)
    const dove = p.clone().addScaledVector(av, pannello.dist); dove.y = p.y - pannello.sotto;
    const attuale = o.position.clone().sub(p); attuale.y = 0; attuale.normalize();
    const scarto = Math.acos(Math.max(-1, Math.min(1, attuale.dot(av))));
    if (pannello.ricentra || scarto > 0.75 || o.position.distanceTo(p) > 2.5) { pannello.ricentra = false; pannello.inViaggio = true; }
    if (pannello.inViaggio) {
      o.position.lerp(dove, pannello.ricentra ? 1 : Math.min(1, dt * 3));
      if (o.position.distanceTo(dove) < 0.02) pannello.inViaggio = false;
    } else o.position.y += (dove.y - o.position.y) * Math.min(1, dt * 2);
    o.lookAt(rig.localToWorld(p.clone()));
  }

  /* ---------- scritte nello spazio: etichette, cartelli, avvisi ---------- */
  function tela2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function spriteTesto(righe, opz) {
    // righe: [{ testo, size, font, colore }]
    const o = Object.assign({ larg: 1024, pad: 24, fondo: null }, opz);
    const c = tela2d(o.larg, 64), x = c.getContext('2d');
    let h = o.pad; for (const r of righe) h += r.size * 1.2; h += o.pad;
    c.height = Math.ceil(h);
    if (o.fondo) { x.fillStyle = o.fondo; arrotondato(x, 0, 0, c.width, c.height, 28); x.fill(); }
    let y = o.pad; x.textAlign = 'center'; x.textBaseline = 'top';
    for (const r of righe) {
      x.font = `${r.peso || 700} ${r.size}px ${r.font || 'Bitter, Georgia, serif'}`;
      x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = o.fondo ? 0 : 14;
      x.fillStyle = r.colore || '#ffffff'; x.fillText(r.testo, c.width / 2, y); y += r.size * 1.2;
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    s.renderOrder = 9000; s.userData.aspetto = c.width / c.height; s.userData.righe = righe.length;
    return s;
  }
  function arrotondato(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  const etichette = new Set();
  function etichetta(righe, punto, altezzaAngolare) {
    const s = spriteTesto(righe, { larg: 768 }); scena.add(s);
    const e = { s, punto, ang: altezzaAngolare || 0.05 };
    etichette.add(e);
    e.togli = () => { scena.remove(s); s.material.map.dispose(); etichette.delete(e); };
    return e;
  }
  function aggiornaEtichette() {
    const occ = Mondo.occhio();
    for (const e of etichette) {
      const p = typeof e.punto === 'function' ? e.punto() : e.punto;
      e.s.position.copy(p);
      const d = occ.distanceTo(p), h = d * e.ang * (e.s.userData.righe || 1);
      e.s.scale.set(h * e.s.userData.aspetto, h, 1);
    }
  }

  // cartello e avviso: davanti agli occhi, poi svaniscono
  let scritta = null, tScritta = 0;
  function mostraScritta(righe, durata) {
    if (scritta) { camera.remove(scritta); scritta.material.map.dispose(); }
    scritta = spriteTesto(righe, { larg: 1400 }); camera.add(scritta);
    const h = 0.55; scritta.scale.set(h * scritta.userData.aspetto, h, 1); scritta.position.set(0, 0.15, -2.2);
    scritta.material.opacity = 0; tScritta = durata;
  }

  /* ---------- ciclo ---------- */
  Mondo.ogniFrame.add((dt) => {
    const xr = renderer.xr.isPresenting;
    // oggetti vicini alle mani: si illuminano
    const evid = new Set();
    for (const f of fonti) { f.vicina = xr && f.attivo && !f.tiene ? piuVicina(f) : null; if (f.vicina) evid.add(f.vicina); }
    for (const p of prese) { const si = evid.has(p) || !!p.tenuta; if (si !== !!p.evid) { p.evid = si; p.h.evidenzia?.(si); } }
    if (mouse.tiene) porta(mouse);
    for (const f of fonti) {
      f.raggio.visible = xr && f.attivo && !f.tiene && !f.vicina; f.grip.visible = xr && f.attivo;
      if (!xr || !f.attivo) { f.punto.visible = false; continue; }
      if (f.tiene) porta(f);
      const r = f.raggioMondo(), h = f.tiene || f.vicina ? null : colpisci(r.origine, r.dir);
      f.raggio.scale.z = h ? h.distance : 4; f.punto.visible = !!h; if (h) f.punto.position.copy(h.point);
      if (f.presa) f.presa.h.trascina?.(h && h.b === f.presa ? h : null, f);
      // levette (gamepad xr-standard: assi 2 e 3)
      const gp = f.gamepad; if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      // chi tiene un oggetto che usa la levetta (per esempio il sestante) non cammina con quella mano
      if (f.tiene && f.tiene.p.h.levetta) { f.tiene.p.h.levetta(zona(ax), zona(ay), dt, f); continue; }
      const sola = fonti.filter((k) => k.attivo).length === 1;
      if (f.mano === 'left' || sola) cammina(-zona(ay), zona(ax), dt);
      if (f.mano === 'right' && !sola) {
        if (Math.abs(ax) > 0.7 && f.giraPronto) { gira(ax > 0 ? -1 : 1); f.giraPronto = false; }
        if (Math.abs(ax) < 0.3) f.giraPronto = true;
      }
    }
    if (mouse.presa && !xr && !mouse.tiene) { const r = mouse.raggioMondo(), h = colpisci(r.origine, r.dir); mouse.presa.h.trascina?.(h && h.b === mouse.presa ? h : null, mouse); }
    if (Mondo.modo === 'prova') {
      const a = (tasti.KeyW ? 1 : 0) - (tasti.KeyS ? 1 : 0), d = (tasti.KeyD ? 1 : 0) - (tasti.KeyA ? 1 : 0);
      cammina(a, d, dt);
    }
    segui(dt);
    aggiornaEtichette();
    if (scritta) {
      tScritta -= dt;
      scritta.material.opacity = tScritta > 0.6 ? Math.min(1, scritta.material.opacity + dt * 3) : Math.max(0, tScritta / 0.6);
      if (tScritta <= 0) { camera.remove(scritta); scritta = null; }
    }
  });
  const zona = (v) => Math.abs(v) < 0.15 ? 0 : v;

  /* ---------- entrare e uscire ---------- */
  async function supportata(tipo = 'immersive-vr') {
    try { return !!(navigator.xr && await navigator.xr.isSessionSupported(tipo)); } catch (e) { return false; }
  }
  // conCamere: sessione «immersive-ar», cioè con le camere del visore (passthrough): si vede la stanza vera
  let sessione = null, sessioneAR = false;
  async function entra(alUscire, conCamere) {
    const s = await navigator.xr.requestSession(conCamere ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(s);
    sessione = s; sessioneAR = !!conCamere;
    Mondo.modo = 'vr';
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    document.body.classList.add('immersivo');
    // fotogrammi più regolari: se il visore lo permette, 72 Hz fissi (i visori mobili reggono meglio 72 che 90)
    try { if (s.supportedFrameRates && s.updateTargetFrameRate && [...s.supportedFrameRates].includes(72)) s.updateTargetFrameRate(72); } catch (e) { /* facoltativo */ }
    Mondo.camere(sessioneAR); Mondo.leggero(true);
    s.addEventListener('end', () => { sessione = null; Mondo.camere(false); Mondo.leggero(false); if (alUscire) alUscire(); });
  }
  // esce dal visore (o dalla VR simulata)
  function esci() {
    if (sessione) { sessione.end(); return; }
    if (Mondo.modo === 'prova') { if (VR.esciProva) VR.esciProva(); else { location.hash = ''; location.reload(); } }
  }
  function avviaProva() {
    Mondo.modo = 'prova';
    camera.fov = 75; camera.updateProjectionMatrix();
    camera.position.set(0, ALTEZZA_PROVA, 0); applicaGuardo();
    document.body.classList.add('immersivo');
  }

  return {
    dissolvi, posto, vai, bersaglio, afferrabile, molla, vibra, fonti, mouse, pannello, etichetta, spriteTesto, mostraScritta, entra, esci, supportata, avviaProva, arrotondato,
    get conCamere() { return sessioneAR; },
    set suVuoto(f) { suVuoto = f; }, set onStringi(f) { onStringi = f; },
    get area() { return area; },
  };
})();
