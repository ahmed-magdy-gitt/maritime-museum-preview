/* =====================================================================
   MARITIME MUSEUM 360 - SCENE CONFIG  (the ONE file to edit for revisions)
   ---------------------------------------------------------------------
   UNITS & AXES
     * Everything is in METRES. Origin = centre of the dome floor.
     * x = east (right on the plan), z = SOUTH (down on the plan), y = up.
     * Angles are DEGREES in plan: 0 = east, 90 = south, -90 = north (up on plan).
       "facing" / "heading" use the same convention.
     * Positions taken from plan.jpg are written with P(px, py) = plan-pixel
       coordinates converted to metres (see PLAN below). Re-scale the whole
       layout by changing PLAN.pxPerM (dimensions in metres do NOT rescale).
   ===================================================================== */
(function () {
  const PLAN = { originPx: [380, 175], pxPerM: 15 };          // dome centre in plan.jpg, plan scale (15 px = 1 m)
  const P = (px, py) => [(px - PLAN.originPx[0]) / PLAN.pxPerM, (py - PLAN.originPx[1]) / PLAN.pxPerM];
  const polar = (cx, cz, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cz + r * Math.sin(deg * Math.PI / 180)];
  const dome = [0, 0], DR = 8.5;                               // dome centre & inner radius
  const hallArcC = P(470, 375), hallArcR = 95 / PLAN.pxPerM;   // big quarter-circle wall of the hall
  const ring = (ang, h, w, y, content, extra) => Object.assign({ pos: polar(0, 0, 9.04, ang), facing: ang, y, w, h, content, zone: 'hall' }, extra || {});
  const arcw = (ang, h, w, y, content, extra) => Object.assign({ pos: polar(hallArcC[0], hallArcC[1], hallArcR - 0.1, ang), facing: ang + 180, y, w, h, content, zone: 'hall' }, extra || {});

  window.CONFIG = {
    PLAN, P, polar,

    /* ---------------- VIDEO / RENDER ---------------- */
    video: {
      fps: 30, duration: 90,            // seconds (spec: 60-75)
      width: 2048, height: 1024,        // equirectangular output size
      cubeSize: 1024,                   // cube-face resolution used for the conversion (higher = sharper/slower)
      bitrateMbps: 16,                  // VP9 bitrate of the full-quality render
      shareMbps: 3.2,                   // bitrate of the lighter shareable render (made in the same pass)
      fadeIn: 1.2, fadeOut: 3.5,        // seconds of fade from/to black
      exposure: 1.1,
      outName: 'museum_360_preview',    // written to out/<name>.webm
    },

    /* ---------------- ARCHITECTURE ---------------- */
    arch: {
      hallCeiling: 6.0,                 // hall ceiling height
      domeInnerR: DR, ringThickness: 0.5,
      domeWallH: 3.2,                   // vertical wall height before the cap starts
      domeApex: 9.0,                    // interior height at the centre of the dome
      wallThickness: 0.25,
      // openings in the dome ring. angle in plan degrees, w = width (m), h = height (m)
      domeOpenings: [
        { name: 'south', angle: 93, w: 3.4, h: 3.0, type: 'open' },                // main entrance from the hall
        { name: 'northeast', angle: -50, w: 2.4, h: 2.6, type: 'blackdoor' },      // black rectangle, top-right
        { name: 'east', angle: 20.6, w: 2.4, h: 2.6, type: 'whitedoor' },          // white double door -> plaza
      ],
      // Hall outline (plan polygon, clockwise from the top-left). The top edge is the dome's outer wall.
      hallPoly: [P(218, 205), P(218, 325), P(172, 325), P(172, 412), P(110, 412), P(110, 522), P(565, 522), P(565, 375)],
      hallDoor: { pos: P(211, 522), w: 2.2, h: 2.6 },    // entrance double door, bottom-left
      // DOUBLE-HEIGHT VOID around the dhow (two-storey space). The 6 m ceiling slab is cut away over x0..east wall, z0..south wall; the
      // upper floor (gallery, slab top = hallCeiling+0.3) wraps the void on the north and west sides, stairs along the east wall lead up to it.
      void: { x0: -9.5, z0: 13.6, h: 12.0, northBack: 10.4, westBack: -11.7, eastBack: 11.5,
        screens: [   // display screens on the upper-floor walls (zone hall)
          { pos: [-4.8, 10.4], facing: 90, y: 9.3, w: 3.4, h: 1.9, content: 'chart', glow: [0.4, 0.8, 1.0], zone: 'hall' },
          { pos: [4.6, 10.4], facing: 90, y: 9.3, w: 3.4, h: 1.9, content: 'waves', glow: [0.4, 0.7, 1.0], zone: 'hall' },
          { pos: [-11.7, 18.0], facing: 0, y: 9.0, w: 3.0, h: 1.7, content: 'sunrise', glow: [1.0, 0.7, 0.4], zone: 'hall' },
        ] },
    },

    /* ---------------- COLOURS (RGB 0-1 or hex strings) ---------------- */
    colors: {
      hallFloor: '#8d9096', hallWall: '#c4c7cd', ceiling: '#a9adb6', domeFloor: '#3b3d42', ringBlack: '#101114',
      domeWall: '#17181c', sand: '#e0c797', deckWood: '#a8743f', boatWood: '#8a5328', boatWoodDark: '#4d2c14',
      boatBand: '#16536b', platform: '#d8c7a4', canoeWood: '#a8683a', niche: '#ece4d4', chair: '#2f78c4', tableOrange: '#e98a2a',
      leaf: '#2f7d3a', leaf2: '#4d9a3c', pot: '#8a5a44', sofaBlue: '#2d63a8', cove: [0.35, 0.65, 1.0], warm: [1.0, 0.72, 0.42],
      shellA: '#f1e1c9', shellB: '#e8a98c', shellC: '#d6b38a', screenFrame: '#0b0c0e',
    },

    /* ---------------- DOME SEATING ---------------- */
    seating: {
      // Concentric tier rows facing the centre. r = chair radius, n = chair count, band = [r0, r1] of the tier platform, h = platform height
      rows: [
        { r: 3.3, n: 9,  band: [2.75, 3.85], h: 0.14 },
        { r: 4.4, n: 12, band: [3.85, 4.95], h: 0.28 },
        { r: 5.5, n: 14, band: [4.95, 6.05], h: 0.42 },
        { r: 6.6, n: 15, band: [6.05, 7.45], h: 0.56 },
      ],
      aisleClear: 1.9,                  // metres of free floor each side of an opening
      // small round orange side tables (polar: radius, angle) in the dome
      tables: [[3.9, 40], [3.9, 150], [3.9, 255], [5.0, 205], [5.0, 335], [6.1, 95 + 40], [6.1, 10]],
    },

    /* ---------------- HALL EXHIBITS ---------------- */
    exhibits: {
      dhow: { pos: P(383, 433), heading: 0, platform: [10.6, 2.7], platformH: 0.25, hullLength: 10.2, beam: 2.1,
        mastH: 10.0,                    // mast top = mastH above the platform floor (~10 m: rises through both floors)
        // lateen sail in dhow-local coords: x along the hull (bow = +x), y = absolute height, billow = lee bulge in metres
        sail: { mastX: -0.6, yardZ: 0.22, peak: [-3.3, 9.5], tack: [4.5, 3.3], clew: [-4.8, 2.9], billow: 1.0, color: '#e9d9b8' } },
      infoStand: { pos: P(408, 409), w: 1.3 },
      grate: { pos: P(396, 481), size: [8.2, 1.5] },            // striped rectangle (stairs/grate)
      skylight: { pos: P(283, 503), size: 1.6 },                // square with an X
      plinth: { pos: P(290, 343), size: 1.4, h: 1.05 },
      canoe: { pos: P(211, 372), heading: 90, length: 5.2, beam: 0.95, nicheSize: [1.9, 5.9] },
      medallion: { pos: P(158, 468), platform: [3.0, 5.4], radius: 1.15, medallionPos: P(160, 455), tilt: 0 },
      waveBench: { from: P(398, 341), to: P(466, 350), amp: 0.45, width: 0.55 },
      pods: [ { pos: P(453, 305), size: [2.6, 1.3] }, { pos: P(505, 330), size: [2.6, 1.3] } ],
      // glass-top display tables with seashells
      displayTables: [
        { pos: P(205, 447), heading: 90, size: [1.9, 0.9], shells: 7, light: true },
        { pos: P(250, 462), heading: 0,  size: [1.9, 0.9], shells: 6, light: true },
        { pos: P(330, 372), heading: 0,  size: [1.9, 0.9], shells: 6, light: true },
      ],
      // potted plants: kind 'palm' (trunk + fronds) or 'bush'
      plants: [
        { pos: P(237, 308), kind: 'palm', s: 1.1 }, { pos: P(275, 275), kind: 'bush', s: 1.0 }, { pos: P(268, 268), kind: 'palm', s: 0.9 },
        { pos: P(475, 345), kind: 'palm', s: 1.0 },
        { pos: P(297, 415), kind: 'bush', s: 1.0 }, { pos: P(318, 410), kind: 'bush', s: 0.9 },
        { pos: P(447, 410), kind: 'bush', s: 0.9 }, { pos: P(470, 412), kind: 'palm', s: 1.0 },
        { pos: P(305, 515), kind: 'bush', s: 0.8 }, { pos: P(340, 513), kind: 'bush', s: 0.8 },
        { pos: P(512, 513), kind: 'bush', s: 0.8 }, 
        { pos: P(176, 430), kind: 'bush', s: 0.8 }, { pos: P(158, 498), kind: 'palm', s: 0.9 },
        
      ],
      shellsOnMedallion: 9,
    },

    /* ---------------- OUTSIDE (visible through the east door) ---------------- */
    outside: {
      sofa: { pos: P(548, 152), radius: 1.9, from: 150, to: 330 },
      firepit: { pos: P(556, 170) },
      deck: { x0: 6.8, x1: 22, z0: -15, z1: -4.2 },
      deckTables: [P(545, 42), P(556, 12)], deckPlants: [P(500, 40), P(520, 28), P(498, 62)],
      sunDir: [0.55, 0.42, -0.35], sunColor: [1.0, 0.86, 0.66], skyTop: [0.28, 0.5, 0.86], skyHorizon: [0.86, 0.82, 0.74],
      sea: [0.1, 0.42, 0.55],
    },

    /* ---------------- LIGHTING ----------------
       zone: 'hall' | 'dome' | 'out' | 'all'. type 'spot' needs target + cone (deg, full outer angle).
       Intensities are artistic; tune by eye in viewer.html. */
    ambient: { hall: [0.14, 0.16, 0.22], dome: [0.17, 0.22, 0.34], out: [0.50, 0.58, 0.72] },
    lights: [
      // warm spots on the big dhow hull + sail, hung from the 12 m ceiling of the void (ceil = fixture height)
      { type: 'spot', zone: 'hall', ceil: 12, pos: [-3.6, 11.5, 14.6], target: [-3.4, 1.1, 17.1], color: [1.0, 0.7, 0.38], intensity: 12, range: 18, cone: 36 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [-0.4, 11.5, 14.6], target: [-0.2, 1.1, 17.1], color: [1.0, 0.7, 0.38], intensity: 12, range: 18, cone: 36 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [3.0, 11.5, 14.6],  target: [3.2, 1.1, 17.1],  color: [1.0, 0.7, 0.38], intensity: 12, range: 18, cone: 36 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [0.2, 11.5, 20.6],  target: [0.2, 1.1, 17.3],  color: [1.0, 0.75, 0.45], intensity: 9, range: 18, cone: 44 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [-3.0, 11.5, 13.9], target: [-1.2, 6.4, 17.5], color: [1.0, 0.8, 0.52], intensity: 24, range: 20, cone: 34 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [2.6, 11.5, 13.9],  target: [1.6, 6.0, 17.5],  color: [1.0, 0.8, 0.52], intensity: 24, range: 20, cone: 34 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [-3.0, 11.5, 21.2], target: [-1.2, 6.4, 17.5], color: [1.0, 0.78, 0.5], intensity: 24, range: 20, cone: 34 },
      { type: 'spot', zone: 'hall', ceil: 12, pos: [2.6, 11.5, 21.2],  target: [1.6, 6.0, 17.5],  color: [1.0, 0.78, 0.5], intensity: 24, range: 20, cone: 34 },
      // upper-gallery wash
      { type: 'point', zone: 'hall', pos: [0, 10.8, 12.0], color: [1.0, 0.82, 0.6], intensity: 8, range: 12 },
      { type: 'point', zone: 'hall', pos: [-9.5, 9.0, 18.0], color: [1.0, 0.82, 0.6], intensity: 6, range: 11 },
      // canoe niche, medallion platform, plinth, plain fill
      { type: 'spot', zone: 'hall', pos: [-9.2, 5.7, 13.0], target: [-11.3, 0.4, 13.0], color: [1.0, 0.72, 0.42], intensity: 6.0, range: 10, cone: 50 },
      { type: 'spot', zone: 'hall', pos: [-12.2, 5.7, 19.4], target: [-14.8, 0.2, 19.6], color: [1.0, 0.78, 0.5], intensity: 6.0, range: 10, cone: 50 },
      { type: 'spot', zone: 'hall', pos: [-6.0, 5.7, 11.6], target: [-6.0, 1.0, 11.2], color: [0.9, 0.95, 1.0], intensity: 4.0, range: 9, cone: 50 },
      // cool general hall light + curved wall wash
      { type: 'point', zone: 'hall', pos: [-8, 5.2, 7], color: [0.6, 0.78, 1.0], intensity: 3.0, range: 16 },
      { type: 'point', zone: 'hall', pos: [4, 5.2, 9], color: [0.6, 0.78, 1.0], intensity: 3.0, range: 16 },
      { type: 'point', zone: 'hall', pos: [-9, 5.2, 18], color: [0.7, 0.8, 1.0], intensity: 2.5, range: 16 },
      { type: 'point', zone: 'hall', pos: [8, 5.2, 19], color: [0.7, 0.8, 1.0], intensity: 3.0, range: 16 },
      { type: 'point', zone: 'hall', pos: [-2, 5.2, 21], color: [0.7, 0.8, 1.0], intensity: 3.0, range: 16 },
      // dome interior: tinted by the ceiling projection + cove ring
      { type: 'point', zone: 'dome', pos: [0, 7.5, 0], color: [0.35, 0.65, 1.0], intensity: 9, range: 20, pulse: true },
      { type: 'point', zone: 'dome', pos: [0, 2.0, 0], color: [0.3, 0.55, 1.0], intensity: 3.5, range: 14 },
      { type: 'point', zone: 'dome', pos: [-5, 1.0, -4], color: [0.3, 0.6, 1.0], intensity: 3.2, range: 11 },
      { type: 'point', zone: 'dome', pos: [5, 1.0, 4], color: [0.3, 0.6, 1.0], intensity: 3.2, range: 11 },
      // outside
      { type: 'point', zone: 'out', pos: [P(556, 170)[0], 0.8, P(556, 170)[1]], color: [1.0, 0.55, 0.2], intensity: 2.2, range: 7 },
    ],
    screenLightIntensity: 1.1,           // each screen also lights its surroundings with its glow colour

    /* ---------------- SCREEN CONTENT ----------------
       Each content entry is drawn every frame (Canvas2D, 640x360) from CONTENT.types in content.js.
       To swap: change `type`, tweak `p`, or supply your own `draw: (ctx, w, h, t, p) => {...}`.
       Built-in types: waves, chart, ships, compass, ripple, stars, medallion, sunrise. */
    contents: [
      { id: 'waves',  type: 'waves',  p: { hue: 200 } },
      { id: 'chart',  type: 'chart',  p: { hue: 190 } },
      { id: 'ships',  type: 'ships',  p: { hue: 25 } },
      { id: 'compass', type: 'compass', p: { hue: 205 } },
      { id: 'ripple', type: 'ripple', p: { hue: 175 } },
      { id: 'stars',  type: 'stars',  p: { hue: 230 } },
      { id: 'sunrise', type: 'sunrise', p: { hue: 30 } },
      { id: 'chart2', type: 'chart',  p: { hue: 160, seed: 7 } },
      { id: 'medallion', type: 'medallion', p: {}, static: true },
    ],
    dome: { type: 'ocean', p: {} },              // content of the 360 dome ceiling (type 'ocean' in content.js)

    /* ---------------- SCREENS ----------------
       pos [x,z], facing (deg), y = centre height, w/h in m. 'ring(...)' = on the dome's outer wall (hall side),
       'arcw(...)' = on the hall's curved wall. glow = halo/light colour. free:true = freestanding two-sided slab. */
    screens: [
      { pos: P(220, 240), facing: 0, y: 2.0, w: 3.0, h: 1.7, content: 'chart', glow: [0.4, 0.8, 1.0] },
      { pos: P(220, 291), facing: 0, y: 2.0, w: 2.2, h: 1.7, content: 'ships', glow: [1.0, 0.65, 0.35] },
      { pos: P(174, 372), facing: 0, y: 1.9, w: 2.6, h: 1.5, content: 'chart2', glow: [0.4, 0.9, 0.9] },
      { pos: P(112, 466), facing: 0, y: 1.9, w: 3.0, h: 1.7, content: 'sunrise', glow: [1.0, 0.7, 0.4] },
      { pos: P(300, 521), facing: -90, y: 2.0, w: 2.4, h: 1.5, content: 'ripple', glow: [0.4, 0.9, 0.85], zone: 'hall' },
      { pos: P(430, 521), facing: -90, y: 2.0, w: 3.6, h: 1.8, content: 'waves', glow: [0.4, 0.7, 1.0] },
      { pos: P(490, 521), facing: -90, y: 2.0, w: 2.4, h: 1.8, content: 'compass', glow: [0.4, 0.75, 1.0] },
      ring(142, 1.7, 3.0, 2.0, 'chart', { glow: [0.4, 0.8, 1.0] }),
      ring(122, 1.7, 2.4, 2.0, 'ships', { glow: [1.0, 0.65, 0.35] }),
      ring(66, 1.7, 3.0, 2.0, 'waves', { glow: [0.4, 0.7, 1.0] }),
      arcw(-78, 1.7, 2.8, 2.0, 'stars', { glow: [0.5, 0.6, 1.0] }),
      arcw(-60, 1.7, 2.8, 2.0, 'chart2', { glow: [0.4, 0.9, 0.9] }),
      arcw(-34, 1.7, 2.8, 2.0, 'sunrise', { glow: [1.0, 0.7, 0.4] }),
      arcw(-12, 1.7, 2.8, 2.0, 'ripple', { glow: [0.4, 0.9, 0.85] }),
      // freestanding totems (two-sided)
      { pos: P(340, 398), facing: 90, y: 1.35, w: 1.0, h: 1.8, content: 'compass', glow: [0.4, 0.75, 1.0], free: true },
      { pos: P(528, 402), facing: 160, y: 1.35, w: 1.0, h: 1.8, content: 'ships', glow: [1.0, 0.65, 0.35], free: true },
      { pos: P(252, 408), facing: 0, y: 1.35, w: 1.0, h: 1.8, content: 'waves', glow: [0.4, 0.7, 1.0], free: true },
    ],

    /* ---------------- CAMERA PATH ----------------
       Keyframes are blended with a smooth C1 (Hermite) spline: no jerks. First/last ease in/out.
       t = seconds, pos = [x,z], rise = height above eye level (m, unused = 0), heading = deg or {look:[x,z]}, pitch = deg up.
       heading omitted -> the camera looks along its direction of travel (smoothed). */
    camera: {
      eyeHeight: 1.6,                   // constant eye height (VR comfort): no vertical camera motion
      // Times come from tools/camgen.js (walking speed ~1.05 m/s, cap 1.3 m/s; `node tools/camgen.js check` prints the real max speed).
      // stop:true = zero velocity at that key (ease in/out); two stop keys at the same spot = a pause. First/last key ease in/out too.
      keys: [
        { t: 0.0, pos: [-11.27, 26.3], heading: -90, pitch: 0 },   // start
        { t: 3.8, pos: [-11.27, 23.15], heading: -90, pitch: 0 },   // door
        { t: 6.2, pos: [-10.4, 21], heading: -40, pitch: 0 },   // in
        { t: 9.8, pos: [-6.9, 20.4], heading: { look: [0.2,17.45] }, pitch: 6 },   // SW
        { t: 12.5, pos: [-6.9, 17.8], heading: { look: [0.2,17.45] }, pitch: 8 },   // W1
        { t: 14.8, pos: [-6.7, 15.4], heading: { look: [0.2,17.45] }, pitch: 9 },   // W2
        { t: 16.8, pos: [-4.9, 14.3], heading: { look: [0.2,17.45] }, pitch: 10 },   // NW
        { t: 20.0, pos: [-1.6, 14.3], heading: { look: [0.2,17.45] }, pitch: 12 },   // N1
        { t: 23.6, pos: [2.2, 14.3], heading: { look: [0.2,17.45] }, pitch: 12 },   // N2
        { t: 26.3, pos: [5, 14.5], heading: { look: [0.2,17.45] }, pitch: 12 },   // N3
        { t: 28.7, pos: [7.2, 15.9], heading: { look: [0.2,17.45] }, pitch: 12 },   // NE
        { t: 30.8, pos: [7.9, 17.9], heading: { look: [0.2,17.45] }, pitch: 12 },   // E1
        { t: 32.9, pos: [7, 20], heading: { look: [0.2,17.45] }, pitch: 12 },   // SE
        { t: 35.9, pos: [4, 20.95], heading: { look: [0.2,17.45] }, pitch: 14 },   // S1
        { t: 39.5, pos: [1, 20.95], heading: -90, pitch: 22, stop: true },   // S2
        { t: 44.5, pos: [1, 20.95], heading: -90, pitch: 26, stop: true },   // S2b
        { t: 48.5, pos: [-2.4, 20.95], heading: { look: [0.2,17.45] }, pitch: 14 },   // S3
        { t: 52.0, pos: [-6, 20.7], heading: 180, pitch: 6 },   // SWb
        { t: 56.3, pos: [-10.3, 19.3], heading: { look: [-14.7,19.6] }, pitch: 4 },   // M1
        { t: 57.4, pos: [-10.3, 18.7], heading: { look: [-14.7,19.6] }, pitch: 4, stop: true },   // M2
        { t: 59.4, pos: [-10.3, 18.7], heading: { look: [-15.5,21] }, pitch: 4, stop: true },   // M2b
        { t: 63.1, pos: [-8, 17.4], heading: -100, pitch: 0 },   // T1
        { t: 65.2, pos: [-7.5, 15.3], heading: { look: [-11.3,13.1] }, pitch: 0 },   // T2
        { t: 67.4, pos: [-8.2, 13.6], heading: { look: [-11.3,13.1] }, pitch: 0, stop: true },   // C1
        { t: 69.9, pos: [-8.2, 13.6], heading: { look: [-11.6,12.4] }, pitch: 0, stop: true },   // C1b
        { t: 73.0, pos: [-6, 14.3], heading: -20, pitch: 0 },   // X1
        { t: 75.7, pos: [-3.2, 14.4], heading: -10, pitch: 0 },   // X2
        { t: 78.4, pos: [-0.8, 12.9], heading: -40, pitch: 0 },   // X3
        { t: 80.6, pos: [-0.45, 10.6], heading: -90, pitch: 0 },   // X4
        { t: 82.5, pos: [-0.45, 8.6], heading: -90, pitch: 0 },   // D0
        { t: 84.2, pos: [-0.4, 6.8], heading: -90, pitch: 0 },   // D1
        { t: 86.8, pos: [-0.3, 4.1], heading: -88, pitch: 4 },   // D2
        { t: 88.9, pos: [-0.1, 1.9], heading: -80, pitch: 12 },   // D3
        { t: 90.9, pos: [0, 0.2], heading: -70, pitch: 24 },   // D4
      ],
    },
  };
})();
