// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Editor } from './Editor.js';
import type { Field } from '../../shared/types.js';

it('renders a VideoField for a video-typed field', () => {
  const fields: Field[] = [
    { key: 'hero.video', type: 'video', label: 'Hero video', group: 'Hero', defaultContent: '' },
  ];
  render(
    <Editor
      group="Hero"
      fields={fields}
      content={{}}
      variants={[{ id: 'default', label: 'Default' }]}
      onChange={vi.fn()}
      onReset={vi.fn()}
      upload={vi.fn()}
    />,
  );
  expect(screen.getByText('Hero video')).toBeInTheDocument();
  expect(screen.getByText('Drop a video or click to upload')).toBeInTheDocument();
});
