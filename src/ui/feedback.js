const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function highlight(element) {
  if (reducedMotion.matches) return;
  element.animate([
    { opacity: 0.55 },
    { opacity: 1 },
  ], { duration: 220, easing: 'ease-out' });
}
