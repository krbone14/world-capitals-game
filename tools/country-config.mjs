// Authoritative game roster: which countries exist, which map they live on, and
// which region card they belong to. Everything else (names, capitals, geometry)
// is derived from Natural Earth by build-data.mjs / build-geo.mjs, with the
// OVERRIDES below applied on top.
//
// tier 1 = playable by default. tier 2 = micro-state: present in the data (flag,
// capital, fact, a dot on the map) but kept out of the default rounds because it
// is too small to aim at. Flipping a country between tiers is a one-character
// edit here; the engine reads nothing but `tier`.

// Land area under this many km² makes a state tier 2. Raise it to shorten the
// game, lower it to include more micro-states. African micro-states are exempt
// (see AFRICA_EXEMPT) so this game stays consistent with africa-capitals-game.
export const MICRO_KM2 = 1000;

// The 5 African micro-states already playable in africa-capitals-game. They are
// handled by the island-dot mechanism and stay tier 1 here.
export const AFRICA_EXEMPT = ['CPV', 'COM', 'MUS', 'STP', 'SYC'];

// Land area in km², only for states near the MICRO_KM2 threshold — this is what
// decides tier, so the values that matter are the small ones.
export const AREA_KM2 = {
  VAT: 0.44, MCO: 2, NRU: 21, TUV: 26, SMR: 61, LIE: 160, MHL: 181,
  KNA: 261, MDV: 300, MLT: 316, GRD: 344, VCT: 389, BRB: 430, ATG: 442,
  PLW: 459, AND: 468, SYC: 452, LCA: 617, FSM: 702, SGP: 734, TON: 747,
  DMA: 751, BHR: 778, KIR: 811, STP: 964,
  // just above the line, listed so the threshold is auto-documented
  COM: 1861, MUS: 2040, WSM: 2831, LUX: 2586, CPV: 4033,
};

