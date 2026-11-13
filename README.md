<div align="center">

# Plyrty Player

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![Styling](https://img.shields.io/badge/styling-English-blue)](STYLING.md)
[![Русский](https://img.shields.io/badge/язык-Русский-red)](README.ru.md)
[![Стилизация](https://img.shields.io/badge/стилизация-Русский-red)](STYLING.ru.md)

</div>

**Plyrty** is a lightweight, modern HTML5 video player wrapper designed for seamless streaming. It provides a unified interface for playing **HLS** (`.m3u8`) and **DASH** (`.mpd`) streams, handling library dependencies automatically.

Unlike standard wrappers, Plyrty features a **Smart Auto-Quality** algorithm that probes network bandwidth before switching, preventing playback interruptions and redundant stream reloads.
 

## ✨ Key Features

- 🎥 **Multi-Format Support:** Built-in support for **HLS.js** and **Dash.js**. The player automatically detects the stream type and loads the necessary libraries from CDN if they are not present.
- 🧠 **Smart Auto-Quality:**
  - **Bandwidth Probing:** proactively tests network speed before switching quality in "Auto" mode.
  - **No-Reload Logic:** intelligently checks if the calculated "Auto" quality matches the current quality, preventing unnecessary stream resets (`currentHeight === newHeight` check).
  - **Memory:** remembers the last selected auto-quality (`lastAutoHeight`) to instantly apply it during future sessions or toggles.
- 📺 **Modern UI:**
  - Custom controls with **Phosphor Icons**.
  - Settings menu for Quality and Playback Speed.
  - Picture-in-Picture (PiP) and Fullscreen modes.
  - Interactive volume slider and time display.
  - Smart volume icon: shows different icons for mute (<code>ph-speaker-x</code>), zero volume (<code>ph-speaker-none</code>), low volume (<code>ph-speaker-low</code>), and high volume (<code>ph-speaker-high</code>).
- 📡 **Chromecast Ready:** Built-in Cast button and integration with Google Cast Framework.
- 🎨 **Themable:** Fully customizable via CSS variables.
- 🛠 **Developer Friendly:** Detailed, color-coded logging system for debugging.

## 🚀 Installation

Simply include the script in your project. Plyrty will automatically detect `<video>` elements with the class `plyrty` or you can initialize it manually.

```html
<!-- Include Plyrty Script -->
<script src="path/to/plyrty.js"></script>

<!-- Add CSS (or let the script handle styles if bundled) -->
<link rel="stylesheet" href="path/to/plyrty.css">
```

## 📖 Usage

### Basic Method (Automatic)
Add the `plyrty` class to your video tag. The script will automatically initialize it on `DOMContentLoaded`.

```html
<div class="plyrty-root">
    <video class="plyrty" controls>
        <source src="https://example.com/stream.mpd" type="application/dash+xml">
    </video>
</div>
```

### Manual Initialization
You can programmatically set the source for any video element using the global API.

```javascript
// Target a video element by selector or reference
plyrtySetSource('#myVideo', 'https://example.com/video.m3u8', 'application/x-mpegurl')
    .then(() => {
        console.log('Video loaded successfully!');
    })
    .catch(err => {
        console.error('Failed to load video:', err);
    });
```

## ⚙️ Configuration

### Playlists and Episodes
Plyrty supports advanced configurations like playlists. You can pass options during initialization (if using the internal `initPlayer` directly) or structure your HTML to support it.

### Theming
You can customize the player's appearance by overriding CSS variables in your stylesheet or passing a `theme` object in options.

```css
.plyrty-root {
    --primary-color: #ff0000;
    --control-bar-bg: rgba(0, 0, 0, 0.8);
}
```

### Mobile Optimization

Plyrty provides enhanced mobile experience with intuitive touch controls:

- **Any tap**: Shows the player controls UI on first tap
- **Subsequent single taps**: Show UI and wait 300ms to check for double tap before toggling play/pause (only if not a double tap)
- **Double tap on left side**: Rewind 10 seconds (without showing UI)
- **Double tap on right side**: Forward 10 seconds (without showing UI)
- **Taps on control elements**: Interact with controls normally (don't trigger play/pause)
- **Taps on menu elements**: Interact with menu items normally (don't trigger play/pause)
- **Larger touch targets**: Better accessibility on small screens

The player automatically adapts to different screen sizes and orientations for optimal viewing experience.

### Global Styling

Plyrty allows global customization of the player appearance through CSS variables. You can override any of the default variables to match your website's design:

```css
/* Example: Customizing the player globally */
.plyrty-root {
    --plyrty-primary: #ff6b35;
    --plyrty-background: #1a1a1a;
    --plyrty-text: #ffffff;
    --plyrty-accent: #ff6b35;
}
```

Available CSS variables include colors, dimensions, and animations that affect the entire player appearance.

## 🧠 How Smart Auto-Quality Works

Standard players often switch quality blindly based on buffer health, leading to "yo-yo" effects. Plyrty improves this by:

1.  **Probing:** When "Auto" is selected, it downloads small chunks of video segments to calculate real-time bandwidth.
2.  **Verification:** Before switching, it compares the new candidate quality with the currently active one.
3.  **Stability:** If `currentHeight` equals the new target height, the switch command is aborted, ensuring playback continues smoothly without reloading the media engine.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

***

*Built with ❤️ by Julia*

## Live Demo

The GitHub Pages demo in `docs/` loads `plyrty.js` and `plyrty.css` directly from the repository root using raw GitHub URLs. There are no copied player bundles in `docs/`; the demo therefore follows the current `main` player sources.

The demo includes HTTPS MP4, HLS, and MPEG-DASH samples from MDN, Mux, and Shaka Player's public test assets. External sample availability can change independently of this repository.
