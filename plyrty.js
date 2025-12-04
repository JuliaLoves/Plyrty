const logger = {
    color: "#19cc31",
    enabled: true,
    _fmt(v) {
        try {
            return typeof v === "string" ? v : String(v);
        } catch {
            return String(v);
        }
    },
    _log(level, levelColor, args, name) {
        if (!this.enabled) return;
        const a = `background: ${this.color}; color: black; font-weight: 800; border-radius: 6px; font-size: 12pt; padding: 2px 6px;`;
        const b = `background: ${levelColor}; color: black; font-weight: 800; border-radius: 6px; font-size: 12pt; padding: 2px 6px;`;
        const c = `color: ${this.color}; font-size: 12pt;`;
        const textParts = [];
        const passthrough = [];
        for (const x of args) {
            if (x instanceof Error || (x && typeof x === "object")) {
                passthrough.push(x);
            } else {
                textParts.push(this._fmt(x));
            }
        }
        let fmt = `%cPlyrty%c${name}%c \n${textParts.join(" ")}`;
        if (passthrough.length) {
            fmt += " " + "%o".repeat(passthrough.length);
            console[level](fmt, a, b, c, ...passthrough);
        } else {
            console[level](fmt, a, b, c);
        }
    },
    log: (...a) => logger._log("log", "#a6d189", a, "Log"),
    info: (...a) => logger._log("info", "#a6d189", a, "Info"),
    warn: (...a) => logger._log("warn", "#e5c890", a, "Warn"),
    error: (...a) => logger._log("error", "#e78284", a, "Error"),
    debug: (...a) => logger._log("debug", "#eebebe", a, "Debug")
};

window.logger = logger;

const __plyrtyMap = new WeakMap();
const __plyrtyMeta = (globalThis.__plyrtyMeta instanceof WeakMap)
    ? globalThis.__plyrtyMeta
    : (globalThis.__plyrtyMeta = new WeakMap());

window.plyrtySetSource = function (target, url, type = 'application/x-mpegurl', resolutions = null) {
    const el = typeof target === 'string'
        ? document.querySelector(target)
        : (target && target.nodeType === 1 ? target : null);
    if (!el) return Promise.reject(new Error('plyrtySetSource: target not found'));
    let api = __plyrtyMap.get(el);
    if (!api && el.closest) {
        const root = el.closest('.plyrty-root');
        const v = root ? root.querySelector('video') : null;
        if (v) api = __plyrtyMap.get(v);
    }
    if (!api) return Promise.reject(new Error('plyrtySetSource: player API not found'));
    return api.setSource(url, type, resolutions);
};

