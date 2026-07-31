// ---------------------------------------------------------------------------
// Motivation board data.
//
// NOTE ON IMAGES: this build environment has no live internet access, so
// these image URLs could not be fetched/verified from here. They point to
// Wikimedia Commons (public domain / openly-licensed rowing photography),
// which is safe to hotlink and attribute. Every card has a graceful
// fallback (club-colour card + quote) if a URL ever 404s, so the board
// never looks broken — and each card links through to the club's own site
// so you can always get straight to their latest photos.
//
// Swap `img` for any photo URL you like (e.g. from OUBC/ECBC's Instagram)
// and it'll pick it up immediately — nothing else needs to change.
// ---------------------------------------------------------------------------

const MOTIVATION_CARDS = [
  {
    club: 'Oxford University Boat Club',
    tag: 'OUBC · Oxford Blue',
    colour: '#002147',
    accent: '#a9d6e5',
    img: 'https://en.wikipedia.org/wiki/Special:FilePath/Oxford%20Eight%20winning%20Thames%20Regatta%20(1910).jpg',
    quote: '“Beat Cambridge.” — the entire constitutional purpose of this club since 1829.',
    link: 'https://oubc.org/',
    linkLabel: 'oubc.org',
  },
  {
    club: 'Oxford University Boat Club',
    tag: 'OUBC · The Boat Race',
    colour: '#002147',
    accent: '#a9d6e5',
    img: 'https://en.wikipedia.org/wiki/Special:FilePath/Oxford%20college%20rowing%20in%20the%20floods%20c1900.jpg',
    quote: 'Every 45\' UT2 piece you grind through is a deposit on a boat that moves in March.',
    link: 'https://www.instagram.com/oubc1829/',
    linkLabel: '@oubc1829',
  },
  {
    club: 'Exeter College Boat Club',
    tag: 'ECBC · Peony Red & Black · est. 1823',
    colour: '#1a1a1a',
    accent: '#c8102e',
    img: 'https://en.wikipedia.org/wiki/Special:FilePath/Exeter%20College%20Oxford%20Coat%20Of%20Arms.svg',
    quote: 'Thirteen of the first thirty Torpids. The oldest blades on the Isis don\'t rest on Wednesdays either — they just row easy and save it for Saturday.',
    link: 'https://ecbc.web.ox.ac.uk/',
    linkLabel: 'ecbc.web.ox.ac.uk',
  },
  {
    club: 'Exeter College Boat Club',
    tag: 'ECBC · Summer Eights',
    colour: '#1a1a1a',
    accent: '#c8102e',
    img: '',
    quote: 'Bump-proof your 2k the way ECBC bump-proofs the head of the river: base first, sharpen last.',
    link: 'https://ecbc.web.ox.ac.uk/traditions',
    linkLabel: 'Club traditions',
  },
];
