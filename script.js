/**
 * STUDIO.FX - High-Performance 300-Frame Dynamic Motion Engine & Portfolio Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configuration & Constants
  const TOTAL_FRAMES = 300;
  const FRAME_DIR = './ezgif-21fd47b40c28ca4c-png-split/';

  // Helper to format frame numbers like 'ezgif-frame-001.png'
  function getFrameUrl(index) {
    const paddedNum = String(index).padStart(3, '0');
    return `${FRAME_DIR}ezgif-frame-${paddedNum}.png`;
  }

  /* ==========================================================================
     1. FRAME SEQUENCE ENGINE (Preloading & Memory Caching)
     ========================================================================== */
  class FrameSequenceEngine {
    constructor(totalFrames) {
      this.totalFrames = totalFrames;
      this.images = new Array(totalFrames);
      this.loadedCount = 0;
      this.isFullyLoaded = false;
      this.onProgressCallbacks = [];
      this.onCompleteCallbacks = [];

      this.init();
    }

    init() {
      // First, load initial batch (30 frames) fast so user can interact immediately
      const INITIAL_BATCH = 30;

      let initialLoaded = 0;
      for (let i = 1; i <= INITIAL_BATCH; i++) {
        this.loadImage(i, () => {
          initialLoaded++;
          this.notifyProgress();
          if (initialLoaded === INITIAL_BATCH) {
            // Start background loading for remaining frames
            this.loadRemainingFrames();
          }
        });
      }
    }

    loadRemainingFrames() {
      // Load remaining frames asynchronously
      for (let i = 31; i <= this.totalFrames; i++) {
        // Stagger slightly using requestAnimationFrame to prevent network spike
        setTimeout(() => {
          this.loadImage(i, () => {
            this.notifyProgress();
          });
        }, (i - 31) * 12);
      }
    }

    loadImage(index, callback) {
      const img = new Image();
      img.src = getFrameUrl(index);
      img.onload = () => {
        this.images[index - 1] = img;
        this.loadedCount++;
        if (callback) callback();
      };
      img.onerror = () => {
        console.warn(`Failed to load frame ${index}`);
        this.loadedCount++;
        if (callback) callback();
      };
    }

    notifyProgress() {
      const percent = Math.floor((this.loadedCount / this.totalFrames) * 100);
      this.onProgressCallbacks.forEach(cb => cb(this.loadedCount, this.totalFrames, percent));

      if (this.loadedCount >= this.totalFrames && !this.isFullyLoaded) {
        this.isFullyLoaded = true;
        this.onCompleteCallbacks.forEach(cb => cb());
      }
    }

    onProgress(cb) {
      this.onProgressCallbacks.push(cb);
    }

    onComplete(cb) {
      this.onCompleteCallbacks.push(cb);
    }

    getImage(index) {
      // 1-indexed safely clamped
      const idx = Math.max(0, Math.min(this.totalFrames - 1, Math.round(index) - 1));
      if (this.images[idx]) return this.images[idx];

      // Fallback to nearest loaded frame backward or forward
      for (let i = idx - 1; i >= 0; i--) {
        if (this.images[i]) return this.images[i];
      }
      for (let i = idx + 1; i < this.totalFrames; i++) {
        if (this.images[i]) return this.images[i];
      }
      return null;
    }
  }

  // Instantiate Engine
  const engine = new FrameSequenceEngine(TOTAL_FRAMES);

  /* ==========================================================================
     2. CANVAS RENDER CONTROLLER
     ========================================================================== */
  class CanvasMotionPlayer {
    constructor(engine, options = {}) {
      this.engine = engine;
      this.heroCanvas = document.getElementById('heroCanvas');
      this.studioCanvas = document.getElementById('studioCanvas');

      this.heroCtx = this.heroCanvas ? this.heroCanvas.getContext('2d') : null;
      this.studioCtx = this.studioCanvas ? this.studioCanvas.getContext('2d') : null;

      // Playback & Smooth Scroll State
      this.currentFrame = 1;
      this.targetFrame = 1;
      this.smoothScrollY = 0;
      this.targetScrollY = 0;
      this.hasUserScrolled = false;
      this.idleIntroAlpha = 0.2;
      this.heroCard = null;
      this.isPlaying = false; // Do not autoplay; controlled by scroll
      this.playDirection = 1; // 1 = forward, -1 = reverse
      this.baseFps = 30;
      this.speedMultiplier = 1.0;
      this.loopMode = 'scroll';
      this.isScrollSync = true;

      // Image Filters & Adjustments
      this.activeFilter = 'normal';
      this.brightness = 100;
      this.contrast = 100;
      this.saturate = 100;
      this.blur = 0;

      // Offscreen Canvas for Double Buffering & Smooth Filters
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 1280;
      this.offscreenCanvas.height = 720;
      this.offCtx = this.offscreenCanvas.getContext('2d');

      // Animation Loop Timing
      this.lastFrameTime = performance.now();
      this.animationFrameId = null;

      this.setupDOMReferences();
      this.bindEvents();
      this.startLoop();
      this.handleScrollSync();

      // Gentle fallback intro reveal if user remains stationary on initial load
      setTimeout(() => {
        if (!this.hasUserScrolled && (window.scrollY || 0) < 10) {
          const idleInterval = setInterval(() => {
            if (this.hasUserScrolled || (window.scrollY || 0) > 10) {
              clearInterval(idleInterval);
              return;
            }
            if (this.idleIntroAlpha < 0.9) {
              this.idleIntroAlpha += 0.035;
            } else {
              clearInterval(idleInterval);
            }
          }, 30);
        }
      }, 700);
    }

    setupDOMReferences() {
      // Hero Elements
      this.heroScrubber = document.getElementById('heroScrubber');
      this.heroFrameCount = document.getElementById('heroFrameCount');
      this.heroPlayPauseBtn = document.getElementById('heroPlayPauseBtn');
      this.heroScrollModeBtn = document.getElementById('heroScrollModeBtn');
      this.heroPlayStateBadge = document.getElementById('hero-play-state');
      this.canvasLoader = document.getElementById('canvasLoader');
      this.loadPercent = document.getElementById('loadPercent');
      this.progressFill = document.getElementById('progressFill');

      // Studio Elements
      this.studioScrubber = document.getElementById('studioScrubber');
      this.studioFrameNumber = document.getElementById('studioFrameNumber');
      this.timecodeText = document.getElementById('timecodeText');
      this.btnStudioPlay = document.getElementById('btnStudioPlay');
      this.btnPrevFrame = document.getElementById('btnPrevFrame');
      this.btnNextFrame = document.getElementById('btnNextFrame');
      this.btnReverse = document.getElementById('btnReverse');
      this.btnLoopMode = document.getElementById('btnLoopMode');
      this.btnScrollSync = document.getElementById('btnScrollSync');
      this.speedSegments = document.querySelectorAll('#speedSegmented .segment');

      // Filter & Adjustments Inputs
      this.filterButtons = document.querySelectorAll('.filter-btn');
      this.sliderBrightness = document.getElementById('sliderBrightness');
      this.sliderContrast = document.getElementById('sliderContrast');
      this.sliderSaturate = document.getElementById('sliderSaturate');
      this.sliderBlur = document.getElementById('sliderBlur');
      this.valBrightness = document.getElementById('valBrightness');
      this.valContrast = document.getElementById('valContrast');
      this.valSaturate = document.getElementById('valSaturate');
      this.valBlur = document.getElementById('valBlur');
      this.btnResetFilters = document.getElementById('btnResetFilters');
      this.stageViewfinder = document.getElementById('stageViewfinder');
    }

    bindEvents() {
      // Engine Loader Updates
      this.engine.onProgress((loaded, total, percent) => {
        if (this.loadPercent) this.loadPercent.textContent = `${percent}%`;
        if (this.progressFill) this.progressFill.style.width = `${percent}%`;

        // Hide loader when first 30 frames or 15% loaded
        if (percent >= 10 && this.canvasLoader && this.canvasLoader.style.display !== 'none') {
          this.canvasLoader.style.opacity = '0';
          setTimeout(() => {
            if (this.canvasLoader) this.canvasLoader.style.display = 'none';
          }, 400);
        }
      });

      // Hero Scrubbing
      if (this.heroScrubber) {
        this.heroScrubber.addEventListener('input', (e) => {
          this.setFrame(parseInt(e.target.value, 10));
        });
      }

      // Studio Scrubbing
      if (this.studioScrubber) {
        this.studioScrubber.addEventListener('input', (e) => {
          this.setFrame(parseInt(e.target.value, 10));
        });
      }

      // Play / Pause Buttons
      if (this.heroPlayPauseBtn) {
        this.heroPlayPauseBtn.addEventListener('click', () => this.togglePlay());
      }
      if (this.btnStudioPlay) {
        this.btnStudioPlay.addEventListener('click', () => this.togglePlay());
      }

      // Frame Stepper
      if (this.btnPrevFrame) {
        this.btnPrevFrame.addEventListener('click', () => {
          this.pause();
          this.stepFrame(-1);
        });
      }
      if (this.btnNextFrame) {
        this.btnNextFrame.addEventListener('click', () => {
          this.pause();
          this.stepFrame(1);
        });
      }

      // Reverse Direction Toggle
      if (this.btnReverse) {
        this.btnReverse.addEventListener('click', () => {
          this.playDirection *= -1;
          this.btnReverse.classList.toggle('active', this.playDirection === -1);
        });
      }

      // Speed Segmented Buttons
      this.speedSegments.forEach(btn => {
        btn.addEventListener('click', () => {
          this.speedSegments.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.speedMultiplier = parseFloat(btn.dataset.speed);
        });
      });

      // Loop / Bounce Mode
      if (this.btnLoopMode) {
        this.btnLoopMode.addEventListener('click', () => {
          if (this.loopMode === 'loop') {
            this.loopMode = 'bounce';
            this.btnLoopMode.classList.add('active');
            this.btnLoopMode.innerHTML = '<i class="fa-solid fa-right-left"></i> Bounce';
          } else {
            this.loopMode = 'loop';
            this.btnLoopMode.classList.remove('active');
            this.btnLoopMode.innerHTML = '<i class="fa-solid fa-repeat"></i> Loop';
          }
        });
      }

      // Scroll Sync Mode Toggle
      if (this.btnScrollSync) {
        this.btnScrollSync.addEventListener('click', () => this.toggleScrollSync());
      }
      if (this.heroScrollModeBtn) {
        this.heroScrollModeBtn.addEventListener('click', () => this.toggleScrollSync());
      }

      // Window Scroll Event for Scroll Sync
      window.addEventListener('scroll', () => {
        if (this.isScrollSync) {
          this.handleScrollSync();
        }
      });

      // Interactive Drag Scrubbing on Studio Viewfinder
      if (this.stageViewfinder) {
        let isDragging = false;
        let startX = 0;
        let startFrame = 1;

        const onStart = (clientX) => {
          isDragging = true;
          startX = clientX;
          startFrame = this.currentFrame;
          this.pause();
        };

        const onMove = (clientX) => {
          if (!isDragging) return;
          const deltaX = clientX - startX;
          const frameDelta = Math.round(deltaX / 3);
          this.setFrame(startFrame + frameDelta);
        };

        const onEnd = () => { isDragging = false; };

        this.stageViewfinder.addEventListener('mousedown', (e) => onStart(e.clientX));
        window.addEventListener('mousemove', (e) => onMove(e.clientX));
        window.addEventListener('mouseup', onEnd);

        this.stageViewfinder.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
        window.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
        window.addEventListener('touchend', onEnd);
      }

      // Fullscreen View
      const toggleFullscreen = (canvasEl) => {
        if (!document.fullscreenElement) {
          if (canvasEl.requestFullscreen) canvasEl.requestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
      };

      const heroFsBtn = document.getElementById('heroFullscreenBtn');
      const studioFsBtn = document.getElementById('btnStudioFullscreen');

      if (heroFsBtn && this.heroCanvas) {
        heroFsBtn.addEventListener('click', () => toggleFullscreen(this.heroCanvas));
      }
      if (studioFsBtn && this.studioCanvas) {
        studioFsBtn.addEventListener('click', () => toggleFullscreen(this.studioCanvas));
      }

      // Filter Button Controls
      this.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.filterButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeFilter = btn.dataset.filter;
          this.render();
        });
      });

      // Adjustment Sliders
      const updateAdjustments = () => {
        this.brightness = parseInt(this.sliderBrightness.value, 10);
        this.contrast = parseInt(this.sliderContrast.value, 10);
        this.saturate = parseInt(this.sliderSaturate.value, 10);
        this.blur = parseFloat(this.sliderBlur.value);

        if (this.valBrightness) this.valBrightness.textContent = `${this.brightness}%`;
        if (this.valContrast) this.valContrast.textContent = `${this.contrast}%`;
        if (this.valSaturate) this.valSaturate.textContent = `${this.saturate}%`;
        if (this.valBlur) this.valBlur.textContent = `${this.blur}px`;

        this.render();
      };

      if (this.sliderBrightness) this.sliderBrightness.addEventListener('input', updateAdjustments);
      if (this.sliderContrast) this.sliderContrast.addEventListener('input', updateAdjustments);
      if (this.sliderSaturate) this.sliderSaturate.addEventListener('input', updateAdjustments);
      if (this.sliderBlur) this.sliderBlur.addEventListener('input', updateAdjustments);

      if (this.btnResetFilters) {
        this.btnResetFilters.addEventListener('click', () => {
          this.sliderBrightness.value = 100;
          this.sliderContrast.value = 100;
          this.sliderSaturate.value = 100;
          this.sliderBlur.value = 0;
          this.activeFilter = 'normal';
          this.filterButtons.forEach(b => b.classList.remove('active'));
          if (this.filterButtons[0]) this.filterButtons[0].classList.add('active');
          updateAdjustments();
        });
      }
    }

    togglePlay() {
      this.isPlaying = !this.isPlaying;
      this.updatePlayStateUI();
    }

    pause() {
      this.isPlaying = false;
      this.updatePlayStateUI();
    }

    play() {
      this.isPlaying = true;
      this.updatePlayStateUI();
    }

    updatePlayStateUI() {
      const playIcon = this.isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
      if (this.heroPlayPauseBtn) this.heroPlayPauseBtn.innerHTML = playIcon;
      if (this.btnStudioPlay) this.btnStudioPlay.innerHTML = playIcon;
      if (this.heroPlayStateBadge) {
        this.heroPlayStateBadge.textContent = this.isPlaying ? 'Auto-Playing' : 'Paused';
        this.heroPlayStateBadge.style.background = this.isPlaying ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255, 255, 255, 0.1)';
      }
    }

    toggleScrollSync() {
      this.isScrollSync = !this.isScrollSync;
      if (this.btnScrollSync) this.btnScrollSync.classList.toggle('active', this.isScrollSync);
      if (this.heroScrollModeBtn) this.heroScrollModeBtn.classList.toggle('active', this.isScrollSync);

      if (this.isScrollSync) {
        this.pause();
        this.handleScrollSync();
      }
    }

    handleScrollSync() {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      this.targetScrollY = scrollY;
      if (scrollY > 5) {
        this.hasUserScrolled = true;
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) {
        this.targetFrame = 1;
        return;
      }

      const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
      this.targetFrame = Math.min(TOTAL_FRAMES, Math.max(1, Math.round(progress * (TOTAL_FRAMES - 1)) + 1));
    }

    setFrame(index) {
      let target = index;
      if (target > TOTAL_FRAMES) {
        if (this.loopMode === 'bounce') {
          this.playDirection = -1;
          target = TOTAL_FRAMES - 1;
        } else {
          target = 1;
        }
      } else if (target < 1) {
        if (this.loopMode === 'bounce') {
          this.playDirection = 1;
          target = 2;
        } else {
          target = TOTAL_FRAMES;
        }
      }

      this.currentFrame = target;
      this.updateUI();
      this.render();
    }

    stepFrame(delta) {
      this.setFrame(this.currentFrame + delta);
    }

    updateUI() {
      const intFrame = Math.round(this.currentFrame);
      const paddedNum = String(intFrame).padStart(3, '0');

      if (this.heroScrubber) this.heroScrubber.value = intFrame;
      if (this.studioScrubber) this.studioScrubber.value = intFrame;

      if (this.heroFrameCount) this.heroFrameCount.textContent = `Frame: ${paddedNum} / ${TOTAL_FRAMES}`;
      if (this.studioFrameNumber) this.studioFrameNumber.textContent = paddedNum;

      // Calculate timecode based on 30fps
      if (this.timecodeText) {
        const currentSecs = (intFrame / 30).toFixed(1);
        const totalSecs = (TOTAL_FRAMES / 30).toFixed(1);
        this.timecodeText.textContent = `00:00:${currentSecs.padStart(4, '0')} / 00:00:${totalSecs.padStart(4, '0')}`;
      }
    }

    getFilterString() {
      let cssFilter = `brightness(${this.brightness}%) contrast(${this.contrast}%) saturate(${this.saturate}%)`;
      if (this.blur > 0) cssFilter += ` blur(${this.blur}px)`;

      switch (this.activeFilter) {
        case 'cinematic':
          cssFilter += ' contrast(120%) sepia(20%)';
          break;
        case 'cyberpunk':
          cssFilter += ' hue-rotate(180deg) saturate(150%)';
          break;
        case 'noir':
          cssFilter += ' grayscale(100%) contrast(140%)';
          break;
        case 'sepia':
          cssFilter += ' sepia(90%) contrast(110%)';
          break;
        case 'emerald':
          cssFilter += ' hue-rotate(90deg) saturate(180%)';
          break;
      }
      return cssFilter;
    }

    render() {
      const img = this.engine.getImage(this.currentFrame);
      if (!img) return;

      // Clear offscreen canvas
      this.offCtx.clearRect(0, 0, 1280, 720);

      // Apply filters
      this.offCtx.filter = this.getFilterString();
      this.offCtx.drawImage(img, 0, 0, 1280, 720);

      // Render to active viewport canvases
      if (this.heroCtx) {
        this.heroCtx.clearRect(0, 0, 1280, 720);
        this.heroCtx.drawImage(this.offscreenCanvas, 0, 0);
      }
      if (this.studioCtx) {
        this.studioCtx.clearRect(0, 0, 1280, 720);
        this.studioCtx.drawImage(this.offscreenCanvas, 0, 0);
      }
    }

    startLoop() {
      const animate = (now) => {
        this.animationFrameId = requestAnimationFrame(animate);

        if (this.isScrollSync) {
          // 1. Smoothly interpolate scroll position
          const scrollDiff = this.targetScrollY - this.smoothScrollY;
          if (Math.abs(scrollDiff) > 0.05) {
            this.smoothScrollY += scrollDiff * 0.18;
          } else {
            this.smoothScrollY = this.targetScrollY;
          }

          // 2. Smoothly interpolate animation frame sequence
          const frameDiff = this.targetFrame - this.currentFrame;
          if (Math.abs(frameDiff) > 0.05) {
            this.currentFrame += frameDiff * 0.2;
            this.updateUI();
            this.render();
          } else if (this.currentFrame !== this.targetFrame) {
            this.currentFrame = this.targetFrame;
            this.updateUI();
            this.render();
          } else {
            this.render();
          }

          // 3. Smooth natural portrait motion (parallax & scale)
          if (this.heroCanvas) {
            const parallaxY = this.smoothScrollY * 0.055;
            const maxScroll = (document.documentElement.scrollHeight - window.innerHeight) || 1;
            const scrollRatio = Math.min(1, Math.max(0, this.smoothScrollY / maxScroll));
            const naturalScale = 1.03 - scrollRatio * 0.03;
            this.heroCanvas.style.transform = `translate3d(0, -${parallaxY.toFixed(2)}px, 0) scale(${naturalScale.toFixed(4)})`;
          }

          // 4. Smooth introduction card reveal as portrait moves
          if (!this.heroCard) {
            this.heroCard = document.querySelector('.hero-glass-card');
          }
          if (this.heroCard) {
            const y = this.smoothScrollY;
            let opacity = 0;
            let translateY = 32;
            let scale = 0.98;

            // Phase 1: Card reveals smoothly as user scrolls and portrait moves
            if (y < 220) {
              const p = Math.max(0, y / 220);
              const baseAlpha = this.idleIntroAlpha || 0.2;
              opacity = Math.min(1, baseAlpha + p * (1 - baseAlpha));
              translateY = 32 * (1 - Math.max(p, (baseAlpha - 0.2) / 0.7));
              scale = 0.98 + p * 0.02;
            }
            // Phase 2: Fully visible reading plateau
            else if (y <= 520) {
              opacity = 1;
              translateY = 0;
              scale = 1;
            }
            // Phase 3: Transition toward About section
            else if (y < 820) {
              const p = (y - 520) / 300;
              opacity = Math.max(0, 1 - p * 1.15);
              translateY = -p * 45;
              scale = 1 - p * 0.03;
            }
            // Phase 4: Outside hero section
            else {
              opacity = 0;
              translateY = -45;
              scale = 0.97;
            }

            this.heroCard.style.opacity = opacity.toFixed(3);
            this.heroCard.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
            this.heroCard.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
          }

          return;
        }

        if (!this.isPlaying) {
          this.render();
          return;
        }

        const interval = 1000 / (this.baseFps * this.speedMultiplier);
        const delta = now - this.lastFrameTime;

        if (delta >= interval) {
          this.lastFrameTime = now - (delta % interval);
          this.stepFrame(this.playDirection);
        }
      };

      this.animationFrameId = requestAnimationFrame(animate);
    }
  }

  // Initialize Motion Player Engine
  const motionPlayer = new CanvasMotionPlayer(engine);

  /* ==========================================================================
     3. WEBSITE INTERACTIVITY & NAVIGATION
     ========================================================================== */

  // Navbar Scroll Glass effect
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobile-toggle');
  const navLinks = document.getElementById('nav-links');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
      const isOpen = navLinks.classList.contains('mobile-open');
      mobileToggle.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });

    // Close menu when link clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        mobileToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    });
  }

  // Theme Accent Palette Selector
  const themeAccentBtn = document.getElementById('theme-accent-btn');
  const themes = ['', 'theme-purple', 'theme-emerald'];
  let currentThemeIdx = 0;

  if (themeAccentBtn) {
    themeAccentBtn.addEventListener('click', () => {
      document.body.classList.remove(themes[currentThemeIdx]);
      currentThemeIdx = (currentThemeIdx + 1) % themes.length;
      if (themes[currentThemeIdx]) {
        document.body.classList.add(themes[currentThemeIdx]);
      }
    });
  }

  // Active Navigation Highlight on Scroll
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      const navLink = document.querySelector(`.nav-links a[href*=${sectionId}]`);

      if (navLink) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          navLink.classList.add('active');
        } else {
          navLink.classList.remove('active');
        }
      }
    });
  });

  /* ==========================================================================
     4. FUNCTIONAL CONTACT FORM (EMAILJS & VALIDATION)
     ========================================================================== */
  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');

  // EmailJS Configuration
  const EMAILJS_CONFIG = {
    publicKey: 'ib4uvu9QQod4xRbtK',
    serviceId: 'service_wj4a99c',
    templateId: 'template_h146dqa',
    recipientEmail: 'shimaziyaansari321@gmail.com'
  };

  // Helper to safely obtain EmailJS instance
  const getEmailClient = () => window.emailjs || (typeof emailjs !== 'undefined' ? emailjs : null);

  // Helper to initialize EmailJS SDK
  const initEmailJS = () => {
    const client = getEmailClient();
    if (client && typeof client.init === 'function' && EMAILJS_CONFIG.publicKey && EMAILJS_CONFIG.publicKey !== 'YOUR_PUBLIC_KEY') {
      try {
        client.init({ publicKey: EMAILJS_CONFIG.publicKey });
        return true;
      } catch (err) {
        console.warn('EmailJS initialization note:', err);
      }
    }
    return false;
  };

  // Initialize EmailJS SDK if available on load
  initEmailJS();

  // Field validation helper
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  };

  const showStatus = (type, message, actionHtml = '') => {
    if (!formStatus) return;
    formStatus.className = `form-status status-${type}`;
    formStatus.innerHTML = `
      <div class="status-content">
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'loading' ? 'fa-spinner fa-spin' : 'fa-circle-exclamation'}"></i>
        <span>${message}</span>
      </div>
      ${actionHtml ? `<div class="status-action">${actionHtml}</div>` : ''}
    `;
    formStatus.style.display = 'block';
  };

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('name');
      const emailInput = document.getElementById('email');
      const subjectInput = document.getElementById('subject');
      const messageInput = document.getElementById('message');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const subject = subjectInput ? subjectInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      // Reset any previous status
      if (formStatus) formStatus.style.display = 'none';

      // Validation
      if (!name) {
        showStatus('error', 'Please enter your name.');
        if (nameInput) nameInput.focus();
        return;
      }

      if (!email || !validateEmail(email)) {
        showStatus('error', 'Please enter a valid email address (e.g. name@domain.com).');
        if (emailInput) emailInput.focus();
        return;
      }

      if (!subject) {
        showStatus('error', 'Please enter a subject.');
        if (subjectInput) subjectInput.focus();
        return;
      }

      if (!message) {
        showStatus('error', 'Please enter your message.');
        if (messageInput) messageInput.focus();
        return;
      }

      // Check if EmailJS credentials are configured
      const isConfigured = Boolean(
        EMAILJS_CONFIG.publicKey &&
        EMAILJS_CONFIG.publicKey !== 'YOUR_PUBLIC_KEY' &&
        EMAILJS_CONFIG.serviceId &&
        EMAILJS_CONFIG.serviceId !== 'YOUR_SERVICE_ID' &&
        EMAILJS_CONFIG.templateId &&
        EMAILJS_CONFIG.templateId !== 'YOUR_TEMPLATE_ID'
      );

      if (!isConfigured) {
        const mailtoUrl = `mailto:${EMAILJS_CONFIG.recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Hi Shimaziya,\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)}`;
        showStatus(
          'error',
          `Email service credentials are not configured. You can send your message directly via email:`,
          `<a href="${mailtoUrl}" class="btn btn-sm btn-primary" target="_blank"><i class="fa-solid fa-envelope"></i> Send via Email App</a>`
        );
        return;
      }

      // Check if EmailJS SDK is loaded
      const emailClient = getEmailClient();
      if (!emailClient) {
        const mailtoUrl = `mailto:${EMAILJS_CONFIG.recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Hi Shimaziya,\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)}`;
        showStatus(
          'error',
          `Email service SDK could not be loaded (possibly blocked by an ad-blocker or network issue). You can send your message directly via email:`,
          `<a href="${mailtoUrl}" class="btn btn-sm btn-primary" target="_blank"><i class="fa-solid fa-envelope"></i> Send via Email App</a>`
        );
        return;
      }

      // Send via EmailJS
      try {
        // Ensure SDK is initialized before send
        initEmailJS();

        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Sending...';
        if (btnIcon) btnIcon.className = 'fa-solid fa-spinner fa-spin';
        showStatus('loading', 'Sending your message to shimaziyaansari321@gmail.com...');

        // Map all common template parameter names so the form works with any template layout
        const templateParams = {
          name: name,
          from_name: name,
          user_name: name,
          email: email,
          from_email: email,
          user_email: email,
          reply_to: email,
          subject: subject,
          title: subject,
          user_subject: subject,
          message: message,
          user_message: message,
          message_text: message,
          to_name: 'Shimaziya Ansari',
          to_email: EMAILJS_CONFIG.recipientEmail
        };

        const response = await emailClient.send(
          EMAILJS_CONFIG.serviceId,
          EMAILJS_CONFIG.templateId,
          templateParams,
          {
            publicKey: EMAILJS_CONFIG.publicKey
          }
        );

        console.log('EmailJS Success Response:', response);
        showStatus('success', 'Thank you! Your message has been sent successfully to Shimaziya.');
        contactForm.reset();
      } catch (error) {
        console.error('EmailJS Error Details:', error);
        const errorText = typeof error === 'string'
          ? error
          : (error && (error.text || error.message))
            ? (error.text || error.message)
            : 'Failed to send message';
        const mailtoFallback = `mailto:${EMAILJS_CONFIG.recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Hi Shimaziya,\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)}`;

        showStatus(
          'error',
          `EmailJS Error (${errorText}). Please check that Service ID "${EMAILJS_CONFIG.serviceId}" is active in your EmailJS dashboard.`,
          `<a href="${mailtoFallback}" class="btn btn-sm btn-primary" target="_blank"><i class="fa-solid fa-envelope"></i> Send via Email App</a>`
        );
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Send Message';
        if (btnIcon) btnIcon.className = 'fa-solid fa-paper-plane';
      }
    });
  }
});

