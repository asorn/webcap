"use strict";

(() => {
  if (window.HtmlToFigmaActionBar) {
    return;
  }

  const ROOT_ID = "__html_to_figma_action_bar__";
  const POSITION_STORAGE_KEY = "h2f:toolbar-position";
  const MOBILE_BREAKPOINT = 540;
  const TOP_OFFSET = 16;
  const BOTTOM_OFFSET = 16;
  const ICON_COLOR_DEFAULT = "rgba(255, 255, 255, 0.9)";

  const ICONS = {
    drag:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="8" cy="6" r="1.6"></circle><circle cx="8" cy="12" r="1.6"></circle><circle cx="8" cy="18" r="1.6"></circle><circle cx="16" cy="6" r="1.6"></circle><circle cx="16" cy="12" r="1.6"></circle><circle cx="16" cy="18" r="1.6"></circle></svg>',
    capture:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="4" y="4" width="16" height="16" rx="1.5" ry="1.5" stroke="currentColor" stroke-width="2"></rect></svg>',
    select:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2"></circle></svg>',
    open:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 5l8 14H4l8-14z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    diamond:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3.5l7.5 8.5L12 20.5 4.5 12 12 3.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    star:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4 1 5.7L12 16.8 6.8 19.3l1-5.7-4.2-4 5.8-.8L12 3.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    close:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>',
    check:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.2 4.2L19 6.5"></path></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5"></path><circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none"></circle><path d="M10.2 3.8L2.8 16.6a2 2 0 0 0 1.7 3h14.9a2 2 0 0 0 1.7-3L13.8 3.8a2 2 0 0 0-3.6 0z"></path></svg>',
    dot:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="2.3"></circle></svg>',
  };

  function applyStyles(node, styles) {
    Object.assign(node.style, styles);
  }

  function createIcon(key, color) {
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    span.className = "icon";
    span.innerHTML = ICONS[key] || ICONS.dot;
    span.style.color = color || ICON_COLOR_DEFAULT;
    return span;
  }

  class HtmlToFigmaActionBar {
    constructor() {
      this.host = null;
      this.shadowRoot = null;
      this.wrapper = null;
      this.bar = null;
      this.actionsContainer = null;
      this.resizeHandler = this.updateResponsiveLayout.bind(this);
      this.onPointerMove = this.handlePointerMove.bind(this);
      this.onPointerUp = this.handlePointerUp.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.state = null;
      this.savedPosition = this.readPosition();
      this.dragging = false;
      this.dragData = null;
      this.releaseAnimationFrame = null;
      this.lastEscapeTapAt = 0;
    }

    mount() {
      if (this.host) {
        return;
      }

      this.host = document.createElement("div");
      this.host.id = ROOT_ID;
      applyStyles(this.host, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "2147483647",
      });

      this.shadowRoot = this.host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        @keyframes h2f-spin { to { transform: rotate(360deg); } }
        @keyframes h2f-pop {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        .wrapper {
          position: fixed;
          left: 50%;
          top: ${TOP_OFFSET}px;
          transform: translateX(-50%);
          pointer-events: none;
          z-index: 2147483647;
        }
        .bar {
          display: flex;
          align-items: center;
          width: max-content;
          min-width: 265px;
          height: 40px;
          padding: 0 8px;
          border-radius: 13px;
          background: rgba(22, 22, 22, 0.55);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: rgba(255, 255, 255, 0.9);
          box-shadow: 0 1px 3px 0 rgba(0,0,0,.15),0 0 .5px 0 rgba(0,0,0,.3);
          box-sizing: border-box;
          font-family: "Inter",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
          font-size: 12px;
          font-weight: 500;
          line-height: 16px;
          letter-spacing: 0.005em;
          pointer-events: auto;
          user-select: none;
          gap: 8px;
          cursor: grab;
          animation: h2f-pop .3s ease-out;
          transition: top 220ms ease, bottom 220ms ease, left 220ms ease, transform 220ms ease;
          overflow: hidden;
          position: relative;
        }
        .bar.dragging {
          cursor: grabbing;
          transition: none;
        }
        .message {
          display: inline-flex;
          align-items: center;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          padding-left: 4px;
          padding-right: 4px;
          flex-grow: 1;
        }
        .divider {
          width: 1px;
          align-self: stretch;
          background: rgba(255, 255, 255, 0.14);
          flex-shrink: 0;
        }
        .actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: 8px;
          margin-right: 8px;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 24px;
          padding: 0 8px 0 4px;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          font: inherit;
          transition: background .1s;
          white-space: nowrap;
        }
        .btn:hover { background: rgba(255, 255, 255, 0.1); }
        .btn:active { background: rgba(255, 255, 255, 0.15); }
        .btn-close {
          width: 24px;
          height: 24px;
          padding: 0;
          margin-left: 8px;
        }
        .btn-help {
          padding: 0 6px;
          height: 24px;
          background: transparent;
          color: rgba(255, 255, 255, 0.85);
        }
        .message-icon {
          display: inline-flex;
        }
        .label {
          display: inline-block;
          margin-left: 4px;
        }
        .icon {
          display: inline-flex;
          width: 16px;
          height: 16px;
          align-items: center;
          justify-content: center;
        }
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: h2f-spin 0.9s linear infinite;
        }
      `;

      this.wrapper = document.createElement("div");
      this.wrapper.className = "wrapper";

      this.bar = document.createElement("div");
      this.bar.className = "bar";
      this.bar.addEventListener("mousedown", (event) => this.handlePointerDown(event));
      this.bar.addEventListener("touchstart", (event) => this.handlePointerDown(event), { passive: false });

      this.wrapper.appendChild(this.bar);
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(this.wrapper);
      document.documentElement.appendChild(this.host);

      window.addEventListener("resize", this.resizeHandler);
      document.addEventListener("keydown", this.onKeyDown, true);
      this.applyStoredPosition();
    }

    unmount() {
      window.removeEventListener("resize", this.resizeHandler);
      document.removeEventListener("keydown", this.onKeyDown, true);
      this.detachDragListeners();
      if (this.releaseAnimationFrame !== null) {
        cancelAnimationFrame(this.releaseAnimationFrame);
        this.releaseAnimationFrame = null;
      }
      if (this.host && this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
      this.host = null;
      this.shadowRoot = null;
      this.wrapper = null;
      this.bar = null;
      this.actionsContainer = null;
      this.state = null;
      this.dragData = null;
      this.dragging = false;
      this.lastEscapeTapAt = 0;
    }

    setState(nextState) {
      this.mount();
      this.state = nextState;
      this.render();
    }

    render() {
      if (!this.bar || !this.state) {
        return;
      }

      const state = this.state;
      this.bar.replaceChildren();
      this.actionsContainer = null;

      const hasIcon = Boolean(state.icon);
      const hasActions = Boolean(state.actions && state.actions.length > 0);
      const hasClose = typeof state.onClose === "function";

      const message = document.createElement("span");
      message.className = "message";
      if (typeof state.onMessageClick === "function") {
        message.style.cursor = "pointer";
        message.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          state.onMessageClick();
        });
      }
      if (state.messageIcon) {
        const icon = createIcon(state.messageIcon, ICON_COLOR_DEFAULT);
        icon.classList.add("message-icon");
        message.appendChild(icon);
      }
      if (state.variant === "main") {
        message.style.paddingLeft = "4px";
      } else {
        message.style.paddingLeft = hasIcon ? "4px" : "8px";
        message.style.paddingRight = !hasActions && !hasClose ? "8px" : "4px";
      }

      if (state.icon === "spinner") {
        const spinner = document.createElement("span");
        spinner.className = "spinner";
        message.appendChild(spinner);
      } else if (state.icon === "ok") {
        message.appendChild(createIcon("check", "#31d07d"));
      } else if (state.icon === "error") {
        message.appendChild(createIcon("error", "#ff6b6b"));
      }

      const text = document.createElement("span");
      text.textContent = state.message || "";
      message.appendChild(text);
      this.bar.appendChild(message);

      if (hasActions) {
        this.bar.appendChild(this.createDivider());
        const actions = document.createElement("div");
        actions.className = "actions";
        this.actionsContainer = actions;
        for (const action of state.actions) {
          actions.appendChild(this.createButton(action));
        }
        this.bar.appendChild(actions);
      }

      if (state.helpAction) {
        this.bar.appendChild(this.createDivider());
        const helpButton = document.createElement("button");
        helpButton.type = "button";
        helpButton.className = "btn btn-help";
        helpButton.textContent = state.helpAction.label || "Help";
        helpButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof state.helpAction.onClick === "function") {
            state.helpAction.onClick();
          }
        });
        this.bar.appendChild(helpButton);
      }

      if (state.aboutAction) {
        this.bar.appendChild(this.createDivider());
        const aboutButton = document.createElement("button");
        aboutButton.type = "button";
        aboutButton.className = "btn btn-help";
        aboutButton.textContent = state.aboutAction.label || "About";
        aboutButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof state.aboutAction.onClick === "function") {
            state.aboutAction.onClick();
          }
        });
        this.bar.appendChild(aboutButton);
      }

      if (hasClose) {
        this.bar.appendChild(this.createDivider());
        this.bar.appendChild(
          this.createButton({
            icon: "close",
            label: "Close",
            iconOnly: true,
            className: "btn-close",
            onClick: state.onClose,
          })
        );
      }

      this.updateResponsiveLayout();
    }

    createDivider() {
      const divider = document.createElement("div");
      divider.className = "divider";
      return divider;
    }

    createButton(config) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn ${config.className || ""}`.trim();
      button.title = config.label || "";
      if (!config.iconOnly) {
        button.setAttribute("data-icon-button", "");
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof config.onClick === "function") {
          config.onClick();
        }
      });

      button.appendChild(createIcon(config.icon || "dot", ICON_COLOR_DEFAULT));

      if (!config.iconOnly) {
        const label = document.createElement("span");
        label.className = "label";
        label.setAttribute("data-toolbar-label", "");
        label.textContent = config.label || "";
        button.appendChild(label);
      }

      return button;
    }

    updateResponsiveLayout() {
      if (!this.bar) {
        return;
      }
      const compact = window.innerWidth < MOBILE_BREAKPOINT;
      const targetMinWidth = compact ? "265px" : `${this.getDesiredMinWidth()}px`;
      if (this.actionsContainer) {
        for (const label of this.actionsContainer.querySelectorAll("[data-toolbar-label]")) {
          label.style.display = compact ? "none" : "";
        }
        for (const iconButton of this.actionsContainer.querySelectorAll("[data-icon-button]")) {
          iconButton.style.padding = compact ? "0 4px" : "0 8px 0 4px";
        }
      }
      this.bar.style.minWidth = targetMinWidth;

      if (!this.dragging) {
        this.applyStoredPosition();
      }
    }

    getDesiredMinWidth() {
      if (!this.state) {
        return 265;
      }
      if (Number.isFinite(this.state.minWidth)) {
        return Math.max(265, this.state.minWidth);
      }
      return this.state.actions && this.state.actions.length >= 3 ? 490 : 265;
    }

    readPosition() {
      try {
        const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
          return null;
        }
        return { x: parsed.x, y: parsed.y };
      } catch (_error) {
        return null;
      }
    }

    savePosition(position) {
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
      } catch (_error) {
        // Ignore storage errors.
      }
    }

    applyStoredPosition() {
      if (!this.wrapper) {
        return;
      }
      const fallback = { x: window.innerWidth / 2, y: TOP_OFFSET };
      const pos = this.savedPosition || fallback;
      this.applyPosition(pos);
    }

    applyPosition(position) {
      if (!this.wrapper) {
        return;
      }
      const rect = this.wrapper.getBoundingClientRect();
      const halfWidth = rect.width / 2;
      const minX = halfWidth + 8;
      const maxX = Math.max(minX, window.innerWidth - halfWidth - 8);
      const minY = TOP_OFFSET;
      const maxY = Math.max(minY, window.innerHeight - rect.height - BOTTOM_OFFSET);
      const clampedX = Math.max(minX, Math.min(maxX, position.x));
      const clampedY = Math.max(minY, Math.min(maxY, position.y));

      this.wrapper.style.left = `${clampedX}px`;
      this.wrapper.style.top = `${clampedY}px`;
      this.wrapper.style.bottom = "";
      this.wrapper.style.transform = "translateX(-50%)";
      this.savedPosition = { x: clampedX, y: clampedY };
    }

    getPointerPoint(event) {
      if (event.touches && event.touches[0]) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
      return { x: event.clientX, y: event.clientY };
    }

    handlePointerDown(event) {
      if (!this.bar || !this.wrapper) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest("button")) {
        return;
      }

      const point = this.getPointerPoint(event);
      const rect = this.wrapper.getBoundingClientRect();
      this.dragging = true;
      this.dragData = {
        startX: point.x,
        startY: point.y,
        startCenterX: rect.left + rect.width / 2,
        startTop: rect.top,
        lastY: point.y,
        lastTime: performance.now(),
        velocityY: 0,
      };

      this.bar.classList.add("dragging");
      if (this.releaseAnimationFrame !== null) {
        cancelAnimationFrame(this.releaseAnimationFrame);
        this.releaseAnimationFrame = null;
      }
      this.wrapper.style.top = `${rect.top}px`;
      this.wrapper.style.bottom = "";
      this.wrapper.style.left = `${this.dragData.startCenterX}px`;
      this.wrapper.style.transform = "translateX(-50%)";
      this.wrapper.style.transition = "none";

      this.attachDragListeners();
      if (event.cancelable) {
        event.preventDefault();
      }
    }

    handlePointerMove(event) {
      if (!this.dragging || !this.dragData || !this.wrapper) {
        return;
      }

      const point = this.getPointerPoint(event);
      const dx = point.x - this.dragData.startX;
      const dy = point.y - this.dragData.startY;
      const now = performance.now();
      const elapsed = Math.max(1, now - this.dragData.lastTime);
      this.dragData.velocityY = ((point.y - this.dragData.lastY) / elapsed) * 1000;
      this.dragData.lastY = point.y;
      this.dragData.lastTime = now;

      const nextCenterX = this.dragData.startCenterX + dx;
      const nextRawTop = this.dragData.startTop + dy;
      const topBound = -20;
      const bottomBound = window.innerHeight - 20 - 40;
      let nextTop = nextRawTop;
      if (nextRawTop < 0) {
        nextTop = nextRawTop * 0.3;
      } else if (nextRawTop > bottomBound) {
        const overflow = nextRawTop - bottomBound;
        nextTop = bottomBound + overflow * 0.3;
      } else {
        nextTop = Math.max(topBound, Math.min(bottomBound, nextRawTop));
      }

      this.wrapper.style.left = `${nextCenterX}px`;
      this.wrapper.style.top = `${nextTop}px`;

      if (event.cancelable) {
        event.preventDefault();
      }
    }

    handlePointerUp() {
      if (!this.dragging || !this.wrapper) {
        return;
      }
      this.dragging = false;
      this.dragData = null;
      if (this.bar) {
        this.bar.classList.remove("dragging");
      }
      const rect = this.wrapper.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const top = rect.top;
      this.savedPosition = { x: centerX, y: top };
      this.savePosition(this.savedPosition);
      this.applyPosition(this.savedPosition);
      this.detachDragListeners();
    }

    handleKeyDown(event) {
      if (!this.state || typeof this.state.onClose !== "function") {
        return;
      }
      if (event.key !== "Escape") {
        return;
      }
      const now = Date.now();
      if (now - this.lastEscapeTapAt <= 500) {
        this.lastEscapeTapAt = 0;
        event.preventDefault();
        event.stopPropagation();
        this.state.onClose();
        return;
      }
      this.lastEscapeTapAt = now;
    }

    attachDragListeners() {
      window.addEventListener("mousemove", this.onPointerMove, true);
      window.addEventListener("mouseup", this.onPointerUp, true);
      window.addEventListener("touchmove", this.onPointerMove, { passive: false, capture: true });
      window.addEventListener("touchend", this.onPointerUp, true);
      window.addEventListener("touchcancel", this.onPointerUp, true);
    }

    detachDragListeners() {
      window.removeEventListener("mousemove", this.onPointerMove, true);
      window.removeEventListener("mouseup", this.onPointerUp, true);
      window.removeEventListener("touchmove", this.onPointerMove, true);
      window.removeEventListener("touchend", this.onPointerUp, true);
      window.removeEventListener("touchcancel", this.onPointerUp, true);
    }
  }

  window.HtmlToFigmaActionBar = HtmlToFigmaActionBar;
})();
