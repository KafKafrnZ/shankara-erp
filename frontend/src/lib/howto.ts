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
    id: 'new-item',
    theme: 'red',
    kicker: 'Catalog',
    title: '+ New item',
    body: [
      'Anyone can add items. Fill the fields or upload an Excel sheet, then press Add item.',
      'You then choose: a brand-new live sheet (give it a name) or add these rows into a sheet that is already live.',
    ],
  },
  {
    id: 'upload',
    theme: 'red',
    kicker: 'Catalog',
    title: 'Upload, then add',
    body: [
      'Upload does not change search by itself. After the file is read, click Add items and pick a new sheet or an existing live one.',
      'You can upload two or three files in a row. They wait until you add them.',
    ],
  },
  {
    id: 'edit',
    theme: 'ink',
    kicker: 'Office admin',
    title: 'Fix or remove one item',
    body: [
      'Open an item and use Edit to change it, or Delete to take it off search. History is kept either way.',
      'Only office admins can edit or delete an item that is already live.',
    ],
    stewardOnly: true,
  },
];
