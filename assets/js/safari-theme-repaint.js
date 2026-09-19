(() => {
  const canvas = document.getElementById("background-canvas");
  if (!canvas) return;

  const observer = new MutationObserver(() => {
    // Force Safari/WebKit to invalidate the fixed background layer.
    canvas.style.opacity = "0.9999";

    requestAnimationFrame(() => {
      canvas.style.opacity = "";
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
})();