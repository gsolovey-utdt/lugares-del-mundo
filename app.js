(() => {
  // ── Supabase ──────────────────────────────────────────────────────────────
  const SUPABASE_URL = "https://irryksaoygdklwtsjsru.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_9zF3s9-hDyRRVi5OqAFP-w_z9Mrx9bt";
  let _db = undefined;
  function getDb() {
    if (_db === undefined) {
      _db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;
    }
    return _db;
  }
  async function saveQuiet(promise) {
    try { await promise; } catch (_) {}
  }

  // ── Twemoji ───────────────────────────────────────────────────────────────
  function parseEmoji(el) {
    if (typeof window.twemoji !== "undefined") {
      window.twemoji.parse(el, { folder: "svg", ext: ".svg" });
    }
  }

  // ── Sonido (Web Audio API — sin archivos externos) ────────────────────────
  const sound = (() => {
    let ctx = null;
    let muted = localStorage.getItem("ldm_muted") === "1";

    function getCtx() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (_) { ctx = null; }
      }
      return ctx;
    }

    function play(notes) {
      if (muted) return;
      const c = getCtx();
      if (!c) return;
      const t0 = c.currentTime;
      notes.forEach(({ freq, dur, delay = 0, vol = 0.28, type = "sine" }) => {
        const osc  = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0 + delay);
        gain.gain.setValueAtTime(0, t0 + delay);
        gain.gain.linearRampToValueAtTime(vol, t0 + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + dur);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + dur + 0.02);
      });
    }

    return {
      correct()     { play([{ freq:523,dur:.12 },{ freq:659,dur:.14,delay:.10 },{ freq:784,dur:.22,delay:.20,vol:.30 }]); },
      wrong()       { play([{ freq:280,dur:.14,type:"sawtooth",vol:.18 },{ freq:200,dur:.22,type:"sawtooth",delay:.12,vol:.15 }]); },
      levelUp()     { play([{ freq:523,dur:.10,vol:.24 },{ freq:659,dur:.10,delay:.10,vol:.24 },{ freq:784,dur:.10,delay:.20,vol:.24 },{ freq:1047,dur:.35,delay:.30,vol:.28 }]); },
      wildcardIn()  { play([{ freq:440,dur:.08,vol:.20 },{ freq:554,dur:.08,delay:.09,vol:.22 },{ freq:659,dur:.08,delay:.18,vol:.22 },{ freq:880,dur:.25,delay:.27,vol:.26 }]); },
      wildcardWin() { play([{ freq:659,dur:.10,vol:.22 },{ freq:880,dur:.25,delay:.12,vol:.26 }]); },
      wildcardLose(){ play([{ freq:311,dur:.18,type:"sawtooth",vol:.16 },{ freq:233,dur:.28,type:"sawtooth",delay:.15,vol:.14 }]); },
      gameOver()    { play([{ freq:392,dur:.20,type:"triangle",vol:.24 },{ freq:311,dur:.20,type:"triangle",delay:.22,vol:.22 },{ freq:233,dur:.45,type:"triangle",delay:.44,vol:.20 }]); },
      win()         { play([{ freq:523,dur:.09,vol:.24 },{ freq:659,dur:.09,delay:.09,vol:.24 },{ freq:784,dur:.09,delay:.18,vol:.24 },{ freq:1047,dur:.09,delay:.27,vol:.28 },{ freq:1319,dur:.38,delay:.36,vol:.26 }]); },
      isMuted()     { return muted; },
      toggleMute()  { muted = !muted; localStorage.setItem("ldm_muted", muted ? "1" : "0"); return muted; },
    };
  })();

  // ── Constantes ────────────────────────────────────────────────────────────
  const LEVEL_ORDER = ["easy", "medium", "hard", "flash"];
  // Config por nivel: etiqueta visible, qué set de distractores usa y, si > 0,
  // el límite de tiempo por pregunta en ms (0 = sin límite).
  const LEVELS = {
    easy:   { label: "Fácil",      distractors: "easy",   timeLimitMs: 0    },
    medium: { label: "Intermedio", distractors: "medium", timeLimitMs: 0    },
    hard:   { label: "Difícil",    distractors: "hard",   timeLimitMs: 0    },
    flash:  { label: "Relámpago",  distractors: "hard",   timeLimitMs: 3000 },
  };
  // Acceso rápido a la etiqueta (retrocompatibilidad con usos previos).
  const LEVEL_LABELS = Object.fromEntries(
    Object.entries(LEVELS).map(([key, cfg]) => [key, cfg.label])
  );
  const ROUNDS_PER_LEVEL  = 10;
  const POINTS_PER_HIT    = 10;
  const AUTO_ADVANCE_MS   = 4500;   // ms de espera antes de avanzar solo en feedback
  const ANSWER_REVEAL_MS  = 2000;   // ms que se muestran los colores de botones antes de feedback
  const POSITIVE_FEEDBACK = ["¡Correcto!", "¡Muy bien!", "¡Excelente!", "¡Genial!"];
  const NEGATIVE_FEEDBACK = [
    "¡Ups! No era esa",
    "Casi, casi...",
    "No pasa nada, seguí intentando",
    "Esta vez no, pero vamos bien",
  ];
  // Mensaje para cuando una respuesta incorrecta termina el juego (se acaban
  // las vidas): no debe alentar a "seguir intentando" porque ya no se puede.
  const GAMEOVER_FEEDBACK = "¡Ups! No era esa";

  // Lista maestra de países (nombres en español) para el desplegable de
  // "sugerí un país" en la pantalla final. Los que ya tienen comida en el
  // juego se detectan normalizando contra PLACES_DATA y se marcan con ✓.
  const ALL_COUNTRIES_ES = [
    "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Arabia Saudita",
    "Argelia", "Argentina", "Armenia", "Australia", "Austria", "Azerbaiyán",
    "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín",
    "Bielorrusia", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil",
    "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde",
    "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre",
    "Colombia", "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil",
    "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador", "Egipto",
    "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia",
    "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia",
    "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Granada", "Grecia",
    "Guatemala", "Guinea", "Guinea-Bisáu", "Guinea Ecuatorial", "Guyana", "Haití",
    "Honduras", "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda",
    "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica",
    "Japón", "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati",
    "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano", "Liberia", "Libia",
    "Liechtenstein", "Lituania", "Luxemburgo", "Madagascar", "Malasia", "Malaui",
    "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México",
    "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro", "Mozambique",
    "Myanmar", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria",
    "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán", "Palaos",
    "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal",
    "Reino Unido", "República Centroafricana", "República Checa",
    "República del Congo", "República Democrática del Congo",
    "República Dominicana", "Ruanda", "Rumania", "Rusia", "Samoa",
    "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas",
    "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles",
    "Sierra Leona", "Singapur", "Siria", "Somalia", "Sri Lanka", "Suazilandia",
    "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam",
    "Tailandia", "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga",
    "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu", "Ucrania",
    "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen",
    "Yibuti", "Zambia", "Zimbabue",
  ];

  const COUNTRY_META = {
    japon:            { iso: "JP", flag: "🇯🇵", name: "Japón",          coords: [36.2,  138.25] },
    espana:           { iso: "ES", flag: "🇪🇸", name: "España",         coords: [40.4,   -3.7 ] },
    italia:           { iso: "IT", flag: "🇮🇹", name: "Italia",         coords: [42.6,   12.5 ] },
    francia:          { iso: "FR", flag: "🇫🇷", name: "Francia",        coords: [46.2,    2.2 ] },
    alemania:         { iso: "DE", flag: "🇩🇪", name: "Alemania",       coords: [51.0,   10.0 ] },
    hungria:          { iso: "HU", flag: "🇭🇺", name: "Hungría",        coords: [47.2,   19.5 ] },
    grecia:           { iso: "GR", flag: "🇬🇷", name: "Grecia",         coords: [39.1,   22.9 ] },
    marruecos:        { iso: "MA", flag: "🇲🇦", name: "Marruecos",      coords: [31.8,   -7.1 ] },
    ucrania:          { iso: "UA", flag: "🇺🇦", name: "Ucrania",        coords: [48.4,   31.2 ] },
    "reino unido":    { iso: "GB", flag: "🇬🇧", name: "Reino Unido",    coords: [55.3,   -3.4 ] },
    brasil:           { iso: "BR", flag: "🇧🇷", name: "Brasil",         coords: [-10.0, -52.0 ] },
    argentina:        { iso: "AR", flag: "🇦🇷", name: "Argentina",      coords: [-38.4, -63.6 ] },
    peru:             { iso: "PE", flag: "🇵🇪", name: "Perú",           coords: [ -9.2, -75.0 ] },
    mexico:           { iso: "MX", flag: "🇲🇽", name: "México",         coords: [ 23.6,-102.5 ] },
    canada:           { iso: "CA", flag: "🇨🇦", name: "Canadá",         coords: [ 56.1,-106.3 ] },
    "estados unidos": { iso: "US", flag: "🇺🇸", name: "Estados Unidos", coords: [ 39.8, -98.6 ] },
    india:            { iso: "IN", flag: "🇮🇳", name: "India",          coords: [ 22.8,  79.0 ] },
    tailandia:        { iso: "TH", flag: "🇹🇭", name: "Tailandia",      coords: [ 15.6, 101.0 ] },
    vietnam:          { iso: "VN", flag: "🇻🇳", name: "Vietnam",        coords: [ 14.1, 108.3 ] },
    "corea del sur":  { iso: "KR", flag: "🇰🇷", name: "Corea del Sur",  coords: [ 36.4, 127.9 ] },
    china:            { iso: "CN", flag: "🇨🇳", name: "China",          coords: [ 35.8, 104.2 ] },
    etiopia:          { iso: "ET", flag: "🇪🇹", name: "Etiopía",        coords: [  9.1,  40.5 ] },
    nigeria:          { iso: "NG", flag: "🇳🇬", name: "Nigeria",        coords: [  9.1,   8.7 ] },
    israel:           { iso: "IL", flag: "🇮🇱", name: "Israel",         coords: [ 31.0,  35.0 ] },
    paraguay:         { iso: "PY", flag: "🇵🇾", name: "Paraguay",       coords: [-23.4, -58.4 ] },
    "el salvador":    { iso: "SV", flag: "🇸🇻", name: "El Salvador",    coords: [ 13.7, -89.2 ] },
    "costa rica":     { iso: "CR", flag: "🇨🇷", name: "Costa Rica",     coords: [  9.9, -84.1 ] },
    suecia:           { iso: "SE", flag: "🇸🇪", name: "Suecia",         coords: [ 62.0,  15.0 ] },
    uruguay:          { iso: "UY", flag: "🇺🇾", name: "Uruguay",        coords: [-32.5, -55.8 ] },
    turquia:          { iso: "TR", flag: "🇹🇷", name: "Turquía",        coords: [ 39.0,  35.2 ] },
    colombia:         { iso: "CO", flag: "🇨🇴", name: "Colombia",       coords: [  4.6, -74.1 ] },

    // Distractores adicionales
    angola:            { iso: "AO", flag: "🇦🇴", name: "Angola",          coords: [-11.2,  17.9 ] },
    argelia:           { iso: "DZ", flag: "🇩🇿", name: "Argelia",         coords: [ 28.0,   1.7 ] },
    australia:         { iso: "AU", flag: "🇦🇺", name: "Australia",       coords: [-25.3, 133.8 ] },
    austria:           { iso: "AT", flag: "🇦🇹", name: "Austria",         coords: [ 47.5,  14.6 ] },
    bangladesh:        { iso: "BD", flag: "🇧🇩", name: "Bangladesh",      coords: [ 23.7,  90.4 ] },
    belgica:           { iso: "BE", flag: "🇧🇪", name: "Bélgica",         coords: [ 50.5,   4.5 ] },
    bielorrusia:       { iso: "BY", flag: "🇧🇾", name: "Bielorrusia",     coords: [ 53.7,  27.9 ] },
    bolivia:           { iso: "BO", flag: "🇧🇴", name: "Bolivia",         coords: [-16.3, -63.6 ] },
    bulgaria:          { iso: "BG", flag: "🇧🇬", name: "Bulgaria",        coords: [ 42.7,  25.5 ] },
    "cabo verde":      { iso: "CV", flag: "🇨🇻", name: "Cabo Verde",      coords: [ 16.5, -23.0 ] },
    camboya:           { iso: "KH", flag: "🇰🇭", name: "Camboya",         coords: [ 12.6, 104.9 ] },
    chile:             { iso: "CL", flag: "🇨🇱", name: "Chile",           coords: [-35.7, -71.5 ] },
    chipre:            { iso: "CY", flag: "🇨🇾", name: "Chipre",          coords: [ 35.1,  33.4 ] },
    "corea del norte": { iso: "KP", flag: "🇰🇵", name: "Corea del Norte", coords: [ 40.3, 127.5 ] },
    dinamarca:         { iso: "DK", flag: "🇩🇰", name: "Dinamarca",       coords: [ 56.3,   9.5 ] },
    ecuador:           { iso: "EC", flag: "🇪🇨", name: "Ecuador",         coords: [ -1.8, -78.2 ] },
    egipto:            { iso: "EG", flag: "🇪🇬", name: "Egipto",          coords: [ 26.8,  30.8 ] },
    eritrea:           { iso: "ER", flag: "🇪🇷", name: "Eritrea",         coords: [ 15.2,  39.8 ] },
    // Escocia comparte ISO con Reino Unido en world_merc
    escocia:           { iso: "GB", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", name: "Escocia",         coords: [ 56.5,  -4.2 ] },
    eslovaquia:        { iso: "SK", flag: "🇸🇰", name: "Eslovaquia",      coords: [ 48.7,  19.7 ] },
    finlandia:         { iso: "FI", flag: "🇫🇮", name: "Finlandia",       coords: [ 61.9,  25.7 ] },
    ghana:             { iso: "GH", flag: "🇬🇭", name: "Ghana",           coords: [  7.9,  -1.0 ] },
    guatemala:         { iso: "GT", flag: "🇬🇹", name: "Guatemala",       coords: [ 15.8, -90.2 ] },
    honduras:          { iso: "HN", flag: "🇭🇳", name: "Honduras",        coords: [ 15.2, -86.2 ] },
    irlanda:           { iso: "IE", flag: "🇮🇪", name: "Irlanda",         coords: [ 53.4,  -8.2 ] },
    islandia:          { iso: "IS", flag: "🇮🇸", name: "Islandia",        coords: [ 64.9, -19.0 ] },
    jordania:          { iso: "JO", flag: "🇯🇴", name: "Jordania",        coords: [ 30.6,  36.2 ] },
    laos:              { iso: "LA", flag: "🇱🇦", name: "Laos",            coords: [ 19.9, 102.5 ] },
    libano:            { iso: "LB", flag: "🇱🇧", name: "Líbano",          coords: [ 33.9,  35.9 ] },
    liberia:           { iso: "LR", flag: "🇱🇷", name: "Liberia",         coords: [  6.4,  -9.4 ] },
    lituania:          { iso: "LT", flag: "🇱🇹", name: "Lituania",        coords: [ 55.2,  23.9 ] },
    malasia:           { iso: "MY", flag: "🇲🇾", name: "Malasia",         coords: [  4.2, 101.9 ] },
    nepal:             { iso: "NP", flag: "🇳🇵", name: "Nepal",           coords: [ 28.4,  84.1 ] },
    nicaragua:         { iso: "NI", flag: "🇳🇮", name: "Nicaragua",       coords: [ 12.9, -85.2 ] },
    noruega:           { iso: "NO", flag: "🇳🇴", name: "Noruega",         coords: [ 60.5,   8.5 ] },
    pakistan:          { iso: "PK", flag: "🇵🇰", name: "Pakistán",        coords: [ 30.4,  69.3 ] },
    panama:            { iso: "PA", flag: "🇵🇦", name: "Panamá",          coords: [  8.5, -80.8 ] },
    polonia:           { iso: "PL", flag: "🇵🇱", name: "Polonia",         coords: [ 51.9,  19.1 ] },
    portugal:          { iso: "PT", flag: "🇵🇹", name: "Portugal",        coords: [ 39.4,  -8.2 ] },
    "republica checa": { iso: "CZ", flag: "🇨🇿", name: "República Checa", coords: [ 49.8,  15.5 ] },
    rumania:           { iso: "RO", flag: "🇷🇴", name: "Rumania",         coords: [ 45.9,  24.9 ] },
    rusia:             { iso: "RU", flag: "🇷🇺", name: "Rusia",           coords: [ 61.5, 105.3 ] },
    senegal:           { iso: "SN", flag: "🇸🇳", name: "Senegal",         coords: [ 14.5, -14.4 ] },
    "sierra leona":    { iso: "SL", flag: "🇸🇱", name: "Sierra Leona",    coords: [  8.5, -11.8 ] },
    singapur:          { iso: "SG", flag: "🇸🇬", name: "Singapur",        coords: [  1.3, 103.8 ] },
    siria:             { iso: "SY", flag: "🇸🇾", name: "Siria",           coords: [ 34.8,  38.9 ] },
    somalia:           { iso: "SO", flag: "🇸🇴", name: "Somalia",         coords: [  5.1,  46.2 ] },
    sudan:             { iso: "SD", flag: "🇸🇩", name: "Sudán",           coords: [ 12.9,  30.2 ] },
    suiza:             { iso: "CH", flag: "🇨🇭", name: "Suiza",           coords: [ 46.8,   8.2 ] },
    taiwan:            { iso: "TW", flag: "🇹🇼", name: "Taiwán",          coords: [ 23.7, 121.0 ] },
    tunez:             { iso: "TN", flag: "🇹🇳", name: "Túnez",           coords: [ 33.9,   9.6 ] },
    venezuela:         { iso: "VE", flag: "🇻🇪", name: "Venezuela",       coords: [  6.4, -66.6 ] },
    yibuti:            { iso: "DJ", flag: "🇩🇯", name: "Yibuti",          coords: [ 11.8,  42.6 ] },
  };

  const SMALL_COUNTRY_CODES = new Set([
    "KR", "GB", "IE", "PT", "BE", "NL", "UY", "SV", "CR", "IL",
    "CV", "CY", "LB", "SG", "TW", "DJ", "PA",
  ]);

  // Lookup inverso ISO → meta, para los tooltips del mapa (mostrar el nombre
  // en español). Si dos países comparten ISO en world_merc (p. ej. Reino
  // Unido y Escocia comparten GB), gana el primero que aparece en COUNTRY_META.
  const ISO_TO_META = {};
  Object.values(COUNTRY_META).forEach((m) => {
    if (m.iso && !ISO_TO_META[m.iso]) ISO_TO_META[m.iso] = m;
  });

  /** Handler de jsVectorMap: reemplaza el nombre del país (inglés, del mapa)
   *  por el nombre en español de COUNTRY_META. Los países que no están en el
   *  dataset conservan el nombre por defecto. */
  function setSpanishRegionTooltip(event, tooltip, code) {
    const meta = ISO_TO_META[code];
    if (meta && meta.name) tooltip.text(meta.name);
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  const state = {
    startLevel: "easy",
    startLevelIndex: 0,
    levelIndex: 0,
    roundIndex: 0,
    levelAnswered: 0,
    questions: [],
    score: 0,
    hits: 0,
    answered: 0,
    lives: 5,
    outOfLives: false,
    usedFoodNames: new Set(),
    currentQuestion: null,
    lastAnswer: null,
    pendingLevelUp: false,
    pendingFinish: false,
    mapInstance: null,
    playerCountry: "argentina",
    sessionId: null,
    questionStartedAt: 0,
    seenFoods: [],
    wildcardType: null,
    wildcardCorrect: null,
    correctFoodNames: new Set(),
  };

  // Timers de módulo
  let _autoAdvanceTimer   = null;
  let _questionTimer      = null;
  let _restartConfirmTimer = null;
  let _finalCurrentPage   = 0;
  let _finalMapInstance   = null;

  // ── Referencias DOM ───────────────────────────────────────────────────────
  const refs = {
    screens: {
      start:    document.getElementById("screen-start"),
      game:     document.getElementById("screen-game"),
      feedback: document.getElementById("screen-feedback"),
      levelup:  document.getElementById("screen-levelup"),
      wildcard: document.getElementById("screen-wildcard"),
      final:    document.getElementById("screen-final"),
    },
    startGameBtn:         document.getElementById("start-game-btn"),
    playAgainBtn:         document.getElementById("play-again-btn"),
    restartBtn:           document.getElementById("restart-btn"),
    difficultyOptions:    Array.from(document.querySelectorAll(".difficulty-option")),
    difficultyInputs:     Array.from(document.querySelectorAll('input[name="difficulty"]')),
    playerCountry:        document.getElementById("player-country"),
    levelPill:            document.getElementById("level-pill"),
    progressFill:         document.getElementById("progress-fill"),
    foodImage:            document.getElementById("food-image"),
    foodPlaceholder:      document.getElementById("food-placeholder"),
    foodPlaceholderLetter: document.getElementById("food-placeholder-letter"),
    foodName:             document.getElementById("food-name"),
    optionsGrid:          document.getElementById("options-grid"),
    scoreLabel:           document.getElementById("score-label"),
    livesLabel:           document.getElementById("lives-label"),
    feedbackImage:        document.getElementById("feedback-image"),
    feedbackAnswer:       document.getElementById("feedback-answer"),
    answerFlash:          document.getElementById("answer-flash"),
    feedbackFunFact:      document.getElementById("feedback-fun-fact"),
    nextRoundBtn:         document.getElementById("next-round-btn"),
    countryMap:           document.getElementById("country-map"),
    countryMapCaption:    document.getElementById("country-map-caption"),
    levelUpTitle:         document.getElementById("levelup-title"),
    levelUpNextBtn:       document.getElementById("levelup-next-btn"),
    levelUpFinishBtn:     document.getElementById("levelup-finish-btn"),
    wildcardQuestion:     document.getElementById("wildcard-question"),
    wildcardGrid:         document.getElementById("wildcard-grid"),
    wildcardResult:       document.getElementById("wildcard-result"),
    wildcardContinueBtn:  document.getElementById("wildcard-continue-btn"),
    finalHeadline:        document.getElementById("final-headline"),
    finalSummary:         document.getElementById("final-summary"),
    finalDetails:         document.getElementById("final-details"),
    finalText:            document.getElementById("final-text"),
    saveWriteupBtn:       document.getElementById("save-writeup-btn"),
    writeupStatus:        document.getElementById("writeup-status"),
    suggestCountry:       document.getElementById("suggest-country-select"),
    suggestBtn:           document.getElementById("suggest-country-btn"),
    suggestStatus:        document.getElementById("suggest-status"),
    // Nuevos
    autoAdvanceBar:       document.getElementById("auto-advance-bar"),
    autoAdvanceFill:      document.getElementById("auto-advance-fill"),
    questionTimerBar:     document.getElementById("question-timer-bar"),
    questionTimerFill:    document.getElementById("question-timer-fill"),
    soundBtn:             document.getElementById("sound-btn"),
    finalNextBtn:         document.getElementById("final-next-btn"),
    finalCard:            document.querySelector(".final-card"),
  };

  // ── Helpers de UI ─────────────────────────────────────────────────────────
  function getFlag(countryName) {
    const meta = COUNTRY_META[normalizeCountry(countryName)];
    return meta?.flag || "";
  }

  /** Muestra un "+N" flotante sobre el score label */
  function showScoreFloat(points) {
    const label = refs.scoreLabel;
    if (!label) return;
    const rect = label.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "score-float";
    el.textContent = "+" + points;
    el.style.left = Math.round(rect.left + rect.width / 2) + "px";
    el.style.top  = Math.round(rect.top - 4) + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function showLastLifeWarning() {
    const card = document.querySelector(".game-card");
    if (!card) return;
    const el = document.createElement("div");
    el.className = "last-life-warning";
    el.textContent = "¡Te queda una última vida!";
    card.appendChild(el);
    setTimeout(() => el.remove(), ANSWER_REVEAL_MS);
  }

  /** Muestra el cartel genérico (✓/✗ + frase) sobre la pantalla de juego,
   *  durante la ventana de revelado de colores, antes de pasar a feedback. */
  function showAnswerFlash(isCorrect, gameOver, isTimeout) {
    if (!refs.answerFlash) return;
    refs.answerFlash.textContent = isCorrect
      ? randomItem(POSITIVE_FEEDBACK)
      : (isTimeout
          ? "⏱️ ¡Se acabó el tiempo!"
          : (gameOver ? GAMEOVER_FEEDBACK : randomItem(NEGATIVE_FEEDBACK)));
    refs.answerFlash.classList.remove("good", "bad");
    refs.answerFlash.classList.add(isCorrect ? "good" : "bad");
    refs.answerFlash.hidden = false;
  }

  function hideAnswerFlash() {
    if (refs.answerFlash) refs.answerFlash.hidden = true;
  }

  /** Precarga la imagen de la siguiente pregunta */
  function preloadNextImage() {
    const next = state.questions[state.roundIndex + 1];
    if (next?.food?.image) {
      const img = new Image();
      img.src = next.food.image;
    }
  }

  /** Actualiza el ícono y título del botón de sonido */
  function updateSoundBtn() {
    if (!refs.soundBtn) return;
    const muted = sound.isMuted();
    refs.soundBtn.textContent = muted ? "🔇" : "🔊";
    refs.soundBtn.title = muted ? "Sonido silenciado" : "Sonido activado";
  }

  /** Inicia el temporizador de avance automático en la pantalla de feedback */
  function startAutoAdvance() {
    clearAutoAdvance();
    const { autoAdvanceBar, autoAdvanceFill } = refs;
    if (!autoAdvanceBar || !autoAdvanceFill) return;

    // Reset sin transición
    autoAdvanceFill.style.transition = "none";
    autoAdvanceFill.style.transform  = "scaleX(1)";
    autoAdvanceBar.hidden = false;

    // Dispara la transición en el siguiente frame de pintura
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        autoAdvanceFill.style.transition = `transform ${AUTO_ADVANCE_MS}ms linear`;
        autoAdvanceFill.style.transform  = "scaleX(0)";
      });
    });

    _autoAdvanceTimer = setTimeout(() => {
      clearAutoAdvance();
      continueAfterFeedback();
    }, AUTO_ADVANCE_MS);
  }

  /** Cancela el temporizador de avance automático */
  function clearAutoAdvance() {
    clearTimeout(_autoAdvanceTimer);
    _autoAdvanceTimer = null;
    if (refs.autoAdvanceBar) refs.autoAdvanceBar.hidden = true;
  }

  /** Inicia la cuenta regresiva por pregunta (nivel Relámpago). */
  function startQuestionCountdown(timeLimitMs) {
    clearTimeout(_questionTimer);
    _questionTimer = null;
    const { questionTimerBar, questionTimerFill } = refs;
    if (!questionTimerBar || !questionTimerFill) return;

    if (!timeLimitMs || timeLimitMs <= 0) {
      // Nivel sin tiempo: la barra no ocupa lugar.
      questionTimerBar.classList.add("is-off");
      return;
    }

    // Nivel cronometrado: el riel ocupa lugar y la barra arranca llena.
    questionTimerBar.classList.remove("is-off");
    questionTimerFill.style.transition = "none";
    questionTimerFill.style.transform  = "scaleX(1)";

    // Dispara la transición en el siguiente frame de pintura
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        questionTimerFill.style.transition = `transform ${timeLimitMs}ms linear`;
        questionTimerFill.style.transform  = "scaleX(0)";
      });
    });

    _questionTimer = setTimeout(() => {
      _questionTimer = null;
      handleTimeout();
    }, timeLimitMs);
  }

  /** Detiene la cuenta regresiva (respuesta dada o tiempo agotado).
   *  No oculta el riel: lo deja vacío para no desplazar el layout durante el
   *  revelado. La barra se vuelve a ocultar/mostrar en el próximo renderQuestion. */
  function clearQuestionCountdown() {
    clearTimeout(_questionTimer);
    _questionTimer = null;
    if (refs.questionTimerFill) {
      refs.questionTimerFill.style.transition = "none";
      refs.questionTimerFill.style.transform  = "scaleX(0)";
    }
  }

  /** Se acabó el tiempo: cuenta como respuesta incorrecta. */
  function handleTimeout() {
    if (!state.currentQuestion) return;
    handleAnswer(null, null, true);
  }

  // ── Inicialización ────────────────────────────────────────────────────────
  function init() {
    if (!Array.isArray(window.PLACES_DATA) || window.PLACES_DATA.length === 0) {
      refs.startGameBtn.disabled = true;
      refs.startGameBtn.textContent = "No hay lugares cargados";
      return;
    }

    populateCountryDropdown();

    refs.startGameBtn.addEventListener("click", startGame);
    refs.playAgainBtn.addEventListener("click", resetToStart);
    refs.restartBtn.addEventListener("click", handleRestartClick);
    refs.nextRoundBtn.addEventListener("click", () => {
      clearAutoAdvance();
      continueAfterFeedback();
    });
    refs.levelUpNextBtn.addEventListener("click", continueFromLevelUp);
    if (refs.levelUpFinishBtn) refs.levelUpFinishBtn.addEventListener("click", finishFromLevelUp);
    refs.wildcardContinueBtn.addEventListener("click", continueFromWildcard);
    refs.saveWriteupBtn.addEventListener("click", saveWriteup);
    if (refs.suggestBtn) refs.suggestBtn.addEventListener("click", saveSuggestion);
    if (refs.finalNextBtn) refs.finalNextBtn.addEventListener("click", advanceFinalPage);
    document.addEventListener("keydown", handleFinalKeydown);
    document.addEventListener("touchstart", handleFinalTouchStart, false);
    document.addEventListener("touchend", handleFinalTouchEnd, false);
    refs.difficultyInputs.forEach((input) =>
      input.addEventListener("change", syncDifficultySelection)
    );
    refs.foodImage.addEventListener("error", showImagePlaceholder);
    refs.foodImage.addEventListener("load", showLoadedImage);

    if (refs.soundBtn) {
      refs.soundBtn.addEventListener("click", () => {
        sound.toggleMute();
        updateSoundBtn();
      });
    }
    updateSoundBtn();

    syncDifficultySelection();
    showScreen("start");
  }

  /** Dos pasos para reiniciar: primer clic pide confirmación, segundo reinicia */
  function handleRestartClick() {
    if (refs.restartBtn.dataset.confirming === "1") {
      clearTimeout(_restartConfirmTimer);
      _restartConfirmTimer = null;
      refs.restartBtn.dataset.confirming = "";
      refs.restartBtn.textContent = "Reiniciar";
      resetToStart();
    } else {
      refs.restartBtn.dataset.confirming = "1";
      refs.restartBtn.textContent = "¿Seguro? →";
      _restartConfirmTimer = setTimeout(() => {
        refs.restartBtn.dataset.confirming = "";
        refs.restartBtn.textContent = "Reiniciar";
      }, 2500);
    }
  }

  // ── Dropdown de país ──────────────────────────────────────────────────────
  function populateCountryDropdown() {
    const select = refs.playerCountry;
    if (!select) return;
    select.innerHTML = "";

    const arMeta = COUNTRY_META["argentina"];
    const arOpt = document.createElement("option");
    arOpt.value = "argentina";
    arOpt.textContent = arMeta.name;
    arOpt.selected = true;
    select.appendChild(arOpt);

    const others = Object.entries(COUNTRY_META)
      .filter(([key]) => key !== "argentina")
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, "es"));

    for (const [key, meta] of others) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.name;
      select.appendChild(opt);
    }
  }

  /** Llena el desplegable de "sugerí un país". Los países que ya tienen
   *  comida en el juego aparecen deshabilitados y marcados con ✓. */
  function populateSuggestionDropdown() {
    const select = refs.suggestCountry;
    if (!select) return;
    select.innerHTML = "";

    const present = new Set(
      window.PLACES_DATA.map((f) => normalizeCountry(f.country))
    );

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Elegí un país…";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    ALL_COUNTRIES_ES
      .slice()
      .sort((a, b) => a.localeCompare(b, "es"))
      .forEach((name) => {
        const already = present.has(normalizeCountry(name));
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = already ? name + "  ✓ (ya está)" : name;
        opt.disabled = already;
        select.appendChild(opt);
      });
  }

  /** Guarda la sugerencia de país en Supabase (fire-and-forget). */
  function saveSuggestion() {
    const country = refs.suggestCountry?.value || "";
    if (!country) {
      refs.suggestCountry?.classList.add("shake");
      setTimeout(() => refs.suggestCountry?.classList.remove("shake"), 400);
      return;
    }

    const db = getDb();
    if (db && state.sessionId) {
      saveQuiet(db.from("ldm_suggestions").insert([{
        session_id: state.sessionId,
        country:    country,
      }]));
    }

    if (refs.suggestCountry)  refs.suggestCountry.disabled = true;
    if (refs.suggestBtn)      refs.suggestBtn.hidden       = true;
    if (refs.suggestStatus)   refs.suggestStatus.hidden    = false;
  }

  // ── Flujo del juego ───────────────────────────────────────────────────────
  function startGame() {
    const selectedLevel =
      refs.difficultyInputs.find((input) => input.checked)?.value || "easy";
    const selectedIndex = LEVEL_ORDER.indexOf(selectedLevel);

    state.startLevel      = selectedLevel;
    state.startLevelIndex = selectedIndex >= 0 ? selectedIndex : 0;
    state.levelIndex      = state.startLevelIndex;
    state.roundIndex      = 0;
    state.levelAnswered   = 0;
    state.score           = 0;
    state.hits            = 0;
    state.answered        = 0;
    state.lives           = 5;
    state.outOfLives      = false;
    state.usedFoodNames   = new Set();
    state.pendingLevelUp  = false;
    state.pendingFinish   = false;
    state.lastAnswer      = null;
    state.sessionId       = crypto.randomUUID();
    state.seenFoods       = [];
    state.wildcardType    = null;
    state.wildcardCorrect = null;
    state.correctFoodNames = new Set();
    state.playerCountry   = refs.playerCountry?.value || "argentina";

    // Cancelar cualquier temporizador pendiente de una partida anterior
    clearAutoAdvance();
    clearQuestionCountdown();

    // Cancelar cualquier confirm pendiente de restart
    clearTimeout(_restartConfirmTimer);
    refs.restartBtn.dataset.confirming = "";
    refs.restartBtn.textContent = "Reiniciar";

    const db = getDb();
    if (db) {
      saveQuiet(db.from("ldm_sessions").insert([{
        session_id:    state.sessionId,
        player_country: state.playerCountry,
        start_level:   selectedLevel,
      }]));
    }

    buildQuestionsForCurrentLevel();
    renderQuestion();
    showScreen("game");
  }

  function buildQuestionsForCurrentLevel() {
    const levelKey = LEVEL_ORDER[state.levelIndex];
    const distractorKey = LEVELS[levelKey].distractors;
    const pool = window.PLACES_DATA.filter(
      (food) => food?.country && food?.distractors?.[distractorKey]?.length >= 2
    );

    if (pool.length === 0) { state.questions = []; return; }

    const selected    = [];
    const unusedPool  = shuffle(
      pool.filter((food) => !state.usedFoodNames.has(getFoodId(food)))
    );

    for (const food of unusedPool) {
      if (selected.length >= ROUNDS_PER_LEVEL) break;
      selected.push(food);
    }

    if (selected.length < ROUNDS_PER_LEVEL) {
      const fallbackUnique = shuffle(
        pool.filter((food) => !selected.some((p) => getFoodId(p) === getFoodId(food)))
      );
      for (const food of fallbackUnique) {
        if (selected.length >= ROUNDS_PER_LEVEL) break;
        selected.push(food);
      }
    }

    while (selected.length < ROUNDS_PER_LEVEL) {
      selected.push(pool[Math.floor(Math.random() * pool.length)]);
    }

    selected.forEach((food) => state.usedFoodNames.add(getFoodId(food)));
    state.questions     = selected.map((food) => createQuestion(food, levelKey));
    state.roundIndex    = 0;
    state.levelAnswered = 0;
  }

  function createQuestion(food, levelKey) {
    const distractorKey = LEVELS[levelKey].distractors;
    const levelDistractors = Array.isArray(food.distractors?.[distractorKey])
      ? [...food.distractors[distractorKey]]
      : [];
    const uniqueDistractors = Array.from(
      new Set(levelDistractors.filter((country) => country !== food.country))
    );
    const fallback = getFallbackCountries(food.country, uniqueDistractors, 2);
    const selectedDistractors = shuffle([...uniqueDistractors, ...fallback]).slice(0, 2);
    const options = shuffle([food.country, ...selectedDistractors]);
    return { food, level: levelKey, options, correctCountry: food.country };
  }

  function getFallbackCountries(correctCountry, usedDistractors, needed) {
    const allCountries = Array.from(
      new Set(window.PLACES_DATA.map((food) => food.country))
    );
    const available = allCountries.filter(
      (country) => country !== correctCountry && !usedDistractors.includes(country)
    );
    return shuffle(available).slice(0, needed);
  }

  function renderQuestion() {
    state.currentQuestion = state.questions[state.roundIndex];

    if (!state.currentQuestion) { showFinal(); return; }

    hideAnswerFlash();
    state.questionStartedAt = performance.now();

    const { food, level } = state.currentQuestion;
    refs.levelPill.textContent  = "Nivel " + LEVEL_LABELS[level];
    refs.scoreLabel.textContent = "Puntaje: " + String(state.score);
    refs.livesLabel.textContent = state.lives + " ❤️";
    parseEmoji(refs.livesLabel);
    refs.foodName.textContent   = food.place_name;
    setFoodImage(food.image, food.place_name);
    updateLevelProgress();

    refs.optionsGrid.innerHTML = "";
    state.currentQuestion.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn";
      button.dataset.country = option;
      const flag = getFlag(option);
      button.textContent = flag ? flag + " " + option : option;
      parseEmoji(button);
      button.addEventListener("click", () => handleAnswer(option, button));
      refs.optionsGrid.appendChild(button);
    });

    // Cuenta regresiva (sólo niveles con timeLimitMs > 0, ej. Relámpago)
    startQuestionCountdown(LEVELS[level].timeLimitMs);
  }

  function handleAnswer(selectedCountry, clickedButton, isTimeout = false) {
    const question = state.currentQuestion;
    if (!question) return;

    // El jugador respondió (o se acabó el tiempo): cancelar la cuenta regresiva.
    clearQuestionCountdown();

    const reactionTimeMs = isTimeout
      ? (LEVELS[question.level]?.timeLimitMs || 0)
      : Math.round(performance.now() - state.questionStartedAt);
    disableOptionButtons();

    const isCorrect = !isTimeout && selectedCountry === question.correctCountry;

    // ── Colores inmediatos en botones ──────────────────────────────────────
    if (clickedButton) {
      clickedButton.classList.add(isCorrect ? "option-btn--correct" : "option-btn--wrong");
    }
    if (!isCorrect) {
      // Resaltar cuál era la correcta
      const allBtns = refs.optionsGrid.querySelectorAll("[data-country]");
      allBtns.forEach((btn) => {
        if (btn.dataset.country === question.correctCountry) {
          btn.classList.add("option-btn--correct");
        }
      });
    }

    // ── Sonido inmediato ───────────────────────────────────────────────────
    if (isCorrect) {
      sound.correct();
    } else {
      sound.wrong();
    }

    // ── Cartel genérico sobre la pantalla de juego (✓/✗ + frase) ────────────
    // state.lives todavía no se descontó: si es ≤1 y la respuesta es incorrecta,
    // esta jugada deja al jugador sin vidas (game over) → no alentar a seguir.
    const willEndGame = !isCorrect && state.lives <= 1;
    showAnswerFlash(isCorrect, willEndGame, isTimeout);

    // ── Actualizar estado ──────────────────────────────────────────────────
    state.answered      += 1;
    state.levelAnswered += 1;
    if (isCorrect) {
      state.hits  += 1;
      state.score += POINTS_PER_HIT;
      state.correctFoodNames.add(getFoodId(question.food));
      showScoreFloat(POINTS_PER_HIT);
    } else {
      state.lives   = Math.max(0, state.lives - 1);
      if (state.lives === 1) showLastLifeWarning();
    }

    if (!state.seenFoods.some((f) => getFoodId(f) === getFoodId(question.food))) {
      state.seenFoods.push(question.food);
    }

    state.lastAnswer = { isCorrect, selectedCountry, question, reactionTimeMs };

    const isLastRoundInLevel = state.roundIndex >= state.questions.length - 1;
    const hasNextLevel       = state.levelIndex < LEVEL_ORDER.length - 1;
    state.outOfLives         = state.lives <= 0;
    state.pendingLevelUp     = !state.outOfLives && isLastRoundInLevel && hasNextLevel;
    state.pendingFinish      = state.outOfLives || (isLastRoundInLevel && !hasNextLevel);

    // Precargar imagen de la siguiente pregunta
    preloadNextImage();

    const db = getDb();
    if (db) {
      saveQuiet(db.from("ldm_answers").insert([{
        session_id:      state.sessionId,
        round_number:    state.answered,
        level:           question.level,
        place_name:       question.food.place_name,
        correct_country: question.correctCountry,
        // En timeout no hay país elegido; la columna es NOT NULL, así que
        // guardamos un centinela legible en vez de null.
        selected_country: selectedCountry || "(sin respuesta)",
        is_correct:      isCorrect,
        is_wildcard:     false,
        wildcard_type:   null,
        reaction_time_ms: reactionTimeMs,
        lives_after:     state.lives,
      }]));
    }

    // Esperar brevemente para que se vean los colores antes de pasar al feedback
    setTimeout(() => showFeedback(), ANSWER_REVEAL_MS);
  }

  // ── Comodín ───────────────────────────────────────────────────────────────
  function maybeTriggerWildcard() {
    if (state.lives < 1 || state.lives > 2) return false;
    if (Math.random() >= 0.25) return false;

    const type = "country_from_flag";
    state.wildcardType = type;
    sound.wildcardIn();
    renderWildcard(type);
    showScreen("wildcard");
    return true;
  }

  function renderWildcard(type) {
    refs.wildcardResult.classList.add("vis-hidden");
    refs.wildcardResult.textContent = "";
    refs.wildcardContinueBtn.classList.add("vis-hidden");
    refs.wildcardGrid.innerHTML     = "";

    if (type === "place_from_description") {
      const currentFoodId = getFoodId(state.currentQuestion.food);
      const pool          = state.seenFoods.filter((f) => getFoodId(f) !== currentFoodId);
      const correctFood   = randomItem(pool.length > 0 ? pool : state.seenFoods);
      const fact          = getRandomFact(correctFood);
      state.wildcardCorrect = correctFood.place_name;

      refs.wildcardQuestion.innerHTML =
        '<p class="wildcard-fact-label">¿De qué lugar habla este dato?</p>' +
        '<p class="wildcard-fact">"' + escapeHtml(fact) + '"</p>';

      const otherFoods = shuffle(
        (window.PLACES_DATA || []).filter((f) => getFoodId(f) !== getFoodId(correctFood))
      ).slice(0, 2).map((f) => f.place_name);

      shuffle([correctFood.place_name, ...otherFoods]).forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn";
        btn.textContent = opt;
        btn.addEventListener("click", () => handleWildcardAnswer(opt));
        refs.wildcardGrid.appendChild(btn);
      });

    } else {
      const allKeys   = Object.keys(COUNTRY_META);
      const correctKey = randomItem(allKeys);
      const correctMeta = COUNTRY_META[correctKey];
      state.wildcardCorrect = correctMeta.name;

      refs.wildcardQuestion.innerHTML = "";
      const labelEl   = document.createElement("p");
      labelEl.className   = "wildcard-fact-label";
      labelEl.textContent = "¿De qué país es esta bandera?";
      const bigFlagEl = document.createElement("p");
      bigFlagEl.className   = "wildcard-big-flag";
      bigFlagEl.textContent = correctMeta.flag;
      parseEmoji(bigFlagEl);
      refs.wildcardQuestion.appendChild(labelEl);
      refs.wildcardQuestion.appendChild(bigFlagEl);

      const otherKeys = shuffle(allKeys.filter((k) => k !== correctKey)).slice(0, 2);
      shuffle([correctMeta.name, ...otherKeys.map((k) => COUNTRY_META[k].name)]).forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn";
        btn.textContent = opt;
        btn.addEventListener("click", () => handleWildcardAnswer(opt));
        refs.wildcardGrid.appendChild(btn);
      });
    }
  }

  function handleWildcardAnswer(selected) {
    const buttons = refs.wildcardGrid.querySelectorAll("button");
    buttons.forEach((btn) => { btn.disabled = true; });

    const isCorrect = selected === state.wildcardCorrect;

    if (isCorrect) {
      sound.wildcardWin();
      state.lives = Math.min(5, state.lives + 1);
      refs.livesLabel.textContent    = state.lives + " ❤️";
      parseEmoji(refs.livesLabel);
      refs.wildcardResult.textContent = "¡Correcto! Ganaste una vida ❤️";
      refs.wildcardResult.className   = "wildcard-result wildcard-result--win";
    } else {
      sound.wildcardLose();
      refs.wildcardResult.textContent =
        "¡Casi! No ganaste vida esta vez. Era: " + state.wildcardCorrect;
      refs.wildcardResult.className = "wildcard-result wildcard-result--lose";
    }

    const db = getDb();
    if (db) {
      saveQuiet(db.from("ldm_answers").insert([{
        session_id:       state.sessionId,
        round_number:     state.answered,
        level:            LEVEL_ORDER[state.levelIndex],
        place_name:        state.currentQuestion?.food?.place_name || "",
        correct_country:  state.wildcardCorrect,
        selected_country: selected,
        is_correct:       isCorrect,
        is_wildcard:      true,
        wildcard_type:    state.wildcardType,
        reaction_time_ms: 0,
        lives_after:      state.lives,
      }]));
    }

    refs.wildcardResult.classList.remove("vis-hidden");
    refs.wildcardContinueBtn.classList.remove("vis-hidden");
  }

  function continueFromWildcard() {
    state.wildcardType    = null;
    state.wildcardCorrect = null;

    if (state.pendingLevelUp) { showLevelUp(); return; }

    state.outOfLives = state.lives <= 0;
    const isLastRoundOfLastLevel =
      state.roundIndex >= state.questions.length - 1 &&
      state.levelIndex >= LEVEL_ORDER.length - 1;

    if (state.outOfLives || isLastRoundOfLastLevel) {
      state.pendingFinish = false;
      showFinal();
      return;
    }

    state.outOfLives    = false;
    state.pendingFinish = false;
    state.roundIndex   += 1;
    renderQuestion();
    showScreen("game");
  }

  // ── Pantalla de feedback ──────────────────────────────────────────────────
  function showFeedback() {
    const answer = state.lastAnswer;
    if (!answer) return;

    // Foto de la comida (ya precargada) junto al texto de la respuesta
    if (refs.feedbackImage) {
      const imgPath = answer.question.food.image;
      if (imgPath) {
        refs.feedbackImage.src    = imgPath;
        refs.feedbackImage.alt    = answer.question.food.place_name || "";
        refs.feedbackImage.hidden = false;
      } else {
        refs.feedbackImage.hidden = true;
      }
    }

    const flag  = getFlag(answer.question.correctCountry);
    // Sin columna answer_label: la armamos a partir del nombre del lugar.
    const placeName = answer.question.food.place_name || "";
    const label = placeName ? (placeName + " está en") : "La respuesta correcta era:";
    refs.feedbackAnswer.textContent =
      label + " " + (flag ? flag + " " : "") + answer.question.correctCountry;
    parseEmoji(refs.feedbackAnswer);
    refs.feedbackFunFact.textContent =
      "¿Sabías qué? " + getRandomFact(answer.question.food);

    if (state.pendingFinish) {
      refs.nextRoundBtn.textContent = "Ver resultado final";
    } else if (state.pendingLevelUp) {
      refs.nextRoundBtn.textContent = "Continuar";
    } else {
      refs.nextRoundBtn.textContent = "Siguiente ronda";
    }

    updateLevelProgress();
    showScreen("feedback");
    renderCountryMap(answer.question.correctCountry);
  }

  function renderCountryMap(countryName) {
    const meta = COUNTRY_META[normalizeCountry(countryName)];

    if (refs.countryMapCaption) {
      const flag = getFlag(countryName);
      refs.countryMapCaption.textContent =
        "¿Sabías dónde queda " + (flag ? flag + " " : "") + countryName + "?";
      parseEmoji(refs.countryMapCaption);
    }

    if (!meta || typeof window.jsVectorMap === "undefined") {
      refs.countryMap.textContent = "Mapa no disponible para este país en este momento.";
      return;
    }

    if (state.mapInstance && typeof state.mapInstance.destroy === "function") {
      try { state.mapInstance.destroy(); } catch (_) {}
      state.mapInstance = null;
    }

    refs.countryMap.innerHTML = "";

    const markers = [];
    if (Array.isArray(meta.coords)) {
      markers.push({ name: countryName, coords: meta.coords });
    }

    try {
      state.mapInstance = new jsVectorMap({
        selector: "#country-map",
        map: "world_merc",
        backgroundColor: "transparent",
        zoomButtons: false,
        zoomOnScroll: false,
        zoomOnScrollSpeed: 0,
        draggable: false,
        showTooltip: true,
        onRegionTooltipShow: setSpanishRegionTooltip,
        regionStyle: {
          initial:      { fill: "#7eb1dd", stroke: "#ffffff", strokeWidth: 0.6 },
          hover:        { fill: "#7eb1dd" },
          selected:     { fill: "#ff8c42" },
          selectedHover:{ fill: "#ff8c42" },
        },
        regionsSelectable: false,
        selectedRegions: [meta.iso],
        markers,
        markerStyle: {
          initial: { fill: "#e03050", stroke: "#ffffff", strokeWidth: 0, r: 1 },
          hover:   { fill: "#e03050" },
        },
      });
      if (typeof state.mapInstance.updateSize === "function") {
        state.mapInstance.updateSize();
      }
      // Ping de radar: dos anillos concéntricos que se expanden y desvanecen
      requestAnimationFrame(() => {
        const markerEl = refs.countryMap.querySelector(".jvm-marker");
        if (!markerEl) return;
        const cx = parseFloat(markerEl.getAttribute("cx"));
        const cy = parseFloat(markerEl.getAttribute("cy"));
        markerEl.style.display = "none";
        const transformGroup = refs.countryMap.querySelector("svg > g");
        const scaleMatch = transformGroup && transformGroup.getAttribute("transform").match(/scale\(([\d.]+)\)/);
        const invScale = scaleMatch ? 1 / parseFloat(scaleMatch[1]) : 1;
        const ns = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(ns, "g");
        g.setAttribute("pointer-events", "none");
        g.setAttribute("transform", `translate(${cx},${cy}) scale(${invScale}) translate(${-cx},${-cy})`);
        [0, 0.8].forEach(delay => {
          const ring = document.createElementNS(ns, "circle");
          ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
          ring.setAttribute("r", "2");
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", "#ff8c42"); ring.setAttribute("stroke-width", "1.5");
          const animR = document.createElementNS(ns, "animate");
          animR.setAttribute("attributeName", "r");
          animR.setAttribute("from", "2"); animR.setAttribute("to", "18");
          animR.setAttribute("dur", "1.6s"); animR.setAttribute("begin", delay + "s");
          animR.setAttribute("repeatCount", "indefinite"); animR.setAttribute("calcMode", "ease-out");
          const animO = document.createElementNS(ns, "animate");
          animO.setAttribute("attributeName", "stroke-opacity");
          animO.setAttribute("from", "0.85"); animO.setAttribute("to", "0");
          animO.setAttribute("dur", "1.6s"); animO.setAttribute("begin", delay + "s");
          animO.setAttribute("repeatCount", "indefinite");
          ring.appendChild(animR); ring.appendChild(animO);
          g.appendChild(ring);
        });
        markerEl.parentNode.appendChild(g);
      });
    } catch (error) {
      refs.countryMap.textContent = "No se pudo renderizar el mapa.";
    }
  }

  function continueAfterFeedback() {
    clearAutoAdvance();   // cancelar si el usuario hizo clic manual

    if (maybeTriggerWildcard()) return;
    if (state.pendingLevelUp)  { showLevelUp(); return; }
    if (state.pendingFinish)   { state.pendingFinish = false; showFinal(); return; }

    state.roundIndex += 1;
    renderQuestion();
    showScreen("game");
  }

  // ── Transición de nivel ───────────────────────────────────────────────────
  function showLevelUp() {
    // En este punto state.levelIndex es el nivel recién completado; el próximo
    // es levelIndex + 1 (existe porque pendingLevelUp implica que hay siguiente).
    const completedLabel = LEVEL_LABELS[LEVEL_ORDER[state.levelIndex]];
    const nextLabel      = LEVEL_LABELS[LEVEL_ORDER[state.levelIndex + 1]];
    if (refs.levelUpTitle) {
      refs.levelUpTitle.textContent = "¡Completaste el nivel " + completedLabel + "!";
    }
    if (refs.levelUpNextBtn && nextLabel) {
      refs.levelUpNextBtn.textContent = "Seguir al nivel " + nextLabel + " →";
    }
    sound.levelUp();
    showScreen("levelup");
  }

  function continueFromLevelUp() {
    state.levelIndex    += 1;
    state.pendingLevelUp = false;
    buildQuestionsForCurrentLevel();
    renderQuestion();
    showScreen("game");
  }

  /** Desde la transición de nivel, el jugador elige terminar la partida
   *  (sin haber perdido) para ver lo que aprendió y dejar su mensaje. */
  function finishFromLevelUp() {
    state.pendingLevelUp = false;
    clearAutoAdvance();
    clearQuestionCountdown();
    showFinal();
  }

  // ── Pantalla final ────────────────────────────────────────────────────────
  function showFinal() {
    const won      = !state.outOfLives;
    // "Todos los niveles" solo si arrancó en el primero y llegó al último.
    const completedAll = won
      && state.levelIndex === LEVEL_ORDER.length - 1
      && state.startLevelIndex === 0;
    const completedLabel = LEVEL_LABELS[LEVEL_ORDER[state.levelIndex]];
    const accuracy = state.answered > 0
      ? Math.round((state.hits / state.answered) * 100)
      : 0;

    // Destruir mapa final previo si existe
    if (_finalMapInstance && typeof _finalMapInstance.destroy === "function") {
      try { _finalMapInstance.destroy(); } catch (_) {}
      _finalMapInstance = null;
    }

    // Clase de color según resultado
    if (refs.finalCard) {
      refs.finalCard.classList.toggle("final-card--win",     won);
      refs.finalCard.classList.toggle("final-card--gameover", !won);
    }

    // Titular
    if (refs.finalHeadline) {
      refs.finalHeadline.textContent = !won
        ? "¡Se acabaron las vidas! 😢"
        : (completedAll ? "¡Lo lograste! 🏆" : "¡Muy bien! 🌟");
    }

    // Resumen
    refs.finalSummary.textContent = !won
      ? "Pero llegaste muy lejos, ¡buen intento!"
      : (completedAll
          ? "¡Completaste todos los niveles!"
          : "¡Completaste el nivel " + completedLabel + "!");

    // Detalles numéricos
    refs.finalDetails.textContent =
      "Puntaje: " + state.score + " pts · " +
      state.hits + "/" + state.answered + " aciertos (" + accuracy + "%)";

    // Reset textarea
    if (refs.finalText)      refs.finalText.value  = "";
    if (refs.saveWriteupBtn) refs.saveWriteupBtn.hidden = false;
    if (refs.writeupStatus)  refs.writeupStatus.hidden  = true;

    // Reset sugerencia de país
    populateSuggestionDropdown();
    if (refs.suggestCountry) refs.suggestCountry.disabled = false;
    if (refs.suggestBtn)     refs.suggestBtn.hidden       = false;
    if (refs.suggestStatus)  refs.suggestStatus.hidden    = true;

    // Sonido de resultado
    if (won) { sound.win(); } else { sound.gameOver(); }

    // Poblar la grilla de comidas y arrancar en página 0
    renderFoodsGrid();
    showFinalPage(0);

    showScreen("final");
  }

  function advanceFinalPage() {
    showFinalPage(_finalCurrentPage + 1);
  }

  /** Navegación del carrusel final con las flechas del teclado.
   *  Ignora las flechas si el foco está en un campo de texto (escritura creativa). */
  function handleFinalKeydown(e) {
    if (!refs.screens.final.classList.contains("is-active")) return;
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showFinalPage(_finalCurrentPage + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      showFinalPage(_finalCurrentPage - 1);
    }
  }

  // ── Touch swipe para navegación del carrusel en mobile ──
  let _touchStartX = 0;
  let _touchStartTarget = null;
  function handleFinalTouchStart(e) {
    if (!refs.screens.final.classList.contains("is-active")) return;
    _touchStartX = e.changedTouches[0].clientX;
    _touchStartTarget = e.target;
  }
  function handleFinalTouchEnd(e) {
    if (!refs.screens.final.classList.contains("is-active")) return;
    // Si el touch comenzó en la grilla de fotos, permitir solo su scroll horizontal,
    // no cambiar de página del carrusel
    if (_touchStartTarget?.closest?.(".foods-grid")) {
      return;
    }
    const touchEndX = e.changedTouches[0].clientX;
    const diff = _touchStartX - touchEndX;
    // Si el swipe horizontal es ≥ 50px, avanzar o retroceder
    if (Math.abs(diff) >= 50) {
      if (diff > 0) {
        // Swipe a la izquierda → avanzar
        showFinalPage(_finalCurrentPage + 1);
      } else {
        // Swipe a la derecha → retroceder
        showFinalPage(_finalCurrentPage - 1);
      }
    }
  }

  function showFinalPage(n) {
    const TOTAL = 5;
    _finalCurrentPage = Math.max(0, Math.min(n, TOTAL - 1));

    // Mostrar solo la página activa
    for (let i = 0; i < TOTAL; i++) {
      const page = document.getElementById("final-page-" + i);
      if (page) page.hidden = (i !== _finalCurrentPage);
    }

    // Actualizar dots
    document.querySelectorAll(".final-dot").forEach((dot, i) => {
      dot.classList.toggle("final-dot--active", i === _finalCurrentPage);
    });

    // Renderizar mapa al llegar a la página 2
    if (_finalCurrentPage === 2) renderFinalMap("final-map");

    // Alternar botones de navegación
    const isLast = _finalCurrentPage === TOTAL - 1;
    if (refs.finalNextBtn) refs.finalNextBtn.hidden = isLast;
    if (refs.playAgainBtn) refs.playAgainBtn.hidden = !isLast;
  }

  /** Crea una tarjeta-flip vacía (se rellena con fillFoodCard). Al hacer
   *  click se da vuelta y muestra el dato curioso en el dorso. */
  function buildFoodCardSkeleton() {
    const card = document.createElement("div");
    card.className = "food-card";

    const inner = document.createElement("div");
    inner.className = "food-card-inner";

    // Cara frontal: foto + nombre + país
    const front = document.createElement("div");
    front.className = "food-card-front";
    const img = document.createElement("img");
    img.loading = "lazy";
    const nameEl = document.createElement("div");
    nameEl.className = "food-card-name";
    const countryEl = document.createElement("div");
    countryEl.className = "food-card-country";
    front.appendChild(img);
    front.appendChild(nameEl);
    front.appendChild(countryEl);

    // Dorso: dato curioso
    const back = document.createElement("div");
    back.className = "food-card-back";
    const factEl = document.createElement("div");
    factEl.className = "food-card-fact";
    back.appendChild(factEl);

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    card.addEventListener("click", () => card.classList.toggle("flipped"));
    return card;
  }

  /** Rellena una tarjeta con los datos de una comida. */
  function fillFoodCard(card, food) {
    const meta      = COUNTRY_META[normalizeCountry(food.country)] || {};
    const isCorrect = state.correctFoodNames.has(getFoodId(food));
    card.dataset.foodId = getFoodId(food);
    card.classList.toggle("food-card--correct", isCorrect);
    card.classList.remove("flipped");

    const img = card.querySelector(".food-card-front img");
    img.src = food.image || "";
    img.alt = food.place_name;

    card.querySelector(".food-card-name").textContent = food.place_name;

    const countryEl = card.querySelector(".food-card-country");
    countryEl.textContent = (meta.flag ? meta.flag + " " : "") + (meta.name || food.country);
    parseEmoji(countryEl);

    card.querySelector(".food-card-fact").textContent = food.fun_fact || "";
  }

  function renderFoodsGrid() {
    const grid  = document.getElementById("final-foods-grid");
    const title = document.getElementById("final-foods-title");
    if (!grid) return;

    grid.innerHTML = "";
    const n = state.seenFoods.length;

    if (title) {
      title.textContent = n === 1
        ? "¡Hoy aprendiste sobre 1 lugar!"
        : "¡Hoy aprendiste sobre " + n + " lugares!";
    }

    // Mostramos TODAS las comidas vistas. En pantalla entran ~8 (4×2); el
    // resto se ve scrolleando horizontalmente (ver .foods-grid en styles.css).
    state.seenFoods.forEach((food) => {
      const card = buildFoodCardSkeleton();
      fillFoodCard(card, food);
      grid.appendChild(card);
    });
  }

  function renderFinalMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Recolectar ISOs únicos y markers de países pequeños
    const isoSet  = new Set();
    const markers = [];
    const seenSmall = new Set();

    state.seenFoods.forEach((food) => {
      const meta = COUNTRY_META[normalizeCountry(food.country)];
      if (!meta) return;
      isoSet.add(meta.iso);
      if (SMALL_COUNTRY_CODES.has(meta.iso) && Array.isArray(meta.coords) && !seenSmall.has(meta.iso)) {
        seenSmall.add(meta.iso);
        markers.push({ name: meta.name || food.country, coords: meta.coords });
      }
    });

    if (typeof window.jsVectorMap === "undefined") {
      container.textContent = "Mapa no disponible.";
      return;
    }

    if (_finalMapInstance && typeof _finalMapInstance.destroy === "function") {
      try { _finalMapInstance.destroy(); } catch (_) {}
      _finalMapInstance = null;
    }
    container.innerHTML = "";

    try {
      _finalMapInstance = new jsVectorMap({
        selector: "#" + containerId,
        map: "world_merc",
        backgroundColor: "#cfe9ff",
        zoomButtons: false,
        zoomOnScroll: false,
        zoomOnScrollSpeed: 0,
        draggable: false,
        showTooltip: true,
        onRegionTooltipShow: function(event, tooltip, code) {
          if (!isoSet.has(code)) { tooltip.hide(); return; }
          const meta = ISO_TO_META[code];
          if (meta && meta.name) tooltip.text(meta.name);
        },
        regionStyle: {
          initial:       { fill: "#ffffff", stroke: "#9fc4e3", strokeWidth: 0.6 },
          hover:         { fill: "#eaf3fb" },
          selected:      { fill: "#ff8c42" },
          selectedHover: { fill: "#ff8c42" },
        },
        regionsSelectable: false,
        selectedRegions: Array.from(isoSet),
        markers,
        markerStyle: {
          initial: { fill: "#ff5f79", stroke: "#ffffff", strokeWidth: 2, r: 4.5 },
          hover:   { fill: "#ff2f53" },
        },
      });
      if (typeof _finalMapInstance.updateSize === "function") {
        _finalMapInstance.updateSize();
      }
    } catch (_) {
      container.textContent = "No se pudo renderizar el mapa.";
    }
  }

  // ── Escritura creativa ────────────────────────────────────────────────────
  function saveWriteup() {
    const text = refs.finalText?.value?.trim() || "";
    if (!text) {
      refs.finalText?.classList.add("shake");
      setTimeout(() => refs.finalText?.classList.remove("shake"), 400);
      return;
    }

    const db = getDb();
    if (db && state.sessionId) {
      saveQuiet(db.from("ldm_final_writeups").insert([{
        session_id: state.sessionId,
        text:       text.slice(0, 2000),
        hits:       state.hits,
        rounds:     state.answered,
        out_of_lives: state.outOfLives,
      }]));
    }

    if (refs.finalText)      refs.finalText.hidden      = true;
    if (refs.saveWriteupBtn) refs.saveWriteupBtn.hidden  = true;
    if (refs.writeupStatus)  refs.writeupStatus.hidden   = false;
  }

  // ── Imagen de comida ──────────────────────────────────────────────────────
  function setFoodImage(imagePath, foodName) {
    const hasImagePath = typeof imagePath === "string" && imagePath.trim() !== "";
    refs.foodPlaceholderLetter.textContent = getFirstLetter(foodName);

    if (!hasImagePath) { showImagePlaceholder(); return; }

    refs.foodImage.hidden      = false;
    refs.foodPlaceholder.hidden = true;
    refs.foodImage.src  = imagePath;
    refs.foodImage.alt  = "Imagen de " + foodName;
  }

  function showImagePlaceholder() {
    refs.foodImage.hidden      = true;
    refs.foodPlaceholder.hidden = false;
  }

  function showLoadedImage() {
    refs.foodImage.hidden      = false;
    refs.foodPlaceholder.hidden = true;
  }

  // ── Utilidades ────────────────────────────────────────────────────────────
  function getFirstLetter(value) {
    if (typeof value !== "string" || value.trim() === "") return "?";
    return value.trim().charAt(0).toUpperCase();
  }

  function disableOptionButtons() {
    refs.optionsGrid.querySelectorAll("button").forEach((btn) => { btn.disabled = true; });
  }

  function updateLevelProgress() {
    const ratio = Math.max(0, Math.min(1, state.levelAnswered / ROUNDS_PER_LEVEL));
    refs.progressFill.style.width = String(ratio * 100) + "%";
  }

  function getRandomFact(food) { return food.fun_fact || ""; }
  function getFoodId(food)     { return String(food?.place_name || "").trim().toLowerCase(); }

  function normalizeCountry(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function resetToStart() {
    clearAutoAdvance();
    clearQuestionCountdown();
    showScreen("start");
  }

  function syncDifficultySelection() {
    refs.difficultyOptions.forEach((option) => {
      const input = option.querySelector("input");
      option.classList.toggle("selected", Boolean(input?.checked));
    });
  }

  function showScreen(targetKey) {
    Object.entries(refs.screens).forEach(([key, section]) => {
      section.classList.toggle("is-active", key === targetKey);
    });
  }

  function getTotalRoundsPlanned() {
    return (LEVEL_ORDER.length - state.startLevelIndex) * ROUNDS_PER_LEVEL;
  }

  function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }

  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Re-renderizar mapas al rotar el dispositivo
  let _resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (
        refs.screens.feedback.classList.contains("is-active") &&
        state.lastAnswer?.question?.correctCountry
      ) {
        renderCountryMap(state.lastAnswer.question.correctCountry);
      } else if (
        refs.screens.final.classList.contains("is-active") &&
        _finalCurrentPage === 2
      ) {
        renderFinalMap("final-map");
      }
    }, 300);
  });

  // Carrusel de pantalla de inicio (grilla de 3 lugares random).
  // Las imágenes se toman dinámicamente de PLACES_DATA, así no hay que
  // mantener una lista a mano cuando cambia el dataset.
  (function () {
    const CAROUSEL_IMAGES = (window.PLACES_DATA || [])
      .map((p) => p.image)
      .filter((src) => typeof src === "string" && src.trim() !== "");
    const slots = document.querySelectorAll(".start-carousel-slot");
    if (!slots.length) return;
    const N = slots.length;

    function pickRandom(exclude) {
      const pool = CAROUSEL_IMAGES.filter((x) => !exclude.includes(x));
      const result = [];
      const copy = [...pool];
      for (let i = 0; i < N && copy.length; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        result.push(copy.splice(idx, 1)[0]);
      }
      return result;
    }

    // Arrancar con selección random (no las mismas del HTML)
    let current = pickRandom([]);
    current.forEach((src, i) => slots[i].querySelector("img").src = src);

    setInterval(() => {
      slots.forEach((s) => s.classList.add("fading"));
      setTimeout(() => {
        current = pickRandom(current);
        current.forEach((src, i) => slots[i].querySelector("img").src = src);
        slots.forEach((s) => s.classList.remove("fading"));
      }, 650);
    }, 4000);
  })();

  init();
})();
