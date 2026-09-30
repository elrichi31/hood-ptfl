import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest runs through Node's export conditions; NumberFlow must see the jsdom browser.
vi.mock("esm-env", () => ({ BROWSER: true, DEV: true, NODE: false }));

vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
})));
afterEach(cleanup);
