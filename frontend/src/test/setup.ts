import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest doesn't auto-unmount between tests the way Jest's default DOM
// environment does — without this, each render() in a suite pollutes the
// next test's DOM, and a query like getByText can start matching more
// than one element for reasons that have nothing to do with the test
// actually being written.
afterEach(cleanup);
