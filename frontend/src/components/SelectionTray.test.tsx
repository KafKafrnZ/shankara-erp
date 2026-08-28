import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SelectionTray } from './SelectionTray.tsx';
import { api } from '../lib/api.ts';

vi.mock('../lib/api.ts', () => ({
  api: vi.fn(),
  isApiError: () => false,
}));

beforeEach(() => {
  vi.mocked(api).mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('SelectionTray', () => {
  it('renders nothing when there is no selection', () => {
    const { container } = render(
      <SelectionTray items={[]} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a singular count for exactly one item', () => {
    render(
      <SelectionTray items={[{ code: 'A', name: 'Item A' }]} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(screen.getByText('1 item selected')).toBeInTheDocument();
  });

  it('shows a plural count for multiple items', () => {
    render(
      <SelectionTray
        items={[{ code: 'A', name: 'Item A' }, { code: 'B', name: 'Item B' }]}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('2 items selected')).toBeInTheDocument();
  });

  it('reveals the review list on "Show" and removes an item from it', () => {
    const onRemove = vi.fn();
    render(
      <SelectionTray
        items={[{ code: 'A', name: 'Item A' }, { code: 'B', name: 'Item B' }]}
        onRemove={onRemove}
        onClear={() => {}}
      />,
    );
    expect(screen.queryByText('Item A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('2 items selected'));
    expect(screen.getByText('Item A')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove Item A from selection'));
    expect(onRemove).toHaveBeenCalledWith('A');
  });

  it('calls onClear when Clear is clicked', () => {
    const onClear = vi.fn();
    render(
      <SelectionTray items={[{ code: 'A', name: 'Item A' }]} onRemove={() => {}} onClear={onClear} />,
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('copies the selection to the clipboard via the bulk API and shows "Copied"', async () => {
    vi.mocked(api).mockResolvedValue([{ itemCode: 'A', itemName: 'Item A' }]);
    render(
      <SelectionTray items={[{ code: 'A', name: 'Item A' }]} onRemove={() => {}} onClear={() => {}} />,
    );
    fireEvent.click(screen.getByText('Copy details'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith('/api/item-search/bulk', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ itemCodes: ['A'] }),
    }));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('shows an error message when the copy request fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('boom'));
    render(
      <SelectionTray items={[{ code: 'A', name: 'Item A' }]} onRemove={() => {}} onClear={() => {}} />,
    );
    fireEvent.click(screen.getByText('Copy details'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
