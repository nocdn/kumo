import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { useEffect } from "react";
import { Toasty, createKumoToastManager, useKumoToastManager } from "./toast";

describe("Toasty", () => {
  // Regression guard: existing callers that don't pass `toastManager`
  // must continue to work via the in-tree `useKumoToastManager` hook.
  it("renders without a toastManager prop and accepts in-tree dispatch", async () => {
    function TriggerOnMount() {
      const toasts = useKumoToastManager();
      useEffect(() => {
        toasts.add({ title: "from inside" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <Toasty>
        <TriggerOnMount />
      </Toasty>,
    );

    expect(await screen.findByText("from inside")).toBeTruthy();
  });

  // Headline feature: an external manager passed via the prop allows
  // dispatch from outside the React tree.
  it("dispatches toasts via an external manager passed as a prop", async () => {
    const mgr = createKumoToastManager();

    render(
      <Toasty toastManager={mgr}>
        <div />
      </Toasty>,
    );

    act(() => {
      mgr.add({ title: "from outside" });
    });

    expect(await screen.findByText("from outside")).toBeTruthy();
  });

  it("updates toasts from their current state", async () => {
    const mgr = createKumoToastManager();

    render(
      <Toasty toastManager={mgr}>
        <div />
      </Toasty>,
    );

    act(() => {
      const id = mgr.add({ title: "Saving" });
      mgr.update(id, (toast) => {
        expect(toast.title).toBe("Saving");
        return { title: "Saving complete" };
      });
    });

    const title = await screen.findByText("Saving complete");
    const bumpLayer = title
      .closest('[role="dialog"]')
      ?.querySelector('[data-kumo-part="bump-layer"]');

    expect(bumpLayer?.classList.contains("animate-toast-bump")).toBe(false);
    expect(bumpLayer?.classList.contains("animate-toast-bump-alternate")).toBe(
      false,
    );
  });

  it("does not bump when a promise toast settles", async () => {
    const mgr = createKumoToastManager();
    let resolvePromise!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    render(
      <Toasty toastManager={mgr}>
        <div />
      </Toasty>,
    );

    let handledPromise!: Promise<string>;
    act(() => {
      handledPromise = mgr.promise(promise, {
        loading: { title: "Saving", timeout: 0 },
        success: { title: "Saving complete", timeout: 0 },
        error: { title: "Saving failed", timeout: 0 },
      });
    });
    await screen.findByText("Saving");

    await act(async () => {
      resolvePromise("saved");
      await handledPromise;
    });

    const title = await screen.findByText("Saving complete");
    const bumpLayer = title
      .closest('[role="dialog"]')
      ?.querySelector('[data-kumo-part="bump-layer"]');

    expect(bumpLayer?.classList.contains("animate-toast-bump")).toBe(false);
    expect(bumpLayer?.classList.contains("animate-toast-bump-alternate")).toBe(
      false,
    );
  });

  it("honors an explicit bump on an initial toast", async () => {
    const mgr = createKumoToastManager();

    render(
      <Toasty toastManager={mgr}>
        <div />
      </Toasty>,
    );

    act(() => {
      mgr.add({ title: "Bump immediately", bump: true, timeout: 0 });
    });

    const title = await screen.findByText("Bump immediately");
    const bumpLayer = title
      .closest('[role="dialog"]')
      ?.querySelector('[data-kumo-part="bump-layer"]');

    expect(bumpLayer?.classList.contains("animate-toast-bump-alternate")).toBe(
      true,
    );
  });

  it("bumps one toast for duplicate ids dispatched through an external manager", async () => {
    const mgr = createKumoToastManager();

    render(
      <Toasty toastManager={mgr}>
        <div />
      </Toasty>,
    );

    act(() => {
      mgr.add({ id: "dupe", title: "first", timeout: 0 });
    });

    const firstTitle = await screen.findByText("first");
    const firstRoot = firstTitle.closest('[role="dialog"]');

    act(() => {
      mgr.add({ id: "dupe", title: "second", timeout: 0 });
    });

    const secondTitle = await screen.findByText("second");
    const secondRoot = secondTitle.closest('[role="dialog"]');
    const bumpLayer = secondRoot?.querySelector(
      '[data-kumo-part="bump-layer"]',
    );

    expect(firstRoot?.isConnected).toBe(true);
    expect(secondRoot).toBe(firstRoot);
    const titles = document.querySelectorAll("[data-toast-title]");
    expect(titles).toHaveLength(1);
    expect(secondRoot?.classList.contains("animate-toast-bump")).toBe(false);
    expect(bumpLayer?.classList.contains("animate-toast-bump")).toBe(true);
  });

  it("restarts a rapid duplicate-id bump without replacing its transitioning root", async () => {
    function DuplicateToastTrigger() {
      const toasts = useKumoToastManager();
      return (
        <button
          onClick={() =>
            toasts.add({
              id: "rapid-dupe",
              title: "Repeated toast",
              timeout: 0,
            })
          }
        >
          Show repeated toast
        </button>
      );
    }

    render(
      <Toasty>
        <DuplicateToastTrigger />
      </Toasty>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show repeated toast" }),
    );
    const title = await screen.findByText("Repeated toast");
    const root = title.closest('[role="dialog"]');
    expect(root).toBeTruthy();
    expect(root?.classList.contains("kumo-toast-root")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Show repeated toast" }),
    );
    expect(screen.getAllByText("Repeated toast")).toHaveLength(1);
    const liveTitle = screen.getByText("Repeated toast");
    const liveRoot = liveTitle.closest('[role="dialog"]');
    const bumpLayer = liveRoot?.querySelector('[data-kumo-part="bump-layer"]');

    expect(root?.isConnected).toBe(true);
    expect(liveRoot).toBe(root);
    expect(root?.classList.contains("animate-toast-bump")).toBe(false);
    expect(bumpLayer?.classList.contains("animate-toast-bump")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Show repeated toast" }),
    );
    expect(
      liveRoot
        ?.querySelector('[data-kumo-part="bump-layer"]')
        ?.classList.contains("animate-toast-bump-alternate"),
    ).toBe(true);
  });

  // `useKumoToastManager()` inside a tree wrapped with an external manager
  // must return that same manager — so in-tree and out-of-tree dispatch
  // converge on a single instance.
  it("exposes the same manager instance to useKumoToastManager inside the tree", async () => {
    const mgr = createKumoToastManager();
    let inTreeAdd: ((opts: { title: string }) => string) | undefined;

    function CaptureManager() {
      const toasts = useKumoToastManager();
      inTreeAdd = toasts.add;
      return null;
    }

    render(
      <Toasty toastManager={mgr}>
        <CaptureManager />
      </Toasty>,
    );

    // External dispatch.
    act(() => {
      mgr.add({ title: "external" });
    });
    expect(await screen.findByText("external")).toBeTruthy();

    // In-tree dispatch via the hook.
    act(() => {
      inTreeAdd?.({ title: "in-tree" });
    });
    expect(await screen.findByText("in-tree")).toBeTruthy();
  });
});
