import { computePosition, offset, Rect } from "@floating-ui/dom";
import { diffWords } from "diff";

const buttonSize = 24;
const buttonPadding = 8;

const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`;

const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;

const powerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v4"/><path d="M7.998 9.003a5 5 0 1 0 8-.005"/><circle cx="12" cy="12" r="10"/></svg>`;

const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/></svg>`;

type Result<T> = { ok: true; value: T } | { ok: false; error: unknown };

const resultFromPromise = <T>(promise: Promise<T>): Promise<Result<T>> => {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
};

interface Provider {
  isSupported: () => Promise<boolean>;
  fixGrammar: (text: string) => Promise<string>;
}

class DuckDuckGoProvider implements Provider {
  #abortController = new AbortController();

  async isSupported() {
    return true;
  }

  async fixGrammar(text: string) {
    this.#abortController.abort();
    this.#abortController = new AbortController();

    const response = await fetch("https://duck.nguyenvu.dev/api/chat", {
      method: "POST",
      signal: this.#abortController.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Revise for grammar, punctuation and spelling only. No explanations. Only changed text. Do not change phrasing: ${text}`,
          },
        ],
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();

    const data = responseText
      .split("\n")
      .filter((line) => Boolean(line) && !line.includes("[DONE]"))
      .map((line) => JSON.parse(line.replace("data: ", "")));

    const message = data
      .filter((item) => item.message !== "")
      .map((item) => item.message)
      .join("");

    return message;
  }
}

const isTextArea = (
  node: Node | EventTarget,
): node is HTMLTextAreaElement | HTMLElement => {
  return (
    ((node instanceof HTMLElement && node.contentEditable === "true") ||
      node instanceof HTMLTextAreaElement) &&
    node.spellcheck
  );
};

const recursivelyFindAllTextAreas = (node: Node) => {
  const inputs: (HTMLTextAreaElement | HTMLElement)[] = [];
  if (isTextArea(node)) {
    inputs.push(node);
  } else {
    for (let child of node.childNodes) {
      inputs.push(...recursivelyFindAllTextAreas(child));
    }
  }
  return inputs;
};

const getButtonVerticalPadding = (rect: Rect) => {
  if (rect.height < buttonSize + buttonPadding * 2) {
    return Math.max(0, rect.height - buttonSize) / 2;
  }

  return buttonPadding;
};

type State =
  | { type: "loading" }
  | { type: "wrong"; diff: DocumentFragment }
  | { type: "correct" }
  | { type: "error" };

function createDiff(str1: string, str2: string) {
  const diff = diffWords(str1, str2);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].added && diff[i + 1] && diff[i + 1].removed) {
      const swap = diff[i];
      diff[i] = diff[i + 1];
      diff[i + 1] = swap;
    }

    let node: HTMLElement | Text;
    if (diff[i].removed) {
      node = document.createElement("del");
      node.style.background = "#ffe6e6";
      node.style.color = "#c00";
      node.style.marginRight = "4px";
      node.appendChild(document.createTextNode(diff[i].value));
    } else if (diff[i].added) {
      node = document.createElement("ins");
      node.style.background = "#e6ffe6";
      node.style.color = "#0c0";
      node.appendChild(document.createTextNode(diff[i].value));
    } else {
      node = document.createTextNode(diff[i].value);
    }
    fragment.appendChild(node);
  }
  return fragment;
}

class Tooltip {
  #tooltip: HTMLDivElement;
  #button: HTMLButtonElement;
  #text: HTMLParagraphElement;
  #hint: HTMLParagraphElement;
  #result: string = "";

  constructor(zIndex: number, button: HTMLButtonElement) {
    this.#button = button;
    this.#tooltip = document.createElement("div");
    this.#text = document.createElement("p");
    this.#hint = document.createElement("p");

    Object.assign(this.#tooltip.style, {
      display: "none",
      flexDirection: "column",
      gap: "4px",
      position: "absolute",
      background: "#fff",
      borderRadius: "4px",
      padding: "8px",
      whiteSpace: "pre-wrap",
      width: "max-content",
      maxWidth: "300px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "system-ui, Arial, sans-serif",
      boxShadow: "0 0 4px rgba(0, 0, 0, 0.2)",
      zIndex: `${zIndex}`,
      userSelect: "text",
    });

