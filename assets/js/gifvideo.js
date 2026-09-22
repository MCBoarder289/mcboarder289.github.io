(() => {
  "use strict";

  const SELECTOR = "[data-gifvideo]";

  const initGifVideo = (root) => {
    if (root.dataset.gifvideoInitialized === "true") {
      return;
    }

    root.dataset.gifvideoInitialized = "true";

    const trigger = root.querySelector("[data-gifvideo-trigger]");
    const inlineVideo = root.querySelector("[data-gifvideo-inline]");
    const overlay = root.querySelector("[data-gifvideo-overlay]");
    const dialog = root.querySelector("[data-gifvideo-dialog]");
    const lightboxVideo = root.querySelector("[data-gifvideo-lightbox]");
    const closeButton = root.querySelector("[data-gifvideo-close]");

    if (
      !trigger ||
      !inlineVideo ||
      !overlay ||
      !dialog ||
      !lightboxVideo ||
      !closeButton
    ) {
      return;
    }

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    let previousBodyOverflow = "";
    let lastFocusedElement = null;
    let intersectionObserver = null;

    const playInline = () => {
      if (reducedMotionQuery.matches) {
        return;
      }

      const promise = inlineVideo.play();

      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          // Autoplay can still be blocked by browser/device policy.
        });
      }
    };

    const pauseInline = () => {
      inlineVideo.pause();
    };

    /*
     * Pause videos that are outside the viewport.
     * This avoids continuously decoding videos while the reader
     * is looking at another part of the article.
     */
    if ("IntersectionObserver" in window) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              playInline();
            } else {
              pauseInline();
            }
          });
        },
        {
          threshold: 0.15,
        }
      );

      intersectionObserver.observe(root);
    } else {
      playInline();
    }

    const openLightbox = () => {
      lastFocusedElement = document.activeElement;

      /*
       * Start the expanded video at approximately the same point
       * as the inline video.
       */
      try {
        lightboxVideo.currentTime = inlineVideo.currentTime || 0;
      } catch (_) {
        // Metadata may not have loaded yet.
      }

      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");

      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const promise = lightboxVideo.play();

      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {});
      }

      closeButton.focus();
    };

    const closeLightbox = () => {
      if (overlay.hidden) {
        return;
      }

      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");

      lightboxVideo.pause();

      try {
        lightboxVideo.currentTime = 0;
      } catch (_) {
        // Ignore if metadata has not loaded.
      }

      document.body.style.overflow = previousBodyOverflow;

      if (
        lastFocusedElement &&
        typeof lastFocusedElement.focus === "function"
      ) {
        lastFocusedElement.focus();
      }

      lastFocusedElement = null;
    };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openLightbox();
    });

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
    });

    /*
     * Clicking the dark backdrop closes the lightbox.
     * Clicking the video itself does not.
     */
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeLightbox();
      }
    });

    dialog.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
    });

    /*
     * Respect changes to the user's reduced-motion preference.
     */
    const handleReducedMotionChange = (event) => {
      if (event.matches) {
        pauseInline();
      } else if (overlay.hidden) {
        playInline();
      }
    };

    if (typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener(
        "change",
        handleReducedMotionChange
      );
    } else if (typeof reducedMotionQuery.addListener === "function") {
      reducedMotionQuery.addListener(handleReducedMotionChange);
    }

    /*
     * Stop video playback when the browser tab/app is hidden.
     */
    const handleVisibilityChange = () => {
      if (document.hidden) {
        inlineVideo.pause();
        lightboxVideo.pause();
      } else if (overlay.hidden) {
        playInline();
      } else {
        const promise = lightboxVideo.play();

        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {});
        }
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    inlineVideo.addEventListener("error", () => {
      inlineVideo.setAttribute("data-gifvideo-error", "true");
    });
  };

  const initAll = () => {
    document.querySelectorAll(SELECTOR).forEach(initGifVideo);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll, {
      once: true,
    });
  } else {
    initAll();
  }
})();