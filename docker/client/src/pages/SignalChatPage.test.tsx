// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SignalChatPage } from "./SignalChatPage";

const { searchUtterancesMock, chatMock } = vi.hoisted(() => ({
  searchUtterancesMock: vi.fn(),
  chatMock: vi.fn()
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    searchUtterances: searchUtterancesMock,
    chat: chatMock
  };
});

describe("SignalChatPage", () => {
  afterEach(() => {
    searchUtterancesMock.mockReset();
    chatMock.mockReset();
    document.body.innerHTML = "";
  });

  it("renders search evidence and chat answer after submit", async () => {
    searchUtterancesMock.mockResolvedValueOnce({
      query: "risk",
      queryTokens: ["risk"],
      totalUtterances: 10,
      resultCount: 1,
      utterances: [
        {
          timestamp: "2026-04-07T00:00:00Z",
          day: "2026-04-07",
          channel: "FLIGHT",
          text: "Potential comms risk called out",
          filename: "2026-04-07.csv",
          source: "2026-04-07.csv",
          score: 0.91
        }
      ]
    });
    chatMock.mockResolvedValueOnce({
      answer: "Risk appears elevated around comm dropouts.",
      evidence: [],
      strategy: { mode: "rag", totalUtterances: 10, contextUtterances: 4, daysQueried: 2 }
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SignalChatPage />);
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(searchUtterancesMock).toHaveBeenCalledWith("Summarize communication risks in the latest transcript windows.", 10);
    expect(chatMock).toHaveBeenCalledWith("Summarize communication risks in the latest transcript windows.", "rag");
    expect(container.textContent).toContain("Risk appears elevated around comm dropouts.");
    expect(container.textContent).toContain("Potential comms risk called out");
  });

  it("shows error state when either request fails", async () => {
    searchUtterancesMock.mockRejectedValueOnce(new Error("offline"));
    chatMock.mockRejectedValueOnce(new Error("offline"));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SignalChatPage />);
    });

    const form = container.querySelector("form");

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("Unable to retrieve Signal Chat results right now.");
  });
});
