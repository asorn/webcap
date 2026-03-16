# Webcap

Precise DOM-level screenshot tool for browsers.

[中文说明](README.zh-CN.md)

## Background

Webcap solves the “inaccurate cropping” problem in traditional screenshots. Instead of screen-only clipping, it captures any DOM element precisely, which is ideal for:

- UI comparison and visual regression
- Documentation and knowledge base building
- Capturing real rendered components for review

## Features

- Hover to highlight any DOM element
- Click or press Enter to capture the current element
- Capture the current viewport or the full page
- Copy-only or download-only modes
- Optional border, shadow, and padding frame
- Built-in help panel and shortcuts

## Shortcuts

- `Click`: capture current element
- `Enter`: capture current element
- `Esc`: select parent element
- `Shift + Esc`: select child element
- `Arrow Keys`: select sibling element
- `Shift + H`: toggle help panel
- `Double Esc`: exit
- `Double Cmd`: pause/resume selector

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Click the extension icon to enable

## Notes

- Browser-internal pages (e.g. `chrome://`) do not allow script injection.
- Use responsibly and respect site terms and copyrights.