// continentId -> ordered region list. `geo` names the file in assets/geo/.
// Colours follow the palette of the original game (a saturated bg + a darker
// shadow used for the card's 3D lip).
export const CONTINENTS = [
  {
    id: 'afrique', geo: 'africa', fr: 'Afrique', en: 'Africa',
    bg: '#DD7A57', shadow: '#B25636', emoji: '🌍',
    regions: [
      { id: 'af-nord',   fr: 'Afrique du Nord',     en: 'North Africa',    bg: '#E2A24B', shadow: '#B97E2C' },
      { id: 'af-ouest',  fr: "Afrique de l'Ouest",  en: 'West Africa',     bg: '#DD7A57', shadow: '#B25636' },
      { id: 'af-centre', fr: 'Afrique Centrale',    en: 'Central Africa',  bg: '#3F9E78', shadow: '#2C7A5A' },
      { id: 'af-est',    fr: "Afrique de l'Est",    en: 'East Africa',     bg: '#5B86C4', shadow: '#3E63A0' },
      { id: 'af-sud',    fr: 'Afrique Australe',    en: 'Southern Africa', bg: '#B06A9A', shadow: '#8A4C78' },
    ],
  },
  {
    id: 'europe', geo: 'europe', fr: 'Europe', en: 'Europe',
    bg: '#5B86C4', shadow: '#3E63A0', emoji: '🇪🇺',
    regions: [
      { id: 'eu-ouest',   fr: "Europe de l'Ouest", en: 'Western Europe',  bg: '#5B86C4', shadow: '#3E63A0' },
      { id: 'eu-nord',    fr: 'Europe du Nord',    en: 'Northern Europe', bg: '#4FA3B8', shadow: '#357F92' },
      { id: 'eu-sud',     fr: 'Europe du Sud',     en: 'Southern Europe', bg: '#E2A24B', shadow: '#B97E2C' },
      { id: 'eu-centre',  fr: 'Europe Centrale',   en: 'Central Europe',  bg: '#3F9E78', shadow: '#2C7A5A' },
      { id: 'eu-balkans', fr: 'Balkans',           en: 'The Balkans',     bg: '#DD7A57', shadow: '#B25636' },
      { id: 'eu-est',     fr: "Europe de l'Est",   en: 'Eastern Europe',  bg: '#B06A9A', shadow: '#8A4C78' },
    ],
  },
  {
    id: 'asie', geo: 'asia', fr: 'Asie', en: 'Asia',
    bg: '#C4553F', shadow: '#9B3C29', emoji: '🏯',
    regions: [
      { id: 'as-moyen-orient', fr: 'Moyen-Orient',       en: 'Middle East',        bg: '#E2A24B', shadow: '#B97E2C' },
      { id: 'as-centrale',     fr: 'Asie Centrale',      en: 'Central Asia',       bg: '#B08A4B', shadow: '#8A6A32' },
      { id: 'as-sud',          fr: 'Asie du Sud',        en: 'South Asia',         bg: '#DD7A57', shadow: '#B25636' },
      { id: 'as-est',          fr: "Asie de l'Est",      en: 'East Asia',          bg: '#C4553F', shadow: '#9B3C29' },
      { id: 'as-sudest',       fr: 'Asie du Sud-Est',    en: 'Southeast Asia',     bg: '#3F9E78', shadow: '#2C7A5A' },
    ],
  },
  {
    id: 'amerique-nord', geo: 'north-america', fr: 'Amérique du Nord', en: 'North America',
    bg: '#4FA3B8', shadow: '#357F92', emoji: '🗽',
    regions: [
      { id: 'na-nord',     fr: 'Amérique du Nord', en: 'Northern America', bg: '#4FA3B8', shadow: '#357F92' },
      { id: 'na-centre',   fr: 'Amérique Centrale', en: 'Central America', bg: '#3F9E78', shadow: '#2C7A5A' },
      { id: 'na-caraibes', fr: 'Caraïbes',          en: 'The Caribbean',   bg: '#E2A24B', shadow: '#B97E2C' },
    ],
  },
  {
    id: 'amerique-sud', geo: 'south-america', fr: 'Amérique du Sud', en: 'South America',
    bg: '#3F9E78', shadow: '#2C7A5A', emoji: '🦜',
    regions: [
      { id: 'sa-andes',    fr: 'Andes & Nord',  en: 'Andes & the North', bg: '#DD7A57', shadow: '#B25636' },
      { id: 'sa-cone-sud', fr: 'Cône Sud',      en: 'Southern Cone',     bg: '#3F9E78', shadow: '#2C7A5A' },
    ],
  },
  {
    id: 'oceanie', geo: 'oceania', fr: 'Océanie', en: 'Oceania',
    bg: '#B06A9A', shadow: '#8A4C78', emoji: '🏝️',
    regions: [
      { id: 'oc-australasie', fr: 'Australasie',          en: 'Australasia',      bg: '#B06A9A', shadow: '#8A4C78' },
      { id: 'oc-pacifique',   fr: 'Pacifique insulaire',  en: 'Pacific Islands',  bg: '#4FA3B8', shadow: '#357F92' },
    ],
  },
];

// The world map is a 7th "continent" whose regions are the six continents, so
// the region-card screen is reused as-is for the ultimate challenge.
export const WORLD = {
  id: 'monde', geo: 'world', fr: 'Le Monde', en: 'The World',
  bg: '#7A5CB0', shadow: '#5B3F8A', emoji: '🌐',
};

