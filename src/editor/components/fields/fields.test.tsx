// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextField } from './TextField.js';
import { ListField } from './ListField.js';
import { ImageField } from './ImageField.js';

it('TextField emits changes', () => {
  const onChange = vi.fn();
  render(<TextField value="hi" onChange={onChange} />);
  fireEvent.change(screen.getByDisplayValue('hi'), { target: { value: 'bye' } });
  expect(onChange).toHaveBeenCalledWith('bye');
});

it('ListField adds an item', () => {
  const onChange = vi.fn();
  render(
    <ListField
      items={[]}
      itemFields={[{ key: 'q', type: 'text', label: 'Q' }]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByText('+ Add item'));
  expect(onChange).toHaveBeenCalledWith([{ q: '' }]);
});

it('ListField deletes an item', () => {
  const onChange = vi.fn();
  render(
    <ListField
      items={[{ q: 'a' }, { q: 'b' }]}
      itemFields={[{ key: 'q', type: 'text', label: 'Q' }]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getAllByText('Delete')[0]);
  expect(onChange).toHaveBeenCalledWith([{ q: 'b' }]);
});

it('ImageField uploads a dropped file and emits the URL', async () => {
  const onChange = vi.fn();
  const upload = vi.fn().mockResolvedValue('/uploads/x.png');
  const { container } = render(<ImageField value="" onChange={onChange} upload={upload} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/x.png'));
});

it('ImageField shows an error when upload fails', async () => {
  const onChange = vi.fn();
  const upload = vi.fn().mockRejectedValue(new Error('nope'));
  const { container } = render(<ImageField value="" onChange={onChange} upload={upload} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
  await screen.findByText('Upload failed. Please try again.');
  expect(onChange).not.toHaveBeenCalled();
});