    Object.assign(this.#text.style, {
      color: "#000",
      fontSize: "max(16px,1rem)",
      margin: "0",
      cursor: "pointer",
    });

    Object.assign(this.#hint.style, {
      display: "none",
      fontSize: "max(12px,0.75rem)",
      color: "#666",
      margin: "0",
    });

    this.#text.addEventListener("click", this.#handleTextClick);

    this.#tooltip.appendChild(this.#hint);
    this.#tooltip.appendChild(this.#text);
    document.body.appendChild(this.#tooltip);
  }

  #handleTextClick = async (e: MouseEvent) => {
    if (window.getSelection()?.toString()) {
      return;
    }

    try {
      if (!this.#result) {
        return;
      }

      await navigator.clipboard.writeText(this.#result);

      const originalHint = this.#hint.textContent;
      const originalDisplay = this.#hint.style.display;

      this.hint = "Correction copied to clipboard!";

      setTimeout(() => {
        this.hint = originalHint;
        this.#hint.style.display = originalDisplay;
      }, 1500);
    } catch (err) {
      console.warn("Failed to copy text:", err);
    }
  };

  show() {
    this.#tooltip.style.display = "flex";
    this.updatePosition();
  }

  hide() {
    this.#tooltip.style.display = "none";
  }

  updatePosition() {
    computePosition(this.#button, this.#tooltip, {
      placement: "bottom",
      middleware: [offset({ mainAxis: 2 })],
    }).then(({ x, y }) => {
      Object.assign(this.#tooltip.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  }

  set content(content: string | DocumentFragment) {
    this.#text.textContent = "";
    if (content instanceof DocumentFragment) {
      this.#text.appendChild(content);
    } else {
      this.#text.textContent = content;
    }
    this.updatePosition();
  }

  set hint(text: string | null) {
    if (text) {
      this.#hint.textContent = text;
      this.#hint.style.display = "block";
    } else {
      this.#hint.textContent = "";
      this.#hint.style.display = "none";
    }
    this.updatePosition();
  }

  set result(text: string) {
    this.#result = text;
  }

  contains(element: EventTarget | null): boolean {
    return element instanceof Node && this.#tooltip.contains(element);
  }

  destroy() {
    this.#text.removeEventListener("click", this.#handleTextClick);
    this.#tooltip.remove();
  }
}

class Control {
  #button: HTMLButtonElement;
  #tooltip: Tooltip;
  #isFocused: boolean = false;
  #isTooltipVisible: boolean = false;
  #text: string = "";
  #result: string = "";
  #provider: Provider | null;
  #updateInterval: ReturnType<typeof setInterval> | null = null;
  #resetIconTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public textArea: HTMLTextAreaElement | HTMLElement,
    provider: Provider | null,
  ) {
    this.#provider = provider;
    this.#button = document.createElement("button");
    this.#button.innerHTML = infoIcon;
    Object.assign(this.#button.style, {
      position: "absolute",
      zIndex: `${99999999999}`,
      padding: "0",
      border: "0",
      background: "transparent",
      cursor: "pointer",
      outline: "none",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(this.#button);
    this.#tooltip = new Tooltip(99999999999, this.#button);

    this.updatePosition();

    this.textArea.addEventListener("focus", this.#handleTextAreaFocus);
    this.textArea.addEventListener("blur", this.#handleTextAreaBlur);
    this.#button.addEventListener("click", this.#handleClick);
    document.addEventListener("click", this.#handleClickOutside);

    this.#updateInterval = setInterval(() => {
      control?.updatePosition();
    }, 60);

    this.#isFocused = document.activeElement === this.textArea;
    this.#updateButtonVisibility();
  }

  #handleTextAreaFocus = () => {
    this.#isFocused = true;
    this.#updateButtonVisibility();
  };

  #handleTextAreaBlur = (e: Event) => {
    if (!(e instanceof FocusEvent)) {
      return;
    }

    if (
      e.relatedTarget === this.#button ||
      this.#tooltip.contains(e.relatedTarget)
    ) {
      return;
    }
    this.#isFocused = false;
    this.#updateButtonVisibility();
  };

  #handleClick = async () => {
    if (this.#isTooltipVisible) {
      if (this.#result) {
        if (this.textArea instanceof HTMLTextAreaElement) {
          this.textArea.value = this.#result;
          this.#setState({ type: "correct" });
        }
      }
      return;
    }

    await this.update();
  };

  #handleClickOutside = (event: MouseEvent) => {
    if (
      !this.#button.contains(event.target as Node) &&
      !this.#tooltip.contains(event.target as Node) &&
      event.target !== this.textArea
    ) {
      this.#hideTooltip();
    }
  };

  #showTooltip() {
    this.#isTooltipVisible = true;
    this.#tooltip.show();
  }

  #hideTooltip() {
    this.#isTooltipVisible = false;
    this.#tooltip.hide();
  }

  #updateButtonVisibility() {
    const shouldShow = this.#isFocused;
    this.#button.style.opacity = shouldShow ? "1" : "0";
    this.#button.style.pointerEvents = shouldShow ? "auto" : "none";
  }

  #setState(state: State) {
    if (this.#resetIconTimeout) {
      clearTimeout(this.#resetIconTimeout);
      this.#resetIconTimeout = null;
    }

    switch (state.type) {
      case "loading":
        this.#button.innerHTML = loadingIcon;
        this.#button.style.cursor = "wait";
        this.#hideTooltip();
        return;
      case "wrong":
        this.#button.innerHTML = infoIcon;
        this.#button.style.cursor = "pointer";
        this.#tooltip.content = state.diff;
        this.#tooltip.result = this.#result;
        this.#tooltip.hint = "Click to copy correction";
        this.#showTooltip();
        return;
      case "correct":
        this.#button.innerHTML = checkIcon;
        this.#button.style.cursor = "pointer";
        this.#hideTooltip();
        this.#resetIconTimeout = setTimeout(() => {
          this.#button.innerHTML = infoIcon;
          this.#button.style.cursor = "pointer";
        }, 1500);
        return;
      case "error":
        this.#button.innerHTML = powerIcon;
        this.#button.style.cursor = "pointer";
        this.#tooltip.content = "Failed to check grammar";
        this.#tooltip.hint = "Click to try again";
        this.#showTooltip();

        this.#resetIconTimeout = setTimeout(() => {
          this.#button.innerHTML = infoIcon;
          this.#button.style.cursor = "pointer";
          this.#hideTooltip();
        }, 1500);
        return;
    }
  }

  public async update() {
    const text =
      this.textArea instanceof HTMLTextAreaElement
        ? this.textArea.value
        : this.textArea.innerText;

    this.#text = text;
    this.updatePosition();

    if (!this.#provider) {
      this.#setState({ type: "error" });
      return;
    }

    if (text.trim().split(/\s+/).length < 2) {
      return;
    }

    this.#setState({ type: "loading" });

    const result = await resultFromPromise(this.#provider.fixGrammar(text));

    if (!result.ok) {
      console.warn(result.error);
      this.#setState({ type: "error" });
      return;
    }

    this.#result = result.value;

    if (this.#text === this.#result) {
      this.#setState({ type: "correct" });
      return;
    }

    this.#setState({
      type: "wrong",
      diff: createDiff(text, result.value),
    });
  }

  public updatePosition() {
    computePosition(this.textArea, this.#button, {
      placement: "bottom-end",
      middleware: [
        offset((state) => ({
          mainAxis:
            -getButtonVerticalPadding(state.rects.reference) - buttonSize,
          crossAxis: -buttonPadding,
        })),
      ],
    }).then(({ x, y }) => {
      Object.assign(this.#button.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  }

  destroy() {
    if (this.#resetIconTimeout) {
      clearTimeout(this.#resetIconTimeout);
    }
    this.textArea.removeEventListener("focus", this.#handleTextAreaFocus);
    this.textArea.removeEventListener("blur", this.#handleTextAreaBlur);
    this.#button.removeEventListener("click", this.#handleClick);
    document.removeEventListener("click", this.#handleClickOutside);
    this.#button.remove();
    this.#tooltip.destroy();
    if (this.#updateInterval) {
      clearInterval(this.#updateInterval);
    }
  }

  isSameElement(el: EventTarget | null) {
    return this.textArea === el || this.#button === el;
  }
}

let control: Control | null = null;

const inputListener = (provider: Provider | null) => async (e: Event) => {
  const target = e.target;

  if (!target || !isTextArea(target)) {
    return;
  }

  if (target === control?.textArea) {
    return;
  }

  control?.destroy();
  control = new Control(target, provider);
};

const focusListener = (provider: Provider | null) => async (e: Event) => {
  const target = e.target;

  if (control?.isSameElement(target)) {
    return;
  }

  if (!target || !isTextArea(target)) {
    return;
  }

  control?.destroy();

  control = new Control(target, provider);
};

const main = async () => {
  const providers = [new DuckDuckGoProvider()];

  let provider: Provider | null = null;

  for (let p of providers) {
    if (await p.isSupported()) {
      provider = p;
      break;
    }
  }

  const observer = new MutationObserver(() => {
    if (control?.textArea && !document.body.contains(control?.textArea)) {
      control?.destroy();
      control = null;
    }
  });
  observer.observe(document, { childList: true, subtree: true });

  document.addEventListener("input", inputListener(provider));
  document.addEventListener("focus", focusListener(provider), true);
};

main();