// region id -> ISO 3166-1 alpha-3 codes. This is the single place the roster is
// defined; countries.js is generated from it.
export const REGION_MEMBERS = {
  // ---- Africa (54) — identical partition to africa-capitals-game ----
  'af-nord':   ['DZA', 'EGY', 'LBY', 'MAR', 'TUN', 'SDN'],
  'af-ouest':  ['BEN', 'BFA', 'CPV', 'CIV', 'GMB', 'GHA', 'GIN', 'GNB', 'LBR', 'MLI', 'MRT', 'NER', 'NGA', 'SEN', 'SLE', 'TGO'],
  'af-centre': ['AGO', 'CMR', 'CAF', 'TCD', 'COG', 'COD', 'GNQ', 'GAB', 'STP'],
  'af-est':    ['BDI', 'COM', 'DJI', 'ERI', 'ETH', 'KEN', 'MDG', 'MWI', 'MUS', 'RWA', 'SYC', 'SOM', 'SSD', 'TZA', 'UGA'],
  'af-sud':    ['BWA', 'SWZ', 'LSO', 'MOZ', 'NAM', 'ZAF', 'ZMB', 'ZWE'],

  // ---- Europe (45) ----
  'eu-ouest':   ['FRA', 'DEU', 'BEL', 'NLD', 'LUX', 'CHE', 'AUT', 'MCO', 'LIE'],
  'eu-nord':    ['GBR', 'IRL', 'ISL', 'NOR', 'SWE', 'DNK', 'FIN', 'EST', 'LVA', 'LTU'],
  'eu-sud':     ['ESP', 'PRT', 'ITA', 'GRC', 'MLT', 'AND', 'SMR', 'VAT', 'CYP'],
  'eu-centre':  ['POL', 'CZE', 'SVK', 'HUN', 'SVN', 'HRV'],
  'eu-balkans': ['ROU', 'BGR', 'SRB', 'BIH', 'MNE', 'MKD', 'ALB'],
  'eu-est':     ['RUS', 'UKR', 'BLR', 'MDA'],

  // ---- Asia (47) ----
  'as-moyen-orient': ['TUR', 'SYR', 'LBN', 'ISR', 'PSE', 'JOR', 'IRQ', 'SAU', 'YEM', 'OMN', 'ARE', 'QAT', 'BHR', 'KWT'],
  'as-centrale':     ['KAZ', 'UZB', 'TKM', 'TJK', 'KGZ', 'AFG', 'AZE', 'ARM', 'GEO', 'IRN'],
  'as-sud':          ['IND', 'PAK', 'BGD', 'NPL', 'BTN', 'LKA', 'MDV'],
  'as-est':          ['CHN', 'MNG', 'JPN', 'KOR', 'PRK'],
  'as-sudest':       ['THA', 'VNM', 'LAO', 'KHM', 'MMR', 'MYS', 'SGP', 'IDN', 'PHL', 'BRN', 'TLS'],

  // ---- North America (23) ----
  'na-nord':     ['CAN', 'USA', 'MEX'],
  'na-centre':   ['GTM', 'BLZ', 'SLV', 'HND', 'NIC', 'CRI', 'PAN'],
  'na-caraibes': ['CUB', 'HTI', 'DOM', 'JAM', 'BHS', 'TTO', 'BRB', 'LCA', 'GRD', 'VCT', 'ATG', 'DMA', 'KNA'],

  // ---- South America (12) ----
  'sa-andes':    ['COL', 'VEN', 'ECU', 'PER', 'BOL', 'GUY', 'SUR'],
  'sa-cone-sud': ['BRA', 'ARG', 'CHL', 'PRY', 'URY'],

  // ---- Oceania (14) ----
  'oc-australasie': ['AUS', 'NZL', 'PNG'],
  'oc-pacifique':   ['FJI', 'SLB', 'VUT', 'WSM', 'TON', 'KIR', 'FSM', 'MHL', 'NRU', 'PLW', 'TUV'],
};

// Country names have to fit a tray chip, so keep both cf and ce at or under
// this many characters. build-data.mjs fails the build past it.
export const MAX_NAME_LEN = 24;

