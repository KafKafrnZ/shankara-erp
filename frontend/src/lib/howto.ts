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
    title: 'This desk finds bills and items.',
    body: [
      'It is a search desk, not a report screen. You type what you know — a bill number, a party, an item code — and open the match.',
      'The green “Search file” strip on each page names the Excel everyone is looking at right now.',
    ],
  },
  {
    id: 'bills',
    theme: 'red',
    kicker: 'Day book',
    title: 'Find a bill',
    body: [
      'Use Day book → Find bill. Type a bill number, a party name, or an amount.',
      'Click a row to read the full voucher. Print and copy live on that row. Unpublished files never appear here.',
    ],
  },
  {
    id: 'items',
    theme: 'ink',
    kicker: 'Items',
    title: 'Find an item',
    body: [
      'Use Items → Find item. Type a code, a name, or a catalogue number — or choose Browse all and filter by brand or group.',
      'The highlighted field on each row is that item’s key. Click the row for the full card.',
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
    id: 'live',
    theme: 'ink',
    kicker: 'Search file',
    title: 'Which file is live',
    body: [
      'The green strip lists the live Excel file or files. If several lists are live (tiles, main master, and so on), search uses all of them together.',
      'If you just uploaded and search looks the same, that file is not live yet. Make live when the numbers look right.',
    ],
  },
];
