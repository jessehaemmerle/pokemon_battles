import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: () => {},
    off: () => {},
    emit: () => {}
  })
}));

import App from '../App.jsx';

test('renders app without crashing', () => {
  render(<App />);
});
