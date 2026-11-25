/* Interfaccia unica: su schermo è HTML, nel visore (e nella VR simulata) è il «pannello di bordo» 3D che segue lo sguardo.
   Le tappe la usano sempre allo stesso modo:
   UI.missione(html), UI.stato(html), UI.comandi(lista, ascolta), UI.scheda({...}), UI.avviso(t), UI.cartello(n, t, m), UI.etichetta(...) */
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const imm = () => Mondo.immersivo;
  const dorme = (s) => new Promise((ok) => setTimeout(ok, s * 1000));
  function mostra(el, si) { el.classList.toggle('nascosto', !si); }
  function attiva(el, si) { el.classList.toggle('attiva', si); }

  /* ================= pannello 3D ================= */
  const W = 1024, H = 900, LARG = 0.62;
  const tela = document.createElement('canvas'); tela.width = W; tela.height = H;
  const cx = tela.getContext('2d');
  const tex = new THREE.CanvasTexture(tela); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const piano = new THREE.Mesh(new THREE.PlaneGeometry(LARG, LARG * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  piano.renderOrder = 9500; piano.visible = false;
  Mondo.rig.add(piano); VR.pannello.obj = piano;

  const stato = { testa: '', missione: '', stato: '', comandi: null, scheda: null, copertina: null };
  let rett = [], sporco = true, premuto = null;

  // testo ricco: <b>, <strong>, <em>, <br>, blocchi <p> e <div class="grande-dato">
  const giaLetti = new Map(); // il testo si analizza una volta sola: il pannello si ridisegna spesso
  function blocchi(html) {
    const k = html || '';
    if (giaLetti.has(k)) return giaLetti.get(k);
    const r = leggiBlocchi(k);
    if (giaLetti.size > 80) giaLetti.clear();
    giaLetti.set(k, r); return r;
  }
  function leggiBlocchi(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html').body.firstChild;
    const out = []; let corrente = null;
    const nuovo = (tipo) => { corrente = { tipo, runs: [] }; out.push(corrente); return corrente; };
    function visita(n, st) {
      if (n.nodeType === 3) { (corrente || nuovo('p')).runs.push({ t: n.textContent, ...st }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { (corrente || nuovo('p')).runs.push({ t: '\n', ...st }); return; }
      if (tag === 'p' || tag === 'div') { nuovo(n.classList.contains('grande-dato') ? 'dato' : 'p'); n.childNodes.forEach((c) => visita(c, st)); corrente = null; return; }
      const s2 = { ...st }; if (tag === 'b' || tag === 'strong') s2.b = true; if (tag === 'em' || tag === 'i') s2.i = true;
      n.childNodes.forEach((c) => visita(c, s2));
    }
    doc.childNodes.forEach((c) => visita(c, {}));
    return out.filter((b) => b.runs.some((r) => r.t.trim()));
  }
  function font(r, size, fam) { return `${r.i ? 'italic ' : ''}${r.b ? 700 : 400} ${size}px ${fam || 'Atkinson, system-ui, sans-serif'}`; }
  function scrivi(html, x, y, w, size, colore, fam, disegna = true) {
    let yy = y;
    for (const bl of blocchi(html)) {
      const s = bl.tipo === 'dato' ? size * 1.7 : size, lh = s * 1.28;
      const f = bl.tipo === 'dato' ? 'Bitter, Georgia, serif' : fam;
      let xx = x;
      const parole = [];
      for (const r of bl.runs) r.t.split(/(\s+)/).forEach((p) => { if (p) parole.push({ p, r }); });
      for (const { p, r } of parole) {
        if (p.includes('\n')) { xx = x; yy += lh; continue; }
        cx.font = font(bl.tipo === 'dato' ? { b: true } : r, s, f);
        const lw = cx.measureText(p).width;
        if (/^\s+$/.test(p)) { if (xx > x) xx += lw; continue; }
        if (xx + lw > x + w && xx > x) { xx = x; yy += lh; }
        if (disegna) { cx.fillStyle = bl.tipo === 'dato' ? '#C8962B' : r.b ? (colore === '#12355B' ? '#0B2545' : '#ffffff') : (r.i ? '#4A76A8' : colore); cx.fillText(p, xx, yy); }
        xx += lw;
      }
      yy += lh + s * 0.35;
    }
    return yy;
  }
  function tondo(x, y, w, h, r, riemp, bordo) { VR.arrotondato(cx, x, y, w, h, r); if (riemp) { cx.fillStyle = riemp; cx.fill(); } if (bordo) { cx.strokeStyle = bordo; cx.lineWidth = 4; cx.stroke(); } }

  function bottone(id, x, y, w, h, testo, oro, extra) {
    const su = premuto === id;
    tondo(x, y, w, h, 22, oro ? (su ? '#C9A227' : '#E3C878') : (su ? 'rgba(201,162,39,0.45)' : 'rgba(19,49,92,0.9)'), oro ? null : (extra?.bordo || 'rgba(227,200,120,0.7)'));
    cx.fillStyle = oro ? '#0B2545' : '#EEF2F8'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const righe = String(testo).split('\n'); let s = 34;
    cx.font = `700 ${s}px Atkinson, sans-serif`;
    while (s > 24 && Math.max(...righe.map((r) => cx.measureText(r).width)) > w - 24) { s -= 2; cx.font = `700 ${s}px Atkinson, sans-serif`; }
    righe.forEach((r, i) => cx.fillText(r, x + w / 2, y + h / 2 + (i - (righe.length - 1) / 2) * s * 1.15));
    cx.textAlign = 'left'; cx.textBaseline = 'top';
    rett.push({ id, x, y, w, h });
  }

  function disegna() {
    sporco = false; rett = [];
    cx.clearRect(0, 0, W, H); cx.textBaseline = 'top'; cx.textAlign = 'left';
    const sc = stato.scheda;
    // fondo
    tondo(4, 4, W - 8, H - 8, 36, sc ? 'rgba(246,243,232,0.97)' : 'rgba(11,37,69,0.88)', sc ? null : 'rgba(227,200,120,0.5)');
    if (stato.copertina && stato.copertina.benvenuto) {
      const c = stato.copertina;
      cx.textAlign = 'center';
      cx.fillStyle = '#ffffff'; cx.font = '700 104px Bitter, serif'; cx.fillText('Benvenuti a scuola!', W / 2, 90);
      cx.fillStyle = '#E3C878'; cx.font = '34px Atkinson, sans-serif';
      // nome della scuola, su due righe se serve
      const parole = c.scuola.split(' '); let riga = '', yy = 250; const righe = [];
      for (const p of parole) { const prova = riga ? riga + ' ' + p : p; if (cx.measureText(prova).width > W - 140 && riga) { righe.push(riga); riga = p; } else riga = prova; }
      righe.push(riga); for (const r of righe) { cx.fillText(r, W / 2, yy); yy += 46; }
      cx.fillStyle = '#D8E0EC'; cx.font = '36px Mano, cursive'; cx.fillText('Questo lavoro è stato realizzato a cura del', W / 2, yy + 40);
      cx.fillStyle = '#ffffff'; cx.font = '700 44px Atkinson, sans-serif'; cx.fillText('prof. Daniele Palma Esposito', W / 2, yy + 92);
      cx.textAlign = 'left';
      bottone('entra', W / 2 - 220, 560, 440, 120, 'Entra ›', true);
      tastiniAlti(false);
    } else if (stato.copertina) {
      const c = stato.copertina;
      cx.textAlign = 'center'; cx.fillStyle = '#E3C878'; cx.font = '34px Mano, cursive'; cx.fillText('Il prof. Daniele Palma Esposito presenta', W / 2, 90);
      cx.fillStyle = '#ffffff'; cx.font = '700 120px Bitter, serif'; cx.fillText('AL COMANDO', W / 2, 170);
      cx.fillStyle = '#D8E0EC'; cx.font = '36px Atkinson, sans-serif'; cx.fillText(c.sotto, W / 2, 330);
      cx.textAlign = 'left';
      bottone('salpa', W / 2 - 220, 470, 440, 130, 'Salpa ⚓', true);
      cx.fillStyle = 'rgba(216,224,236,0.8)'; cx.font = '28px Atkinson, sans-serif'; cx.textAlign = 'center';
      cx.fillText('Levetta sinistra: cammina · destra: gira · grilletto: premi', W / 2, 680);
      cx.textAlign = 'left';
      tastiniAlti(false);
    } else if (sc) {
      let y = 44;
      cx.fillStyle = '#7D5A0C'; cx.font = '700 26px Atkinson, sans-serif'; cx.fillText((sc.etichetta || 'Hai scoperto').toUpperCase(), 56, y); y += 42;
      cx.fillStyle = '#12355B'; cx.font = '700 50px Bitter, serif'; cx.fillText(sc.titolo, 56, y); y += 74;
      // il testo si rimpicciolisce se non ci sta
      let s = 32; while (s > 24 && scrivi(sc.html, 56, y, W - 112, s, '#12355B', null, false) > H - 230) s -= 1;
      y = scrivi(sc.html, 56, y, W - 112, s, '#12355B');
      cx.fillStyle = '#5B6B7C'; cx.font = '24px Mano, cursive';
      const fy = H - 196; let fx = 56; let riga = fy;
      for (const p of (sc.fonte || '').split(' ')) { const lw = cx.measureText(p + ' ').width; if (fx + lw > W - 56) { fx = 56; riga += 28; } cx.fillText(p, fx, riga); fx += lw; }
      bottone('avanti', 56, H - 120, W - 112, 92, sc.bottone || 'Avanti ›', true);
    } else {
      let y = 36;
      tastiniAlti(!!UI.onSalta);
      if (stato.testa) { cx.fillStyle = '#E3C878'; cx.font = '700 26px Atkinson, sans-serif'; cx.fillText(stato.testa.toUpperCase(), 48, y); }
      y = 96; // sotto la riga dei tastini
      if (stato.missione) { y = scrivi(stato.missione, 48, y, W - 96, 38, '#EEF2F8'); }
      if (stato.stato) { y = scrivi(stato.stato, 48, y - 6, W - 96, 30, '#D8E0EC'); }
      if (stato.comandi) disegnaComandi(Math.max(y + 10, 300));
    }
    tex.needsUpdate = true;
  }

  // tastini piccoli in alto a destra: Salta (per il docente), Camere (solo con le camere del visore), Esci dal VR
  function tastiniAlti(conSalta) {
    const lista = [];
    if (conSalta) lista.push(['salta', 'Salta ›', 150]);
    lista.push(['esci', 'Esci dal VR', 200]);
    if (VR.conCamere) lista.push(['camere', Mondo.conCamere ? '◐ Camere: sì' : '◑ Camere: no', 220]);
    let x = W - 36;
    for (const [id, testo, w] of lista) {
      x -= w;
      tondo(x, 22, w, 56, 18, premuto === id ? 'rgba(201,162,39,0.45)' : 'rgba(238,242,248,0.12)');
      cx.fillStyle = '#EEF2F8'; cx.font = '700 26px Atkinson, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.fillText(testo, x + w / 2, 36); cx.textAlign = 'left';
      rett.push({ id, x, y: 22, w, h: 56 });
      x -= 14;
    }
  }

  function disegnaComandi(y0) {
    const lista = stato.comandi.lista, x0 = 48, w = W - 96;
    let y = y0;
    const fila = [];
    const svuota = () => {
      if (!fila.length) return;
      const g = 18, ww = (w - g * (fila.length - 1)) / fila.length;
      const hh = Math.max(...fila.map((c) => c.tipo === 'misura' ? 300 : c.tipo === 'lettura' ? 170 : 120));
      fila.forEach((c, i) => disegnaUno(c, x0 + i * (ww + g), y, ww, hh));
      y += hh + 18; fila.length = 0;
    };
    for (const c of lista) {
      if (c.tipo === 'ruota' || c.soloSchermo) continue;
      if (c.tipo === 'scelte') {
        svuota();
        const g = 18, ww = (w - g) / 2;
        c.voci.forEach((v, i) => {
          const col = i % 2, rig = Math.floor(i / 2);
          const st = c.esiti?.[v.id];
          bottone(v.id, x0 + col * (ww + g), y + rig * 110, ww, 92, v.testo, false, { bordo: st === 'giusta' ? '#3FB27F' : st === 'sbagliata' ? '#E0503F' : null });
          if (st) { tondo(x0 + col * (ww + g), y + rig * 110, ww, 92, 22, st === 'giusta' ? 'rgba(63,178,127,0.35)' : 'rgba(224,80,63,0.3)'); }
        });
        y += Math.ceil(c.voci.length / 2) * 110 + 8;
      } else if (c.tipo === 'a capo') svuota();
      else fila.push(c);
    }
    svuota();
  }
  function disegnaUno(c, x, y, w, h) {
    if (c.tipo === 'bottone') bottone(c.id, x, y + (h - 110) / 2, w, 110, c.testo, c.oro);
    else if (c.tipo === 'lettura') {
      tondo(x, y, w, h, 22, 'rgba(19,49,92,0.9)', 'rgba(227,200,120,0.4)');
      cx.textAlign = 'center'; cx.fillStyle = '#E3C878'; cx.font = '700 24px Atkinson, sans-serif'; cx.fillText((c.titolo || '').toUpperCase(), x + w / 2, y + 16);
      cx.fillStyle = '#ffffff'; cx.font = '700 64px Bitter, serif'; cx.fillText(c.valore ?? '', x + w / 2, y + 48);
      cx.fillStyle = '#D8E0EC'; cx.font = '26px Atkinson, sans-serif'; cx.fillText(c.sotto ?? '', x + w / 2, y + 124);
      cx.textAlign = 'left';
    } else if (c.tipo === 'misura') {
      const ww = Math.min(w, 220), xx = x + (w - ww) / 2;
      tondo(xx, y, ww, h, 22, 'rgba(19,49,92,0.9)', c.bordo || 'rgba(227,200,120,0.5)');
      const hv = (h - 8) * Math.max(0, Math.min(1, c.valore || 0));
      cx.fillStyle = '#2E7DB5'; cx.fillRect(xx + 6, y + h - 4 - hv, ww - 12, hv);
      const ym = y + h - 4 - (h - 8) * (c.marca || 0);
      cx.fillStyle = '#E3C878'; cx.fillRect(xx + 6, ym - 3, ww - 12, 6);
      cx.textAlign = 'center'; cx.fillStyle = '#ffffff'; cx.font = '24px Atkinson, sans-serif'; cx.fillText(c.titolo || '', xx + ww / 2, y + 12);
      cx.font = '700 40px Bitter, serif'; cx.fillText(c.testo || '', xx + ww / 2, y + 42); cx.textAlign = 'left';
    }
  }

  // il pannello come bersaglio del raggio
  function idDa(hit) {
    const u = hit.uv.x * W, v = (1 - hit.uv.y) * H;
    const r = rett.find((q) => u >= q.x && u <= q.x + q.w && v >= q.y && v <= q.y + q.h);
    return r ? r.id : null;
  }
  VR.bersaglio(piano, {
    premi(hit) { const id = idDa(hit); if (!id) return; premuto = id; sporco = true; tRidisegno = 0; Suono.clic(); emetti(id, 'premi'); },
    lascia() { const id = premuto; premuto = null; sporco = true; tRidisegno = 0; if (id) { emetti(id, 'lascia'); emetti(id, 'clic'); } },
  });
  let ascoltatore3d = null;
  function emetti(id, ev) {
    if (id === 'avanti' && ev === 'clic') { chiudiScheda && chiudiScheda(); return; }
    if (id === 'salpa' && ev === 'clic') { stato.copertina?.salpa(); return; }
    if (id === 'entra' && ev === 'clic') { stato.copertina?.entra(); return; }
    if (id === 'salta' && ev === 'clic') { UI.onSalta?.(); return; }
    if (id === 'esci' && ev === 'clic') { VR.esci(); return; }
    if (id === 'camere' && ev === 'clic') { Mondo.camere(!Mondo.conCamere); ridisegna(); return; }
    ascoltatore3d && ascoltatore3d(id, ev);
  }
  let tRidisegno = 0;
  Mondo.ogniFrame.add((dt) => {
    piano.visible = imm() && !!(stato.missione || stato.comandi || stato.scheda || stato.copertina);
    tRidisegno -= dt;
    // ridisegno al massimo 6 volte al secondo: ogni ridisegno ricarica la tela nella scheda video (nel visore costa)
    if (sporco && tRidisegno <= 0 && piano.visible) { disegna(); tRidisegno = 0.16; }
    VR.pannello.dist = stato.scheda ? 0.95 : 0.85; VR.pannello.sotto = stato.scheda ? 0.12 : 0.3;
  });
  function ridisegna() { sporco = true; }

  /* ================= HTML ================= */
  function comandiHtml(lista, on) {
    const p = $('pannello'); p.innerHTML = '';
    const el = {};
    for (const c of lista) {
      if (c.solo3d) continue;
      let n;
      if (c.tipo === 'bottone') {
        n = document.createElement('button'); n.className = 'comando' + (c.oro ? ' oro' : ''); n.innerHTML = String(c.testo).replace('\n', '<br>');
        n.addEventListener('pointerdown', (e) => { e.preventDefault(); n.classList.add('premuto'); on(c.id, 'premi'); });
        const su = () => { if (!n.classList.contains('premuto')) return; n.classList.remove('premuto'); on(c.id, 'lascia'); };
        n.addEventListener('pointerup', su); n.addEventListener('pointerleave', su); n.addEventListener('pointercancel', su);
        n.addEventListener('click', () => on(c.id, 'clic'));
      } else if (c.tipo === 'lettura') {
        n = document.createElement('div'); n.className = 'lettura';
        n.innerHTML = `<div class="t">${c.titolo || ''}</div><div class="v">${c.valore ?? ''}</div><div class="s">${c.sotto ?? ''}</div>`;
      } else if (c.tipo === 'misura') {
        n = document.createElement('div'); n.className = 'misura';
        n.innerHTML = `<div class="acqua"></div><div class="marca"></div><div class="valore">${c.titolo || ''}<b></b></div>`;
      } else if (c.tipo === 'scelte') {
        n = document.createElement('div'); n.className = 'scelte';
        for (const v of c.voci) {
          const b = document.createElement('button'); b.className = 'comando'; b.textContent = v.testo; b.dataset.id = v.id;
          b.addEventListener('click', () => on(v.id, 'clic')); n.appendChild(b);
        }
      } else if (c.tipo === 'ruota') {
        n = document.createElement('div'); n.className = 'ruota'; n.innerHTML = c.svg; n.title = 'Trascina per girare il timone';
      } else if (c.tipo === 'a capo') { const br = document.createElement('div'); br.className = 'a-capo'; p.appendChild(br); continue; }
      else continue;
      el[c.id || c.tipo] = n; p.appendChild(n);
    }
    mostra(p, true);
    return el;
  }
  function aggiornaHtml(el, c) {
    const n = el[c.id || c.tipo]; if (!n) return;
    if (c.tipo === 'lettura') { n.querySelector('.v').textContent = c.valore ?? ''; n.querySelector('.s').textContent = c.sotto ?? ''; }
    if (c.tipo === 'misura') {
      n.querySelector('.acqua').style.height = (c.valore * 100) + '%'; n.querySelector('.marca').style.bottom = (c.marca * 100) + '%';
      n.querySelector('b').textContent = c.testo || ''; n.style.borderColor = c.bordo || '';
    }
    if (c.tipo === 'scelte') n.querySelectorAll('button').forEach((b) => { const e = c.esiti?.[b.dataset.id]; b.classList.toggle('giusta', e === 'giusta'); if (e === 'sbagliata') { b.classList.remove('sbagliata'); void b.offsetWidth; b.classList.add('sbagliata'); } });
    if (c.tipo === 'bottone') n.innerHTML = String(c.testo).replace('\n', '<br>');
  }

  /* ================= API ================= */
  function missione(html) {
    stato.missione = html || ''; stato.stato = ''; ridisegna();
    $('m-testo').innerHTML = html || ''; $('m-stato').innerHTML = ''; mostra($('missione'), !!html && !imm());
  }
  function statoMissione(html) {
    if (stato.stato !== html) { stato.stato = html; ridisegna(); }
    $('m-stato').innerHTML = html;
  }
  function testa(t) { stato.testa = t; ridisegna(); }

  function comandi(lista, on) {
    const ascolta = on || (() => {});
    if (!lista) { stato.comandi = null; ascoltatore3d = null; $('pannello').innerHTML = ''; mostra($('pannello'), false); ridisegna(); return null; }
    stato.comandi = { lista }; ascoltatore3d = ascolta; ridisegna();
    const el = imm() ? {} : comandiHtml(lista, ascolta);
    if (imm()) mostra($('pannello'), false);
    const mappa = {}; lista.forEach((c) => { if (c.id) mappa[c.id] = c; if (c.tipo === 'scelte') mappa.scelte = c; });
    lista.forEach((c) => aggiornaHtml(el, c));
    return {
      el,
      agg(id, props) { const c = mappa[id]; if (!c) return; let cambiato = false; for (const k in props) if (c[k] !== props[k]) { c[k] = props[k]; cambiato = true; } if (cambiato) { ridisegna(); aggiornaHtml(el, c); } },
      esito(idVoce, e) { const c = mappa.scelte; c.esiti = { ...(c.esiti || {}), [idVoce]: e }; ridisegna(); aggiornaHtml(el, c); },
    };
  }

  let chiudiScheda = null;
  function scheda(o) {
    stato.scheda = o; ridisegna(); VR.pannello.ricentra = true;
    if (!imm()) {
      $('s-etichetta').textContent = o.etichetta || 'Hai scoperto';
      $('s-titolo').textContent = o.titolo; $('s-testo').innerHTML = o.html; $('s-fonte').textContent = o.fonte || '';
      $('b-avanti').textContent = o.bottone || 'Avanti ›';
      mostra($('scheda'), true);
    }
    return new Promise((ok) => { chiudiScheda = () => { chiudiScheda = null; stato.scheda = null; ridisegna(); mostra($('scheda'), false); Suono.clic(); ok(); }; });
  }
  $('b-avanti').addEventListener('click', () => chiudiScheda && chiudiScheda());
  function chiudiSeAperta() { if (chiudiScheda) chiudiScheda(); }

  let tAvviso = null;
  function avviso(testo, tipo, durata) {
    if (imm()) { VR.mostraScritta([{ testo, size: 90, colore: tipo === 'ok' ? '#E3C878' : tipo === 'ko' ? '#ff8a7a' : '#ffffff' }], (durata || 1.6) + 0.4); return; }
    const a = $('avviso'); a.textContent = testo; a.className = 'vivo ' + (tipo || '');
    clearTimeout(tAvviso); tAvviso = setTimeout(() => { a.className = tipo || ''; }, (durata || 1.6) * 1000);
  }
  async function cartello(n, titolo, motto) {
    Suono.scintilla();
    if (imm()) {
      VR.mostraScritta([{ testo: String(n).padStart(2, '0'), size: 150, colore: '#E3C878' }, { testo: titolo, size: 130 }, { testo: motto, size: 54, colore: '#E3C878', font: 'Mano, cursive', peso: 400 }], 3.6);
      await dorme(3.2); return;
    }
    $('c-numero').textContent = String(n).padStart(2, '0'); $('c-titolo').textContent = titolo; $('c-motto').textContent = motto;
    attiva($('cartello'), true);
    await dorme(2.9); attiva($('cartello'), false); await dorme(0.6);
  }

  /* etichette agganciate a un punto 3D: HTML su schermo, scritte 3D nel visore */
  const etichetteHtml = new Set();
  function etichetta(html, punto, opz) {
    const o = opz || {};
    if (imm()) {
      const righe = (h) => h.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').split('\n').filter((t) => t.trim())
        .map((t, i, a) => ({ testo: t, size: i === 0 && a.length > 1 && o.grande ? 120 : 64, colore: i === 0 && o.colore ? o.colore : (o.mano ? '#E3C878' : '#ffffff'), font: o.mano ? 'Mano, cursive' : undefined, peso: o.mano ? 400 : 700 }));
      let e = VR.etichetta(righe(html), punto, o.ang || 0.035);
      return { togli: () => e.togli(), set testo(h) { e.togli(); e = VR.etichetta(righe(h), punto, o.ang || 0.035); } };
    }
    const el = document.createElement('div'); el.className = 'etichetta3d ' + (o.mano ? 'mano' : ''); el.innerHTML = html; document.body.appendChild(el);
    const e = { el, punto, bordo: !!o.bordo };
    etichetteHtml.add(e);
    e.togli = () => { el.remove(); etichetteHtml.delete(e); };
    Object.defineProperty(e, 'testo', { set(h) { el.innerHTML = h; } });
    return e;
  }
  Mondo.ogniFrame.add(() => {
    for (const e of etichetteHtml) {
      const p = typeof e.punto === 'function' ? e.punto() : e.punto;
      const s = Mondo.aSchermo(p);
      let x = s.x, y = s.y;
      if (e.bordo) {
        const m = 60, w = innerWidth, h = innerHeight;
        if (!s.davanti) { x = w - x; y = h - m; }
        x = Math.min(w - m, Math.max(m, x)); y = Math.min(h - m, Math.max(m + 60, y));
      }
      e.el.style.left = x + 'px'; e.el.style.top = y + 'px';
      e.el.style.opacity = s.davanti || e.bordo ? 1 : 0;
    }
  });

  function copertina3d(o) { stato.copertina = o; ridisegna(); VR.pannello.ricentra = true; }
  function pulisci() { missione(''); comandi(null); }

  return { missione, stato: statoMissione, testa, comandi, scheda, chiudiSeAperta, avviso, cartello, etichetta, copertina3d, pulisci,
    get schedaAperta() { return !!chiudiScheda; }, mostra, attiva, dorme };
})();
