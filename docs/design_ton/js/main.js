/**
 * MAKEATON 9.0 - Main Script
 * Lightweight script for subtle 3D tilt and marquee initialization
 */

document.addEventListener('DOMContentLoaded', () => {
  initCenterTitleTilt();
  initMarqueeTracks();
});

/**
 * Subtle 3D Tilt on Pointer Movement for the Center Title
 */
function initCenterTitleTilt() {
  const stage = document.getElementById('viewportStage');
  const titleImg = document.getElementById('centerTitleImg');

  if (!stage || !titleImg) return;

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let isHovering = false;
  let rafId = null;

  function onPointerMove(e) {
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    mouseX = (e.clientX - centerX) / (rect.width / 2);
    mouseY = (e.clientY - centerY) / (rect.height / 2);

    mouseX = Math.max(-1, Math.min(1, mouseX));
    mouseY = Math.max(-1, Math.min(1, mouseY));

    if (!isHovering) {
      isHovering = true;
      startLoop();
    }
  }

  function onPointerLeave() {
    mouseX = 0;
    mouseY = 0;
  }

  function startLoop() {
    function animate() {
      currentX += (mouseX - currentX) * 0.08;
      currentY += (mouseY - currentY) * 0.08;

      const rotateX = -currentY * 7;
      const rotateY = currentX * 9;

      titleImg.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;

      if (Math.abs(mouseX - currentX) > 0.001 || Math.abs(mouseY - currentY) > 0.001) {
        rafId = requestAnimationFrame(animate);
      } else {
        isHovering = false;
      }
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(animate);
  }

  stage.addEventListener('pointermove', onPointerMove, { passive: true });
  stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
}

/**
 * Ensure Marquee tracks are seamlessly populated
 */
function initMarqueeTracks() {
  const tracks = document.querySelectorAll('.marquee-track');
  tracks.forEach(track => {
    // If track doesn't have enough clones, duplicate for 100% gapless continuous marquee
    if (track.children.length < 8) {
      const content = track.innerHTML;
      track.innerHTML = content + content;
    }
  });
}