// Corrections on top of Natural Earth. NE's 50m release predates a few renames
// and uses long-form or awkward names for others; `cap` also fills the two
// capitals NE has no populated-place record for.
//   cf/ce  = country name FR / EN      capFr/capEn = capital FR / EN
//   lon/lat = capital coordinates, when NE has none or puts it in the wrong place
export const OVERRIDES = {
  // -- renames NE has not picked up --
  KAZ: { capFr: 'Astana', capEn: 'Astana' },              // Nur-Sultan reverted to Astana in 2022
  MMR: { capFr: 'Naypyidaw', capEn: 'Naypyidaw' },
  SWZ: { cf: 'Eswatini', ce: 'Eswatini' },
  MKD: { cf: 'Macédoine du Nord', ce: 'North Macedonia' },
  TUR: { cf: 'Turquie', ce: 'Türkiye' },

  // -- capitals where NE's 50m release is out of date; africa-capitals-game has
  //    these right, and the two games must not contradict each other --
  CIV: { cf: "Côte d'Ivoire", ce: "Côte d'Ivoire", capFr: 'Yamoussoukro', capEn: 'Yamoussoukro' },
  BDI: { capFr: 'Gitega', capEn: 'Gitega' },      // political capital since 2019
  ZAF: { capFr: 'Pretoria', capEn: 'Pretoria' },  // three capitals; the game asks for the executive one
  TCD: { capFr: "N'Djamena", capEn: "N'Djamena" },
  PLW: { capFr: 'Ngerulmud', capEn: 'Ngerulmud' }, // NE names the state, not the seat

  // -- long-form names shortened to what a player would type --
  CHN: { cf: 'Chine', ce: 'China' },
  PRK: { cf: 'Corée du Nord', ce: 'North Korea' },
  KOR: { cf: 'Corée du Sud', ce: 'South Korea' },
  USA: { cf: 'États-Unis', ce: 'United States' },
  GBR: { cf: 'Royaume-Uni', ce: 'United Kingdom' },
  ARE: { cf: 'Émirats arabes unis', ce: 'United Arab Emirates' },
  COD: { cf: 'RD Congo', ce: 'DR Congo' },
  COG: { cf: 'Congo', ce: 'Congo' },
  CAF: { cf: 'Centrafrique', ce: 'Central African Rep.' },
  LBR: { cf: 'Libéria', ce: 'Liberia' },
  NGA: { cf: 'Nigéria', ce: 'Nigeria' },
  KNA: { cf: 'St-Christophe-et-Niévès', ce: 'St Kitts and Nevis' },
  VCT: { cf: 'St-Vincent-et-Grenadines', ce: 'St Vincent & Grenadines' },
  ATG: { cf: 'Antigua-et-Barbuda', ce: 'Antigua and Barbuda' },
  BIH: { cf: 'Bosnie-Herzégovine', ce: 'Bosnia & Herzegovina' },
  PNG: { cf: 'Papouasie-N.-Guinée', ce: 'Papua New Guinea' },
  DOM: { cf: 'Rép. dominicaine', ce: 'Dominican Republic' },
  STP: { cf: 'Sao Tomé-et-Principe', ce: 'São Tomé & Príncipe' },
  LKA: { cf: 'Sri Lanka', ce: 'Sri Lanka', capFr: 'Sri Jayawardenapura', capEn: 'Sri Jayawardenepura' },
  TLS: { cf: 'Timor oriental', ce: 'Timor-Leste' },
  FSM: { cf: 'Micronésie', ce: 'Micronesia' },
  VAT: { cf: 'Vatican', ce: 'Vatican City' },
  GMB: { cf: 'Gambie', ce: 'The Gambia' },
  BHS: { cf: 'Bahamas', ce: 'The Bahamas' },
  CZE: { cf: 'Tchéquie', ce: 'Czechia' },
  NLD: { cf: 'Pays-Bas', ce: 'Netherlands' },
  LAO: { cf: 'Laos', ce: 'Laos' },

  // -- capitals NE is missing entirely --
  SSD: { capFr: 'Djouba', capEn: 'Juba', lon: 31.582, lat: 4.859 },
  NRU: { capFr: 'Yaren', capEn: 'Yaren', lon: 166.920867, lat: -0.547306 },
  // NE has no populated place for Palestine. Ramallah is the seat of government;
  // East Jerusalem is the claimed capital. The game asks for the seat.
  PSE: { capFr: 'Ramallah', capEn: 'Ramallah', lon: 35.206, lat: 31.902 },

  // -- capitals where the seat of government is not the largest city --
  BOL: { capFr: 'Sucre', capEn: 'Sucre' },                // constitutional capital
  TZA: { capFr: 'Dodoma', capEn: 'Dodoma' },
  CMR: { capFr: 'Yaoundé', capEn: 'Yaoundé' },
  BEN: { capFr: 'Porto-Novo', capEn: 'Porto-Novo' },

  // -- French capital names NE renders in the local language --
  MDA: { capFr: 'Chisinau', capEn: 'Chișinău' },
  BLR: { capFr: 'Minsk', capEn: 'Minsk' },
};

// Countries whose fact list should have 2-3 anecdotes rather than 1: the ones a
// player is most likely to already know something about, so replays stay fresh.
export const MAJOR = [
  'FRA', 'DEU', 'GBR', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'CHE', 'AUT', 'GRC', 'POL', 'SWE', 'NOR', 'IRL', 'ISL', 'RUS', 'UKR',
  'CHN', 'JPN', 'IND', 'KOR', 'THA', 'VNM', 'IDN', 'TUR', 'ISR', 'SAU', 'IRN', 'PAK', 'NPL',
  'USA', 'CAN', 'MEX', 'CUB', 'BRA', 'ARG', 'CHL', 'PER', 'COL',
  'AUS', 'NZL',
  'EGY', 'ZAF', 'MAR', 'NGA', 'KEN', 'ETH', 'TZA', 'DZA', 'SEN', 'MDG',
];
