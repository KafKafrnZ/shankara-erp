export const HOWTO_DISMISSED_KEY = 'sb.howtoDismissed';

export function readHowToDismissed(): boolean {
  try {
    return sessionStorage.getItem(HOWTO_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHowToDismissed() {
  try {
    sessionStorage.setItem(HOWTO_DISMISSED_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function clearHowToDismissed() {
  try {
    sessionStorage.removeItem(HOWTO_DISMISSED_KEY);
  } catch {
    /* private mode */
  }
}

export type HowToTheme = 'ink' | 'red';

export type HowToCard = {
  id: string;
  theme: HowToTheme;
  kicker: string;
  title: string;
  body: string[];
  stewardOnly?: boolean;
};

export const HOWTO_CARDS: HowToCard[] = [
  {
    id: 'welcome',
    theme: 'ink',
    kicker: 'Shankara ERP',
    title: 'This desk finds catalog items.',
    body: [
      'It is a search desk, not a report screen. You type what you know — an item code, a name, a catalogue number — and open the match.',
      'The next few cards walk through search, picking more than one, and copying what you find.',
    ],
  },
  {
    id: 'live',
    theme: 'ink',
    kicker: 'Search file',
    title: 'Which file is live',
    body: [
      'The green strip below Find an item names the Excel file (or files) everyone is searching right now, and how many items are in it.',
      'Tap Show details to see the file names and when each went live. If you just uploaded and the count looks the same, that file is not live yet.',
    ],
  },
  {
    id: 'items',
    theme: 'red',
    kicker: 'Catalog',
    title: 'Find an item',
    body: [
      'Type a code, a name, or a catalogue number — or choose Browse all and filter by main group, sub group, or brand.',
      'Need a column that is not one of those three? Use + Add filter to filter by anything the file has, like GST rate or HSN code.',
    ],
  },
  {
    id: 'select',
    theme: 'ink',
    kicker: 'Catalog',
    title: 'Pick more than one',
    body: [
      'Tick the box on the left of any row to collect it. Search again and tick more — your picks stay collected until you clear them.',
      'A bar appears at the bottom of the screen showing how many you have picked, with Copy details and Export to Excel for the whole set at once.',
    ],
  },
  {
    id: 'copy',
    theme: 'red',
    kicker: 'Item card',
    title: 'Copy or export what you find',
    body: [
      'Open any item and use Copy details or Export to Excel — both paste straight into an Excel sheet as real columns, no cleanup needed.',
      'The same two buttons on the bottom bar do it for a whole picked set at once, not just one item.',
    ],
  },
  {
    id: 'upload',
    theme: 'red',
    kicker: 'Office admin',
    title: 'Upload, then Make live',
    body: [
      'Upload does not change search. After the file is read, click Make live — that is when everyone else can see it.',
      'You can upload two or three files in a row. They wait. Search still uses the old live file until you make a new one live.',
    ],
    stewardOnly: true,
  },
  {
    id: 'edit',
    theme: 'ink',
    kicker: 'Office admin',
    title: 'Add, fix, or remove one item',
    body: [
      'Do not need a whole new file for one change? Use + New item, or open an item and use Edit — no upload needed.',
      'Delete removes an item from search right away but keeps its history — you can always add it back later.',
    ],
    stewardOnly: true,
  },
];
