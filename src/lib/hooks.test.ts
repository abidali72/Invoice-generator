import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { apiFetch, useApi } from "./hooks.ts";

const originalFetch = globalThis.fetch;

describe("apiFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns data on 200 OK with valid ApiEnvelope", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined = undefined;

    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = url.toString();
      capturedOptions = options;
      return new Response(JSON.stringify({ ok: true, data: { id: 100, name: "Test Product" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await apiFetch<{ id: number; name: string }>("/api/products/100");
    assert.deepEqual(res, { id: 100, name: "Test Product" });
    assert.equal(capturedUrl, "/api/products/100");
    assert.deepEqual((capturedOptions?.headers as Record<string, string>)?.["Content-Type"], "application/json");
  });

  it("merges custom init options and headers correctly", async () => {
    let capturedOptions: RequestInit | undefined = undefined;

    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ ok: true, data: { success: true } }), { status: 200 });
    };

    await apiFetch("/api/settings", {
      method: "POST",
      headers: { "X-Custom-Header": "HeaderValue" },
      body: JSON.stringify({ key: "theme", value: "dark" }),
    });

    assert.equal(capturedOptions?.method, "POST");
    assert.equal(capturedOptions?.body, JSON.stringify({ key: "theme", value: "dark" }));
    const headers = capturedOptions?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Custom-Header"], "HeaderValue");
  });

  it("throws error message from JSON envelope on non-200 HTTP response", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false, error: "Validation failed: invalid amount" }), {
        status: 400,
      });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Validation failed: invalid amount",
      }
    );
  });

  it("throws status fallback error on non-200 HTTP response with missing error message in JSON", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Request failed (500)",
      }
    );
  });

  it("throws status fallback error on non-200 HTTP response with non-JSON/invalid JSON body", async () => {
    globalThis.fetch = async () => {
      return new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Request failed (502)",
      }
    );
  });

  it("throws error message from JSON envelope on 200 OK with ok: false", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false, error: "Business rule violation" }), { status: 200 });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Business rule violation",
      }
    );
  });

  it("throws status fallback error on 200 OK with ok: false and missing error message", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Request failed (200)",
      }
    );
  });

  it("throws status fallback error on 200 OK with non-JSON/invalid JSON body", async () => {
    globalThis.fetch = async () => {
      return new Response("Not valid JSON", { status: 200 });
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "Error",
        message: "Request failed (200)",
      }
    );
  });

  it("propagates network errors when fetch rejects", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await assert.rejects(
      async () => {
        await apiFetch("/api/invoices");
      },
      {
        name: "TypeError",
        message: "Failed to fetch",
      }
    );
  });
});

describe("useApi", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  class MockElement {
    nodeType = 1;
    nodeName = "DIV";
    tagName = "DIV";
    namespaceURI = "http://www.w3.org/1999/xhtml";
    children: any[] = [];
    childNodes: any[] = [];
    style = {};
    ownerDocument: any = null;
    appendChild(c: any) {
      this.children.push(c);
      return c;
    }
    removeChild() {}
    insertBefore() {}
    setAttribute() {}
    removeAttribute() {}
    addEventListener() {}
    removeEventListener() {}
  }

  function setupMockDOM() {
    const doc: any = {
      createElement: () => {
        const el = new MockElement();
        el.ownerDocument = doc;
        return el;
      },
      createElementNS: () => {
        const el = new MockElement();
        el.ownerDocument = doc;
        return el;
      },
      createTextNode: (t: string) => ({ nodeType: 3, nodeValue: t, ownerDocument: doc }),
      body: new MockElement(),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    doc.body.ownerDocument = doc;
    doc.defaultView = globalThis;

    (globalThis as any).document = doc;
    (globalThis as any).window = globalThis;
    (globalThis as any).HTMLIFrameElement = class {};
    (globalThis as any).HTMLElement = class {};
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    return doc;
  }

  it("returns idle initial state when path is null and does not invoke fetch", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ ok: true, data: null }), { status: 200 });
    };

    const doc = setupMockDOM();
    let latestState: any = null;

    function TestComp() {
      latestState = useApi<string>(null);
      return null;
    }

    const container = doc.createElement();
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComp));
    });

    assert.equal(fetchCalled, false);
    assert.deepEqual(latestState.data, null);
    assert.deepEqual(latestState.error, null);
    assert.equal(latestState.loading, false);
    assert.equal(typeof latestState.refetch, "function");
  });

  it("fetches data on mount and updates state to loaded on success", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: true, data: { id: 1, code: "INV-001" } }), { status: 200 });
    };

    const doc = setupMockDOM();
    const stateHistory: any[] = [];

    function TestComp() {
      const state = useApi<{ id: number; code: string }>("/api/invoices/1");
      stateHistory.push(state);
      return null;
    }

    const container = doc.createElement();
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComp));
    });

    const finalState = stateHistory[stateHistory.length - 1];
    assert.equal(finalState.loading, false);
    assert.equal(finalState.error, null);
    assert.deepEqual(finalState.data, { id: 1, code: "INV-001" });
  });

  it("sets error in state when apiFetch fails", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: false, error: "Database connection failed" }), { status: 500 });
    };

    const doc = setupMockDOM();
    const stateHistory: any[] = [];

    function TestComp() {
      const state = useApi<null>("/api/clients");
      stateHistory.push(state);
      return null;
    }

    const container = doc.createElement();
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComp));
    });

    const finalState = stateHistory[stateHistory.length - 1];
    assert.equal(finalState.loading, false);
    assert.equal(finalState.data, null);
    assert.equal(finalState.error, "Database connection failed");
  });

  it("re-fetches data and updates state when refetch is called", async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ ok: true, data: `Count: ${callCount}` }), { status: 200 });
    };

    const doc = setupMockDOM();
    let latestState: any = null;

    function TestComp() {
      latestState = useApi<string>("/api/counter");
      return null;
    }

    const container = doc.createElement();
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComp));
    });

    assert.equal(latestState.data, "Count: 1");

    await act(async () => {
      await latestState.refetch();
    });

    assert.equal(latestState.data, "Count: 2");
  });

  it("fetches new path when path prop changes", async () => {
    const fetchedPaths: string[] = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      const pathStr = url.toString();
      fetchedPaths.push(pathStr);
      return new Response(JSON.stringify({ ok: true, data: `Data for ${pathStr}` }), { status: 200 });
    };

    const doc = setupMockDOM();
    let latestState: any = null;

    function TestComp({ path }: { path: string }) {
      latestState = useApi<string>(path);
      return null;
    }

    const container = doc.createElement();
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComp, { path: "/api/items/1" }));
    });

    assert.equal(latestState.data, "Data for /api/items/1");

    await act(async () => {
      root.render(React.createElement(TestComp, { path: "/api/items/2" }));
    });

    assert.equal(latestState.data, "Data for /api/items/2");
    assert.deepEqual(fetchedPaths, ["/api/items/1", "/api/items/2"]);
  });
});
