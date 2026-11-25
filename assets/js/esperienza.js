/* «Al comando»: regia del viaggio. Nove tappe e un arrivo, ciascuna con una missione e una scoperta.
   Funziona su schermo (camera cinematografica, comandi HTML) e nel visore (si sta su pontile, plancia o piattaforma;
   comandi sul pannello di bordo). I contenuti delle schede vengono dai libri 3D del prof. Daniele Palma Esposito. */

/* ---- da modificare a piacere ---- */
const CONFIG = {
  indirizzo: 'Indirizzo Trasporti e Logistica · Conduzione del mezzo navale',
  scuola: 'I.I.S. «F. Caracciolo – G. da Procida – A. Capraro»', // nome dell'istituto: compare nel finale
};

(() => {
  const $ = (id) => document.getElementById(id);
  const dorme = UI.dorme;
  const imm = () => Mondo.immersivo;
  const SALTO = Symbol('salto');
  const RAD = Math.PI / 180;
  const TAPPE = [
    { id: 'carico', nome: 'Galleggiare', fn: tappaCarico, icona: '⚓', cosa: 'il bordo libero' },
    { id: 'moti', nome: 'I sei moti', fn: tappaMoti, icona: '⟲', cosa: 'rollio e compagni' },
    { id: 'elica', nome: "L'elica", fn: tappaElica, icona: '✇', cosa: 'la cavitazione' },
    { id: 'timone', nome: 'Governare', fn: tappaTimone, icona: '☸', cosa: 'il timone' },
    { id: 'bussola', nome: 'La bussola', fn: tappaBussola, icona: '🧭', cosa: 'la prora bussola' },
    { id: 'falla', nome: 'La falla', fn: tappaFalla, icona: '⛉', cosa: 'le paratie stagne' },
    { id: 'tempo', nome: 'Il tempo', fn: tappaTempo, icona: '🌀', cosa: 'Buys Ballot' },
    { id: 'sestante', nome: 'Il sestante', fn: tappaSestante, icona: '◬', cosa: "l'altezza del Sole" },
    { id: 'stelle', nome: 'Le stelle', fn: tappaStelle, icona: '✦', cosa: 'la Polare' },
    { id: 'arrivo', nome: 'Arrivo', fn: tappaArrivo },
  ];
  const medaglie = {};
  let ctx = null;

  /* ================= utilità ================= */
  const inNave = (x, y, z) => Nave.esterno.localToWorld(new THREE.Vector3(x, y, z));
  const arr = (v) => v.toArray();
  const yawVerso = (da, a) => Math.atan2(-(a[0] - da[0]), -(a[2] - da[2]));
  const gp = (g) => { const s = g < 0 ? '−' : ''; g = Math.abs(g); let d = Math.floor(g), m = Math.round((g - d) * 60); if (m === 60) { d++; m = 0; } return `${s}${d}°${String(m).padStart(2, '0')}′`; };
  const pv = () => { let p = (90 - Nave.stato.prora / RAD) % 360; if (p < 0) p += 360; return p; };
  const tre = (g) => String(((Math.round(g) % 360) + 360) % 360).padStart(3, '0') + '°';
  const pieno = () => { if (Nave.caricati < 20) Nave.riempiSubito(Math.round(Nave.posti.length * 0.78)); };

  $('tappe').innerHTML = TAPPE.map((t) => `<li data-id="${t.id}">${t.nome}</li>`).join('');
  let tappaOra = -1; // -1: ancora in copertina
  function segnaTappa(i) {
    tappaOra = i;
    [...$('tappe').children].forEach((li, k) => { li.classList.toggle('ora', k === i); li.classList.toggle('fatta', k < i); });
    UI.testa(`${String(i + 1).padStart(2, '0')} · ${TAPPE[i].nome}`);
  }

  // dove si sta: su schermo un volo di camera, nel visore una dissolvenza e un posto nuovo
  async function vai(c, o) {
    if (imm()) { const v = typeof o.vr === 'function' ? o.vr() : o.vr; await c.attendi(VR.vai(v.gen, v.pos, v.yaw, v.area)); }
    else if (o.schermo) await c.attendi(Mondo.vola(...o.schermo));
  }
  // su schermo, la camera segue una posizione nel sistema della nave
  function segui(c, fn, rapidita) {
    let attivo = true;
    c.frame((dt) => {
      if (imm() || !attivo) return;
      const { p, g } = fn(), k = Math.min(1, dt * (rapidita || 1.6));
      Mondo.camera.position.lerp(p, k); Mondo.guardaVerso.lerp(g, k);
    });
    return { ferma() { attivo = false; } };
  }
  const PONTE = Scenari.PONTE;
  const sulPonte = () => ({ gen: Nave.esterno, pos: PONTE.pos, yaw: PONTE.yaw, area: PONTE.area });
  // al timone: la ruota a portata di mano, la chiesuola avanti a dritta
  const alTimone = () => ({ gen: Nave.esterno, pos: [Scenari.X0 + 10.7, Scenari.TETTO, 0], yaw: PONTE.yaw, area: PONTE.area });

  // il pontile galleggiante accanto alla nave (si muove con lei: si usa a nave ferma)
  const pontile = Scenari.pontile(8, 12); pontile.visible = false; Nave.esterno.add(pontile); pontile.position.set(-6, 0, 68);
  const _w = new THREE.Vector3();
  Mondo.ogniFrame.add((dt, t) => { if (!pontile.visible) return; pontile.getWorldPosition(_w); pontile.position.y = Mondo.altezza(_w.x, _w.z, t) * 0.5; });
  const sulPontile = () => ({ gen: pontile, pos: [0, 0.6, 3], yaw: 0, area: pontile.userData.area });
  // la piattaforma panoramica, sospesa in aria
  const panorama = Scenari.piattaforma(3); panorama.visible = false; Mondo.scena.add(panorama);
  function inPanorama(pos, guarda) { panorama.position.set(...pos); panorama.visible = true; return { gen: panorama, pos: [0, 0.05, 0], yaw: yawVerso(pos, guarda), area: panorama.userData.area }; }

  /* ================= comandi generali ================= */
  $('b-audio').addEventListener('click', () => { Suono.avvia(); $('b-audio').classList.toggle('spento', !Suono.commuta()); });
  $('b-schermo').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  function salta() { Suono.clic(); if (UI.schedaAperta) UI.chiudiSeAperta(); else if (ctx) ctx.salta(); }
  $('b-salta').addEventListener('click', salta);
  UI.onSalta = salta;
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || (e.key === 'ArrowRight' && !ctx?.usaFrecce)) && UI.schedaAperta) { e.preventDefault(); UI.chiudiSeAperta(); } });

  /* ================= motore delle tappe ================= */
  function nuovoContesto() {
    let saltaOk;
    const salto = new Promise((ok) => { saltaOk = ok; });
    const c = {
      pulizie: [],
      salta() { saltaOk(SALTO); },
      async attendi(p) { const r = await Promise.race([p, salto]); if (r === SALTO) throw SALTO; return r; },
      frame(f) { Mondo.ogniFrame.add(f); c.pulizie.push(() => Mondo.ogniFrame.delete(f)); },
      ascolta(el, ev, f, o) { el.addEventListener(ev, f, o); c.pulizie.push(() => el.removeEventListener(ev, f, o)); },
      poi(f) { c.pulizie.push(f); },
      pulisci() { while (c.pulizie.length) { try { c.pulizie.pop()(); } catch (e) { console.error(e); } } UI.pulisci(); },
    };
    return c;
  }
  let giro = 0;
  async function viaggio(da) {
    const mio = ++giro;
    if (!imm()) UI.mostra($('barra'), true);
    for (let i = da; i < TAPPE.length && mio === giro; i++) {
      segnaTappa(i);
      const c = ctx = nuovoContesto();
      try { await TAPPE[i].fn(c); } catch (e) { if (e !== SALTO) console.error(e); }
      c.pulisci();
      if (mio === giro) UI.chiudiSeAperta();
    }
    if (mio === giro) ctx = null;
  }
  // scheda finale di ogni tappa
  async function scopri(c, o) { await c.attendi(UI.scheda(o)); }

  /* ================= copertina ================= */
  Mondo.inquadra([-150, 9, 120], [40, 60, -200]);
  Cielo.U.uOpac.value = 1; Cielo.velocita = 0.02; Cielo.lst = 4.4;
  Nave.accendiLuci(true);
  // una sola schermata iniziale: benvenuto, scuola, titolo, partenza e firma
  $('b-scuola').textContent = CONFIG.scuola;
  UI.attiva($('copertina'), true);
  const titoloVr = { e: null };
  setTimeout(() => $('velo').classList.add('aperto'), 100);
  const respiro = (dt, t) => { if (!imm()) { Mondo.camera.position.x = -150 + Math.sin(t * 0.1) * 12; Mondo.camera.position.y = 9 + Math.sin(t * 0.35) * 1.2; } };
  Mondo.ogniFrame.add(respiro);
  scritte();
  function scritte() {
    const p = $('presenta'), testo = 'Benvenuti a scuola!'; let i = 0;
    const id = setInterval(() => { p.textContent = testo.slice(0, ++i); if (i >= testo.length) clearInterval(id); }, 45);
    const t = $('titolone'); t.innerHTML = '';
    [...'AL COMANDO'].forEach((ch, k) => { const s = document.createElement('span'); s.className = 'l'; s.textContent = ch === ' ' ? ' ' : ch; s.style.animationDelay = `${0.9 + k * 0.08}s`; t.appendChild(s); });
  }

  function togliCopertina() {
    UI.attiva($('copertina'), false); UI.copertina3d(null);
    if (titoloVr.e) { titoloVr.e.togli(); titoloVr.e = null; }
    Mondo.ogniFrame.delete(respiro);
  }
  function salpa() {
    Suono.avvia(); Suono.ambiente({ mare: 0.5 }); Suono.sirena();
    togliCopertina();
    viaggio(0);
  }
  $('b-salpa').addEventListener('click', salpa);

  // copertina nel visore (o nella VR simulata): sul pontile, di notte, col titolo nel cielo
  function copertinaImmersiva() {
    UI.attiva($('copertina'), false); UI.mostra($('barra'), false);
    Mondo.ogniFrame.delete(respiro);
    pontile.visible = true; VR.posto(pontile, [0, 0.6, 3], 0, pontile.userData.area);
    titoloVr.e = UI.etichetta('AL COMANDO<br>un viaggio in dieci tappe', inNave(-6, 40, -20), { grande: true, colore: '#E3C878', ang: 0.06 });
    UI.copertina3d({ scuola: CONFIG.scuola, sotto: 'Dieci tappe per prendere il mare', salpa });
  }
  // pulsanti per la VR: sempre visibili; se il browser non la permette, si spiega perché
  let vrSi = false, arSi = false;
  VR.supportata().then((si) => { vrSi = si; });
  VR.supportata('immersive-ar').then((si) => { arSi = si; if (si) document.querySelectorAll('.solo-camere').forEach((b) => { b.hidden = false; }); });
  async function entraVR(conCamere) {
    if (!(conCamere ? arSi : vrSi)) {
      const perche = !window.isSecureContext ? 'La VR si apre solo dal sito (https), non dal file aperto con doppio clic.'
        : !navigator.xr ? 'Questo browser non conosce la VR: apri la pagina con il browser del visore.'
        : conCamere ? 'Questo visore o browser non permette di usare le camere.' : 'Nessun visore collegato: apri la pagina con il browser del visore.';
      UI.avviso(perche, 'ko lungo', 5); return;
    }
    try {
      Suono.avvia();
      const tappa = tappaOra;
      // all'uscita si torna sullo schermo, alla stessa tappa
      await VR.entra(() => { location.hash = tappaOra >= 0 ? `tappa=${tappaOra + 1}` : ''; location.reload(); }, conCamere);
      if (tappa < 0 || !ctx) { togliCopertina(); copertinaImmersiva(); return; }
      // a viaggio iniziato: la tappa ricomincia, questa volta nel visore
      const vecchio = ctx; giro++; vecchio.salta(); await dorme(0.05);
      UI.chiudiSeAperta(); UI.pulisci();
      viaggio(tappa);
    } catch (e) { console.error(e); UI.avviso('Il visore non risponde', 'ko'); }
  }
  VR.esciProva = () => { location.hash = tappaOra >= 0 ? `tappa=${tappaOra + 1}` : ''; location.reload(); };
  document.querySelectorAll('[data-vr]').forEach((b) => b.addEventListener('click', () => entraVR(b.dataset.vr === 'camere')));
  // index.html#vr: la VR simulata sullo schermo; index.html#tappa=N apre direttamente una tappa
  const conVr = /(^#|&)vr\b/.test(location.hash);
  if (conVr) { VR.avviaProva(); copertinaImmersiva(); }
  const diretta = /tappa=(\d+)/.exec(location.hash);
  if (diretta) {
    togliCopertina();
    document.addEventListener('pointerdown', () => { Suono.avvia(); Suono.ambiente({ mare: 0.5 }); }, { once: true });
    viaggio(Math.min(TAPPE.length, Math.max(1, +diretta[1])) - 1);
  }
  $('b-ancora').addEventListener('click', ricomincia);
  async function ricomincia() {
    UI.attiva($('finale'), false); Suono.clic();
    if (ctx) { const vecchio = ctx; giro++; vecchio.salta(); await dorme(0.05); }
    Nave.svuota(); Nave.azzeraScia(); Nave.ripara(); Nave.modoFantasma(false);
    Object.assign(Nave.stato, { prora: 0, velocita: 0, barra: 0, accostata: 0, moto: null, sommergi: 0, assettoExtra: 0, cavita: 0, giri: 0 });
    Nave.esterno.position.set(0, 0, 0); Nave.esterno.rotation.y = 0;
    for (const k in medaglie) delete medaglie[k];
    viaggio(0);
  }

  /* ================= 1. Galleggiare: il carico e il bordo libero ================= */
  async function tappaCarico(c) {
    Nave.svuota(); Object.assign(Nave.stato, { velocita: 0, scia: false, prora: 0 }); Nave.esterno.rotation.y = 0;
    Mondo.cambiaAtmosfera('alba', 6);
    const o0 = Cielo.U.uOpac.value; Mondo.anima(4, (k) => { Cielo.U.uOpac.value = o0 * (1 - k); });
    Nave.accendiLuci(false);
    Suono.ambiente({ mare: 0.55 });
    pontile.visible = true; c.poi(() => { pontile.visible = false; });
    await vai(c, { schermo: [arr(inNave(-34, 22, 64)), arr(inNave(2, 7, 0)), 6, 60], vr: sulPontile() });
    await c.attendi(UI.cartello(1, 'Galleggiare', 'Una nave vuota non porta niente a nessuno'));

    UI.missione(imm() ? 'Prendi un <b>container</b> dalla pila a destra e portalo al <b>gancio della gru</b>: ogni viaggio imbarca un carico. Arriva <b>fino alla marca</b> di bordo libero, non oltre. Per rifinire c\'è il pannello.'
      : 'Carica la nave <b>fino alla marca</b> di bordo libero. Non oltre.');
    if (imm()) gruAMano(c);
    let caricando = false, tCarico = 0, ritmo = 0, ultimoTonfo = 0, fermo = 0, fatto = false;
    const P = UI.comandi([
      { tipo: 'misura', id: 'mis', titolo: 'bordo libero', valore: 0, marca: Nave.T_MARCA / Nave.D, testo: '' },
      { tipo: 'bottone', id: 'carica', testo: 'Tieni premuto\nCARICA', oro: true },
      { tipo: 'bottone', id: 'scarica', testo: 'Scarica' },
    ], (id, ev) => {
      if (id === 'carica' && ev === 'premi') { caricando = true; ritmo = 0; }
      if (id === 'carica' && ev === 'lascia') caricando = false;
      if (id === 'scarica' && ev === 'clic') { for (let i = 0; i < 4; i++) Nave.scarica(); }
    });
    c.ascolta(document, 'keydown', (e) => { if (e.code === 'Space' && !e.repeat) { caricando = true; ritmo = 0; } });
    c.ascolta(document, 'keyup', (e) => { if (e.code === 'Space') caricando = false; });
    c.ascolta(window, 'pointerup', () => { if (!imm()) caricando = false; });
    const marca = UI.etichetta('marca di bordo libero ↓', () => Nave.posMarca().add(new THREE.Vector3(-2, 6.2, 0)), { mano: true, ang: 0.05 });
    c.poi(() => marca.togli());
    Nave.onAtterra = () => { const ora = performance.now(); if (ora - ultimoTonfo > 70) { Suono.tonfo(); ultimoTonfo = ora; } };
    c.poi(() => { Nave.onAtterra = null; });

    const finito = new Promise((ok) => {
      c.frame((dt) => {
        if (fatto) return;
        if (caricando) {
          ritmo = Math.min(Nave.stato.mira > Nave.T_MARCA - 0.7 ? 5 : 24, ritmo + dt * 18); tCarico += dt;
          while (tCarico > 1 / Math.max(5, ritmo)) { tCarico -= 1 / Math.max(5, ritmo); Nave.carica(); }
        }
        const scarto = Nave.stato.mira - Nave.T_MARCA, bl = Nave.D - Nave.stato.pescaggio;
        P.agg('mis', { valore: Nave.stato.pescaggio / Nave.D, testo: bl.toFixed(1).replace('.', ',') + ' m', bordo: scarto > 0.16 ? '#E0503F' : scarto > -0.16 ? '#3FB27F' : '' });
        UI.stato(scarto > 0.16 ? '<b>Oltre la marca!</b> Troppo carico: scarica qualche container.'
          : scarto > -0.16 ? '<b>Sulla marca.</b> Lascia il tasto: perfetto così.'
          : `A bordo <b>${Nave.caricati}</b> container da 40′ = <b>${Nave.caricati * 2} TEU</b>`);
        if (!caricando && Nave.atterrati === Nave.caricati && Math.abs(scarto) <= 0.16) fermo += dt; else fermo = 0;
        if (fermo > 0.9) { fatto = true; ok(); }
      });
    });
    await c.attendi(finito);
    medaglie.carico = true;
    Suono.ok(); UI.avviso('Carico perfetto!', 'ok');
    UI.pulisci(); marca.togli();
    const teu = Nave.caricati * 2;
    if (!imm()) Mondo.vola(arr(inNave(-70, 30, 85)), arr(inNave(0, 8, 0)), 3);
    await scopri(c, {
      titolo: 'Il bordo libero',
      html: `<p>Il <b>bordo libero</b> (<em>freeboard</em>) è la distanza verticale tra il galleggiamento e il ponte stagno più alto. Più la nave si immerge, meno bordo libero resta.</p>
        <p>Il bordo libero minimo è il livello oltre il quale la nave non può immergersi. Dal 1876, grazie a <b>Samuel Plimsoll</b>, si legge da fuori: è la marca sulla murata.</p>
        <div class="grande-dato">${teu} TEU a bordo</div>
        <p>Il traffico dei porti si misura in <b>TEU</b>: l'unità è il container da 20 piedi. Uno da 40 piedi vale 2 TEU.</p>`,
      fonte: 'Lezioni 13 e 20 (slide 4, 5, 22). Marca ingrandita, nave e carico: disegno schematico.',
    });
  }

  // nel visore: container in miniatura da prendere con le mani e agganciare alla gru
  function gruAMano(c) {
    const g = new THREE.Group(); pontile.add(g); c.poi(() => pontile.remove(g));
    const PIANO = 0.6; // piano di calpestio del pontile
    // cavalletto con la pila, a destra di chi guarda la nave
    const legno = new THREE.MeshLambertMaterial({ color: '#6b4a2b' });
    const cav = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.45), legno); cav.position.set(1.5, PIANO + 0.425, 2.3); g.add(cav);
    const COLORI = ['#b7412e', '#2d5c9e', '#d08a2a', '#2f8f6a', '#c9c3b6', '#7a3f8c'];
    const geoC = new THREE.BoxGeometry(0.5, 0.2, 0.2), geoE = new THREE.EdgesGeometry(geoC);
    const posti = [0, 1, 2].map((i) => new THREE.Vector3(1.5, PIANO + 0.85 + 0.1 + i * 0.205, 2.3));
    // gancio della gru, davanti a sinistra, col cavo che sale verso il cielo
    const gancio = new THREE.Group(); g.add(gancio);
    const RIPOSO = new THREE.Vector3(-0.7, PIANO + 1.25, 1.9); gancio.position.copy(RIPOSO);
    const oro = new THREE.MeshLambertMaterial({ color: '#C9A227', emissive: '#3a2a04' });
    const anello = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 24), oro); anello.position.y = 0.12; gancio.add(anello);
    const unc = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20, Math.PI * 1.3), oro); unc.rotation.z = Math.PI * 0.85; gancio.add(unc);
    const bilancino = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.05), new THREE.MeshLambertMaterial({ color: '#e6b422' })); bilancino.position.y = -0.09; gancio.add(bilancino);
    const cavo = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 40, 6), new THREE.MeshLambertMaterial({ color: '#30343a' })); cavo.position.y = 20.15; gancio.add(cavo);
    const alone = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0, depthWrite: false }));
    alone.position.y = -0.2; gancio.add(alone);
    const eGancio = UI.etichetta('gancio della gru', () => gancio.localToWorld(new THREE.Vector3(0, 0.32, 0)), { mano: true, ang: 0.03 });
    const ePila = UI.etichetta('container', () => g.localToWorld(posti[2].clone().add(new THREE.Vector3(0, 0.3, 0))), { mano: true, ang: 0.03 });
    c.poi(() => { eGancio.togli(); ePila.togli(); });
    let occupato = false, inMano = 0;
    const scatola = (i) => {
      const m = new THREE.Mesh(geoC, new THREE.MeshLambertMaterial({ color: COLORI[(i + Math.floor(Math.random() * 6)) % 6] }));
      m.add(new THREE.LineSegments(geoE, new THREE.LineBasicMaterial({ color: '#1b1b1b' })));
      m.position.copy(posti[i]); g.add(m);
      const vicinoGancio = () => m.getWorldPosition(new THREE.Vector3()).distanceTo(gancio.localToWorld(new THREE.Vector3(0, -0.2, 0))) < 0.38;
      const togli = VR.afferrabile(m, {
        raggio: 0.2,
        prendi() { inMano++; Suono.clic(); },
        lascia() {
          inMano--;
          if (!occupato && vicinoGancio()) { togli(); aggancia(m, i); return; }
          // torna sulla pila
          const p0 = m.position.clone(), q0 = m.quaternion.clone(), q1 = new THREE.Quaternion();
          Mondo.anima(0.45, (k) => { m.position.lerpVectors(p0, posti[i], k); m.quaternion.slerpQuaternions(q0, q1, k); });
        },
        evidenzia(si) { m.material.emissive.set(si ? '#3a2a04' : '#000000'); },
      });
      c.poi(togli);
    };
    posti.forEach((p, i) => scatola(i));
    c.frame((dt, t) => { alone.material.opacity = inMano > 0 && !occupato ? 0.18 + Math.sin(t * 6) * 0.08 : 0; });
    async function aggancia(m, i) {
      occupato = true; Suono.boa?.();
      const p0 = m.position.clone(), q0 = m.quaternion.clone(), sotto = RIPOSO.clone().add(new THREE.Vector3(0, -0.21, 0)), q1 = new THREE.Quaternion();
      await Mondo.anima(0.2, (k) => { m.position.lerpVectors(p0, sotto, k); m.quaternion.slerpQuaternions(q0, q1, k); });
      // il gancio sale verso la nave e porta su il carico; intanto sulla pila compare già il container successivo
      scatola(i);
      const meta = Math.round(Nave.posti.length * 0.78), resto = meta - Nave.caricati;
      const n = resto > 4 ? Math.ceil(resto * 0.7) : 1; // viaggi grossi all'inizio, uno alla volta vicino alla marca
      for (let k = 0; k < n; k++) setTimeout(() => Nave.carica(), 150 + k * 35);
      const verso = g.worldToLocal(inNave(0, Nave.D + 6, 0)).sub(RIPOSO);
      await Mondo.anima(0.9, (k) => { const e = k * k; gancio.position.copy(RIPOSO).addScaledVector(verso, e * 0.25); gancio.position.y += e * 14; m.position.copy(gancio.position); m.position.y -= 0.21; });
      g.remove(m);
      gancio.position.copy(RIPOSO); gancio.position.y += 3;
      await Mondo.anima(0.45, (k) => { gancio.position.y = RIPOSO.y + 3 * (1 - Mondo.dolce(k)); });
      occupato = false;
    }
  }

  // nel visore: un modellino della nave su un piedistallo; si prende e si muove, e la nave vera lo imita
  function modellinoAMano(c, segna, restQ) {
    const s = 0.65 / Nave.L, mod = new THREE.Group();
    const box = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); mod.add(m); return m; };
    box(Nave.L * s, 0.028, Nave.B * s, '#b7412e', 0, 0.014, 0);
    box(Nave.L * s, 0.028, Nave.B * s, '#13315c', 0, 0.042, 0);
    box(0.05, 0.07, Nave.B * s * 0.9, '#e8e6df', -Nave.L * s / 2 + 0.06, 0.09, 0);
    ['#b7412e', '#2d5c9e', '#d08a2a', '#2f8f6a', '#c9c3b6'].forEach((col, i) => box(0.08, 0.03, Nave.B * s * 0.8, col, -0.17 + i * 0.09, 0.071, 0));
    const oro = new THREE.MeshBasicMaterial({ color: '#E3C878', toneMapped: false });
    const asse = (dir, l) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, l, 6), oro); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.position.copy(dir).multiplyScalar(l / 2).add(new THREE.Vector3(0, 0.06, 0)); mod.add(m); };
    asse(new THREE.Vector3(1, 0, 0), 0.45); asse(new THREE.Vector3(0, 0, 1), 0.16); asse(new THREE.Vector3(0, 1, 0), 0.16);
    // piedistallo davanti a chi sta sulla piattaforma
    const rig = Mondo.rig, yaw = rig.rotation.y, av = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const restP = av.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 1.1, 0));
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.0, 16), new THREE.MeshLambertMaterial({ color: '#e8e6df' }));
    ped.position.copy(restP).add(new THREE.Vector3(0, -0.55, 0)); panorama.add(ped);
    const alone = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.006, 8, 48), new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.25, toneMapped: false }));
    alone.rotation.x = Math.PI / 2; alone.position.copy(restP).add(new THREE.Vector3(0, -0.02, 0)); panorama.add(alone);
    mod.position.copy(restP); mod.quaternion.copy(restQ); panorama.add(mod);
    c.poi(() => { panorama.remove(mod, ped, alone); Nave.stato.manuale = null; });
    const qInv = restQ.clone().invert(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), e = new THREE.Euler();
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    let ultimo = null;
    const togli = VR.afferrabile(mod, {
      raggio: 0.3,
      prendi() { Nave.stato.moto = null; ultimo = null; },
      muovi(M) {
        panorama.updateWorldMatrix(true, false);
        panorama.matrixWorld.clone().invert().multiply(M).decompose(_p, _q, _s);
        e.setFromQuaternion(qInv.clone().multiply(_q), 'XYZ');
        const rx = cl(e.x, 0.45), ry = cl(e.y, 0.45), rz = cl(e.z, 0.45); // x: rollio, y (verticale): imbardata, z (trasversale): beccheggio
        const d = _p.clone().sub(restP).applyQuaternion(qInv); d.set(cl(d.x, 0.15), cl(d.y, 0.15), cl(d.z, 0.15));
        mod.quaternion.copy(restQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')));
        mod.position.copy(restP).add(d.clone().applyQuaternion(restQ));
        Nave.stato.manuale = { rx: rx * 0.7, ry: rz * 0.5, rz: ry * 0.8, tx: d.x * 70, ty: d.z * 60, tz: d.y * 20 };
        // quale moto sta facendo? quello di ampiezza (relativa) maggiore, se chiaro
        const v = { rollio: Math.abs(rx) / 0.2, imbardata: Math.abs(ry) / 0.25, beccheggio: Math.abs(rz) / 0.15, avanzo: Math.abs(d.x) / 0.07, deriva: Math.abs(d.z) / 0.06, sussulto: Math.abs(d.y) / 0.06 };
        const ord = Object.entries(v).sort((a, b) => b[1] - a[1]);
        if (ord[0][1] > 1 && ord[0][1] > ord[1][1] * 1.5 && ord[0][0] !== ultimo) { ultimo = ord[0][0]; segna(ultimo); }
      },
      lascia() {
        const p0 = mod.position.clone(), q0 = mod.quaternion.clone(), m0 = { ...(Nave.stato.manuale || {}) };
        Mondo.anima(0.6, (k) => {
          mod.position.lerpVectors(p0, restP, k); mod.quaternion.slerpQuaternions(q0, restQ, k);
          if (Nave.stato.manuale) for (const x in m0) Nave.stato.manuale[x] = m0[x] * (1 - k);
        }).then(() => { if (!mod.parent || VR.fonti.some((f) => f.tiene) || VR.mouse.tiene) return; Nave.stato.manuale = null; });
      },
      evidenzia(si) { alone.material.opacity = si ? 0.9 : 0.25; },
    });
    c.poi(togli);
  }

  /* ================= 2. I sei moti ================= */
  async function tappaMoti(c) {
    pieno(); Object.assign(Nave.stato, { velocita: 0, scia: false, moto: null }); Nave.azzeraScia();
    Mondo.cambiaAtmosfera('giorno', 5); Cielo.U.uOpac.value = 0; Nave.accendiLuci(false);
    Suono.ambiente({ mare: 0.5, vento: 0.05 });
    // nel visore la piattaforma è bassa sull'acqua: la nave resta sopra il pannello di bordo
    const dove = arr(inNave(-80, 7, 110)), guarda = arr(inNave(0, 12, 0));
    await vai(c, { schermo: [arr(inNave(-120, 50, 150)), guarda, 5, 40], vr: () => inPanorama(dove, guarda) });
    c.poi(() => { panorama.visible = false; Nave.stato.moto = null; });
    // i tre assi della nave, in oro
    const assi = new THREE.Group(); Nave.corpo.add(assi); c.poi(() => Nave.corpo.remove(assi));
    const freccia = (dir, lung, col) => {
      const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, lung, 10), m); t.position.y = lung / 2; g.add(t);
      const p = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 14), m); p.position.y = lung + 3; g.add(p);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.position.set(0, Nave.D * 0.6, 0); t.renderOrder = p.renderOrder = 50;
      assi.add(g); return m;
    };
    const ASSI = { x: freccia(new THREE.Vector3(1, 0, 0), 82, '#E3C878'), y: freccia(new THREE.Vector3(0, 0, 1), 32, '#E3C878'), z: freccia(new THREE.Vector3(0, 1, 0), 32, '#E3C878') };
    const eti = [
      UI.etichetta('x · da poppa a prua', () => Nave.corpo.localToWorld(new THREE.Vector3(90, Nave.D * 0.6 + 4, 0)), { mano: true }),
      UI.etichetta('y · da sinistra a dritta', () => Nave.corpo.localToWorld(new THREE.Vector3(0, Nave.D * 0.6 + 4, 38)), { mano: true }),
      UI.etichetta('z · dal basso in alto', () => Nave.corpo.localToWorld(new THREE.Vector3(0, Nave.D * 0.6 + 40, 0)), { mano: true }),
    ];
    c.poi(() => eti.forEach((e) => e.togli()));
    await c.attendi(UI.cartello(2, 'I sei moti', 'Tre assi, sei modi di muoversi'));

    const DESCR = {
      rollio: ['x', 'Rollio: rotazione attorno all\'asse <b>x</b>, l\'inclinazione da un lato all\'altro.'],
      beccheggio: ['y', 'Beccheggio: rotazione attorno all\'asse <b>y</b>, l\'inclinazione di prua e di poppa.'],
      imbardata: ['z', 'Accostata o imbardata: rotazione attorno all\'asse <b>z</b>, la variazione della rotta.'],
      avanzo: ['x', 'Avanzo: traslazione lungo l\'asse <b>x</b>, lungo la lunghezza della nave.'],
      deriva: ['y', 'Deriva o scarroccio: traslazione lungo l\'asse <b>y</b>, in direzione trasversale.'],
      sussulto: ['z', 'Sussulto: traslazione lungo l\'asse <b>z</b>, verso l\'alto o verso il basso.'],
    };
    const provati = new Set();
    UI.missione(imm() ? 'Davanti a te c\'è il <b>modellino</b> della nave. Prendilo e muovilo: inclinalo, giralo, spostalo. La nave vera ti imita. Trova <b>tutti e sei i moti</b>.'
      : 'Prova <b>tutti e sei i moti</b> della nave: tre rotazioni e tre traslazioni.');
    let ok; const finito = new Promise((r) => { ok = r; });
    let tFine = null; c.poi(() => clearTimeout(tFine));
    function segna(id) {
      const nuovo = !provati.has(id); provati.add(id);
      if (nuovo) { Suono.boa?.(); UI.avviso(id[0].toUpperCase() + id.slice(1), 'ok', 1.2); } else Suono.clic();
      for (const k in ASSI) ASSI[k].opacity = k === DESCR[id][0] ? 1 : 0.18;
      UI.stato(`${DESCR[id][1]} <b>${provati.size} di 6</b>`);
      if (provati.size === 6 && !tFine) tFine = setTimeout(ok, 3500);
    }
    UI.comandi([
      { tipo: 'bottone', id: 'rollio', testo: '⟲ Rollio' }, { tipo: 'bottone', id: 'beccheggio', testo: '⟲ Beccheggio' }, { tipo: 'bottone', id: 'imbardata', testo: '⟲ Imbardata' },
      { tipo: 'a capo' },
      { tipo: 'bottone', id: 'avanzo', testo: '⇄ Avanzo' }, { tipo: 'bottone', id: 'deriva', testo: '⇄ Deriva' }, { tipo: 'bottone', id: 'sussulto', testo: '⇅ Sussulto' },
    ], (id, ev) => {
      if (ev !== 'clic' || !DESCR[id]) return;
      Nave.stato.manuale = null; Nave.stato.moto = id; Nave.stato.tMoto = 0; segna(id);
    });
    if (imm()) { VR.pannello.lato = 0.6; VR.pannello.ricentra = true; c.poi(() => { VR.pannello.lato = 0; VR.pannello.ricentra = true; }); modellinoAMano(c, segna, Nave.esterno.getWorldQuaternion(new THREE.Quaternion())); }
    await c.attendi(finito);
    medaglie.moti = true; Suono.ok();
    UI.pulisci(); Nave.stato.moto = null; Nave.stato.manuale = null;
    await scopri(c, {
      titolo: 'I sei moti della nave',
      html: `<p>Il riferimento della nave è una <b>terna cartesiana</b>: <b>x</b> da poppa a prua, <b>y</b> da sinistra a dritta, <b>z</b> dal basso verso l'alto.</p>
        <p>Lungo i tre assi la nave può spostarsi in tre modi e attorno ai tre assi può ruotare in tre modi: sono i <b>sei moti</b>.</p>
        <div class="grande-dato">3 + 3</div>
        <p>Rotazioni: rollio, beccheggio, imbardata. Traslazioni: avanzo, deriva, sussulto.</p>`,
      fonte: 'Lezione 4 (slide 4, 5). Ampiezze dei moti esagerate: disegno schematico.',
    });
  }

  /* ================= 3. L'elica e la cavitazione ================= */
  async function tappaElica(c) {
    pieno(); Object.assign(Nave.stato, { velocita: 0, scia: false, moto: null, assettoExtra: 0, giri: 0 });
    Cielo.U.uOpac.value = 0;
    // si scende sott'acqua, vicino alla poppa
    const pos = [Nave.XE - 1, -7.4, 9.5], guardaLoc = [Nave.XE, -3, 0];
    if (!imm()) await c.attendi(Mondo.vola(arr(inNave(Nave.XE - 30, 6, 40)), arr(inNave(...guardaLoc)), 3));
    else await c.attendi(VR.dissolvi(1, 0.45));
    Mondo.cambiaAtmosfera('sottacqua', imm() ? 0 : 1.5);
    Suono.ambiente({ mare: 0.9, vento: 0 });
    c.poi(() => { Mondo.cambiaAtmosfera('giorno', 0); Object.assign(Nave.stato, { assettoExtra: 0, giri: 0, cavita: 0 }); });
    await vai(c, { schermo: [arr(inNave(Nave.XE - 7, -6.5, 15)), arr(inNave(...guardaLoc)), 2.5], vr: { gen: Nave.esterno, pos, yaw: 0, area: { x0: Nave.XE - 6, x1: Nave.XE + 4, z0: 6, z1: 13 } } });
    segui(c, () => ({ p: inNave(Nave.XE - 7, -6.5, 15), g: Nave.elica.getWorldPosition(new THREE.Vector3()) }), 2);
    Mondo.anima(3, (k) => { Nave.stato.giri = 1.3 * k; });
    await c.attendi(UI.cartello(3, "L'elica", 'Sotto il pelo dell\'acqua'));

    UI.missione('L\'elica spinge la nave. <b>Alleggerisci la poppa</b> finché l\'elica sale verso la superficie: che cosa succede?');
    let su = false, giu = false, tempo = 0, ok;
    const finito = new Promise((r) => { ok = r; });
    const P = UI.comandi([
      { tipo: 'misura', id: 'prof', titolo: 'profondità elica', valore: 0.7, marca: 0, testo: '' },
      { tipo: 'bottone', id: 'su', testo: 'Tieni premuto\nalleggerisci poppa', oro: true },
      { tipo: 'bottone', id: 'giu', testo: 'Tieni premuto\nappesantisci poppa' },
    ], (id, ev) => {
      const v = ev === 'premi' ? true : ev === 'lascia' ? false : null; if (v === null) return;
      if (id === 'su') su = v; if (id === 'giu') giu = v;
    });
    c.ascolta(window, 'pointerup', () => { if (!imm()) { su = giu = false; } });
    const _e = new THREE.Vector3();
    c.frame((dt) => {
      const s = Nave.stato;
      if (su) s.assettoExtra = Math.max(-0.075, s.assettoExtra - dt * 0.012);
      if (giu) s.assettoExtra = Math.min(0, s.assettoExtra + dt * 0.02);
      Nave.elica.getWorldPosition(_e);
      const prof = -_e.y; // profondità del centro dell'elica (grafica)
      s.cavita = Math.max(0, Math.min(1, (3.4 - prof) / 1.6));
      P.agg('prof', { valore: Math.max(0, Math.min(1, prof / 8)) });
      UI.stato(s.cavita > 0.5 ? '<b>Bolle!</b> L\'elica è poco immersa: è la cavitazione.' : s.cavita > 0 ? 'Qualche bolla… ancora un poco.' : 'L\'elica è ben immersa: nessuna bolla.');
      if (s.cavita > 0.55) tempo += dt; else tempo = 0;
      if (tempo > 2.5) ok();
    });
    await c.attendi(finito);
    medaglie.elica = true; Suono.ok(); UI.avviso('Cavitazione!', 'ok');
    UI.pulisci();
    await scopri(c, {
      titolo: 'La cavitazione',
      html: `<p>L'elica è come una pompa: aspira acqua da prua e la spinge a poppa. Sul <b>dorso</b> della pala la pressione cala; se cala troppo, l'acqua forma bolle di vapore: è la <b>cavitazione</b>.</p>
        <p>La causa principale è la posizione dell'elica: se è <b>troppo poco immersa</b>, la pressione dell'acqua è bassa. Contano anche l'assetto, il mare mosso e il disegno dell'elica.</p>
        <p>Le implosioni delle bolle «martellano» le pale: meno efficienza, stress per il motore, erosione dell'elica.</p>`,
      fonte: 'Lezione 10 (slide 17, 18, 19, 20). Elica, assetto e bolle: disegno schematico.',
    });
    // si risale
    if (imm()) await c.attendi(VR.dissolvi(1, 0.45));
    Mondo.cambiaAtmosfera('giorno', 0); Object.assign(Nave.stato, { assettoExtra: 0, cavita: 0 });
  }

  /* ================= 4. Governare: il timone e le boe ================= */
  function svgRuota() {
    let razze = '';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
      razze += `<line x1="${50 + x * 10}" y1="${50 + y * 10}" x2="${50 + x * 47}" y2="${50 + y * 47}" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/><circle cx="${50 + x * 47}" cy="${50 + y * 47}" r="3.6" fill="#a8743d"/>`;
    }
    return `<svg viewBox="0 0 100 100">${razze}<circle cx="50" cy="50" r="36" fill="none" stroke="#a8743d" stroke-width="7"/>
      <circle cx="50" cy="50" r="36" fill="none" stroke="#C9A227" stroke-width="1.5" stroke-dasharray="2 4"/><circle cx="50" cy="50" r="10" fill="#C9A227" stroke="#7d5a0c" stroke-width="2"/><circle cx="50" cy="3" r="4" fill="#E3C878"/></svg>`;
  }
  // il timone: ruota 3D sul ponte (visore), ruota SVG o frecce (schermo). Restituisce l'aggiornamento per ogni fotogramma
  function prendiTimone(c, P) {
    const T = Scenari.timone; T.angolo = 0; T.attiva = true; Scenari.colonna.visible = true;
    VR.pannello.lato = 0.55; VR.pannello.ricentra = true; // nel visore il pannello sta a sinistra: davanti c'è la ruota
    c.poi(() => { VR.pannello.lato = 0; VR.pannello.ricentra = true; T.attiva = false; T.presa = null; Scenari.colonna.visible = false; c.usaFrecce = false; });
    c.usaFrecce = true;
    const ruota = P.el.ruota;
    if (ruota) {
      const svg = ruota.querySelector('svg'); let presa = null;
      const angolo = (e) => { const r = ruota.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
      c.ascolta(ruota, 'pointerdown', (e) => { e.preventDefault(); ruota.setPointerCapture(e.pointerId); presa = angolo(e); Suono.clic(); });
      c.ascolta(ruota, 'pointermove', (e) => { if (presa === null) return; const a = angolo(e); let d = a - presa; d = Math.atan2(Math.sin(d), Math.cos(d)); T.angolo = Math.max(-Math.PI * 1.5, Math.min(Math.PI * 1.5, T.angolo + d)); presa = a; });
      c.ascolta(ruota, 'pointerup', () => { presa = null; });
      c.ascolta(ruota, 'dblclick', () => { T.angolo = 0; });
      c.frame(() => { svg.style.transform = `rotate(${T.angolo}rad)`; });
    }
    const tasti = {};
    c.ascolta(document, 'keydown', (e) => { tasti[e.key] = true; });
    c.ascolta(document, 'keyup', (e) => { tasti[e.key] = false; });
    return (dt) => {
      if (tasti.ArrowLeft) T.angolo = Math.max(-Math.PI * 1.5, T.angolo - dt * 3);
      if (tasti.ArrowRight) T.angolo = Math.min(Math.PI * 1.5, T.angolo + dt * 3);
      Nave.stato.barra = T.angolo / (Math.PI * 1.5) * 35;
      const b = Math.round(Nave.stato.barra);
      return { valore: Math.abs(b) + '°', sotto: b > 0 ? 'a dritta' : b < 0 ? 'a sinistra' : 'al centro' };
    };
  }
  const dietro = (d, h, avanti, hg) => () => ({ p: inNave(-d, h, 0), g: inNave(avanti, hg, 0) });

  async function tappaTimone(c) {
    pieno(); Cielo.U.uOpac.value = 0; Nave.accendiLuci(false);
    Mondo.cambiaAtmosfera('giorno', 4);
    Suono.ambiente({ mare: 0.5, vento: 0.06 });
    Nave.stato.scia = true; Nave.stato.barra = 0;
    Mondo.anima(5, (k) => { Nave.stato.velocita = 14 * k; });
    await vai(c, { schermo: [arr(inNave(-150, 50, 0)), arr(inNave(90, -6, 0)), 4, 50], vr: alTimone() });
    segui(c, dietro(150, 50, 90, -6));
    await c.attendi(UI.cartello(4, 'Governare', 'La rotta la decidi tu'));

    // boe: tre porte da attraversare (rossa a sinistra, verde a dritta)
    const porte = [];
    const geoB = new THREE.CylinderGeometry(1.6, 2.2, 6, 14), geoC = new THREE.ConeGeometry(1.6, 3, 14), geoF = new THREE.CylinderGeometry(3, 3, 120, 16, 1, true);
    function boa(colore) {
      const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: colore });
      const b = new THREE.Mesh(geoB, m); b.position.y = 1.5; g.add(b);
      const cn = new THREE.Mesh(geoC, m); cn.position.y = 6; g.add(cn);
      const luce = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: colore, toneMapped: false })); luce.position.y = 8.2; g.add(luce);
      const fascio = new THREE.Mesh(geoF, new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      fascio.position.y = 60; g.add(fascio);
      g.userData = { luce, fascio }; return g;
    }
    function piazza(porta, cx, cz, a) {
      porta.cx = cx; porta.cz = cz; porta.dx = Math.cos(a); porta.dz = -Math.sin(a); porta.lato = null;
      const nx = -porta.dz, nz = porta.dx;
      porta.r.position.set(cx - nx * 38, 0, cz - nz * 38); porta.v.position.set(cx + nx * 38, 0, cz + nz * 38);
      [porta.r, porta.v].forEach((bo) => { bo.userData.fascio.material.opacity = 0.22; });
    }
    const s0 = Nave.esterno.position.clone(), a0 = Nave.stato.prora;
    for (const [av, la] of [[330, -110], [680, 120], [1030, -90]]) {
      const p = { r: boa('#d23a2f'), v: boa('#2f9a5a') };
      Mondo.scena.add(p.r, p.v);
      const fx = Math.cos(a0), fz = -Math.sin(a0), nx = -fz, nz = fx;
      piazza(p, s0.x + fx * av + nx * la, s0.z + fz * av + nz * la, a0 - Math.atan2(la, av) * 0.4);
      porte.push(p);
    }
    c.poi(() => porte.forEach((p) => Mondo.scena.remove(p.r, p.v)));
    let attuale = 0;
    const segno = UI.etichetta('▼<br>boa 1 di 3', () => new THREE.Vector3(porte[Math.min(attuale, 2)].cx, 40, porte[Math.min(attuale, 2)].cz), { bordo: true, ang: 0.03 });
    c.poi(() => segno.togli());

    UI.missione('Prendi il timone e <b>passa tra le boe</b>, rossa e verde. Sono tre.' + (imm() ? ' Afferra la ruota con la mano (grilletto, pulsante laterale o pizzico) e girala, anche a due mani. Da lontano basta il raggio.' : ''));
    const P = UI.comandi([
      { tipo: 'lettura', id: 'barra', titolo: 'angolo di barra', valore: '0°', sotto: 'al centro' },
      { tipo: 'ruota', svg: svgRuota() },
      { tipo: 'lettura', id: 'prora', titolo: 'prora', valore: '090°', sotto: 'avanti tutta' },
    ]);
    const timone = prendiTimone(c, P);
    const finito = new Promise((ok) => {
      c.frame((dt) => {
        if (attuale >= porte.length) return;
        P.agg('barra', timone(dt));
        P.agg('prora', { valore: tre(pv()) });
        const t = Mondo.tempo;
        porte.forEach((p, i) => { const on = Math.sin(t * 4 + i) > 0; p.r.userData.luce.visible = on; p.v.userData.luce.visible = !on;
          [p.r, p.v].forEach((bo) => { bo.position.y = Mondo.altezza(bo.position.x, bo.position.z, t) - 0.5; bo.rotation.z = Math.sin(t * 1.3 + i) * 0.08; }); });
        const p = porte[attuale], [sx, sz] = Nave.puntoMondo(0, 0);
        const lungo = (sx - p.cx) * p.dx + (sz - p.cz) * p.dz, lat = (sx - p.cx) * -p.dz + (sz - p.cz) * p.dx, lato = lungo > 0;
        if (p.lato === false && lato) {
          if (Math.abs(lat) < 46) {
            Suono.boa(); UI.avviso(`Boa ${attuale + 1} di 3 ✓`, 'ok');
            [p.r, p.v].forEach((bo) => { bo.userData.fascio.material.opacity = 0; });
            attuale++;
            if (attuale >= porte.length) { ok(); return; }
            segno.testo = `▼<br>boa ${attuale + 1} di 3`;
          } else if (Math.abs(lat) < 400) {
            Suono.no(); UI.avviso('Mancata! Ecco un\'altra boa', 'ko');
            const [nx, nz] = Nave.puntoMondo(380, 0); piazza(p, nx, nz, Nave.stato.prora + (Math.random() - 0.5) * 0.6);
          }
        }
        p.lato = lato;
        if (Math.hypot(sx - p.cx, sz - p.cz) > 1500) { const [nx, nz] = Nave.puntoMondo(600, 0); piazza(p, nx, nz, Nave.stato.prora); }
        UI.stato(`Boe superate: <b>${attuale} di 3</b>.` + (imm() ? '' : ' Gira la ruota o usa ← →.'));
      });
    });
    await c.attendi(finito);
    medaglie.timone = true; Suono.ok();
    UI.pulisci(); segno.togli();
    const b0 = Nave.stato.barra; Mondo.anima(3, (k) => { Nave.stato.barra = b0 * (1 - k); });
    await scopri(c, {
      titolo: 'Il timone',
      html: `<p>Il <b>timone</b> è l'organo che consente di variare la prora della nave. La sua pala, a poppavia dell'elica, si ruota dell'<b>angolo di barra</b> (<em>rudder angle</em>).</p>
        <p>Quando la pala forma un angolo con i filetti fluidi nasce una forza (<em>rudder force</em>) che fa ruotare la nave.</p>
        <div class="grande-dato">30–35°</div>
        <p>Sono gli angoli di barra con gli effetti evolutivi massimi. L'effetto è assente a nave ferma e cresce rapidamente con la velocità.</p>`,
      fonte: 'Lezione 11 (slide 6, 9, 10, 25).',
    });
  }

  /* ================= 5. La bussola ================= */
  // la lente: un tratto della rosa ingrandito, centrato sulla prora bussola, con la linea di fede rossa al centro
  function lenteRosa() {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 240; const x = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const obj = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    obj.renderOrder = 8000;
    let ultimo = null;
    function poni(pb) {
      const v = Math.round(pb * 10) / 10; if (v === ultimo) return; ultimo = v;
      const W = cv.width, H = cv.height, PX = 14; // pixel per grado
      x.clearRect(0, 0, W, H);
      VR.arrotondato(x, 4, 4, W - 8, H - 8, 26); x.fillStyle = 'rgba(11,37,69,0.92)'; x.fill(); x.strokeStyle = '#E3C878'; x.lineWidth = 4; x.stroke();
      x.save(); VR.arrotondato(x, 8, 8, W - 16, H - 16, 22); x.clip();
      x.fillStyle = '#F4EFE2'; x.fillRect(8, 70, W - 16, 120); // la rosa
      x.strokeStyle = '#1b1b1b'; x.fillStyle = '#1b1b1b'; x.textAlign = 'center'; x.textBaseline = 'top';
      const nomi = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      for (let g = Math.floor(v - 25); g <= Math.ceil(v + 25); g++) {
        const px = W / 2 + (g - v) * PX, gg = ((g % 360) + 360) % 360;
        const lungo = gg % 10 === 0 ? 46 : gg % 5 === 0 ? 32 : 18;
        x.lineWidth = gg % 10 === 0 ? 3 : 1.5; x.beginPath(); x.moveTo(px, 70); x.lineTo(px, 70 + lungo); x.stroke();
        if (gg % 10 === 0) { x.font = '700 34px Bitter, serif'; x.fillText(nomi[gg] || String(gg).padStart(3, '0'), px, 122); }
      }
      x.restore();
      // linea di fede
      x.strokeStyle = '#E0503F'; x.lineWidth = 5; x.beginPath(); x.moveTo(W / 2, 54); x.lineTo(W / 2, 200); x.stroke();
      x.fillStyle = '#E3C878'; x.font = '700 26px Atkinson, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'top';
      x.fillText('linea di fede', W / 2, 18); x.fillStyle = '#D8E0EC'; x.font = '22px Atkinson, sans-serif'; x.fillText('la rosa vista da vicino', W / 2, 206);
      tex.needsUpdate = true;
    }
    return { obj, poni, via: () => { tex.dispose(); obj.geometry.dispose(); obj.material.dispose(); } };
  }
  // esempio della slide 31: d = 3,0° E, δ = 3,9° W → V = d + δ = −0,9°; con Pb = 150° si ha Pv = 149,1°
  const D_DECL = 3.0, DELTA = -3.9, V = D_DECL + DELTA, PB_META = 150;
  async function tappaBussola(c) {
    pieno(); Cielo.U.uOpac.value = 0; Nave.stato.scia = true; Nave.accendiLuci(false);
    Mondo.cambiaAtmosfera('giorno', 3);
    if (Nave.stato.velocita < 8) { const v0 = Nave.stato.velocita; Mondo.anima(3, (k) => { Nave.stato.velocita = v0 + (10 - v0) * k; }); }
    Scenari.chiesuola.visible = true; c.poi(() => { Scenari.chiesuola.visible = false; });
    const occhioTim = [Scenari.X0 + 10.55, Scenari.TETTO + 1.75, 0.6];
    const testa = () => Scenari.testaChiesuola.getWorldPosition(new THREE.Vector3());
    await vai(c, { schermo: [arr(inNave(...occhioTim)), arr(testa()), 4, 30], vr: alTimone() });
    segui(c, () => ({ p: inNave(...occhioTim), g: testa().add(new THREE.Vector3(0, 0.06, 0)) }), 60);
    if (!imm()) { const f0 = Mondo.camera.fov; Mondo.camera.fov = 40; Mondo.camera.updateProjectionMatrix(); c.poi(() => { Mondo.camera.fov = f0; Mondo.camera.updateProjectionMatrix(); }); }
    // la bussola del docente nella sospensione cardanica
    let bussola = null;
    try {
      const nuova = await c.attendi(Bussola3D.carica());
      bussola = nuova(); Mondo.scena.add(bussola.g); c.poi(() => Mondo.scena.remove(bussola.g));
      if (imm()) bussola.g.scale.setScalar(1.5); // nel visore un po' più grande: si legge meglio (disegno schematico)
    } catch (e) { if (e === SALTO) throw e; console.warn('bussola 3D non caricata', e); }
    // nel visore, sopra la bussola, una lente: la rosa vista da vicino, con la linea di fede (su schermo la camera è già vicina)
    const lente = imm() ? lenteRosa() : null;
    if (lente) { Mondo.scena.add(lente.obj); c.poi(() => { Mondo.scena.remove(lente.obj); lente.via(); }); }
    const eBus = imm() ? UI.etichetta('bussola ↓', () => testa().add(new THREE.Vector3(0, 0.55, 0)), { mano: true, ang: 0.03 }) : null;
    if (eBus) c.poi(() => eBus.togli());
    c.frame((dt) => {
      if (lente) {
        const p = testa(); p.y += 0.3; lente.obj.position.copy(p);
        lente.obj.lookAt(Mondo.occhio()); lente.poni(((pv() - V) % 360 + 360) % 360);
      }
      if (!bussola) return;
      Scenari.testaChiesuola.getWorldPosition(bussola.g.position);
      bussola.poni(pv(), V); bussola.frame(dt);
    });
    await c.attendi(UI.cartello(5, 'La bussola', 'Il nord della bussola non è il nord vero'));

    UI.missione(`Porta la nave su <b>prora bussola ${PB_META}°</b>: leggila sulla rosa, sotto la linea di fede, e tienila per qualche secondo.`
      + (imm() ? ' La bussola è <b>davanti a destra</b>, abbassa lo sguardo; sopra c\'è una lente con la rosa ingrandita.' : ''));
    const P = UI.comandi([
      { tipo: 'lettura', id: 'pb', titolo: 'prora bussola', valore: '', sotto: `meta: ${PB_META}°` },
      { tipo: 'ruota', svg: svgRuota() },
      { tipo: 'lettura', id: 'barra', titolo: 'angolo di barra', valore: '0°', sotto: 'al centro' },
    ]);
    const timone = prendiTimone(c, P);
    let tenuta = 0;
    const finito = new Promise((ok) => {
      c.frame((dt) => {
        if (tenuta > 3) return;
        P.agg('barra', timone(dt));
        let pb = (pv() - V) % 360; if (pb < 0) pb += 360;
        P.agg('pb', { valore: tre(pb) });
        const err = ((pb - PB_META + 540) % 360) - 180;
        if (Math.abs(err) < 1.5) { tenuta += dt; UI.stato(`<b>In rotta!</b> Tieni così… ${Math.max(1, Math.ceil(3 - tenuta))}`); }
        else { tenuta = 0; UI.stato(err < 0 ? 'Accosta <b>a dritta</b>: la prora bussola deve crescere.' : 'Accosta <b>a sinistra</b>: la prora bussola deve calare.'); }
        if (tenuta > 3) ok();
      });
    });
    await c.attendi(finito);
    medaglie.bussola = true; Suono.ok(); UI.avviso(`Prora bussola ${PB_META}°`, 'ok');
    UI.pulisci();
    const b0 = Nave.stato.barra; Mondo.anima(3, (k) => { Nave.stato.barra = b0 * (1 - k); });
    await scopri(c, {
      titolo: 'Nord vero, nord bussola',
      html: `<p>La rosa della bussola non indica il nord vero: indica il <b>nord bussola</b>. Contano la <b>declinazione</b> d, angolo fra meridiano geografico e magnetico, e la <b>deviazione</b> δ, che nasce a bordo e varia con la prora.</p>
        <p>La variazione magnetica è V = d + δ. Con Pb = 150°, d = 3,0° E e δ = 3,9° W:</p>
        <div class="grande-dato">Pv = 149,1°</div>
        <p>La <b>sospensione cardanica</b> tiene orizzontale il mortaio della bussola con rollio e beccheggio.</p>`,
      fonte: 'Lezione 17 (slide 10, 16, 17, 22, 30, 31). Bussola 3D: modello del prof. Daniele Palma Esposito.',
    });
  }

  /* ================= 6. La falla e le paratie stagne ================= */
  async function tappaFalla(c) {
    pieno(); Cielo.U.uOpac.value = 0;
    Mondo.cambiaAtmosfera('giorno', 3);
    Suono.ambiente({ mare: 0.5, vento: 0.05 });
    if (imm()) await c.attendi(VR.dissolvi(1, 0.45));
    Object.assign(Nave.stato, { velocita: 0, barra: 0, accostata: 0, scia: false }); Nave.azzeraScia();
    pontile.visible = true; c.poi(() => { pontile.visible = false; });
    await vai(c, { schermo: [arr(inNave(-25, 48, 105)), arr(inNave(0, -1, 0)), 5, 40], vr: sulPontile() });
    Nave.ripara(); Nave.falla.stagne = true; Nave.matParatia.opacity = 0.55;
    Nave.modoFantasma(true); Mondo.anima(1.5, (k) => Mondo.vetro(k));
    c.poi(() => { Mondo.vetro(0); Nave.ripara(); Nave.modoFantasma(false); Nave.stato.sommergi = 0; Nave.matParatia.opacity = 0.55; Nave.falla.stagne = true; });
    await c.attendi(UI.cartello(6, 'La falla', 'Una nave è fatta di stanze stagne'));

    // 1) una falla con le paratie stagne
    UI.missione('Lo scafo è trasparente: le <b>paratie stagne</b> sono in oro. ' + (imm() ? 'Punta una <b>stiva</b> e premi il grilletto' : 'Tocca una <b>stiva</b>') + ': apri una falla.');
    let aperta = -1;
    const stive = Nave.compartimenti.slice(1, 6);
    const prima = new Promise((ok) => {
      stive.forEach((cp) => c.poi(VR.bersaglio(cp.vano, { premi() { if (aperta >= 0) return; aperta = Nave.compartimenti.indexOf(cp); Nave.allaga(aperta); Suono.tuono(); UI.avviso(`Falla nella ${cp.nome}!`, 'ko', 2); ok(); } })));
    });
    await c.attendi(prima);
    UI.stato('L\'acqua entra…');
    await c.attendi(dorme(6));
    UI.avviso('Galleggia ancora!', 'ok', 2); Suono.ok();
    UI.missione('La nave <b>galleggia ancora</b>: la paratia ferma l\'acqua in un solo compartimento. E se le paratie non fossero stagne?');
    // 2) senza paratie stagne
    let via;
    const seconda = new Promise((ok) => { via = ok; });
    UI.comandi([{ tipo: 'bottone', id: 'togli', testo: 'Togli le paratie\nstagne', oro: true }], (id, ev) => { if (id === 'togli' && ev === 'clic') via(); });
    await c.attendi(seconda);
    UI.comandi(null);
    Nave.falla.stagne = false;
    Mondo.anima(1.5, (k) => { Nave.matParatia.opacity = 0.55 * (1 - k); });
    UI.missione('Senza paratie stagne l\'acqua passa da un compartimento all\'altro…');
    await c.attendi(new Promise((ok) => c.frame(() => { if (Nave.stato.pescaggio + Nave.falla.affonda > Nave.D - 0.8) ok(); })));
    Nave.falla.aPicco = true; Suono.tuono(); UI.avviso('La nave affonda!', 'ko', 3);
    await c.attendi(dorme(4.5));
    medaglie.falla = true;
    if (imm()) await c.attendi(VR.dissolvi(1, 1)); else $('velo').classList.remove('aperto');
    await c.attendi(dorme(1.2));
    Nave.ripara(); Nave.modoFantasma(false); Nave.matParatia.opacity = 0.55; Nave.falla.stagne = true; Mondo.vetro(0);
    if (imm()) VR.dissolvi(0, 1.2); else $('velo').classList.add('aperto');
    UI.pulisci();
    await scopri(c, {
      titolo: 'Le paratie stagne',
      html: `<p>Lo scafo è diviso in compartimenti dalle <b>paratie</b> (<em>bulkhead</em>): le stive sono separate da paratie trasversali stagne.</p>
        <p>Le <b>paratie stagne</b> sono cruciali per impedire la propagazione dell'acqua: con una falla si allaga un solo compartimento e la nave resta a galla.</p>`,
      fonte: 'Lezione 12 (slide 3, 4). Quanto si immerge la nave: disegno schematico, le slide non danno numeri.',
    });
  }

  /* ================= 7. Il tempo: Buys Ballot ================= */
  async function tappaTempo(c) {
    pieno(); Nave.stato.scia = true; Cielo.U.uOpac.value = 0;
    { const v0 = Nave.stato.velocita, b0 = Nave.stato.barra; Mondo.anima(4, (k) => { Nave.stato.velocita = v0 + (Math.max(v0, 7) - v0) * k; Nave.stato.barra = b0 * (1 - k); }); }
    Mondo.cambiaAtmosfera('tempesta', 7);
    Suono.ambiente({ mare: 0.75, vento: 0.4, pioggia: 0.22 });
    await vai(c, { schermo: [arr(inNave(-120, 30, 0)), arr(inNave(200, 14, 0)), 4], vr: sulPonte() });
    const seg = segui(c, dietro(120, 30, 200, 14), 1.2);
    // filetti di vento che corrono verso prua
    const NV = 260, pvv = new Float32Array(NV * 6), vita = new Float32Array(NV);
    const geoV = new THREE.BufferGeometry(); geoV.setAttribute('position', new THREE.BufferAttribute(pvv, 3));
    const matV = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const vento = new THREE.LineSegments(geoV, matV); vento.frustumCulled = false; Mondo.scena.add(vento);
    c.poi(() => Mondo.scena.remove(vento));
    Mondo.anima(4, (k) => { matV.opacity = 0.55 * k; });
    for (let i = 0; i < NV; i++) vita[i] = Math.random();
    const scala = imm() ? 0.12 : 1; // nel visore i filetti passano vicino a chi guarda
    c.frame((dt) => {
      const fx = Math.cos(Nave.stato.prora), fz = -Math.sin(Nave.stato.prora), o = Mondo.occhio();
      for (let i = 0; i < NV; i++) {
        const k = i * 6; vita[i] += dt * 0.9;
        if (vita[i] > 1 || pvv[k] === 0) { vita[i] = 0; const a = (Math.random() * 300 - 120) * scala, l = (Math.random() - 0.5) * 260 * scala; pvv[k] = o.x + fx * a - fz * l; pvv[k + 2] = o.z + fz * a + fx * l; pvv[k + 1] = o.y + (-20 + Math.random() * 50) * scala; }
        pvv[k] += fx * 38 * dt; pvv[k + 2] += fz * 38 * dt;
        pvv[k + 3] = pvv[k] + fx * 9 * Math.max(scala, 0.3); pvv[k + 4] = pvv[k + 1]; pvv[k + 5] = pvv[k + 2] + fz * 9 * Math.max(scala, 0.3);
      }
      geoV.attributes.position.needsUpdate = true;
    });
    let prossimo = 3;
    c.frame((dt) => { prossimo -= dt; if (prossimo < 0) { prossimo = 5 + Math.random() * 6; lampo(); } });
    await c.attendi(UI.cartello(7, 'Il tempo', 'Il mare cambia umore in fretta'));

    UI.missione('Il vento ti soffia <b>alle spalle</b>. Per la regola di Buys Ballot, dove si trova la <b>bassa pressione</b>?');
    const vEt = UI.etichetta('vento ⟶ ⟶', () => { const [x, z] = Nave.puntoMondo(imm() ? -45 : -20, imm() ? 0 : 0); return new THREE.Vector3(x, imm() ? Scenari.TETTO + 8 : 38, z); }, { mano: true });
    c.poi(() => vEt.togli());
    let errori = 0, ok;
    const risposto = new Promise((r) => { ok = r; });
    const P = UI.comandi([{ tipo: 'scelte', voci: [{ id: 'sinistra', testo: 'A sinistra' }, { id: 'destra', testo: 'A destra' }, { id: 'davanti', testo: 'Davanti a te' }, { id: 'dietro', testo: 'Alle tue spalle' }] }], (id, ev) => {
      if (ev !== 'clic') return;
      if (id === 'sinistra') { P.esito(id, 'giusta'); Suono.ok(); ok(); return; }
      P.esito(id, 'sbagliata'); Suono.no(); errori++;
      UI.stato(errori < 2 ? 'Non lì. Pensa: <b>spalle al vento</b>…' : 'Spalle al vento: la bassa è <b>a sinistra</b>, un poco in avanti.');
      if (errori >= 2) P.esito('sinistra', 'giusta');
    });
    await c.attendi(risposto);
    medaglie.tempo = errori < 2;
    UI.avviso('Spalle al vento: bassa a sinistra!', 'ok', 2.2);
    await c.attendi(dorme(1.2));
    UI.pulisci(); vEt.togli();

    // rivelazione: si sale fino a vedere il ciclone dall'alto
    const ciclone = creaCiclone();
    const [cx, cz] = Nave.puntoMondo(900, -2600);
    ciclone.position.set(cx, 1300, cz); Mondo.scena.add(ciclone); c.poi(() => Mondo.scena.remove(ciclone));
    c.frame((dt) => { ciclone.rotation.y += dt * 0.05; }); // antiorario visto dall'alto
    seg.ferma();
    const [nx, nz] = Nave.puntoMondo(0, 0);
    Suono.ambiente({ mare: 0.25, vento: 0.2, pioggia: 0 });
    Mondo.anima(3, (k) => { matV.opacity = 0.55 * (1 - k); });
    Mondo.anima(4, (k) => { ciclone.children[0].material.opacity = 0.92 * k; });
    if (imm()) {
      Mondo.cambiaAtmosfera('satellite', 0.1);
      const mx = (nx + cx) / 2, mz = (nz + cz) / 2;
      await vai(c, { vr: inPanorama([mx + 2000, 6500, mz + 3600], [mx, 0, mz]) });
      c.poi(() => { panorama.visible = false; });
    } else {
      Mondo.cambiaAtmosfera('satellite', 4);
      await c.attendi(Mondo.vola([(nx + cx) / 2 + 2000, 8200, (nz + cz) / 2 + 3600], [(nx + cx) / 2 + 1900, 0, (nz + cz) / 2], 5));
    }
    const [ax, az] = Nave.puntoMondo(-700, 2300);
    const eB = UI.etichetta('B<br>bassa pressione', new THREE.Vector3(cx, 1300, cz), { grande: true, colore: '#ff8a7a', ang: 0.03 });
    const eA = UI.etichetta('A<br>alta pressione', new THREE.Vector3(ax, 600, az), { grande: true, colore: '#9fd3ff', ang: 0.03 });
    const eN = UI.etichetta('● la tua nave', () => Nave.esterno.position.clone().add(new THREE.Vector3(0, 30, 0)), { mano: true, ang: 0.025 });
    if (!imm()) { eB.el.innerHTML = '<span style="font-size:clamp(50px,7vw,96px);color:#ff8a7a">B</span><br>bassa pressione'; eA.el.innerHTML = '<span style="font-size:clamp(40px,5vw,72px);color:#9fd3ff">A</span><br>alta pressione'; }
    c.poi(() => { eB.togli(); eA.togli(); eN.togli(); });
    Suono.scintilla();
    await scopri(c, {
      titolo: 'La regola di Buys Ballot',
      html: `<p><b>Spalle al vento: bassa a sinistra.</b></p>
        <p>Nell'emisfero nord la bassa pressione si trova a sinistra, un poco in avanti, e l'alta a destra, un poco indietro. Nell'emisfero sud è il contrario.</p>
        <p>Sulla carta sinottica si individuano alte, basse e fronti: con Buys Ballot si ricava da dove arriverà il tempo.</p>`,
      fonte: 'Lezione 18 (slide 47, 67). Ciclone e venti: disegno schematico.',
    });
    if (imm()) await c.attendi(VR.dissolvi(1, 0.45));
  }
  function lampo() {
    if (imm()) { Mondo.renderer.toneMappingExposure = 3; setTimeout(() => { Mondo.renderer.toneMappingExposure = 1; }, 120); }
    else { const l = $('lampo'); l.style.transition = 'none'; l.style.opacity = 0.55; requestAnimationFrame(() => { l.style.transition = 'opacity .6s'; l.style.opacity = 0; }); }
    setTimeout(() => Suono.tuono(), 300 + Math.random() * 700);
  }
  function creaCiclone() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const x = cv.getContext('2d');
    x.translate(512, 512);
    for (let braccio = 0; braccio < 3; braccio++) {
      for (let i = 0; i < 900; i++) {
        const s = i / 900, th = braccio * 2.094 + s * 9.5, r = 30 + s * 470;
        // emisfero nord: l'aria entra girando in senso antiorario, quindi dal centro verso fuori i bracci girano in senso orario
        const px = Math.cos(th) * r + (Math.random() - 0.5) * 50 * s, py = Math.sin(th) * r + (Math.random() - 0.5) * 50 * s;
        const rr = 14 + 60 * s * Math.random(), g = x.createRadialGradient(px, py, 0, px, py, rr), a = 0.26 * (1 - s * 0.6);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalCompositeOperation = 'destination-out';
    const occhio = x.createRadialGradient(0, 0, 0, 0, 0, 60); occhio.addColorStop(0, 'rgba(0,0,0,1)'); occhio.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = occhio; x.beginPath(); x.arc(0, 0, 60, 0, Math.PI * 2); x.fill();
    const bordo = x.createRadialGradient(0, 0, 380, 0, 0, 512); bordo.addColorStop(0, 'rgba(0,0,0,0)'); bordo.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = bordo; x.fillRect(-512, -512, 1024, 1024);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7600, 7600), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(m); return g;
  }

  /* ================= 8. Il sestante: l'altezza del Sole ================= */
  async function tappaSestante(c) {
    pieno(); Cielo.U.uOpac.value = 0; Nave.accendiLuci(false);
    // nave verso Nord: il Sole del pomeriggio sta a dritta, davanti
    Object.assign(Nave.stato, { prora: Math.PI / 2, accostata: 0, barra: 0, velocita: 6, scia: true }); Nave.azzeraScia();
    Mondo.cambiaAtmosfera('pomeriggio', imm() ? 0.1 : 5);
    Suono.ambiente({ mare: 0.5, vento: 0.08 });
    const sole = () => Mondo.U.uSoleDir.value;
    const occhioS = () => inNave(Scenari.X0 + 8, Scenari.TETTO + 1.7, 8);
    const versoSole = (p) => p.clone().add(new THREE.Vector3(sole().x, 0.12, sole().z).normalize().multiplyScalar(100));
    await vai(c, { schermo: [arr(occhioS()), arr(versoSole(occhioS())), 4, 20], vr: sulPonte() });
    if (!imm()) segui(c, () => { const p = occhioS(); return { p, g: versoSole(p) }; }, 60);
    // il sestante del docente, davanti a chi misura
    let sest = null;
    try { const nuovo = await c.attendi(Sestante3D.carica()); sest = nuovo(); } catch (e) { if (e === SALTO) throw e; console.warn('sestante 3D non caricato', e); }
    const portaSest = new THREE.Group();
    if (sest) { portaSest.add(sest.g); sest.g.rotation.set(0, Math.PI, 0); }
    const mir = Scenari.pianoMirino;
    // nel visore il sestante sta su un leggio: si prende con la mano e si porta all'occhio; la levetta di quella mano muove l'alidada
    let inMano = false, allOcchio = false, vLevetta = 0;
    if (imm()) {
      const leggio = new THREE.Group(); Nave.esterno.add(leggio);
      leggio.position.set(PONTE.pos[0] + 0.55, PONTE.pos[1], PONTE.pos[2] + 0.3);
      const legno = new THREE.MeshLambertMaterial({ color: '#8a6440' });
      const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.95, 10), legno); asta.position.y = 0.475; leggio.add(asta);
      const piano = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.28), legno); piano.position.y = 0.96; leggio.add(piano);
      const alone = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.005, 8, 40), new THREE.MeshBasicMaterial({ color: '#E3C878', transparent: true, opacity: 0.3, toneMapped: false }));
      alone.rotation.x = Math.PI / 2; alone.position.y = 0.985; leggio.add(alone);
      const restP = new THREE.Vector3(0, 1.1, 0), restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, PONTE.yaw - 0.35, 0, 'YXZ'));
      portaSest.position.copy(restP); portaSest.quaternion.copy(restQ); leggio.add(portaSest);
      Mondo.camera.add(mir); mir.position.set(0, 0, -0.42); mir.scale.setScalar(1); mir.visible = false;
      mir.renderOrder = 9600; c.poi(() => { mir.renderOrder = 9400; }); // all'occhio il mirino sta davanti a tutto, anche al pannello
      const eLeggio = UI.etichetta('sestante', () => leggio.localToWorld(new THREE.Vector3(0, 1.35, 0)), { mano: true, ang: 0.03 });
      const togli = VR.afferrabile(portaSest, {
        raggio: 0.16,
        prendi() { inMano = true; Suono.clic(); },
        levetta(ax, ay) { const a = Math.abs(ay); vLevetta = a < 0.15 ? 0 : -Math.sign(ay) * (a < 0.75 ? 0.4 : 6); }, // mezza spinta: tamburo; tutta: alidada
        lascia() {
          inMano = false; vLevetta = 0;
          const p0 = portaSest.position.clone(), q0 = portaSest.quaternion.clone();
          Mondo.anima(0.5, (k) => { portaSest.position.lerpVectors(p0, restP, k); portaSest.quaternion.slerpQuaternions(q0, restQ, k); });
        },
        evidenzia(si) { alone.material.opacity = si ? 0.95 : 0.3; },
      });
      c.frame(() => {
        const prima = allOcchio;
        allOcchio = inMano && portaSest.getWorldPosition(new THREE.Vector3()).distanceTo(Mondo.occhio()) < 0.3;
        mir.visible = allOcchio;
        if (allOcchio && !prima) VR.vibra(VR.fonti.find((f) => f.tiene && f.tiene.p.obj === portaSest) || {}, 0.3, 30);
      });
      VR.pannello.lato = 0.5; VR.pannello.ricentra = true;
      c.poi(() => { togli(); eLeggio.togli(); Nave.esterno.remove(leggio); VR.pannello.lato = 0; VR.pannello.ricentra = true; });
    } else {
      Mondo.camera.add(portaSest);
      portaSest.position.set(0.16, -0.12, -0.5); portaSest.scale.setScalar(0.85); portaSest.rotation.set(0.15, -0.35, 0);
      const box = document.createElement('div'); box.id = 'mirino'; box.appendChild(Scenari.mirino); document.body.appendChild(box);
      c.poi(() => { box.remove(); Mondo.camera.remove(portaSest); });
    }
    c.poi(() => { Mondo.camera.remove(mir); mir.visible = false; });
    await c.attendi(UI.cartello(8, 'Il sestante', 'Misurare il cielo con due specchi'));

    const H = Math.asin(sole().y) / RAD; // altezza del centro del Sole nella scena
    const SD = 16 / 60; // semidiametro grafico del Sole (disegno schematico): si appoggia il lembo inferiore
    let lettura = 0, v = 0, tenuta = 0, vetrini = false, tMir = 0;
    UI.missione(imm() ? 'Prima <b>abbassa i vetrini colorati</b>. Poi prendi il <b>sestante</b> dal leggio e portalo all\'<b>occhio</b>: con la levetta di quella mano muovi l\'alidada (spinta piena) o il tamburo (mezza spinta), finché il <b>lembo inferiore del Sole</b> tocca l\'<b>orizzonte</b>.'
      : 'Prima <b>abbassa i vetrini colorati</b>. Poi muovi l\'alidada finché il Sole compare a destra, nella metà riflettente, e col tamburo appoggia il suo <b>lembo inferiore</b> sull\'<b>orizzonte</b>.');
    const testoVetrini = () => vetrini ? '● vetrini abbassati' : '○ vetrini colorati';
    const P = UI.comandi([
      { tipo: 'lettura', id: 'hi', titolo: 'lettura', valore: gp(0), sotto: 'altezza istrumentale', solo3d: true }, // su schermo la lettura è nel mirino
      { tipo: 'bottone', id: 'vetrini', testo: testoVetrini() },
      { tipo: 'a capo' },
      { tipo: 'bottone', id: 'mm', testo: '◀◀ alidada' }, { tipo: 'bottone', id: 'm', testo: '◀ tamburo' },
      { tipo: 'bottone', id: 'p', testo: 'tamburo ▶' }, { tipo: 'bottone', id: 'pp', testo: 'alidada ▶▶' },
    ], (id, ev) => {
      if (id === 'vetrini') { if (ev === 'premi') { vetrini = !vetrini; Suono.clic(); P.agg('vetrini', { testo: testoVetrini() }); } return; }
      const vel = { mm: -6, m: -0.4, p: 0.4, pp: 6 }[id];
      if (ev === 'premi') v = vel; if (ev === 'lascia') v = 0;
    });
    c.ascolta(window, 'pointerup', () => { if (!imm()) v = 0; });
    const finito = new Promise((ok) => {
      c.frame((dt) => {
        if (tenuta > 1.5) return;
        lettura = Math.max(0, Math.min(120, lettura + (v + vLevetta) * dt));
        if (sest) sest.poni(Math.round(lettura * 60) / 60, vetrini);
        tMir += dt;
        const scarto = (H - SD) - lettura; // gradi fra lembo inferiore riflesso e orizzonte
        const abbaglia = Scenari.disegnaMirino({ lettura, h: H, sd: SD, vetrini, t: tMir, testo: imm() ? '' : gp(lettura) });
        P.agg('hi', { valore: gp(lettura) });
        if (imm() && !allOcchio) { tenuta = 0; UI.stato(inMano ? 'Ora porta il sestante all\'<b>occhio</b>, come un cannocchiale.' : 'Prendi il <b>sestante</b> dal leggio davanti a te.'); return; }
        if (!vetrini) { tenuta = 0; UI.stato(abbaglia ? '<b>Abbaglia!</b> Senza vetrini colorati non si guarda il Sole: abbassali.' : 'Prima di cercare il Sole <b>abbassa i vetrini colorati</b>: proteggono l\'occhio.'); return; }
        if (Math.abs(scarto) < 0.1) { tenuta += dt; UI.stato('<b>Il lembo inferiore tocca l\'orizzonte!</b> Lettura fatta.'); }
        else { tenuta = 0; UI.stato(scarto > 1 ? 'Il Sole è ancora in alto, fuori dal cannocchiale: <b>alidada ▶▶</b>.' : scarto < -1 ? 'Troppo! Il Sole è sotto l\'orizzonte: <b>◀◀ alidada</b>.' : scarto > 0 ? 'Quasi: il Sole è appena sopra l\'orizzonte. Usa il <b>tamburo</b>.' : 'Quasi: il Sole è appena sotto l\'orizzonte. Usa il <b>tamburo</b>.'); }
        if (tenuta > 1.5) ok();
      });
    });
    await c.attendi(finito);
    medaglie.sestante = true; Suono.ok(); UI.avviso(`hᵢ = ${gp(lettura)}`, 'ok', 2);
    UI.pulisci();
    await scopri(c, {
      titolo: 'Il sestante',
      html: `<p>Il <b>sestante</b> (<em>sextant</em>) misura l'angolo fra due riferimenti guardati insieme nel cannocchiale: grazie a due specchi, la doppia riflessione li fa vedere sovrapposti. In navigazione astronomica misura l'<b>altezza degli astri</b>.</p>
        <div class="grande-dato">hᵢ = ${gp(lettura)}</div>
        <p>È l'<b>altezza istrumentale</b>. Il lembo è ampio 60° ma graduato fino a 120°. Con le correzioni si passa all'altezza osservata e poi a quella vera.</p>
        <p>I <b>vetrini colorati</b> (<em>horizon shades / index shades</em>), di diverse gradazioni, attenuano la luce del Sole e proteggono l'occhio dell'osservatore.</p>`,
      fonte: '«Astronomia nautica», esperienza 7 (pp. 63–67; vetrini p. 64). Sestante 3D: modello del prof. Daniele Palma Esposito. Mirino come nel libro: disegno schematico.',
    });
  }

  /* ================= 9. Le stelle: la Polare e la latitudine ================= */
  async function tappaStelle(c) {
    pieno();
    Mondo.cambiaAtmosfera('notte', 5);
    Suono.ambiente({ mare: 0.4, vento: 0.03 });
    Nave.accendiLuci(true);
    Object.assign(Nave.stato, { barra: 0, accostata: 0, prora: Math.PI / 2, velocita: 2 }); Nave.azzeraScia();
    Cielo.lst = 4.4; Cielo.velocita = 0; Cielo.spegniScia();
    Cielo.figure.opacity = 0; Cielo.guida.opacity = 0; Cielo.anello.opacity = 0; Cielo.disegnaArco(0);
    const ponte = () => Nave.corpo.localToWorld(new THREE.Vector3(-Nave.L / 2 + 22, Nave.D + 21, 0));
    const p = ponte();
    await vai(c, { schermo: [p.toArray(), [p.x, p.y + 2400, p.z - 4200], 5, 300], vr: sulPonte() });
    if (!imm()) {
      const fov0 = Mondo.camera.fov; Mondo.anima(3, (k) => { Mondo.camera.fov = fov0 + (70 - fov0) * k; Mondo.camera.updateProjectionMatrix(); });
      c.poi(() => Mondo.anima(3, (k) => { Mondo.camera.fov = 70 + (fov0 - 70) * k; Mondo.camera.updateProjectionMatrix(); }));
      c.frame(() => { const q = ponte(); Mondo.camera.position.copy(q); Mondo.guardaVerso.set(q.x, q.y + 2400, q.z - 4200); });
    }
    Mondo.anima(3, (k) => { Cielo.U.uOpac.value = k; });
    await c.attendi(UI.cartello(9, 'Le stelle', 'Di notte, senza GPS, il cielo è una mappa'));

    UI.missione(imm() ? 'Guarda verso prua, a Nord, in alto. Il cielo gira: <b>una sola stella resta ferma</b>. Puntala e premi il grilletto.' : 'Il cielo gira, guarda le scie. <b>Una sola stella resta ferma</b>: toccala.');
    Cielo.avviaScia();
    Mondo.anima(3, (k) => { Cielo.velocita = 0.42 * k; });
    let aiuto = false, errori = 0;
    const tAiuto = setTimeout(() => mostraAiuto(), 14000); c.poi(() => clearTimeout(tAiuto));
    function mostraAiuto() {
      if (aiuto) return; aiuto = true;
      Mondo.anima(1.5, (k) => { Cielo.figure.opacity = 0.7 * k; Cielo.guida.opacity = 0.9 * k; });
      const e = UI.etichetta('Orsa Maggiore', () => Cielo.posStella('Megrez'), { mano: true }); c.poi(() => e.togli());
      UI.stato('Aiuto: segui la linea d\'oro che parte dall\'<b>Orsa Maggiore</b>.');
    }
    const angolo = (o, dir, punto) => dir.angleTo(punto.clone().sub(o)) / RAD;
    const trovata = new Promise((ok) => {
      VR.suVuoto = (orig, dir) => {
        if (angolo(orig, dir, Cielo.posPolare()) < (imm() ? 4 : 3.5)) { ok(); return; }
        const vicina = Cielo.nomi.some((n) => angolo(orig, dir, Cielo.posStella(n)) < 3);
        Suono.no(); errori++; UI.avviso(vicina ? 'Quella gira!' : 'Lì non c\'è', 'ko');
        if (errori >= 2) mostraAiuto();
      };
      c.poi(() => { VR.suVuoto = null; });
    });
    await c.attendi(trovata);
    VR.suVuoto = null;
    medaglie.stelle = true;
    Suono.ok(); UI.avviso('La stella Polare!', 'ok', 2);
    UI.missione('');
    { const f0 = Cielo.figure.opacity; Mondo.anima(2.5, (k) => { Cielo.velocita = 0.42 * (1 - k); Cielo.anello.opacity = k; Cielo.figure.opacity = Math.max(f0, 0.5 * k); }); }
    await c.attendi(dorme(1.5));
    await c.attendi(Mondo.anima(2.5, (k) => Cielo.disegnaArco(k)));
    const eLat = UI.etichetta(`≈ ${Cielo.LAT_GRADI}°<br>altezza della Polare`, () => Mondo.occhio().clone().add(new THREE.Vector3(0, Math.sin(0.36) * 5800, -Math.cos(0.36) * 5800)), { grande: true, colore: '#E3C878' });
    if (!imm()) eLat.el.innerHTML = `<span style="font-size:clamp(36px,5vw,64px);color:#E3C878">≈ ${Cielo.LAT_GRADI}°</span><br>altezza della Polare`;
    const eNord = UI.etichetta('Nord', () => Mondo.occhio().clone().add(new THREE.Vector3(0, 120, -5800)), { mano: true });
    c.poi(() => { eLat.togli(); eNord.togli(); });
    Suono.scintilla();
    await scopri(c, {
      titolo: 'La Polare e la latitudine',
      html: `<p>La <b>stella Polare</b> sta quasi sul polo celeste Nord: ha sempre azimut di circa 000° e la sua <b>altezza</b> sull'orizzonte è circa la <b>latitudine</b> di chi la osserva.</p>
        <div class="grande-dato">≈ ${Cielo.LAT_GRADI}° N</div>
        <p>Siamo all'altezza del golfo di Napoli. Per trovarla si prolunga di circa 5 volte la distanza tra Merak e Dubhe, nell'Orsa Maggiore.</p>`,
      fonte: '«Astronomia nautica», esperienze 2 e 9 (Fondamenti di Navigazione e Meteorologia nautica, vol. 2, pp. 12, 82, 98). Cielo semplificato.',
    });
  }

  /* ================= 10. Arrivo ================= */
  async function tappaArrivo(c) {
    pieno();
    Mondo.cambiaAtmosfera('aurora', 7);
    { const u0 = Cielo.U.uOpac.value, f0 = Cielo.figure.opacity, a0 = Cielo.anello.opacity, g0 = Cielo.guida.opacity;
      Mondo.anima(4, (k) => { Cielo.U.uOpac.value = u0 * (1 - k); Cielo.disegnaArco(1 - k); Cielo.figure.opacity = f0 * (1 - k); Cielo.anello.opacity = a0 * (1 - k); Cielo.guida.opacity = g0 * (1 - k); }); }
    Suono.ambiente({ mare: 0.5 });
    Nave.accendiLuci(false);
    Nave.stato.scia = true;
    const p0 = Nave.stato.prora;
    Mondo.anima(6, (k) => { Nave.stato.prora = p0 * (1 - k); Nave.stato.velocita = 2 + 8 * k; }); // prua verso il sole che sorge, a Est
    if (imm()) await c.attendi(VR.vai(Nave.esterno, PONTE.pos, PONTE.yaw, PONTE.area));
    else {
      const t0 = Mondo.tempo;
      c.frame(() => {
        const k = Math.min(1, (Mondo.tempo - t0) / 16), e = Mondo.dolce(k), ang = -0.9 + e * 2.2, r = 120 + e * 260, h = 6 + e * 150, q = Nave.esterno.position;
        Mondo.camera.position.set(q.x + Math.cos(ang) * r, h, q.z + Math.sin(ang) * r); Mondo.guardaVerso.set(q.x + 40, 10 + e * 10, q.z);
      });
    }
    await c.attendi(dorme(1.5)); Suono.sirena();
    await c.attendi(UI.cartello(10, 'Arrivo', 'Terra in vista'));
    await c.attendi(dorme(2));
    Suono.fanfara();
    if (imm()) {
      const fatte = TAPPE.filter((t) => t.cosa && medaglie[t.id]).length;
      await c.attendi(UI.scheda({
        etichetta: 'Fine del viaggio', titolo: 'Benvenuto a bordo',
        html: `<p>${TAPPE.filter((t) => t.cosa).map((t) => `${medaglie[t.id] ? '✓' : '·'} <b>${t.nome}</b>: ${t.cosa}`).join('<br>')}</p>
          <div class="grande-dato">${fatte} di 9</div><p>${CONFIG.scuola ? `<b>${CONFIG.scuola}</b><br>` : ''}${CONFIG.indirizzo}</p>`,
        fonte: 'Esperienza ideata e realizzata dal prof. Daniele Palma Esposito',
        bottone: 'Rifai il viaggio ↻',
      }));
      setTimeout(ricomincia, 0);
      return;
    }
    UI.mostra($('barra'), false);
    finale();
    await c.attendi(new Promise(() => {}));
  }
  function finale() {
    const t = $('f-titolo'); t.innerHTML = '';
    [...'Benvenuto a bordo'].forEach((ch, k) => { const s = document.createElement('span'); s.className = 'l'; s.textContent = ch === ' ' ? ' ' : ch; s.style.animationDelay = `${0.2 + k * 0.06}s`; t.appendChild(s); });
    $('f-indirizzo').innerHTML = (CONFIG.scuola ? `<b>${CONFIG.scuola}</b><br>` : '') + CONFIG.indirizzo;
    $('medaglie').innerHTML = TAPPE.filter((x) => x.cosa).map((x) => `<div class="medaglia ${medaglie[x.id] ? '' : 'mancata'}"><div class="icona">${x.icona}</div><div class="n">${x.nome}</div><div class="d">${x.cosa}</div></div>`).join('');
    UI.attiva($('finale'), true);
    [...$('medaglie').children].forEach((m, i) => setTimeout(() => { m.classList.add('vista'); Suono.scintilla(); }, 900 + i * 260));
  }
})();
