// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextField } from './TextField.js';
import { ListField } from './ListField.js';
import { ImageField } from './ImageField.js';
import { VideoField } from './VideoField.js';

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
  fireEvent.click(screen.getByText('Add item'));
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

it('VideoField uploads a dropped file and emits the URL', async () => {
  const onChange = vi.fn();
  const upload = vi.fn().mockResolvedValue('/uploads/site/hero.mp4');
  const { container } = render(<VideoField value="" onChange={onChange} upload={upload} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'hero.mp4', { type: 'video/mp4' })] },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/site/hero.mp4'));
});

it('VideoField accepts a pasted URL in URL mode', () => {
  const onChange = vi.fn();
  render(<VideoField value="" onChange={onChange} upload={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'URL' }));
  fireEvent.change(screen.getByPlaceholderText(/Paste a video URL/), {
    target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
  });
  expect(onChange).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ');
});

it('VideoField labels an embed value in its preview', () => {
  render(<VideoField value="https://youtu.be/dQw4w9WgXcQ" onChange={vi.fn()} upload={vi.fn()} />);
  expect(screen.getByText(/YouTube embed/)).toBeInTheDocument();
});