(() => {
    const CDN = {
        HLS: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.mjs',
        PH: 'https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2',
        CAST: 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
        DASH: 'https://cdn.dashjs.org/latest/dash.all.min.js'
    };

    const STORAGE = {
        VOL: 'plyrty:volume',
        MUTED: 'plyrty:muted'
    };

    let castFrameworkReady = false;
    let dashHeights;

    function injectScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function importHls() {
        try {
            const mod = await import(CDN.HLS);
            return mod?.default || mod;
        } catch (e) {
            await injectScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js');
            return window.Hls;
        }
    }

    function dispatchCastEvent(type) {
        try {
            document.dispatchEvent(new Event(type));
        } catch { }
    }

    async function fetchMpdXml(mpdUrl, rewrite) {
        const u = rewrite ? rewrite(mpdUrl) : mpdUrl;
        const txt = await fetch(u, { credentials: "omit" }).then(r => {
            if (!r.ok) throw new Error(`MPD HTTP ${r.status}`);
            return r.text();
        });
        return new DOMParser().parseFromString(txt, "application/xml");
    }

    function dashSelectHeight(dp, height) {
        try {
            const reps = dp.getRepresentationsForType?.("video") || dp.getRepresentationsByType?.("video") || [];
            if (!reps.length) return;
            let idx = reps.findIndex(r => (r.height | 0) === (height | 0));
            if (idx < 0) {
                const sorted = [...reps].sort((a, b) => (a.height | 0) - (b.height | 0));
                const target = sorted.find(r => (r.height | 0) >= (height | 0)) || sorted[0];
                idx = reps.indexOf(target);
            }
            if (idx >= 0) {
                try {
                    dp.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
                } catch { }
                dp.setQualityFor("video", idx, true);
            }
        } catch { }
    }

    function parseVideoRepresentations(xmlDoc) {
        const ns = "urn:mpeg:dash:schema:mpd:2011";
        const q = (n, sel) => Array.from(n.getElementsByTagNameNS(ns, sel));
        const mpd = xmlDoc.documentElement;
        const periods = q(mpd, "Period");
        if (!periods.length) return [];
        const adaptSets = q(periods[0], "AdaptationSet").filter(a => (a.getAttribute("contentType") || "").toLowerCase() === "video");
        if (!adaptSets.length) return [];
        const videoSet = adaptSets[0];
        const reps = q(videoSet, "Representation");
        const out = [];
        for (const r of reps) {
            const id = r.getAttribute("id") || "";
            const height = parseInt(r.getAttribute("height") || "0", 10) || 0;
            const seg = q(r, "SegmentTemplate")[0] || q(videoSet, "SegmentTemplate")[0] || null;
            let timescale = 1, duration = 0, startNumber = 1, initTpl = "", mediaTpl = "";
            if (seg) {
                timescale = parseInt(seg.getAttribute("timescale") || "1", 10) || 1;
                duration = parseInt(seg.getAttribute("duration") || "0", 10) || 0;
                startNumber = parseInt(seg.getAttribute("startNumber") || "1", 10) || 1;
                initTpl = seg.getAttribute("initialization") || "";
                mediaTpl = seg.getAttribute("media") || "";
            }
            out.push({ id, height, timescale, duration, startNumber, initTpl, mediaTpl });
        }
        return out;
    }

    async function ensureDomSourcesFromMpd(videoEl, rewrite) {
        const s = videoEl.src || videoEl.currentSrc || "";
        let mpdUrl = /\.mpd(\?|#|$)/i.test(s) ? s : "";
        if (!mpdUrl) {
            const srcMpd = Array.from(videoEl.querySelectorAll("source"))
                .map(n => n.src || "")
                .find(u => /\.mpd(\?|#|$)/i.test(u));
            if (srcMpd) mpdUrl = srcMpd;
        }
        if (!mpdUrl) return false;
        const xml = await fetchMpdXml(mpdUrl, rewrite);
        const reps = parseVideoRepresentations(xml);
        const all = reps.map(r => r.height | 0).filter(Boolean).sort((a, b) => b - a);
        const metaPrev = __plyrtyMeta.get(videoEl) || {};
        const metaNext = { ...metaPrev };
        if (!metaNext.masterDashUrl) metaNext.masterDashUrl = mpdUrl;
        if (!Array.isArray(metaNext.allHeights) || !metaNext.allHeights.length) metaNext.allHeights = all;
        __plyrtyMeta.set(videoEl, metaNext);
        dashHeights = [...metaNext.allHeights];
        return true;
    }

    window.__onGCastApiAvailable = function (isAvailable) {
        if (!isAvailable) {
            castFrameworkReady = !!(window.chrome && window.chrome.cast);
            if (!castFrameworkReady) {
                dispatchCastEvent('cast-unavailable');
                return;
            }
        }
        try {
            const ctx = cast.framework.CastContext.getInstance();
            ctx.setOptions({
                receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED
            });
            castFrameworkReady = true;
            dispatchCastEvent('cast-ready');
        } catch {
            castFrameworkReady = !!(window.chrome && window.chrome.cast);
            if (castFrameworkReady) dispatchCastEvent('cast-ready');
            else dispatchCastEvent('cast-unavailable');
        }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        injectScript(CDN.PH);
        injectScript(CDN.DASH);
        injectScript(CDN.CAST).catch(() => { });
        const Hls = await importHls().catch(() => null);
        const candidates = [];
        document.querySelectorAll('video').forEach(v => {
            if (v.dataset.plyrtyInited === '1') return;
            const parent = v.closest('.plyrty');
            const self = v.classList.contains('plyrty');
            if (self || parent) candidates.push({ video: v, root: parent || v });
        });
        if (candidates.length === 0) {
            document.querySelectorAll('video').forEach(v => {
                if (v.dataset.plyrtyInited === '1') return;
                if (v.querySelector('source')) candidates.push({ video: v, root: v });
            });
        }
        for (const { video, root } of candidates) {
            try {
                await ensureDomSourcesFromMpd(video);
                initPlayer(video, root, Hls);
                initDashIfAvailable(
                    video,
                    undefined,
                    typeof window.plyrtyUrlReplace === "function" ? (u) => window.plyrtyUrlReplace(u, video) : (u) => u
                );
            } catch (e) {
                logger.error('plyrty init error', e);
            }
        }
    });

    function initPlayer(originalVideo, rootEl, Hls, opts = {}) {
        originalVideo.dataset.plyrtyInited = '1';
        originalVideo.controls = false;

        const norm = (arr) => (arr || []).map(x => ({
            url: x.url,
            type: x.type || guessTypeFromUrl(x.url || ''),
            res: x.res | 0
        })).filter(x => x.url);

        const domSources = Array.from(originalVideo.querySelectorAll('source')).map(s => ({
            url: s.getAttribute('src') || '',
            type: s.getAttribute('type') || guessTypeFromUrl(s.getAttribute('src') || ''),
            res: parseInt(s.getAttribute('data-resolution') || '0', 10)
        })).filter(s => s.url);

        let currentEpisode = Math.max(0, opts.defaultEpisode | 0);

        let playlist = Array.isArray(opts.playlist) ? opts.playlist.map(ep => ({
            title: ep.title || '',
            sources: norm(ep.sources)
        })) : null;

        let sources = playlist
            ? (playlist[currentEpisode]?.sources || [])
            : (Array.isArray(opts.sources) ? norm(opts.sources) : domSources);

        sources.sort((a, b) => (b.res || 0) - (a.res || 0));

        const wrapper = document.createElement('div');
        wrapper.className = 'plyrty-root';

        const videoWrap = document.createElement('div');
        videoWrap.className = 'plyrty-video';

        const chromeEl = document.createElement('div');
        chromeEl.className = 'plyrty-chrome';

        const topBar = document.createElement('div');
        topBar.className = 'plyrty-topbar';

        const midOverlay = document.createElement('div');
        midOverlay.className = 'plyrty-mid';

        const bigPlay = document.createElement('button');
        bigPlay.className = 'plyrty-btn big';
        bigPlay.innerHTML = '<i class="ph-bold ph-play"></i>';
        midOverlay.appendChild(bigPlay);

        const controls = document.createElement('div');
        controls.className = 'plyrty-controls';

        const left = document.createElement('div');
        left.className = 'plyrty-left';

        const playBtn = document.createElement('button');
        playBtn.className = 'plyrty-btn';
        playBtn.title = 'Воспроизвести/Пауза';
        playBtn.innerHTML = '<i class="ph ph-play"></i>';

        const timeText = document.createElement('div');
        timeText.className = 'plyrty-time';
        timeText.textContent = '0:00 / 0:00';

        left.appendChild(playBtn);
        left.appendChild(timeText);

        const center = document.createElement('div');
        center.className = 'plyrty-center';

        const progressWrap = document.createElement('div');
        progressWrap.className = 'plyrty-progress';

        const progressBuffered = document.createElement('div');
        progressBuffered.className = 'plyrty-buffered';

        const progressPlayed = document.createElement('div');
        progressPlayed.className = 'plyrty-played';

        progressWrap.appendChild(progressBuffered);
        progressWrap.appendChild(progressPlayed);
        center.appendChild(progressWrap);

        const speeds = Array.isArray(opts.speeds) && opts.speeds.length ? opts.speeds : [0.5, 0.75, 1, 1.25, 1.5, 2];

        function applyTheme(el, theme) {
            if (!theme) return;
            Object.entries(theme).forEach(([k, v]) => el.style.setProperty(`--${k}`, v));
        }

        applyTheme(wrapper, opts.theme);

        const bufferUI = (() => {
            let hlsTotalSegments = 0;
            let hlsLoaded = [];

            function clearBuffered() {
                while (progressBuffered.firstChild) progressBuffered.removeChild(progressBuffered.firstChild);
            }

            function addChunk(leftPct, widthPct) {
                if (widthPct <= 0) return;
                const d = document.createElement('div');
                d.className = 'plyrty-buffer-chunk';
                d.style.borderRadius = 'inherit';
                d.style.position = 'absolute';
                d.style.left = `${leftPct}%`;
                d.style.width = `${widthPct}%`;
                d.style.top = '0';
                d.style.bottom = '0';
                d.style.backgroundColor = '#ffffff4d';
                d.style.pointerEvents = 'none';
                progressBuffered.appendChild(d);
            }

            function renderHTML5(video) {
                clearBuffered();
                const dur = video.duration || 0;
                if (!dur || !isFinite(dur)) return;
                const r = video.buffered;
                for (let i = 0; i < r.length; i++) {
                    const start = (r.start(i) / dur) * 100;
                    const end = (r.end(i) / dur) * 100;
                    addChunk(start, Math.max(0, end - start));
                }
            }

            function resetHls(total) {
                hlsTotalSegments = Math.max(0, total | 0);
                hlsLoaded = Array(hlsTotalSegments).fill(false);
                renderHls();
            }

            function markHls(sn) {
                if (typeof sn !== 'number') return;
                if (sn >= 0 && sn < hlsLoaded.length) {
                    hlsLoaded[sn] = true;
                    renderHls();
                }
            }

            function renderHls() {
                clearBuffered();
                if (hlsTotalSegments <= 0) return;
                const w = 100 / hlsTotalSegments;
                let runStart = -1;
                for (let i = 0; i < hlsLoaded.length; i++) {
                    if (hlsLoaded[i]) {
                        if (runStart === -1) runStart = i;
                    } else {
                        if (runStart !== -1) {
                            addChunk(runStart * w, (i - runStart) * w);
                            runStart = -1;
                        }
                    }
                }
                if (runStart !== -1) {
                    addChunk(runStart * w, (hlsLoaded.length - runStart) * w);
                }
            }

            return { renderHTML5, resetHls, markHls };
        })();

        const right = document.createElement('div');
        right.className = 'plyrty-right';

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'plyrty-btn';
        settingsBtn.title = 'Настройки';
        settingsBtn.setAttribute('aria-haspopup', 'true');
        settingsBtn.setAttribute('aria-expanded', 'false');
        settingsBtn.innerHTML = '<i class="ph ph-gear"></i>';

        const menu = document.createElement('div');
        menu.className = 'plyrty-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        const menuContent = document.createElement('div');
        menuContent.className = 'plyrty-menu-content';
        menu.appendChild(menuContent);

        right.appendChild(settingsBtn);
        right.appendChild(menu);

        const castBtn = document.createElement('button');
        castBtn.className = 'plyrty-btn';
        castBtn.title = 'Chromecast';
        castBtn.innerHTML = '<i class="ph ph-screencast"></i>';
        right.appendChild(castBtn);

        const volWrap = document.createElement('div');
        volWrap.className = 'plyrty-volume';

        const volIcon = document.createElement('button');
        volIcon.className = 'plyrty-btn';
        volIcon.title = 'Звук';
        volIcon.innerHTML = '<i class="ph ph-speaker-high"></i>';

        const volRange = document.createElement('input');
        volRange.className = 'plyrty-range';
        volRange.type = 'range';
        volRange.min = '0';
        volRange.max = '1';
        volRange.step = '0.01';
        volRange.value = '1';

        volWrap.appendChild(volIcon);
        volWrap.appendChild(volRange);
        right.appendChild(volWrap);

        const pipBtn = document.createElement('button');
        pipBtn.className = 'plyrty-btn';
        pipBtn.title = 'Картинка-в-картинке';
        pipBtn.innerHTML = '<i class="ph ph-picture-in-picture"></i>';
        right.appendChild(pipBtn);

        const fsBtn = document.createElement('button');
        fsBtn.className = 'plyrty-btn';
        fsBtn.title = 'Полноэкранный режим';
        fsBtn.innerHTML = '<i class="ph ph-arrows-out-simple"></i>';
        right.appendChild(fsBtn);

        controls.appendChild(left);
        controls.appendChild(center);
        controls.appendChild(right);

        chromeEl.appendChild(topBar);
        chromeEl.appendChild(midOverlay);
        chromeEl.appendChild(controls);

        const loader = document.createElement('div');
        loader.className = 'plyrty-loader';
        loader.innerHTML = '<div class="plyrty-spinner"></div>';

        const parent = rootEl.parentNode;
        if (!parent) return;

        parent.replaceChild(wrapper, rootEl);
        wrapper.appendChild(videoWrap);
        wrapper.appendChild(loader);
        wrapper.appendChild(chromeEl);
        videoWrap.appendChild(originalVideo);

        const toastTop = document.createElement('div');
        toastTop.className = 'plyrty-toast plyrty-toast-top';

        const toastLeft = document.createElement('div');
        toastLeft.className = 'plyrty-toast plyrty-toast-left';

        const toastRight = document.createElement('div');
        toastRight.className = 'plyrty-toast plyrty-toast-right';

        wrapper.appendChild(toastTop);
        wrapper.appendChild(toastLeft);
        wrapper.appendChild(toastRight);

        let hls = null;
        let autoModeControlled = false;
        let currentHeight = 0;
        let lastSwitchAt = 0;
        const MIN_SWITCH_GAP_MS = 5000;

        function backHeader(title) {
            const h = document.createElement("div");
            h.className = "plyrty-menu-title";
            const back = document.createElement("button");
            back.className = "plyrty-btn";
            back.innerHTML = "<i class='ph-bold ph-caret-left'></i>Назад";
            back.onclick = () => popMenu();
            const ttl = document.createElement("span");
            ttl.style.marginLeft = "8px";
            ttl.textContent = title;
            h.appendChild(back);
            h.appendChild(ttl);
            return h;
        }

        function selectFixedQuality(height) {
            autoModeControlled = false;
            switchQuality(height);
        }

        function allHeights() {
            const out = new Set();
            try {
                const meta = (__plyrtyMeta && __plyrtyMeta.get) ? (__plyrtyMeta.get(originalVideo) || {}) : {};
                if (Array.isArray(meta.allHeights) && meta.allHeights.length) {
                    meta.allHeights.forEach(h => out.add((h | 0)));
                } else {
                    const dp = originalVideo.dash;
                    const curUrl = (meta.currentMpdUrl || originalVideo.src || originalVideo.currentSrc || "") + "";
                    const isData = curUrl.startsWith("data:");
                    if (dp && !isData) {
                        const reps = dp.getRepresentationsForType?.("video") || dp.getRepresentationsByType?.("video") || [];
                        const all = reps.map(r => r?.height | 0).filter(Boolean).sort((a, b) => b - a);
                        if (all.length) {
                            if (__plyrtyMeta && __plyrtyMeta.set) __plyrtyMeta.set(originalVideo, { ...meta, allHeights: all });
                            all.forEach(h => out.add(h));
                        }
                    }
                }
            } catch { }
            try {
                (hls?.levels || []).forEach(l => {
                    const h = l?.height | 0;
                    if (h) out.add(h);
                });
            } catch { }
            try {
                const meta = (__plyrtyMeta && __plyrtyMeta.get) ? (__plyrtyMeta.get(originalVideo) || {}) : {};
                const dashLike = !!meta.masterDashUrl || /\.mpd(\?|#|$)/i.test((originalVideo.src || originalVideo.currentSrc || "") + "");
                if (!dashLike) {
                    Array.from(originalVideo.querySelectorAll("source")).forEach(s => {
                        const h = parseInt(s.getAttribute("data-resolution") || "0", 10) | 0;
                        if (h) out.add(h);
                    });
                }
            } catch { }
            return Array.from(out).filter(Boolean).sort((a, b) => b - a);
        }

        let lastAutoHeight = 0;

        async function renderQualityMenu() {
            menuContent.innerHTML = '';
            menuContent.appendChild(backHeader('Качество'));
            const list = document.createElement('ul');
            list.className = 'plyrty-menu-list';
            const displayHeight = autoModeControlled ? (currentHeight | 0) : lastAutoHeight;
            const liAuto = document.createElement('li');
            liAuto.className = 'plyrty-menu-item';
            liAuto.setAttribute('role', 'menuitemradio');
            liAuto.textContent = displayHeight ? `Авто (${displayHeight}p)` : 'Авто';
            const autoActive = !!autoModeControlled;
            liAuto.classList.toggle('active', autoActive);
            liAuto.setAttribute('aria-checked', autoActive ? 'true' : 'false');
            liAuto.onclick = async () => {
                autoModeControlled = true;
                let h = lastAutoHeight;
                if (!h) {
                    try {
                        h = await pickStartAutoHeight();
                    } catch { }
                }
                if (h) {
                    lastAutoHeight = h;
                    switchQuality(h).catch(() => { });
                }
                startAutoProbe();
                renderQualityMenu();
            };
            list.appendChild(liAuto);

            const heights = allHeights();
            heights.forEach(h => {
                const li = document.createElement('li');
                li.className = 'plyrty-menu-item';
                li.setAttribute('role', 'menuitemradio');
                li.textContent = `${h}p`;
                const active = !autoActive && (currentHeight === (h | 0));
                li.classList.toggle('active', !!active);
                li.setAttribute('aria-checked', active ? 'true' : 'false');
                li.onclick = () => {
                    autoModeControlled = false;
                    stopAutoProbe();
                    selectFixedQuality(h);
                    renderQualityMenu();
                };
                list.appendChild(li);
            });
            menuContent.appendChild(list);
        }

        const autoInit = (() => {
            let done = false;
            let running = null;
            return {
                async runOnce(force = false) {
                    if (done) return;
                    if (running) return running;
                    if (autoModeControlled === false && !force) return;
                    running = (async () => {
                        try {
                            autoModeControlled = true;
                            startAutoProbe();
                            const h0 = await pickStartAutoHeight().catch(() => null);
                            if (h0 && h0 !== currentHeight) {
                                currentHeight = h0;
                                lastAutoHeight = h0;
                                await switchQuality(h0).catch(() => { });
                            }
                            done = true;
                        } finally {
                            running = null;
                        }
                    })();
                    return running;
                },
                reset() {
                    done = false;
                },
                isDone() {
                    return done;
                }
            };
        })();

        function isDashMode(videoEl = originalVideo) {
            const s = videoEl.src || videoEl.currentSrc || "";
            return /\.mpd(\?|#|$)/i.test(s) || !!(__plyrtyMeta.get(videoEl)?.lastDashUrl);
        }

        function getQualityMapFromAttr() {
            try {
                const raw = originalVideo.getAttribute('data-quality-map') || originalVideo.dataset.qualityMap;
                if (!raw) return null;
                const obj = JSON.parse(raw);
                const map = {};
                Object.entries(obj).forEach(([h, url]) => {
                    const hh = parseInt(h, 10) | 0;
                    if (hh && typeof url === 'string' && url) map[hh] = url;
                });
                return Object.keys(map).length ? map : null;
            } catch {
                return null;
            }
        }

        function getQualityMapFromSources() {
            if (isDashMode()) return null;
            const map = {};
            Array.from(originalVideo.querySelectorAll('source')).forEach(s => {
                const h = parseInt(s.getAttribute('data-resolution') || '0', 10) | 0;
                const url = s.getAttribute('src') || '';
                if (h && url) map[h] = url;
            });
            return Object.keys(map).length ? map : null;
        }

        function getQualityMapFromTemplate() {
            const base = originalVideo.getAttribute('src') || (originalVideo.querySelector('source')?.getAttribute('src') || '');
            if (!base) return null;
            const rxStr = originalVideo.getAttribute('data-quality-regex') || originalVideo.dataset.qualityRegex;
            const tpl = originalVideo.getAttribute('data-quality-template') || originalVideo.dataset.qualityTemplate || '{h}p';
            const variants = (originalVideo.getAttribute('data-quality-variants') || originalVideo.dataset.qualityVariants || '').split(',').map(x => parseInt(x, 10) | 0).filter(Boolean);
            if (!rxStr || !variants.length) return null;
            let rx = null;
            try {
                rx = new RegExp(rxStr, 'i');
            } catch {
                return null;
            }
            if (!rx.test(base)) return null;
            const map = {};
            for (const h of variants) {
                const token = tpl.replace(/\{h\}/g, String(h));
                map[h] = base.replace(rx, token);
            }
            return Object.keys(map).length ? map : null;
        }

        function getQualityMap() {
            const meta = __plyrtyMeta.get(originalVideo);
            if (meta && meta._customMap) return meta._customMap;
            if (isDashMode()) return getQualityMapFromAttr() || getQualityMapFromTemplate() || null;
            return getQualityMapFromAttr() || getQualityMapFromSources() || getQualityMapFromTemplate();
        }

        if (originalVideo.dash && window.dashjs) {
            const E = window.dashjs.MediaPlayer.events;
            originalVideo.dash.on(E.MANIFEST_LOADED, () => {
                try {
                    const reps = originalVideo.dash.getRepresentationsForType?.('video') || originalVideo.dash.getRepresentationsByType?.('video') || [];
                    dashHeights = reps.map(r => r.height | 0).filter(Boolean).sort((a, b) => b - a);
                    if (menuStack?.at?.(-1) === renderQualityMenu) renderQualityMenu();
                } catch { }
            });
        }

        function getAvailableHeights() {
            const meta = __plyrtyMeta.get(originalVideo) || {};
            if (Array.isArray(meta.allHeights) && meta.allHeights.length) return [...meta.allHeights];
            if (Array.isArray(dashHeights) && dashHeights.length) return [...dashHeights];
            const map = getQualityMap();
            if (!map) return [];
            return Object.keys(map).map(x => parseInt(x, 10) | 0).filter(Boolean).sort((a, b) => b - a);
        }

        function resolveQualityUrl(h) {
            const map = getQualityMap();
            if (!map) return '';
            return map[h] || '';
        }

        async function pickStartAutoHeight() {
            const hs0 = getAvailableHeights();
            const hs = Array.isArray(hs0) ? [...new Set(hs0.map(h => h | 0).filter(Boolean))].sort((a, b) => a - b) : [];
            if (!hs.length) return 0;
            const meta = (__plyrtyMeta?.get?.(originalVideo)) || {};
            const masterMpd = meta.masterDashUrl || "";
            const reps = Array.isArray(meta.reps) ? meta.reps : (meta._reps || []);
            const isDash = /\.mpd(\?|#|$)/i.test(String(originalVideo.src || originalVideo.currentSrc || masterMpd || ""));
            if (!isDash || !reps.length || !masterMpd) {
                try {
                    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                    const type = (conn && conn.effectiveType) || "";
                    if (/^(2g|slow-2g)$/i.test(type)) return hs[0] | 0;
                    if (/^3g$/i.test(type)) return hs[Math.min(2, Math.floor(hs.length / 2))] | 0;
                } catch { }
                return hs[hs.length - 1] | 0;
            }
            const rewrite = (u) => (typeof window.plyrtyUrlReplace === "function" ? window.plyrtyUrlReplace(u, originalVideo) : u);
            const baseMpd = masterMpd;
            const SLICE_BYTES = 512 * 1024;
            const TIMEOUT_MS = 2000;
            const SAFETY = 0.90;
            const byHeight = new Map();
            for (const r of reps) {
                const h = r?.height | 0;
                if (h) byHeight.set(h, r);
            }
            const baseDir = baseMpd.replace(/[^/?#]+(\?.*)?$/, "");

            function firstMediaUrlForHeight(h) {
                const r = byHeight.get(h);
                if (!r || !r.mediaTpl) return "";
                const num = String((r.startNumber || 1)).padStart(5, "0");
                const rel = r.mediaTpl.replace("$RepresentationID$", r.id).replace("$Number%05d$", num);
                const abs = /^https?:/i.test(rel) ? rel : (baseDir + rel.replace(/^\.?\//, ""));
                return rewrite(abs);
            }

            async function estimateThroughput(url) {
                const ctl = new AbortController();
                const t0 = performance.now();
                let bytes = 0;
                try {
                    const resp = await fetch(url, {
                        method: "GET",
                        headers: { Range: `bytes=0-${SLICE_BYTES - 1}` },
                        signal: ctl.signal,
                        credentials: "omit",
                        cache: "no-store",
                    });
                    if (!resp.ok && resp.status !== 206 && resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
                    const reader = resp.body?.getReader ? resp.body.getReader() : null;
                    if (!reader) {
                        const buf = await resp.arrayBuffer();
                        bytes = buf.byteLength;
                    } else {
                        const tm = setTimeout(() => ctl.abort(), TIMEOUT_MS);
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                bytes += value?.byteLength || 0;
                                if (bytes >= SLICE_BYTES) break;
                            }
                        } finally {
                            clearTimeout(tm);
                        }
                    }
                } catch { }
                const ms = Math.max(1, performance.now() - t0);
                const mbps = (bytes * 8) / (ms * 1000);
                return { mbps, ms, bytes };
            }

            function requiredMbps(h) {
                const r = byHeight.get(h);
                const bw = r && (parseInt(r.bandwidth || "0", 10) || 0);
                if (bw > 0) return bw / 1e6;
                if (h >= 1080) return 5.0;
                if (h >= 720) return 2.5;
                if (h >= 480) return 1.2;
                if (h >= 360) return 0.8;
                return 0.5;
            }

            let lo = 0, hi = hs.length - 1;
            let best = hs[0];
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const h = hs[mid];
                const url = firstMediaUrlForHeight(h);
                if (!url) {
                    hi = mid - 1;
                    continue;
                }
                const { mbps } = await estimateThroughput(url);
                const req = requiredMbps(h);
                if (mbps * SAFETY >= req) {
                    best = h;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            return best | 0;
        }

        let autoProbeTimer = null;
        let autoProbeBusy = false;
        const PROBE_INTERVAL_MS = 1000;

        function refreshQualityMenuIfOpen() {
            try {
                if (menuStack?.at?.(-1) === renderQualityMenu) renderQualityMenu();
            } catch { }
        }

        if (!autoInit.isDone?.()) autoInit.runOnce(true);

        function startAutoProbe() {
            if (autoProbeTimer) clearInterval(autoProbeTimer);
            autoProbeTimer = setInterval(async () => {
                if (!autoModeControlled) return;
                if (autoProbeBusy) return;
                if (originalVideo.seeking || originalVideo.readyState < 2) return;
                if (performance.now() - (lastSwitchAt || 0) < (MIN_SWITCH_GAP_MS || 5000)) return;
                autoProbeBusy = true;
                try {
                    const h = await pickStartAutoHeight().catch(() => 0);
                    if (h && h !== currentHeight) {
                        currentHeight = h;
                        lastAutoHeight = h;
                        await switchQuality(h).catch(() => { });
                    }
                } finally {
                    autoProbeBusy = false;
                }
            }, PROBE_INTERVAL_MS);
        }

        function stopAutoProbe() {
            if (autoProbeTimer) {
                clearInterval(autoProbeTimer);
                autoProbeTimer = null;
            }
        }

        async function buildDashSingleRepMpdUrl(mpdUrl, targetHeight, rewrite) {
            const u = typeof rewrite === "function" ? rewrite(mpdUrl) : mpdUrl;
            const txt = await fetch(u, { credentials: "omit" }).then(r => {
                if (!r.ok) throw new Error(`MPD HTTP ${r.status}`);
                return r.text();
            });
            const parser = new DOMParser();
            const xml = parser.parseFromString(txt, "application/xml");
            const ns = "urn:mpeg:dash:schema:mpd:2011";
            const q = (n, sel) => Array.from(n.getElementsByTagNameNS(ns, sel));
            const mpd = xml.documentElement;
            const baseDir = mpdUrl.replace(/[^/?#]+(\?.*)?$/, "");
            let baseNodes = q(mpd, "BaseURL");
            if (!baseNodes.length) {
                const b = xml.createElementNS(ns, "BaseURL");
                b.textContent = baseDir;
                mpd.insertBefore(b, mpd.firstChild);
            } else {
                baseNodes[0].textContent = baseDir;
            }
            const periods = q(mpd, "Period");
            if (!periods.length) throw new Error("No Period in MPD");
            const period = periods[0];
            const sets = q(period, "AdaptationSet");
            const videoSet = sets.find(a => (a.getAttribute("contentType") || "").toLowerCase() === "video");
            if (!videoSet) throw new Error("No video AdaptationSet");
            const reps = q(videoSet, "Representation");
            if (!reps.length) throw new Error("No video Representations");
            const candidates = reps
                .map((r, idx) => ({
                    node: r,
                    height: (parseInt(r.getAttribute("height") || "0", 10) || 0),
                    idx
                }));
            candidates.sort((a, b) => a.height - b.height);
            let chosen = candidates.find(x => x.height >= (targetHeight | 0)) || candidates[candidates.length - 1];
            for (const r of reps) {
                if (r !== chosen.node) r.parentNode.removeChild(r);
            }
            const xmlStr = new XMLSerializer().serializeToString(xml);
            const dataUrl = "data:application/dash+xml;charset=utf-8," + encodeURIComponent(xmlStr);
            return dataUrl;
        }

        async function switchQuality(height) {
            if (currentHeight && currentHeight === (height | 0)) return;
            const base = originalVideo.src || originalVideo.currentSrc || "";
            const isDash = /\.mpd(\?|#|$)/i.test(base) || !!(__plyrtyMeta.get(originalVideo)?.lastDashUrl);
            const wasPlaying = !originalVideo.paused;
            const t = originalVideo.currentTime || 0;
            const mpd = __plyrtyMeta.get(originalVideo)?.lastDashUrl || (isDash ? base : "");
            const urlResolved = resolveQualityUrl(height) || mpd;
            if (!urlResolved) return;
            const type = guessTypeFromUrl(urlResolved);
            const opt = { resumeTime: t, autoplay: wasPlaying };
            currentHeight = height | 0;
            lastSwitchAt = performance.now();
            if (isDash) {
                const mpdSrc = (__plyrtyMeta.get(originalVideo)?.masterDashUrl) || urlResolved;
                const filteredUrl = await buildDashSingleRepMpdUrl(
                    mpdSrc,
                    currentHeight,
                    (u) => (typeof window.plyrtyUrlReplace === "function" ? window.plyrtyUrlReplace(u, originalVideo) : u)
                );
                const metaA = __plyrtyMeta.get(originalVideo) || {};
                __plyrtyMeta.set(originalVideo, { ...metaA, currentMpdUrl: filteredUrl });
                destroyEngines?.();
                loadSource(filteredUrl, "application/dash+xml", opt);
                return;
            }
            destroyEngines?.();
            if (isDash) opt.forceHeight = currentHeight;
            loadSource(urlResolved, type, opt);
            refreshQualityMenuIfOpen();
        }

        function setupHlsBufferHandlers(hlsInstance) {
            if (!hlsInstance || typeof Hls === 'undefined') return;
            const initFromLevelDetails = (details) => {
                try {
                    const total = Array.isArray(details?.fragments) ? details.fragments.length : 0;
                    if (total > 0) bufferUI.resetHls(total);
                } catch (e) {
                    logger && logger.debug && logger.debug('HLS buffer: init error', e);
                }
            };
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, (evt, data) => {
                const d = data?.levels?.[0]?.details;
                if (d) initFromLevelDetails(d);
            });
            hlsInstance.on(Hls.Events.LEVEL_LOADED, (evt, data) => {
                initFromLevelDetails(data?.details);
            });
            const mark = (evt, data) => {
                if (data && data.frag && Number.isFinite(data.frag.sn)) {
                    bufferUI.markHls(data.frag.sn);
                }
            };
            hlsInstance.on(Hls.Events.FRAG_LOADED, mark);
            if (Hls.Events.FRAG_BUFFERED) {
                hlsInstance.on(Hls.Events.FRAG_BUFFERED, mark);
            }
        }

        let uiHideTimer = null;
        let lastActivityTs = 0;
        let isScrubbing = false;
        let baseRate = originalVideo.playbackRate || 1;
        let suppressClickUntil = 0;
        let lastTapWasDouble = false;

        const hoverTip = document.createElement('div');
        hoverTip.className = 'plyrty-progress-tip';
        hoverTip.hidden = true;
        progressWrap.appendChild(hoverTip);

        originalVideo.addEventListener('loadedmetadata', () => bufferUI.renderHTML5(originalVideo));
        originalVideo.addEventListener('progress', () => bufferUI.renderHTML5(originalVideo));
        originalVideo.addEventListener('timeupdate', () => bufferUI.renderHTML5(originalVideo));
        originalVideo.addEventListener("ended", () => {
            stopAutoProbe();
        });

        function fmt(t) {
            if (!isFinite(t)) return '0:00';
            const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
            if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            return `${m}:${String(s).padStart(2, '0')}`;
        }

        const toastTimers = Object.create(null);

        function showToastTTL(el, html, side, ttl = 800) {
            el.innerHTML = html;
            el.classList.add('show', side || 'top');
            const key = side || 'top';
            clearTimeout(toastTimers[key]);
            toastTimers[key] = setTimeout(() => {
                el.classList.remove('show', side || 'top');
            }, ttl);
        }

        function showToastHold(el, html, side) {
            const key = side || 'top';
            clearTimeout(toastTimers[key]);
            el.innerHTML = html;
            el.classList.add('show', side || 'top');
        }

        function hideToastImmediate(el, side) {
            const key = side || 'top';
            clearTimeout(toastTimers[key]);
            el.classList.remove('show', side || 'top');
        }

        function showTopMsg(text, icon) {
            showToastHold(
                toastTop,
                `<div class="plyrty-topmsg" role="status" aria-live="polite" aria-atomic="true"><i class="ph ${icon}"></i><span>${text}</span></div>`,
                'top'
            );
        }

        function showTopVolume(pct) {
            const val = Math.max(0, Math.min(100, Math.round(pct)));
            let icon;
            if (val === 0) {
                icon = 'ph-speaker-none';
            } else if (val <= 50) {
                icon = 'ph-speaker-low';
            } else {
                icon = 'ph-speaker-high';
            }
            showToastTTL(
                toastTop,
                `<div class="plyrty-topmsg" role="status" aria-live="polite" aria-atomic="true"><i class="ph ${icon}"></i><span>${val}%</span></div>`,
                'top',
                800
            );
        }

        function showSeekToast(dir) {
            const cls = dir === 'right' ? 'ph-fast-forward' : 'ph-rewind';
            const el = dir === 'right' ? toastRight : toastLeft;
            showToastTTL(el, `<div class="plyrty-bubble"><i class="ph ${cls}"></i><b>5 сек.</b></div>`, dir, 700);
        }

        const isMobileCoarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
        const isFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

        function updateCastVisibility() {
            let available = castFrameworkReady;

            if (!available && window.chrome && window.chrome.cast && window.cast && window.cast.framework) {
                try {
                    const ctx = cast.framework.CastContext.getInstance();
                    if (ctx) {
                        available = true;
                        castFrameworkReady = true;
                    }
                } catch (e) { }
            }

            const btn = castBtn || wrapper.querySelector('[title="Chromecast"]');
            if (!btn) return;
            btn.style.display = available ? '' : 'none';
            btn.setAttribute('aria-hidden', available ? 'false' : 'true');
            btn.tabIndex = available ? 0 : -1;
        }

        document.addEventListener('cast-ready', updateCastVisibility);
        document.addEventListener('cast-unavailable', updateCastVisibility);
        updateCastVisibility();
        setTimeout(updateCastVisibility, 500);

        function setPlayIcon() {
            const playing = !originalVideo.paused;
            playBtn.innerHTML = `<i class="ph ${playing ? 'ph-pause' : 'ph-play'}"></i>`;
            bigPlay.style.display = playing ? 'none' : '';
            bigPlay.innerHTML = `<i class="ph-bold ${playing ? 'ph-pause' : 'ph-play'}"></i>`;
            wrapper.classList.toggle('playing', playing);
        }

        const togglePlay = () => {
            if (originalVideo.paused) originalVideo.play();
            else originalVideo.pause();
        };

        function updateTime() {
            timeText.textContent = `${fmt(originalVideo.currentTime)} / ${fmt(originalVideo.duration)}`;
        }

        function updatePlayed() {
            const pct = Math.min(100, (originalVideo.currentTime / (originalVideo.duration || 1)) * 100);
            progressPlayed.style.width = `${pct}%`;
        }

        function seekAt(clientX) {
            const rect = progressWrap.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            originalVideo.currentTime = ratio * (originalVideo.duration || 0);
        }

        function showUI() {
            wrapper.classList.add('ui-show');
            wrapper.classList.remove('ui-hide');
            clearTimeout(uiHideTimer);
            if (!originalVideo.paused) {
                uiHideTimer = setTimeout(() => {
                    if (Date.now() - lastActivityTs > 1800) {
                        wrapper.classList.remove('ui-show');
                        wrapper.classList.add('ui-hide');
                        if (!menu.hidden) {
                            menu.hidden = true;
                            settingsBtn.setAttribute('aria-expanded', 'false');
                        }
                    }
                }, 2300);
            }
        }

        progressWrap.addEventListener('pointerenter', (e) => {
            if (!isFinePointer) return;
            hoverTip.hidden = false;
            updateHoverTipByX(e.clientX);
        });

        progressWrap.addEventListener('pointerleave', () => {
            hoverTip.hidden = true;
        });

        progressWrap.addEventListener('pointerdown', (e) => {
            isScrubbing = true;
            try {
                progressWrap.setPointerCapture(e.pointerId);
            } catch { }
            seekAt(e.clientX);
            if (isFinePointer) {
                hoverTip.hidden = false;
                updateHoverTipByX(e.clientX);
            }
        });

        progressWrap.addEventListener('pointermove', (e) => {
            if (isFinePointer) updateHoverTipByX(e.clientX);
            if (isScrubbing) seekAt(e.clientX);
        });

        progressWrap.addEventListener('pointerup', (e) => {
            isScrubbing = false;
            try {
                progressWrap.releasePointerCapture(e.pointerId);
            } catch { }
        });

        progressWrap.addEventListener('pointercancel', () => {
            isScrubbing = false;
        });

        function updateHoverTipByX(clientX) {
            const rect = progressWrap.getBoundingClientRect();
            if (!rect.width) return;
            const xClamped = Math.max(rect.left, Math.min(rect.right, clientX));
            const ratio = (xClamped - rect.left) / rect.width;
            const dur = getDurationSafe();
            const t = ratio * (dur || 0);
            hoverTip.textContent = fmt(t);
            const px = Math.max(6, Math.min(rect.width - 6, xClamped - rect.left));
            hoverTip.style.left = `${(px / rect.width) * 100}%`;
        }

        function getDurationSafe() {
            let d = originalVideo.duration;
            if (isFinite(d) && d > 0) return d;
            try {
                const det = hls?.levels?.[hls.currentLevel || 0]?.details;
                if (det?.totalduration && isFinite(det.totalduration)) return det.totalduration;
            } catch { }
            return 0;
        }

        function fitMenuToWrapper() {
            if (menu.hidden) return;
            const wr = wrapper.getBoundingClientRect();
            const vvh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const maxH = Math.max(160, Math.min(wr.height - 80, vvh - 100));
            menu.style.maxHeight = `${Math.floor(maxH)}px`;
            menu.style.overflowY = 'auto';
            menu.style.right = '10px';
            menu.style.left = 'auto';
            menu.style.bottom = '60px';
            const mr = menu.getBoundingClientRect();
            if (mr.right > wr.right) {
                const dx = mr.right - wr.right + 10;
                menu.style.right = `${10 + dx}px`;
            }
            if (mr.left < wr.left) {
                menu.style.left = '10px';
                menu.style.right = 'auto';
            }
            const mr2 = menu.getBoundingClientRect();
            if (mr2.bottom > wr.bottom) {
                const diff = mr2.bottom - wr.bottom + 12;
                menu.style.bottom = `${60 + diff}px`;
            }
        }

        const initial = pickInitialSource(sources, originalVideo);
        loadSource(initial.url, initial.type, opts, originalVideo);

        function attachMenuToggler(wrapper, btn, menu, fit) {
            function toggle(open) {
                const willOpen = open !== undefined ? open : menu.hidden;
                menu.hidden = !willOpen;
                btn.setAttribute('aria-expanded', String(willOpen));
                if (willOpen && typeof fit === 'function') fit();
            }
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggle();
            });
            document.addEventListener('click', (e) => {
                const path = e.composedPath ? e.composedPath() : [];
                if (!path.includes(menu) && !path.includes(btn) && !menu.hidden) {
                    toggle(false);
                }
            });
            window.addEventListener('resize', () => {
                if (!menu.hidden && typeof fit === 'function') fit();
            });
            window.addEventListener('orientationchange', () => {
                if (!menu.hidden && typeof fit === 'function') setTimeout(fit, 300);
            });
            return toggle;
        }

        function menuFit(wrapper, menu) {
            return function () {
                if (menu.hidden) return;
                const wr = wrapper.getBoundingClientRect();
                const vvh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const maxH = Math.max(160, Math.min(wr.height - 80, vvh - 100));
                menu.style.maxHeight = `${Math.floor(maxH)}px`;
                menu.style.overflowY = 'auto';
                menu.style.right = '10px';
                menu.style.left = 'auto';
                menu.style.bottom = '60px';
                const mr = menu.getBoundingClientRect();
                if (mr.right > wr.right) {
                    const dx = mr.right - wr.right + 10;
                    menu.style.right = `${10 + dx}px`;
                }
                if (mr.left < wr.left) {
                    menu.style.left = '10px';
                    menu.style.right = 'auto';
                }
                const mr2 = menu.getBoundingClientRect();
                if (mr2.bottom > wr.bottom) {
                    const diff = mr2.bottom - wr.bottom + 12;
                    menu.style.bottom = `${60 + diff}px`;
                }
            };
        }

        const fit = menuFit(wrapper, menu);
        const toggle = attachMenuToggler(wrapper, settingsBtn, menu, fit);

        let menuStack = [];

        function pushMenu(renderFn) {
            menuStack.push(renderFn);
            renderFn();
            fit();
        }

        function popMenu() {
            if (menuStack.length > 1) {
                menuStack.pop();
                menuStack.at(-1)();
                fit();
            } else {
                toggle(false);
            }
        }

        function renderSpeedMenu() {
            menuContent.innerHTML = '';
            menuContent.appendChild(backHeader('Скорость'));
            const list = document.createElement('ul');
            list.className = 'plyrty-menu-list';
            const speedValues = Array.isArray(speeds) && speeds.length ? speeds : [0.5, 0.75, 1, 1.25, 1.5, 2];
            speedValues.forEach(v => {
                const li = document.createElement('li');
                li.className = 'plyrty-menu-item';
                li.setAttribute('role', 'menuitemradio');
                li.textContent = `${v}x`;
                const active = Math.abs(originalVideo.playbackRate - v) < 1e-3;
                li.classList.toggle('active', active);
                li.setAttribute('aria-checked', active ? 'true' : 'false');
                li.onclick = () => {
                    originalVideo.playbackRate = v;
                    renderSpeedMenu();
                };
                list.appendChild(li);
            });
            menuContent.appendChild(list);
        }

        function formatQualityBadge() {
            const h = currentHeight | 0;
            return autoModeControlled ? (h ? `Aвто (${h}p)` : '') : (h ? `${h}p` : '');
        }

        function formatSpeedBadge() {
            const v = originalVideo?.playbackRate || 1;
            const s = Math.round(v * 100) / 100;
            return `${s}x`;
        }

        function renderRoot() {
            menuContent.innerHTML = '';
            const list = document.createElement('ul');
            list.className = 'plyrty-menu-list';
            const heights = allHeights();
            const hasMultipleQualities = heights.length > 1;
            if (hasMultipleQualities) {
                const liQ = document.createElement('li');
                liQ.className = 'plyrty-menu-item plyrty-menu-item-row';
                const leftQ = document.createElement('span');
                leftQ.textContent = 'Качество';
                const rightQ = document.createElement('span');
                rightQ.className = 'plyrty-menu-sub';
                rightQ.style.fontSize = '12px';
                rightQ.textContent = formatQualityBadge();
                liQ.appendChild(leftQ);
                liQ.appendChild(rightQ);
                liQ.onclick = () => pushMenu(renderQualityMenu);
                list.appendChild(liQ);
            }
            const liS = document.createElement('li');
            liS.className = 'plyrty-menu-item plyrty-menu-item-row';
            const leftS = document.createElement('span');
            leftS.textContent = 'Скорость';
            const rightS = document.createElement('span');
            rightS.className = 'plyrty-menu-sub';
            rightS.style.fontSize = '12px';
            rightS.textContent = formatSpeedBadge();
            liS.appendChild(leftS);
            liS.appendChild(rightS);
            list.appendChild(liS);
            menuContent.appendChild(list);
            liS.onclick = () => pushMenu(renderSpeedMenu);
        }

        function openRoot() {
            menuStack = [renderRoot];
            renderRoot();
            fit();
        }

        settingsBtn.addEventListener('click', openRoot);
        window.addEventListener('resize', fitMenuToWrapper);
        window.addEventListener('orientationchange', () => {
            setTimeout(fitMenuToWrapper, 300);
        });

        function clamp01(x) {
            return Math.min(1, Math.max(0, x));
        }

        function updateRangeFill(input) {
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || 1;
            const val = parseFloat(input.value) || 0;
            const pct = ((val - min) / (max - min)) * 100;
            input.style.setProperty('--fill', `${pct}%`);
        }

        function updateVolumeIcon(v) {
            v = originalVideo.muted ? 0 : originalVideo.volume;
            const cls = v === 0 ? 'ph-speaker-x' : (v < 0.5 ? 'ph-speaker-low' : 'ph-speaker-high');
            volIcon.innerHTML = `<i class="ph ${cls}"></i>`;
        }

        const mobile = isMobileCoarse;
        if (mobile) {
            originalVideo.muted = false;
            originalVideo.volume = 1;
            volRange.value = '1';
            updateRangeFill(volRange);
            updateVolumeIcon(1);
        } else {
            const mutedSaved = localStorage.getItem(STORAGE.MUTED);
            const volSaved = localStorage.getItem(STORAGE.VOL);
            if (mutedSaved !== null) originalVideo.muted = (mutedSaved === '1');
            if (volSaved !== null) {
                const v = clamp01(parseFloat(volSaved));
                originalVideo.volume = Number.isFinite(v) ? v : 1;
            }
            volRange.value = String(originalVideo.muted ? 0 : originalVideo.volume);
            updateRangeFill(volRange);
            updateVolumeIcon();
        }

        originalVideo.addEventListener('volumechange', () => {
            if (!mobile) {
                localStorage.setItem(STORAGE.VOL, String(originalVideo.volume));
                localStorage.setItem(STORAGE.MUTED, originalVideo.muted ? '1' : '0');
            }
            volRange.value = String(originalVideo.muted ? 0 : originalVideo.volume);
            updateRangeFill(volRange);
            updateVolumeIcon();
        });

        volRange.addEventListener('input', () => {
            const v = clamp01(parseFloat(volRange.value) || 0);
            originalVideo.volume = v;
            originalVideo.muted = v === 0;
            updateRangeFill(volRange);
            updateVolumeIcon(v);
        });

        volIcon.addEventListener('click', () => {
            originalVideo.muted = !originalVideo.muted;
            volRange.value = originalVideo.muted ? '0' : String(originalVideo.volume || 1);
            updateRangeFill(volRange);
            updateVolumeIcon();
        });

        pipBtn.addEventListener('click', async () => {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else if (document.pictureInPictureEnabled && !originalVideo.disablePictureInPicture) {
                    await originalVideo.requestPictureInPicture();
                }
            } catch (e) { }
        });

        async function lockLandscapeIfPossible() {
            if (screen.orientation && screen.orientation.lock) {
                try {
                    await screen.orientation.lock('landscape');
                } catch { }
            }
        }

        async function unlockOrientationIfPossible() {
            if (screen.orientation && screen.orientation.unlock) {
                try {
                    screen.orientation.unlock();
                } catch { }
            }
        }

        async function enterFullscreen() {
            if (wrapper.requestFullscreen) {
                await wrapper.requestFullscreen({ navigationUI: 'hide' });
                if (mobile) await lockLandscapeIfPossible();
            } else if (originalVideo.webkitEnterFullscreen) {
                originalVideo.webkitEnterFullscreen();
            }
        }

        async function exitFullscreen() {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                await unlockOrientationIfPossible();
            }
        }

        fsBtn.onclick = async () => {
            if (!document.fullscreenElement) await enterFullscreen();
            else await exitFullscreen();
        };

        document.addEventListener('fullscreenchange', async () => {
            const inFs = !!document.fullscreenElement;
            fsBtn.innerHTML = `<i class="ph ${inFs ? 'ph-arrows-in-simple' : 'ph-arrows-out-simple'}"></i>`;
            if (inFs && mobile) await lockLandscapeIfPossible();
            if (!inFs) await unlockOrientationIfPossible();
        });

        castBtn.addEventListener('click', async () => {
            const currentUrl = hls && hls.url ? hls.url : (originalVideo.currentSrc || originalVideo.src);
            const contentType = guessTypeFromUrl(currentUrl) || 'video/mp4';
            try {
                if (window.cast && cast.framework && castFrameworkReady) {
                    const ctx = cast.framework.CastContext.getInstance();
                    const session = await ctx.requestSession();
                    const mediaInfo = new chrome.cast.media.MediaInfo(currentUrl, contentType);
                    const request = new chrome.cast.media.LoadRequest(mediaInfo);
                    session.loadMedia(request);
                    return;
                }
                if (window.chrome && window.chrome.cast) {
                    window.chrome.cast.requestSession(session => {
                        const mediaInfo = new window.chrome.cast.media.MediaInfo(currentUrl, contentType);
                        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
                        request.autoplay = true;
                        try {
                            request.currentTime = Math.max(0, originalVideo?.currentTime || 0);
                        } catch { }
                        session.loadMedia(request);
                    });
                    return;
                }
            } catch (e) { }
        });

        const HOLD_THRESHOLD = 220;
        let spaceHoldTimer = null;
        let spaceEngaged = false;
        let wasPausedBeforeSpace = false;

        function isTypingTarget() {
            const ae = document.activeElement;
            if (!ae) return false;
            const tag = ae.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select' || ae.isContentEditable;
        }

        wrapper.tabIndex = 0;

        document.addEventListener('keydown', async (e) => {
            if (isTypingTarget()) return;
            if (e.code === 'Space') {
                if (e.repeat) {
                    e.preventDefault();
                    return;
                }
                spaceEngaged = false;
                wasPausedBeforeSpace = originalVideo.paused;
                clearTimeout(spaceHoldTimer);
                spaceHoldTimer = setTimeout(() => {
                    spaceEngaged = true;
                    if (wasPausedBeforeSpace) originalVideo.play().catch(() => { });
                    originalVideo.playbackRate = 2;
                    showTopMsg('2x', 'ph-fast-forward');
                }, HOLD_THRESHOLD);
                e.preventDefault();
                return;
            }
            if (e.code === 'KeyF') {
                if (!document.fullscreenElement) await enterFullscreen();
                else await exitFullscreen();
                e.preventDefault();
                return;
            }
            if (e.code === 'KeyM') {
                originalVideo.muted = !originalVideo.muted;
                e.preventDefault();
                return;
            }
            if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
                const delta = e.code === 'ArrowUp' ? 0.05 : -0.05;
                const v = Math.max(0, Math.min(1, (originalVideo.muted ? 0 : originalVideo.volume) + delta));
                originalVideo.muted = v === 0;
                originalVideo.volume = v;
                const pct = Math.round((originalVideo.muted ? 0 : originalVideo.volume) * 100);
                showTopVolume(pct);
                e.preventDefault();
                return;
            }
            if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
                const shift = e.code === 'ArrowRight' ? 5 : -5;
                originalVideo.currentTime = Math.max(0, Math.min(originalVideo.duration || 0, originalVideo.currentTime + shift));
                showSeekToast(e.code === 'ArrowRight' ? 'right' : 'left');
                e.preventDefault();
                return;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                clearTimeout(spaceHoldTimer);
                if (spaceEngaged) {
                    spaceEngaged = false;
                    originalVideo.playbackRate = baseRate;
                    if (wasPausedBeforeSpace) originalVideo.pause();
                } else {
                    if (originalVideo.paused) originalVideo.play();
                    else originalVideo.pause();
                }
                hideToastImmediate(toastTop, 'top');
                e.preventDefault();
            }
        });

        videoWrap.addEventListener('click', (e) => {
            if (isMobileCoarse) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            const path = e.composedPath ? e.composedPath() : [];
            if (path.includes(controls) || path.includes(menu)) return;
            togglePlay();
        });

        playBtn.addEventListener('click', togglePlay);
        bigPlay.addEventListener('click', togglePlay);

        originalVideo.addEventListener('play', () => {
            setPlayIcon();
            lastActivityTs = Date.now();
            showUI();
        });

        originalVideo.addEventListener('pause', () => {
            setPlayIcon();
            clearTimeout(uiHideTimer);
            wrapper.classList.add('ui-show');
            wrapper.classList.remove('ui-hide');
        });

        originalVideo.addEventListener('timeupdate', () => {
            updateTime();
            updatePlayed();
        });

        originalVideo.addEventListener('durationchange', updateTime);

        originalVideo.addEventListener('progress', () => {
            if (!hls) setBufferedFromTimeRanges(originalVideo.buffered);
        });

        originalVideo.addEventListener('waiting', () => {
            loader.style.display = 'flex';
        });

        originalVideo.addEventListener('canplay', () => {
            loader.style.display = 'none';
        });

        originalVideo.addEventListener('seeking', () => {
            loader.style.display = 'flex';
            cancelPrefetchAll();
        });

        originalVideo.addEventListener('seeked', () => {
            loader.style.display = 'none';
        });

        ['mousemove', 'touchstart', 'pointermove', 'keydown'].forEach(evt => {
            wrapper.addEventListener(evt, () => {
                lastActivityTs = Date.now();
                showUI();
            }, { passive: true });
        });

        wrapper.addEventListener('mouseleave', () => {
            if (!originalVideo.paused) {
                wrapper.classList.remove('ui-show');
                if (!menu.hidden) {
                    menu.hidden = true;
                    settingsBtn.setAttribute('aria-expanded', 'false');
                }
                wrapper.classList.add('ui-hide');
            }
        });

        if (isMobileCoarse) {
            const TAP_DELAY_MS = 280;
            const HOLD_TOUCH_MS = 250;
            let tapTimer = null;
            let holdTimer = null;
            let holdActive = false;

            function getTouchPoint(e) {
                const t = e.changedTouches ? e.changedTouches[0] : (e.touches ? e.touches[0] : null);
                return t ? { x: t.clientX, y: t.clientY } : null;
            }

            videoWrap.addEventListener('touchstart', (e) => {
                const path = e.composedPath ? e.composedPath() : [];
                if (path.includes(controls) || path.includes(menu)) return;
                const now = performance.now();
                const pt = getTouchPoint(e);
                if (!pt) return;
                clearTimeout(holdTimer);
                holdTimer = setTimeout(() => {
                    holdActive = true;
                    if (tapTimer) {
                        clearTimeout(tapTimer);
                        tapTimer = null;
                    }
                    originalVideo.playbackRate = 2;
                    showTopMsg('2x', 'ph-fast-forward');
                }, HOLD_TOUCH_MS);
                if (!tapTimer) {
                    tapTimer = setTimeout(() => {
                        tapTimer = null;
                        if (!holdActive && !lastTapWasDouble) {
                            if (originalVideo.paused) originalVideo.play();
                            else originalVideo.pause();
                            suppressClickUntil = performance.now() + 350;
                        }
                    }, TAP_DELAY_MS);
                } else {
                    clearTimeout(tapTimer);
                    tapTimer = null;
                    const rect = videoWrap.getBoundingClientRect();
                    const onRight = (pt.x - rect.left) > (rect.width / 2);
                    const shift = onRight ? 5 : -5;
                    originalVideo.currentTime = Math.max(0, Math.min(originalVideo.duration || 0, originalVideo.currentTime + shift));
                    showSeekToast(onRight ? 'right' : 'left');
                    suppressClickUntil = now + 800;
                    lastTapWasDouble = true;
                    setTimeout(() => { lastTapWasDouble = false; }, 850);
                }
                if (e.cancelable) e.preventDefault();
                clearTimeout(holdTimer);
                holdActive = false;
            }, { passive: false });

            videoWrap.addEventListener('touchend', (e) => {
                clearTimeout(holdTimer);
                if (holdActive) {
                    holdActive = false;
                    hideToastImmediate(toastTop, 'top');
                    originalVideo.playbackRate = baseRate;
                }
            }, { passive: true });

            videoWrap.addEventListener('touchcancel', () => {
                clearTimeout(holdTimer);
                if (holdActive) {
                    holdActive = false;
                    hideToastImmediate(toastTop, 'top');
                    originalVideo.playbackRate = baseRate;
                }
            }, { passive: true });

            videoWrap.addEventListener('click', (e) => {
                if ((performance.now() < suppressClickUntil) || lastTapWasDouble) {
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                }
            }, true);
        }

        setPlayIcon();
        updateTime();
        updatePlayed();
        showUI();

        const prefetch = { enable: true, offset: 2, count: 3, controllers: new Map() };

        function cancelPrefetchAll() {
            for (const [, ctrl] of prefetch.controllers) {
                try {
                    ctrl.abort();
                } catch { }
            }
            prefetch.controllers.clear();
        }

        function setBufferedFromTimeRanges(ranges, totalDuration) {
            try {
                while (progressBuffered.firstChild) progressBuffered.removeChild(progressBuffered.firstChild);
                const dur = (Number.isFinite(totalDuration) && totalDuration > 0)
                    ? totalDuration
                    : (originalVideo && Number.isFinite(originalVideo.duration) ? originalVideo.duration : 0);
                if (!dur || !isFinite(dur)) return;
                const pairs = [];
                if (ranges && typeof ranges.length === 'number' && typeof ranges.start === 'function') {
                    for (let i = 0; i < ranges.length; i++) {
                        pairs.push([ranges.start(i), ranges.end(i)]);
                    }
                } else if (Array.isArray(ranges)) {
                    for (const r of ranges) {
                        if (Array.isArray(r) && r.length >= 2) {
                            const [s, e] = r;
                            if (Number.isFinite(s) && Number.isFinite(e)) pairs.push([s, e]);
                        }
                    }
                } else {
                    return;
                }
                const EPS = 0.001;
                const merged = pairs
                    .map(([s, e]) => [Math.max(0, Math.min(dur, s)), Math.max(0, Math.min(dur, e))])
                    .filter(([s, e]) => e > s)
                    .sort((a, b) => a[0] - b[0])
                    .reduce((acc, [s, e]) => {
                        const last = acc[acc.length - 1];
                        if (last && s <= last[1] + EPS) {
                            last[1] = Math.max(last[1], e);
                        } else {
                            acc.push([s, e]);
                        }
                        return acc;
                    }, []);
                for (const [s, e] of merged) {
                    const leftPct = (s / dur) * 100;
                    const widthPct = Math.max(0, ((e - s) / dur) * 100);
                    if (widthPct <= 0) continue;
                    const d = document.createElement('div');
                    d.className = 'plyrty-buffer-chunk';
                    d.style.borderRadius = 'inherit';
                    d.style.position = 'absolute';
                    d.style.left = `${leftPct}%`;
                    d.style.width = `${widthPct}%`;
                    d.style.top = '0';
                    d.style.bottom = '0';
                    d.style.backgroundColor = '#ffffff4d';
                    d.style.pointerEvents = 'none';
                    progressBuffered.appendChild(d);
                }
            } catch (e) {
                if (window.logger && logger.debug) logger.debug('setBufferedFromTimeRanges error', e);
            }
        }

        function destroyEngines() {
            try {
                if (hls && typeof hls.destroy === 'function') hls.destroy();
            } catch { }
            hls = null;
            try {
                const dp = originalVideo.dash;
                if (dp && typeof dp.reset === 'function') dp.reset();
            } catch { }
            try {
                originalVideo.dash = undefined;
            } catch { }
        }

        function loadNative(url, type, opt) {
            destroyEngines();
            const u = typeof window.plyrtyUrlReplace === 'function' ? window.plyrtyUrlReplace(url, originalVideo) : url;
            originalVideo.src = u;
            originalVideo.load();
            if (Number.isFinite(opt.resumeTime)) {
                const t = opt.resumeTime;
                const set = () => {
                    try {
                        originalVideo.currentTime = t;
                    } catch { }
                };
                if (originalVideo.readyState >= 1) {
                    set();
                } else {
                    originalVideo.addEventListener('loadedmetadata', set, { once: true });
                }
            }
            if (opt.autoplay) originalVideo.play().catch(() => { });
        }

        function loadHls(url, opt) {
            destroyEngines();
            const nativeM3U8 = canPlayType(originalVideo, 'application/x-mpegURL') || canPlayType(originalVideo, 'application/vnd.apple.mpegurl');
            if (nativeM3U8) {
                loadNative(url, 'application/x-mpegURL', opt);
                return;
            }
            importHls().then(HlsClass => {
                hls = new HlsClass({
                    enableWorker: true,
                    lowLatencyMode: true,
                    fetchSetup: (ctx, init) => {
                        try {
                            if (ctx && ctx.url && typeof window.plyrtyUrlReplace === 'function') {
                                ctx.url = window.plyrtyUrlReplace(ctx.url, originalVideo);
                            }
                        } catch { }
                        return init;
                    }
                });
                setupHlsBufferHandlers(hls);
                hls.attachMedia(originalVideo);
                hls.on(HlsClass.Events.MEDIA_ATTACHED, () => {
                    try {
                        hls.loadSource(typeof window.plyrtyUrlReplace === 'function' ? window.plyrtyUrlReplace(url, originalVideo) : url);
                    } catch { }
                });
                hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
                    try {
                        if (Number.isFinite(opt.resumeTime)) {
                            const t = opt.resumeTime;
                            const set = () => {
                                try {
                                    originalVideo.currentTime = t;
                                } catch { }
                            };
                            if (originalVideo.readyState >= 1) {
                                set();
                            } else {
                                originalVideo.addEventListener('loadedmetadata', set, { once: true });
                            }
                        }
                        if (opt.autoplay) originalVideo.play().catch(() => { });
                    } catch { }
                });
            });
        }

        function loadDash(url, opt) {
            destroyEngines();
            const meta0 = __plyrtyMeta.get(originalVideo) || {};
            const isData = typeof url === 'string' && url.startsWith('data:');
            const isMaster = typeof url === 'string' && /\.mpd(\?|#|$)/i.test(url) && !isData;
            __plyrtyMeta.set(originalVideo, {
                ...meta0,
                currentMpdUrl: url,
                masterDashUrl: meta0.masterDashUrl || (isMaster ? url : meta0.masterDashUrl)
            });
            const rewrite = typeof window.plyrtyUrlReplace === 'function' ? (u) => window.plyrtyUrlReplace(u, originalVideo) : (u) => u;
            try {
                const cur = __plyrtyMeta.get(originalVideo) || {};
                __plyrtyMeta.set(originalVideo, { ...cur, lastDashUrl: url });
            } catch { }
            const start = Number.isFinite(opt.resumeTime) ? opt.resumeTime : undefined;
            const dp = initDashIfAvailable(originalVideo, url, rewrite);
            try {
                if (dp?.initialize) dp.initialize(originalVideo, rewrite(url), false, start);
            } catch { }
            try {
                if (dp && window.dashjs) {
                    const E = window.dashjs.MediaPlayer.events;
                    if (opt.forceHeight) {
                        try {
                            dp.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
                        } catch { }
                        const setQ = () => dashSelectHeight(dp, opt.forceHeight);
                        dp.on(E.MANIFEST_LOADED, setQ);
                        dp.on(E.STREAM_INITIALIZED, setQ);
                    }
                    if (start !== undefined) {
                        dp.on(E.PLAYBACK_METADATA_LOADED, () => {
                            try {
                                originalVideo.currentTime = start;
                            } catch { }
                        });
                        dp.on(E.STREAM_INITIALIZED, () => {
                            try {
                                if (Math.abs((originalVideo.currentTime || 0) - start) > 0.25) {
                                    originalVideo.currentTime = start;
                                }
                            } catch { }
                        });
                    }
                }
            } catch { }
            if (opt.autoplay) originalVideo.play().catch(() => { });
        }

        function loadSource(url, type, opt) {
            const t = (type || guessTypeFromUrl(url)).toLowerCase();
            if (t.includes('dash') || t.endsWith('mpd')) {
                loadDash(url, opt);
                return;
            }
            if (t.includes('mpegurl') || t.includes('m3u8')) {
                loadHls(url, opt);
                return;
            }
            loadNative(url, t, opt);
        }

        function pickInitialSource(list, video) {
            if (list.length > 0) return list[0];
            const url = video.currentSrc || video.src;
            return { url, type: guessTypeFromUrl(url), res: 0 };
        }

        function guessTypeFromUrl(url) {
            if (!url) return '';
            const u = (url.split?.('?')[0] || '').split?.('#')[0].toLowerCase() || '';
            if (u.endsWith('.m3u8')) return 'application/x-mpegURL';
            if (u.endsWith('.mpd')) return 'application/dash+xml';
            if (u.endsWith('.mp4')) return 'video/mp4';
            if (u.endsWith('.webm')) return 'video/webm';
            if (u.endsWith('.ogg')) return 'video/ogg';
            return 'video/mp4';
        }

        function canPlayType(video, mimeType) {
            try {
                const result = video.canPlayType(mimeType);
                return result === 'probably' || result === 'maybe';
            } catch {
                return false;
            }
        }

        const api = {
            setSource: (url, type, resolutions) => {
                return new Promise((resolve, reject) => {
                    try {
                        const t = type || guessTypeFromUrl(url);
                        const opt = { autoplay: !originalVideo.paused, resumeTime: 0 };
                        if (resolutions) {
                            const meta = __plyrtyMeta.get(originalVideo) || {};
                            __plyrtyMeta.set(originalVideo, { ...meta, _customMap: resolutions });
                        }
                        loadSource(url, t, opt);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            },
            play: () => originalVideo.play(),
            pause: () => originalVideo.pause(),
            getCurrentTime: () => originalVideo.currentTime,
            setCurrentTime: (t) => { originalVideo.currentTime = t; },
            getDuration: () => getDurationSafe(),
            getVolume: () => originalVideo.volume,
            setVolume: (v) => { originalVideo.volume = clamp01(v); },
            isMuted: () => originalVideo.muted,
            setMuted: (m) => { originalVideo.muted = !!m; },
            destroy: () => {
                try {
                    destroyEngines();
                    wrapper.remove();
                } catch { }
            }
        };

        __plyrtyMap.set(originalVideo, api);

        return api;
    }

    function initDashIfAvailable(videoEl, mpdUrl, rewrite) {
        if (!window.dashjs || !window.dashjs.MediaPlayer) return null;
        try {
            if (videoEl.dash) return videoEl.dash;
            const dp = window.dashjs.MediaPlayer().create();
            videoEl.dash = dp;
            dp.updateSettings({
                streaming: {
                    abr: {
                        autoSwitchBitrate: { video: true, audio: true }
                    },
                    buffer: {
                        fastSwitchEnabled: true
                    }
                }
            });
            if (mpdUrl) {
                const u = typeof rewrite === 'function' ? rewrite(mpdUrl) : mpdUrl;
                dp.initialize(videoEl, u, false);
            }
            return dp;
        } catch (e) {
            logger.error('initDashIfAvailable error', e);
            return null;
        }
    }
})();
