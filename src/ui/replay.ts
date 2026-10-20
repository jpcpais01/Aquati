/**
 * Plays a class's CSS animation again. The usual trick (remove the class, read
 * `offsetWidth`, add it back) forces the browser to lay out the whole page
 * there and then, mid-frame: a sinking bumps the gold, kills and infamy chips
 * at once, and those reflows cost tens of milliseconds right as she went down.
 * Here the class comes off now and goes back on two frames later, after the
 * browser's own style pass has seen it gone; a class not on yet just goes on.
 */
export function replay(el: Element, cls: string) {
  if (!el.classList.contains(cls)) {
    el.classList.add(cls);
    return;
  }
  el.classList.remove(cls);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(cls)));
}
