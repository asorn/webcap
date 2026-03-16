"use strict";

(() => {
  if (window.__HTML_TO_FIGMA_CONTENT_READY__) {
    return;
  }
  window.__HTML_TO_FIGMA_CONTENT_READY__ = true;

  const MESSAGE_TOGGLE = "HTML_TO_FIGMA_TOGGLE";
  const MESSAGE_SET_ENABLED = "HTML_TO_FIGMA_SET_ENABLED";
  const MESSAGE_GET_TAB_STATE = "HTML_TO_FIGMA_GET_TAB_STATE";
  const MESSAGE_DOWNLOAD = "HTML_TO_FIGMA_DOWNLOAD";
  const MESSAGE_CAPTURE_VISIBLE = "HTML_TO_FIGMA_CAPTURE_VISIBLE";
  const STORAGE_KEY_CAPTURE_MODE = "h2f:capture-mode";
  const STORAGE_KEY_FRAME = "h2f:frame-enabled";
  const STORAGE_KEY_BORDER_ENABLED = "h2f:border-enabled";
  const STORAGE_KEY_BORDER_WIDTH = "h2f:border-width";
  const STORAGE_KEY_BORDER_COLOR = "h2f:border-color";
  const ROOT_ID = "__html_to_figma_overlay_root__";
  const ACTION_BAR_ROOT_ID = "__html_to_figma_action_bar__";
  const DISALLOWED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "META",
    "LINK",
    "NOSCRIPT",
    "TITLE",
    "BR",
  ]);
  const DOUBLE_META_TAP_MS = 360;
  const DOUBLE_ESC_TAP_MS = 360;
  const TOP_TOAST_ENABLED = false;

  class HtmlToFigmaInspector {
    constructor() {
      this.enabled = false;
      this.shiftDown = false;
      this.copyInFlight = false;
      this.renderScheduled = false;
      this.inspectPaused = false;
      this.lastMetaTapAt = 0;
      this.lastEscTapAt = 0;
      this.hoverElement = null;
      this.flexElement = null;
      this.selectedElements = new Set();
      this.selectionBoxes = new Map();
      this.statusMessage = "Idle";
      this.statusTimeout = null;
      this.toastTimeout = null;
      this.actionBarResetTimer = null;
      this.pointerX = 0;
      this.pointerY = 0;
      this.actionBar = null;
      this.captureMode = "copy";
      this.frameEnabled = false;
      this.borderEnabled = false;
      this.borderWidth = 1;
      this.borderColor = "#ff0000";

      this.overlayRoot = null;
      this.overlayShadow = null;
      this.hoverBox = null;
      this.flexBox = null;
      this.selectedLayer = null;
      this.cursorBadge = null;
      this.toastEl = null;
      this.toastTextEl = null;
      this.helpPopover = null;
      this.borderPopover = null;
      this.hoverLabel = null;

      this.onMouseMove = this.onMouseMove.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onKeyUp = this.onKeyUp.bind(this);
      this.onScrollOrResize = this.onScrollOrResize.bind(this);
      this.onWindowBlur = this.onWindowBlur.bind(this);
    }

    toggle() {
      this.setEnabled(!this.enabled);
      return { enabled: this.enabled };
    }

    setEnabled(nextEnabled) {
      if (nextEnabled) {
        this.enable();
      } else {
        this.disable();
      }
      return { enabled: this.enabled };
    }

    enable() {
      if (this.enabled) {
        return;
      }
      this.enabled = true;
      this.inspectPaused = false;
      this.lastMetaTapAt = 0;
      this.lastEscTapAt = 0;
      this.mountOverlay();
      this.attachEvents();
      this.setStatus("Capture mode on", 1400);
      this.updateUi();
      this.scheduleRender();
      this.loadCaptureMode().finally(() => {
        if (this.enabled) {
          this.showDefaultActionBar();
        }
      });
      this.loadFrameEnabled();
      this.loadBorderSettings();
    }

    disable() {
      if (!this.enabled) {
        return;
      }
      this.enabled = false;
      this.shiftDown = false;
      this.inspectPaused = false;
      this.lastMetaTapAt = 0;
      this.lastEscTapAt = 0;
      this.hoverElement = null;
      this.flexElement = null;
      this.clearSelections();
      this.detachEvents();
      this.unmountOverlay();
      this.clearStatusTimer();
      this.clearToastTimer();
      this.clearActionBarTimer();
      this.unmountActionBar();
    }

    attachEvents() {
      document.addEventListener("mousemove", this.onMouseMove, true);
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("keydown", this.onKeyDown, true);
      document.addEventListener("keyup", this.onKeyUp, true);
      window.addEventListener("scroll", this.onScrollOrResize, true);
      window.addEventListener("resize", this.onScrollOrResize, true);
      window.addEventListener("blur", this.onWindowBlur, true);
    }

    detachEvents() {
      document.removeEventListener("mousemove", this.onMouseMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.removeEventListener("keyup", this.onKeyUp, true);
      window.removeEventListener("scroll", this.onScrollOrResize, true);
      window.removeEventListener("resize", this.onScrollOrResize, true);
      window.removeEventListener("blur", this.onWindowBlur, true);
    }

    mountOverlay() {
      this.unmountOverlay();

      this.overlayRoot = document.createElement("div");
      this.overlayRoot.id = ROOT_ID;
      this.overlayRoot.style.position = "fixed";
      this.overlayRoot.style.inset = "0";
      this.overlayRoot.style.pointerEvents = "none";
      this.overlayRoot.style.zIndex = "2147483647";

      this.overlayShadow = this.overlayRoot.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        :host {
          all: initial;
        }
        #layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        }
        .box {
          position: fixed;
          left: 0;
          top: 0;
          display: none;
          box-sizing: border-box;
          pointer-events: none;
          transform: translate3d(0, 0, 0);
        }
        .hover {
          border: 1.5px solid #2f6bff;
          background: rgba(47, 107, 255, 0.12);
        }
        .flex {
          border: 1px dashed #2f6bff;
          background: rgba(47, 107, 255, 0.04);
        }
        .selected {
          border: 1.5px solid #1f53d6;
          background: rgba(47, 107, 255, 0.18);
        }
        #toast {
          position: fixed;
          left: 50%;
          top: 18px;
          transform: translate3d(-50%, -10px, 0);
          display: none;
          opacity: 0;
          padding: 6px 12px;
          border-radius: 20px;
          background: #000000;
          color: #ffffff;
          font-size: 15px;
          font-weight: 500;
          line-height: 24px;
          white-space: nowrap;
          pointer-events: none;
          transition: opacity 140ms ease, transform 140ms ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
          z-index: 2147483647;
          align-items: center;
          gap: 8px;
        }
        #toast.show {
          opacity: 1;
          transform: translate3d(-50%, 0, 0);
        }
        #toast .toast-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: h2f-spin 0.8s linear infinite;
          display: none;
          flex: 0 0 auto;
        }
        #toast.loading .toast-spinner {
          display: inline-block;
        }
        #toast .toast-text {
          display: inline-block;
        }
        @keyframes h2f-spin {
          to {
            transform: rotate(360deg);
          }
        }
        #help {
          position: fixed;
          right: 18px;
          bottom: 72px;
          min-width: 220px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(18, 18, 18, 0.88);
          color: #ffffff;
          font-size: 12px;
          line-height: 1.6;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
          pointer-events: auto;
          display: none;
        }
        #help h4 {
          margin: 0 0 6px 0;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        #help ul {
          margin: 0;
          padding-left: 16px;
        }
        #help li {
          margin: 2px 0;
        }
        #border-popover {
          position: fixed;
          right: 18px;
          bottom: 72px;
          min-width: 220px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(18, 18, 18, 0.88);
          color: #ffffff;
          font-size: 12px;
          line-height: 1.6;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
          pointer-events: auto;
          display: none;
        }
        #border-popover h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        #border-popover .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        #border-popover input[type="range"] {
          width: 120px;
        }
        #border-popover input[type="number"] {
          width: 58px;
          padding: 2px 4px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 0, 0, 0.2);
          color: #fff;
        }
        #border-popover input[type="color"] {
          width: 36px;
          height: 20px;
          border: none;
          background: transparent;
          padding: 0;
        }
        #hover-label {
          position: fixed;
          left: 0;
          top: 0;
          max-width: 260px;
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(10, 10, 10, 0.85);
          color: #ffffff;
          font-size: 12px;
          line-height: 1.4;
          font-weight: 600;
          display: none;
          pointer-events: none;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
        }
      `;

      const layer = document.createElement("div");
      layer.id = "layer";

      this.hoverBox = document.createElement("div");
      this.hoverBox.className = "box hover";

      this.flexBox = document.createElement("div");
      this.flexBox.className = "box flex";

      this.selectedLayer = document.createElement("div");
      this.selectedLayer.id = "selected-layer";

      this.cursorBadge = null;

      this.toastEl = document.createElement("div");
      this.toastEl.id = "toast";
      this.toastEl.innerHTML = `<span class="toast-spinner" aria-hidden="true"></span><span class="toast-text"></span>`;
      this.toastTextEl = this.toastEl.querySelector(".toast-text");

      this.helpPopover = document.createElement("div");
      this.helpPopover.id = "help";
      this.helpPopover.innerHTML = `
        <h4>Shortcuts</h4>
        <ul>
          <li>Click: capture element</li>
          <li>Arrow keys: select sibling</li>
          <li>Esc: select parent</li>
          <li>Shift + Esc: select child</li>
          <li>Double Esc: exit</li>
          <li>Double Cmd: pause</li>
          <li>Shift + H: toggle help</li>
        </ul>
      `;

      this.borderPopover = document.createElement("div");
      this.borderPopover.id = "border-popover";
      this.borderPopover.innerHTML = `
        <h4>Border</h4>
        <div class="row">
          <label>Enabled</label>
          <input id="border-enabled" type="checkbox" />
        </div>
        <div class="row">
          <label>Width</label>
          <input id="border-width" type="range" min="1" max="100" value="1" />
          <input id="border-width-number" type="number" min="1" max="100" value="1" />
        </div>
        <div class="row">
          <label>Color</label>
          <input id="border-color" type="color" value="#ff0000" />
        </div>
      `;

      this.hoverLabel = document.createElement("div");
      this.hoverLabel.id = "hover-label";

      layer.appendChild(this.flexBox);
      layer.appendChild(this.hoverBox);
      layer.appendChild(this.selectedLayer);
      layer.appendChild(this.toastEl);
      layer.appendChild(this.helpPopover);
      layer.appendChild(this.borderPopover);
      layer.appendChild(this.hoverLabel);
      this.overlayShadow.appendChild(style);
      this.overlayShadow.appendChild(layer);

      document.documentElement.appendChild(this.overlayRoot);

      this.bindBorderPopover();
    }

    unmountOverlay() {
      if (this.overlayRoot && this.overlayRoot.parentNode) {
        this.overlayRoot.parentNode.removeChild(this.overlayRoot);
      }

      this.overlayRoot = null;
      this.overlayShadow = null;
      this.hoverBox = null;
      this.flexBox = null;
      this.selectedLayer = null;
      this.cursorBadge = null;
      this.toastEl = null;
      this.toastTextEl = null;
      this.helpPopover = null;
      this.borderPopover = null;
      this.selectionBoxes.clear();
      this.clearToastTimer();
    }

    onMouseMove(event) {
      if (!this.enabled) {
        return;
      }

      if (this.inspectPaused) {
        this.hoverElement = null;
        this.flexElement = null;
        this.updateCursorPosition(false);
        this.scheduleRender();
        this.updateUi();
        return;
      }

      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.updateCursorPosition(true);

      const target = this.resolveSelectable(event.target);
      if (!target) {
        this.hoverElement = null;
        this.flexElement = null;
        this.updateHoverLabel();
        this.scheduleRender();
        this.updateUi();
        return;
      }

      if (target !== this.hoverElement) {
        this.hoverElement = target;
        this.flexElement = this.findFlexAncestor(target);
        this.scheduleRender();
      }

      this.updateHoverLabel();
      this.updateUi();
    }

    onClick(event) {
      if (!this.enabled) {
        return;
      }

      if (this.lastMetaTapAt > 0) {
        this.lastMetaTapAt = 0;
      }
      if (this.lastEscTapAt > 0) {
        this.lastEscTapAt = 0;
      }

      if (this.inspectPaused) {
        return;
      }

      const target = this.resolveSelectable(event.target);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      this.clearSelections();
      this.hoverElement = target;
      this.flexElement = this.findFlexAncestor(target);
      this.copyElements([target]);
    }

    onKeyDown(event) {
      if (!this.enabled) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        if (!this.inspectPaused) {
          this.selectSibling("next");
        }
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        if (!this.inspectPaused) {
          this.selectSibling("prev");
        }
        return;
      }

      if (event.key === "Meta") {
        if (event.repeat) {
          return;
        }

        const now = Date.now();
        if (this.lastMetaTapAt > 0 && now - this.lastMetaTapAt <= DOUBLE_META_TAP_MS) {
          this.lastMetaTapAt = 0;
          this.inspectPaused = !this.inspectPaused;
          this.shiftDown = false;

          if (this.inspectPaused) {
            this.hoverElement = null;
            this.flexElement = null;
            this.updateCursorPosition(false);
            this.updateHoverLabel();
            this.clearActionBarTimer();
            this.unmountActionBar();
            this.setStatus("Inspector paused", 1100);
          } else {
            this.showDefaultActionBar();
            this.setStatus("Inspector resumed", 1100);
          }

          this.updateUi();
          this.scheduleRender();
          return;
        }

        this.lastMetaTapAt = now;
        return;
      }

      if (this.lastMetaTapAt > 0) {
        this.lastMetaTapAt = 0;
      }

      if (event.key === "Escape" && event.shiftKey) {
        event.preventDefault();
        this.lastEscTapAt = 0;
        if (!this.inspectPaused) {
          this.selectChild();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        const now = Date.now();
        if (this.lastEscTapAt > 0 && now - this.lastEscTapAt <= DOUBLE_ESC_TAP_MS) {
          this.lastEscTapAt = 0;
          this.disable();
          return;
        }
        this.lastEscTapAt = now;
        if (!this.inspectPaused) {
          this.selectParent();
        }
        return;
      }

      if (this.inspectPaused) {
        if (this.lastEscTapAt > 0) {
          this.lastEscTapAt = 0;
        }
        return;
      }

      if (this.isTypingContext(event.target)) {
        return;
      }

      if (event.key === "Shift") {
        this.shiftDown = true;
        this.updateUi();
        return;
      }

      if (this.lastEscTapAt > 0) {
        this.lastEscTapAt = 0;
      }

      if (event.key.toLowerCase() === "h" && event.shiftKey) {
        event.preventDefault();
        this.toggleHelpPopover();
        return;
      }

      if (event.key === "Enter" && this.hoverElement) {
        event.preventDefault();
        this.copyElements([this.hoverElement]);
      }
    }

    onKeyUp(event) {
      if (!this.enabled) {
        return;
      }
      if (event.key === "Shift") {
        this.shiftDown = false;
        this.updateUi();
      }
    }

    onWindowBlur() {
      if (!this.enabled) {
        return;
      }
      this.shiftDown = false;
      this.lastMetaTapAt = 0;
      this.lastEscTapAt = 0;
      this.updateUi();
    }

    onScrollOrResize() {
      if (!this.enabled) {
        return;
      }
      this.scheduleRender();
    }

    resolveSelectable(start) {
      if (!(start instanceof Element)) {
        return null;
      }

      if (this.isActionBarElement(start)) {
        return null;
      }

      if (this.overlayRoot && this.overlayRoot.contains(start)) {
        return null;
      }

      let node = start;
      while (node) {
        if (this.isActionBarElement(node)) {
          return null;
        }
        if (this.overlayRoot && this.overlayRoot.contains(node)) {
          return null;
        }
        if (this.isSelectable(node)) {
          return node;
        }
        node = node.parentElement;
      }

      return null;
    }

    isActionBarElement(element) {
      if (!(element instanceof Element)) {
        return false;
      }
      const actionBarHost = document.getElementById(ACTION_BAR_ROOT_ID);
      if (!actionBarHost) {
        return false;
      }
      return element === actionBarHost || actionBarHost.contains(element);
    }

    isSelectable(element) {
      if (!(element instanceof Element)) {
        return false;
      }

      const tagName = element.tagName;
      if (DISALLOWED_TAGS.has(tagName)) {
        return false;
      }
      if (element === document.documentElement || element === document.head) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (parseFloat(style.opacity || "1") < 0.05) {
        return false;
      }

      return true;
    }

    findFlexAncestor(element) {
      if (!(element instanceof Element)) {
        return null;
      }

      let current = element.parentElement;
      while (current && current !== document.body) {
        const display = window.getComputedStyle(current).display;
        if (display === "flex" || display === "inline-flex") {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    toggleSelection(element) {
      if (this.selectedElements.has(element)) {
        this.selectedElements.delete(element);
        this.setStatus("Removed from selection", 900);
        return;
      }

      for (const existing of Array.from(this.selectedElements)) {
        if (existing.contains(element) || element.contains(existing)) {
          this.selectedElements.delete(existing);
        }
      }

      this.selectedElements.add(element);
      this.setStatus(`${this.selectedElements.size} selected`, 900);
    }

    clearSelections() {
      this.selectedElements.clear();
      for (const box of this.selectionBoxes.values()) {
        box.remove();
      }
      this.selectionBoxes.clear();
    }

    selectParent() {
      const active = this.hoverElement || this.getMostRecentSelection();
      if (!active) {
        this.setStatus("No active element", 900);
        return;
      }

      let parent = active.parentElement;
      while (parent && !this.isSelectable(parent)) {
        parent = parent.parentElement;
      }

      if (!parent) {
        this.setStatus("Already at top container", 1000);
        return;
      }

      this.hoverElement = parent;
      this.flexElement = this.findFlexAncestor(parent);
      this.setStatus("Selected parent", 1000);
      this.updateUi();
      this.updateHoverLabel();
      this.scheduleRender();
    }

    selectChild() {
      const active = this.hoverElement || this.getMostRecentSelection();
      if (!active) {
        this.setStatus("No active element", 900);
        return;
      }

      const directChildren = Array.from(active.children || []);
      let next = directChildren.find((child) => this.isSelectable(child)) || null;
      if (!next) {
        const queue = [...directChildren];
        while (queue.length > 0) {
          const candidate = queue.shift();
          if (!candidate) {
            continue;
          }
          if (this.isSelectable(candidate)) {
            next = candidate;
            break;
          }
          queue.push(...Array.from(candidate.children || []));
        }
      }

      if (!next) {
        this.setStatus("No child element", 1000);
        return;
      }

      this.hoverElement = next;
      this.flexElement = this.findFlexAncestor(next);
      this.setStatus("Selected child", 1000);
      this.updateUi();
      this.updateHoverLabel();
      this.scheduleRender();
    }

    selectSibling(direction) {
      const active = this.hoverElement || this.getMostRecentSelection();
      if (!active || !active.parentElement) {
        this.setStatus("No sibling element", 900);
        return;
      }

      const siblings = Array.from(active.parentElement.children).filter((child) =>
        this.isSelectable(child)
      );
      if (siblings.length === 0) {
        this.setStatus("No sibling element", 900);
        return;
      }
      const currentIndex = Math.max(0, siblings.indexOf(active));
      const nextIndex =
        direction === "prev"
          ? (currentIndex - 1 + siblings.length) % siblings.length
          : (currentIndex + 1) % siblings.length;
      const next = siblings[nextIndex];
      if (!next) {
        this.setStatus("No sibling element", 900);
        return;
      }

      this.hoverElement = next;
      this.flexElement = this.findFlexAncestor(next);
      this.setStatus("Selected sibling", 900);
      this.updateUi();
      this.updateHoverLabel();
      this.scheduleRender();
    }

    getMostRecentSelection() {
      let latest = null;
      for (const element of this.selectedElements) {
        latest = element;
      }
      return latest;
    }

    updateCursorPosition(visible) {
      // cursor badge removed
    }

    scheduleRender() {
      if (this.renderScheduled) {
        return;
      }
      this.renderScheduled = true;
      window.requestAnimationFrame(() => {
        this.renderScheduled = false;
        this.render();
      });
    }

    render() {
      if (!this.enabled || !this.hoverBox || !this.flexBox) {
        return;
      }

      this.paintBox(this.hoverBox, this.hoverElement);
      this.paintBox(this.flexBox, this.flexElement);
      this.renderSelectionBoxes();
    }

    updateHoverLabel() {
      if (!this.hoverLabel) {
        return;
      }
      const element = this.hoverElement;
      if (!element) {
        this.hoverLabel.style.display = "none";
        return;
      }
      const name = this.getElementLabel(element);
      if (!name) {
        this.hoverLabel.style.display = "none";
        return;
      }
      this.hoverLabel.textContent = name;
      this.hoverLabel.style.display = "block";
      this.hoverLabel.style.transform = `translate3d(${this.pointerX + 14}px, ${this.pointerY + 12}px, 0)`;
    }

    getElementLabel(element) {
      if (!(element instanceof Element)) {
        return "";
      }
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const className = (element.className || "").toString().trim();
      const firstClass = className ? `.${className.split(/\s+/)[0]}` : "";
      const label = `${tag}${id}${firstClass}`;
      return label.length > 0 ? label : tag;
    }

    isRectInViewport(rect) {
      const margin = 6;
      return (
        rect.top >= margin &&
        rect.left >= margin &&
        rect.bottom <= (window.innerHeight || 0) - margin &&
        rect.right <= (window.innerWidth || 0) - margin
      );
    }

    async ensureElementFullyVisible(element) {
      const rect = element.getBoundingClientRect();
      if (this.isRectInViewport(rect)) {
        return;
      }

      await this.ensureElementFullyVisible(element);
      await this.waitForUiHide();

      let nextRect = element.getBoundingClientRect();
      if (this.isRectInViewport(nextRect)) {
        return;
      }

      const scrollParent = this.getScrollParent(element);
      if (scrollParent && scrollParent !== document.documentElement && scrollParent !== document.body) {
        const parentRect = scrollParent.getBoundingClientRect();
        let deltaY = 0;
        let deltaX = 0;
        if (nextRect.top < parentRect.top) {
          deltaY = nextRect.top - parentRect.top;
        } else if (nextRect.bottom > parentRect.bottom) {
          deltaY = nextRect.bottom - parentRect.bottom;
        }
        if (nextRect.left < parentRect.left) {
          deltaX = nextRect.left - parentRect.left;
        } else if (nextRect.right > parentRect.right) {
          deltaX = nextRect.right - parentRect.right;
        }

        if (deltaY !== 0) {
          scrollParent.scrollTop += deltaY;
        }
        if (deltaX !== 0) {
          scrollParent.scrollLeft += deltaX;
        }
        await this.waitForUiHide();
      }
    }

    getScrollParent(element) {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const canScrollY =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          current.scrollHeight > current.clientHeight + 1;
        const canScrollX =
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          current.scrollWidth > current.clientWidth + 1;
        if (canScrollY || canScrollX) {
          return current;
        }
        current = current.parentElement;
      }
      return document.scrollingElement || document.documentElement || document.body;
    }

    isScrollableElement(element) {
      if (!(element instanceof Element)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const canScrollY =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight + 1;
      const canScrollX =
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        element.scrollWidth > element.clientWidth + 1;
      return canScrollY || canScrollX;
    }

    async alignElementToViewportTop(element, scrollTarget, isWindowScroll) {
      const rect = element.getBoundingClientRect();
      const parentRect = isWindowScroll
        ? { top: 0, left: 0 }
        : scrollTarget.getBoundingClientRect();
      let deltaY = 0;
      let deltaX = 0;
      if (rect.top !== parentRect.top) {
        deltaY = rect.top - parentRect.top;
      }
      if (rect.left !== parentRect.left) {
        deltaX = rect.left - parentRect.left;
      }
      if (deltaY !== 0 || deltaX !== 0) {
        if (isWindowScroll) {
          window.scrollBy({ top: deltaY, left: deltaX, behavior: "auto" });
        } else {
          scrollTarget.scrollTop += deltaY;
          scrollTarget.scrollLeft += deltaX;
        }
        await this.waitForUiHide();
      }
    }

    renderSelectionBoxes() {
      if (!this.selectedLayer) {
        return;
      }

      for (const [element, box] of Array.from(this.selectionBoxes.entries())) {
        if (!this.selectedElements.has(element)) {
          box.remove();
          this.selectionBoxes.delete(element);
        }
      }

      for (const element of this.selectedElements) {
        let box = this.selectionBoxes.get(element);
        if (!box) {
          box = document.createElement("div");
          box.className = "box selected";
          this.selectedLayer.appendChild(box);
          this.selectionBoxes.set(element, box);
        }
        this.paintBox(box, element);
      }
    }

    paintBox(box, element) {
      if (!box) {
        return;
      }
      if (!element || !this.isSelectable(element)) {
        box.style.display = "none";
        return;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const radius = parseFloat(style.borderTopLeftRadius || "0") || 0;

      box.style.display = "block";
      box.style.width = `${Math.max(0, rect.width)}px`;
      box.style.height = `${Math.max(0, rect.height)}px`;
      box.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
      box.style.borderRadius = `${radius}px`;
    }

    updateUi() {
      // cursor badge removed
    }

    isTopFrame() {
      try {
        return window.top === window;
      } catch (_error) {
        return false;
      }
    }

    ensureActionBar() {
      if (!this.isTopFrame()) {
        return null;
      }
      if (this.actionBar) {
        return this.actionBar;
      }
      if (typeof window.HtmlToFigmaActionBar !== "function") {
        return null;
      }
      this.actionBar = new window.HtmlToFigmaActionBar();
      return this.actionBar;
    }

    unmountActionBar() {
      if (this.actionBar) {
        this.actionBar.unmount();
        this.actionBar = null;
      }
    }

    clearActionBarTimer() {
      if (this.actionBarResetTimer) {
        window.clearTimeout(this.actionBarResetTimer);
        this.actionBarResetTimer = null;
      }
    }

    showDefaultActionBar() {
      const bar = this.ensureActionBar();
      if (!bar) {
        return;
      }
      this.clearActionBarTimer();
      bar.setState({
        variant: "main",
        icon: null,
        message: "",
        messageIcon: "drag",
        minWidth: 420,
        actions: [
          {
            icon: "open",
            label: "Cap Viewport",
            onClick: () => this.captureViewport(),
          },
          {
            icon: "capture",
            label: "Cap Page",
            onClick: () => this.captureFullPage(),
          },
          {
            icon: "star",
            label: this.frameEnabled ? "Margin: On" : "Margin: Off",
            onClick: () => this.toggleFrameEnabled(),
          },
          {
            icon: "diamond",
            label: this.borderEnabled ? "Border: On" : "Border: Off",
            onClick: () => this.toggleBorderPopover(),
          },
          {
            icon: "select",
            label: this.captureMode === "copy" ? "Copy" : "Download",
            onClick: () => this.toggleCaptureMode(),
          },
        ],
        helpAction: {
          label: "Help",
          onClick: () => this.toggleHelpPopover(),
        },
        aboutAction: {
          label: "About",
          onClick: () => window.open("https://asorn.cn", "_blank"),
        },
      });
    }

    showLoadingActionBar(message) {
      const bar = this.ensureActionBar();
      if (!bar) {
        return;
      }
      this.clearActionBarTimer();
      bar.setState({
        icon: "spinner",
        message: message || "Capturing...",
        minWidth: 265,
        actions: [],
      });
    }

    showSuccessActionBar(message) {
      const bar = this.ensureActionBar();
      if (!bar) {
        return;
      }
      this.clearActionBarTimer();
      bar.setState({
        icon: "ok",
        message,
        minWidth: 265,
        actions: [],
      });
      this.actionBarResetTimer = window.setTimeout(() => {
        if (this.enabled) {
          this.showDefaultActionBar();
        }
      }, 1800);
    }

    showErrorActionBar(message) {
      const bar = this.ensureActionBar();
      if (!bar) {
        return;
      }
      this.clearActionBarTimer();
      bar.setState({
        icon: "error",
        message: message || "Capture failed",
        minWidth: 265,
        actions: [],
      });
      this.actionBarResetTimer = window.setTimeout(() => {
        if (this.enabled) {
          this.showDefaultActionBar();
        }
      }, 2200);
    }

    focusSelectMode() {
      this.inspectPaused = false;
      this.setStatus("Select element mode", 1000);
      this.showDefaultActionBar();
    }

    toggleHelpPopover() {
      if (!this.helpPopover) {
        return;
      }
      const visible = this.helpPopover.style.display === "block";
      this.helpPopover.style.display = visible ? "none" : "block";
      if (!visible && this.borderPopover) {
        this.borderPopover.style.display = "none";
      }
    }

    toggleBorderPopover() {
      if (!this.borderPopover) {
        return;
      }
      const visible = this.borderPopover.style.display === "block";
      this.borderPopover.style.display = visible ? "none" : "block";
      if (!visible && this.helpPopover) {
        this.helpPopover.style.display = "none";
      }
    }

    captureHoveredElement() {
      if (this.copyInFlight) {
        return;
      }
      const target = this.hoverElement;
      if (!target) {
        this.setStatus("No active element", 900);
        return;
      }
      this.copyElements([target]);
    }

    captureViewport() {
      if (this.copyInFlight) {
        return;
      }
      this.copyInFlight = true;
      this.setStatus("Capturing...", 0);
      this.updateUi();
      this.showLoadingToast("Capturing viewport image");
      this.showLoadingActionBar("Capturing viewport image");

      const cleanup = this.hideUiForCapture();
      this.waitForUiHide()
        .then(() => this.requestVisibleCapture())
        .then((capture) => this.dataUrlToBlob(capture.dataUrl))
        .then(async (blob) => {
          const bordered = await this.applyBorderIfNeeded(blob);
          const framed = await this.applyFrameIfNeeded(bordered);
          if (this.captureMode === "copy") {
            await this.copyImageToClipboard(framed);
          } else {
            await this.downloadBlob(framed, this.buildDownloadFileName("png"));
          }
          const toastText =
            this.captureMode === "copy"
              ? "copied viewport screenshot"
              : "downloaded viewport screenshot";
          this.setStatus(
            this.captureMode === "copy" ? "Copied to clipboard" : "Screenshot saved",
            1800
          );
          this.showToast(toastText, 1800);
          this.showSuccessActionBar(toastText);
        })
        .catch((error) => {
          this.setStatus("Capture failed", 2200);
          this.showToast("Capture failed", 2200);
          this.showErrorActionBar("Capture failed");
          console.error("html2any: viewport capture failed", error);
        })
        .finally(() => {
          cleanup();
          this.copyInFlight = false;
          if (this.enabled) {
            this.inspectPaused = false;
          }
          this.updateUi();
          this.scheduleRender();
        });
    }

    captureFullPage() {
      if (this.copyInFlight) {
        return;
      }
      this.copyInFlight = true;
      this.setStatus("Capturing...", 0);
      this.updateUi();
      this.showLoadingToast("Capturing full page");
      this.showLoadingActionBar("Capturing full page");

      const cleanup = this.hideUiForCapture();
      const originalScroll = { x: window.scrollX, y: window.scrollY };
      const dpr = window.devicePixelRatio || 1;
      const scrollTarget = this.findScrollTarget();
      const isWindowScroll =
        scrollTarget === document.documentElement || scrollTarget === document.body;
      const originalTargetScroll = isWindowScroll
        ? { top: 0, left: 0 }
        : { top: scrollTarget.scrollTop, left: scrollTarget.scrollLeft };
      if (isWindowScroll) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } else {
        scrollTarget.scrollTop = 0;
        scrollTarget.scrollLeft = 0;
      }
      const viewportHeight = window.innerHeight || 1;
      const viewportWidth = window.innerWidth || 1;
      const targetRect = isWindowScroll
        ? { left: 0, top: 0, width: viewportWidth, height: viewportHeight }
        : scrollTarget.getBoundingClientRect();
      const totalHeight = isWindowScroll
        ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        : scrollTarget.scrollHeight;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(targetRect.width * dpr));
      canvas.height = Math.max(1, Math.floor(totalHeight * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        this.copyInFlight = false;
        this.showErrorActionBar("Capture failed");
        return;
      }
      ctx.imageSmoothingEnabled = false;

      const captureLoop = async () => {
        let yOffset = 0;
        const visibleHeight = Math.min(targetRect.height, viewportHeight);
        const step = isWindowScroll ? viewportHeight : visibleHeight;

        while (yOffset < totalHeight) {
          const scrollY = Math.min(yOffset, totalHeight - step);
          if (isWindowScroll) {
            window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
          } else {
            scrollTarget.scrollTop = scrollY;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 140));

          const capture = await this.requestVisibleCapture();
          const image = await this.loadImage(capture.dataUrl);

          const remaining = totalHeight - scrollY;
          const sliceHeight = Math.min(remaining, step);
          const sh = Math.max(1, Math.round(sliceHeight * dpr));
          const dy = Math.max(0, Math.round(scrollY * dpr));

          const sx = Math.max(0, Math.round(targetRect.left * dpr));
          const sy = Math.max(0, Math.round(targetRect.top * dpr));
          const sw = Math.max(1, Math.round(targetRect.width * dpr));

          ctx.drawImage(
            image,
            sx,
            sy,
            sw,
            sh,
            0,
            dy,
            canvas.width,
            sh
          );

          yOffset += step;
        }
      };

      let fixedLayer = null;
      let fixedElements = [];
      let restoreFixed = null;

      let cleanupMotion = null;
      this.waitForUiHide()
        .then(async () => {
          cleanupMotion = this.freezeAnimations();
          fixedElements = this.collectFixedElements();
          if (fixedElements.length > 0) {
            fixedLayer = await this.requestVisibleCapture();
            restoreFixed = this.hideFixedElements(fixedElements);
          } else {
            restoreFixed = this.hideFixedElements([]);
          }
          await this.waitForUiHide();
          await this.waitForStableRender();
          await captureLoop();
        })
        .then(async () => {
          if (fixedLayer && fixedElements.length > 0) {
            const fixedImage = await this.loadImage(fixedLayer.dataUrl);
            for (const element of fixedElements) {
              const rect = element.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) {
                continue;
              }
              const sx = Math.max(0, Math.floor(rect.left * dpr));
              const sy = Math.max(0, Math.floor(rect.top * dpr));
              const sw = Math.max(1, Math.floor(rect.width * dpr));
              const sh = Math.max(1, Math.floor(rect.height * dpr));
              ctx.drawImage(fixedImage, sx, sy, sw, sh, sx, sy, sw, sh);
            }
          }
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("Capture failed"))), "image/png");
          });
          const bordered = await this.applyBorderIfNeeded(blob);
          const framed = await this.applyFrameIfNeeded(bordered);
          if (this.captureMode === "copy") {
            await this.copyImageToClipboard(framed);
          } else {
            await this.downloadBlob(framed, this.buildDownloadFileName("png"));
          }
          const toastText =
            this.captureMode === "copy"
              ? "copied full page screenshot"
              : "downloaded full page screenshot";
          this.setStatus(
            this.captureMode === "copy" ? "Copied to clipboard" : "Screenshot saved",
            1800
          );
          this.showToast(toastText, 1800);
          this.showSuccessActionBar(toastText);
        })
        .catch((error) => {
          this.setStatus("Capture failed", 2200);
          this.showToast("Capture failed", 2200);
          this.showErrorActionBar("Capture failed");
          console.error("html2any: full page capture failed", error);
        })
        .finally(() => {
          window.scrollTo({ top: originalScroll.y, left: originalScroll.x, behavior: "auto" });
          if (!isWindowScroll) {
            scrollTarget.scrollTop = originalTargetScroll.top;
            scrollTarget.scrollLeft = originalTargetScroll.left;
          }
          if (restoreFixed) {
            restoreFixed();
          }
          if (typeof cleanupMotion === "function") {
            cleanupMotion();
          }
          cleanup();
          this.copyInFlight = false;
          if (this.enabled) {
            this.inspectPaused = false;
          }
          this.updateUi();
          this.scheduleRender();
        });
    }

    async copyElements(elements) {
      if (!elements.length || this.copyInFlight) {
        return;
      }

      this.copyInFlight = true;
      this.setStatus("Capturing...", 0);
      this.updateUi();
      this.showLoadingToast("Capturing DOM image");
      this.showLoadingActionBar("Capturing DOM image");

      try {
        const element = elements[0];
        const result = await this.captureElementScreenshot(element);
        const toastText =
          result === "copy" ? "copied element screenshot" : "downloaded element screenshot";
        this.setStatus(result === "copy" ? "Copied to clipboard" : "Screenshot saved", 1800);
        this.showToast(toastText, 1800);
        this.showSuccessActionBar(toastText);
      } catch (error) {
        this.setStatus("Capture failed", 2200);
        this.showToast("Capture failed", 2200);
        this.showErrorActionBar("Capture failed");
        console.error("html2any: capture failed", error);
      } finally {
        this.copyInFlight = false;
        if (this.enabled) {
          this.inspectPaused = false;
        }
        if (!this.shiftDown) {
          this.clearSelections();
        }
        this.updateUi();
        this.scheduleRender();
      }
    }


    isTypingContext(target) {
      if (!(target instanceof Element)) {
        return false;
      }
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    }

    setStatus(message, ttlMs = 0) {
      this.statusMessage = message;
      this.updateUi();
      this.clearStatusTimer();

      if (ttlMs > 0) {
        this.statusTimeout = window.setTimeout(() => {
          this.statusMessage = "Idle";
          this.updateUi();
          this.statusTimeout = null;
        }, ttlMs);
      }
    }

    clearStatusTimer() {
      if (this.statusTimeout) {
        window.clearTimeout(this.statusTimeout);
        this.statusTimeout = null;
      }
    }

    async captureElementScreenshot(element) {
      if (!(element instanceof Element)) {
        throw new Error("Invalid element");
      }
      if (!this.isTopFrame()) {
        throw new Error("Capture only supported in top frame");
      }

      const cleanup = this.hideUiForCapture();
      element.scrollIntoView({ block: "center", inline: "center" });
      await this.waitForUiHide();

      try {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
          throw new Error("Element too small");
        }

        if (this.isLongElement(rect)) {
          const blob = await this.captureLongElement(element, rect);
          const bordered = await this.applyBorderIfNeeded(blob);
          const framed = await this.applyFrameIfNeeded(bordered);
          if (this.captureMode === "copy") {
            await this.copyImageToClipboard(framed);
          } else {
            await this.downloadBlob(framed, this.buildDownloadFileName("png"));
          }
          return this.captureMode;
        }

        const capture = await this.requestVisibleCapture();
        const blob = await this.cropCaptureToElement(capture.dataUrl, rect);
        const bordered = await this.applyBorderIfNeeded(blob);
        const framed = await this.applyFrameIfNeeded(bordered);
        if (this.captureMode === "copy") {
          await this.copyImageToClipboard(framed);
        } else {
          await this.downloadBlob(framed, this.buildDownloadFileName("png"));
        }
        return this.captureMode;
      } finally {
        cleanup();
      }
    }

    requestVisibleCapture() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: MESSAGE_CAPTURE_VISIBLE,
          },
          (response) => {
            if (!response || !response.ok) {
              reject(new Error((response && response.error) || "Capture failed"));
              return;
            }
            resolve({ dataUrl: response.dataUrl });
          }
        );
      });
    }

    async cropCaptureToElement(dataUrl, rect) {
      const image = await this.loadImage(dataUrl);
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.max(0, Math.round(rect.left * dpr));
      const sy = Math.max(0, Math.round(rect.top * dpr));
      const sw = Math.max(1, Math.round(rect.width * dpr));
      const sh = Math.max(1, Math.round(rect.height * dpr));

      const maxW = image.width || sw;
      const maxH = image.height || sh;
      const cw = Math.min(sw, Math.max(1, maxW - sx));
      const ch = Math.min(sh, Math.max(1, maxH - sy));

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas not available");
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, sx, sy, cw, ch, 0, 0, cw, ch);

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Crop failed"));
          }
        }, "image/png");
      });
    }


    isLongElement(rect) {
      const viewportHeight = window.innerHeight || 0;
      const viewportWidth = window.innerWidth || 0;
      if (rect.height > viewportHeight * 1.02) {
        return true;
      }
      if (rect.width > viewportWidth * 1.02) {
        return true;
      }
      if (rect.top < 0 || rect.bottom > viewportHeight) {
        return true;
      }
      return false;
    }

    async captureLongElement(element, rect) {
      const dpr = window.devicePixelRatio || 1;
      const scrollTarget = this.getScrollParent(element);
      const isWindowScroll =
        scrollTarget === document.documentElement || scrollTarget === document.body;
      const originalWindowScroll = { x: window.scrollX, y: window.scrollY };
      const originalTargetScroll = isWindowScroll
        ? { top: 0, left: 0 }
        : { top: scrollTarget.scrollTop, left: scrollTarget.scrollLeft };

      const fixedElements = this.collectFixedElements();
      const restoreFixed = this.hideFixedElements(fixedElements);
      const restoreAnimations = this.freezeAnimations();

      const parentRect = isWindowScroll
        ? { top: 0, left: 0 }
        : scrollTarget.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const elementHeight = elementRect.height;
      const elementWidth = elementRect.width;
      const elementTop =
        (isWindowScroll ? window.scrollY : scrollTarget.scrollTop) +
        (elementRect.top - parentRect.top);
      const elementLeft =
        (isWindowScroll ? window.scrollX : scrollTarget.scrollLeft) +
        (elementRect.left - parentRect.left);

      const getScrollTop = () => (isWindowScroll ? window.scrollY : scrollTarget.scrollTop);
      const setScrollTop = (value) => {
        if (isWindowScroll) {
          window.scrollTo({ top: value, left: window.scrollX, behavior: "auto" });
        } else {
          scrollTarget.scrollTop = value;
        }
      };
      const maxScrollTop = isWindowScroll
        ? Math.max(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - (window.innerHeight || 1))
        : Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);

      setScrollTop(Math.min(elementTop, maxScrollTop));
      await this.waitForUiHide();
      await this.waitForStableRender();

      const alignedRect = element.getBoundingClientRect();
      const totalHeight = Math.max(1, Math.floor(elementHeight * dpr));
      const totalWidth = Math.max(1, Math.floor(elementWidth * dpr));
      const viewportHeight = window.innerHeight || 1;

      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        restoreFixed();
        throw new Error("Canvas not available");
      }
      ctx.imageSmoothingEnabled = false;

      let yOffset = 0;
      let lastOffset = -1;
      while (yOffset < elementHeight) {
        const desiredScrollTop = elementTop + yOffset;
        const nextScrollTop = Math.min(desiredScrollTop, maxScrollTop);
        setScrollTop(nextScrollTop);
        await this.waitForUiHide();
        await this.waitForStableRender();

        const currentScrollTop = getScrollTop();
        const actualOffset = Math.max(0, currentScrollTop - elementTop);
        if (actualOffset <= lastOffset + 0.5) {
          break;
        }
        lastOffset = actualOffset;
        yOffset = actualOffset;

        const currentRect = element.getBoundingClientRect();
        const capture = await this.requestVisibleCapture();
        const image = await this.loadImage(capture.dataUrl);

        const sx = Math.max(0, Math.round(currentRect.left * dpr));
        const sy = Math.max(0, Math.round(Math.max(0, currentRect.top) * dpr));
        const sw = Math.max(1, Math.round(currentRect.width * dpr));
        const remaining = elementHeight - yOffset;
        const maxVisible = Math.max(1, viewportHeight - Math.max(0, currentRect.top));
        const sliceHeight = Math.min(remaining, maxVisible);
        const sh = Math.max(1, Math.round(sliceHeight * dpr));

        const dy = Math.max(0, Math.round(yOffset * dpr));
        const dh = Math.min(sh, totalHeight - dy);

        ctx.drawImage(
          image,
          sx,
          sy,
          sw,
          dh,
          0,
          dy,
          totalWidth,
          dh
        );

        yOffset += sliceHeight;
      }

      if (isWindowScroll) {
        window.scrollTo({ top: originalWindowScroll.y, left: originalWindowScroll.x, behavior: "auto" });
      } else {
        scrollTarget.scrollTop = originalTargetScroll.top;
        scrollTarget.scrollLeft = originalTargetScroll.left;
      }
      restoreAnimations();
      restoreFixed();

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Stitch failed"));
          }
        }, "image/png");
      });
    }

    hideUiForCapture() {
      const overlay = this.overlayRoot;
      const actionBarHost = document.getElementById(ACTION_BAR_ROOT_ID);
      const helpPopover = this.helpPopover;
      const hoverLabel = this.hoverLabel;
      const borderPopover = this.borderPopover;
      const styleTag = document.createElement("style");
      styleTag.id = "__h2f_capture_disable_pointer__";
      styleTag.textContent = `
        :root, body, body * {
          pointer-events: none !important;
        }
        ::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
        }
        * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        *::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
        }
      `;
      const previous = {
        overlayDisplay: overlay ? overlay.style.display : "",
        actionBarDisplay: actionBarHost ? actionBarHost.style.display : "",
        helpDisplay: helpPopover ? helpPopover.style.display : "",
        overlayVisibility: overlay ? overlay.style.visibility : "",
        actionBarVisibility: actionBarHost ? actionBarHost.style.visibility : "",
        hoverLabelDisplay: hoverLabel ? hoverLabel.style.display : "",
        borderDisplay: borderPopover ? borderPopover.style.display : "",
      };

      if (overlay) {
        overlay.style.display = "none";
        overlay.style.visibility = "hidden";
      }
      if (actionBarHost) {
        actionBarHost.style.display = "none";
        actionBarHost.style.visibility = "hidden";
      }
      if (helpPopover) {
        helpPopover.style.display = "none";
      }
      if (borderPopover) {
        borderPopover.style.display = "none";
      }
      if (hoverLabel) {
        hoverLabel.style.display = "none";
      }
      (document.head || document.documentElement).appendChild(styleTag);
      if (overlay) {
        overlay.offsetHeight;
      }

      return () => {
        if (overlay) {
          overlay.style.display = previous.overlayDisplay || "";
          overlay.style.visibility = previous.overlayVisibility || "";
        }
        if (actionBarHost) {
          actionBarHost.style.display = previous.actionBarDisplay || "";
          actionBarHost.style.visibility = previous.actionBarVisibility || "";
        }
        if (helpPopover) {
          helpPopover.style.display = previous.helpDisplay || "";
        }
        if (borderPopover) {
          borderPopover.style.display = previous.borderDisplay || "";
        }
        if (hoverLabel) {
          hoverLabel.style.display = previous.hoverLabelDisplay || "";
        }
        styleTag.remove();
      };
    }

    freezeAnimations() {
      const styleTag = document.createElement("style");
      styleTag.id = "__h2f_freeze_motion__";
      styleTag.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleTag);
      return () => {
        styleTag.remove();
      };
    }

    async waitForStableRender() {
      if (document.fonts && typeof document.fonts.ready === "object") {
        try {
          await document.fonts.ready;
        } catch (_error) {
          // ignore
        }
      }
      await this.waitForUiHide();
      await this.waitForImages();
      await this.waitForUiHide();
    }

    async waitForImages() {
      const images = Array.from(document.images || []);
      const pending = images.filter((img) => !img.complete);
      if (!pending.length) {
        return;
      }
      await Promise.race([
        Promise.all(
          pending.map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              })
          )
        ),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
    }

    waitForUiHide() {
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
    }

    collectFixedElements() {
      const items = [];
      const elements = document.body ? document.body.querySelectorAll("*") : [];
      for (const el of elements) {
        if (!(el instanceof Element)) {
          continue;
        }
        const style = window.getComputedStyle(el);
        if (style.position !== "fixed") {
          continue;
        }
        if (style.display === "none" || style.visibility === "hidden") {
          continue;
        }
        if (parseFloat(style.opacity || "1") <= 0.01) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          continue;
        }
        items.push(el);
      }
      return items;
    }

    hideFixedElements(elements) {
      const hidden = [];
      const targets = Array.isArray(elements) ? elements : [];
      for (const el of targets) {
        if (!(el instanceof Element)) {
          continue;
        }
        hidden.push({ el, visibility: el.style.visibility });
        el.style.visibility = "hidden";
      }

      return () => {
        for (const item of hidden) {
          item.el.style.visibility = item.visibility || "";
        }
      };
    }

    findScrollTarget() {
      const root = document.scrollingElement || document.documentElement || document.body;
      if (root && root.scrollHeight > root.clientHeight + 4) {
        return root;
      }

      let best = root;
      let bestScore = 0;
      const candidates = document.body ? document.body.querySelectorAll("*") : [];
      for (const el of candidates) {
        if (!(el instanceof Element)) {
          continue;
        }
        const style = window.getComputedStyle(el);
        if (!(style.overflowY === "auto" || style.overflowY === "scroll")) {
          continue;
        }
        if (el.scrollHeight <= el.clientHeight + 4) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area < bestScore) {
          continue;
        }
        if (rect.width < window.innerWidth * 0.35 || rect.height < window.innerHeight * 0.35) {
          continue;
        }
        best = el;
        bestScore = area;
      }
      return best;
    }

    async copyImageToClipboard(blob) {
      if (!(blob instanceof Blob)) {
        throw new Error("Invalid image data");
      }
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        return;
      }
      throw new Error("Clipboard image not supported");
    }

    async dataUrlToBlob(dataUrl) {
      const response = await fetch(dataUrl);
      return response.blob();
    }

    async applyBorderIfNeeded(blob) {
      if (!this.borderEnabled || this.borderWidth <= 0) {
        return blob;
      }
      return this.applyBorderToBlob(blob);
    }

    async applyBorderToBlob(blob) {
      const url = await this.blobToDataUrl(blob);
      const image = await this.loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return blob;
      }
      ctx.drawImage(image, 0, 0);
      ctx.strokeStyle = this.borderColor || "#ff0000";
      ctx.lineWidth = Math.max(1, Math.min(100, Math.round(this.borderWidth)));
      ctx.strokeRect(
        ctx.lineWidth / 2,
        ctx.lineWidth / 2,
        canvas.width - ctx.lineWidth,
        canvas.height - ctx.lineWidth
      );
      return new Promise((resolve, reject) => {
        canvas.toBlob((out) => {
          if (out) {
            resolve(out);
          } else {
            reject(new Error("Border render failed"));
          }
        }, "image/png");
      });
    }

    async applyFrameIfNeeded(blob) {
      if (!this.frameEnabled) {
        return blob;
      }
      return this.applyFrameToBlob(blob);
    }

    async applyFrameToBlob(blob) {
      const url = await this.blobToDataUrl(blob);
      const image = await this.loadImage(url);
      const minSide = Math.max(1, Math.min(image.width, image.height));
      const padding = Math.max(4, Math.min(160, Math.round(minSide * 0.04)));
      const shadowBlur = Math.max(1, Math.round(minSide * 0.06));
      const shadowOffsetX = 0;
      const shadowOffsetY = Math.max(1, Math.round(minSide * 0.02));
      const extraX = padding + shadowBlur * 2;
      const extraY = padding + shadowBlur * 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(image.width + extraX * 2 + Math.abs(shadowOffsetX));
      canvas.height = Math.ceil(image.height + extraY * 2 + Math.abs(shadowOffsetY));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return blob;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = shadowOffsetX;
      ctx.shadowOffsetY = shadowOffsetY;
      const drawX = extraX;
      const drawY = extraY;
      ctx.drawImage(image, drawX, drawY);
      ctx.shadowColor = "transparent";

      return new Promise((resolve, reject) => {
        canvas.toBlob((out) => {
          if (out) {
            resolve(out);
          } else {
            reject(new Error("Frame render failed"));
          }
        }, "image/png");
      });
    }


    toggleCaptureMode() {
      this.captureMode = this.captureMode === "copy" ? "download" : "copy";
      this.persistCaptureMode(this.captureMode);
      this.setStatus(this.captureMode === "copy" ? "Copy only" : "Download only", 1200);
      this.showDefaultActionBar();
    }

    bindBorderPopover() {
      if (!this.borderPopover) {
        return;
      }
      const enabled = this.borderPopover.querySelector("#border-enabled");
      const widthRange = this.borderPopover.querySelector("#border-width");
      const widthNumber = this.borderPopover.querySelector("#border-width-number");
      const colorInput = this.borderPopover.querySelector("#border-color");
      if (!enabled || !widthRange || !widthNumber || !colorInput) {
        return;
      }
      enabled.checked = this.borderEnabled;
      widthRange.value = String(this.borderWidth);
      widthNumber.value = String(this.borderWidth);
      colorInput.value = this.borderColor;

      enabled.addEventListener("change", () => {
        this.borderEnabled = Boolean(enabled.checked);
        this.persistBorderSettings();
        this.showDefaultActionBar();
      });
      const clampWidth = (value) => Math.max(1, Math.min(100, Number(value) || 1));
      const syncWidth = (value) => {
        const v = clampWidth(value);
        this.borderWidth = v;
        widthRange.value = String(v);
        widthNumber.value = String(v);
        this.persistBorderSettings();
      };
      widthRange.addEventListener("input", () => syncWidth(widthRange.value));
      widthNumber.addEventListener("input", () => syncWidth(widthNumber.value));
      colorInput.addEventListener("input", () => {
        this.borderColor = colorInput.value || "#ff0000";
        this.persistBorderSettings();
      });
    }

    toggleFrameEnabled() {
      this.frameEnabled = !this.frameEnabled;
      this.persistFrameEnabled(this.frameEnabled);
      this.setStatus(this.frameEnabled ? "Frame enabled" : "Frame disabled", 1200);
      this.showDefaultActionBar();
    }

    async loadCaptureMode() {
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY_CAPTURE_MODE);
        const value = stored && stored[STORAGE_KEY_CAPTURE_MODE];
        this.captureMode = value === "download" ? "download" : "copy";
      } catch (_error) {
        this.captureMode = "copy";
      }
    }

    async persistCaptureMode(value) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY_CAPTURE_MODE]: value });
      } catch (_error) {
        // ignore
      }
    }

    async loadBorderSettings() {
      try {
        const stored = await chrome.storage.local.get([
          STORAGE_KEY_BORDER_ENABLED,
          STORAGE_KEY_BORDER_WIDTH,
          STORAGE_KEY_BORDER_COLOR,
        ]);
        this.borderEnabled = Boolean(stored[STORAGE_KEY_BORDER_ENABLED]);
        const width = Number(stored[STORAGE_KEY_BORDER_WIDTH]);
        this.borderWidth = Number.isFinite(width) ? Math.max(1, Math.min(100, width)) : 1;
        this.borderColor = typeof stored[STORAGE_KEY_BORDER_COLOR] === "string"
          ? stored[STORAGE_KEY_BORDER_COLOR]
          : "#ff0000";
      } catch (_error) {
        this.borderEnabled = false;
        this.borderWidth = 1;
        this.borderColor = "#ff0000";
      }
      this.syncBorderPopover();
      if (this.enabled) {
        this.showDefaultActionBar();
      }
    }

    async persistBorderSettings() {
      try {
        await chrome.storage.local.set({
          [STORAGE_KEY_BORDER_ENABLED]: Boolean(this.borderEnabled),
          [STORAGE_KEY_BORDER_WIDTH]: Math.max(1, Math.min(100, Number(this.borderWidth) || 1)),
          [STORAGE_KEY_BORDER_COLOR]: this.borderColor || "#ff0000",
        });
      } catch (_error) {
        // ignore
      }
    }

    syncBorderPopover() {
      if (!this.borderPopover) {
        return;
      }
      const enabled = this.borderPopover.querySelector("#border-enabled");
      const widthRange = this.borderPopover.querySelector("#border-width");
      const widthNumber = this.borderPopover.querySelector("#border-width-number");
      const colorInput = this.borderPopover.querySelector("#border-color");
      if (!enabled || !widthRange || !widthNumber || !colorInput) {
        return;
      }
      enabled.checked = this.borderEnabled;
      widthRange.value = String(this.borderWidth);
      widthNumber.value = String(this.borderWidth);
      colorInput.value = this.borderColor;
    }

    async loadFrameEnabled() {
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY_FRAME);
        this.frameEnabled = Boolean(stored && stored[STORAGE_KEY_FRAME]);
      } catch (_error) {
        this.frameEnabled = false;
      }
    }

    async persistFrameEnabled(value) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY_FRAME]: Boolean(value) });
      } catch (_error) {
        // ignore
      }
    }

    loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image load failed"));
        image.src = src;
      });
    }

    getElementText(element) {
      if (!(element instanceof Element)) {
        return "";
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return (element.value || "").trim();
      }
      return (element.textContent || "").trim();
    }

    async copyTextToClipboard(text) {
      const safeText = text || "";
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(safeText);
        return;
      }

      const textArea = document.createElement("textarea");
      textArea.value = safeText;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }

    async downloadMediaFromElement(element) {
      if (element instanceof HTMLImageElement) {
        await this.downloadUrl(element.currentSrc || element.src, "image");
        return;
      }
      if (element instanceof HTMLAudioElement) {
        await this.downloadUrl(element.currentSrc || element.src, "audio");
        return;
      }
      if (element instanceof HTMLVideoElement) {
        await this.downloadUrl(element.currentSrc || element.src, "video");
        return;
      }
      if (element instanceof HTMLSourceElement) {
        await this.downloadUrl(element.src, "media");
        return;
      }
      if (element instanceof SVGElement) {
        const svgText = new XMLSerializer().serializeToString(element);
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        await this.downloadBlob(blob, this.buildDownloadFileName("svg"));
        return;
      }
      if (element instanceof HTMLCanvasElement) {
        const blob = await this.canvasToBlob(element);
        await this.downloadBlob(blob, this.buildDownloadFileName("png"));
        return;
      }
      const src = element.getAttribute && (element.getAttribute("src") || element.getAttribute("href"));
      if (src) {
        await this.downloadUrl(src, "media");
      }
    }

    async downloadUrl(url, typeHint) {
      if (!url) {
        throw new Error("Missing media url");
      }
      const resolvedUrl = this.normalizeUrl(url);
      await chrome.runtime.sendMessage({
        type: MESSAGE_DOWNLOAD,
        url: resolvedUrl,
        filename: this.buildDownloadFileNameFromUrl(resolvedUrl, typeHint),
      });
    }

    async downloadBlob(blob, filename) {
      const dataUrl = await this.blobToDataUrl(blob);
      await chrome.runtime.sendMessage({
        type: MESSAGE_DOWNLOAD,
        url: dataUrl,
        filename,
      });
    }

    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read image data"));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    buildDownloadFileName(typeHint) {
      const base = typeHint || "media";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = this.mapTypeToExtension(typeHint);
      return `html2any-${base}-${stamp}.${ext}`;
    }

    buildDownloadFileNameFromUrl(url, typeHint) {
      const ext = this.getExtensionFromUrl(url) || this.mapTypeToExtension(typeHint);
      const base = typeHint || "media";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return `html2any-${base}-${stamp}.${ext}`;
    }

    mapTypeToExtension(typeHint) {
      switch (typeHint) {
        case "image":
          return "png";
        case "audio":
          return "mp3";
        case "video":
          return "mp4";
        case "svg":
          return "svg";
        case "png":
          return "png";
        default:
          return "bin";
      }
    }

    getExtensionFromUrl(url) {
      try {
        const pathname = new URL(url).pathname || "";
        const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
        return match ? match[1].toLowerCase() : "";
      } catch (_error) {
        return "";
      }
    }

    normalizeUrl(url) {
      try {
        return new URL(url, window.location.href).toString();
      } catch (_error) {
        return url;
      }
    }

    canvasToBlob(canvas) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas export failed"));
          }
        }, "image/png");
      });
    }

    isMediaElement(element) {
      return (
        element instanceof HTMLImageElement ||
        element instanceof HTMLAudioElement ||
        element instanceof HTMLVideoElement ||
        element instanceof HTMLSourceElement ||
        element instanceof SVGElement ||
        element instanceof HTMLCanvasElement
      );
    }

    showLoadingToast(message) {
      this.showToastInternal(message, { loading: true, ttlMs: 0 });
    }

    showToast(message, ttlMs = 1800) {
      this.showToastInternal(message, { loading: false, ttlMs });
    }

    showToastInternal(message, options) {
      if (!TOP_TOAST_ENABLED) {
        return;
      }
      if (!this.toastEl) {
        return;
      }
      const loading = Boolean(options && options.loading);
      const ttlMs = options && Number.isFinite(options.ttlMs) ? options.ttlMs : 1800;

      this.clearToastTimer();
      if (this.toastTextEl) {
        this.toastTextEl.textContent = message;
      } else {
        this.toastEl.textContent = message;
      }
      this.toastEl.classList.toggle("loading", loading);
      this.toastEl.style.display = "flex";
      this.toastEl.offsetHeight;
      this.toastEl.classList.add("show");

      if (ttlMs > 0) {
        this.toastTimeout = window.setTimeout(() => {
          if (!this.toastEl) {
            return;
          }
          this.toastEl.classList.remove("show");
          const hideLater = window.setTimeout(() => {
            if (this.toastEl) {
              this.toastEl.style.display = "none";
              this.toastEl.classList.remove("loading");
            }
            this.toastTimeout = null;
          }, 160);
          this.toastTimeout = hideLater;
        }, ttlMs);
      }
    }

    clearToastTimer() {
      if (this.toastTimeout) {
        window.clearTimeout(this.toastTimeout);
        this.toastTimeout = null;
      }
      if (this.toastEl) {
        this.toastEl.classList.remove("show");
        this.toastEl.classList.remove("loading");
        this.toastEl.style.display = "none";
      }
    }
  }

  const inspector = new HtmlToFigmaInspector();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === MESSAGE_SET_ENABLED) {
      const state = inspector.setEnabled(Boolean(message.enabled));
      sendResponse(state);
      return;
    }

    if (message.type === MESSAGE_TOGGLE) {
      const state = inspector.toggle();
      sendResponse(state);
    }
  });

  function syncInitialEnabledState() {
    chrome.runtime.sendMessage({ type: MESSAGE_GET_TAB_STATE }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      const shouldEnable = Boolean(response && response.enabled);
      inspector.setEnabled(shouldEnable);
    });
  }

  syncInitialEnabledState();
})();
