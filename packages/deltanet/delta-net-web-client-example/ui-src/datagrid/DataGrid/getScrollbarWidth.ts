let memoizedWidth: number | undefined = undefined;

export function getScrollbarWidth() {
  if (memoizedWidth !== undefined) {
    return memoizedWidth;
  }
  const div = document.createElement("div");
  div.style.width = "100px";
  div.style.visibility = "hidden";
  document.body.appendChild(div);

  const widthWithoutScroll = div.offsetWidth;
  div.style.overflow = "scroll";

  const inner = document.createElement("div");
  inner.style.width = "100%";
  div.appendChild(inner);

  const widthWithScroll = inner.offsetWidth;
  document.body.removeChild(div);
  memoizedWidth = widthWithoutScroll - widthWithScroll;
  return memoizedWidth;
}
