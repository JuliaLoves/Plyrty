<div align="center">

# Plyrty Documentation - Global Styling

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![Русский](https://img.shields.io/badge/язык-Русский-red)](README.ru.md)

</div>

## Overview

Plyrty provides flexible options for global customization of the player's appearance through CSS variables. This allows easy adaptation of the player to match the design of any website.

## Global Style Configuration

To change the player style across your entire site, override CSS variables in your main stylesheet:

```css
/* Example of global site-wide customization */
.plyrty-root {
  --plyrty-primary: #ff6b35;
  --plyrty-background: #1a1a1a;
  --plyrty-text: #ffffff;
  --plyrty-accent: #ff6b35;
  --plyrty-controls-bg: rgba(30, 30, 30, 0.85);
}
```

## Available CSS Variables

### Main Colors
- `--plyrty-primary`: Primary color (default: #19cc31)
- `--plyrty-secondary`: Secondary color (default: #000)
- `--plyrty-background`: Background color (default: #000)
- `--plyrty-controls-bg`: Controls background (default: rgba(20, 20, 20, 0.75))
- `--plyrty-text`: Text color (default: #fff)
- `--plyrty-muted`: Muted text color (default: #cfcfcf)
- `--plyrty-accent`: Accent color (default: #19cc31)

### Control Element Colors
- `--plyrty-button-bg`: Button background (default: transparent)
- `--plyrty-button-color`: Button color (default: var(--plyrty-text))
- `--plyrty-button-hover-bg`: Button hover background (default: rgba(255, 255, 255, 0.12))
- `--plyrty-progress-bg`: Progress bar background (default: rgba(255, 255, 255, 0.25))
- `--plyrty-progress-filled`: Progress bar fill (default: var(--plyrty-accent))
- `--plyrty-tooltip-bg`: Tooltip background (default: rgba(0, 0, 0, 0.7))
- `--plyrty-tooltip-border`: Tooltip border (default: rgba(255, 255, 255, 0.15))

### Dimensions and Padding
- `--plyrty-font-family`: Font family (default: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif)
- `--plyrty-button-size`: Button size (default: 40px)
- `--plyrty-button-radius`: Button border radius (default: 10px)
- `--plyrty-big-button-size`: Big button size (default: 72px)
- `--plyrty-control-padding`: Control padding (default: 10px)
- `--plyrty-gap-size`: Gap between elements (default: 10px)
- `--plyrty-border-radius`: Border radius (default: 12px)

### Animations
- `--plyrty-transition-speed`: Transition speed (default: 180ms)
- `--plyrty-easing`: Easing function (default: ease)

## Examples

### Example 1: Simple Global Style Application

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="plyrty.css">
  <style>
    /* Global style override */
    .plyrty-root {
      --plyrty-primary: #e91e63;
      --plyrty-background: #121212;
      --plyrty-text: #ffffff;
      --plyrty-accent: #e91e63;
    }
  </style>
</head>
<body>
  <div class="plyrty-root">
    <video controls>
      <source src="video.mp4" type="video/mp4">
    </video>
  </div>
  
  <script src="plyrty.js"></script>
</body>
</html>
```

### Example 2: Style Application for Specific Player

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="plyrty.css">
</head>
<body>
  <div id="custom-player" class="plyrty-root">
    <video controls>
      <source src="video.mp4" type="video/mp4">
    </video>
  </div>
  
  <script>
    // Apply style programmatically
    const player = document.getElementById('custom-player');
    player.style.setProperty('--plyrty-primary', '#9c27b0');
    player.style.setProperty('--plyrty-background', '#212121');
    player.style.setProperty('--plyrty-text', '#ffffff');
    player.style.setProperty('--plyrty-accent', '#9c27b0');
  </script>
  <script src="plyrty.js"></script>
</body>
</html>
```

### Example 3: Integration with CSS Frameworks

```css
/* Example integration with Tailwind CSS */
.player-dark {
  --plyrty-primary: theme('colors.green.500');
  --plyrty-background: theme('colors.gray.900');
  --plyrty-text: theme('colors.white');
  --plyrty-accent: theme('colors.green.500');
}

.player-light {
  --plyrty-primary: theme('colors.blue.600');
  --plyrty-background: theme('colors.white');
  --plyrty-text: theme('colors.gray.900');
  --plyrty-accent: theme('colors.blue.600');
}
```

```html
<div class="plyrty-root player-dark">
  <video controls>
    <source src="video.mp4" type="video/mp4">
  </video>
</div>
```

## Compatibility

All global styling settings are fully compatible with existing Plyrty features, including:

- Automatic stream type detection (HLS/DASH)
- Smart quality switching
- Chromecast support
- Picture-in-picture mode
- Fullscreen mode
- Volume and playback speed control
- Enhanced mobile interaction